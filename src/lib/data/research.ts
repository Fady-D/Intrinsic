import type { FinancialDataset, ValuationScenario } from "../finance/types";
import type { FinancialPeriod, VerifiedFinancials } from "../sec/types";
import { createScenarios } from "./illustrative";
import type { Quote } from "../market/quotes";
import { comparable } from "../sec/normalize";
export interface ModelInputs {
  automatic?: boolean;
  excessCash: number | null;
  debt: number | null;
  otherClaims: number | null;
  shares: number | null;
  depreciationRate: number | null;
  rationale: string;
  acknowledged: boolean;
}
export function initializeInputs(data: VerifiedFinancials): ModelInputs {
  const p = data.ttm ?? data.annual.at(-1),
    revenue = p?.metrics.revenue.value,
    da = p?.metrics.depreciation.value;
  return {
    excessCash: null,
    debt: data.latestBalance.metrics.debt.value,
    otherClaims: null,
    shares: null,
    depreciationRate:
      revenue && da !== null && da !== undefined ? da / revenue : null,
    rationale: "",
    acknowledged: false,
  };
}
export function initializeScenarios(
  data: VerifiedFinancials,
): ValuationScenario[] {
  const p = data.ttm ?? data.annual.at(-1),
    revenue = p?.metrics.revenue.value,
    ebit = p?.metrics.operatingIncome.value,
    capex = p?.metrics.capex.value,
    da = p?.metrics.depreciation.value;
  const last = data.annual.at(-1),
    previous = data.annual.at(-2);
  const observed =
    last &&
    previous &&
    comparable(previous, last) &&
    previous.metrics.revenue.value &&
    last.metrics.revenue.value !== null
      ? last.metrics.revenue.value / previous.metrics.revenue.value - 1
      : null;
  const baseGrowth =
    observed === null ? null : Math.max(-0.2, Math.min(0.3, observed));
  return createScenarios().map((s) => {
    const growth =
      baseGrowth === null
        ? s.assumptions.growthEarly
        : baseGrowth *
          (s.id === "base"
            ? 1
            : s.id === "bear"
              ? baseGrowth >= 0
                ? 0.5
                : 1.5
              : baseGrowth >= 0
                ? 1.5
                : 0.5);
    return {
      ...s,
      assumptions: {
        ...s.assumptions,
        growthEarly: growth,
        growthMiddle: (growth * 2) / 3,
        growthLate: growth / 3,
        initialMargin:
          revenue && ebit !== null && ebit !== undefined ? ebit / revenue : NaN,
        targetMargin:
          revenue && ebit !== null && ebit !== undefined ? ebit / revenue : NaN,
        capexRate:
          revenue && capex !== null && capex !== undefined
            ? capex / revenue
            : NaN,
        daRate: revenue && da !== null && da !== undefined ? da / revenue : NaN,
        shares: NaN,
      },
    };
  });
}
export function initializationIssues(
  data: VerifiedFinancials,
  inputs: ModelInputs,
): string[] {
  const p = data.ttm ?? data.annual.at(-1),
    issues: string[] = [];
  if (data.eligibility && !data.eligibility.eligible)
    issues.push(data.eligibility.reason);
  if (data.currency !== undefined && data.currency !== "USD")
    issues.push(
      "The existing DCF requires a consistently reported USD financial dataset. No currency conversion is assumed.",
    );
  for (const key of ["revenue", "operatingIncome", "capex"] as const)
    if (p?.metrics[key].value == null && !(inputs.automatic && key === "capex"))
      issues.push(`Missing reliable ${key} for the model's reporting period.`);
  if (data.interim && !data.ttm)
    issues.push(
      "TTM is incomplete. Resolve the unmatched interim data before valuation.",
    );
  if (p && data.latestBalance.end > p.end)
    issues.push(
      "Performance is older than the latest available statement. Valuation is incomplete.",
    );
  for (const [key, label] of [
    ["excessCash", "excess cash"],
    ["debt", "total financial debt"],
    ["otherClaims", "other non-equity claims"],
    ["shares", "fully diluted share estimate"],
    ["depreciationRate", "D&A / revenue"],
  ] as const)
    if (
      inputs[key] === null ||
      !Number.isFinite(inputs[key]) ||
      inputs[key]! < 0 ||
      (key === "shares" && inputs[key]! <= 0)
    )
      issues.push(
        `Enter a valid ${label}; missing values are never set to zero automatically.`,
      );
  if (inputs.depreciationRate !== null && inputs.depreciationRate > 1)
    issues.push("D&A / revenue must not exceed 100%.");
  if (!inputs.automatic && (!inputs.acknowledged || !inputs.rationale.trim()))
    issues.push(
      "Document and acknowledge the manual inputs and forecast estimates.",
    );
  return issues;
}
export function toDcfDataset(
  data: VerifiedFinancials,
  inputs: ModelInputs,
  price: number | null,
): FinancialDataset | null {
  if (initializationIssues(data, inputs).length) return null;
  const p = (data.ttm ?? data.annual.at(-1)) as FinancialPeriod;
  return {
    company: {
      ticker: data.ticker,
      name: data.name,
      sector: "SEC registrant",
      description: "SEC source financials with explicit model estimates.",
    },
    incomeStatements: [
      ...data.annual
        .filter(
          (a) =>
            a.end < p.end &&
            a.metrics.revenue.value !== null &&
            a.metrics.operatingIncome.value !== null,
        )
        .map((a) => ({
          year: Number(a.end.slice(0, 4)),
          revenue: a.metrics.revenue.value!,
          ebit: a.metrics.operatingIncome.value!,
          cashTaxes: null,
        })),
      {
        year: Number(p.end.slice(0, 4)),
        periodLabel: p.kind === "ttm" ? `TTM ${p.end}` : p.end.slice(0, 4),
        revenue: p.metrics.revenue.value!,
        ebit: p.metrics.operatingIncome.value!,
        cashTaxes: null,
      },
    ],
    cashFlows: [],
    balanceSheets: [
      {
        year: Number(data.latestBalance.end.slice(0, 4)),
        excessCash: inputs.excessCash!,
        debt: inputs.debt!,
        otherClaims: inputs.otherClaims!,
        netWorkingCapital: null,
      },
    ],
    market: {
      price: price ?? 0,
      dilutedShares: inputs.shares!,
      asOf: data.retrievedAt,
    },
    source: {
      kind: "sec",
      name: "SEC EDGAR Company Facts and Submissions",
      asOf: p.end,
      currency: "USD",
      monetaryUnit: "millions",
      note: "Reported inputs and user estimates; historical FCF is not forecast FCFF.",
    },
  };
}
export interface LoadState {
  requestId: number;
  ticker: string;
  data: VerifiedFinancials | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
}
export const initialLoadState: LoadState = {
  requestId: 0,
  ticker: "",
  data: null,
  status: "idle",
  error: null,
};
export type LoadAction =
  | { type: "start"; id: number; ticker: string }
  | { type: "success"; id: number; data: VerifiedFinancials }
  | { type: "failure"; id: number; error: string };
export function researchReducer(
  state: LoadState,
  action: LoadAction,
): LoadState {
  if (action.type === "start")
    return {
      requestId: action.id,
      ticker: action.ticker,
      data: null,
      status: "loading",
      error: null,
    };
  if (action.id !== state.requestId) return state;
  if (action.type === "failure")
    return { ...state, status: "error", data: null, error: action.error };
  if (action.data.ticker !== state.ticker)
    return {
      ...state,
      status: "error",
      data: null,
      error: "Ticker identity mismatch in financial response.",
    };
  return { ...state, status: "ready", data: action.data, error: null };
}

export function referencePrice(
  manual: string,
  quote: Quote | null,
): number | null {
  if (manual.trim() !== "") {
    const value = Number(manual);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  return quote && !quote.stale ? quote.price : null;
}
