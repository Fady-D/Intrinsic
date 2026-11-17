import { FmpEstimateProvider } from "@/lib/estimates/provider";
import { SecEdgarProvider } from "@/lib/sec/client";
export const runtime = "nodejs";
const provider = new FmpEstimateProvider();
export async function GET(request: Request) {
  const ticker = (new URL(request.url).searchParams.get("ticker") ?? "").trim();
  if (!process.env.FMP_API_KEY)
    return Response.json(
      {
        status: "unconfigured",
        provider: "Financial Modeling Prep",
        retrievedAt: new Date().toISOString(),
        estimates: [],
        warnings: [
          "FMP_API_KEY is not configured; using Historical Growth unless user-provided forecasts are entered.",
        ],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    const data = await new SecEdgarProvider().getCompanyFinancials(ticker),
      annual = data.annual.at(-1);
    if (!annual || !data.currency || data.eligibility?.eligible === false)
      throw new Error(
        "SEC fiscal-year or currency context is unavailable for this security.",
      );
    return Response.json(
      await provider.getAnnualEstimates(data.ticker, annual.end, data.currency, data.cik),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      {
        status: "unavailable",
        provider: "Financial Modeling Prep",
        retrievedAt: new Date().toISOString(),
        estimates: [],
        warnings: [
          e instanceof Error ? e.message : "Estimate context unavailable.",
        ],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
