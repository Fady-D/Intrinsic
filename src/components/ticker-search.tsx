"use client";
import { useEffect, useId, useState } from "react";
import type { SecurityIdentity } from "@/lib/securities/symbols";
export default function TickerSearch({
  query,
  onChange,
  onSelect,
}: {
  query: string;
  onChange: (query: string) => void;
  onSelect: (identity: SecurityIdentity) => void;
}) {
  const id = useId(),
    [focused, setFocused] = useState(false),
    [results, setResults] = useState<SecurityIdentity[]>([]),
    [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
      "idle",
    ),
    [error, setError] = useState(""),
    [active, setActive] = useState(-1);
  useEffect(() => {
    if (!focused || !query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const response = await fetch(
          `/api/tickers?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error ?? "Directory lookup failed.");
        if (!controller.signal.aborted) {
          setResults(payload.results);
          setStatus("ready");
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Directory unavailable.");
          setStatus("error");
        }
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, focused]);
  const open = focused && !!query.trim();
  function choose(identity: SecurityIdentity) {
    setFocused(false);
    setActive(-1);
    setResults([]);
    setStatus("idle");
    onSelect(identity);
  }
  return (
    <div className="ticker-search">
      <label htmlFor={id}>Ticker or company name</label>
      <input
        id={id}
        aria-label="Research ticker or company name"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={`${id}-results`}
        aria-expanded={open && results.length > 0}
        aria-activedescendant={
          open && active >= 0 ? `${id}-${active}` : undefined
        }
        value={query}
        autoComplete="off"
        maxLength={100}
        placeholder="e.g. NVIDIA, NVDA, BRK.B"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setResults([]);
          setStatus("idle");
          setActive(-1);
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setFocused(false);
            setActive(-1);
          } else if (e.key === "ArrowDown" && results.length) {
            e.preventDefault();
            setFocused(true);
            setActive((v) => (v + 1) % results.length);
          } else if (e.key === "ArrowUp" && results.length) {
            e.preventDefault();
            setActive((v) => (v - 1 + results.length) % results.length);
          } else if (
            e.key === "Enter" &&
            open &&
            active >= 0 &&
            results[active]
          ) {
            e.preventDefault();
            choose(results[active]);
          }
        }}
      />
      {open && (
        <div className="ticker-suggestions">
          <p role="status">
            {status === "loading"
              ? "Searching SEC directory…"
              : status === "error"
                ? error
                : status === "ready" && !results.length
                  ? "No SEC directory matches. Some global tickers and securities are outside SEC coverage."
                  : status === "ready"
                    ? "Select a company and listing to research."
                    : "Waiting to search the SEC directory…"}
          </p>
          <ul
            id={`${id}-results`}
            role="listbox"
            aria-label="SEC ticker suggestions"
          >
            {results.map((r, i) => (
              <li
                key={`${r.cik}:${r.ticker}:${r.exchange}`}
                role="presentation"
              >
                <button
                  id={`${id}-${i}`}
                  role="option"
                  aria-selected={active === i}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(r)}
                >
                  <strong>{r.ticker}</strong>
                  <span>{r.name}</span>
                  <small>{r.exchange ?? "Exchange unavailable"}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
