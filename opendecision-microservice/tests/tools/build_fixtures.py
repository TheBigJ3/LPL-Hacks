"""Write the §6 synthetic household fixtures to fixtures/households/HH0XX.json.

SYNTHETIC TEST DATA. Every person, employer and document here is invented.
Re-run after editing:  python tests/tools/build_fixtures.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from tests.support.textract_factory import (  # noqa: E402
    textract_1040,
    textract_1098,
    textract_1099r,
    textract_hsa_coverage,
    textract_statement,
    textract_w2,
)

OUT = ROOT / "tests" / "fixtures" / "households"
DOCS_OUT = ROOT / "tests" / "fixtures" / "documents"
REAL_1099R_LOG = ROOT.parent / "backend" / "logs" / "textract" / "2026-10-03T01-42-33-695Z.json"
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
                      {"name": "alex_hdhp_coverage_2025.pdf", "type": "1095", "date": "2025-01-01"}],
    },
    {
        "household_id": "HH003", "tax_year": 2025, "filing_status": "Single",
        "adjusted_gross_income": fv(81000, "hh003_1040_2025.pdf", 0.984),
        "dependents": fv(0, "hh003_1040_2025.pdf", 0.99),
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
        "adjusted_gross_income": fv(152000, "hh006_1040_2025.pdf", 0.983),
        "dependents": fv(1, "hh006_1040_2025.pdf", 0.99),
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
        "dependents": fv(0, "hh007_1040_2025.pdf", 0.99),
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
        "dependents": fv(0, "hh008_1040_2025.pdf", 0.99),
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

    DOCS_OUT.mkdir(parents=True, exist_ok=True)
    for name, response in documents().items():
        body = {"_synthetic": MARK, **response}
        (DOCS_OUT / f"{name}.json").write_text(json.dumps(body, indent=1) + "\n", encoding="utf-8")
    # The real Textract response for the synthetic Alex Example 1099-R, logged by backend/api/v1/extraction/analyze.
    real = json.loads(REAL_1099R_LOG.read_text(encoding="utf-8"))
    body = {"_synthetic": MARK + " (real AWS Textract output of a synthetic form)", **real}
    (DOCS_OUT / "alex_example_1099r_2026.pdf.json").write_text(json.dumps(body) + "\n", encoding="utf-8")
    print(f"wrote {len(documents()) + 1} document fixtures to {DOCS_OUT}")


def documents() -> dict[str, dict]:
    return {
        "john_w2_2025.pdf": textract_w2("John Sample", "Contoso Sample Co", "120,000.00", "18,400.00", ["D 8,200.00"], "5,940.00"),
        "sarah_w2_2025.pdf": textract_w2("Sarah Sample", "Fabrikam Sample Inc", "65,000.00", "7,150.00", ["D 4,500.00"], "3,217.50"),
        "hh001_1040_2025.pdf": textract_1040("John Sample and Sarah Sample", "185,000.00", "185,000.00", "2"),
        "hh001_bank_statement_2025.pdf": textract_statement("John Sample and Sarah Sample", "$32,216.56"),
        "jordan_w2_2025.pdf": textract_w2("Jordan Park", "Wingtip Sample Systems", "120,000.00", "19,800.00", ["D 15,000.00"]),
        "hh004_1040_2025.pdf": textract_1040("Jordan Park", "165,000.00", "158,000.00", "0"),
        "morgan_w2_2025.pdf": textract_w2("Morgan Lee", "Tailspin Sample Toys", "92,000.00", "12,880.00", ["D 18,500.00", "W 4,300.00"]),
        "hh003_1040_2025.pdf": textract_1040("Morgan Lee", "92,000.00", "81,000.00", "0"),
        "hh003_bank_statement_2025.pdf": textract_statement("Morgan Lee", "$19,000.00"),
        "taylor_w2_2025.pdf": textract_w2("Taylor Mock", "Adventure Works Sample", "110,000.00", "14,300.00", ["D 2,000.00"]),
        "hh006_1040_2025.pdf": textract_1040("Taylor Mock and Sam Mock", "110,000.00", "152,000.00", "1", business_income="48,000.00"),
        "hh006_bank_statement_2025.pdf": textract_statement("Taylor Mock and Sam Mock", "$210,000.00"),
        "pat_1099r_2025.pdf": textract_1099r("Pat Rowe", "$ 12,000.00", "$ 12,000.00", "$ 600.00", "1", "$ 240.00", "03/14/2025"),
        "alex_w2_2025.pdf": textract_w2("Alex Rivera", "Northwind Sample Traders", "98,000.00", "11,760.00", ["D 23,500.00", "W 4,300.00"]),
        "hh002_1040_2025.pdf": textract_1040("Alex Rivera", "98,000.00", "74,500.00", "0"),
        "hh002_bank_statement_2025.pdf": textract_statement("Alex Rivera", "$26,000.00"),
        "alex_hdhp_coverage_2025.pdf": textract_hsa_coverage("Alex Rivera", True),
        "casey_w2_2025.pdf": textract_w2("Casey Brooks", "Bluefin Sample LLC", "160,000.00", "27,200.00", ["D 16,000.00"]),
        "hh005_1040_2025.pdf": textract_1040("Casey Brooks", "160,000.00", "171,000.00", "1"),
        "hh005_1098_2025.pdf": textract_1098("Casey Brooks", "$ 14,200.00"),
        "hh005_bank_statement_2025.pdf": textract_statement("Casey Brooks", "$22,000.00"),
        "drew_w2_2025.pdf": textract_w2("Drew Kim", "Litware Sample Inc", "82,000.00", "9,020.00", ["D 23,500.00"]),
        "avery_w2_2025.pdf": textract_w2("Avery Kim", "Proseware Sample LLC", "80,000.00", "8,800.00", ["D 23,500.00"]),
        "hh007_1040_2025.pdf": textract_1040("Drew Kim and Avery Kim", "162,000.00", "139,000.00", "0"),
        "hh007_bank_statement_2025.pdf": textract_statement("Drew Kim and Avery Kim", "$35,000.00"),
        "quinn_w2_2025.pdf": textract_w2("Quinn Harper", "Margie's Sample Travel", "88,000.00", "10,560.00", ["D 8,800.00"]),
        "hh008_1040_2025.pdf": textract_1040("Quinn Harper", "88,000.00", "81,000.00", "0"),
        "hh008_bank_statement_2025.pdf": textract_statement("Quinn Harper", "$15,000.00"),
    }


if __name__ == "__main__":
    main()
