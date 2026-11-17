import { CachedHttpClient } from "../server/http";
export interface Quote {
  ticker: string;
  price: number;
  currency: "USD";
  asOf: string;
  retrievedAt: string;
  source: string;
  timing: "previous-close" | "delayed" | "real-time";
  stale: boolean;
}
export interface QuoteResult {
  quote: Quote | null;
  warning: string | null;
}
export interface QuoteProvider {
  getQuote(ticker: string, force?: boolean): Promise<QuoteResult>;
}
export function quoteIsStale(asOf: string, now = Date.now()): boolean {
  const stamp = Date.parse(asOf);
  return (
    !Number.isFinite(stamp) ||
    stamp > now + 60_000 ||
    now - stamp > 96 * 3600_000
  );
}
export function parseAlphaQuote(
  raw: unknown,
  ticker: string,
  now = new Date(),
): Quote {
  if (!raw || typeof raw !== "object" || !("Global Quote" in raw))
    throw new Error("Quote API returned no quote (possibly rate-limited).");
  const q = raw["Global Quote"] as Record<string, unknown>;
  if (
    !q ||
    typeof q !== "object" ||
    q["01. symbol"] !== ticker ||
    typeof q["05. price"] !== "string" ||
    typeof q["07. latest trading day"] !== "string"
  )
    throw new Error("Quote response identity or timestamp is missing.");
  const price = Number(q["05. price"]),
    date = q["07. latest trading day"];
  if (
    !Number.isFinite(price) ||
    price <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new Error("Quote price or date is invalid.");
  // The free GLOBAL_QUOTE endpoint is end-of-day, not a live tick. Date-only precision is retained.
  return {
    ticker,
    price,
    currency: "USD",
    asOf: date,
    retrievedAt: now.toISOString(),
    source: "Alpha Vantage GLOBAL_QUOTE",
    timing: "previous-close",
    stale: quoteIsStale(date, now.getTime()),
  };
}
export class AlphaVantageQuoteProvider implements QuoteProvider {
  constructor(
    private key = process.env.QUOTE_API_KEY,
    private http = new CachedHttpClient(),
  ) {}
  async getQuote(ticker: string, force = false): Promise<QuoteResult> {
    if (!this.key)
      return {
        quote: null,
        warning:
          "No quote provider configured. Enter a manual USD price; no fictional price will be used.",
      };
    try {
      const raw = await this.http.json(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(this.key)}`,
        { ttl: 900_000, force, minInterval: 1000 },
      );
      const quote = parseAlphaQuote(raw, ticker);
      quote.retrievedAt =
        this.http.retrievedAt(
          `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(this.key)}`,
        ) ?? quote.retrievedAt;
      return {
        quote,
        warning: quote.stale
          ? "Quote is stale; confirm or override the price before analysis."
          : "Previous-close quote; not a live market price.",
      };
    } catch {
      return {
        quote: null,
        warning:
          "Quote unavailable or rate-limited. Enter a manual USD price; no substitute quote was used.",
      };
    }
  }
}
