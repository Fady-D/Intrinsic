import { secDirectory } from "@/lib/sec/directory-service";
import { DirectoryError } from "@/lib/securities/directory";
import { ProviderError } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  try {
    const directory = await secDirectory.get();
    return Response.json(
      q.has("resolve")
        ? { identity: directory.resolve(q.get("resolve") ?? "") }
        : { results: directory.search(q.get("q") ?? "") },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error ? e.message : "Ticker directory unavailable.",
      },
      {
        status:
          e instanceof DirectoryError || e instanceof ProviderError
            ? e.status
            : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
