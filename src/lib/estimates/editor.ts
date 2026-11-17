import type{RevenuePlan}from"./types";
export type RevenueEdit={kind:"growth"|"revenue";value:number};
/** One editor, immutable source estimates, and explicit per-period growth overrides. */
export function editRevenuePlan(base:RevenuePlan,anchor:number|null|undefined,edits:Record<string,RevenueEdit>,fiscalModel=false):RevenuePlan {
 let previous=anchor??NaN;
 const rows:RevenuePlan["rows"]=[];
 for(const r of base.rows){const manual=Object.hasOwn(edits,r.fiscalEnd),entry=edits[r.fiscalEnd],growth=manual?(entry.kind==="revenue"?entry.value/previous-1:entry.value):r.estimate?r.estimate.revenue/previous-1:r.growth;const revenue=previous*(1+growth);previous=revenue;rows.push({...r,growth,revenue,source:manual?"User override":fiscalModel?"Fiscal-year model":r.source});}
 return {...base,rows,growths:rows.map(r=>r.growth),revision:JSON.stringify(rows.map(r=>[r.fiscalEnd,r.growth,r.source]))};
}
