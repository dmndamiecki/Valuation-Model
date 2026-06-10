# KRS-First Valuation Roadmap

## Positioning

The app should differentiate as a Polish SME valuation workbench where the user starts with a KRS number, not a blank model or an uploaded spreadsheet. The core product promise is:

> Enter KRS. The model builds the first valuation. You review and edit assumptions.

## Implemented Now

- KRS-first onboarding copy.
- One-step `Fetch and build model` workflow.
- Automatic application of KRS, BizRaport, PKD template, forecast seed, and WACC market sources where available.
- Polish data autopilot panel showing source readiness for KRS, BizRaport, PKD, forecast seed, and market inputs.
- KRS-built valuation range with conservative, base, upside, confidence score, and readiness headline.
- Local npm development setup through `start-local.cmd`.

## Quick Wins

- Add a persistent source badge in the header: `KRS connected`, `BizRaport connected`, `Manual override count`.
- Add an advanced drawer for manual source refresh instead of showing refresh buttons in the main workflow.
- Add an import audit trail row whenever KRS or BizRaport data is applied.
- Add Polish labels as a display option while preserving English banker-grade export wording.

## Medium Effort

- Add a visible football field chart from the existing banker-grade report object.
- Add a richer assumptions book UI with source, rationale, and edit state per major assumption.
- Add confidence scoring by input category: company profile, historicals, forecast, WACC, bridge, discounts, market approach.
- Add exportable PDF/HTML investment memo using the current JSON/CSV report data.

## Advanced

- Add per-field edit history and restore-to-source controls.
- Add Polish SME comparable company screening from BizRaport-style filters.
- Add document upload as a secondary path, not the primary workflow.
- Add full report versioning so each valuation run has a timestamped source and assumption snapshot.
