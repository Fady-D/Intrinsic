import type { VerifiedFinancials } from "../sec/types";
import { capexProfile } from "./capex";
import { growthFundamentals } from "../estimates/fundamentals";
const median=(v:number[])=>{const s=[...v].sort((a,b)=>a-b);return s.length?(s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2:null;};
/** Evidence-based policy estimates, not an asset-life or maintenance-CapEx disclosure. */
export function investmentProfile(data: VerifiedFinancials) {
  const old=capexProfile(data); if(!old) return null;
  const history=data.annual.slice(-5);
  if(history.some((p,i)=>p.metrics.revenue.value===null || p.metrics.revenue.value!<=0 || p.metrics.capex.value===null || p.metrics.capex.value!<0 || (i>0 && Math.abs((Date.parse(p.end)-Date.parse(history[i-1].end))/86400000-365)>15))) return null;
  const ratios=history.map(p=>p.metrics.capex.value!/p.metrics.revenue.value!);
  const center=median(ratios)!;
  const increases=ratios.slice(1).filter((r,i)=>r>ratios[i]).length/(ratios.length-1);
  // Persistent rises in completed-year capital intensity increase the structural weight.
  const pressure=center>0?Math.min(1,increases*Math.max(0,ratios.at(-1)!/center-1)):0;
  const normal=center*(1-pressure)+ratios.at(-1)!*pressure;
  if(normal<0 || normal>1) return null;
  const hold=2+Math.round(2*pressure), end=6+Math.round(4*pressure), curve=1+pressure;
  const capexGrowth=median(history.slice(1).flatMap((p,i)=>history[i].metrics.capex.value!>0?[p.metrics.capex.value!/history[i].metrics.capex.value!-1]:[]));
  const revenueGrowth=median(history.slice(1).map((p,i)=>p.metrics.revenue.value!/history[i].metrics.revenue.value!-1));
  const capexDa=median(history.flatMap(p=>p.metrics.depreciation.value!==null && p.metrics.depreciation.value!>0?[p.metrics.capex.value!/p.metrics.depreciation.value!]:[]));
  const cashConversion=median(history.flatMap(p=>p.metrics.operatingCashFlow.value!==null && p.metrics.operatingCashFlow.value!>0?[(p.metrics.operatingCashFlow.value!-p.metrics.capex.value!)/p.metrics.operatingCashFlow.value!]:[]));
  const latest=data.ttm?.metrics.depreciation.value!=null?data.ttm:data.interim?.metrics.depreciation.value!=null?data.interim:history.at(-1)!;
  const latestDa=latest.metrics.depreciation.value, latestRevenue=latest.metrics.revenue.value;
  const nearDa=latestDa!==null && latestDa>=0 && latestRevenue!==null && latestRevenue>0?latestDa/latestRevenue:null;
  const daRatios=history.map(p=>p.metrics.depreciation.value===null?null:p.metrics.depreciation.value!/p.metrics.revenue.value!);
  const slopes=daRatios.slice(1).flatMap((r,i)=>r!==null && daRatios[i]!==null?[r-daRatios[i]!]:[]);
  const slope=slopes.length>=2?median(slopes):null;
  const projectedDa=nearDa===null?null:nearDa+(pressure>0 && slope!==null?Math.max(0,slope)*2:0);
  const longDa=projectedDa!==null && projectedDa<=1?projectedDa:nearDa;
  const pct=(v:number|null)=>v===null?"unavailable":`${(v*100).toFixed(2)}%`;
  return {near:old.near,normal,hold,end,curve,nearDa,longDa,
    capitalSpread:Math.max(...ratios)-Math.min(...ratios),
    salesToCapital:growthFundamentals(data,0).salesToCapital,
    explanation:`${history.length} completed years (${history[0].end} – ${history.at(-1)!.end}): median CapEx/revenue ${pct(center)}, median CapEx growth ${pct(capexGrowth)} versus revenue growth ${pct(revenueGrowth)}, median CapEx/D&A ${capexDa?.toFixed(2)??"unavailable"}×, median (OCF − cash CapEx)/OCF ${pct(cashConversion)}. Structural weight ${(pressure*100).toFixed(0)}% = fraction of annual intensity increases × positive latest/median intensity excess, bounded at 100%. Long-term CapEx blends historical median and latest completed-year intensity using that weight. Hold current ${pct(old.near)} through year ${hold}; normalize to ${pct(normal)} by year ${end} using a slower-start power curve (exponent ${curve.toFixed(2)}). This separates an expansion-period proxy from normalized investment; it does not identify reported maintenance CapEx.`,
    depreciationExplanation:`D&A uses a normalized ratio forecast, not asset cohorts: start at latest complete ${latest.kind} intensity ${pct(nearDa)}. ${slope===null?"Comparable annual D&A trend unavailable; retain the complete-period ratio without inventing depreciation from missing disclosures.":`After a two-year lag, transition toward ${pct(longDa)} by year ${end}; in an expanding investment cycle, this extends the observed annual intensity trend (${pct(slope)} per year) by two years. This is an editable trend estimate, not a useful-life disclosure.`} Operating-margin inputs are measured at starting D&A intensity; changes in D&A intensity adjust EBIT before the FCFF add-back, avoiding a free noncash-profit uplift.`,
    limitation:"Long-term investment assumptions materially affect valuation. Useful lives, maintenance/expansion allocation, complete operating invested capital and noncash lease additions are not normalized. Cash CapEx excludes lease-financed asset additions; review lease obligations and associated expenses before treating the valuation as complete. No precise cohort depreciation or ROIC is asserted.",
  };
}
