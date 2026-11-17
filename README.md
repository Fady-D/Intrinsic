# Intrinsic

Phase 1: an interactive, transparent unlevered DCF valuation dashboard. Built with Next.js App Router, strict TypeScript, React, Tailwind CSS, Recharts and Vitest.

## Run locally

Use Node.js 22.12+ (Node 24 LTS recommended) and npm. No accounts, API keys or paid services are required.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Enter **ASTR** to load Aster Systems, an entirely fictional company. Every other symbol returns an unsupported-symbol message. The fictional ASTR symbol does not refer to any real security with the same symbol.

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm start
```

Stop the development server before testing the production server on the default port. ESLint 9 is retained because Next.js's transitive lint plugins do not all declare ESLint 10 compatibility. The lockfile fixes the exact tested dependency versions.

## What is included

- Responsive dark research workspace with sidebar navigation and explicit fictional-data disclosures.
- Independent editable bear/base/bull scenarios, thirteen slider/numeric inputs, per-case and global reset. Edits survive scenario switching during the current page session; refreshing resets the model.
- Original scenario summaries and 15%, 25%, 35%, 50% margin-of-safety entry prices.
- Growth slowdown overlay for years 1–3, 4–5, 6–10 or all ten years, with original/adjusted value comparison. The original scenarios remain unchanged.
- Five responsive Recharts visualizations: revenue, FCFF, operating margins, scenarios and discounted annual cash flows.
- Historical source statements, a ten-year forecast plus terminal year, and enterprise-to-equity bridge with intermediate calculations.
- Helpful invalid-input messages and support for negative FCFF, terminal value, equity and per-share results.

## Project structure

```text
src/app/                        App Router page, root layout, responsive styles
src/components/dashboard.tsx    Workspace composition and scenario state
src/components/assumption-input.tsx  Reusable slider / precise numeric input
src/components/charts.tsx       Recharts views
src/lib/data/provider.ts        Asynchronous financial provider contract and errors
src/lib/data/illustrative.ts    Fictional source data and fresh scenario defaults
src/lib/finance/types.ts        Source, assumption, forecast and result interfaces
src/lib/finance/dcf.ts          Pure financial functions; no React dependencies
src/lib/finance/dcf.test.ts     Financial validation and provider-boundary tests
src/lib/format.ts              Presentation formatting
```

## Financial conventions

All financial statement amounts are **USD millions**, diluted shares are **millions of shares**, share prices are **USD/share**, and internal rates are decimal fractions. Source history ends in 2025; forecast years are 2026–2035; 2036 is the terminal year. The illustrative share price is dated 2025-12-31, not a current market quote.

Revenue compounds at the configured stage growth rate. Operating margin interpolates linearly from the year 1 input to the year 10 target, then stays at target in year 11. D&A and CapEx are fractions of forecast revenue. Change in NWC equals the configured ratio multiplied by the change in revenue; a revenue contraction releases NWC. Excess cash, debt and other claims come from the latest source balance sheet.

```text
EBIT = revenue × operating margin
Cash taxes = EBIT × tax rate
FCFF = EBIT × (1 − tax rate) + D&A − CapEx − change in NWC
PV of FCFF(t) = FCFF(t) / (1 + WACC)^t
Terminal value(t10) = FCFF(t11) / (WACC − terminal growth)
Enterprise value = sum(PV FCFF years 1–10) + PV terminal value
Equity value = enterprise value + excess cash − debt − other claims
Value per share = equity value / diluted shares
Safety entry price = value per share × (1 − margin of safety)
Upside/downside = value per share / illustrative market price − 1
```

Year 11 revenue grows at terminal growth, with target margins and the same tax, D&A, CapEx and NWC policies. Its FCFF is recomputed rather than merely growing year 10 FCFF. Terminal value is discounted ten years, and year 11 FCFF is not added to the explicit forecast. The displayed year 11 discount factor and PV are reference values only.

To follow the requested FCFF equation exactly, **negative EBIT assumes an immediate tax benefit**. The model does not assess whether that benefit is realizable. Share count and capital-structure adjustments remain fixed during the forecast. This model does not constrain terminal reinvestment against an independently estimated ROIC. These simplifications should be reviewed before using real-company inputs.

WACC must be positive and exceed terminal growth, terminal and stage growth must exceed −100%, shares must be positive, and tax/investment/safety rates have explicit bounds. Nonfinite and overflowing calculations are rejected. Zero market price or zero enterprise value gives an unavailable percentage, rather than division by zero. Negative values remain visible; negative safety entry prices are arithmetic outputs, not executable trade targets. A slowdown scales growth by (1 − reduction), so a negative growth rate becomes less negative.

The top summary, scenario cards and scenario chart always reflect **original scenarios**. The outlook charts, forecast and valuation bridge reflect the **selected scenario with slowdown applied**. No real securities or real-company financials are represented. A modeled value above price alone does not establish that a security is undervalued.

## Verification

21 executed Vitest cases cover financial primitives, annual discounting, terminal value, equity conversion, per-share and safety calculations, slowdown windows/boundaries, scenario independence, invalid WACC/growth, zero shares, negative flows, a zero price and unsupported tickers. The hand-calculated constant-FCFF case has annual FCFF of 130, WACC 10%, zero growth, enterprise value 1,300, equity 1,340 and value/share 13.40.

Linting, strict TypeScript and the production build were executed successfully. Browser checks verified ticker rejection, scenario retention, slowdown recalculation, invalid-terminal-input recovery and reset behavior; the 390px viewport had no document-level horizontal overflow. Browser console reported no warnings/errors during the final inspection.

## Phase 2

1. Implement SEC EDGAR and market-price adapters behind `FinancialDataProvider`, using server-side routes for credentials, identity headers, caching and rate limits.
2. Normalize fiscal periods, XBRL concepts, currency/units, restatements, diluted shares and source provenance; distinguish missing values from zero.
3. Add data reconciliation and real-company integration fixtures before exposing live valuations.
4. Refine cash-tax realizability, operating versus excess cash, non-equity claims and terminal reinvestment/ROIC assumptions.
5. Add saved local research state or export if needed. Authentication, databases, scheduled jobs and screening are outside Phase 1.
