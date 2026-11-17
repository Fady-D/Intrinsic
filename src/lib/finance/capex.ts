import type { VerifiedFinancials } from "../sec/types";
/** Historical normalization is an editable policy estimate, not company guidance. */
export function capexProfile(data: VerifiedFinancials) {
  const annual = data.annual.slice(-3);
  if (annual.length !== 3 || annual.some((p,i) => {
    const r=p.metrics.revenue.value, c=p.metrics.capex.value;
    const gap=i ? (Date.parse(p.end)-Date.parse(annual[i-1].end))/86400000 : 365;
    return r===null || r<=0 || c===null || c<0 || gap<350 || gap>380;
  })) return null;
  const normal=annual.reduce((sum,p)=>sum+p.metrics.capex.value!/p.metrics.revenue.value!,0)/3;
  const latest=data.interim ?? annual[2], r=latest.metrics.revenue.value, c=latest.metrics.capex.value;
  const duration=(Date.parse(latest.end)-Date.parse(latest.start))/86400000+1;
  if(r===null || r<=0 || c===null || c<0 || duration<80 || latest.end!==data.latestBalance.end) return null;
  const near=c/r;
  if(!Number.isFinite(near) || !Number.isFinite(normal) || near>1 || normal>1) return null;
  return { near, normal, reason: `Near-term CapEx/revenue ${(near*100).toFixed(2)}% uses ${latest.kind} disclosures for ${latest.start} – ${latest.end}. Long-term ${(normal*100).toFixed(2)}% is the arithmetic mean of the last three completed annual ratios (${annual.map(p=>p.end).join(", ")}). Hold the near-term ratio in forecast years 1–2, then interpolate to the long-term ratio by year 6; use the long-term ratio for terminal cash flow. These are editable estimates, with no assumption that recent elevated spending persists forever. Interim seasonality and structural investment changes require review.` };
}
export function projectedCapexRate(longTerm: number, nearTerm: number | undefined, period: number) {
  return nearTerm === undefined ? longTerm : nearTerm+(longTerm-nearTerm)*Math.min(1,Math.max(0,(period-2)/4));
}
