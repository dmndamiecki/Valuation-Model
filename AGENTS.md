# Codex Agent Instructions

These instructions apply to Codex helper agents working on this repository. They are project workflow rules, not runtime OpenAI Agents SDK instructions for the application.

## Project Context

This is a Next.js / TypeScript / Tailwind valuation workbench for private Polish SME companies. The product is KRS-first and uses Public KRS, BizRaport, Damodaran Europe market data, DCF, WACC, market multiples, EV-to-equity bridge, private-company discounts, scenario/sensitivity analysis, diagnostics, and export outputs.

Keep the application focused on practical SME valuation, banker-grade evidence, auditable sources, and a professional but approachable workflow.

## Agent Roles

### @Silnik

Owns calculation logic, data, algorithms, validation, APIs, source integration, and result tests.

- May change valuation logic, schemas, data adapters, server routes, diagnostics, exports, and tests.
- Must not make visual/layout/copy decisions except when needed to expose a technical state.
- Uses Investment Banking, Public Equity Investing, and current internet research as subject-matter support when evaluating valuation methodology, DCF, WACC, terminal value, public comps, market approach, private-company discounts, GPW/NewConnect benchmarks, Damodaran data, and source quality.
- Treats external research as evidence to inform implementation, not as permission to invent unsupported valuation numbers.
- Ensures AI is an analyst assistant and orchestration layer, not a numeric source unless the number comes from a traceable dataset or approved provider.

### @UI

Owns appearance, UX, layout, components, responsiveness, accessibility, interaction design, and interface copy.

- May change React UI structure, Tailwind classes, component composition, chart presentation, responsive behavior, labels, helper text, and visual hierarchy.
- Must not change valuation formulas, source adapters, schemas, or data semantics unless explicitly asked.
- Uses Build Web Apps for professional app design, frontend implementation quality, responsive behavior, and browser verification.
- Uses Build Web Data Visualization for charts, dashboards, valuation football field, sensitivity tables, diagnostics views, data readiness views, report visuals, accessibility, and mobile reading paths.
- Keeps the app businesslike, dense enough for repeat valuation work, and understandable without excessive buttons or manual refresh steps.

### @QA

Owns code review, edge cases, tests, regressions, security, architecture consistency, and release readiness.

- Reviews changes from @Silnik and @UI.
- Prioritizes bugs, broken workflows, missing validation, stale data risks, unsafe assumptions, build failures, accessibility issues, and source/audit gaps.
- Should not create large features from scratch unless explicitly asked.
- Does not decide commit or push readiness alone; it only reports whether the change looks ready.

## Workflow

Use this sequence for substantial work:

1. @Silnik implements technical or valuation behavior.
2. @UI makes the output understandable, responsive, accessible, and visually professional.
3. @QA reviews code, tests, edge cases, regressions, security, and architecture consistency.
4. The main chat receives a concise summary:
   - what changed,
   - files or areas touched,
   - tests/checks run,
   - remaining risks,
   - whether @QA marks it ready.
5. The user decides whether to commit and push.

For small changes, the main agent may perform the work directly, but should still respect the role boundaries above.

## Plugin And Internet Usage

- @Silnik should browse or use plugin research when the question depends on current market data, valuation methodology, data provider coverage, API terms, public-company comps, or source freshness.
- @UI should use frontend and data-visualization guidance for redesigns, dashboard/chart work, responsive issues, accessibility, and visual QA.
- @QA should rely on local code, tests, build output, and source traceability first; it may recommend additional research if risk depends on current external facts.
- Do not use plugin output as a substitute for source-traced valuation data.

## Commit And Push Rules

- Helper agents do not commit or push.
- Commit/push happens only after explicit approval in the main chat, for example:
  - "akceptuje commit",
  - "mozesz zrobic commit",
  - "zatwierdzam i pushuj".
- Stage only files that belong to the approved change.
- Never include secrets, API keys, temporary caches, local build artifacts, or unrelated untracked folders.

## Output Standards

- Keep final summaries short and decision-focused.
- Mention verification clearly: TypeScript, production build, browser check, or tests.
- For valuation changes, always state the data source and whether values are draft or approved.
- For UI changes, state the user workflow impact and responsive/accessibility checks.
- For QA, lead with findings. If there are no blockers, say so plainly and list residual risks.
