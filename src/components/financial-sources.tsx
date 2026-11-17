"use client";
import type {
  FinancialPeriod,
  MetricKey,
  VerifiedFinancials,
} from "@/lib/sec/types";
import { millions, percent } from "@/lib/format";
const labels: Record<MetricKey, string> = {
  revenue: "Revenue",
  operatingIncome: "Operating income",
  netIncome: "Net income",
  operatingCashFlow: "Operating cash flow",
  capex: "CapEx (positive expenditure)",
  depreciation: "D&A (selected concept)",
  stockCompensation: "Stock-based compensation",
  dilutedShares: "Diluted weighted-average shares (m)",
  cash: "Cash and cash equivalents",
  shortInvestments: "Short-term investments",
  debt: "Financial debt (selected coverage)",
  periodEndShares: "Period-end common shares (m)",
  currentAssets: "Current assets",
  currentLiabilities: "Current liabilities",
  receivables: "Trade receivables",
  inventory: "Inventory",
  payables: "Trade accounts payable",
  bookEquity: "Reported book equity",
  currentDebt: "Total current financial debt",
  noncurrentDebt: "Noncurrent long-term debt",
  taxExpense: "Income tax expense / benefit",
  pretaxIncome: "Pretax income",
  interestExpense: "Interest expense",
  preferredClaims: "Preferred equity claims",
  minorityClaims: "Total noncontrolling interests",
  reportedFcf: "Reported FCF · not FCFF",
};
export default function FinancialSources({
  data,
}: {
  data: VerifiedFinancials;
}) {
  const periods: FinancialPeriod[] = [
    ...data.annual,
    ...(data.interim ? [data.interim] : []),
    ...(data.quarter ? [data.quarter] : []),
    ...(data.ttm ? [data.ttm] : []),
  ];
  const covered = Object.values(
    (data.ttm ?? data.annual.at(-1))?.metrics ?? {},
  ).filter((m) => m.value !== null).length;
  return (
    <section id="financials" className="panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">SEC EDGAR · ACTUAL REPORTED FINANCIALS</div>
          <h2>
            {data.name} <span className="outline-badge">{data.ticker}</span>
          </h2>
        </div>
        <span>
          CIK {data.cik} · fiscal year end {data.fiscalYearEnd}
          <br />
          {covered}/{Object.keys(labels).length} performance metrics covered
          <br />
          Latest report: {data.latestBalance.end}
        </span>
      </div>
      <p className="table-note">
        {data.currency ?? "Undetermined currency"} millions and millions of
        shares. Annual, YTD, quarter and TTM columns are distinct. Click a
        value’s source details to see its exact filing and XBRL concept.
        Reported FCF is operating cash flow minus CapEx; it is not forecast
        FCFF.
      </p>
      <div className="table-scroll">
        <table>
          <caption>
            Actual SEC financials · retrieved {data.retrievedAt} · snapshot
            cutoff {data.asOf}
          </caption>
          <thead>
            <tr>
              <th>Metric</th>
              {periods.map((p) => (
                <th key={`${p.kind}-${p.end}`}>
                  {p.kind.toUpperCase()}
                  <br />
                  {p.start}
                  <br />– {p.end}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(labels) as MetricKey[]).map((key) => (
              <tr key={key}>
                <th>{labels[key]}</th>
                {periods.map((p) => {
                  const m = p.metrics[key];
                  return (
                    <td key={`${p.kind}-${p.end}`}>
                      <details className="source-detail">
                        <summary>
                          {m.value === null ? "Missing" : millions(m.value)}{" "}
                          <span>ⓘ</span>
                        </summary>
                        <div>
                          <strong>{m.status}</strong>
                          {m.reason && <p>{m.reason}</p>}
                          {m.sources.map((s, i) => (
                            <p key={i}>
                              <a
                                href={s.filingUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {s.form} · {s.filed}
                              </a>
                              <br />
                              {s.tag} · {s.unit}
                              <br />
                              {s.start ? `${s.start} – ` : ""}
                              {s.end}
                              <br />
                              Accession: {s.accession}
                              <br />
                              Retrieved: {s.retrievedAt}
                              <br />
                              <a href={s.url} target="_blank" rel="noreferrer">
                                {s.url.endsWith(".xml") ? "SEC filing XBRL ↗" : "SEC Company Facts JSON ↗"}
                              </a>
                            </p>
                          ))}
                        </div>
                      </details>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th>Reported FCF margin</th>
              {periods.map((p) => (
                <td key={`${p.kind}-${p.end}`}>{percent(p.fcfMargin)}</td>
              ))}
            </tr>
            <tr>
              <th>Comparable annual FCF growth</th>
              {periods.map((p) => (
                <td key={`${p.kind}-${p.end}`}>{percent(p.fcfGrowth)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <details className="coverage-details">
        <summary>Latest balance sheet and data sources</summary>
        <p>
          Statement date: {data.latestBalance.end}. Common shares may be
          disclosed as of a later date. Missing short-term debt is never assumed
          to be zero; total debt may require filing review.
        </p>
        {(
          ["cash", "shortInvestments", "debt", "periodEndShares", "preferredClaims", "minorityClaims"] as MetricKey[]
        ).map((key) => {
          const m = data.latestBalance.metrics[key];
          return (
            <div key={key}>
              <strong>
                {labels[key]}:{" "}
                {m.value === null ? "Missing" : millions(m.value)}
              </strong>
              <p>{m.reason}</p>
              {m.sources.map((s, i) => (
                <p key={i}>
                  <a href={s.filingUrl} target="_blank" rel="noreferrer">
                    SEC {s.form} · filed {s.filed}
                  </a>{" "}
                  · {s.tag} · {s.unit} · period {s.start ?? "instant"} / {s.end}{" "}
                  · accession {s.accession} · retrieved {s.retrievedAt}
                </p>
              ))}
            </div>
          );
        })}
        {data.preferredBasis && <div>
          <strong>Shares excluding preferred conversion: {millions(data.preferredBasis.shares.value)}</strong>
          <p>{data.preferredBasis.shares.reason}</p>
          {data.preferredBasis.shares.sources.map((s, i) => <p key={i}>
            <a href={s.filingUrl} target="_blank" rel="noreferrer">SEC {s.form} · filed {s.filed}</a>{" "}
            · {s.tag} · {s.unit} · period {s.start} / {s.end} · accession {s.accession} · retrieved {s.retrievedAt}
          </p>)}
        </div>}
      </details>
      <details className="coverage-details">
        <summary>
          Data coverage and reconciliation warnings ({data.warnings.length})
        </summary>
        <ul>
          {data.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
