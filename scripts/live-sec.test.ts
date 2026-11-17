/** Explicit live checks; these are never part of the deterministic unit test command. */
import { expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { SecEdgarProvider } from "../src/lib/sec/client";
import {
  initializeInputs,
  initializationIssues,
} from "../src/lib/data/research";
try {
  process.loadEnvFile(".env.local");
} catch {
  /* Environment may already be configured. */
}
const provider = new SecEdgarProvider();
const cases = [
  ...[
    "NVDA",
    "AMD",
    "META",
    "PYPL",
    "ADBE",
    "WDC",
    "TSLA",
    "MSFT",
    "GOOGL",
    "AAPL",
    "AMZN",
    "ORCL",
  ].map((query) => ({ query, kind: "operating-company" })),
  { query: "JPM", kind: "financial-institution" },
  { query: "BRK.B", kind: "financial-institution" },
  { query: "SPY", kind: "fund" },
  { query: "SAP", kind: "operating-company" },
  { query: "TSM", kind: "operating-company", partial: true },
  { query: "SHOP", kind: "operating-company" },
];
for (const testCase of cases)
  it(`researches live SEC listing ${testCase.query} as ${testCase.kind}`, async () => {
    const { query, kind } = testCase;
    const result = await provider.getCompanyFinancials(query);
    await mkdir(".local/live", { recursive: true });
    await writeFile(
      `.local/live/${query}.json`,
      JSON.stringify(result, null, 2),
    );
    const issues = initializationIssues(result, initializeInputs(result));
    await writeFile(
      `.local/live/${query}-coverage.json`,
      JSON.stringify(
        {
          query,
          ticker: result.ticker,
          name: result.name,
          exchange: result.identity?.exchange,
          kind: result.security?.kind,
          foreign: result.security?.foreignIssuer,
          currency: result.currency,
          taxonomy: result.taxonomy,
          annualPeriods: result.annual.length,
          annualEnd: result.annual.at(-1)?.end,
          ttmEnd: result.ttm?.end,
          eligibility: result.eligibility,
          initializationIssues: issues,
        },
        null,
        2,
      ),
    );
    expect(result.security?.kind).toBe(kind);
    if ("partial" in testCase && testCase.partial) {
      expect(result.eligibility?.eligible).toBe(false);
    } else if (kind === "operating-company") {
      expect(result.annual.length).toBeGreaterThan(0);
      expect(result.annual.at(-1)?.metrics.revenue.value).toBeGreaterThan(0);
    } else {
      expect(result.eligibility?.eligible).toBe(false);
      expect(result.annual).toHaveLength(0);
    }
  });

it("reports SEC directory coverage limits for QQQ without substituting QQQX", async () => {
  try {
    const result = await provider.getCompanyFinancials("QQQ");
    expect(result.eligibility?.eligible).toBe(false);
    await writeFile(
      ".local/live/QQQ-coverage.json",
      JSON.stringify(
        {
          query: "QQQ",
          ticker: result.ticker,
          kind: result.security?.kind,
          eligibility: result.eligibility,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    expect(e).toHaveProperty("status", 404);
    await mkdir(".local/live", { recursive: true });
    await writeFile(
      ".local/live/QQQ-coverage.json",
      JSON.stringify(
        {
          query: "QQQ",
          status: "not-in-sec-directory",
          detail: e instanceof Error ? e.message : "Not found",
        },
        null,
        2,
      ),
    );
  }
});
