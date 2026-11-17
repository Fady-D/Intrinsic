import {
  normalizeCompanyName,
  normalizeTicker,
  tickerAlias,
  type SecurityIdentity,
} from "./symbols";
export class DirectoryError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "DirectoryError";
  }
}
export function parseTickerDirectory(raw: unknown): SecurityIdentity[] {
  if (
    !raw ||
    typeof raw !== "object" ||
    !("fields" in raw) ||
    !("data" in raw) ||
    !Array.isArray(raw.fields) ||
    !Array.isArray(raw.data)
  )
    throw new DirectoryError("Malformed SEC exchange ticker directory.", 502);
  const fields = raw.fields as unknown[],
    indices = ["cik", "name", "ticker", "exchange"].map((name) =>
      fields.indexOf(name),
    );
  if (indices.some((i) => i < 0))
    throw new DirectoryError(
      "SEC ticker directory is missing required columns.",
      502,
    );
  const rows: SecurityIdentity[] = [];
  for (const row of raw.data) {
    if (!Array.isArray(row)) continue;
    const [cik, name, ticker, exchange] = indices.map((i) => row[i]);
    if (
      typeof cik !== "number" ||
      !Number.isInteger(cik) ||
      cik <= 0 ||
      cik > 9999999999 ||
      typeof name !== "string" ||
      !name.trim() ||
      typeof ticker !== "string" ||
      !ticker.trim()
    )
      continue;
    rows.push({
      cik: String(cik).padStart(10, "0"),
      name: name.trim(),
      ticker: normalizeTicker(ticker),
      exchange:
        typeof exchange === "string" && exchange.trim() ? exchange : null,
    });
  }
  if (!rows.length)
    throw new DirectoryError(
      "SEC ticker directory contains no usable entries.",
      502,
    );
  return [
    ...new Map(
      rows.map((r) => [`${r.cik}:${r.ticker}:${r.exchange ?? ""}`, r]),
    ).values(),
  ];
}
export class TickerDirectory {
  readonly entries: SecurityIdentity[];
  private byTicker = new Map<string, SecurityIdentity[]>();
  private byAlias = new Map<string, SecurityIdentity[]>();
  private names: { identity: SecurityIdentity; name: string }[];
  constructor(raw: unknown) {
    this.entries = parseTickerDirectory(raw);
    for (const entry of this.entries) {
      for (const [map, key] of [
        [this.byTicker, entry.ticker],
        [this.byAlias, tickerAlias(entry.ticker)],
      ] as const)
        map.set(key, [...(map.get(key) ?? []), entry]);
    }
    this.names = this.entries.map((identity) => ({
      identity,
      name: normalizeCompanyName(identity.name),
    }));
  }
  search(input: string, limit = 12): SecurityIdentity[] {
    const query = normalizeTicker(input),
      name = normalizeCompanyName(input);
    if (!query || query.length > 100 || !name) return [];
    return this.names
      .map((row) => ({
        identity: row.identity,
        score:
          row.identity.ticker === query
            ? 0
            : tickerAlias(row.identity.ticker) === tickerAlias(query)
              ? 1
              : row.identity.ticker.startsWith(query)
                ? 2
                : row.name.startsWith(name)
                  ? 3
                  : row.name.includes(name)
                    ? 4
                    : 99,
      }))
      .filter((row) => row.score < 99)
      .sort(
        (a, b) =>
          a.score - b.score ||
          a.identity.ticker.localeCompare(b.identity.ticker) ||
          a.identity.cik.localeCompare(b.identity.cik),
      )
      .slice(0, Math.max(1, Math.min(25, limit)))
      .map((row) => row.identity);
  }
  resolve(input: string): SecurityIdentity {
    const query = normalizeTicker(input);
    if (!query || query.length > 100)
      throw new DirectoryError(
        "Enter a ticker or company name (up to 100 characters).",
      );
    const exact = this.byTicker.get(query),
      alias = this.byAlias.get(tickerAlias(query));
    const matches = exact?.length
      ? exact
      : alias?.length
        ? alias
        : this.names
            .filter((r) => r.name === normalizeCompanyName(input))
            .map((r) => r.identity);
    const unique = [
      ...new Map(matches.map((r) => [`${r.cik}:${r.ticker}`, r])).values(),
    ];
    if (unique.length === 1) return unique[0];
    if (unique.length > 1)
      throw new DirectoryError(
        `Ambiguous company or symbol. Choose a listing/share class: ${unique.map((r) => `${r.ticker} (${r.exchange ?? "exchange unavailable"})`).join(", ")}.`,
        409,
      );
    const suggestions = this.search(input, 5);
    if (suggestions.length)
      throw new DirectoryError(
        `No exact ticker or company-name match. Select a suggestion: ${suggestions.map((r) => `${r.ticker} — ${r.name}`).join("; ")}. This query was not found in the SEC directory.`,
        404,
      );
    throw new DirectoryError(
      `“${input.trim()}” was not found in the SEC directory. The directory does not cover all global tickers; a missing symbol is not an unsupported-security classification.`,
      404,
    );
  }
}
