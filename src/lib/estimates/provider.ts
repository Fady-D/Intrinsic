import { CachedHttpClient } from "../server/http";
import type { EstimateResponse, RevenueEstimate } from "./types";
export interface AnalystEstimateProvider {
  getAnnualEstimates(
    symbol: string,
    anchorEnd: string,
    currency: string,
    cik?: string,
  ): Promise<EstimateResponse>;
}
const validDate = (s: unknown): s is string =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;
export function parseFmpEstimates(
  raw: unknown,
  symbol: string,
  currency: string,
  retrievedAt: string,
): { estimates: RevenueEstimate[]; warnings: string[] } {
  if (!Array.isArray(raw))
    throw new Error(
      "Invalid analyst-estimate response or subscription restriction.",
    );
  const warnings: string[] = [],
    estimates: RevenueEstimate[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    if (r.symbol !== symbol || !validDate(r.date) || !positive(r.revenueAvg)) {
      warnings.push(
        "An estimate with missing identity, fiscal date or positive revenue was excluded.",
      );
      continue;
    }
    if (
      (r.reportedCurrency !== undefined && r.reportedCurrency !== currency) ||
      (r.currency !== undefined && r.currency !== currency)
    ) {
      warnings.push(`Currency mismatch for ${r.date}; estimate excluded.`);
      continue;
    }
    const updated =
      typeof r.updatedAt === "string"
        ? r.updatedAt
        : typeof r.lastUpdated === "string"
          ? r.lastUpdated
          : null;
    if (
      updated &&
      (!Number.isFinite(Date.parse(updated)) ||
        Date.parse(updated) > Date.parse(retrievedAt) + 86400000 ||
        Date.parse(retrievedAt) - Date.parse(updated) > 90 * 86400000)
    ) {
      warnings.push(`Stale or invalid revision date for ${r.date}; excluded.`);
      continue;
    }
    const low = positive(r.revenueLow) ? r.revenueLow / 1e6 : null,
      high = positive(r.revenueHigh) ? r.revenueHigh / 1e6 : null,
      revenue = (r.revenueAvg as number) / 1e6;
    if ((low !== null && low > revenue) || (high !== null && high < revenue)) {
      warnings.push(`Inconsistent estimate range for ${r.date}; excluded.`);
      continue;
    }
    const analysts =
      Number.isInteger(r.numAnalystsRevenue) && Number(r.numAnalystsRevenue) > 0
        ? Number(r.numAnalystsRevenue)
        : null;
    if (analysts === null) {
      warnings.push(
        `Revenue analyst count unavailable for ${r.date}; estimate excluded.`,
      );
      continue;
    }
    estimates.push({
      fiscalEnd: r.date,
      revenue,
      low,
      high,
      analysts,
      ebit:
        typeof r.ebitAvg === "number" && Number.isFinite(r.ebitAvg)
          ? r.ebitAvg / 1e6
          : null,
      currency,
      source: "FMP consensus",
      note: "Annual revenue consensus; estimated EBIT is shown as reference only and is not used as an operating-margin assumption.",
      retrievedAt,
      updatedAt: updated,
    });
  }
  if (estimates.some((e) => !e.updatedAt))
    warnings.push(
      "FMP does not supply revision dates for some estimates. Retrieval time is not an analyst update date; publication freshness is unverified.",
    );
  return { estimates, warnings: [...new Set(warnings)] };
}
export function verifyReportingCurrency(
  raw: unknown,
  symbol: string,
  anchorEnd: string,
  currency: string,
  cik?:string,
): boolean {
  return (
    Array.isArray(raw) &&
    raw.some(
      (r) =>
        r &&
        r.symbol === symbol &&
        r.period === "FY" &&
        validDate(r.date) &&
        Math.abs(Date.parse(r.date) - Date.parse(anchorEnd)) <= 8 * 86400000 &&
        r.reportedCurrency === currency && (!cik || (r.cik!==undefined && Number(r.cik)===Number(cik))),
    )
  );
}
const http = new CachedHttpClient();
export class FmpEstimateProvider implements AnalystEstimateProvider {
  constructor(
    private key = process.env.FMP_API_KEY,
    private client = http,
  ) {}
  async getAnnualEstimates(
    symbol: string,
    anchorEnd: string,
    currency: string,
    cik?: string,
  ): Promise<EstimateResponse> {
    const retrievedAt = new Date().toISOString(),
      base = { provider: "Financial Modeling Prep", retrievedAt };
    if (!this.key)
      return {
        ...base,
        status: "unconfigured",
        estimates: [],
        warnings: [
          "FMP_API_KEY is not configured. Historical growth remains available; enter user-provided annual forecasts without a subscription.",
        ],
      };
    try {
      const suffix = `symbol=${encodeURIComponent(symbol)}&period=annual&apikey=${encodeURIComponent(this.key)}`;
      const url = `https://financialmodelingprep.com/stable/analyst-estimates?${suffix}&page=0&limit=20`;
      const raw = await this.client.json(url, {
        ttl: 3600000,
        minInterval: 500,
      });
      // Profile currency is a trading currency, not proof of statement/estimate reporting units.
      const statements = await this.client.json(
        `https://financialmodelingprep.com/stable/income-statement?${suffix}&limit=5`,
        { ttl: 86400000, minInterval: 500 },
      );
      if (!verifyReportingCurrency(statements, symbol, anchorEnd, currency, cik))
        return {
          ...base,
          status: "unavailable",
          estimates: [],
          warnings: [
            "FMP reporting currency/fiscal-year context could not be reconciled with SEC annual statements. No trading-currency assumption was used.",
          ],
        };
      const stamp = this.client.retrievedAt(url) ?? retrievedAt,
        result = parseFmpEstimates(raw, symbol, currency, stamp);
      return {
        ...base,
        retrievedAt: stamp,
        status: result.estimates.length ? "available" : "unavailable",
        ...result,
        warnings: result.estimates.length
          ? result.warnings
          : [
              ...result.warnings,
              "No usable annual consensus estimates were returned.",
            ],
      };
    } catch {
      return {
        ...base,
        status: "unavailable",
        estimates: [],
        warnings: [
          "FMP estimates are unavailable: check key, subscription entitlement, rate limits or provider connectivity. Historical growth and user forecasts still work.",
        ],
      };
    }
  }
}
