"""Normalization of pipeline input (§4) into typed, provenance-carrying household data.

Rules:
- money strings normalize identically ("$8,200", "8200", "8,200.00" -> 8200.0)
- missing -> None, never a fabricated value
- sources that disagree -> conflict=True, value=None, every candidate kept
- textract_confidence is 0-1 (0-100 inputs are rescaled at ingestion)
- every error is collected; normalization never stops at the first one
"""

from __future__ import annotations

import datetime as dt
import math
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Literal

from pydantic import BaseModel, Field

FilingStatus = Literal[
    "single",
    "married_filing_jointly",
    "married_filing_separately",
    "head_of_household",
    "qualifying_surviving_spouse",
]

FILING_STATUS_ALIASES: dict[str, FilingStatus] = {
    "single": "single",
    "s": "single",
    "mfj": "married_filing_jointly",
    "married filing jointly": "married_filing_jointly",
    "married jointly": "married_filing_jointly",
    "joint": "married_filing_jointly",
    "mfs": "married_filing_separately",
    "married filing separately": "married_filing_separately",
    "hoh": "head_of_household",
    "head of household": "head_of_household",
    "qss": "qualifying_surviving_spouse",
    "qw": "qualifying_surviving_spouse",
    "qualifying surviving spouse": "qualifying_surviving_spouse",
    "qualifying widow er": "qualifying_surviving_spouse",
    "qualifying widow": "qualifying_surviving_spouse",
}

MAX_ABS_VALUE = 1e9

HOUSEHOLD_FIELDS: dict[str, str] = {
    "adjusted_gross_income": "money_signed",
    "dependents": "count",
    "mortgage_interest": "money",
    "cash_balance": "money",
}

MEMBER_FIELDS: dict[str, str] = {
    "employer": "text",
    "wages": "money",
    "employee_401k_contribution": "money",
    "hsa_contribution": "money",
    "hsa_eligible_health_plan": "bool",
    "interest_income": "money",
    "dividend_income": "money",
    "self_employment_income": "money_signed",
    "retirement_distribution": "money",
    "retirement_distribution_taxable": "money",
    "federal_tax_withheld": "money",
    "state_tax_withheld": "money",
    "distribution_code": "code",
    "distribution_from_ira": "bool",
    "distribution_date": "date",
}


class Candidate(BaseModel):
    value: Any = None
    source_document: str | None = None
    page: int | None = None
    textract_confidence: float | None = None
    verified: bool = False


class FieldValue(Candidate):
    conflict: bool = False
    candidates: list[Candidate] = Field(default_factory=list)

    @property
    def sources(self) -> list[str]:
        names = [c.source_document for c in self.candidates] or [self.source_document]
        return [n for n in dict.fromkeys(names) if n]


class Member(BaseModel):
    person_id: str
    name: str | None = None
    fields: dict[str, FieldValue | None] = Field(default_factory=dict)

    def get(self, name: str) -> FieldValue | None:
        return self.fields.get(name)

    def value(self, name: str) -> Any:
        fv = self.fields.get(name)
        return None if fv is None else fv.value


class Document(BaseModel):
    name: str
    type: str | None = None
    date: str | None = None


class Household(BaseModel):
    household_id: str
    tax_year: int | None = None
    filing_status: FilingStatus | None = None
    fields: dict[str, FieldValue | None] = Field(default_factory=dict)
    members: list[Member] = Field(default_factory=list)
    documents: list[Document] = Field(default_factory=list)
    prior_year: Household | None = None

    def get(self, name: str) -> FieldValue | None:
        return self.fields.get(name)

    def value(self, name: str) -> Any:
        fv = self.fields.get(name)
        return None if fv is None else fv.value


class NormError(BaseModel):
    code: str
    path: str
    message: str


class ValueProblem(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class NormalizationResult:
    household: Household | None
    errors: list[NormError] = field(default_factory=list)


# ---------------------------------------------------------------- scalar parsers

_MONEY_PLAIN = re.compile(r"^\d+(?:\.\d+)?$")
_MONEY_GROUPED = re.compile(r"^\d{1,3}(?:,\d{3})+(?:\.\d+)?$")
_PLACEHOLDER = re.compile(r"^[\s$%/\\()_.\-–—]*$")


def is_blank(raw: Any) -> bool:
    return raw is None or (isinstance(raw, str) and _PLACEHOLDER.match(raw) is not None)


def parse_money(raw: Any) -> float:
    if isinstance(raw, bool):
        raise ValueProblem("invalid_money", f"{raw!r} is not a dollar amount")
    if isinstance(raw, (int, float)):
        number = float(raw)
    elif isinstance(raw, str):
        text = raw.strip().replace(" ", "")
        negative = False
        if text.startswith("(") and text.endswith(")"):
            negative, text = True, text[1:-1]
        if text.startswith("-"):
            negative, text = not negative, text[1:]
        text = text.removeprefix("$")
        if text.startswith("-"):
            negative, text = not negative, text[1:]
        if not (_MONEY_PLAIN.match(text) or _MONEY_GROUPED.match(text)):
            raise ValueProblem("invalid_money", f"{raw!r} is not a dollar amount")
        number = float(text.replace(",", ""))
        number = -number if negative else number
    else:
        raise ValueProblem("invalid_money", f"{type(raw).__name__} is not a dollar amount")
    if math.isnan(number) or math.isinf(number):
        raise ValueProblem("invalid_money", "amount is not a finite number")
    if abs(number) > MAX_ABS_VALUE:
        raise ValueProblem("value_out_of_range", f"{number:,.0f} is above the {MAX_ABS_VALUE:,.0f} limit")
    return number + 0.0


_DATE_FORMATS = ("%m/%d/%Y", "%Y-%m-%d", "%b %d, %Y", "%B %d, %Y", "%b %d %Y", "%B %d %Y", "%m-%d-%Y")


def parse_date(raw: Any) -> str:
    if isinstance(raw, dt.datetime):
        return raw.date().isoformat()
    if isinstance(raw, dt.date):
        return raw.isoformat()
    if isinstance(raw, str):
        text = re.sub(r"\s+", " ", raw.strip())
        for fmt in _DATE_FORMATS:
            try:
                return dt.datetime.strptime(text, fmt).date().isoformat()
            except ValueError:
                continue
    raise ValueProblem("invalid_date", f"{raw!r} is not a date")


def parse_filing_status(raw: Any) -> FilingStatus:
    if isinstance(raw, str):
        key = re.sub(r"[^a-z]+", " ", raw.lower()).strip()
        if key in FILING_STATUS_ALIASES:
            return FILING_STATUS_ALIASES[key]
        if key.replace(" ", "_") in FILING_STATUS_ALIASES.values():
            return key.replace(" ", "_")  # type: ignore[return-value]
    raise ValueProblem("invalid_filing_status", f"{raw!r} is not a known filing status")


def parse_count(raw: Any) -> int:
    if isinstance(raw, bool):
        raise ValueProblem("invalid_integer", f"{raw!r} is not a count")
    if isinstance(raw, float) and (math.isnan(raw) or not raw.is_integer()):
        raise ValueProblem("invalid_integer", f"{raw!r} is not a whole number")
    if isinstance(raw, str) and re.fullmatch(r"\s*\d+\s*", raw):
        raw = int(raw)
    if not isinstance(raw, (int, float)):
        raise ValueProblem("invalid_integer", f"{raw!r} is not a count")
    if raw < 0:
        raise ValueProblem("negative_value", f"{raw!r} cannot be negative")
    if raw > 100:
        raise ValueProblem("value_out_of_range", f"{raw!r} is not a plausible count")
    return int(raw)


_TRUE = {"true", "yes", "y", "x", "checked", "selected", "1"}
_FALSE = {"false", "no", "n", "unchecked", "not_selected", "not selected", "0"}


def parse_bool(raw: Any) -> bool:
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str) and raw.strip().lower() in _TRUE:
        return True
    if isinstance(raw, str) and raw.strip().lower() in _FALSE:
        return False
    raise ValueProblem("invalid_boolean", f"{raw!r} is not yes/no")


def parse_text(raw: Any) -> str:
    if isinstance(raw, str) and raw.strip():
        return re.sub(r"\s+", " ", raw.strip())
    raise ValueProblem("invalid_text", f"{raw!r} is not text")


def parse_code(raw: Any) -> str:
    if isinstance(raw, bool):
        raise ValueProblem("invalid_code", f"{raw!r} is not a code")
    if isinstance(raw, int):
        raw = str(raw)
    if isinstance(raw, str) and re.fullmatch(r"\s*[0-9A-Za-z]{1,2}\s*", raw):
        return raw.strip().upper()
    raise ValueProblem("invalid_code", f"{raw!r} is not a distribution code")


def _money_non_negative(raw: Any) -> float:
    number = parse_money(raw)
    if number < 0:
        raise ValueProblem("negative_value", f"{number:,.2f} cannot be negative")
    return number


PARSERS: dict[str, Callable[[Any], Any]] = {
    "money": _money_non_negative,
    "money_signed": parse_money,
    "count": parse_count,
    "bool": parse_bool,
    "text": parse_text,
    "code": parse_code,
    "date": parse_date,
}


def parse_confidence(raw: Any) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, bool) or not isinstance(raw, (int, float)) or math.isnan(raw):
        raise ValueProblem("invalid_confidence", f"{raw!r} is not a confidence")
    value = float(raw)
    if value > 1.0:
        value = value / 100.0  # Textract reports 0-100
    if not 0.0 <= value <= 1.0:
        raise ValueProblem("invalid_confidence", f"{raw!r} is outside 0-100")
    return round(value, 4)


# ---------------------------------------------------------------- field values


def _same(a: Any, b: Any) -> bool:
    if isinstance(a, float) or isinstance(b, float):
        return isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) < 0.005
    return a == b


def merge_candidates(candidates: list[Candidate]) -> FieldValue | None:
    if not candidates:
        return None
    distinct: list[Any] = []
    for c in candidates:
        if not any(_same(c.value, d) for d in distinct):
            distinct.append(c.value)
    keep = candidates if len(candidates) > 1 else []
    if len(distinct) > 1:
        return FieldValue(value=None, conflict=True, candidates=keep)
    first = next((c for c in candidates if c.source_document), candidates[0])
    confidences = [c.textract_confidence for c in candidates if c.textract_confidence is not None]
    return FieldValue(
        value=candidates[0].value,
        source_document=first.source_document,
        page=first.page,
        textract_confidence=min(confidences) if confidences else None,
        verified=any(c.verified for c in candidates),
        candidates=keep,
    )


def normalize_field(raw: Any, kind: str, path: str, errors: list[NormError]) -> FieldValue | None:
    """Scalar, FieldValue dict, or list of FieldValue dicts -> FieldValue | None."""
    parser = PARSERS[kind]
    if isinstance(raw, dict) and isinstance(raw.get("candidates"), list):
        raw = raw["candidates"]
    items = raw if isinstance(raw, list) else [raw]
    candidates: list[Candidate] = []
    for index, item in enumerate(items):
        item_path = f"{path}[{index}]" if isinstance(raw, list) else path
        if isinstance(item, dict):
            value_raw = item.get("value")
            source = item.get("source_document")
            if source is not None and (not isinstance(source, str) or not source.strip()):
                errors.append(NormError(code="invalid_source_document", path=item_path, message="source_document must be a name"))
                source = None
            page = item.get("page")
            if page is not None and (isinstance(page, bool) or not isinstance(page, int) or page < 1):
                errors.append(NormError(code="invalid_page", path=item_path, message=f"{page!r} is not a page number"))
                page = None
            try:
                confidence = parse_confidence(item.get("textract_confidence"))
            except ValueProblem as problem:
                errors.append(NormError(code=problem.code, path=item_path, message=problem.message))
                confidence = None
            verified = item.get("verified") is True
        else:
            value_raw, source, page, confidence, verified = item, None, None, None, False
        if kind not in ("bool", "count") and is_blank(value_raw):
            continue
        if value_raw is None:
            continue
        try:
            value = parser(value_raw)
        except ValueProblem as problem:
            errors.append(NormError(code=problem.code, path=item_path, message=problem.message))
            continue
        candidates.append(Candidate(value=value, source_document=source, page=page,
                                    textract_confidence=confidence, verified=verified))
    return merge_candidates(candidates)


# ---------------------------------------------------------------- household


def _err(errors: list[NormError], code: str, path: str, message: str) -> None:
    errors.append(NormError(code=code, path=path, message=message))


def _normalize_members(raw: Any, household_id: str, path: str, errors: list[NormError]) -> list[Member]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        _err(errors, "invalid_members", path, "members must be a list")
        return []
    members: list[Member] = []
    seen: set[str] = set()
    for index, item in enumerate(raw):
        item_path = f"{path}[{index}]"
        if not isinstance(item, dict):
            _err(errors, "invalid_member", item_path, "member must be an object")
            continue
        person_id = item.get("person_id")
        if person_id is None or (isinstance(person_id, str) and not person_id.strip()):
            person_id = f"{household_id}-P{index + 1}"
        person_id = str(person_id).strip()
        if person_id in seen:
            _err(errors, "duplicate_member", item_path, f"person_id {person_id} appears more than once")
            continue
        seen.add(person_id)
        name_raw = item.get("name", item.get("household_member"))
        name = name_raw.strip() if isinstance(name_raw, str) and name_raw.strip() else None
        if name_raw is not None and name is None:
            _err(errors, "invalid_name", f"{item_path}.name", "name must be text")
        fields = {
            key: normalize_field(item.get(key), kind, f"{item_path}.{key}", errors)
            for key, kind in MEMBER_FIELDS.items()
        }
        members.append(Member(person_id=person_id, name=name, fields=fields))
    return members


def _normalize_documents(raw: Any, path: str, errors: list[NormError]) -> list[Document]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        _err(errors, "invalid_documents", path, "documents must be a list")
        return []
    documents: list[Document] = []
    seen: set[str] = set()
    for index, item in enumerate(raw):
        item_path = f"{path}[{index}]"
        if not isinstance(item, dict):
            _err(errors, "invalid_document", item_path, "document must be an object")
            continue
        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            _err(errors, "document_missing_name", item_path, "document has no name")
            continue
        name = name.strip()
        if name in seen:
            _err(errors, "duplicate_document", item_path, f"document {name} appears more than once")
            continue
        seen.add(name)
        date = None
        if item.get("date") is not None:
            try:
                date = parse_date(item["date"])
            except ValueProblem as problem:
                _err(errors, problem.code, f"{item_path}.date", problem.message)
        doc_type = item.get("type") if isinstance(item.get("type"), str) else None
        documents.append(Document(name=name, type=doc_type, date=date))
    return documents


def _normalize_body(raw: dict, household_id: str, path: str, errors: list[NormError], require_year: bool) -> Household:
    tax_year = None
    year_raw = raw.get("tax_year")
    if year_raw is None:
        if require_year:
            _err(errors, "missing_tax_year", f"{path}tax_year", "tax_year is required")
    elif isinstance(year_raw, bool) or not isinstance(year_raw, (int, str)) or not re.fullmatch(r"\d{4}", str(year_raw).strip()):
        _err(errors, "invalid_tax_year", f"{path}tax_year", f"{year_raw!r} is not a tax year")
    else:
        tax_year = int(str(year_raw).strip())

    filing_status = None
    if raw.get("filing_status") is not None:
        try:
            filing_status = parse_filing_status(raw["filing_status"])
        except ValueProblem as problem:
            _err(errors, problem.code, f"{path}filing_status", problem.message)

    fields = {
        key: normalize_field(raw.get(key), kind, f"{path}{key}", errors)
        for key, kind in HOUSEHOLD_FIELDS.items()
    }
    return Household(
        household_id=household_id,
        tax_year=tax_year,
        filing_status=filing_status,
        fields=fields,
        members=_normalize_members(raw.get("members"), household_id, f"{path}members", errors),
        documents=_normalize_documents(raw.get("documents"), f"{path}documents", errors),
    )


def normalize_household(raw: Any) -> NormalizationResult:
    errors: list[NormError] = []
    if not isinstance(raw, dict):
        _err(errors, "invalid_household", "", "household must be a JSON object")
        return NormalizationResult(household=None, errors=errors)
    household_id = raw.get("household_id")
    if not isinstance(household_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", household_id.strip()):
        _err(errors, "missing_household_id", "household_id", "household_id is required (letters, digits, - or _)")
        return NormalizationResult(household=None, errors=errors)
    household_id = household_id.strip()

    household = _normalize_body(raw, household_id, "", errors, require_year=True)
    has_values = any(fv is not None for fv in household.fields.values()) or any(
        fv is not None for m in household.members for fv in m.fields.values())
    if not has_values and not errors:
        _err(errors, "empty_profile", "", "household has no financial values to analyze")
    prior = raw.get("prior_year")
    if prior is not None:
        if isinstance(prior, dict):
            household.prior_year = _normalize_body(prior, household_id, "prior_year.", errors, require_year=False)
        else:
            _err(errors, "invalid_prior_year", "prior_year", "prior_year must be an object")
    return NormalizationResult(household=household, errors=errors)
