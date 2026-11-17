import type {
  Assumptions,
  FinancialDataset,
  ValuationScenario,
} from "../finance/types";
import type {
  VerifiedFinancials,
  FinancialPeriod,
  MetricKey,
} from "../sec/types";
import type { ForecastMode, RevenueEstimate, RevenuePlan } from "./types";
export const stageGrowths = (
  a: Pick<Assumptions, "growthEarly" | "growthMiddle" | "growthLate">,
): number[] =>
  Array.from({ length: 10 }, (_, i) =>
    i < 3 ? a.growthEarly : i < 5 ? a.growthMiddle : a.growthLate,
  );
const day = (s: string) => Date.parse(s) / 86400000;
export function nextFiscalEnd(anchor: string, offset: number): string {
  const year = Number(anchor.slice(0, 4)) + offset,
    month = Number(anchor.slice(5, 7)),
    date = Math.min(
      Number(anchor.slice(8, 10)),
      new Date(Date.UTC(year, month, 0)).getUTCDate(),
    );
  return `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
}
export function buildRevenuePlan(
  data: VerifiedFinancials,
  a: Pick<
    Assumptions,
    "growthEarly" | "growthMiddle" | "growthLate" | "terminalGrowth"
  >,
  requestedMode: ForecastMode,
  estimates: RevenueEstimate[] = [],
  custom?: number[],
  now = new Date().toISOString().slice(0, 10),
): RevenuePlan {
  const annual = data.annual.at(-1),
    anchorEnd = annual?.end ?? "",
    revenue = annual?.metrics.revenue.value ?? 0,
    warnings: string[] = [];
  const historical = stageGrowths(a),
    byYear = new Map<number, RevenueEstimate>(),
    duplicates = new Set<number>();
  if (requestedMode === "consensus")
    for (const e of estimates) {
      const year = Array.from({ length: 10 }, (_, i) => i + 1).find(
        (i) =>
          Math.abs(day(e.fiscalEnd) - day(nextFiscalEnd(anchorEnd, i))) <= 14,
      );
      if (
        !annual ||
        !year ||
        e.fiscalEnd <= now ||
        e.currency !== data.currency ||
        !Number.isFinite(e.revenue) ||
        e.revenue <= 0
      ) {
        warnings.push(
          `Estimate ${e.fiscalEnd} excluded: past/unaligned period, invalid revenue or currency mismatch.`,
        );
        continue;
      }
      if (duplicates.has(year)) continue;
      if (byYear.has(year)) {
        warnings.push(
          `Duplicate estimates for FY${year}; that fiscal year is excluded.`,
        );
        byYear.delete(year);
        duplicates.add(year);
        continue;
      }
      byYear.set(year, e);
    }
  const mode =
    requestedMode === "consensus" && !byYear.size
      ? "historical"
      : requestedMode;
  if (mode !== requestedMode)
    warnings.push(
      "No aligned future annual estimates are available. Active mode is Historical Growth; these projections are not analyst consensus.",
    );
  if (
    mode === "custom" &&
    (!custom ||
      custom.length !== 10 ||
      custom.some((g) => !Number.isFinite(g) || g <= -1))
  )
    warnings.push(
      "Custom Forecast needs ten finite growth rates greater than −100%.",
    );
  const rows: RevenuePlan["rows"] = [];
  const activeAnchor=mode==="historical"?(data.ttm??annual):annual;
  const activeEnd=activeAnchor?.end??anchorEnd;
  let previous = activeAnchor?.metrics.revenue.value??revenue,
    lastCovered = -1,
    lastGrowth = historical[0];
  for (let i = 0; i < 10; i++) {
    const e = mode === "consensus" ? byYear.get(i + 1) : undefined;
    let g = mode === "custom" ? (custom?.[i] ?? NaN) : historical[i],
      source = mode === "custom" ? "Manually overridden" : "Historical model";
    if (e) {
      g = e.revenue / previous - 1;
      lastCovered = i;
      lastGrowth = g;
      source = e.source;
    } else if (mode === "consensus") {
      const next = [...byYear.entries()]
        .filter(([year]) => year > i + 1)
        .sort((a, b) => a[0] - b[0])[0];
      if (next) {
        g = (next[1].revenue / previous) ** (1 / (next[0] - i)) - 1;
        source = "Model interpolation";
      } else {
        const progress = (i - lastCovered) / (10 - lastCovered - 1 || 1),
          anchor = Number.isFinite(historical[9])
            ? historical[9]
            : a.terminalGrowth;
        g = lastGrowth + (anchor - lastGrowth) * Math.min(1, progress);
        source = "Model extrapolation";
      }
    }
    const value = previous * (1 + g);
    rows.push({
      fiscalEnd: e?.fiscalEnd ?? nextFiscalEnd(activeEnd, i + 1),
      revenue: value,
      growth: g,
      source,
      estimate: e ?? null,
    });
    previous = value;
  }
  if (!annual || revenue <= 0)
    warnings.push(
      "A positive completed fiscal-year revenue anchor is required.",
    );
  return {
    mode,
    requestedMode,
    growths: rows.map((r) => r.growth),
    rows,
    warnings,
    anchorEnd:activeEnd,
    revision: JSON.stringify({
      mode,
      rows: rows.map((r) => [
        r.fiscalEnd,
        r.growth,
        r.source,
        r.estimate?.retrievedAt,
      ]),
    }),
  };
}
const get = (p: FinancialPeriod, key: MetricKey) =>
  p.metrics[key]?.value ?? null;
const tradeNwc = (p: FinancialPeriod) => {
  const a = get(p, "receivables"),
    b = get(p, "inventory"),
    c = get(p, "payables");
  return a !== null && b !== null && c !== null ? a + b - c : null;
};
export function applyFiscalForecast(
  data: VerifiedFinancials,
  dataset: FinancialDataset,
  plan: RevenuePlan,
): { dataset: FinancialDataset; error: string | null } {
  if (plan.mode === "historical") return { dataset, error: null };
  const annual = data.annual.at(-1);
  if (!annual || annual.metrics.revenue.value === null)
    return {
      dataset,
      error:
        "A completed fiscal-year revenue anchor is required for annual estimates.",
    };
  const valuationEnd = data.latestBalance.end,
    firstEnd = plan.rows[0]?.fiscalEnd;
  if (
    !firstEnd ||
    valuationEnd < annual.end ||
    firstEnd <= data.asOf ||
    day(firstEnd) <= day(valuationEnd) ||
    plan.rows.some(
      (r, i) =>
        i > 0 &&
        (day(r.fiscalEnd) - day(plan.rows[i - 1].fiscalEnd) < 350 ||
          day(r.fiscalEnd) - day(plan.rows[i - 1].fiscalEnd) > 380),
    )
  )
    return {
      dataset,
      error:
        "Forecast fiscal dates overlap actual reporting periods or are not consecutive full fiscal years.",
    };
  let elapsed: NonNullable<
    FinancialDataset["fiscalForecast"]
  >["elapsedActuals"];
  if (valuationEnd > annual.end) {
    const ytd = data.interim,
      aNwc = tradeNwc(annual),
      yNwc = ytd ? tradeNwc(ytd) : null;
    if (
      !ytd ||
      ytd.end !== valuationEnd ||
      Math.abs(day(ytd.start) - day(annual.end) - 1) > 7 ||
      get(ytd, "operatingIncome") === null ||
      get(ytd, "depreciation") === null ||
      get(ytd, "capex") === null ||
      aNwc === null ||
      yNwc === null
    )
      return {
        dataset,
        error:
          "Annual forecast aligns to the completed FY, but current YTD EBIT/D&A/CapEx/trade-NWC cannot be reconciled. Annual-mode valuation is incomplete; use Historical Growth or obtain missing YTD data. No full-year cash flow was counted entirely as future.",
      };
    elapsed = {
      revenue: get(ytd, "revenue")!,
      ebit: get(ytd, "operatingIncome")!,
      depreciation: get(ytd, "depreciation")!,
      capex: get(ytd, "capex")!,
      changeInNwc: yNwc - aNwc,
    };
  }
  const historical = data.annual
    .filter((p) => p.metrics.revenue.value !== null)
    .map((p) => ({
      year: Number(p.end.slice(0, 4)),
      revenue: p.metrics.revenue.value!,
      ebit: p.metrics.operatingIncome.value ?? NaN,
      cashTaxes: null,
      periodLabel: p.end,
    }));
  return {
    dataset: {
      ...dataset,
      incomeStatements: historical,
      fiscalForecast: {
        anchorEnd: annual.end,
        valuationEnd,
        yearEnds: plan.rows.map((r) => r.fiscalEnd),
        elapsedActuals: elapsed,
      },
    },
    error: null,
  };
}
export function annualScenarioRates(
  base: number[],
  s: ValuationScenario,
): number[] {
  const spread = Math.max(0.02, Math.abs(base[0]) * 0.25);
  return base.map((g, i) =>
    s.id === "base"
      ? g
      : Math.max(
          -0.99,
          g +
            (s.id === "bear" ? -1 : 1) *
              spread *
              (i < 3 ? 1 : i < 5 ? 0.6 : 0.25),
        ),
  );
}

export function annualSummary(g: number[]) {
  const mean = (values: number[]) =>
    values.reduce((s, v) => s + v, 0) / values.length;
  return {
    growthEarly: mean(g.slice(0, 3)),
    growthMiddle: mean(g.slice(3, 5)),
    growthLate: mean(g.slice(5)),
  };
}
