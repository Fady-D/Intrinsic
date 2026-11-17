import { CachedHttpClient, ProviderError, secHttp } from "../server/http";
import { normalizeFinancials } from "./normalize";
import type { VerifiedFinancials } from "./types";
export const supportedTickers = [
  "MSFT",
  "GOOGL",
  "AAPL",
  "AMZN",
  "ORCL",
] as const;
export function resolveCik(
  raw: unknown,
  ticker: string,
): { cik: string; name: string } {
  if (!raw || typeof raw !== "object")
    throw new ProviderError("Malformed SEC ticker mapping.");
  const match = Object.values(raw).find(
    (r) =>
      r &&
      typeof r === "object" &&
      "ticker" in r &&
      typeof r.ticker === "string" &&
      r.ticker.toUpperCase() === ticker.toUpperCase(),
  ) as { cik_str?: unknown; title?: unknown } | undefined;
  if (
    !match ||
    typeof match.cik_str !== "number" ||
    !Number.isInteger(match.cik_str) ||
    match.cik_str <= 0 ||
    typeof match.title !== "string"
  )
    throw new ProviderError(`No SEC company mapping for ${ticker}.`, 404);
  return { cik: String(match.cik_str).padStart(10, "0"), name: match.title };
}
export interface SecFinancialProvider {
  getCompanyFinancials(
    ticker: string,
    force?: boolean,
    asOf?: string,
  ): Promise<VerifiedFinancials>;
}
export class SecEdgarProvider implements SecFinancialProvider {
  constructor(
    private http: CachedHttpClient = secHttp,
    private userAgent = process.env.SEC_USER_AGENT,
  ) {}
  async getCompanyFinancials(
    input: string,
    force = false,
    asOf?: string,
  ): Promise<VerifiedFinancials> {
    const ticker = input.trim().toUpperCase();
    if (!supportedTickers.includes(ticker as (typeof supportedTickers)[number]))
      throw new ProviderError(
        `Supported tickers: ${supportedTickers.join(", ")}. Use the separate ASTR demo for fictional data.`,
        400,
      );
    if (
      !this.userAgent ||
      !/\S+@\S+\.\S+/.test(this.userAgent) ||
      /[\r\n]/.test(this.userAgent)
    )
      throw new ProviderError(
        "Configure SEC_USER_AGENT with your app name and real contact email in .env.local. No financial data was substituted.",
        503,
      );
    const headers = {
        "User-Agent": this.userAgent,
        Accept: "application/json",
      },
      mapping = await this.http.json(
        "https://www.sec.gov/files/company_tickers.json",
        { ttl: 86_400_000, headers, minInterval: 350 },
      );
    const identity = resolveCik(mapping, ticker);
    const submissions = await this.http.json(
      `https://data.sec.gov/submissions/CIK${identity.cik}.json`,
      { ttl: 3_600_000, force, headers, minInterval: 350 },
    );
    const facts = await this.http.json(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${identity.cik}.json`,
      { ttl: 3_600_000, force, headers, minInterval: 350 },
    );
    return normalizeFinancials(
      facts,
      submissions,
      ticker,
      this.http.retrievedAt(
        `https://data.sec.gov/api/xbrl/companyfacts/CIK${identity.cik}.json`,
      ) ?? new Date().toISOString(),
      asOf ?? new Date().toISOString().slice(0, 10),
    );
  }
}
