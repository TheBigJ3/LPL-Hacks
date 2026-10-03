from __future__ import annotations

import copy

import pytest

from rapid_analysis.fixtures import FIXTURE_IDS, fixture_household_raw
from rapid_analysis.normalization import normalize_household
from rapid_analysis.rules import CHECKLIST_QUESTIONS, rules_evaluate

Y, N, ND, NA = "yes", "no", "needs_data", "not_assessed"

# §6 table: (retire, tax, cash, docs, changes) with dollar impacts where the table gives one.
EXPECTED = {
    "HH001": [(Y, 34300), (N, None), (N, None), (N, None), (NA, None)],
    "HH002": [(N, None), (N, None), (N, None), (N, None), (NA, None)],
    "HH003": [(N, None), (N, None), (N, None), (Y, None), (NA, None)],
    "HH004": [(ND, None), (N, None), (N, None), (Y, None), (NA, None)],
    "HH005": [(N, None), (N, None), (N, None), (N, None), (Y, None)],
    "HH006": [(Y, 21500), (Y, None), (Y, 134000), (N, None), (Y, None)],
    "HH007": [(N, None), (N, None), (N, None), (N, None), (NA, None)],
    "HH008": [(Y, 14700), (N, None), (N, None), (N, None), (NA, None)],
    "HH009": [(NA, None), (Y, 1200), (ND, None), (N, None), (NA, None)],
    "HH010": [(NA, None), (N, None), (ND, None), (N, None), (NA, None)],
}
ORDER = ["retirement_can_improve", "tax_savings_possible", "excess_cash", "needs_documents", "major_changes"]
PLACEHOLDERS = ["insurance_review", "estate_review", "education_review"]


def checklist(raw):
    result = normalize_household(raw)
    assert result.errors == []
    return rules_evaluate(result.household).checklist


def comparable(items):
    return [(i.id, i.answer, i.reason, i.dollar_impact, i.finding_ids) for i in items]


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_section6_table_exactly(household_id):
    items = {i.id: i for i in checklist(fixture_household_raw(household_id))}
    got = [(items[k].answer, items[k].dollar_impact) for k in ORDER]
    assert got == EXPECTED[household_id]


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_checklist_shape(household_id):
    items = checklist(fixture_household_raw(household_id))
    assert [i.id for i in items] == ORDER + PLACEHOLDERS
    for item in items:
        assert item.question == CHECKLIST_QUESTIONS[item.id]
        assert item.answer in ("yes", "no", "needs_data", "not_assessed")
        assert item.reason
        assert item.dollar_impact is None or isinstance(item.dollar_impact, (int, float))
        assert isinstance(item.finding_ids, list)


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_placeholders_never_assessed(household_id):
    items = {i.id: i for i in checklist(fixture_household_raw(household_id))}
    for item_id in PLACEHOLDERS:
        assert items[item_id].answer == "not_assessed"
        assert items[item_id].dollar_impact is None and items[item_id].finding_ids == []


def test_yes_answers_with_findings_reference_them():
    items = {i.id: i for i in checklist(fixture_household_raw("HH006"))}
    assert items["retirement_can_improve"].finding_ids
    assert items["retirement_can_improve"].reason == "Taylor uses 9% of the 401(k) limit"
    assert items["excess_cash"].finding_ids


def test_hh001_reason_names_both_members():
    items = {i.id: i for i in checklist(fixture_household_raw("HH001"))}
    assert items["retirement_can_improve"].reason == "John uses 35% and Sarah uses 19% of the 401(k) limit"


def test_irrelevant_wording_changes_give_identical_checklist():
    base = fixture_household_raw("HH001")
    reworded = copy.deepcopy(base)
    reworded["filing_status"] = "MFJ"
    reworded["members"][0]["employee_401k_contribution"]["value"] = "8200.00"
    reworded["members"][0]["wages"]["value"] = 120000
    reworded["members"][1]["wages"]["value"] = "$65,000"
    reworded["cash_balance"]["value"] = 32216.56
    reworded["adjusted_gross_income"] = {**reworded["adjusted_gross_income"], "value": "185,000.00", "textract_confidence": 98.2}
    assert comparable(checklist(reworded)) == comparable(checklist(base))

    married = fixture_household_raw("HH007")
    married_alias = copy.deepcopy(married)
    married_alias["filing_status"] = "married_filing_jointly"
    married_alias["members"][0]["employee_401k_contribution"]["value"] = "$23,500.00"
    assert comparable(checklist(married_alias)) == comparable(checklist(married))
