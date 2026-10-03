"""Write the §6 synthetic household fixtures to fixtures/households/HH0XX.json.

SYNTHETIC TEST DATA. Every person, employer and document here is invented.
Re-run after editing:  .venv/Scripts/python scripts/build_fixtures.py
"""

from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "households"
MARK = "SYNTHETIC TEST DATA - invented people and documents, not for filing"


def fv(value, doc, conf=0.97, page=1):
    return {"value": value, "source_document": doc, "page": page, "textract_confidence": conf, "verified": False}


def w2(name, year, date="2026-01-31"):
    return {"name": name, "type": "W-2", "date": date}


HOUSEHOLDS = [
    {
        "household_id": "HH001", "tax_year": 2025, "filing_status": "married_filing_jointly",
        "adjusted_gross_income": fv(185000, "hh001_1040_2025.pdf", 0.982),
        "dependents": fv(2, "hh001_1040_2025.pdf", 0.991),
        "mortgage_interest": None,
        "cash_balance": fv("$32,216.56", "hh001_bank_statement_2025.pdf", 0.988),
        "members": [
            {"person_id": "HH001-P1", "name": "John Sample",
             "employer": fv("Contoso Sample Co", "john_w2_2025.pdf", 0.991),
             "wages": fv("$120,000.00", "john_w2_2025.pdf", 0.981),
             "employee_401k_contribution": fv(8200, "john_w2_2025.pdf", 0.974)},
            {"person_id": "HH001-P2", "name": "Sarah Sample",
             "employer": fv("Fabrikam Sample Inc", "sarah_w2_2025.pdf", 0.99),
             "wages": fv("65,000.00", "sarah_w2_2025.pdf", 0.979),
             "employee_401k_contribution": fv("4500", "sarah_w2_2025.pdf", 0.968)},
        ],
        "documents": [w2("john_w2_2025.pdf", 2025), w2("sarah_w2_2025.pdf", 2025),
                      {"name": "hh001_1040_2025.pdf", "type": "1040", "date": "2026-04-10"},
                      {"name": "hh001_bank_statement_2025.pdf", "type": "account_statement", "date": "2025-12-31"}],
    },
    {
        "household_id": "HH002", "tax_year": 2025, "filing_status": "single",
        "adjusted_gross_income": fv(74500, "hh002_1040_2025.pdf", 0.985),
        "dependents": fv(0, "hh002_1040_2025.pdf", 0.99),
        "cash_balance": fv(26000, "hh002_bank_statement_2025.pdf", 0.99),
        "members": [
            {"person_id": "HH002-P1", "name": "Alex Rivera",
             "employer": fv("Northwind Sample Traders", "alex_w2_2025.pdf", 0.99),
             "wages": fv(98000, "alex_w2_2025.pdf", 0.98),
             "employee_401k_contribution": fv(23500, "alex_w2_2025.pdf", 0.977),
             "hsa_contribution": fv(4300, "alex_w2_2025.pdf", 0.972),
             "hsa_eligible_health_plan": fv(True, "alex_hdhp_coverage_2025.pdf", 0.96)},
        ],
        "documents": [w2("alex_w2_2025.pdf", 2025),
                      {"name": "hh002_1040_2025.pdf", "type": "1040", "date": "2026-04-02"},
                      {"name": "hh002_bank_statement_2025.pdf", "type": "account_statement", "date": "2025-12-31"},
                      {"name": "alex_hdhp_coverage_2025.pdf", "type": "insurance_statement", "date": "2025-01-01"}],
    },
    {
        "household_id": "HH003", "tax_year": 2025, "filing_status": "Single",
        "adjusted_gross_income": fv(81000, "hh003_1040_2025.pdf", 0.984),
        "dependents": 0,
        "cash_balance": fv(19000, "hh003_bank_statement_2025.pdf", 0.99),
        "members": [
            {"person_id": "HH003-P1", "name": "Morgan Lee",
             "employer": fv("Tailspin Sample Toys", "morgan_w2_2025.pdf", 0.99),
             "wages": fv(92000, "morgan_w2_2025.pdf", 0.982),
             "employee_401k_contribution": fv(18500, "morgan_w2_2025.pdf", 0.975),
             "hsa_contribution": fv(4300, "morgan_w2_2025.pdf", 0.971),
             "hsa_eligible_health_plan": None},
        ],
        "documents": [w2("morgan_w2_2025.pdf", 2025),
                      {"name": "hh003_1040_2025.pdf", "type": "1040", "date": "2026-04-05"},
                      {"name": "hh003_bank_statement_2025.pdf", "type": "account_statement", "date": "2025-12-31"}],
    },
    {
        "household_id": "HH004", "tax_year": 2025, "filing_status": "single",
        "adjusted_gross_income": fv(158000, "hh004_1040_2025.pdf", 0.983),
        "dependents": 0,
        "cash_balance": fv(40000, "hh004_bank_statement_2025.pdf", 0.99),
        "members": [
            {"person_id": "HH004-P1", "name": "Jordan Park",
             "employer": fv("Wingtip Sample Systems", "jordan_w2_2025.pdf", 0.99),
             "wages": [fv(120000, "jordan_w2_2025.pdf", 0.981), fv(165000, "hh004_1040_2025.pdf", 0.976)],
             "employee_401k_contribution": fv(15000, "jordan_w2_2025.pdf", 0.973)},
        ],
        "documents": [w2("jordan_w2_2025.pdf", 2025),
                      {"name": "hh004_1040_2025.pdf", "type": "1040", "date": "2026-04-12"},
                      {"name": "hh004_bank_statement_2025.pdf", "type": "account_statement", "date": "2025-12-31"}],
    },
    {
        "household_id": "HH005", "tax_year": 2025, "filing_status": "MFJ",
        "adjusted_gross_income": fv(171000, "hh005_1040_2025.pdf", 0.984),
        "dependents": fv(1, "hh005_1040_2025.pdf", 0.99),
        "mortgage_interest": fv(14200, "hh005_1098_2025.pdf", 0.978),
        "cash_balance": fv(22000, "hh005_bank_statement_2025.pdf", 0.99),
        "members": [
            {"person_id": "HH005-P1", "name": "Casey Brooks",
             "employer": fv("Bluefin Sample LLC", "casey_w2_2025.pdf", 0.99),
             "wages": fv(160000, "casey_w2_2025.pdf", 0.98),
             "employee_401k_contribution": fv(16000, "casey_w2_2025.pdf", 0.975)},
        ],
        "documents": [w2("casey_w2_2025.pdf", 2025),
                      {"name": "hh005_1040_2025.pdf", "type": "1040", "date": "2026-04-08"},
                      {"name": "hh005_1098_2025.pdf", "type": "1098", "date": "2026-01-31"},
                      {"name": "hh005_bank_statement_2025.pdf", "type": "account_statement", "date": "2025-12-31"}],
        "prior_year": {
            "tax_year": 2024, "filing_status": "married_filing_jointly",
            "adjusted_gross_income": 88000, "dependents": 0, "mortgage_interest": None,
            "members": [{"person_id": "HH005-P1", "name": "Casey Brooks", "employer": "Acme Sample Corp",
                         "wages": 90000, "employee_401k_contribution": 9000}],
        },
    },
    {
        "household_id": "HH006", "tax_year": 2025, "filing_status": "married_filing_jointly",
        "adjusted_gross_income": 152000,
        "dependents": 1,
        "cash_balance": fv(210000, "hh006_bank_statement_2025.pdf", 0.99),
        "members": [
            {"person_id": "HH006-P1", "name": "Taylor Mock",
             "employer": fv("Adventure Works Sample", "taylor_w2_2025.pdf", 0.99),
             "wages": fv(110000, "taylor_w2_2025.pdf", 0.981),
             "employee_401k_contribution": fv(2000, "taylor_w2_2025.pdf", 0.972)},
            {"person_id": "HH006-P2", "name": "Sam Mock",
             "self_employment_income": fv(48000, "hh006_1040_2025.pdf", 0.97)},
        ],
        "documents": [w2("taylor_w2_2025.pdf", 2025),
                      {"name": "hh006_1040_2025.pdf", "type": "1040", "date": "2026-04-14"},
                      {"name": "hh006_bank_statement_2025.pdf", "type": "account_statement", "date": "2025-12-31"}],
        "prior_year": {
            "tax_year": 2024, "filing_status": "married_filing_jointly",
            "adjusted_gross_income": 140000, "dependents": 0,
            "members": [{"person_id": "HH006-P1", "name": "Taylor Mock", "employer": "Adventure Works Sample",
                         "wages": 104000, "employee_401k_contribution": 2000},
                        {"person_id": "HH006-P2", "name": "Sam Mock", "self_employment_income": 36000}],
        },
    },
    {
        "household_id": "HH007", "tax_year": 2025, "filing_status": "married filing jointly",
        "adjusted_gross_income": fv(139000, "hh007_1040_2025.pdf", 0.985),
        "dependents": 0,
        "cash_balance": fv(35000, "hh007_bank_statement_2025.pdf", 0.99),
        "members": [
            {"person_id": "HH007-P1", "name": "Drew Kim",
             "employer": fv("Litware Sample Inc", "drew_w2_2025.pdf", 0.99),
             "wages": fv(82000, "drew_w2_2025.pdf", 0.98),
             "employee_401k_contribution": fv(23500, "drew_w2_2025.pdf", 0.976)},
            {"person_id": "HH007-P2", "name": "Avery Kim",
             "employer": fv("Proseware Sample LLC", "avery_w2_2025.pdf", 0.99),
             "wages": fv(80000, "avery_w2_2025.pdf", 0.98),
             "employee_401k_contribution": fv(23500, "avery_w2_2025.pdf", 0.977)},
        ],
        "documents": [w2("drew_w2_2025.pdf", 2025), w2("avery_w2_2025.pdf", 2025),
                      {"name": "hh007_1040_2025.pdf", "type": "1040", "date": "2026-04-01"},
                      {"name": "hh007_bank_statement_2025.pdf", "type": "account_statement", "date": "2025-12-31"}],
    },
    {
        "household_id": "HH008", "tax_year": 2025, "filing_status": "single",
        "adjusted_gross_income": fv(81000, "hh008_1040_2025.pdf", 0.983),
        "dependents": 0,
        "cash_balance": fv(15000, "hh008_bank_statement_2025.pdf", 0.99),
        "members": [
            {"person_id": "HH008-P1", "name": "Quinn Harper",
             "employer": fv("Margie's Sample Travel", "quinn_w2_2025.pdf", 0.99),
             "wages": fv(88000, "quinn_w2_2025.pdf", 0.98),
             "employee_401k_contribution": fv(8800, "quinn_w2_2025.pdf", 0.975)},
        ],
        "documents": [w2("quinn_w2_2025.pdf", 2025),
                      {"name": "hh008_1040_2025.pdf", "type": "1040", "date": "2026-04-03"},
                      {"name": "hh008_bank_statement_2025.pdf", "type": "account_statement", "date": "2025-12-31"}],
    },
    {
        "household_id": "HH009", "tax_year": 2025, "filing_status": "single",
        "members": [
            {"person_id": "HH009-P1", "name": "Pat Rowe",
             "retirement_distribution": fv("$ 12,000.00", "pat_1099r_2025.pdf", 0.951),
             "retirement_distribution_taxable": fv("$ 12,000.00", "pat_1099r_2025.pdf", 0.952),
             "federal_tax_withheld": fv("$ 600.00", "pat_1099r_2025.pdf", 0.954),
             "state_tax_withheld": fv("$ 240.00", "pat_1099r_2025.pdf", 0.95),
             "distribution_code": fv("1", "pat_1099r_2025.pdf", 0.945),
             "distribution_from_ira": fv(False, "pat_1099r_2025.pdf", 0.947),
             "distribution_date": fv("03/14/2025", "pat_1099r_2025.pdf", 0.952)},
        ],
        "documents": [{"name": "pat_1099r_2025.pdf", "type": "1099-R", "date": "2026-01-31"}],
    },
    {
        "household_id": "HH010", "tax_year": 2026, "filing_status": "single",
        "members": [
            {"person_id": "HH010-P1", "name": "Alex Example",
             "retirement_distribution": fv("$ 18,750.00", "alex_example_1099r_2026.pdf", 0.951),
             "retirement_distribution_taxable": fv("$ 18,750.00", "alex_example_1099r_2026.pdf", 0.952),
             "federal_tax_withheld": fv("$ 1,875.00", "alex_example_1099r_2026.pdf", 0.954),
             "state_tax_withheld": fv("$ 375.00", "alex_example_1099r_2026.pdf", 0.95),
             "distribution_code": fv("7", "alex_example_1099r_2026.pdf", 0.945),
             "distribution_from_ira": fv(False, "alex_example_1099r_2026.pdf", 0.947),
             "distribution_date": fv("06/30/2026", "alex_example_1099r_2026.pdf", 0.952)},
        ],
        "documents": [{"name": "alex_example_1099r_2026.pdf", "type": "1099-R", "date": "2026-06-30"}],
    },
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for household in HOUSEHOLDS:
        body = {"_synthetic": MARK, **household}
        (OUT / f"{household['household_id']}.json").write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(HOUSEHOLDS)} fixtures to {OUT}")


if __name__ == "__main__":
    main()
