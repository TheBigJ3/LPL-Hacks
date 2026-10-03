"""Run a checkpoint's tests and append the result to docs/CHECKPOINTS.md.

Usage (from analysis/):
  .venv/Scripts/python scripts/checkpoint.py "Phase 1" tests/test_normalization.py --notes "..."

Exits non-zero if any test failed or a strict xfail XPASSed. Never edits past entries.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOG = ROOT / "docs" / "CHECKPOINTS.md"
METRICS = ROOT / "logs" / "smoke_metrics.json"
PERF_METRICS = ROOT / "logs" / "perf_metrics.json"
HEADER = (
    "# Checkpoints\n\n"
    "Appended by `scripts/checkpoint.py`. One row per checkpoint run; never edited by hand.\n\n"
    "| Date | Phase | Command | Passed | Failed | XFailed | XPassed | Skipped | Notes |\n"
    "|---|---|---|---|---|---|---|---|---|\n"
)


def summary_counts(output: str) -> dict[str, int]:
    tail = output.strip().splitlines()[-1] if output.strip() else ""
    counts = {key: 0 for key in ("passed", "failed", "xfailed", "xpassed", "skipped", "error", "deselected")}
    for number, word in re.findall(r"(\d+) (passed|failed|xfailed|xpassed|skipped|errors?|deselected)", tail):
        counts["error" if word.startswith("error") else word] += int(number)
    return counts


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("phase")
    parser.add_argument("pytest_args", nargs="*")
    parser.add_argument("--notes", default="")
    parser.add_argument("--metrics", action="store_true", help="append logs/*_metrics.json to notes")
    args, passthrough = parser.parse_known_args()
    args.pytest_args = [*args.pytest_args, *passthrough]  # e.g. -m "not model" goes to pytest

    command = [sys.executable, "-m", "pytest", "-q", *args.pytest_args]
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    output = result.stdout + result.stderr
    print(output)
    counts = summary_counts(result.stdout)

    notes = args.notes
    if args.metrics:
        for path in (METRICS, PERF_METRICS):
            if path.exists():
                metrics = json.loads(path.read_text())
                notes = (notes + " " if notes else "") + ", ".join(f"{k}={v}" for k, v in metrics.items())
    failed = counts["failed"] + counts["error"]
    if counts["xpassed"]:
        notes += " STOP: strict xfail XPASSed."
    if failed:
        notes += " STOP: failures."

    LOG.parent.mkdir(parents=True, exist_ok=True)
    if not LOG.exists():
        LOG.write_text(HEADER, encoding="utf-8")
    pretty = "pytest -q " + " ".join(args.pytest_args)
    row = (
        f"| {dt.datetime.now().astimezone().isoformat(timespec='seconds')} | {args.phase} | `{pretty.strip()}` "
        f"| {counts['passed']} | {failed} | {counts['xfailed']} | {counts['xpassed']} | {counts['skipped']} "
        f"| {notes.strip().replace('|', '/')} |\n"
    )
    with LOG.open("a", encoding="utf-8") as handle:
        handle.write(row)
    print(row)
    return 1 if failed or counts["xpassed"] or result.returncode not in (0, 5) else 0


if __name__ == "__main__":
    sys.exit(main())
