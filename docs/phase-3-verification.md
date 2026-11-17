# Phase 3 executed verification

Verified November 16, 2026 (America/New_York). These results distinguish real external retrieval from deterministic fixture tests and do not constitute investment assessments.

## Actual SEC integration matrix

The opt-in live suite executed 19 checks against the official exchange ticker directory, company submissions and Company Facts APIs. The ten specifically requested securities are listed first. Known unsupported types are expected to be blocked, rather than receive a corporate fair value.

| Query / SEC symbol | Issuer classification | Annual periods | Reporting currency | Observed result |
| --- | --- | ---: | --- | --- |
| NVDA | operating-company | 10 | USD | Loaded; requires reviewed excess cash, debt, claims, diluted shares and forecast assumptions. |
| AMD | operating-company | 10 | USD | Loaded; requires reviewed excess cash, debt, claims, diluted shares, D&A ratio and forecast assumptions. |
| META | operating-company | 10 | USD | Loaded; requires reviewed excess cash, debt, claims, diluted shares and forecast assumptions. |
| PYPL | operating-company | 10 | USD | Loaded; requires reviewed excess cash, debt, claims, diluted shares and forecast assumptions. |
| ADBE | operating-company | 10 | USD | Loaded; requires reviewed excess cash, debt, claims, diluted shares and forecast assumptions. |
| WDC | operating-company | 10 | USD | Loaded; requires reviewed excess cash, debt, claims, diluted shares and forecast assumptions. |
| TSLA | operating-company | 10 | USD | Loaded; requires reviewed excess cash, debt, claims, diluted shares, D&A ratio and forecast assumptions. |
| JPM | financial-institution | 0 | undetermined | Equity-based model required; operating DCF blocked. |
| BRK.B → BRK-B | financial-institution | 0 | undetermined | Equity-based model required; operating DCF blocked. |
| SPY | fund | 0 | undetermined | Fund/NAV analysis required; corporate DCF blocked. |
| MSFT | operating-company | 10 | USD | Loaded; requires reviewed excess cash, debt, claims, diluted shares and forecast assumptions. |
| GOOGL | operating-company | 10 | USD | Loaded; requires reviewed excess cash, claims, diluted shares, D&A ratio and forecast assumptions. |
| AAPL | operating-company | 10 | USD | Loaded; requires reviewed excess cash, claims, diluted shares and forecast assumptions. |
| AMZN | operating-company | 10 | USD | Loaded; requires reviewed excess cash, claims, diluted shares and forecast assumptions. |
| ORCL | operating-company | 10 | USD | Loaded; requires reviewed excess cash, debt, claims, diluted shares and forecast assumptions. |
| SAP | operating-company | 10 | EUR | Financial history loaded in EUR; USD model blocked. Source coverage and period limitations remain visible. |
| TSM | operating-company | 0 | undetermined | Recognized foreign issuer; TWD/USD annual-revenue units are ambiguous. No currency guessed and no valuation. |
| SHOP | operating-company | 9 | USD | Loaded; requires reviewed excess cash, debt, claims, diluted shares and forecast assumptions. |
| QQQ | Not in current SEC directory | — | — | No exact listing found; no QQQX substitution and no valuation. |

All 19 live checks passed their stated expectations. This does **not** mean 19 complete financial datasets or valuations: the matrix includes correct fund/financial-company exclusions, an absent-directory listing and ambiguous/non-USD currency cases. The suite retains raw normalized results and coverage details in ignored `.local/live/`.

The original five Phase 2 companies continue to load. SHOP disclosed only nine supported annual periods, which is shown as limited history rather than fabricated ten-year coverage. Some issuers require debt or D&A estimates because complete standard concepts could not be established. The listed manual fields are requirements observed in this snapshot, not permanent company attributes.

QQQ was absent from the exact directory at verification time; QQQX appeared as a different suggestion and was never substituted. TSM was found as an operating foreign issuer, but its annual revenue has both TWD and USD units. Without independent primary/convenience-currency identification, normalization and valuation remain incomplete. SAP's IFRS history is available in EUR; it is researched without entering the USD DCF. Some of its other concepts and interim coverage remain incomplete.

## Deterministic tests and build checks

The unit suite includes the Phase 1/2 tests plus dynamic ticker resolution, exact-versus-prefix matching, company names, accents/non-Latin names, punctuation collisions, multiple share classes, absent Company Facts, financial/fund/security classification, foreign forms, IFRS concepts, non-calendar and semiannual periods, currency consistency, ambiguous currencies, conservative D&A/OCF components and arbitrary-company initialization.

Final checks: 87 deterministic tests passed, lint passed, strict TypeScript passed and the production build passed. The existing FCFF/discounting/terminal/equity equations were not changed.

## Browser verification

- A company-name query for NVIDIA displayed NVDA, company name and Nasdaq before selection.
- Keyboard arrows and Enter selected an Alphabet listing from separate share-class suggestions.
- `brk.b` resolved to SEC `BRK-B`, identified insurance SIC 6331, and had no DCF initialization/forecast controls.
- SPY displayed a fund explanation and no corporate valuation controls.
- SAP displayed EUR financials and a currency/model limitation; no USD valuation was offered.
- NVDA initialized the preserved dashboard only after explicitly hypothetical manual estimates and acknowledgment. A 25,000-million share input remained represented correctly in both the numeric field and slider. Growth slowdown recalculated through the existing financial engine.
- An unknown symbol cleared the old company model and displayed a SEC-directory coverage error without a demo fallback.
- At a 390px viewport the document had no horizontal overflow. The browser console had no warnings/errors during inspection.

The hypothetical browser inputs were UI test values, not verified financial estimates. No market quote API key was configured, so live external quote retrieval remains unverified; manual USD prices and existing deterministic quote tests remain available.

## Reproduce

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run test:live
```

Live checks require the existing server-only `SEC_USER_AGENT` in ignored `.env.local`. Network restrictions or changes to SEC coverage can change the live outcome; such failures are reported rather than counted as successful retrieval.

Sources: [SEC exchange ticker directory](https://www.sec.gov/files/company_tickers_exchange.json), [SEC API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), and the exact filing/accession/XBRL provenance retained with each reported value. The Phase 2 [official filing comparison report](phase-2-verification.md) remains available as the earlier verification record.
