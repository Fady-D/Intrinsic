import { describe, it, expect } from "vitest";
import { buildRevenuePlan, applyFiscalForecast } from "./forecast";
import {
  parseFmpEstimates,
  verifyReportingCurrency,
  FmpEstimateProvider,
} from "./provider";
import type { RevenueEstimate } from "./types";
import { fixture } from "../sec/fixtures/company";
import { normalizeFinancials } from "../sec/normalize";
import { defaultAssumptions, illustrativeData } from "../data/illustrative";
import { applySlowdown, calculateDcf } from "../finance/dcf";
const company = () => {
  const { facts, sub } = fixture();
  return normalizeFinancials(facts, sub, "TEST", "2025-11-15T00:00:00Z");
};
const estimate = (fiscalEnd: string, revenue: number): RevenueEstimate => ({
  fiscalEnd,
  revenue,
  low: revenue * 0.9,
  high: revenue * 1.1,
  analysts: 10,
  ebit: null,
  currency: "USD",
  source: "FMP consensus",
  retrievedAt: "2025-11-15T00:00:00Z",
  updatedAt: null,
  note: "",
});
describe("annual forecast integration", () => {
  it("applies ten independent growth rates to the correct years, with terminal and slowdown compatibility", () => {
    const a = {
      ...defaultAssumptions,
      annualGrowth: [0.1, 0.2, 0, 0, 0, 0, 0, 0, 0, 0],
    };
    const r = calculateDcf(illustrativeData, a);
    expect(r.forecast[0].revenue).toBeCloseTo(1100);
    expect(r.forecast[1].revenue).toBeCloseTo(1320);
    expect(r.forecast[2].revenue).toBeCloseTo(1320);
    expect(r.terminalYear.revenue).toBeCloseTo(1320 * 1.025);
    expect(applySlowdown(a, 0.5, "early").annualGrowth?.slice(0, 4)).toEqual([
      0.05, 0.1, 0, 0,
    ]);
    expect(a.annualGrowth[0]).toBe(0.1);
    expect(() =>
      calculateDcf(illustrativeData, { ...a, annualGrowth: [0.1] }),
    ).toThrow();
  });
  it("anchors non-calendar consensus to completed fiscal revenue, not TTM, and fades only modeled years", () => {
    const d = company(),
      p = buildRevenuePlan(
        d,
        defaultAssumptions,
        "consensus",
        [estimate("2026-06-30", 1100), estimate("2027-06-30", 1210)],
        undefined,
        "2025-11-15",
      );
    expect(d.ttm?.metrics.revenue.value).toBe(1100);
    expect(p.growths[0]).toBeCloseTo(0.1);
    expect(p.rows[1].revenue).toBeCloseTo(1210);
    expect(p.rows[0].source).toBe("FMP consensus");
    expect(p.rows[2].source).toBe("Model extrapolation");
    expect(p.growths[2]).toBeLessThan(0.1);
    expect(p.growths[9]).toBeCloseTo(defaultAssumptions.growthLate);
  });
  it("rejects past, currency-mismatched, duplicated or unaligned estimates and identifies historical fallback", () => {
    const d = company();
    for (const rows of [
      [estimate("2025-06-30", 1100)],
      [{ ...estimate("2026-06-30", 1100), currency: "EUR" }],
      [estimate("2026-12-31", 1100)],
      [
        estimate("2026-06-30", 1100),
        estimate("2026-06-30", 1200),
        estimate("2026-06-30", 1300),
      ],
    ])
      expect(
        buildRevenuePlan(
          d,
          defaultAssumptions,
          "consensus",
          rows,
          undefined,
          "2025-11-15",
        ).mode,
      ).toBe("historical");
    const p = buildRevenuePlan(
      d,
      defaultAssumptions,
      "consensus",
      [estimate("2028-06-30", 1331)],
      undefined,
      "2025-11-15",
    );
    expect(p.rows[0].source).toBe("Model interpolation");
    expect(p.rows[2].revenue).toBeCloseTo(1331);
  });
  it("supports user forecasts and ten custom years without representing either as external consensus", () => {
    const d = company(),
      e = {
        ...estimate("2026-06-30", 1100),
        source: "User-provided" as const,
        analysts: null,
      };
    expect(
      buildRevenuePlan(
        d,
        defaultAssumptions,
        "consensus",
        [e],
        undefined,
        "2025-11-15",
      ).rows[0].source,
    ).toBe("User-provided");
    const p = buildRevenuePlan(
      d,
      defaultAssumptions,
      "custom",
      [],
      Array(10).fill(0.03),
    );
    expect(p.growths).toEqual(Array(10).fill(0.03));
    expect(p.rows.every((r) => r.source === "Manually overridden")).toBe(true);
  });
  it("subtracts elapsed policy FCFF and discounts remaining fiscal cash flows at fractional periods", () => {
    const d = company(),
      a = d.annual.at(-1)!,
      y = d.interim!;
    for (const [key, value] of Object.entries({
      receivables: 100,
      inventory: 20,
      payables: 40,
    }))
      a.metrics[key as keyof typeof a.metrics].value = value;
    for (const [key, value] of Object.entries({
      receivables: 110,
      inventory: 20,
      payables: 45,
      operatingIncome: 40,
      depreciation: 10,
      capex: 15,
    }))
      y.metrics[key as keyof typeof y.metrics].value = value;
    const plan = buildRevenuePlan(
      d,
      defaultAssumptions,
      "custom",
      [],
      Array(10).fill(0),
      "2025-11-15",
    );
    const fiscal = applyFiscalForecast(d, illustrativeData, plan);
    expect(fiscal.error).toBeNull();
    const r = calculateDcf(fiscal.dataset, {
      ...defaultAssumptions,
      initialMargin: 0.2,
      targetMargin: 0.2,
      terminalGrowth: 0,
      nwcRate: 0,
      annualGrowth: Array(10).fill(0),
    });
    const time =
      (Date.parse("2026-06-30") - Date.parse("2025-09-30")) / 86400000 / 365.25;
    expect(r.forecast[0].fcff).toBeCloseTo(130);
    expect(r.forecast[0].elapsedFcff).toBeCloseTo(20);
    expect(r.forecast[0].remainingFcff).toBeCloseTo(110);
    expect(r.forecast[0].presentValue).toBeCloseTo(110 / 1.1 ** time);
    expect(r.pvTerminalValue).toBeCloseTo(
      1300 / 1.1 ** r.forecast[9].discountPeriod!,
    );
    y.metrics.depreciation.value = null;
    expect(applyFiscalForecast(d, illustrativeData, plan).error).toContain(
      "YTD",
    );
  });
  it("normalizes documented FMP fields, checks reporting units and handles no-key/invalid/stale responses", async () => {
    const r = parseFmpEstimates(
      [
        {
          symbol: "TEST",
          date: "2026-06-30",
          revenueAvg: 1100e6,
          revenueLow: 1000e6,
          revenueHigh: 1200e6,
          numAnalystsRevenue: 16,
          ebitAvg: 200e6,
        },
      ],
      "TEST",
      "USD",
      "2025-11-15T00:00:00Z",
    );
    expect(verifyReportingCurrency([{symbol:"TEST",date:"2025-06-30",period:"FY",reportedCurrency:"USD",cik:"999"}],"TEST","2025-06-30","USD","1234")).toBe(false);
    expect(r.estimates[0].revenue).toBe(1100);
    expect(r.estimates[0].ebit).toBe(200);
    expect(r.estimates[0].analysts).toBe(16);
    expect(r.warnings[0]).toContain("revision");
    expect(
      verifyReportingCurrency(
        [
          {
            symbol: "TEST",
            date: "2025-06-30",
            period: "FY",
            reportedCurrency: "EUR",
          },
        ],
        "TEST",
        "2025-06-30",
        "USD",
      ),
    ).toBe(false);
    expect(
      parseFmpEstimates(
        [
          {
            symbol: "TEST",
            date: "2026-06-30",
            revenueAvg: 1100e6,
            numAnalystsRevenue: 16,
            updatedAt: "2020-01-01",
          },
        ],
        "TEST",
        "USD",
        "2025-11-15",
      ).estimates,
    ).toEqual([]);
    expect(() =>
      parseFmpEstimates({ Error: "restricted" }, "TEST", "USD", "2025-11-15"),
    ).toThrow();
    expect(
      (
        await new FmpEstimateProvider("").getAnnualEstimates(
          "TEST",
          "2025-06-30",
          "USD",
        )
      ).status,
    ).toBe("unconfigured");
  });
});
