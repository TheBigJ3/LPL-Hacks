"""Load the committed synthetic fixtures (SYNTHETIC TEST DATA)."""

from __future__ import annotations

import json
from pathlib import Path

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"
HOUSEHOLDS_DIR = FIXTURES_DIR / "households"
FIXTURE_IDS = [f"HH{n:03d}" for n in range(1, 11)]


def fixture_household_raw(household_id: str) -> dict:
    return json.loads((HOUSEHOLDS_DIR / f"{household_id}.json").read_text(encoding="utf-8"))
