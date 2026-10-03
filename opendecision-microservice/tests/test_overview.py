from __future__ import annotations

import copy
import json
import random
from pathlib import Path

import pytest

from rapid_analysis.contract import FindingEvidence, Overview
from tests.support.fixtures import FIXTURE_IDS, fixture_household_documents, fixture_household_raw
from rapid_analysis.overview import overview_build
from tests.test_checklist import EXPECTED, ORDER

SAMPLES = Path(__file__).resolve().parent / "fixtures" / "expected"
FORBIDDEN = ["score", "probabilit", "entail", "backend", "modernbert", "moritzlaurer", "opendecision",
             "zeroshot", "logit", "threshold", "native_nli", "explicit_opposite"]


def build(household_id, raw=None):
    return overview_build(raw or fixture_household_raw(household_id), fixture_household_documents(household_id))


def all_strings(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield str(k)
            yield from all_strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from all_strings(v)
    elif isinstance(obj, str):
        yield obj


def displayed_numbers(overview):
    s = overview["summary"]
    for key in ("agi", "cash", "mortgage_interest"):
        yield key, s[key]
    for m in overview["members"]:
        for n in m["numbers"]:
            yield f"{m['person_id']}.{n['field']}", n


def shuffled(obj, rng):
    if isinstance(obj, dict):
        items = list(obj.items())
        rng.shuffle(items)
        return {k: shuffled(v, rng) for k, v in items}
    if isinstance(obj, list):
        return [shuffled(v, rng) for v in obj]
    return obj


# ---------------------------------------------------------------- no model (DECISION_BACKEND=none)


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_schema_validates_model_off(backend_none, household_id):
    overview = build(household_id).overview
    Overview.model_validate(overview)
    assert overview["errors"] == []
    assert all(n["check"] in ("not_checked", "conflicted") for _, n in displayed_numbers(overview))


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_section6_holds_model_off(backend_none, household_id):
    items = {i["id"]: i for i in build(household_id).overview["checklist"]}
    assert [(items[k]["answer"], items[k]["dollar_impact"]) for k in ORDER] == EXPECTED[household_id]


def test_hh003_missing_hsa_plan_proof(backend_none):
    dq = build("HH003").overview["data_quality"]
    assert dq["missing_documents"] == [{
        "type": "1095", "member": "Morgan Lee", "person_id": "HH003-P1",
        "description": "Proof of an HSA-eligible health plan for Morgan Lee",
    }]


def test_hh004_conflicts_list_wages_with_both_values(backend_none):
    overview = build("HH004").overview
    assert overview["data_quality"]["conflicts"] == [{
        "field": "wages", "label": "Wages", "member": "Jordan Park", "person_id": "HH004-P1",
        "candidates": [
            {"value": 120000, "source_document": "jordan_w2_2025.pdf", "page": 1},
            {"value": 165000, "source_document": "hh004_1040_2025.pdf", "page": 1},
        ],
    }]
    wages = next(n for n in overview["members"][0]["numbers"] if n["field"] == "wages")
    assert wages["value"] is None and wages["check"] == "conflicted"
    assert len(wages["candidates"]) == 2


def test_hh006_matches_spec_shape(backend_none):
    o = build("HH006").overview
    assert (o["household_id"], o["tax_year"], o["status"], o["priority"]) == ("HH006", 2025, "findings", "high")
    assert o["summary"]["filing_status"] == "married_filing_jointly"
    assert o["summary"]["dependents"] == 1
    assert o["summary"]["agi"] == {"value": 152000, "check": "not_checked", "source_document": "hh006_1040_2025.pdf", "page": 1}
    assert o["summary"]["dependents_source_document"] == "hh006_1040_2025.pdf"
    assert o["summary"]["cash"]["value"] == 210000 and o["summary"]["cash"]["months_of_income"] == 16.6
    taylor = o["members"][0]
    assert (taylor["person_id"], taylor["name"], taylor["employer"]) == ("HH006-P1", "Taylor Mock", "Adventure Works Sample")
    k401 = next(n for n in taylor["numbers"] if n["field"] == "employee_401k_contribution")
    assert k401["label"] == "401(k) contribution" and k401["value"] == 2000
    assert k401["context"] == "1.8% of pay · 9% of limit · $21,500 room left"
    assert o["changes_since_last_year"] == [{"type": "life_event_new_dependent", "text": "Dependents increased from 0 to 1"}]
    f1 = next(f for f in o["findings"] if f["id"] == "F1")
    assert f1["headline"] == "Taylor could save more for retirement"
    assert f1["action_label"] == "Discuss savings" and f1["member"] == "Taylor Mock"
    assert o["checklist_label"] == "Flags for review, not advice"


def test_findings_sorted_by_priority(backend_none):
    ranks = {"informational": 0, "low": 1, "medium": 2, "high": 3}
    for household_id in FIXTURE_IDS:
        priorities = [ranks[f["priority"]] for f in build(household_id).overview["findings"]]
        assert priorities == sorted(priorities, reverse=True)


def test_errors_mean_needs_review_and_empty_sections(backend_none):
    raw = fixture_household_raw("HH001")
    raw["adjusted_gross_income"] = "a lot"
    overview = build("HH001", raw).overview
    Overview.model_validate(overview)
    assert overview["status"] == "needs_review"
    assert [e["code"] for e in overview["errors"]] == ["invalid_money"]
    assert overview["errors"][0]["path"] == "adjusted_gross_income"
    assert overview["summary"] is None
    assert overview["members"] == overview["checklist"] == overview["findings"] == []


def test_model_failure_still_renders(isolated_engine):
    class Broken:
        def relations(self, **kwargs):
            raise RuntimeError("boom")

    isolated_engine.setattr("rapid_analysis.engine._factory", Broken)
    overview = build("HH001").overview
    Overview.model_validate(overview)
    assert overview["status"] == "findings"
    assert [e["code"] for e in overview["errors"]] == ["validator_unavailable"]
    assert overview["errors"][0]["severity"] == "warning"
    assert all(n["check"] == "not_checked" for _, n in displayed_numbers(overview))


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_key_order_does_not_change_output(backend_none, seed):
    for household_id in FIXTURE_IDS:
        raw = fixture_household_raw(household_id)
        assert build(household_id, shuffled(copy.deepcopy(raw), random.Random(seed))).overview == build(household_id, raw).overview


# ---------------------------------------------------------------- model on


@pytest.mark.model
@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_schema_validates_model_on(loaded_engine, household_id):
    result = build(household_id)
    Overview.model_validate(result.overview)
    for evidence in result.evidence.values():
        FindingEvidence.model_validate(evidence)
    assert result.overview["errors"] == []


@pytest.mark.model
@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_no_opendecision_internals_in_output(loaded_engine, household_id):
    result = build(household_id)
    text = json.dumps([result.overview, result.evidence]).lower()
    for word in FORBIDDEN:
        assert word not in text, word


@pytest.mark.model
@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_every_sourced_number_with_document_is_checked(loaded_engine, household_id):
    available = set(fixture_household_documents(household_id))
    overview = build(household_id).overview
    checked = 0
    for key, number in displayed_numbers(overview):
        if number["source_document"] in available:
            assert number["check"] != "not_checked", key
            checked += 1
    assert checked == sum(1 for _, n in displayed_numbers(overview) if n["source_document"] in available)


@pytest.mark.model
@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_section6_holds_model_on(loaded_engine, household_id):
    items = {i["id"]: i for i in build(household_id).overview["checklist"]}
    assert [(items[k]["answer"], items[k]["dollar_impact"]) for k in ORDER] == EXPECTED[household_id]


@pytest.mark.model
def test_fixture_values_are_verified_not_just_checked(loaded_engine):
    overview = build("HH001").overview
    assert {k: n["check"] for k, n in displayed_numbers(overview) if n["source_document"]} == {
        "agi": "verified", "cash": "verified",
        "HH001-P1.wages": "verified", "HH001-P1.employee_401k_contribution": "verified",
        "HH001-P2.wages": "verified", "HH001-P2.employee_401k_contribution": "verified",
    }


@pytest.mark.model
def test_hh004_evidence_drilldown(loaded_engine):
    result = build("HH004")
    conflict = next(f for f in result.overview["findings"] if f["type"] == "source_data_conflict")
    evidence = result.evidence[conflict["id"]]
    wages = evidence["values"][0]
    assert wages["check"] == "conflicted"
    assert {(d["document"], d["value"]) for d in wages["documents"]} == {
        ("jordan_w2_2025.pdf", 120000), ("hh004_1040_2025.pdf", 165000)}
    assert all(d["check"] == "verified" for d in wages["documents"])


@pytest.mark.model
@pytest.mark.parametrize("seed", [1, 2, 3])
def test_key_order_does_not_change_output_model_on(loaded_engine, seed):
    for household_id in ("HH001", "HH004", "HH009"):
        raw = fixture_household_raw(household_id)
        assert build(household_id, shuffled(copy.deepcopy(raw), random.Random(seed))).overview == build(household_id, raw).overview


@pytest.mark.model
@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_committed_samples_equal_builder_output(loaded_engine, household_id):
    sample = json.loads((SAMPLES / f"overview_{household_id}.json").read_text(encoding="utf-8"))
    assert sample == build(household_id).overview
