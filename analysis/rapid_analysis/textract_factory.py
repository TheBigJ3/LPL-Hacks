"""Build Textract AnalyzeDocument-shaped responses (FORMS) for tests and synthetic fixtures.

Each field becomes KEY_VALUE_SET(KEY) -> WORD children, VALUE relationship -> KEY_VALUE_SET(VALUE)
-> WORD / SELECTION_ELEMENT children, the same graph real Textract returns. Lines are emitted in a
box-form order (all labels first, then all values) to reproduce why raw LINE order is unsafe.
"""

from __future__ import annotations

import itertools
from typing import Any

Checkbox = bool  # True = SELECTED, False = NOT_SELECTED


class TextractFactory:
    def __init__(self, page: int = 1) -> None:
        self.blocks: list[dict[str, Any]] = [{"BlockType": "PAGE", "Id": "page-1", "Page": page, "Relationships": [{"Type": "CHILD", "Ids": []}]}]
        self.page = page
        self._ids = itertools.count(1)
        self._label_lines: list[str] = []
        self._value_lines: list[str] = []

    def _id(self, prefix: str) -> str:
        return f"{prefix}-{next(self._ids)}"

    def _words(self, text: str, confidence: float) -> list[str]:
        ids = []
        for word in text.split():
            block_id = self._id("word")
            self.blocks.append({"BlockType": "WORD", "Id": block_id, "Text": word, "Confidence": confidence, "Page": self.page, "TextType": "PRINTED"})
            ids.append(block_id)
        return ids

    def line(self, text: str, confidence: float = 99.0) -> "TextractFactory":
        self.blocks.append({"BlockType": "LINE", "Id": self._id("line"), "Text": text, "Confidence": confidence, "Page": self.page})
        return self

    def field(self, label: str, value: str | Checkbox | None, confidence: float = 97.0) -> "TextractFactory":
        """value: text (may be '' or '$' placeholders), True/False checkbox, or None for no VALUE region."""
        key_id, value_id = self._id("key"), self._id("value")
        children: list[str] = []
        if isinstance(value, bool):
            sel_id = self._id("sel")
            self.blocks.append({"BlockType": "SELECTION_ELEMENT", "Id": sel_id, "Confidence": confidence, "Page": self.page,
                                "SelectionStatus": "SELECTED" if value else "NOT_SELECTED"})
            children = [sel_id]
        elif isinstance(value, str) and value:
            children = self._words(value, confidence)
            self._value_lines.append(value)
        key = {"BlockType": "KEY_VALUE_SET", "Id": key_id, "EntityTypes": ["KEY"], "Confidence": confidence, "Page": self.page,
               "Relationships": [{"Type": "CHILD", "Ids": self._words(label, 99.0)}]}
        if value is not None:
            key["Relationships"].append({"Type": "VALUE", "Ids": [value_id]})
            self.blocks.append({"BlockType": "KEY_VALUE_SET", "Id": value_id, "EntityTypes": ["VALUE"], "Confidence": confidence,
                                "Page": self.page, "Relationships": [{"Type": "CHILD", "Ids": children}] if children else []})
        self.blocks.append(key)
        self._label_lines.append(label)
        return self

    def build(self) -> dict[str, Any]:
        for text in self._label_lines + self._value_lines:
            self.line(text)
        self._label_lines, self._value_lines = [], []
        return {"DocumentMetadata": {"Pages": 1}, "Blocks": self.blocks}


def textract_1099r(recipient: str, gross: str, taxable: str, federal: str, code: str, state: str, date: str,
                   ira: bool = False, payer: str = "Example Retirement Plan Services LLC", confidence: float = 95.2) -> dict:
    f = TextractFactory()
    f.line("SYNTHETIC TEST DATA - NOT FOR FILING").line("2025 FORM 1099-R")
    f.line("Distributions From Pensions, Annuities, Retirement or Profit-Sharing Plans, IRAs, Insurance Contracts, etc.")
    f.field("PAYER'S name", f"{payer} 100 Test Plaza, Suite 200, Sacramento, CA 95814", confidence)
    f.field("PAYER'S TIN", "00-0000000", confidence)
    f.field("RECIPIENT'S TIN", "000-00-0000", confidence)
    f.field("RECIPIENT'S name", recipient, confidence)
    f.field("Street address", "456 Sample Street, Apt. 5B", confidence)
    f.field("City or town", "Long Beach", confidence)
    f.field("State / Country / ZIP", "CA / USA / 90802", confidence)
    f.field("Account number (see instructions)", "TEST-1099R-0001", confidence)
    f.field("1 Gross distribution", gross, confidence)
    f.field("2a Taxable amount", taxable, confidence)
    f.field("2b Taxable amount not determined", False, confidence)
    f.field("Total distribution", True, confidence)
    f.field("3 Capital gain (included in box 2a)", "$", 75.0)
    f.field("4 Federal income tax withheld", federal, confidence)
    f.field("7a Dist. code(s)", code, confidence)
    f.field("7b IRA/SEP/SIMPLE", ira, confidence)
    f.field("13 Date of payment", date, confidence)
    f.field("14 State tax withheld", state, confidence)
    f.field("15 State/Payer's state no.", "CA / TEST-000001", confidence)
    f.field("Form", "1099-R", 86.0)
    return f.build()


def textract_w2(employee: str, employer: str, wages: str, federal: str, box12: list[str], state_tax: str | None = None,
                retirement_plan: bool = True, confidence: float = 97.5) -> dict:
    f = TextractFactory()
    f.line("SYNTHETIC TEST DATA - NOT FOR FILING").line("Form W-2 Wage and Tax Statement 2025")
    f.field("a Employee's social security number", "000-00-0000", confidence)
    f.field("b Employer identification number (EIN)", "00-0000000", confidence)
    f.field("c Employer's name, address, and ZIP code", f"{employer} 200 Sample Avenue, Springfield, IL 62701", confidence)
    f.field("d Control number", "CTRL-0000-01", confidence)
    f.field("e Employee's name", employee, confidence)
    f.field("f Employee's address and ZIP code", "456 Sample Street, Springfield, IL 62704", confidence)
    f.field("1 Wages, tips, other compensation", wages, confidence)
    f.field("2 Federal income tax withheld", federal, confidence)
    for index, entry in enumerate(box12):
        f.field(f"12{'abcd'[index]} See instructions for box 12", entry, confidence)
    f.field("13 Retirement plan", retirement_plan, confidence)
    if state_tax is not None:
        f.field("17 State income tax", state_tax, confidence)
    f.field("Form", "W-2", 90.0)
    return f.build()


def textract_1040(taxpayers: str, wages: str | None, agi: str, dependents: str | None = None,
                  business_income: str | None = None, confidence: float = 97.0) -> dict:
    f = TextractFactory()
    f.line("SYNTHETIC TEST DATA - NOT FOR FILING").line("Form 1040 U.S. Individual Income Tax Return 2025")
    f.field("Your first name and middle initial / last name", taxpayers, confidence)
    f.field("Your social security number", "000-00-0000", confidence)
    f.field("Home address (number and street)", "456 Sample Street", confidence)
    f.field("City, town, or post office, state, and ZIP code", "Springfield, IL 62704", confidence)
    if dependents is not None:
        f.field("Number of dependents claimed", dependents, confidence)
    if wages is not None:
        f.field("1a Total amount from Form(s) W-2, box 1", wages, confidence)
    if business_income is not None:
        f.field("8 Business income (Schedule C)", business_income, confidence)
    f.field("11 Adjusted gross income", agi, confidence)
    f.field("Form", "1040", 92.0)
    return f.build()


def textract_statement(holders: str, ending_balance: str, confidence: float = 98.5) -> dict:
    f = TextractFactory()
    f.line("SYNTHETIC TEST DATA - NOT FOR FILING").line("Sample Bank Account Statement")
    f.field("Account holder", holders, confidence)
    f.field("Account number", "****1234", confidence)
    f.field("Mailing address", "456 Sample Street, Springfield, IL 62704", confidence)
    f.field("Statement period", "12/01/2025 - 12/31/2025", confidence)
    f.field("Ending balance", ending_balance, confidence)
    return f.build()
