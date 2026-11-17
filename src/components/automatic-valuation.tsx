"use client";
import { useEffect, useState } from "react";
import type { VerifiedFinancials } from "@/lib/sec/types";
import { assumptionErrors, assumptionLabels } from "@/lib/finance/validation";
import type { Assumptions } from "@/lib/finance/types";
import type { ModelInputs } from "@/lib/data/research";
import {
  buildAutomaticBaseline,
  type BaselineOverrides,
} from "@/lib/finance/automatic";
import type { WaccInputs, RiskFreeObservation } from "@/lib/finance/wacc";
import { millions, percent } from "@/lib/format";
import Dashboard from "./dashboard";
import ForecastWorkbench from "./forecast-workbench";
import {
  applyFiscalForecast,
  annualScenarioRates,
} from "@/lib/estimates/forecast";
import type { RevenuePlan } from "@/lib/estimates/types";
const financialFields: [
  keyof Pick<
    ModelInputs,
    "excessCash" | "debt" | "otherClaims" | "shares" | "depreciationRate"
  >,
  string,
  number,
][] = [
  ["excessCash", "Estimated excess cash (USD m)", 1],
  ["debt", "Total financial debt (USD m)", 1],
  ["otherClaims", "Additional non-equity claims (USD m)", 1],
  ["shares", "Diluted share estimate (m)", 1],
  ["depreciationRate", "D&A / revenue (%)", 100],
];
const waccFields: [keyof WaccInputs, string, number][] = [
  ["riskFree", "Risk-free rate (%)", 100],
  ["beta", "Beta estimate", 1],
  ["equityRiskPremium", "Equity risk premium (%)", 100],
  ["costOfDebt", "Cost of debt estimate (%)", 100],
  ["equityCapital", "Equity capital / market-cap proxy (USD m)", 1],
  ["taxRate", "Debt tax shield rate (%)", 100],
];
export default function AutomaticValuation({
  data,
  price,
  priceLabel,
  verifiedQuotePrice,
}: {
  data: VerifiedFinancials;
  price: number | null;
  priceLabel: string;
  verifiedQuotePrice: number | null;
}) {
  const [riskFree, setRiskFree] = useState<RiskFreeObservation | null>(null),
    [overrides, setOverrides] = useState<BaselineOverrides>({});
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/rates", { signal: controller.signal })
      .then((r) => r.json())
      .then((value) => {
        if (!controller.signal.aborted) setRiskFree(value);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setRiskFree({
            rate: null,
            asOf: null,
            source: "Treasury feed",
            warning:
              "Risk-free retrieval failed; enter a risk-free assumption or direct WACC.",
          });
      });
    return () => controller.abort();
  }, []);
  const [forecastPlan, setForecastPlan] = useState<RevenuePlan | null>(null);
  const historical = buildAutomaticBaseline(
    data,
    riskFree,
    overrides,
    price,
    verifiedQuotePrice,
  );
  const forward =
    forecastPlan && (forecastPlan.mode !== "historical" || forecastPlan.rows.some(r=>r.source==="User override")) ? forecastPlan : null;
  const b = forward
    ? buildAutomaticBaseline(
        data,
        riskFree,
        {
          ...overrides,
          assumptions: {
            ...overrides.assumptions,
            annualGrowth: forward.growths,
            growthEarly: forward.growths[0],
            growthMiddle: forward.growths[3],
            growthLate: forward.growths[5],
          },
        },
        price,
        verifiedQuotePrice,
      )
    : historical;
  const fiscal =
    b.dataset && forecastPlan
      ? applyFiscalForecast(data, b.dataset, forecastPlan)
      : null;
  const scenarioDefaults=b.scenarios.map(s=>{const h=historical.scenarios.find(h=>h.id===s.id)!;return {...s,assumptions:{...s.assumptions,growthEarly:h.assumptions.growthEarly,growthMiddle:h.assumptions.growthMiddle,growthLate:h.assumptions.growthLate,annualGrowth:forward?annualScenarioRates(forward.growths,s, Math.max(0,...forward.rows.map((r,i)=>r.estimate?i+1:0))):undefined}};});
  function financial(key: keyof ModelInputs, value: number | null) {
    setOverrides((prev) => ({
      ...prev,
      financial: { ...prev.financial, [key]: value },
    }));
  }
  function wacc(key: keyof WaccInputs, value: number | null) {
    setOverrides((prev) => ({ ...prev, wacc: { ...prev.wacc, [key]: value } }));
  }
  const input = (
    label: string,
    value: number | null,
    scale: number,
    change: (v: number | null) => void,
  ) => (
    <label
      className="manual-field"
      key={label.replace(" · manual override", "")}
    >
      {label}
      <input
        aria-label={label.replace(" · manual override", "")}
        type="number"
        step="any"
        value={
          value === null || !Number.isFinite(value)
            ? ""
            : Number((value * scale).toFixed(5))
        }
        placeholder="Required when unavailable"
        onChange={(e) =>
          change(e.target.value === "" ? null : Number(e.target.value) / scale)
        }
      />
      {(value === null || !Number.isFinite(value)) && !label.startsWith("Direct WACC") && <small role="alert">{label.replace(" · manual override","")} is unavailable or invalid. Enter a reviewed value.</small>}
    </label>
  );
  return (
    <>
      <div className="research-container with-model">
        <ForecastWorkbench
          data={data}
          historical={historical.assumptions}
          onChange={setForecastPlan}
        />
        <details className="panel" open={b.issues.length>0 || !!fiscal?.error}><summary>{b.issues.length ? "Needs Review" : "Financial inputs and sources · advanced"}</summary>
          <div className="panel-heading"><h3>{b.issues.length ? "Complete unresolved inputs" : "Automatic financial baseline"}</h3><button type="button" className="text-button" onClick={()=>setOverrides({})}>Reset financial overrides</button></div>
          {fiscal?.error && <p role="alert">{fiscal.error}</p>}
          {b.inputs.otherClaims === null && <div className="alert">
            <p>Preferred and minority claims are unresolved. Enter a reviewed total below, or confirm that you reviewed the company’s disclosures and found no material non-equity claim.</p>
            <button type="button" className="text-button" onClick={()=>financial("otherClaims",0)}>I reviewed claims — use zero</button>
          </div>}
          <div className="manual-grid">
            {financialFields.filter(([key])=>b.inputs[key]===null || !Number.isFinite(b.inputs[key]) || Object.hasOwn(overrides.financial??{},key)).map(([key, label, scale]) =>
              input(
                `${label}${Object.hasOwn(overrides.financial ?? {}, key) ? " · manual override" : ""}`,
                b.inputs[key],
                scale,
                (v) => financial(key, v),
              ),
            )}
          </div>
          <div className="manual-grid">{Object.entries(assumptionErrors(b.assumptions)).filter(([key])=>!["shares","daRate","wacc","annualGrowth","annualCapex","growthEarly","growthMiddle","growthLate"].includes(key)).map(([key])=>input(`${assumptionLabels[key as keyof typeof assumptionLabels]} (%)`,Number.isFinite(b.assumptions[key as keyof Assumptions])?b.assumptions[key as keyof Assumptions] as number:null,100,v=>setOverrides(prev=>({...prev,assumptions:{...prev.assumptions,[key]:v??NaN}}))))}</div>
          <details className="coverage-details"><summary>Resolved financial inputs · editable</summary><div className="manual-grid">{financialFields.filter(([key])=>b.inputs[key]!==null && Number.isFinite(b.inputs[key]) && !Object.hasOwn(overrides.financial??{},key)).map(([key,label,scale])=>input(label,b.inputs[key],scale,v=>financial(key,v)))}</div></details>
          <details className="coverage-details" open={!Number.isFinite(b.assumptions.wacc)}><summary>Discount rate components · advanced</summary>
          <div className="panel-heading">
            <h3>Discount rate components</h3>
            <span>
              {riskFree?.asOf
                ? `Treasury observation: ${riskFree.asOf}`
                : "Treasury yield pending / unavailable"}
            </span>
          </div>
          <p className="table-note">
            {riskFree?.warning ??
              riskFree?.source ??
              "Retrieving the official Treasury 10-year yield…"}{" "}
            {riskFree?.asOf && (
              <a
                href="https://home.treasury.gov/treasury-daily-interest-rate-xml-feed"
                target="_blank"
                rel="noreferrer"
              >
                Source ↗
              </a>
            )}{" "}
            Beta 1.0, ERP 5% and borrowing spread 2% are editable model-policy
            estimates, not observed company risk or borrowing yields.
          </p>
          <div className="manual-grid">
            {waccFields.map(([key, label, scale]) =>
              input(
                `${label}${Object.hasOwn(overrides.wacc ?? {}, key) ? " · manual override" : ""}`,
                b.waccInputs[key],
                scale,
                (v) => wacc(key, v),
              ),
            )}
            {input(
              "Direct WACC override (%)",
              overrides.directWacc ?? null,
              100,
              (v) => setOverrides((prev) => ({ ...prev, directWacc: v })),
            )}
          </div>
          <p className="table-note">
            Cost of equity = risk-free + beta × ERP. WACC = E/V × cost of equity
            + D/V × cost of debt × (1 − tax). Capital weights use a non-stale
            provider quote when available; otherwise book equity is an explicit
            proxy. A hypothetical reference price is not treated as observed
            market capitalization.
          </p>
          <p className="table-note">
            Cost of equity: {percent(b.waccResult?.costOfEquity ?? null)} ·
            Equity weight: {percent(b.waccResult?.equityWeight ?? null)} · Debt
            weight: {percent(b.waccResult?.debtWeight ?? null)} · After-tax debt
            cost: {percent(b.waccResult?.afterTaxCostOfDebt ?? null)} · Active
            baseline WACC:{" "}
            {percent(
              Number.isFinite(b.assumptions.wacc) ? b.assumptions.wacc : null,
            )}
            {overrides.directWacc != null
              ? " (manual override; component calculation is reference only)"
              : ""}
          </p>
          </details>
          <details className="coverage-details">
            <summary>Evidence, forecast rules and modeling limitations</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Input</th>
                    <th>Value</th>
                    <th>Type / derivation</th>
                  </tr>
                </thead>
                <tbody>
                  {b.evidence.map((v) => (
                    <tr key={v.label}>
                      <th>{v.label}</th>
                      <td>
                        {v.value === null
                          ? "Unavailable"
                          : v.label.includes("(m)") || v.label.includes("USD m")
                            ? millions(v.value)
                            : percent(v.value)}
                      </td>
                      <td className="evidence-reason">
                        {v.kind}: {v.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul>
              {b.warnings.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
            <p>
              Reported statements and filing provenance remain in the financial
              sources section above. Historical FCF is not forecast FCFF. These
              rules make no industry-growth or management-guidance claims.
            </p>
          </details>

        </details>
      </div>
      {(b.dataset ?? historical.dataset) && (
        <Dashboard
          key={data.ticker}
          data={{
            ...(fiscal?.dataset ?? b.dataset ?? historical.dataset!),
            salesToCapital: forward?.salesToCapital ?? (fiscal?.dataset ?? b.dataset ?? historical.dataset)?.salesToCapital,
            market: {
              ...(b.dataset ?? historical.dataset)!.market,
              price: price ?? 0,
              asOf: priceLabel,
            },
          }}
          defaults={scenarioDefaults}
          forecastPlan={forecastPlan}
          blockingError={
            fiscal?.error ?? (!b.dataset ? b.issues.join(" ") : undefined)
          }
          priceLabel={priceLabel}
        />
      )}
    </>
  );
}
