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


def fixture_household_documents(household_id: str) -> dict:
    """Redacted evidence documents for a fixture household, keyed by document name."""
    from rapid_analysis.textract import evidence_from_textract

    return {name: evidence_from_textract(response, name) for name, response in fixture_household_textract(household_id).items()}


def fixture_overview_request(household_id: str) -> dict:
    """The POST /v1/overview body for a fixture household: the household plus its Textract documents."""
    return {
        "household": fixture_household_raw(household_id),
        "documents": [{"name": name, "textract": response} for name, response in fixture_household_textract(household_id).items()],
    }
