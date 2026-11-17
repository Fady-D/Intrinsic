import { describe, expect, it } from "vitest";
import { editRevenuePlan } from "./editor";
import { buildRevenuePlan } from "./forecast";
import { fixture } from "../sec/fixtures/company";
import { normalizeFinancials } from "../sec/normalize";
import { defaultAssumptions, illustrativeData } from "../data/illustrative";
import { calculateDcf } from "../finance/dcf";
import type { RevenueEstimate } from "./types";

describe("single revenue editor", () => {
  it("keeps later consensus revenue intact, preserves explicit revenue edits, and updates valuation", () => {
    const {facts,sub}=fixture();
    const d=normalizeFinancials(facts,sub,"TEST","2025-11-15T00:00:00Z");
    const estimates:RevenueEstimate[]=[1100,1210].map((revenue,i)=>({fiscalEnd:`${2026+i}-06-30`,revenue,low:null,high:null,analysts:10,ebit:null,currency:"USD",source:"FMP consensus",note:"Test fixture",retrievedAt:"2025-11-15T00:00:00Z",updatedAt:null}));
    const plan=buildRevenuePlan(d,defaultAssumptions,"consensus",estimates,undefined,"2025-11-15");
    const first=editRevenuePlan(plan,1000,{"2026-06-30":{kind:"growth",value:.15}});
    expect(first.rows[0].revenue).toBeCloseTo(1150);
    expect(first.rows[0].source).toBe("User override");
    expect(first.rows[1].revenue).toBeCloseTo(1210);
    const edits={"2026-06-30":{kind:"growth" as const,value:.25},"2027-06-30":{kind:"revenue" as const,value:1400}};
    const next=editRevenuePlan(plan,1000,edits);
    expect(next.rows[1].revenue).toBeCloseTo(1400);
    expect(plan.rows[0].revenue).toBeCloseTo(1100);
    expect(calculateDcf(illustrativeData,{...defaultAssumptions,annualGrowth:next.growths}).valuePerShare).not.toBe(calculateDcf(illustrativeData,{...defaultAssumptions,annualGrowth:plan.growths}).valuePerShare);
  });
});
