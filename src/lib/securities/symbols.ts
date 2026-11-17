/** SEC spelling is authoritative; punctuation aliases are used only after an exact lookup. */
export function normalizeTicker(input: string): string {
  return input
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[‐‑‒–—−]/g, "-");
}
export function tickerAlias(input: string): string {
  return normalizeTicker(input).replaceAll(".", "-");
}
export function normalizeCompanyName(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
export interface SecurityIdentity {
  ticker: string;
  cik: string;
  name: string;
  exchange: string | null;
}
export type SecurityKind =
  | "operating-company"
  | "financial-institution"
  | "fund"
  | "other-security"
  | "unknown";
export interface SecurityClassification {
  kind: SecurityKind;
  foreignIssuer: boolean;
  sic: string | null;
  sicDescription: string | null;
  evidence: string[];
  explanation: string;
  alternativeModels: (
    "dividend-discount" | "excess-return" | "residual-income"
  )[];
}
export interface ValuationEligibility {
  eligible: boolean;
  code:
    | "operating-dcf"
    | "alternative-model-required"
    | "unsupported-security"
    | "currency-unsupported"
    | "unclassified"
    | "missing-data";
  reason: string;
}
