import { tags } from "./normalize";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { CompanyFacts, SubmissionFiling } from "./types";

const extensions = new Set(["goog:RedeemableNoncontrollingInterestInVariableInterestEntity"]);
const standard = new Set([
  ...Object.values(tags).flat(),
  "ShortTermBorrowings", "CommercialPaper", "LongTermDebtAndFinanceLeaseObligationsIncludingCurrentPortion", "LongTermDebtAndCapitalLeaseObligations", "LongTermDebtAndFinanceLeaseObligationsCurrent", "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
  "MinorityInterest", "NoncontrollingInterestInVariableInterestEntity",
  "AmortizationOfIntangibleAssets", "Depreciation",
  "DepreciationDepletionAndAmortizationPropertyPlantAndEquipment",
  "DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "PreferredStockLiquidationPreference",
  "PreferredStockSharesOutstanding", "IncrementalCommonSharesAttributableToConversionOfPreferredStock",
  "WeightedAverageNumberOfDilutedSharesOutstanding", "Assets", "Liabilities", "StockholdersEquity", "PreferredStockSharesIssued", "PreferredStockValue", "DebtCurrent", "LongTermDebt", "LongTermDebtCurrent", "LongTermDebtNoncurrent", "NotesAndLoansPayable", "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities",
]);
type Node = Record<string, unknown>;
const array = (v: unknown): Node[] => (Array.isArray(v) ? v : v ? [v] : []) as Node[];
const object = (v: unknown): Node => v && typeof v === "object" ? v as Node : {};
const local = (n: Node, key: string) => Object.entries(n).find(([k]) => k.split(":").at(-1) === key)?.[1];

/** SEC extracted instance, not HTML: accept only consolidated, numeric, issuer-matched facts. */
export function mergeFilingFacts(
  facts: CompanyFacts, xml: string, filing: SubmissionFiling,
  sourceUrl: string, filingUrl: string, retrievedAt: string,
): void {
  if (xml.length > 25_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new Error("Invalid SEC XBRL instance.");
  const root = object(local(new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: true }).parse(xml), "xbrl"));
  const contexts = new Map<string, { start?: string; end: string; visaClassA?: boolean }>();
  for (const c of array(local(root, "context"))) {
    const entity = object(local(c, "entity")), identifier = object(local(entity, "identifier"));
    const segment=local(entity,"segment"), members=array(local(object(segment),"explicitMember"));
    const visaClassA=facts.cik===1403161 && members.length===1 && Object.keys(object(segment)).every(k=>k.split(":").at(-1)==="explicitMember") && members[0]["@_dimension"]==="us-gaap:StatementClassOfStockAxis" && members[0]["#text"]==="us-gaap:CommonClassAMember";
    if (Number(identifier["#text"]) !== facts.cik || (segment !== undefined && !visaClassA) || local(c, "scenario") !== undefined) continue;
    const p = object(local(c, "period")), end = local(p, "instant") ?? local(p, "endDate"), start = local(p, "startDate");
    if (typeof end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(end))
      contexts.set(String(c["@_id"]), { end, visaClassA, ...(typeof start === "string" ? { start } : {}) });
  }
  if (!contexts.size) throw new Error("No consolidated issuer XBRL contexts.");
  const units = new Map<string, string>();
  for (const u of array(local(root, "unit"))) {
    const m = local(u, "measure");
    if (typeof m === "string") units.set(String(u["@_id"]), m.split(":").at(-1)!);
    else {
      const divide = object(local(u, "divide"));
      const numerator = local(object(local(divide, "unitNumerator")), "measure"), denominator = local(object(local(divide, "unitDenominator")), "measure");
      if (typeof numerator === "string" && typeof denominator === "string")
        units.set(String(u["@_id"]), `${numerator.split(":").at(-1)}/${denominator.split(":").at(-1)}`);
    }
  }
  for (const [name, values] of Object.entries(root)) {
    const [ns, concept] = name.split(":");
    if (!(ns === "us-gaap" && standard.has(concept)) && !(facts.cik === 1652044 && extensions.has(name))) continue;
    for (const f of array(values)) {
      const period = contexts.get(String(f["@_contextRef"])), unit = units.get(String(f["@_unitRef"]));
      const raw = f["#text"];
      if (!period || !unit || typeof raw !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) continue;
      const val = Number(raw);
      if (!Number.isFinite(val)) continue;
      if(period.visaClassA && concept!=="WeightedAverageNumberOfDilutedSharesOutstanding") continue;
      const actualConcept=period.visaClassA?"ClassAEquivalentDilutedShares":concept;
      const taxonomy = facts.facts[period.visaClassA?"v":ns] ??= {}, entry = taxonomy[actualConcept] ??= { units: {} };
      (entry.units[unit] ??= []).push({ ...period, val, accn: filing.accessionNumber, form: filing.form, filed: filing.filingDate,
        sourceUrl, filingUrl, retrievedAt, ...(period.visaClassA?{sourceTag:"us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding [StatementClassOfStockAxis=CommonClassAMember]"}:{}), decimals: String(f["@_decimals"] ?? "") });
    }
  }
}
