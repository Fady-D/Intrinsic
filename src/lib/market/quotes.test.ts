import { describe, it, expect } from "vitest";
import {
  AlphaVantageQuoteProvider,
  parseAlphaQuote,
  quoteIsStale,
} from "./quotes";
import { CachedHttpClient } from "../server/http";
const quote = {
  "Global Quote": {
    "01. symbol": "MSFT",
    "05. price": "123.45",
    "07. latest trading day": "2025-11-14",
  },
};
describe("quote safety and fallback", () => {
  it("labels free quotes as previous-close, never real-time", () => {
    const q = parseAlphaQuote(quote, "MSFT", new Date("2025-11-15T12:00:00Z"));
    expect(q.price).toBe(123.45);
    expect(q.timing).toBe("previous-close");
    expect(q.stale).toBe(false);
  });
  it("detects stale and future timestamps", () => {
    expect(quoteIsStale("2025-11-01", Date.parse("2025-11-15"))).toBe(true);
    expect(quoteIsStale("2026-01-01", Date.parse("2025-11-15"))).toBe(true);
    expect(() => parseAlphaQuote(quote, "AAPL")).toThrow();
  });
  it("handles absent configuration and API failures explicitly", async () => {
    expect(
      (await new AlphaVantageQuoteProvider("").getQuote("MSFT")).quote,
    ).toBeNull();
    const http = new CachedHttpClient(async () =>
      Response.json({ Note: "rate limited" }),
    );
    const result = await new AlphaVantageQuoteProvider(
      "fixture-key",
      http,
    ).getQuote("MSFT");
    expect(result.quote).toBeNull();
    expect(result.warning).toContain("manual");
  });
  it("rejects invalid dates and nonpositive prices", () => {
    expect(() =>
      parseAlphaQuote(
        { "Global Quote": { ...quote["Global Quote"], "05. price": "-1" } },
        "MSFT",
      ),
    ).toThrow();
    expect(() =>
      parseAlphaQuote(
        {
          "Global Quote": {
            ...quote["Global Quote"],
            "07. latest trading day": "2025-02-31",
          },
        },
        "MSFT",
      ),
    ).toThrow();
  });
});
