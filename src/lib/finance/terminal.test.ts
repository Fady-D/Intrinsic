import{expect,it}from"vitest";
import{calculateDcf}from"./dcf";
import{defaultAssumptions,illustrativeData}from"../data/illustrative";
it("replaces terminal investment with growth/ROIC economics and reconciles FCFF exactly once",()=>{
 const a={...defaultAssumptions,terminalRoic:.12,terminalGrowth:.03};
 const r=calculateDcf(illustrativeData,a),t=r.terminalYear;
 expect(t.reinvestment).toBeCloseTo(t.nopat*.03/.12);
 expect(t.fcff).toBeCloseTo(t.nopat*.75);
 expect(t.fcff).toBeCloseTo(t.nopat+t.depreciation-t.capex-t.changeInNwc);
 expect(r.terminalValue).toBeCloseTo(t.fcff/(a.wacc-.03));
 const original=calculateDcf(illustrativeData,defaultAssumptions);
 expect(r.forecast).toEqual(original.forecast);
});
it("rejects inconsistent stable growth and honors manual ROIC without changing revenue rates",()=>{
 expect(()=>calculateDcf(illustrativeData,{...defaultAssumptions,terminalRoic:.01,terminalGrowth:.02})).toThrow(/ROIC/);
 const a={...defaultAssumptions,terminalRoic:.1,terminalGrowth:0,annualGrowth:Array(10).fill(.05)};
 const r=calculateDcf(illustrativeData,a);
 expect(r.terminalYear.fcff).toBeCloseTo(r.terminalYear.nopat);
 expect(a.annualGrowth).toEqual(Array(10).fill(.05));
});
