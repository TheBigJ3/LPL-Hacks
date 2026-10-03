from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from rapid_analysis import api as api_module
from scripts.export_openapi import openapi_dumps

DOCS = Path(__file__).resolve().parents[1] / "docs"
SAMPLES = DOCS / "samples"


def test_committed_openapi_matches_app():
    assert (DOCS / "openapi.json").read_text(encoding="utf-8") == openapi_dumps(), \
        "API shape changed: run scripts/export_openapi.py and update docs/CONTRACT.md"


def test_every_enum_value_is_in_contract_docs(backend_none):
    contract_doc = (DOCS / "CONTRACT.md").read_text(encoding="utf-8")
    with TestClient(api_module.app) as client:
        enums = client.get("/api/meta/enums").json()
    missing = []
    for name, values in enums.items():
        if name in ("check_descriptions", "checklist_label", "tags"):
            continue
        for value in values:
            token = value["id"] if isinstance(value, dict) else value
            if f"`{token}`" not in contract_doc:
                missing.append(f"{name}.{token}")
    assert missing == []
    assert enums["checklist_label"] in contract_doc


def test_samples_exist_for_every_fixture_and_validate():
    from rapid_analysis.contract import FindingEvidence, Overview
    from rapid_analysis.fixtures import FIXTURE_IDS

    for household_id in FIXTURE_IDS:
        Overview.model_validate(json.loads((SAMPLES / f"overview_{household_id}.json").read_text(encoding="utf-8")))
    FindingEvidence.model_validate(json.loads((SAMPLES / "evidence_HH004_F1.json").read_text(encoding="utf-8")))
