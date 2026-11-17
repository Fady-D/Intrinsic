import type {
  Assumptions,
  FinancialDataset,
  ValuationScenario,
} from "../finance/types";
import type { FinancialDataProvider } from "./provider";
import { UnsupportedTickerError } from "./provider";
export const illustrativeData: FinancialDataset = {
  company: {
    ticker: "ASTR",
    name: "Aster Systems",
    sector: "Enterprise software",
    description:
      "A fictional enterprise software business created exclusively to demonstrate valuation mechanics.",
  },
  incomeStatements: [
    { year: 2022, revenue: 640, ebit: 96, cashTaxes: 24 },
    { year: 2023, revenue: 760, ebit: 129.2, cashTaxes: 32.3 },
    { year: 2024, revenue: 890, ebit: 169.1, cashTaxes: 42.275 },
    { year: 2025, revenue: 1000, ebit: 200, cashTaxes: 50 },
  ],
  cashFlows: [
    { year: 2022, depreciation: 25.6, capex: 38.4, changeInNwc: 8 },
    { year: 2023, depreciation: 30.4, capex: 45.6, changeInNwc: 12 },
    { year: 2024, depreciation: 35.6, capex: 53.4, changeInNwc: 13 },
    { year: 2025, depreciation: 40, capex: 60, changeInNwc: 11 },
  ],
  balanceSheets: [
    {
      year: 2022,
      excessCash: 120,
      debt: 220,
      otherClaims: 10,
      netWorkingCapital: 64,
    },
    {
      year: 2023,
      excessCash: 150,
      debt: 210,
      otherClaims: 10,
      netWorkingCapital: 76,
    },
    {
      year: 2024,
      excessCash: 180,
      debt: 200,
      otherClaims: 10,
      netWorkingCapital: 89,
    },
    {
      year: 2025,
      excessCash: 250,
      debt: 200,
      otherClaims: 10,
      netWorkingCapital: 100,
    },
  ],
  market: { price: 32, dilutedShares: 100, asOf: "2025-12-31" },
  source: {
    name: "Intrinsic illustrative dataset",
    kind: "illustrative",
    asOf: "2025-12-31",
    currency: "USD",
    monetaryUnit: "millions",
    note: "Entirely fictional company, statements, share count and price. No real-company financials or live quotes.",
  },
};
export const defaultAssumptions: Assumptions = {
  growthEarly: 0.15,
  growthMiddle: 0.1,
  growthLate: 0.05,
  initialMargin: 0.21,
  targetMargin: 0.28,
  taxRate: 0.25,
  daRate: 0.04,
  capexRate: 0.06,
  nwcRate: 0.1,
  wacc: 0.1,
  terminalGrowth: 0.025,
  marginOfSafety: 0.25,
  shares: 100,
};
export function createScenarios(): ValuationScenario[] {
  return [
    {
      id: "bear",
      label: "Bear",
      assumptions: {
        ...defaultAssumptions,
        growthEarly: 0.08,
        growthMiddle: 0.05,
        growthLate: 0.03,
        targetMargin: 0.22,
        wacc: 0.12,
        terminalGrowth: 0.02,
      },
    },
    { id: "base", label: "Base", assumptions: { ...defaultAssumptions } },
    {
      id: "bull",
      label: "Bull",
      assumptions: {
        ...defaultAssumptions,
        growthEarly: 0.2,
        growthMiddle: 0.14,
        growthLate: 0.08,
        targetMargin: 0.33,
        wacc: 0.09,
        terminalGrowth: 0.03,
      },
    },
  ];
}
export const illustrativeProvider: FinancialDataProvider = {
  async getCompanyFinancials(ticker) {
    if (ticker.trim().toUpperCase() !== illustrativeData.company.ticker)
      throw new UnsupportedTickerError(ticker);
    return structuredClone(illustrativeData);
  },
};
