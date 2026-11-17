import { describe, it, expect } from "vitest";
import { fixture } from "../sec/fixtures/company";
import { normalizeFinancials } from "../sec/normalize";
import {
  referencePrice,
  initializeInputs,
  initializeScenarios,
  initializationIssues,
  toDcfDataset,
  researchReducer,
  initialLoadState,
} from "./research";
import { calculateDcf } from "../finance/dcf";
const data = () => {
  const { facts, sub } = fixture();
  return normalizeFinancials(facts, sub, "TEST", "2025-11-15T00:00:00Z");
};
describe("verified model initialization and ticker state", () => {
  it("requires justified excess cash, claims and diluted shares instead of manufacturing them", () => {
    const d = data(),
      inputs = initializeInputs(d);
    expect(inputs.excessCash).toBeNull();
    expect(inputs.otherClaims).toBeNull();
    expect(inputs.shares).toBeNull();
    expect(inputs.debt).toBe(130);
    expect(toDcfDataset(d, inputs, null)).toBeNull();
    expect(initializationIssues(d, inputs).length).toBeGreaterThan(0);
  });
  it("initializes operating ratios from actual aligned metrics, with explicit forecast defaults", () => {
    const d = data(),
      scenarios = initializeScenarios(d);
    expect(scenarios[1].assumptions.initialMargin).toBeCloseTo(0.2);
    expect(scenarios[1].assumptions.capexRate).toBeCloseTo(0.1);
    expect(scenarios[1].assumptions.shares).toBeNaN();
    const inputs = {
      ...initializeInputs(d),
      excessCash: 50,
      otherClaims: 0,
      shares: 105,
      rationale: "Synthetic test estimates",
      acknowledged: true,
    };
    const dataset = toDcfDataset(d, inputs, null)!;
    expect(dataset.source.kind).toBe("sec");
    const r = calculateDcf(dataset, {
      ...scenarios[1].assumptions,
      shares: 105,
    });
    expect(Number.isFinite(r.valuePerShare)).toBe(true);
    expect(r.upside).toBeNull();
  });
  it("clears the prior company immediately and ignores late responses after switching", () => {
    const a = researchReducer(initialLoadState, {
        type: "start",
        id: 1,
        ticker: "TEST",
      }),
      b = researchReducer(a, { type: "success", id: 1, data: data() }),
      c = researchReducer(b, { type: "start", id: 2, ticker: "AAPL" });
    expect(c.data).toBeNull();
    expect(researchReducer(c, { type: "success", id: 1, data: data() })).toBe(
      c,
    );
    expect(
      researchReducer(c, { type: "failure", id: 1, error: "old error" }),
    ).toBe(c);
    expect(
      researchReducer(c, { type: "success", id: 2, data: data() }).status,
    ).toBe("error");
  });
  it("rejects incomplete TTM and newer balance periods rather than mixing anchors", () => {
    const d = data();
    d.ttm = null;
    const i = {
      ...initializeInputs(d),
      excessCash: 0,
      otherClaims: 0,
      shares: 100,
      rationale: "Reviewed",
      acknowledged: true,
    };
    expect(toDcfDataset(d, i, 10)).toBeNull();
  });
  it("does not label a provider quote as a manual price when an invalid override is present", () => {
    const quote = {
      ticker: "TEST",
      price: 50,
      currency: "USD" as const,
      asOf: "2025-11-14",
      retrievedAt: "2025-11-15",
      source: "Fixture",
      timing: "previous-close" as const,
      stale: false,
    };
    expect(referencePrice("100", quote)).toBe(100);
    expect(referencePrice("-1", quote)).toBeNull();
    expect(referencePrice("", quote)).toBe(50);
    expect(referencePrice("", { ...quote, stale: true })).toBeNull();
  });
});
