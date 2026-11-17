import { describe, it, expect } from "vitest";
import { fixture, fact } from "./fixtures/company";
import { normalizeFinancials } from "./normalize";
import type { CompanyFacts } from "./types";
import {
  initializeInputs,
  initializationIssues,
  toDcfDataset,
} from "../data/research";
import { classifySecurity, valuationEligibility } from "../securities/classify";
export function ifrsFixture(currency = "EUR") {
  const { facts, sub } = fixture();
  const foreign: CompanyFacts = { ...facts, facts: { "ifrs-full": {} } };
  const mappings: Record<string, string> = {
    RevenueFromContractWithCustomerExcludingAssessedTax: "Revenue",
    OperatingIncomeLoss: "ProfitLossFromOperatingActivities",
    NetIncomeLoss: "ProfitLoss",
    NetCashProvidedByUsedInOperatingActivities:
      "CashFlowsFromUsedInOperatingActivities",
    PaymentsToAcquirePropertyPlantAndEquipment:
      "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
    DepreciationDepletionAndAmortization:
      "DepreciationDepletionAndAmortisation",
    ShareBasedCompensation: "SharebasedPaymentArrangementExpense",
    WeightedAverageNumberOfDilutedSharesOutstanding:
      "WeightedAverageNumberOfDilutedSharesOutstanding",
    CashAndCashEquivalentsAtCarryingValue: "CashAndCashEquivalents",
    LongTermDebtCurrent: "CurrentBorrowings",
    LongTermDebtNoncurrent: "NoncurrentBorrowings",
    CommonStockSharesOutstanding: "NumberOfSharesOutstanding",
  };
  for (const [us, tag] of Object.entries(mappings)) {
    const concept = facts.facts["us-gaap"][us];
    foreign.facts["ifrs-full"][tag] = {
      units: Object.fromEntries(
        Object.entries(concept.units).map(([unit, fs]) => [
          unit === "USD" ? currency : unit,
          fs.map((f) => ({ ...f, form: f.form === "10-K" ? "20-F" : "6-K" })),
        ]),
      ),
    };
  }
  return {
    facts: foreign,
    sub: {
      ...sub,
      filings: { recent: { ...sub.filings.recent, form: ["6-K", "20-F"] } },
    },
  };
}
describe("foreign issuers and expanded accounting concepts", () => {
  it("normalizes IFRS financials in their original reporting currency with source tags intact", () => {
    const { facts, sub } = ifrsFixture(),
      r = normalizeFinancials(facts, sub, "FOREIGN", "2025-11-15T00:00:00Z");
    expect(r.currency).toBe("EUR");
    expect(r.taxonomy).toBe("ifrs-full");
    expect(r.annual[1].metrics.revenue.value).toBe(1000);
    expect(r.annual[1].metrics.capex.value).toBe(100);
    expect(r.annual[1].metrics.revenue.sources[0]).toMatchObject({
      tag: "ifrs-full:Revenue",
      unit: "EUR",
      form: "20-F",
    });
    expect(r.ttm?.metrics.reportedFcf.value).toBe(154);
  });
  it("does not treat semiannual 6-K periods as US quarterly reports", () => {
    const { facts, sub } = ifrsFixture();
    for (const c of Object.values(facts.facts["ifrs-full"]))
      for (const fs of Object.values(c.units))
        for (const f of fs)
          if (f.end.endsWith("-09-30")) f.end = f.end.slice(0, 4) + "-12-31";
    const r = normalizeFinancials(
      facts,
      sub,
      "FOREIGN",
      "2026-02-15T00:00:00Z",
    );
    expect(r.interim?.end).toBe("2025-12-31");
    expect(r.quarter).toBeNull();
    expect(r.ttm?.end).toBe("2025-12-31");
  });
  it("recognizes Canadian 40-F annual periods with unusual fiscal year ends", () => {
    const { facts, sub } = ifrsFixture();
    for (const c of Object.values(facts.facts["ifrs-full"]))
      for (const fs of Object.values(c.units))
        for (const f of fs) if (f.form === "20-F") f.form = "40-F";
    const r = normalizeFinancials(
      facts,
      sub,
      "FOREIGN",
      "2025-11-15T00:00:00Z",
    );
    expect(r.annual[1].end).toBe("2025-06-30");
    expect(r.annual[1].metrics.revenue.sources[0].form).toBe("40-F");
  });
  it("does not mix USD-only expense facts into EUR revenue periods", () => {
    const { facts, sub } = ifrsFixture();
    const c = facts.facts["ifrs-full"].ProfitLossFromOperatingActivities;
    c.units.USD = c.units.EUR;
    delete c.units.EUR;
    const r = normalizeFinancials(
      facts,
      sub,
      "FOREIGN",
      "2025-11-15T00:00:00Z",
    );
    expect(r.currency).toBe("EUR");
    expect(r.annual[1].metrics.operatingIncome.value).toBeNull();
  });
  it("blocks ambiguous dual-currency annual revenue instead of assuming USD", () => {
    const { facts, sub } = ifrsFixture();
    const c = facts.facts["ifrs-full"].Revenue;
    c.units.USD = c.units.EUR;
    const r = normalizeFinancials(
      facts,
      sub,
      "FOREIGN",
      "2025-11-15T00:00:00Z",
    );
    expect(r.currency).toBeNull();
    expect(r.currencyCandidates).toEqual(["EUR", "USD"]);
    expect(r.annual).toEqual([]);
  });
  it("prevents a non-USD company from initializing the USD DCF even with all manual inputs filled", () => {
    const { facts, sub } = ifrsFixture();
    const r = normalizeFinancials(
      facts,
      sub,
      "FOREIGN",
      "2025-11-15T00:00:00Z",
    );
    const inputs = {
      ...initializeInputs(r),
      excessCash: 0,
      debt: 0,
      otherClaims: 0,
      shares: 100,
      rationale: "Reviewed",
      acknowledged: true,
    };
    expect(initializationIssues(r, inputs).join(" ")).toContain("USD");
    expect(toDcfDataset(r, inputs, 10)).toBeNull();
  });
  it("keeps unsuitable issuer classification authoritative over complete financial inputs", () => {
    const { facts, sub } = fixture();
    const r = normalizeFinancials(facts, sub, "BANK", "2025-11-15T00:00:00Z");
    r.security = classifySecurity(
      {
        ticker: "BANK",
        cik: "0000001234",
        name: "Fixture Bank",
        exchange: "NYSE",
      },
      { ...sub, sic: "6021" },
    );
    r.eligibility = valuationEligibility(r.security, "USD");
    expect(
      toDcfDataset(
        r,
        {
          ...initializeInputs(r),
          excessCash: 0,
          debt: 0,
          otherClaims: 0,
          shares: 100,
          rationale: "Reviewed",
          acknowledged: true,
        },
        10,
      ),
    ).toBeNull();
  });
  it("derives D&A from non-overlapping same-filing components when combined total is absent", () => {
    const { facts, sub } = fixture();
    delete facts.facts["us-gaap"].DepreciationDepletionAndAmortization;
    delete facts.facts["us-gaap"]
      .DepreciationDepletionAndAmortizationPropertyPlantAndEquipment;
    facts.facts["us-gaap"].Depreciation = {
      units: { USD: [fact("2024-07-01", "2025-06-30", 30)] },
    };
    facts.facts["us-gaap"].AmortizationOfIntangibleAssets = {
      units: { USD: [fact("2024-07-01", "2025-06-30", 10)] },
    };
    const r = normalizeFinancials(facts, sub, "ANY", "2025-11-15T00:00:00Z");
    expect(r.annual[1].metrics.depreciation.value).toBe(40);
    expect(r.annual[1].metrics.depreciation.sources).toHaveLength(2);
  });
  it("requires both continuing and discontinued OCF components rather than treating a partial flow as total", () => {
    const { facts, sub } = fixture();
    delete facts.facts["us-gaap"].NetCashProvidedByUsedInOperatingActivities;
    facts.facts[
      "us-gaap"
    ].NetCashProvidedByUsedInOperatingActivitiesContinuingOperations = {
      units: { USD: [fact("2024-07-01", "2025-06-30", 230)] },
    };
    let r = normalizeFinancials(facts, sub, "ANY", "2025-11-15T00:00:00Z");
    expect(r.annual[1].metrics.operatingCashFlow.value).toBeNull();
    facts.facts[
      "us-gaap"
    ].NetCashProvidedByUsedInOperatingActivitiesDiscontinuedOperations = {
      units: { USD: [fact("2024-07-01", "2025-06-30", 10)] },
    };
    r = normalizeFinancials(facts, sub, "ANY", "2025-11-15T00:00:00Z");
    expect(r.annual[1].metrics.operatingCashFlow.value).toBe(240);
  });
  it("discloses limited financial history rather than inventing ten years", () => {
    const { facts, sub } = fixture();
    const r = normalizeFinancials(facts, sub, "ANY", "2025-11-15T00:00:00Z");
    expect(
      r.warnings.some((w) => w.includes("2 reliable annual periods")),
    ).toBe(true);
  });
  it("does not treat PPE-only depreciation as complete D&A without intangible amortization coverage", () => {
    const { facts, sub } = fixture();
    delete facts.facts["us-gaap"].DepreciationDepletionAndAmortization;
    facts.facts[
      "us-gaap"
    ].DepreciationDepletionAndAmortizationPropertyPlantAndEquipment = {
      units: { USD: [fact("2024-07-01", "2025-06-30", 40)] },
    };
    expect(
      normalizeFinancials(facts, sub, "ANY", "2025-11-15T00:00:00Z").annual[1]
        .metrics.depreciation.value,
    ).toBeNull();
  });
});
