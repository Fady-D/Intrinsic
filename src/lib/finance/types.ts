/** Money and shares are in millions of USD and millions of shares; prices are USD/share. Rates are decimals. */
export interface DataSourceMetadata {
  name: string;
  kind: "illustrative" | "sec" | "market";
  asOf: string;
  currency: "USD";
  monetaryUnit: "millions";
  note: string;
}
export interface Company {
  ticker: string;
  name: string;
  sector: string;
  description: string;
}
export interface IncomeStatement {
  year: number;
  periodLabel?: string;
  revenue: number;
  ebit: number;
  cashTaxes: number | null;
}
export interface CashFlowStatement {
  year: number;
  depreciation: number;
  capex: number;
  changeInNwc: number;
}
export interface BalanceSheet {
  year: number;
  excessCash: number;
  debt: number;
  otherClaims: number;
  netWorkingCapital: number | null;
}
export interface MarketPrice {
  price: number;
  dilutedShares: number;
  asOf: string;
}
export interface FinancialDataset {
  fiscalForecast?: {
    anchorEnd: string;
    valuationEnd: string;
    yearEnds: string[];
    elapsedActuals?: {
      revenue: number;
      ebit: number;
      depreciation: number;
      capex: number;
      changeInNwc: number;
    };
  };
  company: Company;
  incomeStatements: IncomeStatement[];
  cashFlows: CashFlowStatement[];
  balanceSheets: BalanceSheet[];
  market: MarketPrice;
  source: DataSourceMetadata;
}
export interface Assumptions {
  annualGrowth?: number[];
  growthEarly: number;
  growthMiddle: number;
  growthLate: number;
  initialMargin: number;
  targetMargin: number;
  taxRate: number;
  daRate: number;
  capexRate: number;
  nwcRate: number;
  wacc: number;
  terminalGrowth: number;
  marginOfSafety: number;
  shares: number;
}
export interface ForecastYear {
  fiscalEnd?: string;
  discountPeriod?: number;
  elapsedFcff?: number;
  remainingFcff?: number;
  year: number;
  period: number;
  growth: number;
  revenue: number;
  margin: number;
  ebit: number;
  cashTaxes: number;
  nopat: number;
  depreciation: number;
  capex: number;
  changeInNwc: number;
  fcff: number;
  discountFactor: number;
  presentValue: number;
}
export interface DcfResult {
  forecast: ForecastYear[];
  terminalYear: ForecastYear;
  terminalValue: number;
  pvTerminalValue: number;
  pvForecast: number;
  enterpriseValue: number;
  equityValue: number;
  valuePerShare: number;
  entryPrice: number;
  upside: number | null;
  terminalWeight: number | null;
  discountToFairValue: number | null;
  excessCash: number;
  debt: number;
  otherClaims: number;
}
export type ScenarioId = "bear" | "base" | "bull";
export interface ValuationScenario {
  id: ScenarioId;
  label: string;
  assumptions: Assumptions;
}
export type SlowdownPeriod = "early" | "middle" | "late" | "all";
