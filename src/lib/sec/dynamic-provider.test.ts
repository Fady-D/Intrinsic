import { describe, it, expect, vi } from "vitest";
import { SecEdgarProvider } from "./client";
import { CachedHttpClient } from "../server/http";
import { fixture } from "./fixtures/company";
import {
  initializeInputs,
  initializeScenarios,
  toDcfDataset,
} from "../data/research";
import { calculateDcf } from "../finance/dcf";
const directory = {
  fields: ["cik", "name", "ticker", "exchange"],
  data: [[1234, "Arbitrary Operating Fixture", "ARBT", "NYSE"]],
};
const contact = "Deterministic fixture test@example.test";
describe("arbitrary issuer pipeline", () => {
  it("loads an operating ticker outside the former allowlist and initializes the unchanged engine after review", async () => {
    const { facts, sub } = fixture();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(directory))
      .mockResolvedValueOnce(Response.json(sub))
      .mockResolvedValueOnce(Response.json(facts));
    const provider = new SecEdgarProvider(
        new CachedHttpClient(fetcher, async () => {}),
        contact,
      ),
      data = await provider.getCompanyFinancials("arbt");
    expect(data.identity?.exchange).toBe("NYSE");
    expect(data.security?.kind).toBe("operating-company");
    expect(data.eligibility?.eligible).toBe(true);
    const inputs = {
        ...initializeInputs(data),
        excessCash: 0,
        otherClaims: 0,
        shares: 100,
        rationale: "Synthetic reviewed inputs",
        acknowledged: true,
      },
      model = toDcfDataset(data, inputs, 10);
    expect(model).not.toBeNull();
    const assumptions = {
      ...initializeScenarios(data)[1].assumptions,
      shares: 100,
    };
    expect(
      Number.isFinite(calculateDcf(model!, assumptions).valuePerShare),
    ).toBe(true);
  });
  it("returns recognized-issuer missing-data status for absent Company Facts without fictional statements", async () => {
    const { sub } = fixture();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(directory))
      .mockResolvedValueOnce(Response.json(sub))
      .mockResolvedValueOnce(new Response("", { status: 404 }));
    const result = await new SecEdgarProvider(
      new CachedHttpClient(fetcher, async () => {}),
      contact,
    ).getCompanyFinancials("ARBT");
    expect(result.identity?.ticker).toBe("ARBT");
    expect(result.eligibility?.code).toBe("missing-data");
    expect(result.annual).toEqual([]);
  });
  it("classifies financial institutions before requesting Company Facts", async () => {
    const { sub } = fixture();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(directory))
      .mockResolvedValueOnce(Response.json({ ...sub, sic: "6021" }));
    const result = await new SecEdgarProvider(
      new CachedHttpClient(fetcher, async () => {}),
      contact,
    ).getCompanyFinancials("ARBT");
    expect(result.eligibility?.code).toBe("alternative-model-required");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.annual).toEqual([]);
  });
  it("distinguishes unknown symbols from known unsupported securities", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(directory));
    await expect(
      new SecEdgarProvider(
        new CachedHttpClient(fetcher, async () => {}),
        contact,
      ).getCompanyFinancials("NOTREAL"),
    ).rejects.toMatchObject({ status: 404 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
