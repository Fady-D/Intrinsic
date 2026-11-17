import { CachedHttpClient, ProviderError, secHttp } from "../server/http";
import { TickerDirectory } from "../securities/directory";
export const tickerDirectoryUrl =
  "https://www.sec.gov/files/company_tickers_exchange.json";
export function secHeaders(
  userAgent = process.env.SEC_USER_AGENT,
): Record<string, string> {
  if (!userAgent || !/\S+@\S+\.\S+/.test(userAgent) || /[\r\n]/.test(userAgent))
    throw new ProviderError(
      "Configure SEC_USER_AGENT with your app name and real contact email in .env.local. No substitute data was used.",
      503,
    );
  return { "User-Agent": userAgent, Accept: "application/json" };
}
export class SecDirectoryService {
  private parsed: TickerDirectory | null = null;
  private retrieved: string | null = null;
  private expiresAt = 0;
  constructor(
    private http: CachedHttpClient = secHttp,
    private userAgent?: string,
  ) {}
  async get(): Promise<TickerDirectory> {
    if (this.parsed && Date.now() < this.expiresAt) return this.parsed;
    const raw = await this.http.json(tickerDirectoryUrl, {
        ttl: 86400000,
        headers: secHeaders(this.userAgent ?? process.env.SEC_USER_AGENT),
        minInterval: 350,
      }),
      at = this.http.retrievedAt(tickerDirectoryUrl);
    if (!this.parsed || this.retrieved !== at) {
      this.parsed = new TickerDirectory(raw);
      this.retrieved = at;
      this.expiresAt = (at ? Date.parse(at) : Date.now()) + 86400000;
    }
    return this.parsed;
  }
}
export const secDirectory = new SecDirectoryService();
