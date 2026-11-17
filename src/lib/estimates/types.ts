export interface RevenueEstimate {
  fiscalEnd: string;
  revenue: number;
  low: number | null;
  high: number | null;
  analysts: number | null;
  ebit: number | null;
  currency: string;
  source: "FMP consensus" | "User-provided";
  note: string;
  retrievedAt: string;
  updatedAt: string | null;
}
export interface EstimateResponse {
  status: "available" | "unconfigured" | "unavailable";
  provider: string;
  retrievedAt: string;
  estimates: RevenueEstimate[];
  warnings: string[];
}
export type ForecastMode = "consensus" | "historical" | "custom";
export interface RevenuePlan {
  mode: ForecastMode;
  requestedMode: ForecastMode;
  growths: number[];
  rows: {
    fiscalEnd: string;
    revenue: number;
    growth: number;
    source: string;
    estimate: RevenueEstimate | null;
  }[];
  warnings: string[];
  anchorEnd: string;
  revision: string;
}
