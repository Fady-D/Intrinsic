import {expect,it} from "vitest";
import {assumptionErrors} from "./validation";
import {buildAutomaticBaseline} from "./automatic";
import {calculateDcf} from "./dcf";
import {defaultAssumptions,illustrativeData} from "../data/illustrative";
import {fixture} from "../sec/fixtures/company";
import {normalizeFinancials} from "../sec/normalize";
import {applyFiscalForecast,buildRevenuePlan} from "../estimates/forecast";
const company=()=>{const{facts,sub}=fixture();return normalizeFinancials(facts,sub,"TEST","2025-11-15T00:00:00Z");};
it("identifies each invalid assumption and does not overwrite user values",()=>{
 const a={...defaultAssumptions,wacc:.01,terminalGrowth:.02,shares:0,daRate:NaN,targetMargin:1.2,annualGrowth:[.1,.1,NaN,...Array(7).fill(.05)]};
 const errors=assumptionErrors(a);
 expect(errors.wacc).toMatch(/exceed terminal/); expect(errors.shares).toMatch(/share count/);
 expect(errors.daRate).toMatch(/D&A/);expect(errors.targetMargin).toMatch(/margin/);expect(errors.annualGrowth).toMatch(/year 3/);
 expect(a.wacc).toBe(.01); expect(a.targetMargin).toBe(1.2);
 expect(()=>calculateDcf({...illustrativeData,balanceSheets:[{...illustrativeData.balanceSheets[0],debt:NaN}]},defaultAssumptions)).toThrow(/Financial debt/);
});
it("keeps valid scenarios available when one scenario calculation fails and bounds automatic scenario spreads by remaining economic headroom",()=>{
 const d=company();d.interim=null;d.ttm=null;d.latestBalance.end=d.annual.at(-1)!.end;
 const a=buildAutomaticBaseline(d,null,{financial:{otherClaims:0},directWacc:.999,assumptions:{nwcRate:.1,targetMargin:.999,capexRate:.999}});
 expect(a.dataset).not.toBeNull();expect(a.scenarioIssues.bear).toMatch(/WACC/);expect(a.scenarioIssues.base).toBeUndefined();
 expect(()=>calculateDcf(a.dataset!,a.scenarios[1].assumptions)).not.toThrow();
 expect(a.scenarios[2].assumptions.targetMargin).toBeLessThanOrEqual(1);expect(a.scenarios[2].assumptions.capexRate).toBeLessThanOrEqual(1);
 const missing=buildAutomaticBaseline(d,null,{directWacc:.1});
 expect(missing.inputs.otherClaims).toBeNull();expect(missing.dataset).toBeNull();expect(missing.issues.join(" ")).toMatch(/claims/);
});
it("switches forecast modes without changing financial inputs, validates annual edits, and keeps missing consensus explicitly historical",()=>{
 const d=company(),a=defaultAssumptions;
 const historic=buildRevenuePlan(d,a,"consensus",[],undefined,"2025-11-15");expect(historic.mode).toBe("historical");
 expect(applyFiscalForecast(d,illustrativeData,historic).dataset).toBe(illustrativeData);
 const custom=buildRevenuePlan(d,a,"custom",[],Array(10).fill(.03),"2025-11-15");
 expect(custom.rows.every(r=>r.source==="Manually overridden")).toBe(true);
 const fiscal=applyFiscalForecast(d,illustrativeData,custom);
 expect(fiscal.dataset.balanceSheets).toBe(illustrativeData.balanceSheets);
 const bad={...a,annualGrowth:[...custom.growths]};bad.annualGrowth[4]=-1;
 expect(assumptionErrors(bad).annualGrowth).toMatch(/year 5/);
 expect(assumptionErrors({...a,annualGrowth:historic.growths})).toEqual({});
});
