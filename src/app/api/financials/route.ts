import { SecEdgarProvider } from "@/lib/sec/client";
import { ProviderError } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  try {
    const data = await new SecEdgarProvider().getCompanyFinancials(
      query.get("ticker") ?? "",
      query.get("refresh") === "1",
    );
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Financial retrieval failed." },
      {
        status: e instanceof ProviderError ? e.status : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
