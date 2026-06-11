# Valuation Platform Architect Agent

This app includes a server-side OpenAI Agents SDK agent named `Valuation Platform Architect`.

It is not a company valuation report generator. Its role is to advise on improving the valuation platform itself: valuation methodology, data architecture, data integrations, assumptions, diagnostics, auditability, reporting, workflow, and valuation-engine scalability.

## Endpoint

`POST /api/agents/valuation-platform-architect`

## Payload

```json
{
  "message": "Review the platform roadmap and identify the top five valuation correctness gaps.",
  "focusArea": "all",
  "includeWebResearch": false
}
```

`focusArea` can be `valuation-methodology`, `data-sources`, `architecture`, `quality-control`, `roadmap`, or `all`.

Set `includeWebResearch` to `true` when the answer depends on current vendor pricing, API availability, market-data coverage, update cadence, or licensing terms.

## Environment

The agent requires `OPENAI_API_KEY` in `.env.local`. The optional `OPENAI_MODEL` variable can override the default model.
