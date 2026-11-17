import { describe, expect, it } from "vitest";
import {
  applySlowdown,
  calculateDcf,
  discount,
  enterpriseToEquity,
  entryPrice,
  fcff,
  perShare,
  terminalValue,
  updateScenario,
} from "./dcf";
import {
  createScenarios,
  defaultAssumptions,
  illustrativeData,
  illustrativeProvider,
} from "../data/illustrative";

describe("financial primitives", () => {
  it("calculates FCFF and applies the specified signed tax convention to losses", () => {
    expect(fcff(100, 0.25, 10, 20, 5)).toBe(60);
    expect(fcff(-100, 0.25, 10, 20, 5)).toBe(-90);
  });
  it("discounts annual cash flows at year end", () => {
    expect(discount(121, 0.1, 2)).toBeCloseTo(100);
    expect(discount(-110, 0.1, 1)).toBeCloseTo(-100);
  });
  it("calculates terminal value using next-year FCFF", () =>
    expect(terminalValue(105, 0.1, 0.05)).toBeCloseTo(2100));
  it("bridges enterprise value to equity and per share", () => {
    expect(enterpriseToEquity(1000, 100, 200, 50)).toBe(850);
    expect(perShare(850, 100)).toBe(8.5);
    expect(perShare(-850, 100)).toBe(-8.5);
  });
  it("calculates all requested entry prices", () => {
    expect([0.15, 0.25, 0.35, 0.5].map((m) => entryPrice(100, m))).toEqual([
      85, 75, 65, 50,
    ]);
  });
  it.each([
    [0.05, 0.05],
    [0.04, 0.05],
    [0, -0.01],
    [0.1, -1],
  ])("rejects invalid terminal inputs %s / %s", (wacc, growth) =>
    expect(() => terminalValue(100, wacc, growth)).toThrow(),
  );
  it("rejects zero shares and invalid numeric inputs", () => {
    expect(() => perShare(100, 0)).toThrow();
    expect(() =>
      calculateDcf(illustrativeData, { ...defaultAssumptions, wacc: NaN }),
    ).toThrow();
    expect(() =>
      calculateDcf(illustrativeData, { ...defaultAssumptions, shares: 0 }),
    ).toThrow();
    expect(() =>
      calculateDcf(illustrativeData, { ...defaultAssumptions, taxRate: 1.1 }),
    ).toThrow();
    expect(() => discount(1, -1, 1)).toThrow();
    expect(() => entryPrice(1, 1.1)).toThrow();
  });
});
describe("integrated ten-year DCF", () => {
  it("matches a hand-calculated level perpetuity", () => {
    // Revenue 1,000; EBIT 200; taxes 50; D&A 40; CapEx 60; delta NWC 0.
    // FCFF 130 forever; WACC 10%; TV at t10 = 1300.
    // PV annual flows = 130*(1-1.1^-10)/.1 = 798.7937237416.
    // PV TV = 501.2062762584; EV = 1300; equity = 1340; per share = 13.40.
    const result = calculateDcf(illustrativeData, {
      ...defaultAssumptions,
      growthEarly: 0,
      growthMiddle: 0,
      growthLate: 0,
      initialMargin: 0.2,
      targetMargin: 0.2,
      terminalGrowth: 0,
    });
    expect(result.forecast).toHaveLength(10);
    expect(result.forecast[0].fcff).toBe(130);
    expect(result.pvForecast).toBeCloseTo(798.7937237416, 7);
    expect(result.pvTerminalValue).toBeCloseTo(501.2062762584, 7);
    expect(result.enterpriseValue).toBeCloseTo(1300);
    expect(result.equityValue).toBeCloseTo(1340);
    expect(result.valuePerShare).toBeCloseTo(13.4);
  });
  it("builds year 11 using terminal growth and reinvestment", () => {
    const r = calculateDcf(illustrativeData, defaultAssumptions),
      y10 = r.forecast[9];
    expect(r.terminalYear.revenue).toBeCloseTo(y10.revenue * 1.025);
    expect(r.terminalYear.changeInNwc).toBeCloseTo(y10.revenue * 0.025 * 0.1);
    expect(r.terminalValue).toBeCloseTo(r.terminalYear.fcff / 0.075);
    expect(r.forecast[0].margin).toBe(0.21);
    expect(r.forecast[9].margin).toBeCloseTo(0.28);
  });
  it("preserves negative flows, terminal value and equity", () => {
    const r = calculateDcf(illustrativeData, {
      ...defaultAssumptions,
      initialMargin: -0.2,
      targetMargin: -0.2,
    });
    expect(r.forecast.every((y) => y.fcff < 0)).toBe(true);
    expect(r.terminalValue).toBeLessThan(0);
    expect(r.equityValue).toBeLessThan(0);
    expect(r.valuePerShare).toBeLessThan(0);
  });
  it("handles a zero market price without dividing by zero", () =>
    expect(
      calculateDcf(
        {
          ...illustrativeData,
          market: { ...illustrativeData.market, price: 0 },
        },
        defaultAssumptions,
      ).upside,
    ).toBeNull());
});
describe("scenario controls and provider boundary", () => {
  it.each(["early", "middle", "late", "all"] as const)(
    "applies slowdown only to %s",
    (period) => {
      const a = {
          ...defaultAssumptions,
          growthEarly: 0.2,
          growthMiddle: 0.1,
          growthLate: 0.06,
        },
        adjusted = applySlowdown(a, 0.5, period);
      expect(adjusted.growthEarly).toBeCloseTo(
        period === "early" || period === "all" ? 0.1 : 0.2,
      );
      expect(adjusted.growthMiddle).toBeCloseTo(
        period === "middle" || period === "all" ? 0.05 : 0.1,
      );
      expect(adjusted.growthLate).toBeCloseTo(
        period === "late" || period === "all" ? 0.03 : 0.06,
      );
      expect(a.growthEarly).toBe(0.2);
      expect(
        calculateDcf(illustrativeData, adjusted).valuePerShare,
      ).toBeLessThan(calculateDcf(illustrativeData, a).valuePerShare);
    },
  );
  it("handles slowdown boundaries and negative growth consistently", () => {
    expect(applySlowdown(defaultAssumptions, 0, "all")).toEqual(
      defaultAssumptions,
    );
    expect(applySlowdown(defaultAssumptions, 1, "all").growthEarly).toBe(0);
    expect(
      applySlowdown({ ...defaultAssumptions, growthEarly: -0.1 }, 0.5, "early")
        .growthEarly,
    ).toBe(-0.05);
    expect(() => applySlowdown(defaultAssumptions, 2, "all")).toThrow();
  });
  it("keeps scenario assumptions and results independent", () => {
    const scenarios = createScenarios(),
      updated = updateScenario(scenarios, "base", "growthEarly", 0.4);
    expect(updated[0]).toBe(scenarios[0]);
    expect(updated[2]).toBe(scenarios[2]);
    expect(scenarios[1].assumptions.growthEarly).toBe(0.15);
    expect(calculateDcf(illustrativeData, updated[0].assumptions)).toEqual(
      calculateDcf(illustrativeData, scenarios[0].assumptions),
    );
    expect(
      calculateDcf(illustrativeData, updated[1].assumptions).valuePerShare,
    ).toBeGreaterThan(
      calculateDcf(illustrativeData, scenarios[1].assumptions).valuePerShare,
    );
    expect(createScenarios()[1].assumptions.growthEarly).toBe(0.15);
  });
  it("rejects unsupported symbols rather than returning demo data", async () => {
    await expect(
      illustrativeProvider.getCompanyFinancials("AAPL"),
    ).rejects.toThrow("not supported");
    await expect(
      illustrativeProvider.getCompanyFinancials(" astr "),
    ).resolves.toHaveProperty("company.ticker", "ASTR");
  });
});
