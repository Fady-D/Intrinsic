"use client";
import { useState } from "react";
import {
  createScenarios,
  illustrativeData,
  illustrativeProvider,
} from "@/lib/data/illustrative";
import {
  applySlowdown,
  calculateDcf,
  entryPrice,
} from "@/lib/finance/dcf";
import type {
  Assumptions,
  DcfResult,
  ScenarioId,
  SlowdownPeriod,
  FinancialDataset,
  ValuationScenario,
} from "@/lib/finance/types";
import { millions, money, percent } from "@/lib/format";
import AssumptionInput from "./assumption-input";
import Charts from "./charts";
import type { RevenuePlan } from "@/lib/estimates/types";
import { stageGrowths, annualSummary } from "@/lib/estimates/forecast";
const fields: {
  key: Exclude<keyof Assumptions, "annualGrowth">;
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: "%" | "m";
  hint?: string;
}[] = [
  {
    key: "growthEarly",
    label: "Revenue growth · years 1–3",
    min: -30,
    max: 50,
  },
  {
    key: "growthMiddle",
    label: "Revenue growth · years 4–5",
    min: -30,
    max: 40,
  },
  {
    key: "growthLate",
    label: "Revenue growth · years 6–10",
    min: -20,
    max: 30,
  },
  { key: "initialMargin", label: "Year 1 operating margin", min: -50, max: 60 },
  { key: "targetMargin", label: "Year 10 operating margin", min: -50, max: 60 },
  { key: "taxRate", label: "Cash tax rate", min: 0, max: 50 },
  { key: "daRate", label: "D&A / revenue", min: 0, max: 30 },
  { key: "capexRate", label: "CapEx / revenue", min: 0, max: 40 },
  {
    key: "nwcRate",
    label: "NWC / incremental revenue",
    min: 0,
    max: 60,
    hint: "Applied to the change in revenue; contraction releases working capital.",
  },
  { key: "wacc", label: "WACC", min: 0.5, max: 25, step: 0.1 },
  {
    key: "terminalGrowth",
    label: "Terminal growth rate",
    min: -5,
    max: 8,
    step: 0.1,
  },
  {
    key: "marginOfSafety",
    label: "Margin of safety",
    min: 0,
    max: 75,
    step: 1,
  },
  {
    key: "shares",
    label: "Fully diluted shares",
    min: 1,
    max: 20000,
    step: 1,
    unit: "m",
  },
];
function evaluate(
  data: FinancialDataset,
  a: Assumptions,
): {
  result: DcfResult | null;
  error: string | null;
} {
  try {
    return { result: calculateDcf(data, a), error: null };
  } catch (e) {
    return {
      result: null,
      error: e instanceof Error ? e.message : "Unable to calculate valuation.",
    };
  }
}
function Metric({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
export default function Dashboard({
  data = illustrativeData,
  defaults = createScenarios(),
  priceLabel = "Illustrative market price",
  forecastPlan,
  blockingError,
}: {
  data?: FinancialDataset;
  defaults?: ValuationScenario[];
  priceLabel?: string;
  forecastPlan?: RevenuePlan | null;
  blockingError?: string;
}) {
  const demo = data.source.kind === "illustrative";
  const [scenarioEdits, setScenarioEdits] = useState<Record<string, Partial<Assumptions>>>({});
  const scenarios = defaults.map(s=>({...s, assumptions:{...s.assumptions,...scenarioEdits[s.id]}}));
  const [active, setActive] = useState<ScenarioId>("base");
  const [ticker, setTicker] = useState("ASTR"),
    [tickerError, setTickerError] = useState(""),
    [loading, setLoading] = useState(false);
  const [slowdown, setSlowdown] = useState(0),
    [period, setPeriod] = useState<SlowdownPeriod>("all");
  const [annualEdits, setAnnualEdits] = useState<
    Record<string, Record<string, number[]>>
  >({});
  const revision = data.company.ticker,
    annualMode = !!forecastPlan;
  const effectiveScenarios = scenarios.map((s) => {
    const annual = annualMode
      ? (annualEdits[revision]?.[s.id] ??
        defaults.find((d) => d.id === s.id)?.assumptions.annualGrowth ?? stageGrowths(s.assumptions))
      : undefined;
    return {
      ...s,
      assumptions: {
        ...s.assumptions,
        ...(annual ? annualSummary(annual) : {}),
        annualGrowth: annual,
      },
    };
  });
  const selected = effectiveScenarios.find((s) => s.id === active)!;
  const evaluateSelected = (a: Assumptions) =>
    blockingError ? { result: null, error: blockingError } : evaluate(data, a);
  const outputs = effectiveScenarios.map((s) => ({
    ...s,
    ...evaluateSelected(s.assumptions),
  }));
  const base = outputs.find((s) => s.id === "base")!.result;
  const original = evaluateSelected(selected.assumptions),
    adjusted = evaluateSelected(
      applySlowdown(selected.assumptions, slowdown, period),
    );
  const historicalComparison = forecastPlan?.mode === "consensus" && forecastPlan.historicalGrowths
    ? evaluateSelected({ ...applySlowdown(selected.assumptions, slowdown, period), annualGrowth: applySlowdown({ ...selected.assumptions, annualGrowth: forecastPlan.historicalGrowths }, slowdown, period).annualGrowth }) : null;
  const result = adjusted.result,
    error = adjusted.error;
  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await illustrativeProvider.getCompanyFinancials(ticker);
      setTickerError("");
      setTicker("ASTR");
    } catch (e) {
      setTickerError(
        e instanceof Error ? e.message : "Unable to load company.",
      );
    } finally {
      setLoading(false);
    }
  }
  function change(
    key: Exclude<keyof Assumptions, "annualGrowth">,
    value: number,
  ) {
    setScenarioEdits(prev=>({...prev,[active]:{...prev[active],[key]:value}}));
  }
  const chartScenarios = outputs
    .filter((s) => s.result)
    .map((s) => ({ name: s.label, value: s.result!.valuePerShare }));
  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand" href="#overview">
          <span className="brand-mark">i</span> intrinsic
          <span className="brand-dot">.</span>
        </a>
        <div className="nav-label">RESEARCH WORKSPACE</div>
        <nav aria-label="Main navigation">
          <a
            className="nav-active"
            href="#overview"
            aria-label="Valuation overview"
          >
            ◈ <span>Valuation overview</span>
          </a>
          <a href="#assumptions" aria-label="Model assumptions">
            ⌘ <span>Model assumptions</span>
          </a>
          <a href="#scenarios" aria-label="Scenario analysis">
            ▥ <span>Scenario analysis</span>
          </a>
          <a href="#forecast" aria-label="Financial forecast">
            ↗ <span>Financial forecast</span>
          </a>
          <a href="#financials" aria-label="Source financials">
            ▤ <span>Source financials</span>
          </a>
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> Phase 4 · Research workspace
          <p>
            Built on fundamentals.
            <br />
            Driven by your assumptions.
          </p>
          <span className="version">INTRINSIC / 0.4</span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span> DCF valuation
          </span>
          <span className="outline-badge">
            {demo ? "ILLUSTRATIVE DATA" : "SEC DATA + MODEL ESTIMATES"}
          </span>
        </header>
        <div className="content">
          <section id="overview">
            <div className="page-heading">
              <div>
                <div className="eyebrow">FUNDAMENTAL RESEARCH</div>
                <h1>A clearer view of value.</h1>
                <p>
                  Explore the assumptions behind a business’s intrinsic value.
                </p>
              </div>
              {demo && (
                <form onSubmit={search} className="ticker-form">
                  <label htmlFor="ticker">Company symbol</label>
                  <div>
                    <input
                      id="ticker"
                      value={ticker}
                      onChange={(e) => setTicker(e.target.value)}
                      maxLength={20}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button disabled={loading} type="submit">
                      {loading ? "Loading…" : "Load →"}
                    </button>
                  </div>
                </form>
              )}
            </div>
            {tickerError && (
              <div role="alert" className="alert">
                {tickerError} The dashboard below remains explicitly labeled
                Aster Systems (ASTR).
              </div>
            )}
            <div className="company-row">
              <div className="company-avatar">
                {data.company.name.slice(0, 1)}
              </div>
              <div>
                <h2>
                  {data.company.name} <span>{data.company.ticker}</span>
                </h2>
                <p>
                  {demo
                    ? "Fictional company · Enterprise software · USD"
                    : "SEC registrant · Reported USD financials · User estimates"}
                </p>
              </div>
              <span className="demo-badge">
                {demo ? "DEMO COMPANY" : "MODEL ESTIMATES"}
              </span>
              <div className="company-price">
                <strong>
                  {data.market.price > 0
                    ? money(data.market.price)
                    : "Price required"}
                </strong>
                <span>
                  {priceLabel} · {data.market.asOf}
                </span>
              </div>
            </div>
            <div className="disclosure">
              <span>ⓘ</span>
              <p>
                {demo
                  ? "All financials and prices are fictional. This model demonstrates valuation mechanics."
                  : "Source financials are SEC-reported. Valuations include user estimates for excess cash, diluted shares, claims and forecast assumptions; they are not fully verified valuations."}{" "}
                Estimated value is sensitive to assumptions and is not a
                recommendation to buy or sell.
              </p>
            </div>
            <div className="section-heading">
              <h2>Valuation at a glance</h2>
              <span>
                {demo
                  ? "Original scenarios · before slowdown"
                  : "Estimated scenarios · before slowdown"}
              </span>
            </div>
            <div className="summary-grid">
              <Metric
                label={priceLabel}
                value={
                  data.market.price > 0
                    ? money(data.market.price)
                    : "Price required"
                }
                note="USD / share"
              />
              {outputs.map((s) => (
                <Metric
                  key={s.id}
                  label={`${s.label} intrinsic value`}
                  value={
                    s.result ? money(s.result.valuePerShare) : "Invalid inputs"
                  }
                  note={
                    s.id === "base"
                      ? `${percent(s.result?.upside ?? null)} vs. reference price`
                      : `${percent(s.assumptions.wacc)} WACC`
                  }
                  accent={s.id === "base"}
                />
              ))}
            </div>
            <div className="panel entry-strip">
              <div>
                <h3>Hypothetical margin-of-safety entry prices</h3>
                <p>Based on original base-case value</p>
              </div>
              {[0.15, 0.25, 0.35, 0.5].map((m) => (
                <div key={m}>
                  <span>{percent(m)} safety</span>
                  <strong>
                    {base ? money(entryPrice(base.valuePerShare, m)) : "N/A"}
                  </strong>
                </div>
              ))}
            </div>
            <div className="summary-grid compact">
              <Metric
                label="Base enterprise value"
                value={base ? `$${millions(base.enterpriseValue)}m` : "N/A"}
              />
              <Metric
                label="Base equity value"
                value={base ? `$${millions(base.equityValue)}m` : "N/A"}
              />
              <Metric
                label="Terminal PV / enterprise value"
                value={percent(base?.terminalWeight ?? null)}
                note="Can be outside 0–100% with negative flows"
              />
              <Metric
                label="Base upside / downside"
                value={percent(base?.upside ?? null)}
                note={`Discount to estimated fair value: ${percent(base?.discountToFairValue ?? null)}`}
              />
            </div>
          </section>
          {forecastPlan && (
            <section className="panel">
              <div className="panel-heading">
                <h2>
                  Active forecast:{" "}
                  {forecastPlan.mode === "consensus"
                    ? "Analyst / supplied annual forecasts"
                    : forecastPlan.mode === "custom"
                      ? "Custom Forecast"
                      : "Historical Growth"}
                </h2>
                <span>{selected.label} scenario · before slowdown</span>
              </div>
              <p className="table-note">
                {forecastPlan.warnings.join(" ")}{" "}
                {data.fiscalForecast
                  ? `Revenue anchored to ${data.fiscalForecast.anchorEnd}; cash-flow valuation at ${data.fiscalForecast.valuationEnd}. Elapsed YTD FCFF uses actual operating components with the modeled tax rate and trade-NWC proxy; only remaining FY1 cash flow is discounted.`
                  : ""}
              </p>
              {blockingError && (
                <div role="alert" className="alert">
                  {blockingError}
                </div>
              )}
              {forecastPlan.explanation && <p className="table-note">{forecastPlan.explanation}</p>}
              {historicalComparison && <div className="table-scroll">
                <p>Growth-only sensitivity: same fiscal anchor, margins, tax, WACC, capital policy, shares and safety discount. Historical growth is the prior historical model, on this same fiscal basis. Neither forecast is necessarily more accurate.</p>
                <table><thead><tr><th>Measure</th><th>Historical Growth</th><th>Hybrid / adjusted forecast</th></tr></thead><tbody>
                {([
                  ["Year 10 revenue", historicalComparison.result?.forecast[9].revenue, result?.forecast[9].revenue],
                  ["Year 10 operating income", historicalComparison.result?.forecast[9].ebit, result?.forecast[9].ebit],
                  ["Year 10 FCFF", historicalComparison.result?.forecast[9].fcff, result?.forecast[9].fcff],
                  ["Intrinsic value / share", historicalComparison.result?.valuePerShare, result?.valuePerShare],
                  ["Safety purchase price / share", historicalComparison.result?.entryPrice, result?.entryPrice],
                ] as [string,number|undefined,number|undefined][]).map(([label,h,v])=><tr key={label}><th>{label}</th><td>{millions(h??null)}</td><td>{millions(v??null)}</td></tr>)}
                </tbody></table>
                <p>{historicalComparison.error ?? (historicalComparison.result && result ? `Intrinsic-value difference ${(result.valuePerShare-historicalComparison.result.valuePerShare).toFixed(2)} per share follows only from the revenue paths and their associated reinvestment requirements.` : "Comparison unavailable until both projections can be valued.")}</p>
              </div>}
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{forecastPlan.mode==="historical"?"Rolling year end":"Fiscal year end"}</th>
                      <th>Revenue (USD m)</th>
                      <th>Growth (%)</th>
                      <th>Forecast source</th>
                      <th>Reference range / analysts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastPlan.rows.map((row, i) => {
                      const current =
                          selected.assumptions.annualGrowth ??
                          stageGrowths(selected.assumptions),
                        baseline =
                          defaults.find((s) => s.id === active)?.assumptions
                            .annualGrowth ??
                          stageGrowths(
                            defaults.find((s) => s.id === active)!.assumptions,
                          );
                      const edited = current
                        .slice(0, i + 1)
                        .some((g, j) => g !== baseline[j]);
                      const est = row.estimate;
                      return (
                        <tr key={i}>
                          <th>{row.fiscalEnd}</th>
                          <td>
                            {original.result
                              ? millions(original.result.forecast[i].revenue)
                              : "Unavailable · see baseline above"}
                          </td>
                          <td>
                            {annualMode ? (
                              <input
                                aria-label={`${selected.label} FY${i + 1} annual growth`}
                                className="annual-growth-input"
                                type="number"
                                step="any"
                                value={
                                  Number.isFinite(current[i])
                                    ? Number((current[i] * 100).toFixed(5))
                                    : ""
                                }
                                onChange={(e) => {
                                  const next = [...current];
                                  next[i] =
                                    e.target.value === ""
                                      ? NaN
                                      : Number(e.target.value) / 100;
                                  setAnnualEdits((prev) => ({
                                    ...prev,
                                    [revision]: {
                                      ...prev[revision],
                                      [active]: next,
                                    },
                                  }));
                                }}
                              />
                            ) : (
                              percent(current[i])
                            )}
                          </td>
                          <td>
                            {edited
                              ? "Manually overridden (including upstream growth)"
                              : active !== "base" && annualMode
                                ? "Scenario model adjustment"
                                : row.source}
                            {est && (
                              <small className="estimate-reference">
                                {est.source} · retrieved {est.retrievedAt}
                                {est.note ? ` · ${est.note}` : ""}
                                {est.ebit !== null
                                  ? ` · reference EBIT ${millions(est.ebit)}m (unused)`
                                  : ""}
                              </small>
                            )}
                          </td>
                          <td>
                            {est
                              ? `${est.low === null ? "N/A" : millions(est.low)} – ${est.high === null ? "N/A" : millions(est.high)} / ${est.analysts ?? "N/A"}`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <section id="scenarios">
            <div className="section-heading">
              <h2>Three perspectives. One framework.</h2>
              <span>Each scenario is independently editable</span>
            </div>
            {!demo && (
              <p className="table-note">
                Conservative bear–base estimate range:{" "}
                {outputs[0].result
                  ? money(outputs[0].result.valuePerShare)
                  : "Unavailable"}{" "}
                to {base ? money(base.valuePerShare) : "Unavailable"}. Bull
                values reflect a more favorable scenario, not a purchase
                recommendation.
              </p>
            )}
            <div className="scenario-grid">
              {outputs.map((s) => (
                <button
                  key={s.id}
                  className={`scenario-card ${active === s.id ? "selected" : ""}`}
                  onClick={() => setActive(s.id)}
                  aria-pressed={active === s.id}
                >
                  <div className="scenario-title">
                    <span className={`scenario-dot ${s.id}`} />
                    {s.label} case
                    <span>{active === s.id ? "EDITING" : "EDIT →"}</span>
                  </div>
                  <strong>
                    {s.result
                      ? money(s.result.valuePerShare)
                      : "Invalid inputs"}
                  </strong>
                  <span className="scenario-upside">
                    {s.error ??
                      `${percent(s.result?.upside ?? null)} implied upside / downside`}
                  </span>
                  <dl>
                    <div>
                      <dt>
                        {annualMode
                          ? "Mean growth · 1–3 / 4–5 / 6–10"
                          : "Growth · 1–3 / 4–5 / 6–10"}
                      </dt>
                      <dd>
                        {[
                          s.assumptions.growthEarly,
                          s.assumptions.growthMiddle,
                          s.assumptions.growthLate,
                        ]
                          .map(percent)
                          .join(" / ")}
                      </dd>
                    </div>
                    <div>
                      <dt>Terminal margin / WACC</dt>
                      <dd>
                        {percent(s.assumptions.targetMargin)} /{" "}
                        {percent(s.assumptions.wacc)}
                      </dd>
                    </div>
                    <div>
                      <dt>Enterprise value</dt>
                      <dd>
                        {s.result
                          ? `$${millions(s.result.enterpriseValue)}m`
                          : "N/A"}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        {percent(s.assumptions.marginOfSafety)} safety entry
                      </dt>
                      <dd>{s.result ? money(s.result.entryPrice) : "N/A"}</dd>
                    </div>
                  </dl>
                </button>
              ))}
            </div>
          </section>
          <div className="model-layout">
            <section className="panel assumptions-panel" id="assumptions">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">
                    {demo ? "MODEL INPUTS" : "AUTOMATIC BASELINE · EDITABLE"}
                  </div>
                  <h2>{selected.label} case assumptions</h2>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setScenarioEdits(prev=>({...prev,[active]:{}}));
                    setAnnualEdits((prev) => ({
                      ...prev,
                      [revision]: {
                        ...prev[revision],
                        [active]:
                          defaults.find((s) => s.id === active)?.assumptions
                            .annualGrowth ?? stageGrowths(defaults.find(s=>s.id===active)!.assumptions),
                      },
                    }));
                    setSlowdown(0);
                  }}
                >
                  Reset case ↺
                </button>
              </div>
              <div className="segmented" aria-label="Edit scenario">
                {scenarios.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActive(s.id)}
                    aria-pressed={active === s.id}
                    className={active === s.id ? "active" : ""}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {fields
                .filter(
                  (f) =>
                    !annualMode ||
                    !["growthEarly", "growthMiddle", "growthLate"].includes(
                      f.key,
                    ),
                )
                .map(({ key, ...field }) => (
                  <AssumptionInput
                    key={`${active}-${key}`}
                    {...field}
                    hint={
                      !demo &&
                      selected.assumptions[key] !==
                        defaults.find((s) => s.id === active)?.assumptions[key]
                        ? `${field.hint ?? ""} Manual override of automatic baseline.`
                        : field.hint
                    }
                    value={selected.assumptions[key]}
                    onChange={(v) => change(key, v)}
                  />
                ))}
              <button
                className="reset-all"
                onClick={() => {
                  setScenarioEdits({});
                  setAnnualEdits({});
                  setSlowdown(0);
                  setPeriod("all");
                }}
              >
                {demo
                  ? "Reset all scenarios to defaults"
                  : "Reset scenarios to automatic baseline"}
              </button>
            </section>
            <div className="model-results">
              <section className="panel simulator">
                <div className="panel-heading">
                  <div>
                    <div className="eyebrow">SENSITIVITY LAB</div>
                    <h2>What if growth slows?</h2>
                  </div>
                  <span className="outline-badge">
                    {selected.label.toUpperCase()} CASE
                  </span>
                </div>
                <p>
                  Reduce the selected growth assumptions and trace the effect
                  through the full DCF.
                </p>
                <div className="slowdown-controls">
                  <AssumptionInput
                    label="Growth reduction"
                    value={slowdown}
                    onChange={(v) => setSlowdown(Math.min(1, Math.max(0, v)))}
                    min={0}
                    max={100}
                    step={1}
                  />
                  <label className="select-label">
                    Apply slowdown to
                    <select
                      value={period}
                      onChange={(e) =>
                        setPeriod(e.target.value as SlowdownPeriod)
                      }
                    >
                      <option value="all">Entire forecast</option>
                      <option value="early">Years 1–3</option>
                      <option value="middle">Years 4–5</option>
                      <option value="late">Years 6–10</option>
                    </select>
                  </label>
                </div>
                <div className="growth-comparison">
                  Adjusted growth (1–3 / 4–5 / 6–10):{" "}
                  <strong>
                    {[
                      applySlowdown(selected.assumptions, slowdown, period)
                        .growthEarly,
                      applySlowdown(selected.assumptions, slowdown, period)
                        .growthMiddle,
                      applySlowdown(selected.assumptions, slowdown, period)
                        .growthLate,
                    ]
                      .map(percent)
                      .join(" / ")}
                  </strong>
                </div>
                <div className="comparison">
                  <Metric
                    label="Original intrinsic value"
                    value={
                      original.result
                        ? money(original.result.valuePerShare)
                        : "N/A"
                    }
                  />
                  <span>→</span>
                  <Metric
                    label="Adjusted intrinsic value"
                    value={result ? money(result.valuePerShare) : "N/A"}
                    accent
                  />
                  <Metric
                    label="Change per share"
                    value={
                      result && original.result
                        ? money(
                            result.valuePerShare -
                              original.result.valuePerShare,
                          )
                        : "N/A"
                    }
                  />
                </div>
                <small>
                  Slowdown is a temporary overlay. Negative growth multiplied by
                  a reduction factor becomes less negative.
                </small>
              </section>
              {error && (
                <div role="alert" className="alert">
                  {error} Correct the {selected.label.toLowerCase()} assumptions
                  to restore the forecast.
                </div>
              )}
              {result && (
                <>
                  <div className="section-heading">
                    <h2>{selected.label} case outlook</h2>
                    <span>{percent(slowdown)} growth slowdown applied</span>
                  </div>
                  <Charts
                    data={data}
                    result={result}
                    scenarios={chartScenarios}
                    growthSources={forecastPlan?.rows.map((r,i)=> {
                      const defaultsGrowth=defaults.find(s=>s.id===active)?.assumptions.annualGrowth ?? stageGrowths(defaults.find(s=>s.id===active)!.assumptions);
                      const edited=(selected.assumptions.annualGrowth?.[i]??defaultsGrowth[i])!==defaultsGrowth[i] || result.forecast[i].growth!==(selected.assumptions.annualGrowth?.[i]??stageGrowths(selected.assumptions)[i]);
                      return edited || forecastPlan.mode==="custom" || r.estimate?.source==="User-provided" ? "manual" : active!=="base" ? "modeled" : r.estimate ? "consensus" : "modeled";
                    })}
                  />
                  <section className="panel bridge">
                    <div className="panel-heading">
                      <h3>From cash flows to shareholder value</h3>
                      <span>{selected.label} · adjusted model · USD m</span>
                    </div>
                    <dl>
                      {(
                        [
                          ["PV of years 1–10 FCFF", result.pvForecast],
                          ["Year 11 FCFF", result.terminalYear.fcff],
                          ["Terminal value at year 10", result.terminalValue],
                          ["PV of terminal value", result.pvTerminalValue],
                          ["Enterprise value", result.enterpriseValue],
                          ["+ Excess cash", result.excessCash],
                          ["− Debt", result.debt],
                          ["− Other non-equity claims", result.otherClaims],
                          ["Equity value", result.equityValue],
                          [
                            "Fully diluted shares (m)",
                            selected.assumptions.shares,
                          ],
                        ] as [string, number][]
                      ).map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{millions(value)}</dd>
                        </div>
                      ))}
                      <div className="bridge-total">
                        <dt>Intrinsic value / share</dt>
                        <dd>{money(result.valuePerShare)}</dd>
                      </div>
                      <div>
                        <dt>
                          {percent(selected.assumptions.marginOfSafety)} safety
                          entry / share
                        </dt>
                        <dd>{money(result.entryPrice)}</dd>
                      </div>
                      <div>
                        <dt>Upside / downside to reference price</dt>
                        <dd>{percent(result.upside)}</dd>
                      </div>
                      <div>
                        <dt>Terminal PV / enterprise value</dt>
                        <dd>{percent(result.terminalWeight)}</dd>
                      </div>
                    </dl>
                  </section>
                </>
              )}
            </div>
          </div>
          <section id="forecast" className="panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">CASH FLOW MODEL</div>
                <h2>Ten-year financial forecast</h2>
              </div>
              <span>{selected.label} · slowdown adjusted · USD m</span>
            </div>
            {result ? (
              <div className="table-scroll">
                <table>
                  <caption>
                    Projected financials, separated from historical statements.
                    Year 11 supports terminal value.
                  </caption>
                  <thead>
                    <tr>
                      <th>Fiscal year</th>
                      {[...result.forecast, result.terminalYear].map((r) => (
                        <th key={r.year}>
                          {r.year}
                          {r.period === 11 ? " (TV)" : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["Revenue growth", "growth", "pct"],
                        ["Revenue", "revenue"],
                        ["Operating margin", "margin", "pct"],
                        ["EBIT", "ebit"],
                        ["Cash taxes", "cashTaxes"],
                        ["NOPAT", "nopat"],
                        ["+ D&A", "depreciation"],
                        ["− Capital expenditures", "capex"],
                        ["− Change in NWC", "changeInNwc"],
                        ["Full-year FCFF", "fcff"],
                        ...(data.fiscalForecast
                          ? [
                              ["Elapsed YTD FCFF deduction", "elapsedFcff"],
                              ["Remaining FCFF discounted", "remainingFcff"],
                            ]
                          : []),
                        ["Discount factor", "discountFactor", "factor"],
                        ["PV of FCFF", "presentValue"],
                      ] as [string, keyof DcfResult["terminalYear"], string?][]
                    ).map(([label, key, format]) => (
                      <tr key={key}>
                        <th>{label}</th>
                        {[...result.forecast, result.terminalYear].map((r) => (
                          <td key={r.year}>
                            {format === "pct"
                              ? percent(r[key] as number)
                              : format === "factor"
                                ? (r[key] as number).toFixed(4)
                                : millions(r[key] as number)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">
                Forecast unavailable until the selected scenario inputs are
                valid.
              </p>
            )}
            <p className="table-note">
              Year 11 FCFF determines terminal value and is not added to years
              1–10 cash flows. Its PV is shown for reference only.
            </p>
          </section>
          {demo && (
            <section id="financials" className="panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">SOURCE DATA</div>
                  <h2>Historical financials</h2>
                </div>
                <span>Fictional · USD m · fiscal year end</span>
              </div>
              <div className="table-scroll">
                <table>
                  <caption>
                    Aster Systems illustrative source statements. All figures
                    are fabricated for this demonstration.
                  </caption>
                  <thead>
                    <tr>
                      <th>Fiscal year</th>
                      {illustrativeData.incomeStatements.map((r) => (
                        <th key={r.year}>{r.year}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        label: "Revenue",
                        values: illustrativeData.incomeStatements.map(
                          (r) => r.revenue,
                        ),
                      },
                      {
                        label: "EBIT",
                        values: illustrativeData.incomeStatements.map(
                          (r) => r.ebit,
                        ),
                      },
                      {
                        label: "Cash taxes",
                        values: illustrativeData.incomeStatements.map(
                          (r) => r.cashTaxes,
                        ),
                      },
                      {
                        label: "D&A",
                        values: illustrativeData.cashFlows.map(
                          (r) => r.depreciation,
                        ),
                      },
                      {
                        label: "Capital expenditures",
                        values: illustrativeData.cashFlows.map((r) => r.capex),
                      },
                      {
                        label: "Change in NWC",
                        values: illustrativeData.cashFlows.map(
                          (r) => r.changeInNwc,
                        ),
                      },
                      {
                        label: "Net working capital",
                        values: illustrativeData.balanceSheets.map(
                          (r) => r.netWorkingCapital,
                        ),
                      },
                      {
                        label: "Excess cash",
                        values: illustrativeData.balanceSheets.map(
                          (r) => r.excessCash,
                        ),
                      },
                      {
                        label: "Debt",
                        values: illustrativeData.balanceSheets.map(
                          (r) => r.debt,
                        ),
                      },
                      {
                        label: "Other non-equity claims",
                        values: illustrativeData.balanceSheets.map(
                          (r) => r.otherClaims,
                        ),
                      },
                    ].map((row) => (
                      <tr key={row.label}>
                        <th>{row.label}</th>
                        {row.values.map((v, i) => (
                          <td key={i}>{millions(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="table-note">
                Source: {illustrativeData.source.name} · As of{" "}
                {illustrativeData.source.asOf}. {illustrativeData.source.note}
              </p>
            </section>
          )}
          <section className="methodology">
            <h3>Understand the model</h3>
            <p>
              FCFF = EBIT − cash taxes + D&A − CapEx − change in NWC. Cash taxes
              equal EBIT × tax rate, following the specified FCFF = EBIT × (1 −
              tax rate) + D&A − CapEx − change in NWC formula. Negative EBIT
              therefore assumes an immediate tax benefit; realizability must be
              assessed separately. Year-end FCFF is discounted at WACC. Margins
              move linearly from year 1 to year 10. NWC investment is a fixed
              share of incremental revenue. Year 11 uses terminal growth, target
              margin and the same reinvestment ratios.
            </p>
            <p>
              Terminal value = year 11 FCFF / (WACC − terminal growth).
              Enterprise value includes the present value of forecast FCFF and
              terminal value. Equity adds excess cash and subtracts debt and
              other claims. Diluted shares remain constant. Negative flows and
              equity values are preserved; a negative safety entry price is an
              arithmetic output, not an executable purchase target. Terminal
              value share can fall outside 0–100% with negative cash flows.
            </p>
            <p>
              A modeled value above price alone does not establish an investment
              opportunity. Phase 1 excludes tax-loss carryforwards, changing
              share counts, and company-specific capital efficiency constraints.
            </p>
          </section>
          <footer>
            <span className="brand-small">intrinsic.</span>
            <span>Transparent assumptions. Thoughtful research.</span>
            <a href="#overview">Back to top ↑</a>
          </footer>
        </div>
      </main>
    </div>
  );
}
