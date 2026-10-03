"""CHECKPOINT B: the tags block in the overview (amendment §5)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from rapid_analysis.contract import Overview
from tests.support.fixtures import FIXTURE_IDS, fixture_household_documents, fixture_household_raw
from rapid_analysis.overview import overview_build
from rapid_analysis.taxonomy import doc_types, document_tags, tag_ids

SAMPLES = Path(__file__).resolve().parent / "fixtures" / "expected"


def build(household_id):
    return overview_build(fixture_household_raw(household_id), fixture_household_documents(household_id)).overview


def assert_tag_ids(o):
    t = o["tags"]
    h = t["household"]
    assert set(h["topics"]) <= set(tag_ids("topics"))
    assert set(h["categories_flagged"]) <= set(tag_ids("categories"))
    assert set(h["checklist_yes"]) | set(h["checklist_not_assessed"]) <= set(tag_ids("checklist"))
    assert set(h["life_events"]) <= set(tag_ids("finding_types"))
    assert set(h["data_quality"]) <= set(tag_ids("data_quality"))
    for m in t["members"]:
        assert set(m["topics"]) <= set(tag_ids("topics"))
        assert set(m["fields_present"]) <= set(tag_ids("fields"))
        assert set(m["checks"]) == set(tag_ids("check_status"))
    for d in t["documents"]:
        assert d["doc_type"] in list(doc_types())
        assert set(d["topics"]) <= set(tag_ids("topics")) and set(d["model_tags"]) <= set(document_tags())
        assert d["attribution_status"] in tag_ids("attribution_status")
        assert all(x["role"] in tag_ids("member_roles") and x["method"] in tag_ids("attribution_methods") for x in d["members"])


def assert_consistent(o):
    t = o["tags"]
    assert t["household"]["topics"] == [x for x in tag_ids("topics") if any(x in d["topics"] for d in t["documents"])]
    assert t["household"]["checklist_yes"] == [i["id"] for i in o["checklist"] if i["answer"] == "yes"]
    assert t["household"]["checklist_not_assessed"] == [i["id"] for i in o["checklist"] if i["answer"] == "not_assessed"]
    for m in t["members"]:
        for name in m["documents"]:
            doc = next(d for d in t["documents"] if d["name"] == name)
            assert m["person_id"] in [x["person_id"] for x in doc["members"]]
        expected = [d["name"] for d in t["documents"] if m["person_id"] in [x["person_id"] for x in d["members"]]]
        assert m["documents"] == expected
        assert m["findings"] == [f["id"] for f in o["findings"] if f["person_id"] == m["person_id"]]
        card = next(c for c in o["members"] if c["person_id"] == m["person_id"])
        counts = {}
        for n in card["numbers"]:
            counts[n["check"]] = counts.get(n["check"], 0) + 1
        assert {k: v for k, v in m["checks"].items() if v} == counts
    assert o["data_quality"]["unassigned_documents"] == [d["name"] for d in t["documents"] if d["attribution_status"] != "assigned"]
    assert o["data_quality"]["documents_needing_review"] == [
        {"name": d["name"], "review_reasons": d["review_reasons"]} for d in t["documents"] if d["status"] == "needs_review"]


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_tags_block_model_off(backend_none, household_id):
    o = build(household_id)
    Overview.model_validate(o)
    assert_tag_ids(o)
    assert_consistent(o)


def test_hh004_conflict_and_hh003_missing_document(backend_none):
    assert "conflict" in build("HH004")["tags"]["household"]["data_quality"]
    assert "missing_document" in build("HH003")["tags"]["household"]["data_quality"]


def test_hh006_tags(backend_none):
    h = build("HH006")["tags"]["household"]
    assert {"cash_management", "retirement", "tax"} <= set(h["categories_flagged"])
    assert h["checklist_yes"] == ["retirement_can_improve", "tax_savings_possible", "excess_cash", "major_changes"]
    assert h["life_events"] == ["life_event_new_dependent"]


@pytest.mark.model
@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_tags_block_model_on(loaded_engine, household_id):
    o = build(household_id)
    assert_tag_ids(o)
    assert_consistent(o)


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_samples_carry_tags(household_id):
    o = json.loads((SAMPLES / f"overview_{household_id}.json").read_text(encoding="utf-8"))
    assert o["tags"] is not None
    assert_tag_ids(o)
    assert_consistent(o)
