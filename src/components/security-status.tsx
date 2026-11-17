import type { VerifiedFinancials } from "@/lib/sec/types";
export default function SecurityStatus({ data }: { data: VerifiedFinancials }) {
  const s = data.security,
    e = data.eligibility;
  return (
    <section
      className={`panel security-status ${e?.eligible ? "" : "valuation-blocked"}`}
      aria-label="Security classification"
    >
      <div className="panel-heading">
        <div>
          <div className="eyebrow">IDENTITY & MODEL SUITABILITY</div>
          <h2>
            {data.name} <span className="outline-badge">{data.ticker}</span>
          </h2>
        </div>
        <span>
          {data.identity?.exchange ?? "Exchange unavailable"} · CIK {data.cik}
          <br />
          {s?.foreignIssuer ? "Foreign SEC issuer" : "SEC registrant"} ·{" "}
          {data.taxonomy === "unknown"
            ? "financials not normalized"
            : data.taxonomy}
        </span>
      </div>
      <p>
        <strong>{s?.kind.replaceAll("-", " ") ?? "Unclassified"}</strong> ·{" "}
        {e?.eligible
          ? "Operating DCF available after input review"
          : "Operating-company valuation unavailable"}
      </p>
      <p className="table-note">{e?.reason ?? s?.explanation}</p>
      <p className="table-note">
        Reporting currency:{" "}
        {data.currency ??
          (s?.kind === "operating-company"
            ? "undetermined"
            : "not assessed for this security type")}
        {data.currencyCandidates && data.currencyCandidates.length > 1
          ? ` (multiple annual-revenue units: ${data.currencyCandidates.join(", ")}; no currency was selected)`
          : ""}
        .{" "}
        {s?.foreignIssuer
          ? "Foreign issuers may use annual 20-F/40-F reports and irregular or semiannual 6-K reports. No US quarterly schedule is assumed. Confirm ADR/share units."
          : ""}
      </p>
      {s?.alternativeModels.length ? (
        <p className="table-note">
          Future model extension: {s.alternativeModels.join(", ")}. These models
          are not implemented, so no fair value is generated.
        </p>
      ) : null}
      <ul className="classification-evidence">
        {s?.evidence.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <a
        href={`https://www.sec.gov/edgar/browse/?CIK=${Number(data.cik)}`}
        target="_blank"
        rel="noreferrer"
      >
        Review issuer filings on SEC EDGAR ↗
      </a>
      {!data.annual.length && (
        <p className="table-note">{data.warnings.join(" ")}</p>
      )}
    </section>
  );
}
