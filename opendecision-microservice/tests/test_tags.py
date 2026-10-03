"""Every id the service emits must exist in the config files (schema 1.1 adopts the taxonomy ids)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from rapid_analysis import api as api_module
from tests.support.fixtures import FIXTURE_IDS, fixture_household_documents, fixture_household_raw
from rapid_analysis.normalization import DOC_TYPE_IDS, doc_type_normalize
from rapid_analysis.overview import overview_build

DOCS = Path(__file__).resolve().parents[1] / "docs"
TAGS = json.loads((DOCS.parent / "config" / "tags.json").read_text(encoding="utf-8"))
FINDING_TYPES = {f["id"]: f for f in TAGS["finding_types"]}
DOC_TYPES = set(json.loads((DOCS.parent / "config" / "doc_types.json").read_text(encoding="utf-8")))
CHECKLIST = {c["id"] for c in TAGS["checklist"]}
CHECKS = {c["id"] for c in TAGS["check_status"]}


def assert_overview_ids(overview):
    assert overview["status"] in TAGS["household_status"]
    assert overview["priority"] is None or overview["priority"] in TAGS["priorities"]
    for item in overview["checklist"]:
        assert item["id"] in CHECKLIST, item["id"]
        assert item["answer"] in TAGS["checklist_answers"]
    for finding in overview["findings"]:
        assert finding["type"] in FINDING_TYPES, finding["type"]
        assert finding["category"] == FINDING_TYPES[finding["type"]]["category"], finding["type"]
        assert finding["category"] in TAGS["categories"]
        assert finding["priority"] in TAGS["priorities"]
        assert finding["check"] in CHECKS
    for change in overview["changes_since_last_year"]:
        assert change["type"] in FINDING_TYPES, change["type"]
    for missing in overview["data_quality"]["missing_documents"]:
        assert missing["type"] in DOC_TYPES
    s = overview["summary"]
    if s:
        for key in ("agi", "cash", "mortgage_interest"):
            assert s[key]["check"] in CHECKS
        assert s["dependents_check"] in CHECKS
    for member in overview["members"]:
        for number in member["numbers"]:
            assert number["check"] in CHECKS


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_emitted_ids_exist_in_tags_model_off(backend_none, household_id):
    build = overview_build(fixture_household_raw(household_id), fixture_household_documents(household_id))
    assert_overview_ids(build.overview)
    for evidence in build.evidence.values():
        assert evidence["check"] in CHECKS


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_committed_samples_use_tags_ids(household_id):
    sample = json.loads((Path(__file__).resolve().parent / "fixtures" / "expected" / f"overview_{household_id}.json").read_text(encoding="utf-8"))
    assert sample["schema_version"] == "1.1"
    assert_overview_ids(sample)


def test_finding_types_seen_across_rule_branches(backend_none):
    """Drive each rule branch (incl. code G and a mismatch) and check the ids it emits."""
    from rapid_analysis.normalization import normalize_household
    from rapid_analysis.rules import rules_evaluate

    raw = fixture_household_raw("HH010")
    raw["members"][0]["distribution_code"]["value"] = "G"
    outputs = [rules_evaluate(normalize_household(raw).household)]
    outputs.append(rules_evaluate(normalize_household(fixture_household_raw("HH007")).household, {"HH007-P1.wages": "mismatch"}))
    outputs += [rules_evaluate(normalize_household(fixture_household_raw(h)).household) for h in FIXTURE_IDS]
    seen = {f.type for result in outputs for f in result.findings}
    assert seen <= set(FINDING_TYPES)
    assert {"retirement_contribution_review", "self_employment_tax_review", "excess_cash_review",
            "retirement_distribution_review", "hsa_eligibility_unverified", "source_data_conflict",
            "life_event_new_dependent", "life_event_new_employer", "life_event_new_mortgage",
            "life_event_large_income_increase"} == seen


def test_doc_types_match_tags():
    assert set(DOC_TYPE_IDS) == DOC_TYPES
    assert [doc_type_normalize(x) for x in ("W-2", "1099-R", "Form 1098", "account_statement", "1095-B", "pay stub", None)] == \
        ["w2", "1099_r", "1098", "account_statement", "1095", "unknown", "unknown"]


def test_evidence_doc_types_are_tags_ids():
    for household_id in FIXTURE_IDS:
        for doc in fixture_household_documents(household_id).values():
            assert doc.form_type in DOC_TYPES, (doc.name, doc.form_type)


def test_enums_endpoint_uses_tags_ids(backend_none):
    with TestClient(api_module.app) as client:
        enums = client.get("/v1/meta/enums").json()
    assert enums["check"] == [c["id"] for c in TAGS["check_status"]]
    assert enums["answer"] == TAGS["checklist_answers"]
    assert enums["priority"] == TAGS["priorities"]
    assert enums["status"] == TAGS["household_status"]
    assert enums["category"] == TAGS["categories"]
    assert [c["id"] for c in enums["checklist"]] == [c["id"] for c in TAGS["checklist"]]
    assert [c["question"] for c in enums["checklist"]] == [c["question"] for c in TAGS["checklist"]]
    assert set(enums["change_type"]) <= set(FINDING_TYPES)
    assert set(enums["doc_type"]) == DOC_TYPES
    assert enums["tags"] == TAGS


# ---------------------------------------------------------------- config files


@pytest.fixture
def config_files(tmp_path, monkeypatch):
    """Point the loaders at temporary copies of the config files; caches are cleared before and after."""
    from rapid_analysis import taxonomy

    def write(doc_types=None, document_tags=None):
        source = Path(taxonomy.CONFIG)
        doc_types_path, tags_path = tmp_path / "doc_types.json", tmp_path / "document_tags.json"
        doc_types_path.write_text(json.dumps(doc_types) if doc_types is not None else (source / "doc_types.json").read_text())
        tags_path.write_text(document_tags if isinstance(document_tags, str) else
                             json.dumps(document_tags) if document_tags is not None else (source / "document_tags.json").read_text())
        monkeypatch.setattr(taxonomy, "DOC_TYPES_PATH", doc_types_path)
        monkeypatch.setattr(taxonomy, "DOCUMENT_TAGS_PATH", tags_path)
        taxonomy.doc_types.cache_clear()
        taxonomy.document_tags.cache_clear()

    yield write
    taxonomy.doc_types.cache_clear()
    taxonomy.document_tags.cache_clear()


UNKNOWN = {"label": "Unrecognized document", "description": "None of the listed document types", "patterns": [], "topics": []}


def test_a_new_doc_type_and_tag_are_one_entry_each(config_files):
    from rapid_analysis.documents import decision_request, doc_type_detect
    from rapid_analysis.textract import textract_parse_blocks
    from tests.support.textract_factory import TextractFactory

    config_files(doc_types={
        "k1": {"label": "Schedule K-1", "description": "IRS Schedule K-1 partner's share of income", "form_number": "K-1",
               "patterns": ["Schedule K-1"], "topics": ["income", "tax"]},
        "unknown": UNKNOWN,
    }, document_tags={"investments": [{"true": "This document shows dividends.", "false": "This document does not show dividends."}]})
    assert doc_type_detect("2025 Schedule K-1 (Form 1065)") == ("k1", None)
    assert textract_parse_blocks(TextractFactory().field("Form", "K1").build()).form_type == "k1"
    questions = decision_request("x", [])["questions"]
    assert questions["docType"]["criteria"] == {"k1": "IRS Schedule K-1 partner's share of income",
                                                "unknown": "None of the listed document types"}
    assert questions["tag_investments"] == {"type": "noul_any", "checks": [
        {"true": "This document shows dividends.", "false": "This document does not show dividends."}]}


@pytest.mark.parametrize("doc_types,document_tags,message", [
    ({"w2": {"label": "W-2", "description": "x", "patterns": []}}, None, "unknown"),
    ({"W 2": {"label": "W-2", "description": "x"}, "unknown": UNKNOWN}, None, "ids are lowercase"),
    ({"w2": {"label": "W-2"}, "unknown": UNKNOWN}, None, "description must be non-empty"),
    ({"w2": {"label": "W-2", "description": "x", "topics": ["nope"]}, "unknown": UNKNOWN}, None, "topic ids"),
    ({"w2": {"label": "W-2", "description": "x", "pattern": ["W-2"]}, "unknown": UNKNOWN}, None, "unknown keys"),
    (None, {"tax": []}, "non-empty list of checks"),
    (None, {"tax": "This document is tax-related."}, "non-empty list of checks"),
    (None, {"tax": [{"true": "This document is a tax return."}]}, "its opposite"),
    (None, {"tax": [{"true": "This document is a tax return.", "false": ""}]}, "non-empty text"),
    (None, {"Tax!": [{"true": "a", "false": "b"}]}, "names are lowercase"),
    (None, {"bonus": [{"true": "a", "false": "b"}]}, "topic ids"),
    (None, "{not json", "not valid JSON"),
])
def test_bad_config_is_rejected_with_a_clear_message(config_files, doc_types, document_tags, message):
    from rapid_analysis.taxonomy import ConfigError, config_check

    config_files(doc_types=doc_types, document_tags=document_tags)
    with pytest.raises(ConfigError, match=message):
        config_check()
