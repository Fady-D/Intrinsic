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
  unit: "USD" | "shares";
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
  cik: string;
  name: string;
  fiscalYearEnd: string;
  filings: {
    recent: Record<string, unknown[]>;
    files?: { name: string; filingFrom: string; filingTo: string }[];
  };
}
