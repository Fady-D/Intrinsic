/** Explicit opt-in live integration checks. Never included in npm test. */
import { expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { SecEdgarProvider, supportedTickers } from "../src/lib/sec/client";
try {
  process.loadEnvFile(".env.local");
} catch {
  /* Environment may already be configured. */
}
const provider = new SecEdgarProvider();
for (const ticker of supportedTickers)
  it(`retrieves live SEC financials for ${ticker}`, async () => {
    const result = await provider.getCompanyFinancials(ticker);
    await mkdir(".local/live", { recursive: true });
    await writeFile(
      `.local/live/${ticker}.json`,
      JSON.stringify(result, null, 2),
    );
    console.log(
      ticker,
      JSON.stringify({
        name: result.name,
        annualPeriods: result.annual.length,
        latestAnnual: result.annual.at(-1)?.end,
        ttm: result.ttm?.end,
        balance: result.latestBalance.end,
        metrics: Object.fromEntries(
          Object.entries(
            (result.ttm ?? result.annual.at(-1))?.metrics ?? {},
          ).map(([k, m]) => [k, m.value]),
        ),
      }),
    );
    expect(result.ticker).toBe(ticker);
    expect(result.annual.length).toBeGreaterThan(0);
    expect(result.annual.at(-1)?.metrics.revenue.value).toBeGreaterThan(0);
  });
