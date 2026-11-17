"use client";
import {useEffect,useMemo,useState} from "react";
import type {VerifiedFinancials} from "@/lib/sec/types";
import type {Assumptions} from "@/lib/finance/types";
import type {EstimateResponse,ForecastMode,RevenuePlan} from "@/lib/estimates/types";
import {editRevenuePlan,type RevenueEdit} from "@/lib/estimates/editor";
import {buildRevenuePlan,stageGrowths} from "@/lib/estimates/forecast";
import {millions,percent} from "@/lib/format";
export default function ForecastWorkbench({data,historical,onChange}:{data:VerifiedFinancials;historical:Assumptions;onChange:(p:RevenuePlan)=>void}) {
 const[mode,setMode]=useState<ForecastMode>("consensus"),[response,setResponse]=useState<EstimateResponse|null>(null),[edits,setEdits]=useState<Record<string,RevenueEdit>>({}),[error,setError]=useState("");
 useEffect(()=>{const c=new AbortController();fetch(`/api/estimates?ticker=${encodeURIComponent(data.ticker)}`,{signal:c.signal}).then(r=>r.json()).then(r=>{if(!c.signal.aborted)setResponse(Array.isArray(r.estimates)&&Array.isArray(r.warnings)?r:{status:"unavailable",provider:"FMP",retrievedAt:new Date().toISOString(),estimates:[],warnings:["Estimate response unavailable; historical model used."]});}).catch(()=>{if(!c.signal.aborted)setResponse({status:"unavailable",provider:"FMP",retrievedAt:new Date().toISOString(),estimates:[],warnings:["Analyst estimates unavailable; historical model used."]});});return()=>c.abort();},[data.ticker]);
 const{growthEarly,growthMiddle,growthLate,terminalGrowth}=historical;
 const plan=useMemo(()=>{
  const p=buildRevenuePlan(data,{growthEarly,growthMiddle,growthLate,terminalGrowth},mode,response?.estimates??[],mode==="custom"?stageGrowths({growthEarly,growthMiddle,growthLate}):undefined);
  const anchor=[data.ttm,...data.annual].find(x=>x?.end===p.anchorEnd)?.metrics.revenue.value;
  return editRevenuePlan(p,anchor,edits,mode==="custom");
 },[data,growthEarly,growthMiddle,growthLate,terminalGrowth,mode,response,edits]);
 useEffect(()=>onChange(plan),[plan,onChange]);
 function edit(end:string,value:number,kind:RevenueEdit["kind"]="growth"){if(!Number.isFinite(value)||(kind==="growth"?value<=-1:value<=0)){setError("Enter a finite growth rate above −100%, or positive annual revenue. The last valid forecast is retained.");return;}setError("");setEdits(prev=>({...prev,[end]:{kind,value}}));}
 return <section className="panel" id="revenue-forecasts">
  <div className="panel-heading"><h2>Revenue forecasts</h2><label>Forecast source<select aria-label="Forecast source" value={mode} onChange={e=>setMode(e.target.value as ForecastMode)}><option value="consensus">Available analyst estimates + model</option><option value="historical">Historical rolling-year model</option><option value="custom">Fiscal-year model / manual estimates</option></select></label><button className="text-button" onClick={()=>{setEdits({});setError("");}}>Reset revenue edits</button></div>
  <p className="table-note">One table controls base-case revenue. Edit growth or enter annual revenue in {data.currency} millions, including estimates you found yourself. Manual entries are user overrides, not verified consensus. Bear/bull use disclosed alternative growth paths. {plan.mode==="historical"?`Rolling-year anchor ${plan.anchorEnd}.`:`Fiscal-year anchor ${plan.anchorEnd}.`}</p>
  <p role="status">{response?.status==="unconfigured"?"No analyst provider configured — historical model fallback. You can enter your own fiscal-year estimates below.":plan.mode==="historical"?"Historical growth model; no verified analyst estimates applied.":"Fiscal-year forecasts: analyst estimates where available, model projections otherwise."}</p>
  {error&&<p role="alert">{error}</p>}
  <div className="table-scroll"><table><thead><tr><th>Year end</th><th>Revenue ({data.currency} m)</th><th>Growth (%)</th><th>Source</th></tr></thead><tbody>{plan.rows.map(r=>{
   return <tr key={r.fiscalEnd}><th>{r.fiscalEnd}</th><td><input type="number" step="any" aria-label={`Revenue ${r.fiscalEnd}`} value={Number.isFinite(r.revenue)?+r.revenue.toFixed(2):""} onChange={e=>edit(r.fiscalEnd,e.target.value===""?NaN:Number(e.target.value),"revenue")}/></td><td><input type="number" step="any" aria-label={`Growth ${r.fiscalEnd}`} value={Number.isFinite(r.growth)?+(r.growth*100).toFixed(4):""} onChange={e=>edit(r.fiscalEnd,e.target.value===""?NaN:Number(e.target.value)/100)}/></td><td>{r.source}{r.estimate&&<small> · {r.estimate.source}; retrieved {r.estimate.retrievedAt}</small>}</td></tr>;
  })}</tbody></table></div>
  <details className="coverage-details"><summary>Forecast sources and limitations</summary><p>{response?.warnings.join(" ")??"Checking optional analyst estimates…"} {plan.warnings.join(" ")}</p><p>{plan.explanation}</p><p>Starting revenue {millions([data.ttm,...data.annual].find(p=>p?.end===plan.anchorEnd)?.metrics.revenue.value)}m. Modeled starting growth {percent(growthEarly)}.</p></details>
 </section>;
}
