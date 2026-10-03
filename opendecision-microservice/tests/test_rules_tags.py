"""CHECKPOINT 4+: rules aligned with the tag file (amendment §4)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tests.support.fixtures import FIXTURE_IDS, fixture_household_documents, fixture_household_raw
from rapid_analysis.normalization import normalize_household
from rapid_analysis.overview import overview_build
from rapid_analysis.rules import LIMIT_401K, rules_evaluate
from rapid_analysis.taxonomy import finding_text, tag_by_id, tags

RULES_SOURCE = (Path(__file__).resolve().parents[1] / "rapid_analysis" / "rules.py").read_text(encoding="utf-8")


def evaluate(raw, checks=None):
    return rules_evaluate(normalize_household(raw).household, checks)


def all_results():
    results = [evaluate(fixture_household_raw(h)) for h in FIXTURE_IDS]
    raw = fixture_household_raw("HH010")
    raw["members"][0]["distribution_code"]["value"] = "G"
    results.append(evaluate(raw))
    results.append(evaluate(fixture_household_raw("HH007"), {"HH007-P1.wages": "mismatch"}))
    return results


def test_checklist_equals_tag_file():
    expected = [(c["id"], c["question"]) for c in tags()["checklist"]]
    for result in all_results():
        assert [(i.id, i.question) for i in result.checklist] == expected
        assert {i.answer for i in result.checklist} <= set(tags()["checklist_answers"])
        for item, spec in zip(result.checklist, tags()["checklist"]):
            if not spec["assessed"]:
                assert item.answer == "not_assessed"


def test_findings_use_tag_file_types_headlines_and_action_labels():
    specs = tag_by_id("finding_types")
    seen = set()
    for result in all_results():
        for f in result.findings:
            assert f.type in specs
            assert f.category == specs[f.type]["category"]
            member = f.member.split()[0] if f.member else None
            headline, action = finding_text(f.type, member, None)
            assert f.action_label == action and f.action_label
            assert f.headline and "{" not in f.headline
            if "{field}" not in specs[f.type]["headline"]:
                assert f.headline == headline
            seen.add(f.type)
    assert seen == set(specs)


def test_field_headline_is_filled():
    result = evaluate(fixture_household_raw("HH004"))
    assert result.findings[0].headline == "Documents disagree on wages"
    assert result.findings[0].action_label == "Confirm value"


def test_labels_are_not_hardcoded_in_rules():
    for spec in tags()["finding_types"]:
        assert spec["action_label"] not in RULES_SOURCE
    for spec in tags()["checklist"]:
        assert spec["question"] not in RULES_SOURCE


def test_2026_limit_cited_and_a_2026_household_with_wages_assesses():
    assert LIMIT_401K[2026] == 24500.0
    assert "IRS Notice 2025-67" in RULES_SOURCE and "irs.gov" in RULES_SOURCE
    raw = fixture_household_raw("HH008")
    raw["tax_year"] = 2026
    item = next(i for i in evaluate(raw).checklist if i.id == "retirement_can_improve")
    assert (item.answer, item.dollar_impact, item.metrics["limit"]) == ("yes", 15700, 24500)


def test_metrics_and_rules_on_every_assessed_answer_and_finding():
    for result in all_results():
        for f in result.findings:
            assert f.metrics and f.rule, f.type
        for item in result.checklist:
            assert item.rule


@pytest.mark.model
@pytest.mark.parametrize("household_id", ["HH002", "HH005", "HH007", "HH008"])
def test_demo_households_every_documented_value_checked(loaded_engine, household_id):
    available = set(fixture_household_documents(household_id))
    o = overview_build(fixture_household_raw(household_id), fixture_household_documents(household_id)).overview
    values = [o["summary"][k] for k in ("agi", "cash", "mortgage_interest")] + [n for m in o["members"] for n in m["numbers"]]
    documented = [v for v in values if v["source_document"] in available]
    assert documented and all(v["check"] != "not_checked" for v in documented)
    assert o["summary"]["dependents_check"] != "not_checked"
