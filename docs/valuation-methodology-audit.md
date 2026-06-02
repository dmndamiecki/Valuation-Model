# SME DCF Valuation Methodology Audit

## Scope

Reviewed the MVP valuation model for methodology and calculation correctness across FCFF, WACC, terminal value, EV-to-equity bridge, DLOM, EBITDA normalization, sensitivity analysis, and forecast assumptions.

## Findings and fixes implemented

### 1. FCFF calculation

The core FCFF formula is now explicit and remains unlevered: revenue is forecast from growth assumptions, EBITDA is derived from normalized EBITDA margins, D&A is deducted to EBIT, cash taxes are applied to EBIT, and FCFF is calculated as NOPAT + D&A - capex - change in net working capital.

Fix implemented: EBITDA normalization now flows into forecast EBITDA margins through a calculated normalization margin uplift, so normalized earnings affect FCFF and enterprise value rather than only appearing as a memo item.

### 2. WACC calculation

The WACC formula remains based on target capital structure: cost of equity from a build-up/CAPM approach and after-tax cost of debt weighted by debt and equity capital weights.

Fix implemented: the after-tax cost of debt now uses the forecast tax rate in valuation scenario calculations, avoiding a methodological inconsistency where forecast cash taxes and WACC tax shield could diverge.

### 3. Terminal value

The model calculates both Gordon growth terminal value and exit EBITDA multiple terminal value. The selected method drives enterprise value.

Fix implemented: Gordon growth no longer silently returns zero when perpetual growth is greater than or equal to WACC. Invalid spreads now produce non-meaningful output (`N/M` in UI) so users do not mistake an invalid terminal assumption for a valid low valuation.

### 4. EV-to-equity bridge

The bridge remains methodologically correct for a debt-free/cash-free conversion: enterprise value plus cash and non-operating assets less debt and transaction/debt-like costs equals equity value.

No formula change was required, but the UI continues to show the bridge formula and intermediate values.

### 5. DLOM and private company discounts

DLOM should be applied to equity value after enterprise value has been converted to equity value, not to enterprise value or FCFF.

Fix implemented: discounts are now calculated sequentially at the equity level, with minority discount and key-person discount applied before DLOM. The result still reports the equivalent combined discount rate for transparency.

### 6. EBITDA normalization flow

Previously, normalized EBITDA was displayed but did not affect the DCF. That was a methodological error for an SME valuation model because normalized run-rate earnings should inform forecast operating cash flows.

Fix implemented: normalizing adjustments are translated into a margin uplift equal to total adjustments divided by latest historical revenue. That uplift is carried into the five-year forecast, making the valuation responsive to normalization assumptions.

### 7. Sensitivity table

The sensitivity table remains focused on adjusted equity value across WACC and perpetual growth cases.

Fix implemented: each sensitivity case now uses the same normalized FCFF forecast as the base case and flags invalid Gordon growth spreads instead of showing misleading values.

### 8. Forecast assumptions

The forecast assumptions remain revenue growth, base EBITDA margin, D&A as a percentage of revenue, capex as a percentage of revenue, cash tax rate, and working capital as a percentage of revenue.

Fix implemented: the UI labels EBITDA margin as a base margin and explains the normalization uplift, making the distinction between input operating margin and effective normalized margin transparent.

### 9. Professional output package

Added a professional valuation output package that pulls from pure valuation output functions rather than recalculating inside the React component. The package includes headline multiples, a detailed DCF schedule, terminal value support, EV-to-equity bridge, private company adjustment bridge, and warnings for WACC/g conflicts, negative FCFF, terminal value concentration, excessive debt, high DLOM, and high company-specific risk premium.

### 10. Bear / Base / Bull scenarios

Added Bear, Base, and Bull scenario analysis in the pure valuation scenario module. Scenario assumptions adjust revenue growth, EBITDA margin, WACC, terminal growth, and DLOM; Base uses the current user inputs with no adjustments. Scenario outputs include enterprise value, equity value, adjusted equity value, EV/EBITDA, terminal value contribution to EV, and warnings for invalid outputs or WACC less than or equal to terminal growth.

### 11. Diagnostics and quality control

Added a pure diagnostics module that recomputes the valuation from current assumptions and evaluates professional QC thresholds across forecast growth and margins, WACC, terminal value reliance, reinvestment, FCFF, leverage, normalization adjustments, DLOM, customer concentration, and key person discounts. Each diagnostic includes severity, valuation area, message, and suggested action. The default dataset intentionally uses terminal growth above 3.0% to demonstrate a warning while avoiding critical issues.

### 12. Exportable valuation report

Added a pure export module that builds a structured valuation report object containing company profile, input assumptions, normalized EBITDA bridge, forecast and DCF tables, WACC summary, terminal value support, EV-to-equity bridge, private-company adjustment bridge, diagnostics, scenarios, sensitivity, and a generated valuation conclusion. The UI only handles browser actions for clipboard and file downloads; report construction, professional summary text, JSON serialization, and CSV table generation remain outside React. PDF export and server-side APIs are intentionally excluded from this MVP.

### 13. Market multiples valuation

Added a pure market multiples module using manually entered EV/EBITDA and EV/Revenue benchmarks. The module calculates implied EV from normalized EBITDA, implied EV from latest revenue, weighted market EV, market equity value through the existing EV-to-equity bridge, DCF-versus-market differences, blended DCF/market EV and equity value, and market-specific diagnostics. The structured export report now includes the market valuation result.

### 14. Multi-section workflow UI

Refactored the single-page interface into a professional ten-section workflow with sticky in-page navigation: Company, Historical Financials, Normalization, Forecast, WACC, DCF, Market Approach, Scenarios & Sensitivity, Diagnostics, and Export. Status indicators are derived from validation state, diagnostics, scenario warnings, and existing valuation warnings; valuation calculations remain unchanged and continue to live in pure valuation modules.

### 15. Market data source treatment

Risk-free rates can be imported server-side from FRED where a country-to-series mapping exists; the FRED API key remains on the server and imported values are source-tagged in the WACC section. Equity risk premium currently uses a manual Damodaran Country Risk Premiums seed dataset dated January 5, 2026. Beta currently uses a manual Damodaran Industry Betas seed dataset dated January 9, 2026, mapped from the app industry template to the closest Damodaran industry. The Damodaran seeds are explicitly not live data, carry medium confidence, and should be refreshed periodically; the app warns when a seed dataset is more than 180 days old relative to the valuation date or current date. Market data imports update WACC assumptions only when users have not manually overridden those inputs, and valuation formulas remain unchanged.

### 16. Industry templates and forecast seeding

Industry templates now seed only classification-driven assumptions: beta, ERP, DLOM, and optional tax-rate defaults. They intentionally do not seed revenue growth, EBITDA margin, capex/revenue, or NWC/revenue. Forecast assumptions are generated from historical financial statements using the latest three available years: revenue growth uses a three-year CAGR clamped between -15% and +15%, EBITDA margin and D&A/revenue use three-year averages, capex/revenue uses the historical average when available or falls back to D&A/revenue, and NWC/revenue uses the latest available ratio or historical average. Generated forecast assumptions are explicitly source-labeled as generated from historical financial statements.
