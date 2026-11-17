if (typeof window !== "undefined")
  throw new Error("Server-only financial data module.");
export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
export interface HttpOptions {
  ttl: number;
  responseType?: "text";
  force?: boolean;
  headers?: Record<string, string>;
  minInterval?: number;
  now?: () => number;
}
interface CacheEntry {
  value: unknown;
  at: number;
}
export class CachedHttpClient {
  private cache = new Map<string, CacheEntry>();
  private pending = new Map<string, Promise<unknown>>();
  private queue = Promise.resolve();
  private lastRequest = 0;
  retrievedAt(url: string): string | null {
    const entry = this.cache.get(url);
    return entry ? new Date(entry.at).toISOString() : null;
  }
  constructor(
    private fetcher: typeof fetch = fetch,
    private sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}
  async text(url: string, options: HttpOptions): Promise<string> {
    return (await this.json(url, { ...options, responseType: "text" })) as string;
  }
  async json(url: string, options: HttpOptions): Promise<unknown> {
    const now = options.now ?? Date.now,
      hit = this.cache.get(url);
    // Force refresh bypasses TTL but retains a 30-second floor to prevent refresh abuse.
    if (hit && now() - hit.at < (options.force ? 30_000 : options.ttl))
      return structuredClone(hit.value);
    const existing = this.pending.get(url);
    if (existing) return structuredClone(await existing);
    const work = this.load(url, options, now);
    this.pending.set(url, work);
    try {
      return structuredClone(await work);
    } finally {
      this.pending.delete(url);
    }
  }
  private async load(
    url: string,
    options: HttpOptions,
    now: () => number,
  ): Promise<unknown> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = this.queue.then(async () => {
        const delay = Math.max(
          0,
          (options.minInterval ?? 300) - (now() - this.lastRequest),
        );
        if (delay) await this.sleep(delay);
        this.lastRequest = now();
      });
      this.queue = wait.catch(() => {});
      await wait;
      let response: Response;
      try {
        response = await this.fetcher(url, {
          headers: options.headers,
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        if (attempt < 2) {
          await this.sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new ProviderError(
          "Financial data provider could not be reached. Check connectivity and retry.",
        );
      }
      if (response.status === 429 || response.status >= 500) {
        if (attempt < 2) {
          const retry = response.headers.get("retry-after");
          const seconds = retry ? Number(retry) : NaN;
          const delay = Number.isFinite(seconds)
            ? seconds * 1000
            : retry
              ? Date.parse(retry) - now()
              : 1000 * 2 ** attempt;
          await this.sleep(Math.max(1000, Math.min(30_000, delay || 1000)));
          continue;
        }
        throw new ProviderError(
          "Provider rate limit or temporary outage. Try again later.",
          503,
        );
      }
      if (!response.ok)
        throw new ProviderError(
          response.status === 403
            ? "SEC access denied. Check SEC_USER_AGENT and network access; no substitute data was used."
            : `Financial provider returned HTTP ${response.status}.`,
          response.status === 404 ? 404 : 502,
        );
      let value: unknown;
      try {
        value = options.responseType === "text" ? await response.text() : await response.json();
      } catch {
        throw new ProviderError("Financial provider returned malformed JSON.");
      }
      if (this.cache.size >= 32)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(url, { value, at: now() });
      return value;
    }
    throw new ProviderError("Financial data retrieval failed.");
  }
}
export const secHttp = new CachedHttpClient();
