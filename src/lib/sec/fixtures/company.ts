/** Synthetic non-calendar-year fixture; never served as actual company data. */
import type { CompanyFacts, SecFact, Submissions } from "../types";
export const fixtureCik = 1234;
export function fact(
  start: string | undefined,
  end: string,
  val: number,
  form = "10-K",
  filed = "2025-08-01",
  accn = "0000001234-25-000001",
): SecFact {
  return {
    start,
    end,
    val: val * 1e6,
    form,
    filed,
    accn,
    fy: 2025,
    fp: form === "10-K" ? "FY" : "Q1",
  };
}
export function fixture() {
  const facts: CompanyFacts = {
    cik: fixtureCik,
    entityName: "Synthetic Fixture Co",
    facts: { "us-gaap": {}, dei: {} },
  };
  const windows = [
    {
      start: "2023-07-01",
      end: "2024-06-30",
      form: "10-K",
      filed: "2024-08-01",
      accn: "0000001234-24-000001",
      scale: 0.8,
    },
    {
      start: "2024-07-01",
      end: "2025-06-30",
      form: "10-K",
      filed: "2025-08-01",
      accn: "0000001234-25-000001",
      scale: 1,
    },
    {
      start: "2024-07-01",
      end: "2024-09-30",
      form: "10-Q",
      filed: "2024-11-01",
      accn: "0000001234-24-000002",
      scale: 0.2,
    },
    {
      start: "2025-07-01",
      end: "2025-09-30",
      form: "10-Q",
      filed: "2025-11-01",
      accn: "0000001234-25-000002",
      scale: 0.3,
    },
  ];
  for (const [tag, value] of Object.entries({
    RevenueFromContractWithCustomerExcludingAssessedTax: 1000,
    OperatingIncomeLoss: 200,
    NetIncomeLoss: 150,
    NetCashProvidedByUsedInOperatingActivities: 240,
    PaymentsToAcquirePropertyPlantAndEquipment: 100,
    DepreciationDepletionAndAmortization: 40,
    ShareBasedCompensation: 20,
    WeightedAverageNumberOfDilutedSharesOutstanding: 100,
  })) {
    const unit =
      tag === "WeightedAverageNumberOfDilutedSharesOutstanding"
        ? "shares"
        : "USD";
    facts.facts["us-gaap"][tag] = {
      units: {
        [unit]: windows.map((w) =>
          fact(
            w.start,
            w.end,
            tag === "WeightedAverageNumberOfDilutedSharesOutstanding"
              ? 100
              : value * w.scale,
            w.form,
            w.filed,
            w.accn,
          ),
        ),
      },
    };
  }
  for (const [tag, value] of Object.entries({
    CashAndCashEquivalentsAtCarryingValue: 120,
    ShortTermInvestments: 50,
    LongTermDebtCurrent: 20,
    LongTermDebtNoncurrent: 100,
    CommercialPaper: 10,
    CommonStockSharesOutstanding: 100,
  }))
    facts.facts["us-gaap"][tag] = {
      units: {
        [tag === "CommonStockSharesOutstanding" ? "shares" : "USD"]:
          windows.map((w) =>
            fact(undefined, w.end, value, w.form, w.filed, w.accn),
          ),
      },
    };
  const sub: Submissions = {
    cik: String(fixtureCik),
    name: "Synthetic Fixture Co",
    fiscalYearEnd: "0630",
    filings: {
      recent: {
        form: ["10-Q", "10-K"],
        reportDate: ["2025-09-30", "2025-06-30"],
        filingDate: ["2025-11-01", "2025-08-01"],
        accessionNumber: ["0000001234-25-000002", "0000001234-25-000001"],
        primaryDocument: ["fixture-q.htm", "fixture-k.htm"],
      },
    },
  };
  return { facts, sub };
}
