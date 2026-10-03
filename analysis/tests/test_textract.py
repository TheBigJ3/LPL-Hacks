from __future__ import annotations

import json

import pytest

from rapid_analysis.fixtures import fixture_textract
from rapid_analysis.normalization import normalize_household
from rapid_analysis.store import Store
from rapid_analysis.textract import (
    evidence_from_text,
    evidence_from_textract,
    redact,
    textract_canonical_values,
    textract_member_fields,
    textract_parse_blocks,
)
from rapid_analysis.textract_factory import (
    TextractFactory,
    textract_1040,
    textract_1098,
    textract_1099r,
    textract_hsa_coverage,
    textract_w2,
)

SENSITIVE = ["000-00-0000", "00-0000000", "TEST-1099R-0001", "TEST-000001", "456 Sample Street", "Apt. 5B",
             "Long Beach", "90802", "100 Test Plaza", "Sacramento", "95814"]


@pytest.fixture
def pat_response():
    return textract_1099r("Pat Rowe", "$ 12,000.00", "$ 12,000.00", "$ 600.00", "1", "$ 240.00", "03/14/2025")


@pytest.fixture
def real_alex_response():
    return fixture_textract("alex_example_1099r_2026.pdf")


def test_form_detected_and_confidence_rescaled(pat_response):
    doc = textract_parse_blocks(pat_response)
    assert doc.form_type == "1099-R"
    gross = next(f for f in doc.fields if f.label == "1 Gross distribution")
    assert gross.confidence == pytest.approx(0.952)
    assert all(f.confidence is None or 0.0 <= f.confidence <= 1.0 for f in doc.fields)


def test_real_textract_log_detected_as_1099r(real_alex_response):
    doc = textract_parse_blocks(real_alex_response)
    assert doc.form_type == "1099-R"
    assert all(f.confidence is None or 0.0 <= f.confidence <= 1.0 for f in doc.fields)


def test_box_values_map_to_canonical_fields(pat_response):
    recipient, values = textract_canonical_values(textract_parse_blocks(pat_response), "pat_1099r_2025.pdf")
    assert recipient == "Pat Rowe"
    assert {k: v["value"] for k, v in values.items()} == {
        "retirement_distribution": "$ 12,000.00",
        "retirement_distribution_taxable": "$ 12,000.00",
        "federal_tax_withheld": "$ 600.00",
        "distribution_code": "1",
        "distribution_from_ira": False,
        "distribution_date": "03/14/2025",
        "state_tax_withheld": "$ 240.00",
    }
    assert values["retirement_distribution"]["source_document"] == "pat_1099r_2025.pdf"
    assert values["retirement_distribution"]["page"] == 1


def test_real_log_maps_to_hh010_values(real_alex_response):
    evidence = evidence_from_textract(real_alex_response, "alex_example_1099r_2026.pdf")
    assert evidence.recipient == "Alex Example"
    raw = {"household_id": "HH010", "tax_year": 2026, "members": [{"person_id": "HH010-P1", "name": evidence.recipient, **evidence.values}]}
    result = normalize_household(raw)
    assert result.errors == []
    alex = result.household.members[0]
    assert alex.value("retirement_distribution") == 18750.0
    assert alex.value("retirement_distribution_taxable") == 18750.0
    assert alex.value("federal_tax_withheld") == 1875.0
    assert alex.value("state_tax_withheld") == 375.0
    assert alex.value("distribution_code") == "7"
    assert alex.value("distribution_from_ira") is False
    assert alex.value("distribution_date") == "2026-06-30"
    assert 0.9 < alex.get("retirement_distribution").textract_confidence < 1.0


def test_ira_checkbox_selected_maps_true():
    response = textract_1099r("Pat Rowe", "$ 1.00", "$ 1.00", "$ 0.10", "7", "$ 0.05", "01/02/2025", ira=True)
    _, values = textract_canonical_values(textract_parse_blocks(response), "x.pdf")
    assert values["distribution_from_ira"]["value"] is True


def test_empty_box_produces_no_field():
    response = (TextractFactory().line("FORM 1099-R")
                .field("RECIPIENT'S name", "Pat Rowe")
                .field("1 Gross distribution", "$")
                .field("4 Federal income tax withheld", "")
                .field("14 State tax withheld", None)
                .field("2a Taxable amount", "$ 500.00")
                .build())
    evidence = evidence_from_textract(response, "x.pdf")
    assert set(evidence.values) == {"retirement_distribution_taxable"}
    assert "Gross distribution" not in evidence.text
    assert "Federal income tax withheld" not in evidence.text


def test_real_log_empty_capital_gain_box_is_omitted(real_alex_response):
    evidence = evidence_from_textract(real_alex_response, "alex_example_1099r_2026.pdf")
    assert "Capital gain" not in evidence.text
    assert "8b Percentage" not in evidence.text


@pytest.mark.parametrize("which", ["factory", "real"])
def test_identifiers_and_addresses_absent_everywhere(which, pat_response, real_alex_response):
    response = pat_response if which == "factory" else real_alex_response
    name = "pat_1099r_2025.pdf" if which == "factory" else "alex_example_1099r_2026.pdf"
    evidence = evidence_from_textract(response, name)
    store = Store()
    store.document_put("HH009", evidence)
    stored = store.dump()
    for secret in SENSITIVE:
        assert secret not in evidence.text, secret
        assert secret not in stored, secret
        assert secret not in json.dumps(evidence.values), secret


def test_w2_identifiers_absent():
    evidence = evidence_from_textract(textract_w2("John Sample", "Contoso Sample Co", "120,000.00", "1.00", ["D 8,200.00"]), "john_w2_2025.pdf")
    for secret in ["000-00-0000", "00-0000000", "CTRL-0000-01", "200 Sample Avenue", "Springfield", "62701", "62704"]:
        assert secret not in evidence.text, secret
    assert "Employer's name: Contoso Sample Co." in evidence.text
    assert evidence.values["employer"]["value"] == "Contoso Sample Co"


def test_pre_rendered_text_is_redacted_too():
    evidence = evidence_from_text("Recipient TIN 000-00-0000, 456 Sample Street, Long Beach, CA 90802. Account number TEST-1099R-0001.", "x.pdf")
    for secret in ["000-00-0000", "456 Sample Street", "90802", "TEST-1099R-0001"]:
        assert secret not in evidence.text


def test_redact_keeps_amounts_and_dates():
    text = "1 Gross distribution: $ 12,000.00. 13 Date of payment: 03/14/2025. 120000 wages."
    assert redact(text) == text


def test_evidence_text_format(pat_response):
    text = evidence_from_textract(pat_response, "pat_1099r_2025.pdf").text
    assert text.splitlines()[0] == (
        "Form 1099-R for Pat Rowe (pat_1099r_2025.pdf). Every amount on this form belongs to Pat Rowe."
    )
    assert "1 Gross distribution: $ 12,000.00" in text
    assert "7b IRA/SEP/SIMPLE: no, this box is not checked." in text
    assert "Total distribution: yes, this box is checked." in text
    assert "Distributions From Pensions" not in text
    assert "Plans, IRAs" not in text
    assert "FORM 1099-R" not in text


def test_evidence_uses_key_value_pairs_not_line_order(pat_response):
    text = evidence_from_textract(pat_response, "pat_1099r_2025.pdf").text
    raw_lines = [b["Text"] for b in pat_response["Blocks"] if b["BlockType"] == "LINE"]
    assert raw_lines.index("1 Gross distribution") + 1 != raw_lines.index("$ 12,000.00")
    assert "1 Gross distribution: $ 12,000.00." in text


def test_w2_box12_codes_map_to_401k_and_hsa():
    evidence = evidence_from_textract(textract_w2("Morgan Lee", "Tailspin Sample Toys", "92,000.00", "1.00", ["D 18,500.00", "W 4,300.00"]), "m.pdf")
    assert evidence.form_type == "W-2"
    assert evidence.values["employee_401k_contribution"]["value"] == "18,500.00"
    assert evidence.values["hsa_contribution"]["value"] == "4,300.00"
    assert "12a Code D (401(k) elective deferrals): $ 18,500.00." in evidence.text
    assert "health plan" not in evidence.text.lower()


def test_two_documents_disagreeing_become_conflict():
    w2 = evidence_from_textract(textract_w2("Jordan Park", "Wingtip Sample Systems", "120,000.00", "1.00", []), "jordan_w2_2025.pdf")
    f1040 = evidence_from_textract(textract_1040("Jordan Park", "165,000.00", "158,000.00"), "hh004_1040_2025.pdf")
    fields, errors = textract_member_fields([w2, f1040])
    assert errors == []
    wages = fields["wages"]
    assert wages.conflict is True and wages.value is None
    assert sorted((c.value, c.source_document) for c in wages.candidates) == [
        (120000.0, "jordan_w2_2025.pdf"), (165000.0, "hh004_1040_2025.pdf")]


def test_two_documents_agreeing_merge():
    w2 = evidence_from_textract(textract_w2("Taylor Mock", "Adventure Works Sample", "110,000.00", "1.00", []), "t_w2.pdf")
    f1040 = evidence_from_textract(textract_1040("Taylor Mock", "110,000.00", "152,000.00"), "t_1040.pdf")
    fields, _ = textract_member_fields([w2, f1040])
    assert fields["wages"].conflict is False and fields["wages"].value == 110000.0


def test_committed_document_fixtures_are_marked_synthetic():
    for name in ["john_w2_2025.pdf", "sarah_w2_2025.pdf", "hh001_1040_2025.pdf", "hh001_bank_statement_2025.pdf",
                 "jordan_w2_2025.pdf", "hh004_1040_2025.pdf", "morgan_w2_2025.pdf", "pat_1099r_2025.pdf",
                 "alex_example_1099r_2026.pdf", "alex_w2_2025.pdf", "hh002_1040_2025.pdf", "hh002_bank_statement_2025.pdf",
                 "alex_hdhp_coverage_2025.pdf", "casey_w2_2025.pdf", "hh005_1040_2025.pdf", "hh005_1098_2025.pdf",
                 "hh005_bank_statement_2025.pdf", "drew_w2_2025.pdf", "avery_w2_2025.pdf", "hh007_1040_2025.pdf",
                 "hh007_bank_statement_2025.pdf", "quinn_w2_2025.pdf", "hh008_1040_2025.pdf", "hh008_bank_statement_2025.pdf"]:
        response = fixture_textract(name)
        assert response is not None, name
        assert response["_synthetic"].startswith("SYNTHETIC TEST DATA"), name


def test_1098_maps_mortgage_interest_and_redacts_lender_address():
    evidence = evidence_from_textract(textract_1098("Casey Brooks", "$ 14,200.00"), "hh005_1098_2025.pdf")
    assert (evidence.form_type, evidence.recipient) == ("1098", "Casey Brooks")
    assert evidence.values["mortgage_interest"]["value"] == "$ 14,200.00"
    assert "Lender's name: Sample Mortgage Lending Co." in evidence.text
    for secret in ["300 Sample Boulevard", "62701", "TEST-1098-0001", "000-00-0000", "456 Sample Street"]:
        assert secret not in evidence.text


def test_1095_maps_hsa_plan_checkbox():
    evidence = evidence_from_textract(textract_hsa_coverage("Alex Rivera", True), "alex_hdhp_coverage_2025.pdf")
    assert (evidence.form_type, evidence.recipient) == ("1095", "Alex Rivera")
    assert evidence.values["hsa_eligible_health_plan"]["value"] is True
    assert "HSA-eligible high deductible health plan (HDHP): yes, this box is checked." in evidence.text
    assert "TEST-HP-0001" not in evidence.text
