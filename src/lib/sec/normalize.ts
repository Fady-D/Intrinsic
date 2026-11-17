import type {
  CompanyFacts,
  FinancialPeriod,
  Metric,
  MetricKey,
  Metrics,
  SecFact,
  Submissions,
  VerifiedFinancials,
} from "./types";

// Ordered economic equivalents; component concepts are handled separately rather than added to totals.
export const tags = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
  ],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
  capex: [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",
  ],
  depreciation: [
    "DepreciationDepletionAndAmortization",
    "DepreciationDepletionAndAmortizationPropertyPlantAndEquipment",
  ],
  stockCompensation: ["ShareBasedCompensation"],
  dilutedShares: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  cash: ["CashAndCashEquivalentsAtCarryingValue"],
  shortInvestments: ["ShortTermInvestments", "MarketableSecuritiesCurrent"],
  debt: [
    "LongTermDebtAndFinanceLeaseObligationsIncludingCurrentPortion",
    "LongTermDebtCurrent",
    "LongTermDebtNoncurrent",
  ],
  periodEndShares: [
    "EntityCommonStockSharesOutstanding",
    "CommonStockSharesOutstanding",
  ],
  reportedFcf: [],
} satisfies Record<MetricKey, string[]>;
const keys = Object.keys(tags) as MetricKey[];
const day = (date: string) => Date.parse(date + "T00:00:00Z") / 86400000;
export const days = (start: string, end: string) => day(end) - day(start) + 1;
export const missing = (reason: string): Metric => ({
  value: null,
  status: "missing",
  reason,
  sources: [],
});
export const emptyMetrics = (): Metrics =>
  Object.fromEntries(
    keys.map((k) => [k, missing("No reliable comparable fact available.")]),
  ) as Metrics;
const instant = new Set<MetricKey>([
  "cash",
  "shortInvestments",
  "debt",
  "periodEndShares",
]);
const validDate = (s: unknown): s is string =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(day(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export function parseCompanyFacts(raw: unknown): CompanyFacts {
  if (!raw || typeof raw !== "object")
    throw new Error("Malformed SEC company facts.");
  const r = raw as Partial<CompanyFacts>;
  if (
    typeof r.cik !== "number" ||
    !Number.isInteger(r.cik) ||
    !r.entityName ||
    !r.facts ||
    typeof r.facts !== "object" ||
    !r.facts["us-gaap"]
  )
    throw new Error("SEC company facts lack identity or US-GAAP concepts.");
  return r as CompanyFacts;
}
export function parseSubmissions(raw: unknown): Submissions {
  if (!raw || typeof raw !== "object")
    throw new Error("Malformed SEC submissions.");
  const r = raw as Partial<Submissions>;
  if (
    !r.name ||
    !r.cik ||
    !r.filings?.recent ||
    !Array.isArray(r.filings.recent.form) ||
    !Array.isArray(r.filings.recent.reportDate) ||
    !Array.isArray(r.filings.recent.filingDate)
  )
    throw new Error("SEC submissions lack filing history.");
  return r as Submissions;
}
interface Context {
  facts: CompanyFacts;
  asOf: string;
  retrievedAt: string;
  cik: string;
}
function candidates(ctx: Context, tag: string, unit: string): SecFact[] {
  const namespace =
    tag === "EntityCommonStockSharesOutstanding" ? "dei" : "us-gaap";
  const list = ctx.facts.facts[namespace]?.[tag]?.units?.[unit];
  if (!Array.isArray(list)) return [];
  return list.filter(
    (f) =>
      f &&
      typeof f.val === "number" &&
      Number.isFinite(f.val) &&
      typeof f.accn === "string" &&
      /^\d{10}-\d{2}-\d{6}$/.test(f.accn) &&
      validDate(f.end) &&
      validDate(f.filed) &&
      f.filed <= ctx.asOf &&
      f.end <= ctx.asOf &&
      (f.start === undefined || (validDate(f.start) && f.start <= f.end)) &&
      /^10-[KQ](\/A)?$/.test(f.form),
  );
}
function getTag(
  ctx: Context,
  tag: string,
  start: string | undefined,
  end: string,
  unit: "USD" | "shares",
): Metric {
  const matches = candidates(ctx, tag, unit)
    .filter(
      (f) =>
        f.end === end && (start === undefined ? !f.start : f.start === start),
    )
    .sort(
      (a, b) => b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn),
    );
  if (!matches.length)
    return missing(
      `Missing ${tag} for ${start ? start + " – " : ""}${end} (${unit}).`,
    );
  const f = matches[0];
  if (
    matches.some(
      (x) => x.filed === f.filed && x.accn === f.accn && x.val !== f.val,
    )
  )
    return missing(`Conflicting same-filing facts for ${tag} on ${end}.`);
  if (
    [
      "PaymentsToAcquirePropertyPlantAndEquipment",
      "PaymentsToAcquireProductiveAssets",
      "WeightedAverageNumberOfDilutedSharesOutstanding",
      "EntityCommonStockSharesOutstanding",
      "CommonStockSharesOutstanding",
      "CashAndCashEquivalentsAtCarryingValue",
      "ShortTermInvestments",
      "MarketableSecuritiesCurrent",
    ].includes(tag) &&
    f.val < 0
  )
    return missing(
      `Unexpected negative expenditure, balance or share value: ${tag}.`,
    );
  const namespace =
    tag === "EntityCommonStockSharesOutstanding" ? "dei" : "us-gaap";
  return {
    value: f.val / 1e6,
    status: "reported",
    reason:
      tag === "PaymentsToAcquireProductiveAssets"
        ? "Cash purchases of productive assets; review the filing line and scope before using as forecast CapEx."
        : undefined,
    sources: [
      {
        source: "SEC EDGAR",
        url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${ctx.cik}.json`,
        filingUrl: `https://www.sec.gov/Archives/edgar/data/${Number(ctx.cik)}/${f.accn.replaceAll("-", "")}/${f.accn}-index.html`,
        form: f.form,
        filed: f.filed,
        start: f.start,
        end: f.end,
        accession: f.accn,
        tag: `${namespace}:${tag}`,
        unit,
        retrievedAt: ctx.retrievedAt,
      },
    ],
  };
}
function derived(
  inputs: Metric[],
  value: (values: number[]) => number,
  reason: string,
): Metric {
  if (inputs.some((m) => m.value === null)) return missing(reason);
  const v = value(inputs.map((m) => m.value!));
  return Number.isFinite(v)
    ? {
        value: v,
        status: "derived",
        sources: inputs.flatMap((m) => m.sources),
        reason,
      }
    : missing("Nonfinite derived value.");
}
function pick(
  ctx: Context,
  key: MetricKey,
  start: string | undefined,
  end: string,
): Metric {
  if (key === "reportedFcf")
    return missing("FCF is derived from operating cash flow minus CapEx.");
  if (key === "debt") return debt(ctx, end);
  const unit =
    key === "dilutedShares" || key === "periodEndShares" ? "shares" : "USD";
  for (const tag of tags[key]) {
    const m = getTag(ctx, tag, instant.has(key) ? undefined : start, end, unit);
    if (m.value !== null) return m;
    if (m.reason?.startsWith("Conflicting")) return m;
  }
  return missing(`No reliable ${key} fact for this reporting period.`);
}
function debt(ctx: Context, end: string): Metric {
  // Total includes finance leases; never add its component debt or leases again.
  const aggregate = getTag(
    ctx,
    "LongTermDebtAndFinanceLeaseObligationsIncludingCurrentPortion",
    undefined,
    end,
    "USD",
  );
  if (aggregate.value !== null) {
    const commercial = getTag(ctx, "CommercialPaper", undefined, end, "USD");
    const short = getTag(ctx, "ShortTermBorrowings", undefined, end, "USD");
    // ShortTermBorrowings may contain commercial paper; use it once when explicitly reported.
    const addon = short.value !== null ? short : commercial;
    return addon.value === null
      ? missing(
          "Long-term debt reported, but short-term borrowing coverage is unconfirmed; enter total debt after reviewing the filing.",
        )
      : derived(
          [aggregate, addon],
          (v) => v[0] + v[1],
          "Long-term debt/finance leases plus separately reported short-term borrowing.",
        );
  }
  const pair = (current: string, noncurrent: string) =>
    derived(
      [
        getTag(ctx, current, undefined, end, "USD"),
        getTag(ctx, noncurrent, undefined, end, "USD"),
      ],
      (v) => v[0] + v[1],
      "Current plus noncurrent long-term debt.",
    );
  const long = pair("LongTermDebtCurrent", "LongTermDebtNoncurrent");
  if (long.value === null)
    return missing(
      "No complete, non-overlapping long-term debt total. Review total debt manually.",
    );
  const short = getTag(ctx, "ShortTermBorrowings", undefined, end, "USD"),
    commercial = getTag(ctx, "CommercialPaper", undefined, end, "USD");
  const addon = short.value !== null ? short : commercial;
  return addon.value === null
    ? missing(
        "Short-term borrowing coverage unconfirmed; absence is not treated as zero debt.",
      )
    : derived(
        [long, addon],
        (v) => v[0] + v[1],
        "Long-term debt plus explicitly reported short-term borrowing; operating leases excluded.",
      );
}
function finalize(p: FinancialPeriod): FinancialPeriod {
  p.metrics.reportedFcf = derived(
    [p.metrics.operatingCashFlow, p.metrics.capex],
    (v) => v[0] - v[1],
    "Reported FCF = operating cash flow − positive CapEx; not FCFF.",
  );
  p.fcfMargin =
    p.metrics.revenue.value && p.metrics.reportedFcf.value !== null
      ? p.metrics.reportedFcf.value / p.metrics.revenue.value
      : null;
  return p;
}
function period(
  ctx: Context,
  kind: FinancialPeriod["kind"],
  start: string,
  end: string,
): FinancialPeriod {
  const metrics = emptyMetrics();
  for (const key of keys) metrics[key] = pick(ctx, key, start, end);
  return finalize({
    kind,
    start,
    end,
    fiscalYear: Number(end.slice(0, 4)),
    metrics,
    fcfMargin: null,
    fcfGrowth: null,
  });
}
export function comparable(a: FinancialPeriod, b: FinancialPeriod): boolean {
  return (
    Math.abs(days(a.start, a.end) - days(b.start, b.end)) <= 7 &&
    Math.abs(days(a.end, b.end) - 365) <= 8
  );
}
export function reconcileTtm(
  annual: FinancialPeriod,
  current: FinancialPeriod,
  prior: FinancialPeriod,
): FinancialPeriod | null {
  if (
    Math.abs(day(current.start) - day(annual.end) - 1) > 7 ||
    !comparable(prior, current) ||
    Math.abs(day(prior.start) - day(annual.start)) > 7
  )
    return null;
  const m = emptyMetrics();
  for (const key of keys.filter(
    (k) => !instant.has(k) && k !== "reportedFcf",
  )) {
    const inputs = [
      annual.metrics[key],
      current.metrics[key],
      prior.metrics[key],
    ];
    if (
      inputs.some((x) => x.value === null) ||
      new Set(inputs.map((x) => x.sources[0]?.tag)).size !== 1
    ) {
      m[key] = missing(
        "TTM requires matching concepts in annual, current YTD and prior YTD.",
      );
      continue;
    }
    m[key] = derived(
      inputs,
      (v) =>
        key === "dilutedShares"
          ? (v[0] * days(annual.start, annual.end) +
              v[1] * days(current.start, current.end) -
              v[2] * days(prior.start, prior.end)) /
            (days(annual.start, annual.end) +
              days(current.start, current.end) -
              days(prior.start, prior.end))
          : v[0] + v[1] - v[2],
      key === "dilutedShares"
        ? "Day-weighted TTM diluted average shares."
        : "TTM = annual + current interim YTD − corresponding prior interim YTD.",
    );
  }
  for (const key of instant) m[key] = current.metrics[key];
  const start = new Date((day(prior.end) + 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  return finalize({
    kind: "ttm",
    start,
    end: current.end,
    fiscalYear: current.fiscalYear,
    metrics: m,
    fcfMargin: null,
    fcfGrowth: null,
  });
}
export function normalizeFinancials(
  rawFacts: unknown,
  rawSubmissions: unknown,
  ticker: string,
  retrievedAt = new Date().toISOString(),
  asOf = retrievedAt.slice(0, 10),
): VerifiedFinancials {
  const facts = parseCompanyFacts(rawFacts),
    sub = parseSubmissions(rawSubmissions),
    cik = String(facts.cik).padStart(10, "0");
  if (Number(sub.cik) !== facts.cik)
    throw new Error(
      "Company facts and submissions identify different companies.",
    );
  if (!validDate(asOf)) throw new Error("Invalid historical snapshot date.");
  const ctx = { facts, asOf, retrievedAt, cik };
  const revenues = tags.revenue.flatMap((tag) => candidates(ctx, tag, "USD"));
  const annualWindows = [
    ...new Map(
      revenues
        .filter(
          (f) =>
            f.start &&
            days(f.start, f.end) >= 350 &&
            days(f.start, f.end) <= 380 &&
            /^10-K/.test(f.form),
        )
        .map((f) => [f.end, { start: f.start!, end: f.end }]),
    ).values(),
  ]
    .sort((a, b) => a.end.localeCompare(b.end))
    .slice(-10);
  const annual = annualWindows.map((w) =>
    period(ctx, "annual", w.start, w.end),
  );
  for (let i = 1; i < annual.length; i++) {
    const prev = annual[i - 1],
      cur = annual[i];
    if (
      comparable(prev, cur) &&
      prev.metrics.reportedFcf.value !== null &&
      prev.metrics.reportedFcf.value > 0 &&
      cur.metrics.reportedFcf.value !== null
    )
      cur.fcfGrowth =
        cur.metrics.reportedFcf.value / prev.metrics.reportedFcf.value - 1;
  }
  const last = annual.at(-1);
  const interimWindows = last
    ? revenues
        .filter(
          (f) =>
            f.start &&
            /^10-Q/.test(f.form) &&
            f.end > last.end &&
            Math.abs(day(f.start) - day(last.end) - 1) <= 7 &&
            days(f.start, f.end) >= 70 &&
            days(f.start, f.end) <= 300,
        )
        .sort((a, b) => b.end.localeCompare(a.end))
    : [];
  const window = interimWindows[0],
    interim = window ? period(ctx, "ytd", window.start!, window.end) : null;
  let ttm: FinancialPeriod | null = null,
    quarter: FinancialPeriod | null = null;
  if (last && interim) {
    const priorWindow = revenues.find(
      (f) =>
        f.start &&
        Math.abs(day(f.start) - day(last.start)) <= 7 &&
        Math.abs(days(f.start, f.end) - days(interim.start, interim.end)) <=
          7 &&
        Math.abs(days(f.end, interim.end) - 365) <= 8,
    );
    if (priorWindow)
      ttm = reconcileTtm(
        last,
        interim,
        period(ctx, "ytd", priorWindow.start!, priorWindow.end),
      );
    const direct = revenues.find(
      (f) =>
        f.start &&
        f.end === interim.end &&
        days(f.start, f.end) >= 70 &&
        days(f.start, f.end) <= 110,
    );
    if (direct) {
      quarter = period(ctx, "quarter", direct.start!, direct.end);
      if (days(interim.start, interim.end) > 110) {
        const prevWindow = revenues
          .filter(
            (f) =>
              f.start === interim.start &&
              f.end < interim.end &&
              Math.abs(day(f.end) - day(direct.start!) + 1) <= 7,
          )
          .sort((a, b) => b.end.localeCompare(a.end))[0];
        if (prevWindow) {
          const prev = period(ctx, "ytd", prevWindow.start!, prevWindow.end);
          for (const key of [
            "operatingCashFlow",
            "capex",
            "depreciation",
            "stockCompensation",
          ] as MetricKey[])
            if (
              quarter.metrics[key].value === null &&
              interim.metrics[key].sources[0]?.tag ===
                prev.metrics[key].sources[0]?.tag
            )
              quarter.metrics[key] = derived(
                [interim.metrics[key], prev.metrics[key]],
                (v) => v[0] - v[1],
                "Quarter = current YTD − preceding YTD.",
              );
          finalize(quarter);
        }
      }
    }
  }
  const recent = sub.filings.recent;
  const latestReport = recent.reportDate
    .filter(
      (r, i) =>
        typeof r === "string" &&
        validDate(r) &&
        r <= asOf &&
        typeof recent.filingDate[i] === "string" &&
        recent.filingDate[i] <= asOf &&
        typeof recent.form[i] === "string" &&
        /^10-[KQ](\/A)?$/.test(recent.form[i]),
    )
    .sort()
    .at(-1) as string | undefined;
  const balanceEnd = latestReport ?? interim?.end ?? last?.end ?? asOf,
    balance = emptyMetrics();
  for (const key of instant)
    balance[key] = pick(ctx, key, undefined, balanceEnd);
  // DEI share dates often fall after the statement date. Keep the independently reported date in provenance.
  const shareFacts = tags.periodEndShares
    .flatMap((tag) => candidates(ctx, tag, "shares"))
    .filter((f) => !f.start)
    .sort((a, b) => b.end.localeCompare(a.end));
  if (shareFacts[0])
    balance.periodEndShares = pick(
      ctx,
      "periodEndShares",
      undefined,
      shareFacts[0].end,
    );
  const warnings = [
    "Amounts and shares are in millions; period-end common shares are not fully diluted shares.",
    "History uses the latest filed comparable values available at the snapshot date; it may include restatements. Each fact retains its own filing.",
  ];
  if (!last) warnings.push("No reliable annual revenue period was found.");
  if (interim && !ttm)
    warnings.push(
      "TTM unavailable: annual and interim periods cannot be reconciled.",
    );
  if (
    last &&
    latestReport &&
    latestReport > last.end &&
    (!interim || interim.end !== latestReport)
  )
    warnings.push(
      "Latest filing is newer than the available normalized performance; valuation remains incomplete.",
    );
  const performance = ttm ?? last;
  if (performance)
    for (const key of [
      "revenue",
      "operatingIncome",
      "operatingCashFlow",
      "capex",
      "depreciation",
      "dilutedShares",
    ] as MetricKey[])
      if (performance.metrics[key].value === null)
        warnings.push(`${key}: ${performance.metrics[key].reason}`);
  if (balance.debt.value === null)
    warnings.push(`Debt: ${balance.debt.reason}`);
  return {
    ticker,
    cik,
    name: sub.name,
    fiscalYearEnd: sub.fiscalYearEnd,
    annual,
    interim,
    quarter,
    ttm,
    latestBalance: { end: balanceEnd, metrics: balance },
    retrievedAt,
    asOf,
    warnings,
  };
}
