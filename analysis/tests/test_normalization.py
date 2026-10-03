from __future__ import annotations

import pytest

from rapid_analysis.fixtures import FIXTURE_IDS, fixture_household_raw
from rapid_analysis.normalization import (
    ValueProblem,
    merge_candidates,
    normalize_field,
    normalize_household,
    parse_date,
    parse_filing_status,
    parse_money,
    Candidate,
)


@pytest.mark.parametrize("raw", ["$8,200", "8200", "8,200.00", 8200.0, 8200, "$ 8,200.00", " 8200 "])
def test_money_forms_normalize_identically(raw):
    assert parse_money(raw) == 8200.0


def test_parenthesized_money_is_negative():
    assert parse_money("(1,250.00)") == -1250.0
    assert parse_money("($1,250.00)") == -1250.0


@pytest.mark.parametrize("raw", ["a lot", "8,2OO", True, False, "82,00", "$", "1e5", float("nan"), [8200]])
def test_bad_money_is_an_error_not_a_value(raw):
    with pytest.raises(ValueProblem) as err:
        parse_money(raw)
    assert err.value.code in {"invalid_money", "value_out_of_range"}


def test_money_above_1e9_is_out_of_range():
    with pytest.raises(ValueProblem) as err:
        parse_money("2,000,000,000")
    assert err.value.code == "value_out_of_range"


@pytest.mark.parametrize("raw", ["01/31/2026", "Jan 31, 2026", "2026-01-31", "January 31, 2026"])
def test_dates_normalize_to_iso(raw):
    assert parse_date(raw) == "2026-01-31"


def test_bad_date_is_an_error():
    with pytest.raises(ValueProblem):
        parse_date("31/31/2026")


@pytest.mark.parametrize("raw", ["MFJ", "Married Filing Jointly", "married_filing_jointly", "married filing jointly"])
def test_filing_status_aliases(raw):
    assert parse_filing_status(raw) == "married_filing_jointly"


@pytest.mark.parametrize("raw,expected", [("Single", "single"), ("HOH", "head_of_household"),
                                          ("MFS", "married_filing_separately"), ("QSS", "qualifying_surviving_spouse")])
def test_other_filing_statuses(raw, expected):
    assert parse_filing_status(raw) == expected


@pytest.mark.parametrize("raw", ["married-ish", "", None, 3])
def test_unknown_filing_status_is_error(raw):
    with pytest.raises(ValueProblem) as err:
        parse_filing_status(raw)
    assert err.value.code == "invalid_filing_status"


def test_confidence_rescaled_from_textract_scale():
    errors = []
    fv = normalize_field({"value": "8200", "source_document": "a.pdf", "textract_confidence": 97.4}, "money", "x", errors)
    assert errors == []
    assert fv.textract_confidence == pytest.approx(0.974)


def test_missing_is_null_never_fabricated():
    household = normalize_household(fixture_household_raw("HH001")).household
    assert household.get("mortgage_interest") is None
    john = household.members[0]
    assert john.get("hsa_contribution") is None
    assert john.get("self_employment_income") is None


def test_blank_placeholder_is_missing():
    errors = []
    assert normalize_field({"value": "$", "source_document": "a.pdf"}, "money", "x", errors) is None
    assert errors == []


def test_members_stay_distinct_and_provenance_survives():
    household = normalize_household(fixture_household_raw("HH001")).household
    john, sarah = household.members
    assert (john.person_id, john.name) == ("HH001-P1", "John Sample")
    assert (sarah.person_id, sarah.name) == ("HH001-P2", "Sarah Sample")
    k401 = john.get("employee_401k_contribution")
    assert k401.value == 8200.0
    assert k401.source_document == "john_w2_2025.pdf"
    assert k401.page == 1
    assert k401.textract_confidence == pytest.approx(0.974)
    assert k401.verified is False
    assert sarah.get("employee_401k_contribution").source_document == "sarah_w2_2025.pdf"
    assert household.get("cash_balance").value == pytest.approx(32216.56)


def test_hh004_wage_conflict_keeps_all_candidates():
    household = normalize_household(fixture_household_raw("HH004")).household
    wages = household.members[0].get("wages")
    assert wages.conflict is True
    assert wages.value is None
    assert [(c.value, c.source_document) for c in wages.candidates] == [
        (120000.0, "jordan_w2_2025.pdf"),
        (165000.0, "hh004_1040_2025.pdf"),
    ]


def test_agreeing_sources_merge_without_conflict():
    errors = []
    fv = normalize_field([
        {"value": "$120,000.00", "source_document": "w2.pdf", "page": 1, "textract_confidence": 0.98},
        {"value": 120000, "source_document": "1040.pdf", "page": 1, "textract_confidence": 0.95},
    ], "money", "wages", errors)
    assert errors == []
    assert fv.conflict is False
    assert fv.value == 120000.0
    assert fv.source_document == "w2.pdf"
    assert fv.textract_confidence == 0.95
    assert fv.sources == ["w2.pdf", "1040.pdf"]


def test_merge_of_nothing_is_none():
    assert merge_candidates([]) is None
    assert merge_candidates([Candidate(value=1.0)]).conflict is False


def test_all_errors_are_collected():
    raw = {
        "household_id": "HHX",
        "filing_status": "sort of married",
        "adjusted_gross_income": "a lot",
        "dependents": -1,
        "cash_balance": "8,2OO",
        "members": [
            {"person_id": "P1", "name": "Ann Test", "wages": True, "employee_401k_contribution": -50,
             "distribution_date": "someday"},
            {"person_id": "P1", "name": "Ann Duplicate"},
        ],
        "documents": [{"type": "W-2"}, {"name": "a.pdf"}, {"name": "a.pdf"}],
    }
    result = normalize_household(raw)
    codes = sorted(e.code for e in result.errors)
    assert codes == sorted([
        "missing_tax_year", "invalid_filing_status", "invalid_money", "negative_value", "invalid_money",
        "invalid_money", "negative_value", "invalid_date", "duplicate_member", "document_missing_name",
        "duplicate_document",
    ])
    paths = {e.path for e in result.errors}
    assert "members[0].wages" in paths and "members[0].employee_401k_contribution" in paths
    assert result.household is not None
    assert len(result.household.members) == 1
    assert result.household.value("adjusted_gross_income") is None


def test_all_null_profile_is_an_error():
    raw = {"household_id": "HHN", "tax_year": 2025, "filing_status": None, "adjusted_gross_income": None,
           "dependents": None, "cash_balance": None, "members": [{"person_id": "P1", "name": "Nul Test", "wages": None}]}
    assert [e.code for e in normalize_household(raw).errors] == ["empty_profile"]


def test_non_object_and_missing_id():
    assert normalize_household([1, 2]).errors[0].code == "invalid_household"
    result = normalize_household({"tax_year": 2025})
    assert result.household is None and result.errors[0].code == "missing_household_id"


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_every_fixture_normalizes_cleanly(household_id):
    raw = fixture_household_raw(household_id)
    assert raw["_synthetic"].startswith("SYNTHETIC TEST DATA")
    result = normalize_household(raw)
    assert result.errors == []
    assert result.household.household_id == household_id


def test_prior_year_normalizes():
    household = normalize_household(fixture_household_raw("HH005")).household
    assert household.filing_status == "married_filing_jointly"
    assert household.prior_year.tax_year == 2024
    assert household.prior_year.members[0].value("employer") == "Acme Sample Corp"
    assert household.prior_year.get("mortgage_interest") is None


def test_textract_shaped_1099r_values():
    pat = normalize_household(fixture_household_raw("HH009")).household.members[0]
    assert pat.value("retirement_distribution") == 12000.0
    assert pat.value("distribution_code") == "1"
    assert pat.value("distribution_from_ira") is False
    assert pat.value("distribution_date") == "2025-03-14"



# ---------------------------------------------------------------- §2 pass-through (CHECKPOINT P1+)

from rapid_analysis.normalization import household_to_raw  # noqa: E402


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_idempotent(household_id):
    once = normalize_household(fixture_household_raw(household_id))
    twice = normalize_household(household_to_raw(once.household))
    assert twice.errors == []
    assert twice.household == once.household
    thrice = normalize_household(household_to_raw(twice.household))
    assert thrice.household == twice.household


def test_already_normalized_field_value_passes_through():
    normalized = {"value": 8200.0, "source_document": "john_w2_2025.pdf", "page": 1,
                  "textract_confidence": 0.974, "verified": True, "conflict": False, "candidates": []}
    errors = []
    fv = normalize_field(normalized, "money", "x", errors)
    assert errors == []
    assert fv.model_dump() == normalized


def test_already_normalized_conflict_is_preserved():
    normalized = {"value": None, "conflict": True, "candidates": [
        {"value": 120000.0, "source_document": "jordan_w2_2025.pdf", "page": 1, "textract_confidence": 0.981, "verified": False},
        {"value": 165000.0, "source_document": "hh004_1040_2025.pdf", "page": 1, "textract_confidence": 0.976, "verified": False},
    ]}
    errors = []
    fv = normalize_field(normalized, "money", "wages", errors)
    assert errors == []
    assert fv.conflict is True and fv.value is None
    assert [(c.value, c.source_document, c.page, c.textract_confidence) for c in fv.candidates] == [
        (120000.0, "jordan_w2_2025.pdf", 1, 0.981), (165000.0, "hh004_1040_2025.pdf", 1, 0.976)]


@pytest.mark.parametrize("raw,expected", [(0.974, 0.974), (1.0, 1.0), (0.5, 0.5), (97.4, 0.974), (100, 1.0), (50, 0.5)])
def test_confidence_rescaled_once(raw, expected):
    errors = []
    fv = normalize_field({"value": 1, "textract_confidence": raw}, "money", "x", errors)
    assert errors == [] and fv.textract_confidence == pytest.approx(expected)
    again = normalize_field(fv.model_dump(), "money", "x", errors)
    assert again.textract_confidence == pytest.approx(expected)


def test_unknown_extra_field_is_ignored_with_warning(caplog):
    raw = fixture_household_raw("HH008")
    raw["favorite_color"] = "teal"
    raw["members"][0]["shoe_size"] = 10
    raw["members"][0]["wages"]["ocr_engine"] = "x"
    raw["documents"][0]["pages"] = 2
    with caplog.at_level("WARNING", logger="rapid_analysis.normalization"):
        result = normalize_household(raw)
    assert result.errors == []
    assert result.household == normalize_household(fixture_household_raw("HH008")).household
    warned = " ".join(r.getMessage() for r in caplog.records)
    for key in ("favorite_color", "shoe_size", "ocr_engine", "pages"):
        assert key in warned
    assert "_synthetic" not in warned
