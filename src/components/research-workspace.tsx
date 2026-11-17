"use client";
import { useReducer, useRef, useState } from "react";
import Dashboard from "./dashboard";
import AutomaticValuation from "./automatic-valuation";
import TickerSearch from "./ticker-search";
import SecurityStatus from "./security-status";
import type { SecurityIdentity } from "@/lib/securities/symbols";
import FinancialSources from "./financial-sources";
import {
  referencePrice,
  initialLoadState,
  researchReducer,
} from "@/lib/data/research";
import type { VerifiedFinancials } from "@/lib/sec/types";
import type { QuoteResult } from "@/lib/market/quotes";
import { money } from "@/lib/format";
export default function ResearchWorkspace() {
  const [state, dispatch] = useReducer(researchReducer, initialLoadState),
    requestId = useRef(0);
  const [ticker, setTicker] = useState("MSFT"),
    [demo, setDemo] = useState(false),
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
  function selectDemo() {
    controller.current?.abort();
    requestId.current++;
    setDemo(true);
    dispatch({ type: "start", id: requestId.current, ticker: "ASTR" });
  }
  return (
    <>
      <div
        className={`research-container ${demo || state.data?.eligibility?.eligible ? "with-model" : ""}`}
      >
        <section className="panel research-search">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">INTRINSIC · PHASE 4</div>
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
        {!demo && state.data && (
          <>
            <SecurityStatus data={state.data} />
            {state.data.annual.length > 0 && (
              <details className="panel">
                <summary>Reported financials and SEC filing sources</summary>
                <FinancialSources data={state.data} />
              </details>
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
              </>
            )}
          </>
        )}
      </div>
      {demo ? (
        <Dashboard key="fictional-demo" />
      ) : state.data?.eligibility?.eligible !== false && state.data ? (
        <AutomaticValuation
          key={state.data.ticker}
          data={state.data}
          price={price}
          priceLabel={priceLabel}
          verifiedQuotePrice={
            quote.quote && !quote.quote.stale ? quote.quote.price : null
          }
        />
      ) : (
        <div className="research-empty">
          <p>
            {state.status === "loading"
              ? "Loading company-specific financial data…"
              : state.data?.eligibility?.eligible === false
                ? state.data.eligibility.reason
                : "Load an operating company to generate its automatic baseline. No prior-company or fictional financials are substituted."}
          </p>
        </div>
      )}
    </>
  );
}
