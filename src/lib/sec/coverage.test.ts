import { describe, expect, it } from "vitest";
import { fixture, fact } from "./fixtures/company";
import { normalizeFinancials } from "./normalize";
import { mergeFilingFacts } from "./filing-facts";
import { buildAutomaticBaseline } from "../finance/automatic";
const retrieved = "2025-11-15T00:00:00Z";
function claimsFixture() {
  const { facts, sub } = fixture();
  facts.cik = 1652044; sub.cik = "1652044";
  const gaap = facts.facts["us-gaap"], end = "2025-09-30";
  const f = (value: number) => fact(undefined, end, value, "10-Q", "2025-11-01", "0000001234-25-000002");
  gaap.ConvertiblePreferredStockNonredeemableOrRedeemableIssuerOptionValue = { units: { USD: [f(15)] } };
  gaap.PreferredStockSharesOutstanding = { units: { shares: [f(2)] } };
  gaap.PreferredStockLiquidationPreference = { units: { "USD/shares": [f(10 / 1e6)] } };
  gaap.NoncontrollingInterestInVariableInterestEntity = { units: { USD: [f(8)] } };
  gaap.IncrementalCommonSharesAttributableToConversionOfPreferredStock = { units: { shares: [fact("2025-07-01",end,4,"10-Q","2025-11-01","0000001234-25-000002")] } };
  facts.facts.goog = { RedeemableNoncontrollingInterestInVariableInterestEntity: { units: { USD: [f(3)] } } };
  return { facts, sub };
}
describe("claims and complete D&A coverage", () => {
  it("deducts liquidation preference rather than carrying amount, excludes conversion dilution and never adds redeemable NCI twice", () => {
    const { facts, sub } = claimsFixture();
    const d = normalizeFinancials(facts, sub, "GOOG", retrieved);
    expect(d.preferredBasis?.claim.value).toBe(20);
    expect(d.preferredBasis?.shares.value).toBe(96);
    expect(d.latestBalance.metrics.minorityClaims.value).toBe(8);
    expect(d.latestBalance.metrics.minorityClaims.sources).toHaveLength(2);
    const b = buildAutomaticBaseline(d, null, { directWacc: .1 });
    expect(b.inputs.otherClaims).toBe(28);
    expect(b.issues.join(" ")).not.toMatch(/Preferred\/convertible/);
    expect(d.warnings.join(" ")).toMatch(/rounded/);
    // An independently overridden share count requires a reviewed matching claims total.
    expect(buildAutomaticBaseline(d, null, { financial: { shares: 110 }, directWacc: .1 }).issues.join(" ")).toMatch(/Preferred\/convertible/);
    delete facts.facts["us-gaap"].IncrementalCommonSharesAttributableToConversionOfPreferredStock;
    const unresolved = normalizeFinancials(facts, sub, "GOOGL", retrieved);
    expect(unresolved.preferredBasis).toBeUndefined();
    expect(buildAutomaticBaseline(unresolved, null, { directWacc: .1 }).issues.join(" ")).toMatch(/Preferred\/convertible/);
  });
  it("does not treat a VIE-only NCI concept as issuer-wide NCI for an unreviewed issuer", () => {
    const { facts, sub } = claimsFixture(); facts.cik = 1234; sub.cik = "1234";
    expect(normalizeFinancials(facts, sub, "TEST", retrieved).latestBalance.metrics.minorityClaims.value).toBeNull();
  });
  it("reconciles combined annual D&A with compatible separate interim components and keeps missing components missing", () => {
    const { facts, sub } = fixture(), gaap = facts.facts["us-gaap"];
    const combined = gaap.DepreciationDepletionAndAmortization.units.USD;
    const interim = combined.filter(f => f.form === "10-Q");
    gaap.DepreciationDepletionAndAmortization.units.USD = combined.filter(f => f.form === "10-K");
    gaap.Depreciation = { units: { USD: interim.map(f => ({ ...f, val: f.val * .75 })) } };
    gaap.AmortizationOfIntangibleAssets = { units: { USD: interim.map(f => ({ ...f, val: f.val * .25 })) } };
    const d = normalizeFinancials(facts, sub, "TEST", retrieved);
    expect(d.ttm?.metrics.depreciation.value).toBe(44); // 40 + 12 − 8
    expect(d.ttm?.metrics.depreciation.sources).toHaveLength(5);
    delete gaap.AmortizationOfIntangibleAssets;
    expect(normalizeFinancials(facts, sub, "TEST", retrieved).ttm?.metrics.depreciation.value).toBeNull();
    // Complete YTD intensity is useful without fabricating an annual or TTM amount.
    gaap.AmortizationOfIntangibleAssets = { units: { USD: interim.map(f => ({ ...f, val: f.val * .25 })) } };
    delete gaap.DepreciationDepletionAndAmortization;
    const fallback = normalizeFinancials(facts, sub, "TEST", retrieved);
    const b = buildAutomaticBaseline(fallback, null, { directWacc: .1 });
    expect(b.inputs.depreciationRate).toBeCloseTo(.04);
    expect(b.warnings.join(" ")).toMatch(/not presented as TTM/);
  });
  it("reads only consolidated issuer facts from XML with exact source links and rejects wrong-issuer contexts", () => {
    const { facts } = fixture();
    const xml = `<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2025">
      <xbrli:context id="c"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">1234</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2025-07-01</xbrli:startDate><xbrli:endDate>2025-09-30</xbrli:endDate></xbrli:period></xbrli:context>
      <xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
      <us-gaap:AmortizationOfIntangibleAssets contextRef="c" unitRef="usd" decimals="-6">3000000</us-gaap:AmortizationOfIntangibleAssets></xbrli:xbrl>`;
    const filing = { accessionNumber: "0000001234-25-000002", filingDate: "2025-11-01", reportDate: "2025-09-30", form: "10-Q", primaryDocument: "test.htm" };
    mergeFilingFacts(facts, xml, filing, "https://www.sec.gov/test.xml", "https://www.sec.gov/test.htm", retrieved);
    expect(facts.facts["us-gaap"].AmortizationOfIntangibleAssets.units.USD[0]).toMatchObject({ val: 3e6, sourceUrl: "https://www.sec.gov/test.xml", start: "2025-07-01", end: "2025-09-30", retrievedAt: retrieved });
    expect(() => mergeFilingFacts(facts, xml.replace(">1234<", ">9999<"), filing, "x", "y", retrieved)).toThrow(/contexts/);
    expect(() => mergeFilingFacts(facts, xml.replace("</xbrli:identifier>", "</xbrli:identifier><xbrli:segment/>"), filing, "x", "y", retrieved)).toThrow(/contexts/);
  });
});
