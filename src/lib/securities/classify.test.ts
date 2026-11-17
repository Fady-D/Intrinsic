import { describe, it, expect } from "vitest";
import {
  classifySecurity,
  valuationEligibility,
  modelPolicies,
} from "./classify";
import { fixture } from "../sec/fixtures/company";
const identity = {
  ticker: "TEST",
  cik: "0000001234",
  name: "Synthetic Fixture Co",
  exchange: "Nasdaq",
};
describe("security suitability policy", () => {
  it("allows identified operating companies only with coherent USD reports", () => {
    const { sub } = fixture(),
      s = classifySecurity(identity, sub);
    expect(s.kind).toBe("operating-company");
    expect(valuationEligibility(s, "USD").eligible).toBe(true);
    expect(valuationEligibility(s, "EUR").code).toBe("currency-unsupported");
    expect(valuationEligibility(s, null).eligible).toBe(false);
  });
  it.each(["6021", "6199", "6331", "6798"])(
    "blocks financial industry SIC %s and offers future equity-model extension points",
    (sic) => {
      const { sub } = fixture(),
        s = classifySecurity(identity, { ...sub, sic });
      expect(s.kind).toBe("financial-institution");
      expect(s.alternativeModels).toContain("residual-income");
      expect(valuationEligibility(s, "USD").eligible).toBe(false);
    },
  );
  it("detects ETFs, registered funds and investment trusts before attempting any corporate valuation", () => {
    const { sub } = fixture();
    for (const change of [
      { sic: "6726" },
      { entityType: "investment" },
      { name: "Synthetic ETF Trust" },
      { filings: { recent: { ...sub.filings.recent, form: ["N-CSR"] } } },
    ]) {
      const s = classifySecurity(identity, { ...sub, ...change });
      expect(s.kind).toBe("fund");
      expect(valuationEligibility(s, "USD").code).toBe("unsupported-security");
    }
  });
  it("blocks identifiable warrants, preferred instruments and blank-check companies", () => {
    const { sub } = fixture();
    expect(classifySecurity({ ...identity, ticker: "TEST-WT" }, sub).kind).toBe(
      "other-security",
    );
    expect(classifySecurity({ ...identity, ticker: "TEST-PA" }, sub).kind).toBe(
      "other-security",
    );
    expect(classifySecurity(identity, { ...sub, sic: "6770" }).kind).toBe(
      "other-security",
    );
  });
  it.each(["20-F", "40-F"])(
    "recognizes foreign issuer form %s without requiring US quarterly reports",
    (form) => {
      const { sub } = fixture(),
        s = classifySecurity(identity, {
          ...sub,
          filings: { recent: { ...sub.filings.recent, form: [form, "6-K"] } },
        });
      expect(s.foreignIssuer).toBe(true);
      expect(s.kind).toBe("operating-company");
    },
  );
  it("does not infer operating-company suitability when industry metadata is missing", () => {
    const { sub } = fixture();
    const s = classifySecurity(identity, { ...sub, sic: undefined });
    expect(s.kind).toBe("unknown");
    expect(valuationEligibility(s, "USD").code).toBe("unclassified");
    expect(
      modelPolicies.filter((p) => p.operatingDcf).map((p) => p.kind),
    ).toEqual(["operating-company"]);
  });
});
