import { describe, expect, it } from "vitest";
import { fixture, fact } from "./fixtures/company";
import { normalizeFinancials } from "./normalize";
import { mergeFilingFacts } from "./filing-facts";

describe("filing precision and class-equivalent shares",()=>{
  it("adds loans and notes once to an inclusive long-term balance, without adding commercial paper twice",()=>{
    const {facts,sub}=fixture(),g=facts.facts["us-gaap"];
    const instant=(value:number)=>({units:{USD:[fact(undefined,"2025-09-30",value,"10-Q","2025-11-01","0000001234-25-000002")]}});
    g.LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities=instant(41546);
    g.NotesAndLoansPayable=instant(73);g.CommercialPaper=instant(20);
    expect(normalizeFinancials(facts,sub,"TEST","2025-11-15T00:00:00Z").latestBalance.metrics.debt.value).toBe(41619);
    delete g.NotesAndLoansPayable;delete g.CommercialPaper;
    expect(normalizeFinancials(facts,sub,"TEST","2025-11-15T00:00:00Z").latestBalance.metrics.debt.value).toBeNull();
  });
  it("requires explicit zero or a complete same-filing balance reconciliation for absent claims",()=>{
    const {facts,sub}=fixture(),g=facts.facts["us-gaap"];
    const instant=(value:number)=>({units:{USD:[fact(undefined,"2025-09-30",value,"10-Q","2025-11-01","0000001234-25-000002")]}});
    g.Assets=instant(500);g.Liabilities=instant(200);g.StockholdersEquity=instant(300);
    let d=normalizeFinancials(facts,sub,"TEST","2025-11-15T00:00:00Z");
    expect(d.latestBalance.metrics.minorityClaims.value).toBe(0);
    expect(d.latestBalance.metrics.preferredClaims.value).toBeNull();
    g.PreferredStockSharesIssued={units:{shares:[fact(undefined,"2025-09-30",0,"10-Q","2025-11-01","0000001234-25-000002")]}};
    g.Liabilities.units.USD[0].val-=1e6;
    d=normalizeFinancials(facts,sub,"TEST","2025-11-15T00:00:00Z");
    expect(d.latestBalance.metrics.preferredClaims.value).toBe(0);
    expect(d.latestBalance.metrics.minorityClaims.value).toBeNull();
  });
  it("reconciles declared rounding, retains finer provenance, and rejects conflicting or unknown precision",()=>{
    const {facts,sub}=fixture();
    const rows=facts.facts["us-gaap"].WeightedAverageNumberOfDilutedSharesOutstanding.units.shares;
    const f=rows.find(f=>f.end==="2025-06-30")!;
    f.val=100e6;f.decimals="-6";
    rows.push({...f,val:100.5e6,decimals:"-5",sourceUrl:"https://www.sec.gov/precision.xml"});
    let d=normalizeFinancials(facts,sub,"TEST","2025-11-15T00:00:00Z");
    expect(d.annual.at(-1)!.metrics.dilutedShares.value).toBe(100.5);
    expect(d.annual.at(-1)!.metrics.dilutedShares.sources[0].url).toContain("precision.xml");
    rows.at(-1)!.val=102e6;
    d=normalizeFinancials(facts,sub,"TEST","2025-11-15T00:00:00Z");
    expect(d.annual.at(-1)!.metrics.dilutedShares.value).toBeNull();
    rows.at(-1)!.val=100.5e6;delete f.decimals;
    expect(normalizeFinancials(facts,sub,"TEST","2025-11-15T00:00:00Z").annual.at(-1)!.metrics.dilutedShares.value).toBeNull();
  });
  it("admits only Visa's reviewed Class A diluted axis, without summing other classes or accepting arbitrary dimensions",()=>{
    const {facts}=fixture();facts.cik=1403161;
    const context=(id:string,member:string)=>`<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">1403161</xbrli:identifier><xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementClassOfStockAxis">us-gaap:${member}</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2025-10-01</xbrli:startDate><xbrli:endDate>2026-09-30</xbrli:endDate></xbrli:period></xbrli:context>`;
    // Regression values checked against Visa 2026 10-K, Note 16 (accession 0001403161-26-000134).
    const xml=`<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:us-gaap="http://fasb.org/us-gaap/2026">${context("a","CommonClassAMember")}${context("c","CommonClassCMember")}<xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit><us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding contextRef="a" unitRef="shares" decimals="-6">1907000000</us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding><us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding contextRef="c" unitRef="shares" decimals="-6">12000000</us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding></xbrli:xbrl>`;
    const filing={accessionNumber:"0001403161-26-000134",filingDate:"2026-11-12",reportDate:"2026-09-30",form:"10-K",primaryDocument:"v-20260930.htm"};
    mergeFilingFacts(facts,xml,filing,"https://www.sec.gov/visa.xml","https://www.sec.gov/visa.htm","2026-11-17T00:00:00Z");
    expect(facts.facts.v.ClassAEquivalentDilutedShares.units.shares).toHaveLength(1);
    expect(facts.facts.v.ClassAEquivalentDilutedShares.units.shares[0].val).toBe(1907e6);
    expect(facts.facts.v.ClassAEquivalentDilutedShares.units.shares[0].sourceTag).toContain("CommonClassAMember");
  });
});
