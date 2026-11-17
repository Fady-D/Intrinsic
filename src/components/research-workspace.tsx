"use client";
import { useReducer, useRef, useState } from "react";
import Dashboard from "./dashboard";
import TickerSearch from "./ticker-search";
import SecurityStatus from "./security-status";
import type { SecurityIdentity } from "@/lib/securities/symbols";
import FinancialSources from "./financial-sources";
import {
  referencePrice,
  initialLoadState,
  initializeInputs,
  initializeScenarios,
  initializationIssues,
  researchReducer,
  toDcfDataset,
  type ModelInputs,
} from "@/lib/data/research";
import type { FinancialDataset, ValuationScenario } from "@/lib/finance/types";
import type { VerifiedFinancials } from "@/lib/sec/types";
import type { QuoteResult } from "@/lib/market/quotes";
import { millions, money, percent } from "@/lib/format";
const numberFields = [
  ["excessCash", "Excess cash available to equity (USD m)"],
  ["debt", "Total financial debt (USD m)"],
  ["otherClaims", "Other non-equity claims (USD m)"],
  ["shares", "Fully diluted share estimate (m)"],
  ["depreciationRate", "D&A / revenue (%)"],
] as const;
export default function ResearchWorkspace() {
  const [state, dispatch] = useReducer(researchReducer, initialLoadState),
    requestId = useRef(0);
  const [ticker, setTicker] = useState("MSFT"),
    [demo, setDemo] = useState(false),
    [inputs, setInputs] = useState<ModelInputs | null>(null),
    [model, setModel] = useState<FinancialDataset | null>(null),
    [defaults, setDefaults] = useState<ValuationScenario[]>([]),
    [generation, setGeneration] = useState(0),
    [quote, setQuote] = useState<QuoteResult>({ quote: null, warning: null }),
    [manualPrice, setManualPrice] = useState(""),
    [priceError, setPriceError] = useState("");
  const controller = useRef<AbortController | null>(null);
  async function load(force = false, query = ticker) {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const id = ++requestId.current;
    let symbol = query.trim();
    setDemo(false);
    setModel(null);
    setInputs(null);
    setDefaults([]);
    setQuote({ quote: null, warning: null });
    setManualPrice("");
    setPriceError("");
    dispatch({ type: "start", id, ticker: symbol });
    try {
      const resolution = await fetch(
        `/api/tickers?resolve=${encodeURIComponent(symbol)}`,
        { signal: abort.signal },
      );
      const resolved = await resolution.json();
      if (!resolution.ok)
        throw new Error(resolved.error ?? "Ticker could not be resolved.");
      if (id !== requestId.current) return;
      const identity = resolved.identity as SecurityIdentity;
      symbol = identity.ticker;
      setTicker(symbol);
      dispatch({ type: "start", id, ticker: symbol });
      const response = await fetch(
        `/api/financials?ticker=${encodeURIComponent(symbol)}${force ? "&refresh=1" : ""}`,
        { signal: abort.signal },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Financial retrieval failed.");
      const data = payload as VerifiedFinancials;
      if (id !== requestId.current) return;
      if (data.ticker !== symbol)
        throw new Error("Financial response ticker mismatch.");
      dispatch({ type: "success", id, data });
      setInputs(initializeInputs(data));
      setDefaults(initializeScenarios(data));
      if (data.eligibility?.eligible === false) return;
      try {
        const qr = await fetch(
          `/api/quote?ticker=${encodeURIComponent(symbol)}${force ? "&refresh=1" : ""}`,
          { signal: abort.signal },
        );
        const result = await qr.json();
        if (id === requestId.current)
          setQuote(
            qr.ok
              ? result
              : {
                  quote: null,
                  warning: "Quote unavailable. Enter a manual price.",
                },
          );
      } catch {
        if (id === requestId.current)
          setQuote({
            quote: null,
            warning: "Quote request failed. Enter a manual price.",
          });
      }
    } catch (e) {
      if (id === requestId.current && !abort.signal.aborted)
        dispatch({
          type: "failure",
          id,
          error:
            e instanceof Error ? e.message : "Unable to load SEC financials.",
        });
    }
  }
  const price = referencePrice(manualPrice, quote.quote);
  const priceLabel =
    manualPrice.trim() !== ""
      ? "Manual / hypothetical price"
      : quote.quote
        ? `${quote.quote.timing} · ${quote.quote.source}`
        : "Market price unavailable";
  const issues =
    state.data && inputs ? initializationIssues(state.data, inputs) : [];
  function initialize() {
    if (!state.data || !inputs) return;
    const dataset = toDcfDataset(state.data, inputs, price);
    if (!dataset) return;
    setModel(dataset);
    setDefaults(
      initializeScenarios(state.data).map((s) => ({
        ...s,
        assumptions: {
          ...s.assumptions,
          shares: inputs.shares!,
          daRate: inputs.depreciationRate!,
        },
      })),
    );
    setGeneration((v) => v + 1);
  }
  function selectDemo() {
    controller.current?.abort();
    requestId.current++;
    setDemo(true);
    setModel(null);
    setInputs(null);
    dispatch({ type: "start", id: requestId.current, ticker: "ASTR" });
  }
  return (
    <>
      <div
        className={`research-container ${model || demo ? "with-model" : ""}`}
      >
        <section className="panel research-search">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">INTRINSIC · PHASE 3</div>
              <h1>Research from the source.</h1>
              <p className="table-note">
                Actual SEC financials. Explicit model estimates. No fictional
                fallback.
              </p>
            </div>
            <a
              href="https://www.sec.gov/search-filings/edgar-application-programming-interfaces"
              target="_blank"
              rel="noreferrer"
            >
              SEC API documentation ↗
            </a>
          </div>
          <form
            className="research-search-form"
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
          >
            <TickerSearch
              query={ticker}
              onChange={setTicker}
              onSelect={(identity) => {
                setTicker(identity.ticker);
                void load(false, identity.ticker);
              }}
            />
            <button type="submit">
              {state.status === "loading" ? "Loading…" : "Load financials →"}
            </button>
            <button
              type="button"
              disabled={
                state.status === "loading" ||
                !state.data ||
                state.data.ticker !== ticker.trim().toUpperCase()
              }
              onClick={() => void load(true)}
            >
              Refresh financial data
            </button>
            <button type="button" onClick={selectDemo}>
              Open fictional ASTR demo
            </button>
          </form>
          <p className="table-note" role="status">
            {demo
              ? "Fictional demo selected. No SEC data shown as demo."
              : state.status === "loading"
                ? `Retrieving ${state.ticker}: SEC identity, submissions and Company Facts…`
                : state.data
                  ? `${state.data.ticker} loaded · latest reporting date ${state.data.latestBalance.end} · retrieved ${state.data.retrievedAt}`
                  : "Search the SEC directory by company name or ticker. Coverage varies by issuer, security type and reporting currency."}
          </p>
          {!demo &&
            state.error &&
            ticker.trim().toUpperCase() ===
              state.ticker.trim().toUpperCase() && (
              <div className="alert" role="alert">
                {state.error}
              </div>
            )}
        </section>
        {!demo && state.data && inputs && (
          <>
            <SecurityStatus data={state.data} />
            {state.data.annual.length > 0 && (
              <FinancialSources data={state.data} />
            )}
            {state.data.eligibility?.eligible !== false && (
              <>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <div className="eyebrow">MARKET PRICE · USD / SHARE</div>
                      <h2>Set a reference price</h2>
                    </div>
                    <span>
                      {quote.quote
                        ? `${quote.quote.timing} · as of ${quote.quote.asOf}`
                        : "Manual price mode"}
                    </span>
                  </div>
                  <p className="table-note">
                    {quote.warning ?? "Retrieving optional quote…"}{" "}
                    {quote.quote &&
                      `Provider quote: ${money(quote.quote.price)} · retrieved ${quote.quote.retrievedAt}.`}
                  </p>
                  <label className="manual-field">
                    Manual price override (optional)
                    <input
                      aria-label="Manual price override"
                      type="number"
                      min="0.01"
                      step="any"
                      value={manualPrice}
                      placeholder="Enter USD / share"
                      onChange={(e) => {
                        setManualPrice(e.target.value);
                        setPriceError(
                          e.target.value !== "" &&
                            (!Number.isFinite(Number(e.target.value)) ||
                              Number(e.target.value) <= 0)
                            ? "Manual price must be greater than zero."
                            : "",
                        );
                      }}
                    />
                  </label>
                  {priceError && <p role="alert">{priceError}</p>}
                  <p className="table-note">
                    Active reference:{" "}
                    {price === null
                      ? "unavailable; upside/downside is not calculated"
                      : `${money(price)} · ${priceLabel}`}
                    . Clearing the override restores an available non-stale
                    provider quote. A stale quote is displayed for reference and
                    never used automatically.
                  </p>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <div className="eyebrow">
                        MODEL INITIALIZATION · ESTIMATES REQUIRE REVIEW
                      </div>
                      <h2>Complete the valuation inputs</h2>
                    </div>
                    <span>
                      {state.data.ttm ? "TTM" : "Annual"} performance anchor
                      <br />
                      {(state.data.ttm ?? state.data.annual.at(-1))?.end ??
                        "Unavailable"}
                    </span>
                  </div>
                  <p className="table-note">
                    Reported cash is not necessarily excess cash. Period-end
                    common shares and diluted weighted-average shares do not
                    establish a current fully diluted share count. Review the
                    source table and supply justified estimates. Enter zero
                    explicitly only when supported by your analysis.
                  </p>
                  <div className="manual-grid">
                    {numberFields.map(([key, label]) => (
                      <label className="manual-field" key={key}>
                        {label}
                        <input
                          type="number"
                          aria-label={label}
                          min={0}
                          step="any"
                          value={
                            inputs[key] === null
                              ? ""
                              : key === "depreciationRate"
                                ? Number((inputs[key]! * 100).toFixed(4))
                                : inputs[key]!
                          }
                          onChange={(e) => {
                            const value =
                              e.target.value === ""
                                ? null
                                : Number(e.target.value) /
                                  (key === "depreciationRate" ? 100 : 1);
                            setInputs({ ...inputs, [key]: value });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="table-note">
                    Reported cash:{" "}
                    {state.data.latestBalance.metrics.cash.value === null
                      ? "missing"
                      : millions(state.data.latestBalance.metrics.cash.value)}
                    m · Short-term investments:{" "}
                    {state.data.latestBalance.metrics.shortInvestments.value ===
                    null
                      ? "missing"
                      : millions(
                          state.data.latestBalance.metrics.shortInvestments
                            .value,
                        )}
                    m · Annual/TTM diluted average shares:{" "}
                    {millions(
                      (state.data.ttm ?? state.data.annual.at(-1))?.metrics
                        .dilutedShares.value ?? NaN,
                    )}
                    m. These are source references, not automatically inferred
                    equity adjustments.
                  </p>
                  <p className="table-note">
                    Year 1 and terminal margins initialize to reported operating
                    income / revenue. CapEx and D&A use the selected reported
                    ratios where available. Base forward growth initializes to
                    comparable annual revenue growth, bounded to −20% to +30% as
                    a starting estimate, with bear/bull adjustments and
                    later-year fade. If comparable history is absent,
                    illustrative scenario growth defaults are explicitly
                    estimates requiring review. 25% cash tax, 10% NWC
                    investment, WACC, terminal growth, margin of safety, and
                    scenario spreads are editable{" "}
                    <strong>model estimates</strong>, not SEC facts. The D&A
                    concept may include depletion or exclude intangible
                    amortization; review its tag and override when needed.
                  </p>
                  <p className="table-note">
                    Initial growth (bear/base/bull, years 1–3):{" "}
                    {defaults
                      .map((s) => percent(s.assumptions.growthEarly))
                      .join(" / ")}
                    . Use the preserved scenario editor below after
                    initialization.
                  </p>
                  <label className="manual-field">
                    Estimate rationale and source notes
                    <textarea
                      aria-label="Estimate rationale"
                      value={inputs.rationale}
                      onChange={(e) =>
                        setInputs({ ...inputs, rationale: e.target.value })
                      }
                      placeholder="Explain excess cash, debt coverage, claims, share estimate and forecast assumptions."
                    />
                  </label>
                  <label className="acknowledgement">
                    <input
                      type="checkbox"
                      checked={inputs.acknowledged}
                      onChange={(e) =>
                        setInputs({ ...inputs, acknowledged: e.target.checked })
                      }
                    />
                    I confirm this is ordinary company equity, reviewed the
                    reported concepts and accept these manual inputs and
                    forecast defaults as model estimates.
                  </label>
                  {issues.length > 0 && (
                    <div className="alert">
                      <strong>Valuation incomplete</strong>
                      <ul>
                        {issues.map((i) => (
                          <li key={i}>{i}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button
                    className="primary-button"
                    type="button"
                    disabled={issues.length > 0}
                    onClick={initialize}
                  >
                    Initialize / reinitialize DCF
                  </button>
                  <p className="table-note">
                    Reinitializing resets all company scenarios to these inputs.
                    Forecast years are annual steps from the displayed
                    reporting-period anchor, not a claim of calendar-year
                    actuals. No live valuation is labeled fully verified.
                  </p>
                </section>
              </>
            )}
          </>
        )}
      </div>
      {demo ? (
        <Dashboard key="fictional-demo" />
      ) : model ? (
        <Dashboard
          key={`${state.ticker}-${generation}`}
          data={{
            ...model,
            market: {
              ...model.market,
              price: price ?? 0,
              asOf:
                manualPrice.trim() !== ""
                  ? "manually entered"
                  : (quote.quote?.asOf ?? "unavailable"),
            },
          }}
          defaults={defaults}
          priceLabel={priceLabel}
        />
      ) : (
        <div className="research-empty">
          <p>
            {state.status === "loading"
              ? "Loading company-specific financial data…"
              : state.data?.eligibility?.eligible === false
                ? state.data.eligibility.reason
                : "The DCF workspace opens after the required company inputs are complete. No prior-company or fictional financials are substituted."}
          </p>
        </div>
      )}
    </>
  );
}
