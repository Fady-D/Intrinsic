import {
  parseTreasuryYield,
  type RiskFreeObservation,
} from "@/lib/finance/wacc";
export const runtime = "nodejs";
let cached: { at: number; value: RiskFreeObservation } | null = null;
let pending: Promise<RiskFreeObservation> | null = null;
async function retrieve(): Promise<RiskFreeObservation> {
  try {
    const year = new Date().getUTCFullYear(),
      url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Unavailable");
    return parseTreasuryYield(await response.text());
  } catch {
    return {
      rate: null,
      asOf: null,
      source: "US Treasury 10-year par yield",
      warning:
        "Treasury feed unavailable. Enter a risk-free assumption or direct WACC; no substitute market rate was used.",
    };
  }
}
export async function GET() {
  if (cached && Date.now() - cached.at < 3600000)
    return Response.json(cached.value);
  pending ??= retrieve();
  try {
    const value = await pending;
    cached = { at: Date.now(), value };
    return Response.json(value);
  } finally {
    pending = null;
  }
}
