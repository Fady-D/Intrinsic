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
  depreciation: ["DepreciationDepletionAndAmortization"],
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
// IFRS concepts stay in their own taxonomy and reporting currency. Broad financial-asset
// or pretax-profit concepts are deliberately not treated as short-term investments or EBIT.
export const ifrsTags: Record<MetricKey, string[]> = {
  revenue: ["Revenue", "RevenueFromContractsWithCustomers"],
  operatingIncome: ["ProfitLossFromOperatingActivities"],
  netIncome: ["ProfitLoss"],
  operatingCashFlow: ["CashFlowsFromUsedInOperatingActivities"],
  capex: [
    "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
    "PurchaseOfPropertyPlantAndEquipment",
  ],
  depreciation: [
    "DepreciationDepletionAndAmortisation",
    "DepreciationAndAmortisationExpense",
  ],
  stockCompensation: ["SharebasedPaymentArrangementExpense"],
  dilutedShares: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  cash: ["CashAndCashEquivalents"],
  shortInvestments: [],
  debt: ["CurrentBorrowings", "NoncurrentBorrowings"],
  periodEndShares: ["NumberOfSharesOutstanding"],
  reportedFcf: [],
};
const annualForm = /^(10-K|20-F|40-F)(\/A)?$/;
const financialForm = /^(10-[KQ]|20-F|40-F|6-K)(\/A)?$/;
function splitTag(tag: string): [string, string] {
  if (tag.includes(":")) return tag.split(":") as [string, string];
  return [
    tag === "EntityCommonStockSharesOutstanding" ? "dei" : "us-gaap",
    tag,
  ];
}
function metricTags(ctx: Context, key: MetricKey): string[] {
  if (ctx.taxonomy === "ifrs-full" && key === "periodEndShares")
    return [
      "EntityCommonStockSharesOutstanding",
      ...ifrsTags[key].map((t) => "ifrs-full:" + t),
    ];
  return ctx.taxonomy === "ifrs-full"
    ? ifrsTags[key].map((tag) => "ifrs-full:" + tag)
    : tags[key];
}
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
    typeof r.entityName !== "string" ||
    !r.facts ||
    typeof r.facts !== "object" ||
    (!r.facts["us-gaap"] && !r.facts["ifrs-full"])
  )
    throw new Error(
      "SEC company facts lack identity or supported US-GAAP/IFRS concepts.",
    );
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
  currency: string;
  taxonomy: "us-gaap" | "ifrs-full";
}
function candidates(ctx: Context, tag: string, unit: string): SecFact[] {
  const [namespace, concept] = splitTag(tag);
  const list = ctx.facts.facts[namespace]?.[concept]?.units?.[unit];
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
      financialForm.test(f.form),
  );
}
function getTag(
  ctx: Context,
  tag: string,
  start: string | undefined,
  end: string,
  unit: string,
): Metric {
  unit = unit === "USD" ? ctx.currency : unit;
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
      "ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
      "ifrs-full:PurchaseOfPropertyPlantAndEquipment",
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
  const [namespace, concept] = splitTag(tag);
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
        tag: `${namespace}:${concept}`,
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
  for (const tag of metricTags(ctx, key)) {
    const m = getTag(ctx, tag, instant.has(key) ? undefined : start, end, unit);
    if (m.value !== null) return m;
    if (m.reason?.startsWith("Conflicting")) return m;
  }
  if (ctx.taxonomy === "us-gaap" && key === "depreciation") {
    let dep = getTag(ctx, "Depreciation", start, end, "USD");
    if (dep.value === null)
      dep = getTag(
        ctx,
        "DepreciationDepletionAndAmortizationPropertyPlantAndEquipment",
        start,
        end,
        "USD",
      );
    const amort = getTag(
      ctx,
      "AmortizationOfIntangibleAssets",
      start,
      end,
      "USD",
    );
    if (
      dep.value !== null &&
      amort.value !== null &&
      dep.sources[0].accession === amort.sources[0].accession
    )
      return derived(
        [dep, amort],
        (v) => v[0] + v[1],
        "D&A = separately reported depreciation/PPE depreciation and amortization + intangible amortization from the same filing; no combined total added.",
      );
  }
  if (ctx.taxonomy === "us-gaap" && key === "operatingCashFlow") {
    const continuing = getTag(
        ctx,
        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
        start,
        end,
        "USD",
      ),
      discontinued = getTag(
        ctx,
        "NetCashProvidedByUsedInOperatingActivitiesDiscontinuedOperations",
        start,
        end,
        "USD",
      );
    if (
      continuing.value !== null &&
      discontinued.value !== null &&
      continuing.sources[0].accession === discontinued.sources[0].accession
    )
      return derived(
        [continuing, discontinued],
        (v) => v[0] + v[1],
        "Total operating cash flow = explicitly reported continuing + discontinued components from the same filing.",
      );
  }
  return missing(
    `No reliable ${key} fact for this reporting period in ${ctx.currency} / ${ctx.taxonomy}.`,
  );
}
function debt(ctx: Context, end: string): Metric {
  if (ctx.taxonomy === "ifrs-full") {
    const current = getTag(
        ctx,
        "ifrs-full:CurrentBorrowings",
        undefined,
        end,
        "USD",
      ),
      noncurrent = getTag(
        ctx,
        "ifrs-full:NoncurrentBorrowings",
        undefined,
        end,
        "USD",
      );
    if (current.sources[0]?.accession !== noncurrent.sources[0]?.accession)
      return missing("IFRS borrowing components do not share a filing.");
    return derived(
      [current, noncurrent],
      (v) => v[0] + v[1],
      "IFRS current + noncurrent borrowings. Confirm lease and other debt coverage before modeling.",
    );
  }
  // Total includes finance leases; never add its component debt or leases again.
  let aggregate = getTag(
    ctx,
    "LongTermDebtAndFinanceLeaseObligationsIncludingCurrentPortion",
    undefined,
    end,
    "USD",
  );
  if (aggregate.value === null)
    aggregate = getTag(
      ctx,
      "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentPortion",
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
  // Choose one taxonomy and one currency from the latest annual revenue disclosures.
  const bases: {
    taxonomy: "us-gaap" | "ifrs-full";
    currency: string;
    end: string;
  }[] = [];
  for (const taxonomy of ["us-gaap", "ifrs-full"] as const) {
    const context: Context = {
      facts,
      asOf,
      retrievedAt,
      cik,
      taxonomy,
      currency: "USD",
    };
    for (const tag of metricTags(context, "revenue")) {
      const [ns, concept] = splitTag(tag);
      for (const unit of Object.keys(facts.facts[ns]?.[concept]?.units ?? {}))
        if (/^[A-Z]{3}$/.test(unit))
          for (const f of candidates(context, tag, unit))
            if (
              f.start &&
              days(f.start, f.end) >= 350 &&
              days(f.start, f.end) <= 380 &&
              annualForm.test(f.form)
            )
              bases.push({ taxonomy, currency: unit, end: f.end });
    }
  }
  bases.sort(
    (a, b) =>
      b.end.localeCompare(a.end) ||
      (a.taxonomy === "us-gaap" ? 0 : 1) - (b.taxonomy === "us-gaap" ? 0 : 1),
  );
  const basis = bases[0],
    taxonomy =
      basis?.taxonomy ?? (facts.facts["us-gaap"] ? "us-gaap" : "ifrs-full");
  const currencies = new Set(
    bases
      .filter((b) => b.end === basis?.end && b.taxonomy === taxonomy)
      .map((b) => b.currency),
  );
  const currency = currencies.size === 1 ? [...currencies][0] : null;
  const ctx: Context = {
    facts,
    asOf,
    retrievedAt,
    cik,
    taxonomy,
    currency: currency ?? "UNRESOLVED",
  };
  const revenues = metricTags(ctx, "revenue").flatMap((tag) =>
    candidates(ctx, tag, ctx.currency),
  );
  const annualWindows = [
    ...new Map(
      revenues
        .filter(
          (f) =>
            f.start &&
            days(f.start, f.end) >= 350 &&
            days(f.start, f.end) <= 380 &&
            annualForm.test(f.form),
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
            /^(10-Q|6-K)(\/A)?$/.test(f.form) &&
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
        financialForm.test(recent.form[i]),
    )
    .sort()
    .at(-1) as string | undefined;
  const balanceEnd = latestReport ?? interim?.end ?? last?.end ?? asOf,
    balance = emptyMetrics();
  for (const key of instant)
    balance[key] = pick(ctx, key, undefined, balanceEnd);
  // DEI share dates often fall after the statement date. Keep the independently reported date in provenance.
  const shareFacts = [
    ...metricTags(ctx, "periodEndShares"),
    "EntityCommonStockSharesOutstanding",
  ]
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
    `Amounts are in millions of ${currency ?? "undetermined currency"}; shares are in millions. Period-end common shares are not fully diluted shares.`,
    "History uses the latest filed comparable values available at the snapshot date; it may include restatements. Each fact retains its own filing.",
  ];
  if (!currency)
    warnings.push(
      "Reporting currency could not be determined uniquely from annual revenue. No currencies were mixed.",
    );
  if (annual.length < 10)
    warnings.push(
      `Limited historical coverage: ${annual.length} reliable annual periods available, versus a target of ten.`,
    );
  if (taxonomy === "ifrs-full")
    warnings.push(
      "IFRS concepts are normalized separately from US-GAAP; missing concepts and differing interest/lease policies require review.",
    );
  if (![...new Set(bases.map((b) => b.taxonomy))].every((t) => t === taxonomy))
    warnings.push(
      "Historical taxonomy changed; only the selected reporting basis is normalized.",
    );
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
    currency,
    currencyCandidates: [...currencies].sort(),
    taxonomy,
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
