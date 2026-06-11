from __future__ import annotations

import argparse

from agent import run_ui_review


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the valuation app UI review agent.")
    parser.add_argument(
        "--focus",
        default="market readiness, end-user clarity, business-owner credibility, and competitive product polish",
        help="What the agent should pay special attention to.",
    )
    parser.add_argument(
        "--mode",
        choices=["market", "end-user", "business-owner", "analyst"],
        default="market",
        help="Reviewer persona to emphasize.",
    )
    args = parser.parse_args()

    print(run_ui_review(args.focus, args.mode))


if __name__ == "__main__":
    main()
