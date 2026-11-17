import { describe, it, expect, vi } from "vitest";
import { TickerDirectory, parseTickerDirectory } from "./directory";
import { normalizeTicker } from "./symbols";
import { SecDirectoryService } from "../sec/directory-service";
import { CachedHttpClient } from "../server/http";
export const directoryFixture = {
  fields: ["cik", "name", "ticker", "exchange"],
  data: [
    [1045810, "NVIDIA CORP", "NVDA", "Nasdaq"],
    [2488, "ADVANCED MICRO DEVICES INC", "AMD", "Nasdaq"],
    [1652044, "Alphabet Inc.", "GOOGL", "Nasdaq"],
    [1652044, "Alphabet Inc.", "GOOG", "Nasdaq"],
    [1067983, "BERKSHIRE HATHAWAY INC", "BRK-B", "NYSE"],
    [1067983, "BERKSHIRE HATHAWAY INC", "BRK-A", "NYSE"],
    [123, "Period Symbol Fixture", "TEST.A", "OTC"],
    [321, "Missing Exchange Fixture", "NONE", null],
  ],
};
describe("dynamic SEC directory", () => {
  it("parses field order dynamically and retains exchange and CIK", () => {
    const d = new TickerDirectory({
      fields: ["exchange", "ticker", "name", "cik"],
      data: [["Nasdaq", "nvda", "NVIDIA CORP", 1045810]],
    });
    expect(d.resolve(" NvDa ")).toEqual({
      cik: "0001045810",
      ticker: "NVDA",
      name: "NVIDIA CORP",
      exchange: "Nasdaq",
    });
  });
  it("supports exact and partial company-name searches without arbitrarily selecting a company", () => {
    const d = new TickerDirectory(directoryFixture);
    expect(d.search("advanced micro")[0].ticker).toBe("AMD");
    expect(d.resolve("advanced micro devices inc").ticker).toBe("AMD");
    expect(() => d.resolve("micro")).toThrow("suggestion");
  });
  it("keeps share classes distinct and reports company-name ambiguity", () => {
    const d = new TickerDirectory(directoryFixture);
    expect(d.search("Alphabet").map((r) => r.ticker)).toEqual([
      "GOOG",
      "GOOGL",
    ]);
    expect(() => d.resolve("Alphabet Inc.")).toThrow("share class");
    expect(d.resolve("GOOGL").cik).toBe(d.resolve("GOOG").cik);
  });
  it("normalizes period/hyphen aliases after exact matching", () => {
    const d = new TickerDirectory(directoryFixture);
    expect(d.resolve("brk.b").ticker).toBe("BRK-B");
    expect(d.resolve("test-a").ticker).toBe("TEST.A");
    expect(normalizeTicker(" brk–b ")).toBe("BRK-B");
  });
  it("prefers exact spellings and rejects ambiguous punctuation aliases", () => {
    const d = new TickerDirectory({
      fields: directoryFixture.fields,
      data: [
        [1, "A", "A.B", "NYSE"],
        [2, "B", "A-B", "NYSE"],
      ],
    });
    expect(d.resolve("A.B").cik).toBe("0000000001");
    expect(d.resolve("A-B").cik).toBe("0000000002");
    const alias = new TickerDirectory({
      fields: directoryFixture.fields,
      data: [
        [1, "A", "A.B-C", "NYSE"],
        [2, "B", "A-B.C", "NYSE"],
      ],
    });
    expect(() => alias.resolve("A.B.C")).toThrow("Ambiguous");
  });
  it("does not strip punctuation into unrelated tickers or replace an unknown symbol with a prefix match", () => {
    const d = new TickerDirectory(directoryFixture);
    expect(() => d.resolve("BRKB")).toThrow("not found");
    expect(() => d.resolve("NV")).toThrow("No exact");
    expect(d.search("ZZZZUNKNOWN")).toEqual([]);
    expect(() => d.resolve("ZZZZUNKNOWN")).toThrow("global tickers");
  });
  it("handles missing exchanges, invalid rows and malformed directory payloads", () => {
    expect(
      new TickerDirectory(directoryFixture).resolve("NONE").exchange,
    ).toBeNull();
    expect(() =>
      parseTickerDirectory({ fields: ["ticker"], data: [] }),
    ).toThrow();
    expect(() =>
      parseTickerDirectory({
        fields: directoryFixture.fields,
        data: [["invalid", "Bad", "BAD", "NYSE"]],
      }),
    ).toThrow();
  });
  it("caches the parsed directory across searches without refetching the full dataset", async () => {
    const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => Response.json(directoryFixture)),
      http = new CachedHttpClient(fetcher, async () => {}),
      service = new SecDirectoryService(http, "Fixture test@example.test");
    const first = await service.get(),
      second = await service.get();
    expect(second).toBe(first);
    expect(first.search("nvidia")[0].ticker).toBe("NVDA");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("matches accented and non-Latin company names without discarding letters", () => {
    const d = new TickerDirectory({
      fields: directoryFixture.fields,
      data: [
        [1, "München Labs", "MUC", "NYSE"],
        [2, "東京 Research", "TOK", "OTC"],
      ],
    });
    expect(d.search("munchen")[0].ticker).toBe("MUC");
    expect(d.search("東京")[0].ticker).toBe("TOK");
  });
});
