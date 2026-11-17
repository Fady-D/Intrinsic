export interface WaccInputs {
  riskFree: number | null;
  beta: number | null;
  equityRiskPremium: number | null;
  costOfDebt: number | null;
  equityCapital: number | null;
  debt: number | null;
  taxRate: number | null;
}
export interface WaccResult {
  costOfEquity: number;
  afterTaxCostOfDebt: number;
  equityWeight: number;
  debtWeight: number;
  rate: number;
}
export function calculateWacc(a: WaccInputs): WaccResult {
  if (Object.values(a).some((v) => v === null || !Number.isFinite(v)))
    throw new Error(
      "WACC requires risk-free rate, beta, ERP, debt cost, capital weights and tax rate, or a direct WACC override.",
    );
  const {
    riskFree: rf,
    beta: b,
    equityRiskPremium: erp,
    costOfDebt: kd,
    equityCapital: e,
    debt: d,
    taxRate: t,
  } = a as Record<keyof WaccInputs, number>;
  if (rf < 0 || b < 0 || erp < 0 || kd < 0 || e <= 0 || d < 0 || t < 0 || t > 1)
    throw new Error(
      "Invalid WACC components: equity must be positive, rates/beta/debt nonnegative, and tax between 0% and 100%.",
    );
  const costOfEquity = rf + b * erp,
    equityWeight = e / (e + d),
    debtWeight = d / (e + d),
    afterTaxCostOfDebt = kd * (1 - t),
    rate = equityWeight * costOfEquity + debtWeight * afterTaxCostOfDebt;
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1)
    throw new Error("Calculated WACC must be positive and below 100%.");
  return { costOfEquity, afterTaxCostOfDebt, equityWeight, debtWeight, rate };
}
export interface RiskFreeObservation {
  rate: number | null;
  asOf: string | null;
  source: string;
  warning: string | null;
}
export function parseTreasuryYield(
  xml: string,
  now = new Date(),
): RiskFreeObservation {
  const observations = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)]
    .flatMap((m) => {
      const date = m[1]
          .match(/<(?:\w+:)?NEW_DATE[^>]*>([^<]+)/)?.[1]
          ?.slice(0, 10),
        value = m[1].match(/<(?:\w+:)?BC_10YEAR[^>]*>([^<]+)/)?.[1];
      return date &&
        value &&
        value.trim() !== "" &&
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        Number.isFinite(Date.parse(date)) &&
        new Date(date).toISOString().slice(0, 10) === date &&
        Number.isFinite(Number(value)) &&
        Number(value) >= 0 &&
        date <= now.toISOString().slice(0, 10)
        ? [{ date, rate: Number(value) / 100 }]
        : [];
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = observations[0],
    source = "US Treasury daily par yield curve · 10-year maturity";
  if (!latest || now.getTime() - Date.parse(latest.date) > 14 * 86400000)
    return {
      rate: null,
      asOf: latest?.date ?? null,
      source,
      warning:
        "A recent Treasury 10-year yield is unavailable. Enter a risk-free assumption or a direct WACC; no current rate was invented.",
    };
  return { rate: latest.rate, asOf: latest.date, source, warning: null };
}
