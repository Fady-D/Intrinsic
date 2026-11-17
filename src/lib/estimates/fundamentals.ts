import type { FinancialPeriod, MetricKey, VerifiedFinancials } from "../sec/types";
const value = (p: FinancialPeriod, k: MetricKey) => p.metrics[k].value;
const median = (xs: number[]) => { const s = [...xs].sort((a,b)=>a-b); return s.length ? (s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2 : null; };
export const bound = (x: number, low: number, high: number) => Math.max(low, Math.min(high, x));
const pct = (x: number | null) => x === null ? "unavailable" : `${(100*x).toFixed(1)}%`;
/** Accounting observations inform explicit forecasting policies; none are verified future growth. */
export function growthFundamentals(data: VerifiedFinancials, fallback: number) {
  const history = data.annual.slice(-6), last = history.at(-1);
  const cagr = (years: number) => {
    const first = history.at(-1-years);
    if (!last || !first || Math.abs((Date.parse(last.end)-Date.parse(first.end))/86400000-years*365.25)>30) return null;
    const a=value(first,"revenue"), b=value(last,"revenue");
    return a !== null && b !== null && a>0 && b>0 ? (b/a)**(1/years)-1 : null;
  };
  const growths: number[]=[], margins: number[]=[], intensity: number[]=[], capitalRatios: number[]=[], cash: number[]=[];
  for (const p of history) {
    const r=value(p,"revenue"), e=value(p,"operatingIncome"), c=value(p,"operatingCashFlow");
    if (r && r>0) { if(e!==null) margins.push(e/r); if(c!==null) cash.push(c/r); }
  }
  const nwc = (p: FinancialPeriod) => {
    const ar=value(p,"receivables"), inv=value(p,"inventory"), ap=value(p,"payables");
    return ar!==null && inv!==null && ap!==null ? ar+inv-ap : null;
  };
  for(let i=1;i<history.length;i++) {
    const a=history[i-1], b=history[i], ar=value(a,"revenue"), br=value(b,"revenue");
    const span=(Date.parse(b.end)-Date.parse(a.end))/86400000;
    if(ar===null || br===null || ar<=0 || br<=0 || span<350 || span>380) continue;
    growths.push(br/ar-1);
    const capex=value(b,"capex"), da=value(b,"depreciation"), an=nwc(a), bn=nwc(b);
    if(capex===null || da===null || capex<0 || da<0 || an===null || bn===null) continue;
    const investment=capex-da+bn-an;
    intensity.push(investment/br);
    if(br>ar && investment>0) capitalRatios.push((br-ar)/investment);
  }
  const c3=cagr(3), c5=cagr(5);
  // TTM revenue / annual revenue is not YoY growth. Recover matched prior YTD only from reconciled TTM.
  const annualRevenue=last ? value(last,"revenue") : null, ytd=data.interim?.metrics.revenue.value??null, ttm=data.ttm?.metrics.revenue.value??null;
  const priorYtd=annualRevenue!==null && ytd!==null && ttm!==null ? annualRevenue+ytd-ttm : null;
  // Prior TTM is unavailable; use matched YTD growth and label it explicitly.
  const recentYtd=priorYtd!==null && priorYtd>0 && ytd!==null ? ytd/priorYtd-1 : null;
  const center=median([c3,c5,recentYtd,median(growths.slice(-3))].filter((x):x is number=>x!==null))??fallback;
  const volatility=growths.length>1 ? Math.sqrt(growths.reduce((s,g)=>s+(g-(median(growths)??g))**2,0)/growths.length) : null;
  const deceleration=c3!==null && c5!==null ? Math.max(0,(c5-c3)/2) : growths.length>=3 ? Math.max(0,((growths[0]+growths[1])/2-(median(growths.slice(-2))??0))/growths.length) : 0;
  const marginTrend=margins.length>=3 ? (margins.at(-1)!-margins[0])/(margins.length-1) : null;
  const cashConsistency=cash.length>=3 ? cash.filter(c=>c>0).length/cash.length : null;
  const capital=median(capitalRatios), investment=median(intensity);
  // Trade NWC + net PP&E investment is only a proxy; require three complete positive observations and a narrow range.
  const salesToCapital=capitalRatios.length>=3 && capitalRatios.length===growths.length && capital!==null && capital>=.2 && capital<=10 && Math.max(...capitalRatios)/Math.min(...capitalRatios)<=2 ? capital : null;
  const maturity=deceleration+Math.max(0,-(marginTrend??0))+(cashConsistency===null?0:(1-cashConsistency)*.02);
  const capacity=salesToCapital!==null && investment!==null && investment>0 ? investment*salesToCapital : null;
  const sustainable=bound(Math.min(center,capacity??center)/(1+10*(volatility??0)+10*maturity),-.02,.06);
  return { c3,c5, recentYtd, volatility, deceleration, marginTrend,cashConsistency,salesToCapital,sustainable,
    transition: bound(.2+5*maturity+2*(volatility??0),.2,.7),
    explanation: `3Y CAGR ${pct(c3)}; 5Y CAGR ${pct(c5)}; matched recent YTD growth ${pct(recentYtd)} (prior TTM YoY unavailable). Annual growth variability ${pct(volatility)}; annual deceleration ${pct(deceleration)}; margin trend ${pct(marginTrend)}; positive operating-cash-flow years ${pct(cashConsistency)}. Year-10 growth target ${pct(sustainable)}: median observed growth, limited by observed reinvestment capacity where measurable, divided by 1 + 10 × (variability + maturity pressure); policy bounds −2% to 6%. ROIC is unavailable: complete operating invested capital is not normalized.`,
    reinvestmentWarning: salesToCapital===null ? "Reliable incremental sales-to-capital unavailable (requires three comparable positive investment years with ratios within a 2× range). Existing CapEx, D&A and trade-NWC methodology retained; high growth may need more investment." : `Incremental sales-to-capital proxy ${salesToCapital.toFixed(2)}× from comparable positive investment years. Net reinvestment is floored at positive revenue change / this ratio, replacing any shortfall in existing net CapEx + trade NWC, never added twice. This accounting proxy excludes some intangibles and other operating working capital.`
  };
}
