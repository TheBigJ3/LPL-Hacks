from __future__ import annotations

import json

import pytest

from rapid_analysis import evidence as evidence_module
from rapid_analysis.evidence import (
    CheckRequest,
    EvidenceChecker,
    check_value,
    checks_combine,
    claim_build,
    memo_clear,
    money_format,
)
from rapid_analysis.fixtures import fixture_household_raw, fixture_textract
from rapid_analysis.normalization import Candidate, FieldValue
from rapid_analysis.textract import evidence_from_textract


def doc(name):
    return evidence_from_textract(fixture_textract(name), name)


def text(name):
    return doc(name).text


# (field, value, person, document, expected). Value types are what normalization produces.
TRUE_VALUES = [
    ("employee_401k_contribution", 8200.0, "John Sample", "john_w2_2025.pdf", "verified"),
    ("wages", 120000.0, "John Sample", "john_w2_2025.pdf", "verified"),
    ("employee_401k_contribution", 4500.0, "Sarah Sample", "sarah_w2_2025.pdf", "verified"),
    ("wages", 65000.0, "Sarah Sample", "sarah_w2_2025.pdf", "verified"),
    ("employer", "Fabrikam Sample Inc", "Sarah Sample", "sarah_w2_2025.pdf", "verified"),
    ("retirement_distribution", 12000.0, "Pat Rowe", "pat_1099r_2025.pdf", "verified"),
    ("retirement_distribution_taxable", 12000.0, "Pat Rowe", "pat_1099r_2025.pdf", "verified"),
    ("federal_tax_withheld", 600.0, "Pat Rowe", "pat_1099r_2025.pdf", "verified"),
    ("state_tax_withheld", 240.0, "Pat Rowe", "pat_1099r_2025.pdf", "verified"),
    ("retirement_distribution", 18750.0, "Alex Example", "alex_example_1099r_2026.pdf", "verified"),
    ("retirement_distribution_taxable", 18750.0, "Alex Example", "alex_example_1099r_2026.pdf", "verified"),
    ("federal_tax_withheld", 1875.0, "Alex Example", "alex_example_1099r_2026.pdf", "verified"),
    ("state_tax_withheld", 375.0, "Alex Example", "alex_example_1099r_2026.pdf", "verified"),
    ("distribution_code", "7", "Alex Example", "alex_example_1099r_2026.pdf", "verified"),
    ("distribution_from_ira", False, "Alex Example", "alex_example_1099r_2026.pdf", "verified"),
    ("distribution_date", "2026-06-30", "Alex Example", "alex_example_1099r_2026.pdf", "verified"),
    ("adjusted_gross_income", 185000.0, "John Sample and Sarah Sample", "hh001_1040_2025.pdf", "verified"),
    ("dependents", 2, "John Sample and Sarah Sample", "hh001_1040_2025.pdf", "verified"),
    ("cash_balance", 32216.56, "John Sample and Sarah Sample", "hh001_bank_statement_2025.pdf", "verified"),
    ("wages", 120000.0, "Jordan Park", "jordan_w2_2025.pdf", "verified"),
    ("wages", 165000.0, "Jordan Park", "hh004_1040_2025.pdf", "verified"),
    ("hsa_contribution", 4300.0, "Morgan Lee", "morgan_w2_2025.pdf", "verified"),
    ("hsa_eligible_health_plan", True, "Alex Rivera", "alex_hdhp_coverage_2025.pdf", "verified"),
    ("mortgage_interest", 14200.0, "Casey Brooks", "hh005_1098_2025.pdf", "verified"),
    ("employee_401k_contribution", 8800.0, "Quinn Harper", "quinn_w2_2025.pdf", "verified"),
    ("adjusted_gross_income", 139000.0, "Drew Kim and Avery Kim", "hh007_1040_2025.pdf", "verified"),
]
NEAR_MISSES = [
    ("employee_401k_contribution", 8300.0, "John Sample", "john_w2_2025.pdf", "mismatch"),
    ("employee_401k_contribution", 82000.0, "John Sample", "john_w2_2025.pdf", "mismatch"),
    ("retirement_distribution", 19750.0, "Alex Example", "alex_example_1099r_2026.pdf", "mismatch"),
    ("federal_tax_withheld", 375.0, "Alex Example", "alex_example_1099r_2026.pdf", "mismatch"),
    ("federal_tax_withheld", 240.0, "Pat Rowe", "pat_1099r_2025.pdf", "mismatch"),
    ("distribution_code", "1", "Alex Example", "alex_example_1099r_2026.pdf", "mismatch"),
    ("distribution_from_ira", True, "Alex Example", "alex_example_1099r_2026.pdf", "mismatch"),
    ("distribution_date", "2026-07-30", "Alex Example", "alex_example_1099r_2026.pdf", "mismatch"),
    ("adjusted_gross_income", 158000.0, "John Sample and Sarah Sample", "hh001_1040_2025.pdf", "mismatch"),
    ("dependents", 3, "John Sample and Sarah Sample", "hh001_1040_2025.pdf", "mismatch"),
    ("cash_balance", 32261.56, "John Sample and Sarah Sample", "hh001_bank_statement_2025.pdf", "mismatch"),
    ("wages", 120000.0, "Jordan Park", "hh004_1040_2025.pdf", "mismatch"),
    ("mortgage_interest", 14800.0, "Casey Brooks", "hh005_1098_2025.pdf", "mismatch"),
    ("hsa_eligible_health_plan", False, "Alex Rivera", "alex_hdhp_coverage_2025.pdf", "mismatch"),
]
# Near misses the model does not flag as mismatch but must still never confirm (fails safe to unconfirmed).
NEAR_MISS_FAIL_SAFE = [
    ("employee_401k_contribution", 8080.0, "Quinn Harper", "quinn_w2_2025.pdf", "never_verified"),
]
WRONG_PERSON = [
    ("employee_401k_contribution", 8200.0, "Sarah Sample", "sarah_w2_2025.pdf", "never_verified"),
    ("employee_401k_contribution", 8200.0, "Sarah Sample", "john_w2_2025.pdf", "never_verified"),
    ("employee_401k_contribution", 4500.0, "John Sample", "sarah_w2_2025.pdf", "never_verified"),
    ("retirement_distribution", 12000.0, "Alex Example", "pat_1099r_2025.pdf", "never_verified"),
    ("wages", 82000.0, "Avery Kim", "drew_w2_2025.pdf", "never_verified"),
    ("hsa_eligible_health_plan", True, "Morgan Lee", "alex_hdhp_coverage_2025.pdf", "never_verified"),
]
ABSENT = [
    ("hsa_eligible_health_plan", True, "Morgan Lee", "morgan_w2_2025.pdf", "unconfirmed"),
]
BATTERY = TRUE_VALUES + NEAR_MISSES + NEAR_MISS_FAIL_SAFE + WRONG_PERSON + ABSENT


def _ok(result, expected):
    return result != "verified" if expected == "never_verified" else result == expected


@pytest.fixture(autouse=True)
def fresh_memo():
    memo_clear()
    yield
    memo_clear()


# ---------------------------------------------------------------- no model


def test_money_format_has_no_trailing_zero_cents():
    assert money_format(8200.0) == "$8,200"
    assert money_format(32216.56) == "$32,216.56"
    assert money_format(-1250.0) == "-$1,250"
    assert money_format(0.5) == "$0.50"


def test_claim_phrasing():
    assert claim_build("employee_401k_contribution", 8200.0, "John Sample") == (
        "John Sample's 401(k) elective deferrals were $8,200.",
        "John Sample's 401(k) elective deferrals were not $8,200.",
    )
    assert claim_build("distribution_date", "2026-06-30", "Alex Example")[0] == "Alex Example's date of payment was 06/30/2026."
    assert claim_build("dependents", 2, "A")[0] == "A's number of dependents claimed was 2."
    assert claim_build("distribution_from_ira", False, "A")[0] == "A's distribution was not from an IRA/SEP/SIMPLE."
    assert claim_build("wages", None, "A") is None


def test_combine():
    assert checks_combine([]) == "not_checked"
    assert checks_combine(["verified", "mismatch"]) == "conflicted"
    assert checks_combine(["verified", "unconfirmed"]) == "verified"
    assert checks_combine(["mismatch", "unconfirmed"]) == "mismatch"
    assert checks_combine(["unconfirmed"]) == "unconfirmed"


def test_backend_none_everything_not_checked(backend_none):
    assert check_value("wages", 120000.0, "John Sample", text("john_w2_2025.pdf")) == "not_checked"
    documents = {n: doc(n) for n in ["jordan_w2_2025.pdf", "hh004_1040_2025.pdf"]}
    checker = EvidenceChecker(documents)
    fv = FieldValue(value=120000.0, source_document="jordan_w2_2025.pdf", page=1)
    result = checker.check_many([CheckRequest(key="w", field_name="wages", value=fv, subject_name="Jordan Park")])
    assert result["w"].check == "not_checked"
    assert result["w"].documents == []
    assert checker.validator_unavailable is False


def test_engine_raising_is_not_checked_and_flagged(isolated_engine):
    class Broken:
        def relations(self, **kwargs):
            raise RuntimeError("CUDA error: device-side assert")

    isolated_engine.setattr("rapid_analysis.engine._factory", Broken)
    checker = EvidenceChecker({"john_w2_2025.pdf": doc("john_w2_2025.pdf")})
    fv = FieldValue(value=8200.0, source_document="john_w2_2025.pdf", page=1)
    result = checker.check_many([CheckRequest(key="k", field_name="employee_401k_contribution", value=fv, subject_name="John Sample")])
    assert result["k"].check == "not_checked"
    assert checker.validator_unavailable is True


def test_only_named_documents_are_used(isolated_engine):
    seen = []

    class Recorder:
        def relations(self, items, **kwargs):
            seen.extend(items)
            return [{"relation": "supports"} for _ in items]

    isolated_engine.setattr("rapid_analysis.engine._factory", Recorder)
    documents = {n: doc(n) for n in ["john_w2_2025.pdf", "sarah_w2_2025.pdf", "hh001_1040_2025.pdf"]}
    fv = FieldValue(value=8200.0, source_document="john_w2_2025.pdf", page=1)
    EvidenceChecker(documents).check_many([CheckRequest(key="k", field_name="employee_401k_contribution", value=fv, subject_name="John Sample")])
    assert len(seen) == 1
    assert seen[0]["state"] == documents["john_w2_2025.pdf"].text


def test_source_document_not_in_household_is_not_checked(isolated_engine):
    class Never:
        def relations(self, items, **kwargs):
            raise AssertionError("must not be called")

    isolated_engine.setattr("rapid_analysis.engine._factory", Never)
    fv = FieldValue(value=8200.0, source_document="someone_elses_w2.pdf", page=1)
    result = EvidenceChecker({"john_w2_2025.pdf": doc("john_w2_2025.pdf")}).check_many(
        [CheckRequest(key="k", field_name="employee_401k_contribution", value=fv, subject_name="John Sample")])
    assert result["k"].check == "not_checked"


def test_normalization_conflict_is_always_conflicted(backend_none):
    fv = FieldValue(value=None, conflict=True, candidates=[
        Candidate(value=120000.0, source_document="jordan_w2_2025.pdf", page=1),
        Candidate(value=165000.0, source_document="hh004_1040_2025.pdf", page=1)])
    result = EvidenceChecker({}).check_many([CheckRequest(key="w", field_name="wages", value=fv, subject_name="Jordan Park")])
    assert result["w"].check == "conflicted"


def test_no_model_internals_leak_from_checker(isolated_engine):
    class Fake:
        def relations(self, items, **kwargs):
            return [{"relation": "supports", "scores": {"supports": 0.99}, "backend": "native_nli"} for _ in items]

    isolated_engine.setattr("rapid_analysis.engine._factory", Fake)
    fv = FieldValue(value=8200.0, source_document="john_w2_2025.pdf", page=1)
    out = EvidenceChecker({"john_w2_2025.pdf": doc("john_w2_2025.pdf")}).check_many(
        [CheckRequest(key="k", field_name="employee_401k_contribution", value=fv, subject_name="John Sample")])
    # Amendment §9: raw scores may be kept ONLY in the audit field (for RAG metadata), nowhere else.
    assert out["k"].documents[0].model_scores == {"relation": "supports", "supports": 0.99}
    for d in out["k"].documents:
        d.model_scores = None
    dumped = repr(out)
    for word in ("0.99", "native_nli", "backend", "probabilit", "entail"):
        assert word not in dumped
    from rapid_analysis.overview import overview_build
    from rapid_analysis.fixtures import fixture_household_documents, fixture_household_raw
    api_text = repr(overview_build(fixture_household_raw("HH001"), fixture_household_documents("HH001")).overview)
    for word in ("model_scores", "0.99", "native_nli", "backend", "probabilit", "entail"):
        assert word not in api_text


# ---------------------------------------------------------------- model battery


@pytest.mark.model
@pytest.mark.parametrize("field_name,value,person,document,expected", TRUE_VALUES, ids=lambda x: str(x)[:30])
def test_true_values_verified(loaded_engine, field_name, value, person, document, expected):
    assert check_value(field_name, value, person, text(document), doc(document).form_type) == expected


@pytest.mark.model
@pytest.mark.parametrize("field_name,value,person,document,expected", NEAR_MISSES, ids=lambda x: str(x)[:30])
def test_near_misses_mismatch(loaded_engine, field_name, value, person, document, expected):
    assert check_value(field_name, value, person, text(document), doc(document).form_type) == expected


@pytest.mark.model
@pytest.mark.parametrize("field_name,value,person,document,expected", WRONG_PERSON + NEAR_MISS_FAIL_SAFE, ids=lambda x: str(x)[:30])
def test_wrong_person_never_verified(loaded_engine, field_name, value, person, document, expected):
    assert check_value(field_name, value, person, text(document), doc(document).form_type) != "verified"


@pytest.mark.model
def test_absent_facts_unconfirmed(loaded_engine):
    morgan = text("morgan_w2_2025.pdf")
    assert check_value("hsa_eligible_health_plan", True, "Morgan Lee", morgan) == "unconfirmed"
    result = evidence_module.relations_check([(morgan, "Morgan Lee has life insurance.", "Morgan Lee does not have life insurance.")])
    assert result == ["unconfirmed"]


@pytest.mark.model
def test_hh004_w2_verifies_1040_mismatches_conflicted(loaded_engine):
    documents = {n: doc(n) for n in ["jordan_w2_2025.pdf", "hh004_1040_2025.pdf"]}
    claimed = FieldValue(value=120000.0, source_document="jordan_w2_2025.pdf", page=1, candidates=[
        Candidate(value=120000.0, source_document="jordan_w2_2025.pdf", page=1),
        Candidate(value=120000.0, source_document="hh004_1040_2025.pdf", page=1)])
    result = EvidenceChecker(documents).check_many([CheckRequest(key="w", field_name="wages", value=claimed, subject_name="Jordan Park")])
    by_doc = {d.document: d.check for d in result["w"].documents}
    assert by_doc == {"jordan_w2_2025.pdf": "verified", "hh004_1040_2025.pdf": "mismatch"}
    assert result["w"].check == "conflicted"


@pytest.mark.model
def test_hard_gate_zero_false_confirmations_and_85_percent(loaded_engine):
    false_confirmations, correct = [], 0
    for field_name, value, person, document, expected in BATTERY:
        result = check_value(field_name, value, person, text(document), doc(document).form_type)
        if result == "verified" and expected != "verified":
            false_confirmations.append((field_name, value, person, document))
        correct += _ok(result, expected)
    assert false_confirmations == []
    assert correct / len(BATTERY) >= 0.85, f"{correct}/{len(BATTERY)}"


@pytest.mark.model
def test_identical_input_identical_result_over_5_runs(loaded_engine):
    runs = []
    for _ in range(5):
        memo_clear()
        runs.append([check_value(f, v, p, text(d), doc(d).form_type) for f, v, p, d, _ in BATTERY[:12]])
    assert all(run == runs[0] for run in runs)


# ---------------------------------------------------------------- documented limits (strict xfail: must keep failing)


@pytest.mark.model
@pytest.mark.xfail(strict=True, reason="Known limit: raw Textract LINE order separates labels from values; "
                                       "the model confirms a wrong amount ($1,875 is box 4, box 5 is $0.00).")
def test_limit_raw_line_order_never_confirms_wrong_amount(loaded_engine):
    real = fixture_textract("alex_example_1099r_2026.pdf")
    raw_lines = "\n".join(b["Text"] for b in real["Blocks"] if b["BlockType"] == "LINE")
    result = evidence_module.relations_check([(
        raw_lines,
        "Alex Example's employee contributions were $1,875.",
        "Alex Example's employee contributions were not $1,875.",
    )])
    assert result != ["verified"]


@pytest.mark.model
@pytest.mark.xfail(strict=True, reason="Known limit: household-level noul says yes to 'Can tax savings be made?' "
                                       "even for HH007, where the rules answer no. Rules decide checklist answers.")
def test_limit_household_noul_tax_savings_hh007_is_no(loaded_engine):
    state = json.dumps(fixture_household_raw("HH007"))
    result = loaded_engine.noul(
        state=state,
        instructions="Can tax savings be made?",
        criteria={"true": "Tax savings can be made for this household.",
                  "false": "No tax savings can be made for this household."},
    )
    assert result["noul"] < 0.5
