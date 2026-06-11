from __future__ import annotations

from pathlib import Path

from agents import Agent, Runner, function_tool
from openai import OpenAIError


AGENT_DIR = Path(__file__).resolve().parent
APP_ROOT = AGENT_DIR.parent
PROMPT_PATH = AGENT_DIR / "docs" / "prompt.md"
BENCHMARKS_PATH = AGENT_DIR / "docs" / "market-benchmarks.md"

UI_FILES = [
    "app/page.tsx",
    "app/layout.tsx",
    "app/globals.css",
    "components/ui/card.tsx",
    "components/ui/input.tsx",
    "components/ui/label.tsx",
    "components/ui/badge.tsx",
    "package.json",
]


def load_local_env() -> None:
    env_path = APP_ROOT / ".env.local"
    if not env_path.exists():
        return

    import os

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _safe_read(path: Path, max_chars: int = 18000) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n\n[Truncated for agent context]\n"


def _summarize_page_tsx(path: Path) -> str:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    useful_markers = (
        "<main",
        "<section",
        "<WorkflowHeader",
        "<WorkflowNav",
        "<DataReadinessPanel",
        "<ImportedDataSummaryCard",
        "<ValuationRangePanel",
        "<CardTitle",
        "<CardDescription",
        "<Label",
        "<button",
        "wizardStep",
        "workflowSections",
        "startValuation",
        "startNewValuation",
    )
    extracted: list[str] = []
    for index, line in enumerate(lines, start=1):
        if any(marker in line for marker in useful_markers):
            extracted.append(f"{index}: {line.strip()}")

    context = "\n".join(extracted)
    if len(context) <= 30000:
        return context
    return context[:30000] + "\n\n[Truncated UI summary for agent context]\n"


@function_tool
def inspect_ui_files() -> str:
    """Read the valuation app's key UI files and summarize their contents for review."""
    sections: list[str] = []
    for relative_path in UI_FILES:
        path = APP_ROOT / relative_path
        if not path.exists():
            sections.append(f"## {relative_path}\nMissing.")
            continue
        if relative_path == "app/page.tsx":
            sections.append(f"## {relative_path}\n{_summarize_page_tsx(path)}")
            continue
        sections.append(f"## {relative_path}\n{_safe_read(path)}")
    return "\n\n".join(sections)


@function_tool
def load_market_benchmarks() -> str:
    """Load market-quality product benchmarks for valuation and financial workflow apps."""
    return BENCHMARKS_PATH.read_text(encoding="utf-8")


def build_agent() -> Agent:
    import os

    instructions = PROMPT_PATH.read_text(encoding="utf-8")
    return Agent(
        name="Valuation UI Review Agent",
        instructions=instructions,
        model=os.environ.get("OPENAI_MODEL", "gpt-4.1-mini"),
        tools=[inspect_ui_files, load_market_benchmarks],
    )


def run_ui_review(focus: str, mode: str = "market") -> str:
    load_local_env()
    agent = build_agent()
    mode_prompts = {
        "market": "Act as a strict market-grade UI auditor comparing this app to serious modern financial SaaS products.",
        "end-user": "Act as a first-time end user trying to complete a valuation with minimal guidance.",
        "business-owner": "Act as a business owner paying for a polished app and judging credibility, trust, and commercial quality.",
        "analyst": "Act as a financial analyst using this app repeatedly for real valuation work.",
    }
    mode_prompt = mode_prompts.get(mode, mode_prompts["market"])
    try:
        result = Runner.run_sync(
            agent,
            (
                "Run a UI quality check for this app. "
                f"{mode_prompt} "
                "Use inspect_ui_files and load_market_benchmarks before making findings. "
                f"Focus: {focus}"
            ),
        )
    except OpenAIError as exc:
        message = str(exc)
        if "insufficient_quota" in message or "exceeded your current quota" in message:
            return (
                "The agent is installed correctly, but OpenAI rejected the run because this "
                "project has no available API quota. Add billing or credits in OpenAI "
                "Platform, then run this command again."
            )
        raise
    return str(result.final_output)
