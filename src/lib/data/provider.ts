import type { FinancialDataset } from "../finance/types";
export interface FinancialDataProvider {
  getCompanyFinancials(ticker: string): Promise<FinancialDataset>;
}
export class UnsupportedTickerError extends Error {
  constructor(ticker: string) {
    super(
      `“${ticker}” is not supported by the fictional demo provider. Use ASTR for illustrative data, or use the SEC research search above for actual company financials.`,
    );
    this.name = "UnsupportedTickerError";
  }
}
