"use client";
import { useEffect, useState, useMemo } from "react";
import type { VerifiedFinancials } from "@/lib/sec/types";
import type { Assumptions } from "@/lib/finance/types";
import type {
  ForecastMode,
  EstimateResponse,
  RevenueEstimate,
  RevenuePlan,
} from "@/lib/estimates/types";
import {
  buildRevenuePlan,
  stageGrowths,
  nextFiscalEnd,
} from "@/lib/estimates/forecast";
import { millions, percent } from "@/lib/format";
interface ManualRow {
  end: string;
  revenue: string;
  currency: string;
  note: string;
}
export default function ForecastWorkbench({
  data,
  historical,
  onChange,
}: {
  data: VerifiedFinancials;
  historical: Assumptions;
  onChange: (plan: RevenuePlan) => void;
}) {
  const [mode, setMode] = useState<ForecastMode>("consensus"),
    [response, setResponse] = useState<EstimateResponse | null>(null),
    [custom, setCustom] = useState<number[] | null>(null),
    [manual, setManual] = useState<RevenueEstimate[]>([]),
    [error, setError] = useState("");
  const anchor = data.annual.at(-1)?.end ?? "",
    currency = data.currency ?? "",
    [draft, setDraft] = useState<ManualRow[]>([
      {
        end: anchor ? nextFiscalEnd(anchor, 1) : "",
        revenue: "",
        currency,
        note: "",
      },
    ]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/estimates?ticker=${encodeURIComponent(data.ticker)}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((r) => {
        if (!controller.signal.aborted) setResponse(r);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResponse({
            status: "unavailable",
            provider: "FMP",
            retrievedAt: new Date().toISOString(),
            estimates: [],
            warnings: [
              "Estimate retrieval failed; Historical Growth remains available.",
            ],
          });
      });
    return () => controller.abort();
  }, [data.ticker]);
  const { growthEarly, growthMiddle, growthLate, terminalGrowth } = historical;
  const stableHistory = useMemo(
    () => ({ growthEarly, growthMiddle, growthLate, terminalGrowth }),
    [growthEarly, growthMiddle, growthLate, terminalGrowth],
  );
  useEffect(() => {
    const values = manual.length ? manual : (response?.estimates ?? []);
    onChange(
      buildRevenuePlan(
        data,
        stableHistory,
        mode,
        values,
        custom ?? stageGrowths(stableHistory),
      ),
    );
  }, [data, stableHistory, mode, manual, response, custom, onChange]); // Historical scalar dependency avoids resetting unrelated scenario inputs.
  const preview = buildRevenuePlan(
    data,
    stableHistory,
    mode,
    manual.length ? manual : (response?.estimates ?? []),
    custom ?? stageGrowths(stableHistory),
  );
  function useManual() {
    setError("");
    const rows: RevenueEstimate[] = [];
    for (const d of draft.filter((r) => r.revenue.trim() !== "")) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(d.end) ||
        !Number.isFinite(Date.parse(d.end)) ||
        new Date(d.end).toISOString().slice(0, 10) !== d.end ||
        !Number.isFinite(Number(d.revenue)) ||
        Number(d.revenue) <= 0 ||
        d.currency.trim().toUpperCase() !== currency
      ) {
        setError(
          "Enter positive annual revenue in millions, a valid fiscal-end date and the same reporting currency as SEC statements.",
        );
        return;
      }
      rows.push({
        fiscalEnd: d.end,
        revenue: Number(d.revenue),
        currency: d.currency.trim().toUpperCase(),
        source: "User-provided",
        note: d.note,
        low: null,
        high: null,
        analysts: null,
        ebit: null,
        retrievedAt: new Date().toISOString(),
        updatedAt: null,
      });
    }
    if (!rows.length) {
      setError("Enter at least one annual revenue forecast.");
      return;
    }
    setManual(rows);
    setMode("consensus");
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">FORWARD REVENUE ASSUMPTIONS</div>
          <h2>Forecast method</h2>
        </div>
        <label>
          Method
          <select
            aria-label="Forecast method"
            value={mode}
            onChange={(e) => setMode(e.target.value as ForecastMode)}
          >
            <option value="consensus">Analyst Consensus (preferred)</option>
            <option value="historical">Historical Growth</option>
            <option value="custom">Custom Forecast</option>
          </select>
        </label>
      </div>
      <p className="table-note">
        Completed FY revenue anchor: {anchor || "unavailable"} · {currency}{" "}
        millions. Consensus/custom modes use full fiscal-year revenue, not TTM
        revenue. Annual-mode DCF deducts modeled elapsed YTD FCFF and discounts
        remaining cash flows from the latest reporting date. Missing YTD
        reconciliation blocks annual-mode valuation.
      </p>
      <p className="table-note">
        {response
          ? response.warnings.join(" ")
          : "Retrieving optional FMP annual estimates…"}{" "}
        {response &&
          `Provider: ${response.provider} · retrieved ${response.retrievedAt}.`}
        {manual.length > 0
          ? " Active estimate source: user-provided forecasts; not externally retrieved consensus."
          : ""}
      </p>
      <p className="table-note">
        Historical growth: {percent(historical.growthEarly)} early /{" "}
        {percent(historical.growthMiddle)} middle /{" "}
        {percent(historical.growthLate)} late. Operating margins, reinvestment,
        tax and WACC remain independent model assumptions; FMP EBIT is reference
        only.
      </p>
      <p className="table-note">
        <strong>
          Active method:{" "}
          {preview.mode === "historical"
            ? "Historical Growth"
            : preview.mode === "custom"
              ? "Custom Forecast"
              : manual.length
                ? "User-provided annual forecasts"
                : "Analyst Consensus"}
        </strong>
        . {preview.warnings.join(" ")}
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{preview.mode==="historical"?"Rolling year end":"Fiscal year end"}</th>
              <th>Baseline revenue ({currency} m)</th>
              <th>Growth</th>
              <th>Source</th>
              <th>Low / high / analysts</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, i) => (
              <tr key={i}>
                <th>{row.fiscalEnd}</th>
                <td>{millions(row.revenue)}</td>
                <td>
                  {percent(Number.isFinite(row.growth) ? row.growth : null)}
                </td>
                <td>{row.source}</td>
                <td>
                  {row.estimate
                    ? `${millions(row.estimate.low)} / ${millions(row.estimate.high)} / ${row.estimate.analysts ?? "N/A"}`
                    : "N/A"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mode === "custom" && (
        <div className="manual-grid">
          {(custom ?? stageGrowths(historical)).map((g, i) => (
            <label className="manual-field" key={i}>
              FY{i + 1} growth (%)
              <input
                aria-label={`Custom FY${i + 1} growth`}
                type="number"
                step="any"
                value={Number.isFinite(g) ? Number((g * 100).toFixed(5)) : ""}
                onChange={(e) => {
                  const next = [...(custom ?? stageGrowths(historical))];
                  next[i] =
                    e.target.value === "" ? NaN : Number(e.target.value) / 100;
                  setCustom(next);
                }}
              />
            </label>
          ))}
        </div>
      )}
      <details className="coverage-details">
        <summary>
          Enter annual revenue forecasts manually · no FMP key needed
        </summary>
        <p>
          Revenue amounts below are in {currency} millions. Use the company’s
          fiscal year-end dates. Source notes are optional; forecasts remain
          explicitly user-provided.
        </p>
        {draft.map((d, i) => (
          <div className="manual-grid" key={i}>
            <label className="manual-field">
              Fiscal period end
              <input
                aria-label={`Manual forecast ${i + 1} fiscal end`}
                type="date"
                value={d.end}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev.map((r, j) =>
                      j === i ? { ...r, end: e.target.value } : r,
                    ),
                  )
                }
              />
            </label>
            <label className="manual-field">
              Expected annual revenue ({currency} m)
              <input
                aria-label={`Manual forecast ${i + 1} revenue`}
                type="number"
                step="any"
                value={d.revenue}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev.map((r, j) =>
                      j === i ? { ...r, revenue: e.target.value } : r,
                    ),
                  )
                }
              />
            </label>
            <label className="manual-field">
              Reporting currency
              <input
                aria-label={`Manual forecast ${i + 1} currency`}
                value={d.currency}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev.map((r, j) =>
                      j === i ? { ...r, currency: e.target.value } : r,
                    ),
                  )
                }
              />
            </label>
            <label className="manual-field">
              Optional source note
              <input
                value={d.note}
                aria-label={`Manual forecast ${i + 1} note`}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev.map((r, j) =>
                      j === i ? { ...r, note: e.target.value } : r,
                    ),
                  )
                }
              />
            </label>
          </div>
        ))}
        <button
          type="button"
          className="text-button"
          onClick={() =>
            setDraft((prev) => [
              ...prev,
              {
                end: nextFiscalEnd(anchor, prev.length + 1),
                revenue: "",
                currency,
                note: "",
              },
            ])
          }
        >
          Add fiscal year +
        </button>
        <button type="button" className="primary-button" onClick={useManual}>
          Use user-provided forecasts
        </button>
        {manual.length > 0 && (
          <button
            type="button"
            className="text-button"
            onClick={() => setManual([])}
          >
            Return to provider estimates
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </details>
    </section>
  );
}
