import { CachedHttpClient, ProviderError, secHttp } from "../server/http";
import {
  emptyMetrics,
  normalizeFinancials,
  parseSubmissions,
} from "./normalize";
import type { Submissions, VerifiedFinancials } from "./types";
import {
  SecDirectoryService,
  secHeaders,
  secDirectory,
} from "./directory-service";
import { TickerDirectory } from "../securities/directory";
import { classifySecurity, valuationEligibility } from "../securities/classify";
import type { SecurityIdentity } from "../securities/symbols";
/** Kept for existing callers; production uses the exchange directory with listing metadata. */
export function resolveCik(
  raw: unknown,
  ticker: string,
): { cik: string; name: string } {
  if (raw && typeof raw === "object" && "fields" in raw) {
    const entry = new TickerDirectory(raw).resolve(ticker);
    return { cik: entry.cik, name: entry.name };
  }
  if (!raw || typeof raw !== "object")
    throw new ProviderError("Malformed SEC ticker mapping.");
  const match = Object.values(raw).find(
    (r) =>
      r &&
      typeof r === "object" &&
      "ticker" in r &&
      typeof r.ticker === "string" &&
      r.ticker.toUpperCase() === ticker.trim().toUpperCase(),
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
export interface FinancialResearchProvider {
  getCompanyFinancials(
    tickerOrName: string,
    force?: boolean,
    asOf?: string,
  ): Promise<VerifiedFinancials>;
}
export type SecFinancialProvider = FinancialResearchProvider;
function emptyResearch(
  identity: SecurityIdentity,
  sub: Submissions,
  asOf: string,
  retrievedAt = new Date().toISOString(),
): VerifiedFinancials {
  const security = classifySecurity(identity, sub),
    eligibility = valuationEligibility(security, null);
  const dates = sub.filings.recent.reportDate
    .filter(
      (d): d is string =>
        typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= asOf,
    )
    .sort();
  return {
    ticker: identity.ticker,
    cik: identity.cik,
    name: sub.name,
    fiscalYearEnd: sub.fiscalYearEnd ?? "",
    identity,
    security,
    eligibility,
    currency: null,
    taxonomy: "unknown",
    annual: [],
    interim: null,
    quarter: null,
    ttm: null,
    latestBalance: { end: dates.at(-1) ?? asOf, metrics: emptyMetrics() },
    retrievedAt,
    asOf,
    warnings: [security.explanation],
  };
}
export class SecEdgarProvider implements FinancialResearchProvider {
  private directory: SecDirectoryService;
  constructor(
    private http: CachedHttpClient = secHttp,
    private userAgent = process.env.SEC_USER_AGENT,
  ) {
    this.directory =
      http === secHttp && userAgent === process.env.SEC_USER_AGENT
        ? secDirectory
        : new SecDirectoryService(http, userAgent);
  }
  async getCompanyFinancials(
    input: string,
    force = false,
    asOf = new Date().toISOString().slice(0, 10),
  ): Promise<VerifiedFinancials> {
    if (!input.trim() || input.length > 100)
      throw new ProviderError(
        "Enter a ticker or company name (up to 100 characters).",
        400,
      );
    const headers = secHeaders(this.userAgent),
      directory = await this.directory.get(),
      identity = directory.resolve(input);
    const submissions = await this.http.json(
      `https://data.sec.gov/submissions/CIK${identity.cik}.json`,
      { ttl: 3600000, force, headers, minInterval: 350 },
    );
    const sub = parseSubmissions(submissions);
    if (Number(sub.cik) !== Number(identity.cik))
      throw new ProviderError(
        "SEC directory and submissions identify different issuers.",
      );
    const classification = classifySecurity(identity, sub);
    const metadataRetrieved =
      this.http.retrievedAt(
        `https://data.sec.gov/submissions/CIK${identity.cik}.json`,
      ) ?? new Date().toISOString();
    if (classification.kind !== "operating-company")
      return emptyResearch(identity, sub, asOf, metadataRetrieved);
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${identity.cik}.json`;
    let facts: unknown;
    try {
      facts = await this.http.json(url, {
        ttl: 3600000,
        force,
        headers,
        minInterval: 350,
      });
    } catch (e) {
      if (e instanceof ProviderError && e.status === 404) {
        const result = emptyResearch(identity, sub, asOf, metadataRetrieved);
        result.eligibility = {
          eligible: false,
          code: "missing-data",
          reason:
            "This SEC-listed issuer has no Company Facts XBRL financials available. Its identity is known, but corporate valuation inputs are unavailable.",
        };
        result.warnings = [result.eligibility.reason];
        return result;
      }
      throw e;
    }
    if (
      facts &&
      typeof facts === "object" &&
      "cik" in facts &&
      Number(facts.cik) === Number(identity.cik) &&
      "facts" in facts &&
      facts.facts &&
      typeof facts.facts === "object" &&
      !("us-gaap" in facts.facts) &&
      !("ifrs-full" in facts.facts)
    ) {
      const result = emptyResearch(identity, sub, asOf, metadataRetrieved);
      result.eligibility = {
        eligible: false,
        code: "missing-data",
        reason:
          "The company is recognized, but its Company Facts do not contain supported US-GAAP or IFRS financial concepts. No substitute financials or valuation were generated.",
      };
      result.warnings = [result.eligibility.reason];
      return result;
    }
    const data = normalizeFinancials(
      facts,
      submissions,
      identity.ticker,
      this.http.retrievedAt(url) ?? new Date().toISOString(),
      asOf,
    );
    data.identity = identity;
    data.security = classification;
    data.eligibility = valuationEligibility(
      classification,
      data.currency ?? null,
    );
    if (!data.annual.length && data.eligibility.eligible)
      data.eligibility = {
        eligible: false,
        code: "missing-data",
        reason:
          "No comparable annual financial statements were found in the supported concepts. The company is recognized; valuation requires reliable financial data.",
      };
    if (classification.foreignIssuer)
      data.warnings.push(
        "Foreign SEC issuer: 20-F/40-F annual and 6-K interim reports are considered only when period dates align. No US quarterly schedule is assumed. Confirm ADR-to-ordinary-share units when entering diluted shares.",
      );
    data.warnings.push(
      "The SEC directory identifies the issuer/listing, not every instrument term. Confirm this is ordinary equity; warrants, preferreds and ADR ratios require separate review.",
    );
    return data;
  }
}
