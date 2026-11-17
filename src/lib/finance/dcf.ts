import { projectedCapexRate } from "./capex";
import type {
  Assumptions,
  DcfResult,
  FinancialDataset,
  ForecastYear,
  SlowdownPeriod,
  ValuationScenario,
} from "./types";

export function fcff(
  ebit: number,
  taxRate: number,
  depreciation: number,
  capex: number,
  changeInNwc: number,
): number {
  // Signed cash taxes follow the specified EBIT × (1 − tax rate) convention.
  return ebit * (1 - taxRate) + depreciation - capex - changeInNwc;
}
export function discount(
  cashFlow: number,
  rate: number,
  period: number,
): number {
  if (
    !Number.isFinite(rate) ||
    rate <= -1 ||
    !Number.isFinite(period) ||
    period < 0
  )
    throw new Error(
      "Discount rate must exceed −100% and period must be nonnegative.",
    );
  return cashFlow / (1 + rate) ** period;
}
export function terminalValue(
  nextYearFcff: number,
  wacc: number,
  growth: number,
): number {
  if (
    ![nextYearFcff, wacc, growth].every(Number.isFinite) ||
    wacc <= growth ||
    wacc <= 0 ||
    growth <= -1
  )
    throw new Error("WACC must be positive and greater than terminal growth.");
  return nextYearFcff / (wacc - growth);
}
export function enterpriseToEquity(
  ev: number,
  cash: number,
  debt: number,
  claims: number,
): number {
  return ev + cash - debt - claims;
}
export function perShare(equity: number, shares: number): number {
  if (!Number.isFinite(shares) || shares <= 0)
    throw new Error("Diluted shares must be greater than zero.");
  return equity / shares;
}
export function entryPrice(value: number, safety: number): number {
  if (!Number.isFinite(safety) || safety < 0 || safety > 1)
    throw new Error("Margin of safety must be between 0% and 100%.");
  return value * (1 - safety);
}
export function applySlowdown(
  a: Assumptions,
  reduction: number,
  period: SlowdownPeriod,
): Assumptions {
  if (!Number.isFinite(reduction) || reduction < 0 || reduction > 1)
    throw new Error("Growth slowdown must be between 0% and 100%.");
  return {
    ...a,
    ...(a.annualGrowth
      ? {
          annualGrowth: a.annualGrowth.map(
            (g, i) =>
              g *
              (period === "all" ||
              (period === "early" && i < 3) ||
              (period === "middle" && i >= 3 && i < 5) ||
              (period === "late" && i >= 5)
                ? 1 - reduction
                : 1),
          ),
        }
      : {}),
    growthEarly:
      a.growthEarly *
      (period === "early" || period === "all" ? 1 - reduction : 1),
    growthMiddle:
      a.growthMiddle *
      (period === "middle" || period === "all" ? 1 - reduction : 1),
    growthLate:
      a.growthLate *
      (period === "late" || period === "all" ? 1 - reduction : 1),
  };
}
export function updateScenario(
  scenarios: ValuationScenario[],
  id: string,
  key: Exclude<keyof Assumptions, "annualGrowth">,
  value: number,
): ValuationScenario[] {
  return scenarios.map((s) =>
    s.id === id ? { ...s, assumptions: { ...s.assumptions, [key]: value } } : s,
  );
}
export function validateAssumptions(a: Assumptions): void {
  if (
    !Object.entries(a)
      .filter(([key]) => key !== "annualGrowth")
      .every(([, v]) => Number.isFinite(v))
  )
    throw new Error("All assumptions must be finite numbers.");
  if (
    a.annualGrowth &&
    (a.annualGrowth.length !== 10 ||
      a.annualGrowth.some((g) => !Number.isFinite(g) || g <= -1))
  )
    throw new Error(
      "Annual growth requires ten finite rates greater than −100%.",
    );
  if(a.capexNearRate !== undefined && (a.capexNearRate<0 || a.capexNearRate>1))
    throw new Error("Near-term CapEx ratio must be between 0% and 100%.");
  terminalValue(0, a.wacc, a.terminalGrowth);
  perShare(0, a.shares);
  entryPrice(0, a.marginOfSafety);
  if ([a.growthEarly, a.growthMiddle, a.growthLate].some((g) => g <= -1))
    throw new Error("Revenue growth must exceed −100%.");
  if ([a.taxRate, a.daRate, a.capexRate, a.nwcRate].some((r) => r < 0 || r > 1))
    throw new Error("Tax and investment ratios must be between 0% and 100%.");
  if ([a.initialMargin, a.targetMargin].some((m) => m < -1 || m > 1))
    throw new Error("Operating margins must be between −100% and 100%.");
}
export function calculateDcf(
  data: FinancialDataset,
  a: Assumptions,
): DcfResult {
  validateAssumptions(a);
  const latest = data.incomeStatements.at(-1),
    balance = data.balanceSheets.at(-1);
  if (!latest || !balance || latest.revenue <= 0)
    throw new Error(
      "A positive source revenue and a balance sheet are required.",
    );
  const fiscal = data.fiscalForecast;
  if (
    fiscal &&
    (fiscal.yearEnds.length !== 10 ||
      fiscal.yearEnds.some(
        (end, i) =>
          !Number.isFinite(Date.parse(end)) ||
          end <= fiscal.valuationEnd ||
          (i > 0 && end <= fiscal.yearEnds[i - 1]),
      ))
  )
    throw new Error("Invalid fiscal projection dates.");
  let revenue = latest.revenue;
  const makeYear = (
    period: number,
    growth: number,
    margin: number,
  ): ForecastYear => {
    const previousRevenue = revenue;
    revenue *= 1 + growth;
    const ebit = revenue * margin,
      cashTaxes = ebit * a.taxRate;
    const depreciation = revenue * a.daRate,
      changeInNwc = (revenue - previousRevenue) * a.nwcRate;
    if (data.salesToCapital !== undefined && (!Number.isFinite(data.salesToCapital) || data.salesToCapital <= 0))
      throw new Error("Sales-to-capital must be positive and finite.");
    const required = data.salesToCapital ? Math.max(0, revenue - previousRevenue) / data.salesToCapital : null;
    // A floor on TOTAL reinvestment, not an additional charge on top of CapEx/NWC.
    const plannedCapex = revenue * projectedCapexRate(a.capexRate, a.capexNearRate, period);
    // An annual forecast cannot spend less than reported YTD. Only the new profile
    // applies this explicit floor; legacy flat-rate inputs retain their validation.
    const reportedFloor = a.capexNearRate !== undefined && period === 1 ? fiscal?.elapsedActuals?.capex ?? 0 : 0;
    const capex = Math.max(plannedCapex, reportedFloor,
      required === null ? plannedCapex : depreciation + required - changeInNwc);
    if (
      period === 1 &&
      fiscal?.elapsedActuals &&
      (revenue < fiscal.elapsedActuals.revenue ||
        depreciation < fiscal.elapsedActuals.depreciation ||
        capex < fiscal.elapsedActuals.capex)
    )
      throw new Error(
        "Full-fiscal-year revenue, D&A or CapEx is below the amount already reported YTD. Review the revenue profile and reinvestment assumptions.",
      );
    const cashFlow = fcff(ebit, a.taxRate, depreciation, capex, changeInNwc);
    const fiscalEnd = fiscal?.yearEnds[period - 1],
      discountPeriod = fiscal
        ? (Date.parse(fiscalEnd ?? fiscal.yearEnds[9]) -
            Date.parse(fiscal.valuationEnd)) /
            86400000 /
            365.25 +
          (period === 11 ? 1 : 0)
        : period;
    const elapsedFcff =
      period === 1 && fiscal?.elapsedActuals
        ? fcff(
            fiscal.elapsedActuals.ebit,
            a.taxRate,
            fiscal.elapsedActuals.depreciation,
            fiscal.elapsedActuals.capex,
            fiscal.elapsedActuals.changeInNwc,
          )
        : 0;
    const remainingFcff = cashFlow - elapsedFcff;
    return {
      ...(fiscal
        ? { fiscalEnd, discountPeriod, elapsedFcff, remainingFcff }
        : {}),
      year: fiscalEnd ? Number(fiscalEnd.slice(0, 4)) : latest.year + period,
      period,
      growth,
      revenue,
      margin,
      ebit,
      cashTaxes,
      nopat: ebit - cashTaxes,
      depreciation,
      capex,
      changeInNwc,
      fcff: cashFlow,
      discountFactor: 1 / (1 + a.wacc) ** discountPeriod,
      presentValue: discount(remainingFcff, a.wacc, discountPeriod),
    };
  };
  const forecast = Array.from({ length: 10 }, (_, i) =>
    makeYear(
      i + 1,
      a.annualGrowth?.[i] ??
        (i < 3 ? a.growthEarly : i < 5 ? a.growthMiddle : a.growthLate),
      a.initialMargin + ((a.targetMargin - a.initialMargin) * i) / 9,
    ),
  );
  const terminalYear = makeYear(11, a.terminalGrowth, a.targetMargin);
  const tv = terminalValue(terminalYear.fcff, a.wacc, a.terminalGrowth),
    pvTerminalValue = discount(tv, a.wacc, forecast[9].discountPeriod ?? 10);
  const pvForecast = forecast.reduce((sum, row) => sum + row.presentValue, 0),
    enterpriseValue = pvForecast + pvTerminalValue;
  const equityValue = enterpriseToEquity(
      enterpriseValue,
      balance.excessCash,
      balance.debt,
      balance.otherClaims,
    ),
    valuePerShare = perShare(equityValue, a.shares);
  const result = {
    forecast,
    terminalYear,
    terminalValue: tv,
    pvTerminalValue,
    pvForecast,
    enterpriseValue,
    equityValue,
    valuePerShare,
    entryPrice: entryPrice(valuePerShare, a.marginOfSafety),
    upside:
      data.market.price > 0 ? valuePerShare / data.market.price - 1 : null,
    discountToFairValue:
      data.market.price > 0 && valuePerShare > 0
        ? 1 - data.market.price / valuePerShare
        : null,
    terminalWeight:
      enterpriseValue !== 0 ? pvTerminalValue / enterpriseValue : null,
    excessCash: balance.excessCash,
    debt: balance.debt,
    otherClaims: balance.otherClaims,
  };
  if (
    [
      ...forecast.flatMap(Object.values),
      ...Object.values(terminalYear),
      tv,
      pvTerminalValue,
      pvForecast,
      enterpriseValue,
      equityValue,
      valuePerShare,
      result.entryPrice,
    ].some((n) => typeof n === "number" && !Number.isFinite(n))
  )
    throw new Error(
      "These assumptions exceed the numerical range of the model.",
    );
  return result;
}
