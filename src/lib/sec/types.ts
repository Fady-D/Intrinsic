import type {
  SecurityIdentity,
  SecurityClassification,
  ValuationEligibility,
} from "../securities/symbols";
export type MetricKey =
  | "revenue"
  | "operatingIncome"
  | "netIncome"
  | "operatingCashFlow"
  | "capex"
  | "depreciation"
  | "stockCompensation"
  | "dilutedShares"
  | "cash"
  | "shortInvestments"
  | "debt"
  | "periodEndShares"
  | "currentAssets"
  | "currentLiabilities"
  | "receivables"
  | "inventory"
  | "payables"
  | "bookEquity"
  | "currentDebt"
  | "noncurrentDebt"
  | "taxExpense"
  | "pretaxIncome"
  | "interestExpense"
  | "preferredClaims"
  | "minorityClaims"
  | "reportedFcf";
export interface Provenance {
  source: "SEC EDGAR";
  url: string;
  filingUrl: string;
  form: string;
  filed: string;
  start?: string;
  end: string;
  accession: string;
  tag: string;
  unit: string;
  retrievedAt: string;
}
export interface Metric {
  value: number | null;
  status: "reported" | "derived" | "missing";
  reason?: string;
  sources: Provenance[];
}
export type Metrics = Record<MetricKey, Metric>;
export interface FinancialPeriod {
  kind: "annual" | "ytd" | "quarter" | "ttm";
  start: string;
  end: string;
  fiscalYear: number;
  metrics: Metrics;
  fcfMargin: number | null;
  fcfGrowth: number | null;
}
export interface VerifiedFinancials {
  preferredBasis?: { claim: Metric; shares: Metric };
  currency?: string | null;
  currencyCandidates?: string[];
  taxonomy?: "us-gaap" | "ifrs-full" | "unknown";
  identity?: SecurityIdentity;
  security?: SecurityClassification;
  eligibility?: ValuationEligibility;
  ticker: string;
  cik: string;
  name: string;
  fiscalYearEnd: string;
  annual: FinancialPeriod[];
  interim: FinancialPeriod | null;
  quarter: FinancialPeriod | null;
  ttm: FinancialPeriod | null;
  latestBalance: { end: string; metrics: Metrics };
  retrievedAt: string;
  asOf: string;
  warnings: string[];
}
export interface SecFact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
  frame?: string;
  sourceTag?: string;
  sourceUrl?: string;
  filingUrl?: string;
  retrievedAt?: string;
  decimals?: string;
}
export interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, { units: Record<string, SecFact[]> }>>;
}
export interface SubmissionFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  form: string;
  primaryDocument: string;
}
export interface Submissions {
  sic?: string | number;
  sicDescription?: string;
  entityType?: string;
  cik: string;
  name: string;
  fiscalYearEnd: string;
  filings: {
    recent: Record<string, unknown[]>;
    files?: { name: string; filingFrom: string; filingTo: string }[];
  };
}
