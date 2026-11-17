# Intrinsic

A personal stock valuation workspace with actual SEC EDGAR financials, explicit model estimates, independent scenarios and an interactive unlevered DCF engine. Phase 4 adds automatic fundamental forecasts and transparent WACC estimation. Phase 3 removes the five-ticker restriction and adds dynamic SEC directory search, listing/share-class identity, issuer classification and foundational foreign-reporting support. The existing scenario editor, slowdown simulator, five charts and DCF equations are preserved.

## Run locally

Use Node.js 24 LTS (also supported: Node 22.12+ or 26+) and npm.

```sh
npm ci
cp -n .env.example .env.local
```

Set `SEC_USER_AGENT` in `.env.local` to your application name and **your real contact email**. If `.env.local` already exists with the configured identity, retain it. The file is Git-ignored and never sent to the browser. No paid API, database, authentication or subscription is required.

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). Search **any listing in the official SEC exchange ticker directory** by ticker or company name, then select an autocomplete result. For example, try **NVIDIA / NVDA**, **AMD**, **META**, or **BRK.B**. SEC coverage is not the complete global exchange universe. The separate **ASTR demo** remains entirely fictional and is only shown when explicitly selected.

## Test an actual company

1. Search a ticker or company name. Suggestions show the company, exact SEC ticker and exchange before loading. Exact symbols are preferred; period/hyphen share-class aliases are resolved only if unambiguous. Exact company names with multiple classes require selection. The server resolves identity, retrieves submissions and checks model suitability before requesting Company Facts.
2. Review annual, YTD, quarter and TTM columns, source details, data coverage and warnings. Financial source amounts use millions of the identified reporting currency; shares use millions. The existing DCF and reference-price interface use USD only. Banks, insurers, funds, non-operating securities, unclassified issuers, and incompatible/undetermined currency cases do not receive an operating-company fair value.
3. Enter a manual USD share price, or optionally configure a free Alpha Vantage key as `QUOTE_API_KEY`. Quotes from this adapter are **previous-close**, never live. Stale quotes are displayed but not used automatically. A manual override is clearly labeled; price can remain unavailable, in which case upside/downside is unavailable.
4. Supply justified **excess cash, other claims and a fully diluted share estimate**. These cannot be reliably inferred from reported cash or weighted-average shares. Debt and D&A are prefilled only where the selected concepts provide coverage; otherwise input is required. Missing critical revenue, operating income, CapEx or irreconcilable interim periods block valuation.
5. The automatic baseline now fills supported estimates without an acknowledgment screen. Supply only material unresolved inputs (especially debt, preferred/minority claims or D&A). Valuations and independent scenarios appear immediately once sufficient inputs exist; no valuation is described as fully verified.
6. Edit bear/base/bull assumptions or apply growth slowdown as in Phase 1. Changing the reference price updates upside/downside. Loading or refreshing a company clears the prior model and initializes new company-specific inputs. Reinitializing explicitly resets the scenarios; refreshing the browser does not persist research state.

## Checks

```sh
npm test                 # deterministic fixtures, no live network dependency
npm run lint
npm run typecheck
npm run build
npm start                # after stopping dev server on the same port
```

Opt-in network checks, requiring a configured SEC contact:

```sh
npm run test:live        # checks 19 diverse SEC searches and coverage limits; writes ignored .local/live reports
npm run verify:filings   # matches AAPL, GOOGL and AMZN metrics to official 10-K rows
```

Run live retrieval before filing verification. These are separate from deterministic tests; mocked tests do not prove live connectivity. See [Phase 3 executed verification and per-security results](docs/phase-3-verification.md), and the historical [Phase 2 verification](docs/phase-2-verification.md).

## Architecture and changed files

| Area                       | Files                                                                                                                    | Responsibility                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| App                        | `src/app/page.tsx`, `layout.tsx`, `globals.css`                                                                          | Research entry point, metadata and responsive layout                                                                                 |
| Server endpoints           | `src/app/api/financials/route.ts`, `api/quote/route.ts`                                                                  | Server-only SEC and quote access, explicit error statuses                                                                            |
| Search and security policy | `src/lib/securities/{symbols,directory,classify}.ts`, `src/lib/sec/directory-service.ts`, `src/app/api/tickers/route.ts` | Cached official exchange directory, punctuation-safe matching, name search, classifications and future model-policy extension points |
| Search UI                  | `src/components/ticker-search.tsx`, `security-status.tsx`                                                                | Debounced accessible suggestions, keyboard selection, exchange labels and issuer/currency suitability                                |
| SEC data                   | `src/lib/sec/{client,normalize,types}.ts`                                                                                | Ticker identity, typed source data, comparable periods, provenance, FCF and TTM                                                      |
| HTTP                       | `src/lib/server/http.ts`                                                                                                 | Bounded memory cache, request coalescing, throttling, timeout and bounded retries                                                    |
| Quotes                     | `src/lib/market/quotes.ts`                                                                                               | Modular quote-provider contract, optional Alpha Vantage adapter, freshness and manual fallback                                       |
| Model adapter              | `src/lib/data/research.ts`                                                                                               | Required estimates, source-derived starting ratios and growth, safe ticker-state reducer, mapping into existing DCF                  |
| UI                         | `src/components/research-workspace.tsx`, `financial-sources.tsx`                                                         | Search, status, price, model review, historical financials and filing links                                                          |
| Preserved dashboard        | `src/components/dashboard.tsx`, `charts.tsx`                                                                             | Accepts company data and scenario defaults; retains Phase 1 controls and visualizations                                              |
| Financial engine           | `src/lib/finance/dcf.ts`                                                                                                 | Pure Phase 1 valuation equations; unchanged in Phase 2                                                                               |
| Types/formatting           | `src/lib/finance/types.ts`, `src/lib/format.ts`                                                                          | Explicit nullable unavailable source fields and readable missing-value formatting                                                    |
| Tests                      | `src/lib/{sec,server,market,data}/*.test.ts`, `src/lib/sec/fixtures/company.ts`                                          | Deterministic synthetic inputs covering period handling and provider behavior                                                        |
| Live verification          | `scripts/live-sec.test.ts`, `scripts/verify-filings.mjs`, `vitest.live.config.ts`                                        | Opt-in real retrieval and official-filing comparison                                                                                 |
| Configuration              | `.env.example`, `.gitignore`, `package*.json`                                                                            | Server environment template, ignored contact/runtime data and verification scripts                                                   |

The original illustrative provider remains isolated. `SecFinancialProvider` supplies a richer provenance-preserving result; `toDcfDataset` adapts reviewed inputs to the existing engine rather than replacing the financial model. Keys and contacts are only accessed by server modules. The quote interface permits another provider without changing valuation functions. `FinancialResearchProvider` is the provider contract for a future global source; SEC-specific identity and concept processing remain behind it. No global API subscription or automatic FX conversion is introduced.

## Financial and reporting conventions

- Financial source amounts are **millions of their identified reporting currency**, shares are **millions**, and internal rates are decimals. Valuation/reference prices remain **USD/share** and non-USD or ambiguous reporting currencies block the existing DCF. Other currency units are never silently combined.
- Annual duration facts must span 350–380 days in 10-K, 20-F or 40-F filings, supporting 52/53-week calendars. Interim YTD and quarterly periods remain distinct. Foreign 6-K facts are eligible only when start/end dates align; semiannual or irregular reporting is not assumed to be quarterly. Facts match exact start/end dates and are selected by filing date and accession at or before a snapshot cutoff.
- Historical values use the latest available comparable filings at the requested cutoff, so they can include restatements. The provenance identifies the actual filing used. The normalizer supports historical `asOf` cutoffs; the UI uses the current snapshot.
- TTM flows use **annual + current YTD − corresponding prior YTD**, requiring comparable durations, fiscal starts and matching concepts. TTM diluted weighted-average shares use day-weighted share-period arithmetic, not cash-flow addition. Quarter cash flows can be derived from consecutive YTD values when concepts and dates align.
- CapEx is a positive expenditure. **Reported FCF = operating cash flow − CapEx**, distinct from modeled FCFF. Annual FCF growth is shown only for comparable periods with a positive prior FCF. Other cases display N/A.
- Equivalent tag alternatives are ordered. Cash does not automatically include short-term investments. Debt totals are not added to their own components; short-term borrowing coverage must be explicit. Productive-assets CapEx and D&A variants retain the selected tags and scope caveats. Missing custom/standard concepts remain missing.
- Initial margins and CapEx/D&A ratios use aligned reported performance. Starting base growth uses comparable annual revenue growth, bounded to −20% to +30%, with editable bear/bull adjustments and later-year fade. Without comparable history, disclosed generic growth estimates require review. Forecast growth, taxes, WACC, NWC investment, terminal growth and safety margins remain **estimates**, not SEC disclosures.

```text
FCFF = EBIT × (1 − tax rate) + D&A − CapEx − change in NWC
PV FCFF(t) = FCFF(t) / (1 + WACC)^t
Terminal value(t10) = recomputed FCFF(t11) / (WACC − terminal growth)
Enterprise value = sum(PV FCFF years 1–10) + PV terminal value
Equity value = enterprise value + excess cash − debt − other claims
Value / share = equity value / fully diluted share estimate
Safety entry price = value / share × (1 − safety margin)
```

Margins interpolate from year 1 to year 10. NWC investment is a share of incremental revenue. Year 11 uses terminal growth and the same reinvestment policies; its FCFF is not double-counted. Year-end discounting applies. Negative flows, terminal values and equity values remain visible. The specified FCFF equation assumes an immediate tax benefit on negative EBIT; tax-benefit realizability is not assessed. Forecast labels are annual steps from the reporting anchor, especially for non-calendar and TTM inputs.

A modeled value above price does not establish an investment opportunity.

## Known limits and next work

- US-GAAP and a conservative set of IFRS standard concepts are supported in separate namespaces; custom XBRL extensions, mergers, transition years and missing concepts may require manual filing review. Unaligned periods block TTM/model use rather than receiving fabricated values.
- Debt coverage, operating versus excess cash, current dilution and non-equity claims require judgment. D&A variants can include depletion. PPE-only depreciation/amortization is not treated as complete D&A without a separately reported intangible-amortization component. Same-filing components can be added with their sources retained; otherwise manual review is required.
- No automatic tax-loss carryforwards, changing share counts, ROIC-constrained terminal reinvestment or share-split adjustment of historical shares. Each period's share concept and filing remain visible.
- SEC caching and rate limiting are **per running process**: 350ms request spacing, a one-day ticker-map cache, one-hour financial cache, and a 30-second refresh floor. Retries are bounded to three attempts for network/429/5xx errors. A scaled multi-process deployment would need shared rate limits/cache before broad use.
- The optional quote adapter uses a 15-minute cache and a conservative 96-hour stale threshold rather than an exchange calendar. No quote API key was configured for the executed checks; live market-quote retrieval was not verified. Manual price mode works without it.
- Source values have filing provenance; that is not a guarantee of accounting completeness or investment suitability. The UI requires acknowledgment of material manual estimates and never claims a fully verified valuation.
- `.env.local` is local-only. Configure SEC identity separately on any new machine or deployment. Never prefix secret environment variables with `NEXT_PUBLIC_`.

## Company-type support in Phase 3

| Type                                                                         | Support                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC operating-company candidates with consistent USD standard concepts       | Research, historical FCF/TTM and the existing DCF after critical estimates are supplied and acknowledged. No fixed ticker allowlist.                                                                                        |
| Foreign SEC operating issuers                                                | Partial: 20-F/40-F/6-K recognition, IFRS concepts, original-currency tables and source coverage. USD cases still need explicit ADR/share and accounting review. Non-USD or ambiguous currencies cannot enter the USD model. |
| Banks, insurers and other financial SIC issuers                              | Identity/classification only; operating-company FCFF is blocked. Model-policy extension points identify future dividend-discount, excess-return and residual-income models; no such valuations are implemented.             |
| ETFs, funds, identifiable warrants/units/preferreds and non-operating trusts | Identity and unsupported-model explanation; no corporate intrinsic value.                                                                                                                                                   |
| Unknown issuers or listings outside the SEC directory                        | Explicit classification/coverage error; no invented identity, substituted prefix match or financials.                                                                                                                       |

The official directory is [company_tickers_exchange.json](https://www.sec.gov/files/company_tickers_exchange.json). The server caches the parsed directory for one day and uses exact/alias indexes for resolution. Search is debounced and returns at most 12 ranked suggestions. Refreshing financials does not force a directory download.

Classification uses SEC SIC, entity type, filing forms, explicit fund/trust descriptions and identifiable instrument suffixes. It is conservative and is not a complete security master. Missing SIC blocks automatic model selection. Unmarked derivatives or preferred instruments may not be identifiable from this directory alone; users must confirm ordinary equity and share/ADR units before valuation. Current or historical filing metadata can change classifications. Historical transition years or unusual model ratios may still fall outside the Phase 1 engine's validation bounds and require separate review.

Live QQQ lookup currently finds no exact SEC-directory entry, and therefore returns a coverage error without substituting QQQX. TSM's annual revenue contains both TWD and USD units; this implementation does not guess the primary/convenience currency. SAP financials display in EUR, and SHOP disclosed nine available annual periods in the executed checks. These are documented limits, not silently successful USD valuations.

## Phase 4 automatic valuation

Load an operating-company ticker. The automatic panel derives 3/5/10-year revenue CAGRs when enough comparable history exists, recent growth, variability-adjusted growth fade, normalized margins, effective-tax proxies, D&A/CapEx intensity and trade working-capital investment. Up to eleven annual observations permit a true ten-year CAGR. Every rule and its estimate/reporting status is visible under evidence.

The WACC panel retrieves the official US Treasury 10-year par yield without an API key. A missing/stale observation stays missing. Beta 1, ERP 5% and a 2% credit spread are explicit editable policy estimates, not measured beta/current ERP/borrowing yields. Capital weights prefer an available non-stale quote times the diluted-share proxy; otherwise book equity is a disclosed proxy. A direct WACC override is available. Hypothetical reference prices affect upside/discount comparisons, not observed market capitalization.

Excess cash uses a 5%-of-revenue liquidity reserve plus available short-term investments; shares use the maximum of reported current common shares and diluted weighted averages. Both are estimates. Complete debt and preferred/minority claims are not inferred from absent disclosures. Incomplete cases identify the fields requiring review; entered zero is a manual assumption, not a verified absence. SBC remains in operating expenses with no second add-back/dilution deduction.

Status distinguishes Estimated, Provisional and Incomplete. Current beta/credit/capital-weight and trade-NWC proxies make typical automatic cases **Provisional**; material gaps remain **Incomplete**. The initial four live checks (MSFT, GOOGL, NVDA, WDC) derived distinct forecasts but all retained unresolved claims; some also required debt or D&A input. No values were supplied to force successful live valuations.

Reset returns to the automatically derived baseline. Scenario changes are labeled manual overrides; editing top-level financial/WACC inputs regenerates scenario baselines. Existing sliders, slowdown, charts, scenario comparisons and 15/25/35/50% hypothetical entry prices remain. Discount to fair value uses 1 − price/fair value, distinct from upside relative to price.
