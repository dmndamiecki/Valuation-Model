# Valuation UI Review Agent

This is your first small OpenAI Agents SDK agent for the valuation app.

What it does:

- Reads the main UI files for the Next.js valuation workbench.
- Reviews the app as a real product experience, not only as code.
- Compares the UI against market-quality expectations for modern financial and B2B workflow apps.
- Looks through several lenses: end user, business owner, financial analyst, and market benchmark reviewer.
- Returns a market-readiness score, persona review, competitive gaps, and prioritized fixes.

Run it from `github-ui-work`:

```powershell
py -m venv ui-review-agent/.venv
ui-review-agent/.venv/Scripts/python.exe -m pip install -r ui-review-agent/requirements.txt
ui-review-agent/.venv/Scripts/python.exe ui-review-agent/main.py
```

You can also give it a focus:

```powershell
ui-review-agent/.venv/Scripts/python.exe ui-review-agent/main.py --focus "mobile layout and onboarding clarity"
```

Or choose the reviewer's role:

```powershell
ui-review-agent/.venv/Scripts/python.exe ui-review-agent/main.py --mode business-owner
ui-review-agent/.venv/Scripts/python.exe ui-review-agent/main.py --mode end-user --focus "can a new user finish the first valuation?"
ui-review-agent/.venv/Scripts/python.exe ui-review-agent/main.py --mode analyst --focus "speed, auditability, and repeated-use workflow"
ui-review-agent/.venv/Scripts/python.exe ui-review-agent/main.py --mode market --focus "does this feel competitive with modern financial SaaS?"
```

The local benchmark checklist lives in `docs/market-benchmarks.md`. Edit that file when you want the agent to judge against a stricter or different market standard.

The API key lives in `.env.local` as `OPENAI_API_KEY`. Do not commit that file.

By default the agent uses `gpt-4.1-mini`. To use a different model, set `OPENAI_MODEL` in `.env.local`.
