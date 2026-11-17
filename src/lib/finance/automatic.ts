import { assumptionErrors } from "./validation";
import { capexProfile } from "./capex";
import type {
  VerifiedFinancials,
  MetricKey,
  FinancialPeriod,
} from "../sec/types";
import type { Assumptions, FinancialDataset, ValuationScenario } from "./types";
import { calculateDcf } from "./dcf";
import {
  initializeInputs,
  initializationIssues,
  toDcfDataset,
  type ModelInputs,
} from "../data/research";
import {
  calculateWacc,
  type WaccInputs,
  type WaccResult,
  type RiskFreeObservation,
} from "./wacc";
export interface BaselineOverrides {
  financial?: Partial<ModelInputs>;
  wacc?: Partial<WaccInputs>;
  directWacc?: number | null;
  assumptions?: Partial<Assumptions>;
}
export interface AutomaticBaseline {
  status: "Estimated" | "Provisional" | "Incomplete";
  inputs: ModelInputs;
  assumptions: Assumptions;
  scenarios: ValuationScenario[];
  dataset: FinancialDataset | null;
  waccInputs: WaccInputs;
  waccResult: WaccResult | null;
  issues: string[];
  scenarioIssues: Record<string,string>;
  warnings: string[];
  evidence: {
    label: string;
    value: number | null;
    kind: "reported" | "calculated" | "estimated";
    reason: string;
  }[];
}
const median = (v: number[]) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length
    ? s.length % 2
      ? s[(s.length - 1) / 2]
      : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
    : null;
};
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
const metric = (p: FinancialPeriod | undefined, key: MetricKey) =>
  p?.metrics[key]?.value ?? null;
const ratio = (p: FinancialPeriod, key: MetricKey) => {
  const r = metric(p, "revenue"),
    v = metric(p, key);
  return r && v !== null ? v / r : null;
};
export function revenueCagr(
  data: VerifiedFinancials,
  years: number,
): number | null {
  const last = data.annual.at(-1),
    first = data.annual.at(-1 - years);
  if (!last || !first) return null;
  const a = metric(first, "revenue"),
    b = metric(last, "revenue");
  const elapsed =
    (Date.parse(last.end) - Date.parse(first.end)) / 86400000 / 365.25;
  return a && b && a > 0 && b > 0 && Math.abs(elapsed - years) < 0.1
    ? (b / a) ** (1 / years) - 1
    : null;
}
export function buildAutomaticBaseline(
  data: VerifiedFinancials,
  riskFree: RiskFreeObservation | null,
  overrides: BaselineOverrides = {},
  price: number | null = null,
  verifiedQuotePrice: number | null = null,
): AutomaticBaseline {
  const annual = data.annual,
    p = data.ttm ?? annual.at(-1),
    recent = annual.slice(-5),
    balance = data.latestBalance.metrics;
  const evidence: AutomaticBaseline["evidence"] = [],
    warnings: string[] = [],
    issues: string[] = [];
  const note = (
    label: string,
    value: number | null,
    kind: AutomaticBaseline["evidence"][number]["kind"],
    reason: string,
  ) =>
    evidence.push({
      label,
      value: value !== null && Number.isFinite(value) ? value : null,
      kind,
      reason,
    });
  const values = (key: MetricKey, count = 3) =>
    annual
      .slice(-count)
      .map((a) => ratio(a, key))
      .filter((v): v is number => v !== null);
  const c3 = revenueCagr(data, 3),
    c5 = revenueCagr(data, 5),
    c10 = revenueCagr(data, 10);
  for (const [n, g] of [
    [3, c3],
    [5, c5],
    [10, c10],
  ] as const)
    note(
      `${n}-year revenue CAGR`,
      g,
      "calculated",
      g === null
        ? `Requires ${n + 1} comparable annual revenue observations.`
        : "Computed from same-currency annual revenue; no industry or guidance assumption.",
    );
  const yoy = annual.slice(1).flatMap((a, i) => {
    const previous = annual[i];
    const r = metric(a, "revenue"),
      prev = metric(previous, "revenue"),
      gap = (Date.parse(a.end) - Date.parse(previous.end)) / 86400000;
    return r !== null && prev && gap >= 350 && gap <= 380 ? [r / prev - 1] : [];
  });
  const ytd = metric(data.interim ?? undefined, "revenue"),
    ttm = metric(data.ttm ?? undefined, "revenue"),
    last = metric(annual.at(-1), "revenue");
  const priorYtd =
    last !== null && ytd !== null && ttm !== null ? last + ytd - ttm : null;
  const recentGrowth =
    ytd !== null && priorYtd && priorYtd > 0
      ? ytd / priorYtd - 1
      : (yoy.at(-1) ?? null);
  note(
    "Recent comparable revenue growth",
    recentGrowth,
    "calculated",
    "Matched interim YTD growth where reconciled, otherwise the latest comparable annual growth.",
  );
  const growths = [c3, c5, c10, recentGrowth, median(yoy.slice(-3))].filter(
      (v): v is number => v !== null,
    ),
    center = median(growths);
  const consistency = yoy.length
    ? Math.sqrt(
        yoy
          .slice(-5)
          .reduce(
            (sum, v) => sum + (v - (median(yoy.slice(-5)) ?? 0)) ** 2,
            0,
          ) / Math.min(yoy.length, 5),
      )
    : 0;
  const growth =
    center === null
      ? NaN
      : clamp(
          center * (center > 0 ? 0.8 : 1) * clamp(1 - consistency, 0.5, 1),
          -0.15,
          0.2,
        );
  if (center === null)
    issues.push(
      "Comparable growth history is unavailable; enter a growth forecast.",
    );
  note(
    "Early growth estimate",
    Number.isFinite(growth) ? growth : null,
    "estimated",
    "Median of available CAGRs, recent growth and 3-year growth median, with a 20% haircut on positive growth, variability adjustment, and −15%/+20% bounds. Later periods fade toward maturity.",
  );
  const rev = metric(p, "revenue"),
    ebit = metric(p, "operatingIncome"),
    startMargin = rev && ebit !== null ? ebit / rev : NaN;
  const margins = recent
      .map((a) => ratio(a, "operatingIncome"))
      .filter((v): v is number => v !== null),
    normalMargin = median(margins);
  const target =
    normalMargin === null
      ? startMargin
      : 0.7 * normalMargin + 0.3 * startMargin;
  const historicalDa = median(values("depreciation")),
    daPeriod = data.ttm?.metrics.depreciation.value != null ? data.ttm : data.interim,
    da = historicalDa ?? (daPeriod ? ratio(daPeriod, "depreciation") : null),
    profile = capexProfile(data),
    annualCapex = median(values("capex")),
    capex = profile?.normal ?? annualCapex ?? (p ? ratio(p,"capex") : null) ?? (data.interim ? ratio(data.interim,"capex") : null);
  const taxSamples = recent.flatMap((a) => {
    const tax = metric(a, "taxExpense"),
      pretax = metric(a, "pretaxIncome");
    return tax !== null &&
      pretax &&
      pretax > 0 &&
      tax / pretax >= 0 &&
      tax / pretax <= 0.5
      ? [tax / pretax]
      : [];
  });
  const observedTax = median(taxSamples),
    taxRate = observedTax === null ? 0.25 : clamp(observedTax, 0.15, 0.35);
  note(
    "Normalized tax rate",
    taxRate,
    "estimated",
    observedTax === null
      ? "25% policy estimate: effective-tax evidence unavailable; not a reported cash tax."
      : "Median of up to five positive-pretax annual effective rates, bounded to 15–35%. Accrual effective tax is a cash-tax modeling proxy.",
  );
  if (observedTax === null)
    warnings.push(
      "Cash taxes use an explicit 25% policy estimate; no company effective-tax evidence was available.",
    );
  // A narrow trade-working-capital proxy is derived only when all three components are reported.
  const nwcSamples = annual.slice(1).flatMap((a, i) => {
    const b = annual[i];
    const n = (q: FinancialPeriod) => {
      const ar = metric(q, "receivables"),
        inv = metric(q, "inventory"),
        ap = metric(q, "payables");
      return ar !== null && inv !== null && ap !== null ? ar + inv - ap : null;
    };
    const x = n(a),
      y = n(b),
      r = metric(a, "revenue"),
      prev = metric(b, "revenue");
    const span = (Date.parse(a.end) - Date.parse(b.end)) / 86400000;
    return x !== null &&
      y !== null &&
      r !== null &&
      prev !== null &&
      r > prev &&
      span >= 350 &&
      span <= 380
      ? [(x - y) / (r - prev)]
      : [];
  });
  const balanceNwc = annual.slice(-3).flatMap(a=>{
    const ar=metric(a,"receivables"), inv=metric(a,"inventory"), ap=metric(a,"payables"), r=metric(a,"revenue");
    if(ar===null || inv===null || ap===null || r===null || r<=0) return [];
    const ratio=(ar+inv-ap)/r;
    return ratio>=0 && ratio<=.5 ? [ratio] : [];
  });
  const flowNwc = median(nwcSamples.slice(-3)),
    observedNwc = flowNwc ?? (balanceNwc.length>=2 ? median(balanceNwc) : null),
    nwcRate = observedNwc === null ? NaN : clamp(observedNwc, 0, 0.5);
  note(
    "Trade working-capital investment",
    Number.isFinite(nwcRate) ? nwcRate : null,
    "estimated",
    flowNwc === null && observedNwc !== null
      ? "Estimated incremental working-capital intensity from at least two complete nonnegative historical trade-NWC/revenue balances (0–50%). Assumes trade working capital scales with sales; not a reported incremental investment ratio."
      : "Median change in receivables + inventory − trade payables divided by comparable revenue growth; bounded to 0–50% to avoid assuming future working-capital cash releases. Excludes other operating assets/liabilities.",
  );
  if (observedNwc === null)
    issues.push(
      "Trade working-capital coverage is incomplete; enter NWC / incremental revenue.",
    );
  else
    warnings.push(
      "NWC is a partial trade-balance proxy; other operating working-capital components are not modeled.",
    );
  const cash = balance.cash.value,
    investments = balance.shortInvestments.value,
    shareFacts = [
      balance.periodEndShares.value,
      metric(p, "dilutedShares"),
    ].filter((v): v is number => v !== null && v > 0);
  const basis = data.preferredBasis;
  const shares = basis?.shares.value != null
    ? Math.max(basis.shares.value, balance.periodEndShares.value ?? 0)
    : shareFacts.length ? Math.max(...shareFacts) : null;
  note("D&A / revenue", da, "calculated", historicalDa !== null
    ? "Median of available annual D&A/revenue ratios over the last three years."
    : daPeriod ? `Complete ${daPeriod.kind} D&A divided by revenue for ${daPeriod.start} – ${daPeriod.end}; used as a forecast intensity proxy. No missing annual component was invented.`
    : "Complete comparable D&A disclosures unavailable.");
  if (historicalDa === null && da !== null)
    warnings.push("D&A intensity uses the latest complete TTM or interim disclosure because annual D&A coverage is incomplete; interim intensity is not presented as TTM D&A.");
  if (basis) warnings.push(basis.claim.reason ?? "Preferred liquidation-basis proxy.");
  const excessCash =
    cash !== null && rev !== null
      ? Math.max(0, cash + (investments ?? 0) - 0.05 * rev)
      : null;
  note(
    "Estimated excess cash (USD m)",
    excessCash,
    "estimated",
    "Reported cash plus available short-term investments less a policy operating-liquidity reserve of 5% of annual/TTM revenue, floored at zero. Missing investments are excluded conservatively, not reported as zero.",
  );
  note(
    "Diluted share proxy (m)",
    shares,
    "estimated",
    basis ? basis.shares.reason ?? "Nonconverted share basis." : "Maximum of current disclosed common shares and latest annual/TTM diluted weighted-average shares. A conservative proxy, not verified point-in-time fully diluted shares.",
  );
  const pref = basis?.claim.value ?? balance.preferredClaims?.value ?? null,
    nci = balance.minorityClaims?.value ?? null;
  const claims = pref !== null && nci !== null ? pref + nci : null;
  if (
    pref !== null &&
    pref > 0 &&
    (!basis || (overrides.financial?.shares !== undefined) !== (overrides.financial?.otherClaims !== undefined)) &&
    (overrides.financial?.shares === undefined ||
      overrides.financial?.otherClaims === undefined)
  )
    issues.push(
      "Preferred/convertible claims are present. Supply shares and additional claims on a consistent conversion basis to avoid counting both converted shares and the same preferred claim.",
    );
  const inputs: ModelInputs = {
    ...initializeInputs(data),
    automatic: true,
    acknowledged: false,
    rationale:
      "Automatic baseline; reported sources and calculation policies shown below.",
    excessCash,
    debt: balance.debt.value,
    shares,
    otherClaims: claims,
    depreciationRate: da,
    ...overrides.financial,
  };
  note(
    "Financial debt (USD m)",
    inputs.debt,
    overrides.financial?.debt !== undefined
      ? "estimated"
      : balance.debt.status === "derived"
        ? "calculated"
        : "reported",
    "Only a complete normalized debt disclosure is used automatically. Missing borrowing coverage is not assumed zero.",
  );
  note(
    "Additional non-equity claims (USD m)",
    inputs.otherClaims,
    overrides.financial?.otherClaims !== undefined ? "estimated" : "calculated",
    basis ? `${basis.claim.reason} Total noncontrolling interests are added once; redeemable interests included in that total are not added again.` : "Preferred + total noncontrolling claims require both reported components. Missing disclosures do not establish absence; supply a reviewed total.",
  );
  const equity =
    verifiedQuotePrice && inputs.shares
      ? verifiedQuotePrice * inputs.shares
      : (balance.bookEquity?.value ?? null);
  const rf = overrides.wacc?.riskFree ?? riskFree?.rate ?? null;
  const waccInputs: WaccInputs = {
    riskFree: rf,
    beta: 1,
    equityRiskPremium: 0.05,
    costOfDebt: rf !== null ? rf + 0.02 : null,
    equityCapital: equity,
    debt: inputs.debt,
    taxRate,
    ...overrides.wacc,
  };
  let waccResult: WaccResult | null = null,
    wacc = NaN;
  try {
    waccResult = calculateWacc(waccInputs);
    wacc = waccResult.rate;
  } catch (e) {
    if (overrides.directWacc == null)
      issues.push(e instanceof Error ? e.message : "WACC unavailable.");
  }
  if (overrides.directWacc != null) {
    wacc = overrides.directWacc;
    if (!Number.isFinite(wacc) || wacc <= 0 || wacc >= 1)
      issues.push("Direct WACC must be positive and below 100%.");
  }
  warnings.push(
    "Beta 1.0, ERP 5% and a 2% borrowing spread are explicit editable risk-policy estimates, not measured company beta, current ERP or observed borrowing yields.",
  );
  if (!verifiedQuotePrice)
    warnings.push(
      "Capital weights use positive reported book equity as a market-equity proxy; hypothetical reference prices do not change WACC weights.",
    );
  note(
    "Cost of debt estimate",
    waccInputs.costOfDebt,
    "estimated",
    "Risk-free rate + explicit 2% credit-spread policy. Historical interest expense is exposed in source data but is not presented as a current borrowing yield.",
  );
  const interest = median(
    annual.slice(-3).flatMap((a) => {
      const v = metric(a, "interestExpense"),
        d = metric(a, "debt");
      return v !== null && d && d > 0 ? [v / d] : [];
    }),
  );
  note(
    "Historical interest / debt",
    interest,
    "calculated",
    "Historical accounting proxy only; debt scope and average balances can differ from current borrowing costs.",
  );
  const assumptions: Assumptions = {
    growthEarly: growth,
    growthMiddle: growth * 0.6,
    growthLate: growth * 0.25,
    initialMargin: startMargin,
    targetMargin: target,
    taxRate,
    daRate: inputs.depreciationRate ?? NaN,
    ...(profile ? { capexNearRate: profile.near } : {}),
    capexRate:
      capex === null ? NaN : Math.max(capex, inputs.depreciationRate ?? 0),
    nwcRate,
    wacc,
    terminalGrowth: Number.isFinite(wacc)
      ? Math.min(0.02, Math.max(0, growth * 0.25), Math.max(0, wacc - 0.03))
      : 0.02,
    marginOfSafety: 0.25,
    shares: inputs.shares ?? NaN,
    ...overrides.assumptions,
  };
  if (overrides.assumptions?.growthEarly !== undefined) {
    const i = issues.indexOf(
      "Comparable growth history is unavailable; enter a growth forecast.",
    );
    if (i >= 0) issues.splice(i, 1);
  }
  if (overrides.assumptions?.nwcRate !== undefined) {
    const i = issues.indexOf(
      "Trade working-capital coverage is incomplete; enter NWC / incremental revenue.",
    );
    if (i >= 0) issues.splice(i, 1);
  }
  const marginSpread = Math.max(
      0.02,
      (Math.max(...margins) - Math.min(...margins)) * 0.25 || 0.02,
    ),
    growthSpread = Math.max(0.02, Math.abs(assumptions.growthEarly) * 0.25);
  const scenarios: ValuationScenario[] = [
    {
      id: "bear",
      label: "Bear",
      assumptions: {
        ...assumptions,
        growthEarly: assumptions.growthEarly - growthSpread,
        growthMiddle: assumptions.growthMiddle - growthSpread * 0.6,
        growthLate: assumptions.growthLate - growthSpread * 0.25,
        targetMargin: assumptions.targetMargin - Math.min(marginSpread, Math.max(0, assumptions.targetMargin+1)),
        capexRate: assumptions.capexRate + Math.min(.01, Math.max(0,1-assumptions.capexRate)),
        wacc: assumptions.wacc + 0.015,
      },
    },
    { id: "base", label: "Base", assumptions: { ...assumptions } },
    {
      id: "bull",
      label: "Bull",
      assumptions: {
        ...assumptions,
        growthEarly: Math.min(0.25, assumptions.growthEarly + growthSpread),
        growthMiddle: assumptions.growthMiddle + growthSpread * 0.6,
        growthLate: assumptions.growthLate + growthSpread * 0.25,
        targetMargin: assumptions.targetMargin + Math.min(marginSpread, Math.max(0,1-assumptions.targetMargin)),
        capexRate: assumptions.capexRate + Math.min(assumptions.capexRate*growthSpread, Math.max(0,1-assumptions.capexRate)),
        wacc: Math.max(
          assumptions.terminalGrowth + 0.015,
          assumptions.wacc - 0.005,
        ),
      },
    },
  ];
  const dataset = toDcfDataset(data, inputs, price);
  if(!dataset) {
    const missing=initializationIssues(data,inputs);
    issues.push(...missing);
    if(!missing.length && !issues.length) issues.push("Underlying statement periods or eligibility require review.");
  }
  const scenarioIssues: Record<string,string> = {};
  if(dataset) for(const scenario of scenarios) {
    const invalid=Object.values(assumptionErrors(scenario.assumptions));
    if(invalid.length) { scenarioIssues[scenario.id]=invalid.join(" "); continue; }
    try { calculateDcf(dataset,scenario.assumptions); }
    catch(e) { scenarioIssues[scenario.id]=e instanceof Error?e.message:"Calculation could not complete."; }
  }
  note(
    "Normalized operating margin",
    assumptions.targetMargin,
    "estimated",
    "70% five-year median operating margin + 30% current annual/TTM margin. Bear/bull vary growth, margin, reinvestment and discount inputs through the full DCF.",
  );
  note(
    "Capital expenditure intensity",
    assumptions.capexRate,
    "estimated",
    profile?.reason ?? (annualCapex === null ? "CapEx intensity uses a complete current performance or interim CapEx/revenue ratio because annual history is unavailable. This is a forecast proxy, subject to interim seasonality, with a floor at modeled D&A." : "Three-year median CapEx/revenue with a floor at modeled D&A intensity; insufficient comparable disclosures for a separate near-term normalization profile."),
  );
  warnings.push(
    "Debt/claim adjustments and shares must use the same conversion basis; review convertible debt before treating a weighted-average diluted-share proxy as current dilution. SBC remains an operating expense: it is not added back to FCFF, and a second dilution/SBC deduction is not imposed. Share count stays constant after the disclosed starting proxy.",
  );
  warnings.push(profile?.reason ?? "Separate near-term CapEx normalization unavailable; existing flat investment method retained. Review current spending before using annual forecasts.");
  const materialEstimate =
    warnings.length > 0 ||
    Object.keys(overrides.financial ?? {}).length > 0 ||
    overrides.directWacc != null;
  return {
    status: issues.length || Object.keys(scenarioIssues).length
      ? "Incomplete"
      : materialEstimate
        ? "Provisional"
        : "Estimated",
    scenarioIssues,
    inputs,
    assumptions,
    scenarios,
    dataset: issues.length ? null : dataset,
    waccInputs,
    waccResult,
    issues: [...new Set(issues)],
    warnings,
    evidence,
  };
}
