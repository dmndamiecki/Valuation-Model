# BizRaport API Model Fit

This note maps the BizRaport API documentation to the valuation platform data model. BizRaport data should be treated as source evidence, diagnostics support, and peer-screening infrastructure before it is allowed to drive final blended valuation outputs.

## Endpoints

- `/api/dane`: primary single-company import. Returns company identifiers, PKD, registry information, financial rows, company narratives, relationships, ownership, MSiG notices, and KRZ notices.
- `/api/katalog`: peer-screening source. Returns KRS rows matching financial, PKD, location, text, time, and boolean filters. Use for peer-set construction and benchmark QA, not final valuation output yet.
- `/api/szukaj`: company search by name, NIP, KRS, or REGON.
- `/api/zuzycie`: cost and usage monitoring. Should be used before large benchmark automation.

## Important Parsing Rules

- Several `/api/dane` nested sections can arrive as JSON strings, not already-parsed arrays. The adapter parses `informacje_o_firmie`, `dane_finansowe`, `opisy_firmy`, `powiazania`, `udzialy`, `monitor_sadowy`, and `krz`.
- Percent metrics in `/api/dane` are decimals, for example `0.15` means 15%.
- Percent filters in `/api/katalog` are whole percentages, for example `roa_od=15` means ROA >= 15%.
- BizRaport total liabilities are not financial debt. If used in the EV-to-equity bridge, they must be labelled as a conservative debt-like proxy.

## Field Coverage Added

The importer now preserves a wider operating and balance-sheet base:

- Revenue: total revenue, operating revenue, sales revenue.
- Costs: operating costs, cost of goods sold, salaries, depreciation, income tax.
- Profitability: gross profit, sales profit, operating profit, EBIT, EBITDA, pre-tax profit, net income.
- Balance sheet: total assets, fixed assets, current assets, equity, liabilities, debt ratio.
- Operating scale: employees and estimated employees.
- Risk: bankruptcy risk and closure risk.
- Context metadata: company description, key points, ownership, relationships, MSiG events, KRZ events.

## Valuation Engine Relevance

- DCF: revenue, EBITDA, EBIT, depreciation, tax, working capital and balance sheet checks.
- Comparable Companies: PKD, geography, size, growth, margin, ROA, ROE, debt ratio, employee scale.
- Precedent Transactions: not directly available from BizRaport; use BizRaport only for target normalization and sector/size matching.
- Asset-Based Floor: total assets, fixed assets, current assets, equity, liabilities.
- Scenario Analysis: historical growth, margins, operating leverage, risk flags.
- Monte Carlo: historical volatility proxies, margins, growth, leverage, legal/risk flags.
- Blended Range: BizRaport should contribute source confidence and diagnostics before contributing valuation weights.

## Guardrails

- Do not use BizRaport `estymowana_wartosc_firmy` as an independent valuation engine without documenting methodology and independence.
- Do not integrate peer benchmarks into final valuation outputs until peer selection, outlier trimming, sample-size diagnostics, and source metadata are complete.
- Keep all imported fields editable and preserve source metadata for auditability.
