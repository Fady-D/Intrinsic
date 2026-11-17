import type { Assumptions } from "./types";
export const assumptionLabels: Record<Exclude<keyof Assumptions,"annualGrowth" | "annualCapex">,string> = {
  financeLeaseYtdAdditions:"YTD finance-lease asset additions",
  financeLeaseInvestmentRate:"Finance-lease asset additions / revenue",
  capexHoldYears:"CapEx expansion years",capexNormalizationYears:"CapEx normalization year",capexCurve:"CapEx transition curvature",daNearRate:"Starting D&A / revenue",
  growthEarly:"Early revenue growth",growthMiddle:"Middle revenue growth",growthLate:"Late revenue growth",
  initialMargin:"Year 1 operating margin",targetMargin:"Year 10 operating margin",taxRate:"Cash tax rate",
  daRate:"D&A / revenue",capexRate:"Long-term CapEx / revenue",capexNearRate:"Near-term CapEx / revenue",
  nwcRate:"Working-capital investment ratio",wacc:"WACC",terminalGrowth:"Terminal growth",marginOfSafety:"Margin of safety",shares:"Fully diluted share count",
};
export type AssumptionErrors = Partial<Record<keyof Assumptions,string>>;
/** Return all field errors without altering user-entered assumptions. */
export function assumptionErrors(a: Assumptions): AssumptionErrors {
  const errors: AssumptionErrors = {};
  for(const [key,label] of Object.entries(assumptionLabels) as [Exclude<keyof Assumptions,"annualGrowth" | "annualCapex">,string][]) {
    const v=a[key];
    if(["capexNearRate","capexHoldYears","capexNormalizationYears","capexCurve","daNearRate","financeLeaseInvestmentRate","financeLeaseYtdAdditions"].includes(key) && v===undefined) continue;
    if(typeof v!=="number" || !Number.isFinite(v)) errors[key]=`${label} is unavailable or invalid; enter a finite number.`;
  }
  const range=(key:Exclude<keyof Assumptions,"annualGrowth" | "annualCapex">, low:number, high:number, description:string)=>{
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
  if(a.financeLeaseYtdAdditions!==undefined && a.financeLeaseYtdAdditions<0) errors.financeLeaseYtdAdditions="YTD finance-lease asset additions must be nonnegative.";
  if(a.financeLeaseInvestmentRate!==undefined) range("financeLeaseInvestmentRate",0,1,"must be between 0% and 100%.");
  if(a.daNearRate!==undefined) range("daNearRate",0,1,"must be between 0% and 100%.");
  for(const [key,min,max] of [["capexHoldYears",1,4],["capexNormalizationYears",3,10]] as const)
    if(a[key]!==undefined && (!Number.isInteger(a[key]) || a[key]!<min || a[key]!>max)) errors[key]=`${assumptionLabels[key]} must be an integer from ${min} to ${max}.`;
  if((a.capexNormalizationYears??6)<=(a.capexHoldYears??2)) errors.capexNormalizationYears="CapEx normalization year must follow the expansion period.";
  if(a.capexCurve!==undefined) range("capexCurve",.1,4,"must be between 0.1 and 4.");
  if(a.annualCapex!==undefined && (!Array.isArray(a.annualCapex) || a.annualCapex.length!==10 || a.annualCapex.some(x=>x!==null && (!Number.isFinite(x) || x<0 || x>1))))
    errors.annualCapex="Annual CapEx needs ten entries: use modeled values or finite revenue ratios between 0% and 100%.";
  if(a.annualGrowth!==undefined) {
    if(!Array.isArray(a.annualGrowth) || a.annualGrowth.length!==10) errors.annualGrowth="Annual revenue forecast requires ten growth rates.";
    else {
      const i=a.annualGrowth.findIndex(g=>typeof g!=="number" || !Number.isFinite(g) || g<=-1);
      if(i>=0) errors.annualGrowth=`Revenue forecast year ${i+1} needs a finite growth rate greater than −100%.`;
    }
  }
  return errors;
}
