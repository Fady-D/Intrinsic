import type { Submissions } from "../sec/types";
import type {
  SecurityClassification,
  SecurityIdentity,
  ValuationEligibility,
} from "./symbols";
export interface ValuationModelPolicy {
  kind: SecurityClassification["kind"];
  models: SecurityClassification["alternativeModels"];
  operatingDcf: boolean;
}
export const modelPolicies: ValuationModelPolicy[] = [
  { kind: "operating-company", models: [], operatingDcf: true },
  {
    kind: "financial-institution",
    models: ["dividend-discount", "excess-return", "residual-income"],
    operatingDcf: false,
  },
  { kind: "fund", models: [], operatingDcf: false },
  { kind: "other-security", models: [], operatingDcf: false },
  { kind: "unknown", models: [], operatingDcf: false },
];
export function classifySecurity(
  identity: SecurityIdentity,
  sub: Submissions,
): SecurityClassification {
  const sic =
      typeof sub.sic === "string"
        ? sub.sic
        : typeof sub.sic === "number"
          ? String(sub.sic)
          : null,
    code = sic ? Number(sic) : NaN,
    name = `${identity.name} ${sub.name}`.toUpperCase();
  const forms = sub.filings.recent.form.filter(
    (x): x is string => typeof x === "string",
  );
  const foreignIssuer = forms.some((f) => /^(20-F|40-F|6-K)(\/A)?$/.test(f));
  const evidence: string[] = [];
  if (sic)
    evidence.push(
      `SEC SIC ${sic}: ${sub.sicDescription ?? "description unavailable"}`,
    );
  if (sub.entityType) evidence.push(`SEC entity type: ${sub.entityType}`);
  if (foreignIssuer) evidence.push("Foreign-issuer filing forms present.");
  let kind: SecurityClassification["kind"] = "unknown",
    explanation =
      "Issuer type cannot be established from the available SEC metadata. An operating-company valuation is blocked pending classification.";
  if (
    code === 6722 ||
    code === 6726 ||
    sub.entityType === "investment" ||
    forms.some((f) =>
      /^(N-1A|N-2|N-3|N-4|N-6|N-8A|N-CSR|NPORT-P|N-CEN|485[AB])/i.test(f),
    ) ||
    /\b(ETF|MUTUAL FUND|CLOSED.END FUND|UNIT INVESTMENT TRUST|EXCHANGE.TRADED FUND)\b/.test(
      name,
    )
  ) {
    kind = "fund";
    explanation =
      "This security is a fund, ETF or investment trust. Corporate operating cash flows do not value its shares; a fund/NAV analysis is required.";
  } else if (
    /-(WT|WS|W|U|UN|RT|RIGHTS|P[A-Z]?)$/.test(identity.ticker) ||
    code === 6770 ||
    (code === 6799 && /\bTRUST\b/.test(name)) ||
    /\b(BLANK CHECK|ROYALTY TRUST|STATUTORY TRUST|DEPOSITARY TRUST)\b/.test(
      name,
    )
  ) {
    kind = "other-security";
    explanation =
      "This listing appears to be a warrant, unit, preferred instrument, blank-check company or non-operating trust. A conventional ordinary-equity FCFF valuation is not supported.";
    evidence.push(
      "Instrument suffix, trust description or blank-check SIC requires a different model.",
    );
  } else if (code >= 6000 && code <= 6799) {
    kind = "financial-institution";
    explanation =
      "This issuer is classified in financial services, insurance, lending or investment activities. Debt and reinvestment have different economic roles; an equity-based model is required instead of operating-company FCFF.";
  } else if (
    Number.isFinite(code) &&
    code >= 100 &&
    code < 10000 &&
    forms.some((f) => /^(10-K|10-Q|20-F|40-F)(\/A)?$/.test(f))
  ) {
    kind = "operating-company";
    explanation =
      "SEC industry metadata and reporting forms identify an operating-company candidate. Confirm ordinary equity, reporting units and material estimates before using FCFF.";
  }
  const policy = modelPolicies.find((p) => p.kind === kind)!;
  return {
    kind,
    foreignIssuer,
    sic,
    sicDescription:
      typeof sub.sicDescription === "string" ? sub.sicDescription : null,
    evidence,
    explanation,
    alternativeModels: [...policy.models],
  };
}
export function valuationEligibility(
  security: SecurityClassification,
  currency: string | null,
): ValuationEligibility {
  if (security.kind === "financial-institution")
    return {
      eligible: false,
      code: "alternative-model-required",
      reason: security.explanation,
    };
  if (security.kind === "fund" || security.kind === "other-security")
    return {
      eligible: false,
      code: "unsupported-security",
      reason: security.explanation,
    };
  if (security.kind === "unknown")
    return {
      eligible: false,
      code: "unclassified",
      reason: security.explanation,
    };
  if (currency !== "USD")
    return {
      eligible: false,
      code: "currency-unsupported",
      reason: currency
        ? `Reported currency is ${currency}. Financials may be researched in that currency, but this version's DCF and USD quotes require a reviewed FX and share/ADR conversion. Valuation is blocked; no automatic currency conversion is applied.`
        : "A consistent reporting currency could not be established. Valuation is blocked; currency units are not mixed.",
    };
  return {
    eligible: true,
    code: "operating-dcf",
    reason: security.explanation,
  };
}
