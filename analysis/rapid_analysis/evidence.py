"""The only OpenDecision usage: check one extracted value against its own source document.

engine.relation(state=<one document's evidence text>, proposition=<claim>, contradiction=<negated claim>)
  supports -> verified, contradicts -> mismatch, unknown -> unconfirmed.
Combined across a value's source documents: any verified + any mismatch -> conflicted.
A normalization conflict is always conflicted. Model off / failing -> not_checked.

Model scores never leave this module.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import threading
from dataclasses import dataclass, field
from typing import Any, Literal, Mapping

from rapid_analysis.engine import ValidatorUnavailable, backend_name, engine_call, engine_get
from rapid_analysis.normalization import FieldValue
from rapid_analysis.textract import EvidenceDocument

Check = Literal["verified", "mismatch", "unconfirmed", "conflicted", "not_checked"]
DocCheck = Literal["verified", "mismatch", "unconfirmed"]
CHECK_VALUES: tuple[Check, ...] = ("verified", "mismatch", "unconfirmed", "conflicted", "not_checked")

RELATION_TO_CHECK: dict[str, DocCheck] = {
    "supports": "verified",
    "contradicts": "mismatch",
    "unknown": "unconfirmed",
    # The two-label backend reports both-above-threshold as "conflicted" for ONE document;
    # that is the model being unsure, not two documents disagreeing, so it fails safe.
    "conflicted": "unconfirmed",
}

# field -> (claim subject, verb). 1099-R box numbers anchor fields whose labels share words.
CLAIM_SUBJECTS: dict[str, tuple[str, str]] = {
    "wages": ("wages", "were"),
    "employee_401k_contribution": ("401(k) elective deferrals", "were"),
    "hsa_contribution": ("HSA contributions", "were"),
    "interest_income": ("interest income", "was"),
    "dividend_income": ("dividend income", "was"),
    "self_employment_income": ("business income", "was"),
    "retirement_distribution": ("gross distribution", "was"),
    "retirement_distribution_taxable": ("taxable amount", "was"),
    "federal_tax_withheld": ("federal income tax withheld", "was"),
    "state_tax_withheld": ("state tax withheld (box 14)", "was"),
    "distribution_code": ("distribution code", "was"),
    "distribution_date": ("date of payment", "was"),
    "employer": ("employer", "was"),
    "adjusted_gross_income": ("adjusted gross income", "was"),
    "dependents": ("number of dependents claimed", "was"),
    "mortgage_interest": ("mortgage interest", "was"),
    "cash_balance": ("ending balance", "was"),
}
FORM_SUBJECTS: dict[tuple[str, str], tuple[str, str]] = {
    ("W-2", "state_tax_withheld"): ("state income tax", "was"),
}
MONEY_FIELDS = {
    "wages", "employee_401k_contribution", "hsa_contribution", "interest_income", "dividend_income",
    "self_employment_income", "retirement_distribution", "retirement_distribution_taxable",
    "federal_tax_withheld", "state_tax_withheld", "adjusted_gross_income", "mortgage_interest", "cash_balance",
}


def money_format(value: float) -> str:
    """$8,200 / $32,216.56 / -$1,250 — never a trailing .00."""
    sign = "-" if value < 0 else ""
    amount = abs(value)
    text = f"{amount:,.0f}" if round(amount, 2) == round(amount) else f"{amount:,.2f}"
    return f"{sign}${text}"


def _value_text(field_name: str, value: Any) -> str:
    if field_name in MONEY_FIELDS and isinstance(value, (int, float)):
        return money_format(float(value))
    if field_name == "distribution_date" and isinstance(value, str):
        try:
            return dt.date.fromisoformat(value).strftime("%m/%d/%Y")
        except ValueError:
            return value
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def claim_build(field_name: str, value: Any, subject_name: str, form_type: str | None = None) -> tuple[str, str] | None:
    """-> (claim, negated claim) or None when the field has no claim form."""
    if field_name == "distribution_from_ira" and isinstance(value, bool):
        yes = f"{subject_name}'s distribution was from an IRA/SEP/SIMPLE."
        no = f"{subject_name}'s distribution was not from an IRA/SEP/SIMPLE."
        return (yes, no) if value else (no, yes)
    if field_name == "hsa_eligible_health_plan" and isinstance(value, bool):
        yes = f"{subject_name} is covered by an HSA-eligible health plan."
        no = f"{subject_name} is not covered by an HSA-eligible health plan."
        return (yes, no) if value else (no, yes)
    subject = FORM_SUBJECTS.get((form_type or "", field_name)) or CLAIM_SUBJECTS.get(field_name)
    if subject is None or value is None:
        return None
    noun, verb = subject
    text = _value_text(field_name, value)
    return f"{subject_name}'s {noun} {verb} {text}.", f"{subject_name}'s {noun} {verb} not {text}."


# ---------------------------------------------------------------- model calls

_memo: dict[tuple[str, str], DocCheck] = {}
_memo_lock = threading.Lock()
_MEMO_LIMIT = 20000


def _memo_key(text: str, proposition: str) -> tuple[str, str]:
    return hashlib.sha256(text.encode("utf-8")).hexdigest(), proposition


def memo_clear() -> None:
    with _memo_lock:
        _memo.clear()


def relations_check(items: list[tuple[str, str, str]]) -> list[DocCheck]:
    """[(document text, claim, negation)] -> per-document checks. Raises ValidatorUnavailable."""
    results: list[DocCheck | None] = []
    todo: list[int] = []
    with _memo_lock:
        for text, claim, _ in items:
            results.append(_memo.get(_memo_key(text, claim)))
    todo = [i for i, r in enumerate(results) if r is None]
    if todo:
        payload = [{"state": items[i][0], "proposition": items[i][1], "contradiction": items[i][2]} for i in todo]
        raw = engine_call(lambda engine: engine.relations(items=payload))
        if not isinstance(raw, list) or len(raw) != len(todo):
            raise ValidatorUnavailable("engine returned an unexpected shape")
        with _memo_lock:
            if len(_memo) > _MEMO_LIMIT:
                _memo.clear()
            for i, r in zip(todo, raw):
                check = RELATION_TO_CHECK.get(r.get("relation") if isinstance(r, dict) else None, "unconfirmed")
                results[i] = check
                _memo[_memo_key(items[i][0], items[i][1])] = check
    return [r for r in results if r is not None]


def check_value(field_name: str, value: Any, member_name: str, document_text: str, form_type: str | None = None) -> Check:
    """One value against ONE document's text -> verified | mismatch | unconfirmed (not_checked if model off)."""
    claim = claim_build(field_name, value, member_name, form_type)
    if claim is None:
        return "not_checked"
    try:
        return relations_check([(document_text, claim[0], claim[1])])[0]
    except ValidatorUnavailable:
        return "not_checked"


def checks_combine(per_document: list[DocCheck]) -> Check:
    if not per_document:
        return "not_checked"
    if "verified" in per_document and "mismatch" in per_document:
        return "conflicted"
    if "verified" in per_document:
        return "verified"
    if "mismatch" in per_document:
        return "mismatch"
    return "unconfirmed"


# ---------------------------------------------------------------- field-level checks


@dataclass
class DocumentResult:
    document: str
    page: int | None
    value: Any
    check: DocCheck


@dataclass
class FieldCheck:
    check: Check
    documents: list[DocumentResult] = field(default_factory=list)


@dataclass
class CheckRequest:
    key: str
    field_name: str
    value: FieldValue | None
    subject_name: str | None
    claim_value: Any = None  # override (e.g. the absent HSA-plan fact) when value is None


class EvidenceChecker:
    """Checks many values in one batched model call; records whether the model was unavailable."""

    def __init__(self, documents: Mapping[str, EvidenceDocument]):
        self.documents = documents  # ONLY this household's documents
        self.validator_unavailable = False

    def _pairs(self, request: CheckRequest) -> list[tuple[str, Any, int | None]]:
        """(document name, value claimed against it, page) for every source document that is present."""
        fv = request.value
        if fv is None:
            return []
        if fv.conflict:
            return [(c.source_document, c.value, c.page) for c in fv.candidates
                    if c.source_document in self.documents and c.value is not None]
        return [(name, fv.value, fv.page if name == fv.source_document else None)
                for name in fv.sources if name in self.documents]

    def check_many(self, requests: list[CheckRequest], extra_documents: Mapping[str, list[str]] | None = None) -> dict[str, FieldCheck]:
        """extra_documents: request key -> document names to check an absent fact against."""
        plan: list[tuple[str, str, Any, int | None, tuple[str, str]]] = []
        out: dict[str, FieldCheck] = {}
        for req in requests:
            pairs = self._pairs(req)
            if not pairs and extra_documents and req.key in extra_documents:
                pairs = [(n, req.claim_value, None) for n in extra_documents[req.key] if n in self.documents]
            for name, value, page in pairs:
                claim = claim_build(req.field_name, value, req.subject_name or "The recipient", self.documents[name].form_type)
                if claim is not None and req.subject_name:
                    plan.append((req.key, name, value, page, claim))
            out[req.key] = FieldCheck(check="conflicted" if req.value is not None and req.value.conflict else "not_checked")

        if plan and engine_get() is not None:
            try:
                results = relations_check([(self.documents[name].text, claim[0], claim[1]) for _, name, _, _, claim in plan])
            except ValidatorUnavailable:
                self.validator_unavailable = True
                results = None
            if results is not None:
                for (key, name, value, page, _), result in zip(plan, results):
                    out[key].documents.append(DocumentResult(document=name, page=page, value=value, check=result))
        elif plan and backend_name() != "none":
            # Load failure (not a deliberate DECISION_BACKEND=none) is reported to the caller.
            self.validator_unavailable = True

        for req in requests:
            fc = out[req.key]
            if req.value is not None and req.value.conflict:
                fc.check = "conflicted"
            elif fc.documents:
                fc.check = checks_combine([d.check for d in fc.documents])
        return out
