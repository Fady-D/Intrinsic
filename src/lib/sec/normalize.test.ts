import { describe, it, expect } from "vitest";
import {
  normalizeFinancials,
  parseCompanyFacts,
  parseSubmissions,
} from "./normalize";
import { fixture, fact } from "./fixtures/company";
const normalize = () => {
  const { facts, sub } = fixture();
  return normalizeFinancials(facts, sub, "TEST", "2025-11-15T12:00:00Z");
};
describe("SEC normalization and reporting periods", () => {
  it("extracts non-calendar annual periods without counting quarterly durations as annual", () => {
    const r = normalize();
    expect(r.annual).toHaveLength(2);
    expect(r.annual[1].start).toBe("2024-07-01");
    expect(r.annual[1].end).toBe("2025-06-30");
    expect(r.annual[1].metrics.revenue.value).toBe(1000);
    expect(r.interim?.kind).toBe("ytd");
    expect(r.quarter?.kind).toBe("quarter");
  });
  it("maps equivalent alternate revenue tags", () => {
    const { facts, sub } = fixture();
    facts.facts["us-gaap"].Revenues =
      facts.facts[
        "us-gaap"
      ].RevenueFromContractWithCustomerExcludingAssessedTax;
    delete facts.facts["us-gaap"]
      .RevenueFromContractWithCustomerExcludingAssessedTax;
    const r = normalizeFinancials(facts, sub, "TEST", "2025-11-15T00:00:00Z");
    expect(r.annual[1].metrics.revenue.sources[0].tag).toBe("us-gaap:Revenues");
  });
  it("retains complete per-value provenance", () => {
    const m = normalize().annual[1].metrics.revenue;
    expect(m.sources[0]).toMatchObject({
      source: "SEC EDGAR",
      form: "10-K",
      filed: "2025-08-01",
      start: "2024-07-01",
      end: "2025-06-30",
      accession: "0000001234-25-000001",
      unit: "USD",
      retrievedAt: "2025-11-15T12:00:00Z",
    });
    expect(m.sources[0].filingUrl).toContain("000000123425000001");
  });
  it("keeps FCF distinct from FCFF and subtracts positive CapEx", () => {
    const r = normalize().annual[1];
    expect(r.metrics.reportedFcf.value).toBe(140);
    expect(r.fcfMargin).toBe(0.14);
    expect(r.metrics.reportedFcf.sources).toHaveLength(2);
  });
  it("reconciles annual + YTD − prior YTD cash flows rather than adding overlapping periods", () => {
    const r = normalize();
    expect(r.ttm?.metrics.revenue.value).toBe(1100);
    expect(r.ttm?.metrics.operatingCashFlow.value).toBe(264);
    expect(r.ttm?.metrics.capex.value).toBe(110);
    expect(r.ttm?.metrics.reportedFcf.value).toBe(154);
    expect(r.ttm?.start).toBe("2024-10-01");
  });
  it("rejects unmatched prior YTD and reports missing TTM", () => {
    const { facts, sub } = fixture();
    for (const units of Object.values(facts.facts["us-gaap"]))
      for (const list of Object.values(units.units))
        for (const f of list)
          if (f.start === "2024-07-01" && f.end === "2024-09-30")
            f.end = "2024-08-15";
    const r = normalizeFinancials(facts, sub, "TEST", "2025-11-15T00:00:00Z");
    expect(r.ttm).toBeNull();
    expect(r.warnings.some((w) => w.includes("TTM unavailable"))).toBe(true);
  });
  it("does not reconcile TTM across changed economic concepts", () => {
    const { facts, sub } = fixture();
    const rev =
      facts.facts["us-gaap"].RevenueFromContractWithCustomerExcludingAssessedTax
        .units.USD;
    facts.facts["us-gaap"].Revenues = {
      units: { USD: rev.filter((f) => f.end === "2025-09-30") },
    };
    facts.facts[
      "us-gaap"
    ].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD =
      rev.filter((f) => f.end !== "2025-09-30");
    expect(
      normalizeFinancials(facts, sub, "TEST", "2025-11-15T00:00:00Z").ttm
        ?.metrics.revenue.value,
    ).toBeNull();
  });
  it("uses weighted-day shares for TTM, not cash-flow arithmetic", () => {
    const { facts, sub } = fixture();
    facts.facts[
      "us-gaap"
    ].WeightedAverageNumberOfDilutedSharesOutstanding.units.shares.find(
      (f) => f.end === "2025-09-30",
    )!.val = 90e6;
    const r = normalizeFinancials(facts, sub, "TEST", "2025-11-15T00:00:00Z");
    expect(r.ttm?.metrics.dilutedShares.value).toBeCloseTo(
      (100 * 365 + 90 * 92 - 100 * 92) / 365,
    );
  });
  it("does not silently reconstruct snapshots using later restatements", () => {
    const { facts, sub } = fixture();
    facts.facts[
      "us-gaap"
    ].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD.push(
      fact(
        "2024-07-01",
        "2025-06-30",
        1500,
        "10-K/A",
        "2026-02-01",
        "0000001234-26-000001",
      ),
    );
    expect(
      normalizeFinancials(
        facts,
        sub,
        "TEST",
        "2026-02-02T00:00:00Z",
        "2025-11-15",
      ).annual[1].metrics.revenue.value,
    ).toBe(1000);
    expect(
      normalizeFinancials(facts, sub, "TEST", "2026-02-02T00:00:00Z").annual[1]
        .metrics.revenue.value,
    ).toBe(1500);
  });
  it("reports conflicting same-filing facts instead of choosing an arbitrary value", () => {
    const { facts, sub } = fixture();
    facts.facts["us-gaap"].OperatingIncomeLoss.units.USD.push(
      fact("2024-07-01", "2025-06-30", 999),
    );
    expect(
      normalizeFinancials(facts, sub, "TEST", "2025-11-15T00:00:00Z").annual[1]
        .metrics.operatingIncome.value,
    ).toBeNull();
  });
  it("does not double count debt aggregates, current portions or commercial paper", () => {
    const { facts, sub } = fixture();
    facts.facts[
      "us-gaap"
    ].LongTermDebtAndFinanceLeaseObligationsIncludingCurrentPortion = {
      units: {
        USD: [
          fact(
            undefined,
            "2025-09-30",
            150,
            "10-Q",
            "2025-11-01",
            "0000001234-25-000002",
          ),
        ],
      },
    };
    expect(
      normalizeFinancials(facts, sub, "TEST", "2025-11-15T00:00:00Z")
        .latestBalance.metrics.debt.value,
    ).toBe(160);
  });
  it("does not infer zero short-term debt from an absent tag", () => {
    const { facts, sub } = fixture();
    delete facts.facts["us-gaap"].CommercialPaper;
    expect(
      normalizeFinancials(facts, sub, "TEST", "2025-11-15T00:00:00Z")
        .latestBalance.metrics.debt.value,
    ).toBeNull();
  });
  it("returns missing for absent critical metrics and invalid negative CapEx", () => {
    const { facts, sub } = fixture();
    delete facts.facts["us-gaap"].OperatingIncomeLoss;
    for (const f of facts.facts["us-gaap"]
      .PaymentsToAcquirePropertyPlantAndEquipment.units.USD)
      f.val = -100;
    const r = normalizeFinancials(facts, sub, "TEST", "2025-11-15T00:00:00Z");
    expect(r.annual[1].metrics.operatingIncome.value).toBeNull();
    expect(r.annual[1].metrics.capex.value).toBeNull();
    expect(r.annual[1].metrics.reportedFcf.value).toBeNull();
  });
  it("keeps USD facts separate from other units and rejects numeric strings", () => {
    const { facts, sub } = fixture();
    const tag = facts.facts["us-gaap"].NetIncomeLoss;
    tag.units.EUR = tag.units.USD;
    delete tag.units.USD;
    const ocf =
      facts.facts["us-gaap"].NetCashProvidedByUsedInOperatingActivities.units
        .USD;
    Object.assign(ocf[1], { val: "240000000" });
    const r = normalizeFinancials(facts, sub, "TEST", "2025-11-15T00:00:00Z");
    expect(r.annual[1].metrics.netIncome.value).toBeNull();
    expect(r.annual[1].metrics.operatingCashFlow.value).toBeNull();
  });
  it("rejects malformed responses and mismatched CIKs", () => {
    expect(() => parseCompanyFacts(null)).toThrow();
    expect(() => parseCompanyFacts({ facts: {} })).toThrow();
    expect(() => parseSubmissions({})).toThrow();
    const { facts, sub } = fixture();
    expect(() =>
      normalizeFinancials(facts, { ...sub, cik: "999" }, "TEST"),
    ).toThrow("different companies");
  });
  it("calculates growth only for comparable adjacent annual periods with a positive base", () => {
    const r = normalize();
    expect(r.annual[1].fcfGrowth).toBeCloseTo(0.25);
    const { facts, sub } = fixture();
    for (const list of Object.values(facts.facts["us-gaap"]))
      for (const fs of Object.values(list.units))
        for (const f of fs)
          if (f.end === "2024-06-30" && f.start) f.start = "2023-06-20";
    expect(
      normalizeFinancials(facts, sub, "TEST", "2025-11-15T00:00:00Z").annual[1]
        .fcfGrowth,
    ).toBeNull();
  });
  it("derives second-quarter cash flow from two YTD totals without confusing a six-month period with a quarter", () => {
    const { facts, sub } = fixture();
    for (const [tag, concept] of Object.entries(facts.facts["us-gaap"]))
      for (const [unit, list] of Object.entries(concept.units)) {
        const base = list.find(
          (f) => f.start === "2025-07-01" && f.end === "2025-09-30",
        );
        if (!base) continue;
        list.push({
          ...base,
          end: "2025-12-31",
          val: base.val * (unit === "shares" ? 1 : 2.5),
          filed: "2026-02-01",
          accn: "0000001234-26-000001",
        });
        if (tag === "RevenueFromContractWithCustomerExcludingAssessedTax")
          list.push({
            ...base,
            start: "2025-10-01",
            end: "2025-12-31",
            val: 450e6,
            filed: "2026-02-01",
            accn: "0000001234-26-000001",
          });
      }
    const r = normalizeFinancials(facts, sub, "TEST", "2026-02-15T00:00:00Z");
    expect(r.interim?.start).toBe("2025-07-01");
    expect(r.quarter?.start).toBe("2025-10-01");
    expect(r.quarter?.metrics.operatingCashFlow.value).toBeCloseTo(108);
    expect(r.quarter?.metrics.capex.value).toBeCloseTo(45);
    expect(r.quarter?.metrics.reportedFcf.value).toBeCloseTo(63);
  });
});
