import { describe, it, expect, vi } from "vitest";
import { CachedHttpClient } from "./http";
import { SecEdgarProvider, resolveCik } from "../sec/client";
import { fixture } from "../sec/fixtures/company";
describe("SEC provider and resilient HTTP", () => {
  it("resolves a ticker to padded CIK without fuzzy matches", () => {
    expect(
      resolveCik(
        {
          0: {
            cik_str: 789019,
            ticker: "MSFT",
            title: "Microsoft Corporation",
          },
        },
        "msft",
      ).cik,
    ).toBe("0000789019");
    expect(() => resolveCik({}, "MSFT")).toThrow();
    expect(() =>
      resolveCik({ 0: { ticker: "MSFT", cik_str: "bad" } }, "MSFT"),
    ).toThrow();
  });
  it("rejects missing SEC contact and empty searches without network requests", async () => {
    const fetcher = vi.fn();
    const p = new SecEdgarProvider(new CachedHttpClient(fetcher), "");
    await expect(p.getCompanyFinancials("MSFT")).rejects.toThrow(
      "SEC_USER_AGENT",
    );
    await expect(p.getCompanyFinancials("")).rejects.toThrow("Enter a ticker");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("parses SEC responses through the provider contract", async () => {
    const { facts, sub } = fixture();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          fields: ["cik", "name", "ticker", "exchange"],
          data: [[1234, "Fixture", "MSFT", "Nasdaq"]],
        }),
      )
      .mockResolvedValueOnce(Response.json(sub))
      .mockResolvedValueOnce(Response.json(facts));
    const p = new SecEdgarProvider(
      new CachedHttpClient(fetcher, async () => {}),
      "Deterministic fixture contact@example.test",
    );
    const r = await p.getCompanyFinancials("MSFT");
    expect(r.cik).toBe("0000001234");
    expect(r.annual).toHaveLength(2);
    expect(fetcher.mock.calls[0][1]?.headers).toHaveProperty("User-Agent");
  });
  it("retries rate limits and caches/coalesces identical requests", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "retry-after": "1" } }),
      )
      .mockResolvedValueOnce(Response.json({ value: 5 }));
    const sleep = vi.fn(async () => {}),
      http = new CachedHttpClient(fetcher, sleep);
    const results = await Promise.all([
      http.json("https://fixture.test", { ttl: 1000, minInterval: 0 }),
      http.json("https://fixture.test", { ttl: 1000, minInterval: 0 }),
    ]);
    expect(results).toEqual([{ value: 5 }, { value: 5 }]);
    await http.json("https://fixture.test", { ttl: 1000, minInterval: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });
  it("honors retry exhaustion, forbidden responses and malformed JSON", async () => {
    const http = new CachedHttpClient(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("", { status: 503 })),
      async () => {},
    );
    await expect(
      http.json("https://fixture.test", { ttl: 1, minInterval: 0 }),
    ).rejects.toThrow("outage");
    await expect(
      new CachedHttpClient(async () => new Response("", { status: 403 })).json(
        "https://fixture.test",
        { ttl: 1, minInterval: 0 },
      ),
    ).rejects.toThrow("access denied");
    await expect(
      new CachedHttpClient(async () => new Response("not json")).json(
        "https://fixture.test",
        { ttl: 1, minInterval: 0 },
      ),
    ).rejects.toThrow("malformed JSON");
  });
  it("throttles distinct requests and bounds force refresh", async () => {
    let time = 1000;
    const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => Response.json({ a: 1 })),
      sleep = vi.fn(async (ms: number) => {
        time += ms;
      });
    const http = new CachedHttpClient(fetcher, sleep),
      options = { ttl: 3600000, minInterval: 350, now: () => time };
    await http.json("https://fixture.test/1", options);
    await http.json("https://fixture.test/2", options);
    expect(sleep).toHaveBeenCalledWith(350);
    await http.json("https://fixture.test/1", { ...options, force: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    time += 31000;
    await http.json("https://fixture.test/1", { ...options, force: true });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
