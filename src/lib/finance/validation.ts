import type { Assumptions } from "./types";
export const assumptionLabels: Record<Exclude<keyof Assumptions,"annualGrowth">,string> = {
  growthEarly:"Early revenue growth",growthMiddle:"Middle revenue growth",growthLate:"Late revenue growth",
  initialMargin:"Year 1 operating margin",targetMargin:"Year 10 operating margin",taxRate:"Cash tax rate",
  daRate:"D&A / revenue",capexRate:"Long-term CapEx / revenue",capexNearRate:"Near-term CapEx / revenue",
  nwcRate:"Working-capital investment ratio",wacc:"WACC",terminalGrowth:"Terminal growth",marginOfSafety:"Margin of safety",shares:"Fully diluted share count",
};
export type AssumptionErrors = Partial<Record<keyof Assumptions,string>>;
/** Return all field errors without altering user-entered assumptions. */
export function assumptionErrors(a: Assumptions): AssumptionErrors {
  const errors: AssumptionErrors = {};
  for(const [key,label] of Object.entries(assumptionLabels) as [Exclude<keyof Assumptions,"annualGrowth">,string][]) {
    const v=a[key];
    if(key==="capexNearRate" && v===undefined) continue;
    if(typeof v!=="number" || !Number.isFinite(v)) errors[key]=`${label} is unavailable or invalid; enter a finite number.`;
  }
  const range=(key:Exclude<keyof Assumptions,"annualGrowth">, low:number, high:number, description:string)=>{
    if(!errors[key] && (a[key]!<low || a[key]!>high)) errors[key]=`${assumptionLabels[key]} ${description}`;
  };
  for(const k of ["initialMargin","targetMargin"] as const) range(k,-1,1,"must be between −100% and 100%.");
  for(const k of ["taxRate","daRate","capexRate","nwcRate","marginOfSafety"] as const) range(k,0,1,"must be between 0% and 100%.");
  if(a.capexNearRate!==undefined) range("capexNearRate",0,1,"must be between 0% and 100%.");
  if(!errors.wacc && (a.wacc<=0 || a.wacc>=1)) errors.wacc="WACC must be positive and below 100%.";
  if(!errors.shares && a.shares<=0) errors.shares="Fully diluted share count must be greater than zero.";
  if(!errors.terminalGrowth && a.terminalGrowth<=-1) errors.terminalGrowth="Terminal growth must exceed −100%.";
  if(!errors.wacc && !errors.terminalGrowth && a.wacc<=a.terminalGrowth) {
    errors.wacc="WACC must exceed terminal growth."; errors.terminalGrowth="Terminal growth must be below WACC.";
  }
  for(const k of ["growthEarly","growthMiddle","growthLate"] as const)
    if(!errors[k] && a[k]<=-1) errors[k]=`${assumptionLabels[k]} must exceed −100%.`;
  if(a.annualGrowth!==undefined) {
    if(!Array.isArray(a.annualGrowth) || a.annualGrowth.length!==10) errors.annualGrowth="Annual revenue forecast requires ten growth rates.";
    else {
      const i=a.annualGrowth.findIndex(g=>typeof g!=="number" || !Number.isFinite(g) || g<=-1);
      if(i>=0) errors.annualGrowth=`Revenue forecast year ${i+1} needs a finite growth rate greater than −100%.`;
    }
  }
  return errors;
}
