import type { FinancialDataset } from "../finance/types";
export interface FinancialDataProvider {
  getCompanyFinancials(ticker: string): Promise<FinancialDataset>;
}
export class UnsupportedTickerError extends Error {
  constructor(ticker: string) {
    super(
      `“${ticker}” is not supported in Phase 1. Use ASTR, our fictional illustrative company. Live financial data arrives in Phase 2.`,
    );
    this.name = "UnsupportedTickerError";
  }
}
