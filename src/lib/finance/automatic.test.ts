import { describe, it, expect } from "vitest";
import { calculateWacc, parseTreasuryYield } from "./wacc";
import { buildAutomaticBaseline } from "./automatic";
import { calculateDcf } from "./dcf";
import { fixture } from "../sec/fixtures/company";
import { normalizeFinancials } from "../sec/normalize";
function company() {
  const { facts, sub } = fixture();
  const d = normalizeFinancials(facts, sub, "TEST", "2025-11-15T00:00:00Z");
  d.interim = null;
  d.ttm = null;
  d.latestBalance.end = "2025-06-30";
  return d;
}
describe("automatic fundamentals and WACC", () => {
  it("matches an independently calculated WACC: 70% equity at 9%, 30% debt at 6% less 25% tax = 7.65%", () => {
    const r = calculateWacc({
      riskFree: 0.04,
      beta: 1,
      equityRiskPremium: 0.05,
      costOfDebt: 0.06,
      equityCapital: 700,
      debt: 300,
      taxRate: 0.25,
    });
    expect(r.costOfEquity).toBeCloseTo(0.09);
    expect(r.afterTaxCostOfDebt).toBeCloseTo(0.045);
    expect(r.rate).toBeCloseTo(0.0765);
    expect(() =>
      calculateWacc({
        riskFree: null,
        beta: 1,
        equityRiskPremium: 0.05,
        costOfDebt: 0.06,
        equityCapital: 0,
        debt: 300,
        taxRate: 0.25,
      }),
    ).toThrow();
  });
  it("initializes a hand-calculated valuation without treating manual values as reported facts", () => {
    const b = buildAutomaticBaseline(company(), null, {
      financial: {
        excessCash: 50,
        debt: 100,
        otherClaims: 0,
        shares: 100,
        depreciationRate: 0.04,
      },
      directWacc: 0.1,
      assumptions: {
        growthEarly: 0,
        growthMiddle: 0,
        growthLate: 0,
        initialMargin: 0.2,
        targetMargin: 0.2,
        taxRate: 0.25,
        capexRate: 0.06,
        nwcRate: 0,
        terminalGrowth: 0,
      },
    });
    expect(b.issues).toEqual([]);
    expect(b.status).toBe("Provisional");
    const r = calculateDcf(b.dataset!, b.scenarios[1].assumptions);
    expect(r.forecast[0].fcff).toBe(130);
    expect(r.enterpriseValue).toBeCloseTo(1300);
    expect(r.equityValue).toBeCloseTo(1250);
    expect(r.valuePerShare).toBeCloseTo(12.5);
    expect(r.entryPrice).toBeCloseTo(9.375);
    expect(b.inputs.acknowledged).toBe(false);
  });
  it("does not turn absent claims, debt or current risk-free rates into zeros", () => {
    const d = company();
    d.latestBalance.metrics.debt = {
      value: null,
      status: "missing",
      sources: [],
    };
    const b = buildAutomaticBaseline(d, null);
    expect(b.status).toBe("Incomplete");
    expect(b.dataset).toBeNull();
    expect(b.inputs.debt).toBeNull();
    expect(b.inputs.otherClaims).toBeNull();
    expect(b.waccInputs.riskFree).toBeNull();
    expect(b.issues.join(" ")).toContain("claims");
  });
  it("uses company-specific history, fades growth and reruns independent scenarios", () => {
    const d = company();
    const b = buildAutomaticBaseline(d, null, {
      financial: { otherClaims: 0 },
      directWacc: 0.1,
      assumptions: { nwcRate: 0.1 },
    });
    expect(b.assumptions.growthEarly).toBeCloseTo(0.2);
    expect(b.assumptions.growthMiddle).toBeLessThan(b.assumptions.growthEarly);
    expect(b.assumptions.growthLate).toBeLessThan(b.assumptions.growthMiddle);
    expect(b.scenarios[0].assumptions).not.toBe(b.scenarios[1].assumptions);
    expect(b.scenarios[0].assumptions.capexRate).toBeGreaterThan(
      b.scenarios[1].assumptions.capexRate,
    );
    expect(b.inputs.excessCash).toBe(120);
    expect(b.inputs.shares).toBe(100);
  });
  it("parses only recent Treasury observations and rejects stale/future yields", () => {
    const xml =
      "<feed><entry><d:NEW_DATE>2026-11-16T00:00:00</d:NEW_DATE><d:BC_10YEAR>4.00</d:BC_10YEAR></entry><entry><d:NEW_DATE>2027-01-01</d:NEW_DATE><d:BC_10YEAR>8</d:BC_10YEAR></entry></feed>";
    expect(parseTreasuryYield(xml, new Date("2026-11-17")).rate).toBe(0.04);
    expect(parseTreasuryYield(xml, new Date("2026-12-20")).rate).toBeNull();
  });
});
