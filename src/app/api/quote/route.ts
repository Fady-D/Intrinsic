import { AlphaVantageQuoteProvider } from "@/lib/market/quotes";
import { secDirectory } from "@/lib/sec/directory-service";
import { DirectoryError } from "@/lib/securities/directory";
import { ProviderError } from "@/lib/server/http";
export const runtime = "nodejs";
const provider = new AlphaVantageQuoteProvider();
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  try {
    const directory = await secDirectory.get(),
      identity = directory.resolve(q.get("ticker") ?? "");
    return Response.json(
      await provider.getQuote(identity.ticker, q.get("refresh") === "1"),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Quote identity unavailable." },
      {
        status:
          e instanceof DirectoryError || e instanceof ProviderError
            ? e.status
            : 502,
      },
    );
  }
}
