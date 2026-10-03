"""Load the committed synthetic fixtures (SYNTHETIC TEST DATA)."""

from __future__ import annotations

import json
from pathlib import Path

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"
HOUSEHOLDS_DIR = FIXTURES_DIR / "households"
DOCUMENTS_DIR = FIXTURES_DIR / "documents"
FIXTURE_IDS = [f"HH{n:03d}" for n in range(1, 11)]


def fixture_household_raw(household_id: str) -> dict:
    return json.loads((HOUSEHOLDS_DIR / f"{household_id}.json").read_text(encoding="utf-8"))


def fixture_textract(document_name: str) -> dict | None:
    path = DOCUMENTS_DIR / f"{document_name}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def fixture_household_textract(household_id: str) -> dict[str, dict]:
    """Textract responses for the household's documents that have one (not every document does)."""
    raw = fixture_household_raw(household_id)
    found = {}
    for doc in raw.get("documents", []):
        response = fixture_textract(doc["name"])
        if response is not None:
            found[doc["name"]] = response
    return found
