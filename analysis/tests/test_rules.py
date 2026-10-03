from __future__ import annotations

import pytest

from rapid_analysis import RULESET_VERSION
from rapid_analysis.fixtures import FIXTURE_IDS, fixture_household_raw
from rapid_analysis.normalization import normalize_household
from rapid_analysis.rules import LIMIT_401K, rules_evaluate


def evaluate(raw, checks=None):
    result = normalize_household(raw)
    assert result.errors == []
    return rules_evaluate(result.household, checks)


def fixture(household_id, checks=None):
    return evaluate(fixture_household_raw(household_id), checks)


def by_type(result):
    return {f.type: f for f in result.findings}


def test_ruleset_version_and_limit_table():
    assert RULESET_VERSION == "2025.2"
    assert LIMIT_401K == {2025: 23500.0, 2026: 24500.0}
    assert fixture("HH001").ruleset_version == "2025.2"


@pytest.mark.parametrize("household_id,status,priority", [
    ("HH001", "findings", "medium"),
    ("HH002", "no_findings", None),
    ("HH003", "findings", "medium"),
    ("HH004", "findings", "high"),
    ("HH005", "findings", "high"),
    ("HH006", "findings", "high"),
    ("HH007", "no_findings", None),
    ("HH008", "findings", "medium"),
    ("HH009", "findings", "high"),
    ("HH010", "no_findings", "low"),
])
def test_status_and_priority(household_id, status, priority):
    result = fixture(household_id)
    assert (result.status, result.priority) == (status, priority)


def test_hh004_no_retirement_finding_only_needs_data():
    result = fixture("HH004")
    assert not [f for f in result.findings if f.category == "retirement"]
    item = next(i for i in result.checklist if i.id == "retirement_can_improve")
    assert item.answer == "needs_data" and item.finding_ids == []
    assert "Jordan's wages disagree" in item.reason
    conflict = by_type(result)["source_data_conflict"]
    assert conflict.priority == "high"
    assert "$120,000 on jordan_w2_2025.pdf" in conflict.explanation
    assert "$165,000 on hh004_1040_2025.pdf" in conflict.explanation


def test_hh005_life_events_each_raised_to_high():
    result = fixture("HH005")
    life = [f for f in result.findings if f.category == "life_event"]
    assert [f.type for f in life] == ["life_event_new_dependent", "life_event_new_employer", "life_event_new_mortgage", "life_event_large_income_increase"]
    assert all(f.priority == "high" for f in life)
    assert [c.type for c in result.changes] == ["life_event_new_dependent", "life_event_new_employer", "life_event_new_mortgage", "life_event_large_income_increase"]
    assert result.changes[1].text == "Casey changed employer from Acme Sample Corp to Bluefin Sample LLC"
    assert result.changes[3].text == "AGI rose 94% from $88,000 to $171,000"


def test_hh006_single_life_event_stays_medium():
    result = fixture("HH006")
    life = [f for f in result.findings if f.category == "life_event"]
    assert [(f.type, f.priority) for f in life] == [("life_event_new_dependent", "medium")]
    assert result.changes[0].text == "Dependents increased from 0 to 1"


def test_hh006_findings():
    result = fixture("HH006")
    found = by_type(result)
    retirement = found["retirement_contribution_review"]
    assert retirement.priority == "high"
    assert retirement.headline == "Taylor could save more for retirement"
    assert retirement.explanation == ("Taylor contributed $2,000 to a 401(k), 1.8% of $110,000 wages "
                                      "and 9% of the $23,500 limit.")
    assert retirement.dollar_impact == 21500
    assert retirement.member == "Taylor Mock"
    assert found["self_employment_tax_review"].priority == "high"
    assert found["excess_cash_review"].priority == "high"
    assert found["excess_cash_review"].dollar_impact == 134000


def test_retirement_priority_boundaries():
    raw = fixture_household_raw("HH008")
    raw["members"][0]["employee_401k_contribution"] = 3525  # exactly 15% of 23,500
    assert by_type(evaluate(raw))["retirement_contribution_review"].priority == "medium"
    raw["members"][0]["employee_401k_contribution"] = 3524.99
    assert by_type(evaluate(raw))["retirement_contribution_review"].priority == "high"
    raw["members"][0]["employee_401k_contribution"] = 11750  # exactly 50%: not below half
    assert "retirement_contribution_review" not in by_type(evaluate(raw))


def test_self_employment_priority_boundary():
    raw = fixture_household_raw("HH006")
    raw["members"][1]["self_employment_income"] = 39999.99
    assert by_type(evaluate(raw))["self_employment_tax_review"].priority == "medium"
    raw["members"][1]["self_employment_income"] = 40000
    assert by_type(evaluate(raw))["self_employment_tax_review"].priority == "high"


def test_excess_cash_priority_boundary():
    raw = fixture_household_raw("HH006")
    raw["cash_balance"] = 152000  # exactly 12 months: not more than 12
    assert by_type(evaluate(raw))["excess_cash_review"].priority == "medium"


def test_1099r_code_1_high_with_impact():
    result = fixture("HH009")
    finding = by_type(result)["retirement_distribution_review"]
    assert finding.priority == "high"
    assert finding.dollar_impact == 1200
    assert finding.member == "Pat Rowe"


def test_1099r_code_7_exactly_10_percent_is_not_under_withheld():
    result = fixture("HH010")
    item = next(i for i in result.checklist if i.id == "tax_savings_possible")
    assert item.answer == "no"
    assert by_type(result)["retirement_distribution_review"].priority == "low"


def test_1099r_code_7_under_withheld_is_medium():
    raw = fixture_household_raw("HH010")
    raw["members"][0]["federal_tax_withheld"]["value"] = "$ 1,874.99"
    result = evaluate(raw)
    assert by_type(result)["retirement_distribution_review"].priority == "medium"
    assert next(i for i in result.checklist if i.id == "tax_savings_possible").answer == "yes"


def test_1099r_code_g_is_informational():
    raw = fixture_household_raw("HH010")
    raw["members"][0]["distribution_code"]["value"] = "G"
    result = evaluate(raw)
    assert by_type(result)["retirement_distribution_review"].priority == "informational"
    assert next(i for i in result.checklist if i.id == "tax_savings_possible").answer == "no"
    assert result.status == "no_findings" and result.priority == "informational"


def test_unknown_tax_year_limit_is_needs_data():
    raw = fixture_household_raw("HH008")
    raw["tax_year"] = 2027
    item = next(i for i in evaluate(raw).checklist if i.id == "retirement_can_improve")
    assert item.answer == "needs_data"
    assert "2027" in item.reason


def test_2026_uses_the_24500_limit():
    raw = fixture_household_raw("HH008")
    raw["tax_year"] = 2026
    result = evaluate(raw)
    item = next(i for i in result.checklist if i.id == "retirement_can_improve")
    assert (item.answer, item.dollar_impact) == ("yes", 15700)
    assert "of the $24,500 limit" in by_type(result)["retirement_contribution_review"].explanation


def test_hh010_2026_assesses_normally():
    items = {i.id: i for i in fixture("HH010").checklist}
    assert items["retirement_can_improve"].answer == "not_assessed"
    assert items["retirement_can_improve"].reason == "No household member has wages"
    assert items["tax_savings_possible"].answer == "no"


def test_missing_401k_is_needs_data():
    raw = fixture_household_raw("HH008")
    raw["members"][0]["employee_401k_contribution"] = None
    assert next(i for i in evaluate(raw).checklist if i.id == "retirement_can_improve").answer == "needs_data"


def test_value_mismatch_needs_documents():
    clean = fixture("HH007")
    assert next(i for i in clean.checklist if i.id == "needs_documents").answer == "no"
    result = fixture("HH007", {"HH007-P1.wages": "mismatch"})
    item = next(i for i in result.checklist if i.id == "needs_documents")
    assert item.answer == "yes"
    assert by_type(result)["source_data_conflict"].value_keys == ["HH007-P1.wages"]
    unconfirmed = fixture("HH007", {"HH007-P1.wages": "unconfirmed"})
    assert next(i for i in unconfirmed.checklist if i.id == "needs_documents").answer == "no"


def test_hh003_hsa_proof_missing():
    finding = by_type(fixture("HH003"))["hsa_eligibility_unverified"]
    assert finding.priority == "medium" and finding.category == "hsa"


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_finding_ids_are_sequential_and_referenced(household_id):
    result = fixture(household_id)
    ids = [f.id for f in result.findings]
    assert ids == [f"F{i}" for i in range(1, len(ids) + 1)]
    referenced = {fid for item in result.checklist for fid in item.finding_ids}
    assert referenced <= set(ids)
    for f in result.findings:
        assert f.priority in ("informational", "low", "medium", "high")
        assert f.headline and f.explanation and f.action_label


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_rules_are_deterministic(household_id):
    assert fixture(household_id) == fixture(household_id)
