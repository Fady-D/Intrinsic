# Phase 2 executed verification

Live integration and filing checks executed on November 16, 2026 (America/New_York). Results below are data checks, not investment conclusions.

## Live SEC retrieval

The actual Company Tickers, Company Submissions and Company Facts APIs responded successfully for all five supported symbols. Each company supplied ten annual periods. Latest annual and intermediate availability:

| Company | Latest annual period end | Reconciled TTM period end |
| --- | --- | --- |
| MSFT | 2026-06-30 | 2026-09-30 |
| GOOGL | 2025-12-31 | 2026-09-30 |
| AAPL | 2026-09-26 | Latest annual is the full-year anchor; no later interim |
| AMZN | 2025-12-31 | 2026-09-30 |
| ORCL | 2026-05-31 | 2026-08-31 |

The UI exposed missing standard D&A concepts for MSFT, GOOGL and ORCL, plus uncertain debt coverage in some companies. These were not populated with zeros or demo financials. Five live integration checks passed independently of the deterministic suite.

## Official filing verification

Revenue, operating cash flow and positive CapEx were matched to statement rows in each company's official SEC 10-K HTML document. Values below are USD millions; reported FCF is arithmetic OCF minus CapEx.

| Company / period | Revenue | Operating cash flow | CapEx | Reported FCF |
| --- | ---: | ---: | ---: | ---: |
| AAPL / 2026-09-26 | 478,834 | 145,097 | 9,041 | 136,056 |
| GOOGL / 2025-12-31 | 402,836 | 164,713 | 91,447 | 73,266 |
| AMZN / 2025-12-31 | 716,924 | 139,514 | 131,819 | 7,695 |

Official documents: [Apple 10-K](https://www.sec.gov/Archives/edgar/data/320193/000032019326000026/aapl-20260926.htm), [Alphabet 10-K](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm), [Amazon 10-K](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm).

Amazon's `PaymentsToAcquireProductiveAssets` selection matched the filing's purchases-of-property-and-equipment amount. This verifies that selected amount in this filing; it does not establish that every productive-assets concept is universally interchangeable with PPE purchases. Other periods retain their own exact source tags and require review.

Reproduce with `npm run test:live`, then `npm run verify:filings`. The scripts keep raw normalized results and downloaded filing pages under ignored `.local/live/`. They make actual external requests and fail on unsuccessful retrieval or unmatched statement values.

## Deterministic and UI checks

The unit suite includes the original 21 financial tests and Phase 2 tests for identity resolution, malformed SEC responses, alternate concepts, annual/quarter/YTD selection, a June fiscal year, TTM reconciliation, weighted shares, restatement cutoffs, missing fields, currency/sign handling, no debt double-counting, HTTP throttling/cache/retries, quote failure/staleness, model initialization and ticker race handling.

Browser checks used actual AAPL and GOOGL API responses. They verified the incomplete-model gate, explicit hypothetical input acknowledgment, DCF initialization, price overrides, slowdown recalculation, independent scenario edits, and clearing old financials/inputs on ticker switching. A 390px viewport had no document-level horizontal overflow; financial tables scroll within their container. No browser console warnings/errors appeared in the final inspection.

These checks do not claim that all historical metrics, classifications or forecasts were independently verified. No external quote API key was configured, so only manual-price behavior and deterministic quote-adapter tests were verified.
