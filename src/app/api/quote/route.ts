import { AlphaVantageQuoteProvider } from "@/lib/market/quotes";
import { supportedTickers } from "@/lib/sec/client";
export const runtime = "nodejs";
const provider = new AlphaVantageQuoteProvider();
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams,
    ticker = (q.get("ticker") ?? "").trim().toUpperCase();
  if (!supportedTickers.includes(ticker as (typeof supportedTickers)[number]))
    return Response.json({ error: "Unsupported ticker." }, { status: 400 });
  return Response.json(
    await provider.getQuote(ticker, q.get("refresh") === "1"),
    { headers: { "Cache-Control": "no-store" } },
  );
}
