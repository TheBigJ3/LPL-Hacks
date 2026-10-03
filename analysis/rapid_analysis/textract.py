"""Textract AnalyzeDocument (FORMS) ingestion: Blocks -> fields -> canonical values + evidence text.

Mirrors backend/services/extraction/extractedFieldMethods.ts:
KEY_VALUE_SET(KEY) --VALUE--> KEY_VALUE_SET(VALUE) --CHILD--> WORD / SELECTION_ELEMENT,
value confidence = min of the value's child confidences, empty placeholders ("$", "%") are no value.

Evidence text rules (§4):
- label: value lines built from KEY_VALUE_SET pairs, never raw LINE order
- prefixed "Form <type> for <recipient> (<document>). Every amount on this form belongs to <recipient>."
- printed form title omitted; checkboxes rendered as "yes, this box is checked" / "no, this box is not checked"
- TINs, SSNs, account numbers, street address / city / ZIP redacted before text reaches the model, store or logs
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Iterable

from rapid_analysis.normalization import HOUSEHOLD_FIELDS, MEMBER_FIELDS, NormError, normalize_field

PLACEHOLDER = re.compile(r"^[\s$%/\\()_.\-–—]*$")
FIELD_KINDS = {**MEMBER_FIELDS, **HOUSEHOLD_FIELDS}


@dataclass
class TextractField:
    label: str
    page: int
    text: str | None  # words only, None when the value region is empty
    selected: bool | None  # set when the value is exactly one checkbox
    confidence: float | None  # 0-1


@dataclass
class TextractDocument:
    form_type: str | None
    fields: list[TextractField]
    lines: list[str]


@dataclass
class EvidenceDocument:
    """What the service keeps for one document. Already redacted; safe to store and log."""

    name: str
    form_type: str | None
    recipient: str | None
    text: str
    values: dict[str, dict[str, Any]] = field(default_factory=dict)  # canonical field -> FieldValue dict


# ---------------------------------------------------------------- Blocks


def _related(block: dict, kind: str, by_id: dict[str, dict]) -> list[dict]:
    return [
        by_id[i]
        for rel in block.get("Relationships") or []
        if rel.get("Type") == kind
        for i in rel.get("Ids") or []
        if i in by_id
    ]


def textract_parse_blocks(response: dict) -> TextractDocument:
    blocks = response.get("Blocks") or []
    by_id = {b["Id"]: b for b in blocks if isinstance(b, dict) and "Id" in b}
    fields: list[TextractField] = []
    for key in blocks:
        if key.get("BlockType") != "KEY_VALUE_SET" or "KEY" not in (key.get("EntityTypes") or []):
            continue
        label = " ".join(
            c["Text"] for c in _related(key, "CHILD", by_id) if c.get("BlockType") == "WORD" and c.get("Text")
        ).strip()
        if not label:
            continue
        value_blocks = _related(key, "VALUE", by_id)
        children = [c for v in value_blocks for c in _related(v, "CHILD", by_id)]
        words = [c["Text"] for c in children if c.get("BlockType") == "WORD" and c.get("Text")]
        selections = [c for c in children if c.get("BlockType") == "SELECTION_ELEMENT"]
        confidences = [c["Confidence"] for c in children if isinstance(c.get("Confidence"), (int, float))]
        text = " ".join(words).strip() or None
        selected = selections[0].get("SelectionStatus") == "SELECTED" if len(selections) == 1 and not words else None
        fields.append(TextractField(
            label=label,
            page=key.get("Page") or 1,
            text=text,
            selected=selected,
            confidence=round(min(confidences) / 100.0, 4) if confidences else None,
        ))
    lines = [b.get("Text", "") for b in blocks if b.get("BlockType") == "LINE"]
    return TextractDocument(form_type=_detect_form(fields, lines), fields=fields, lines=lines)


_FORM_PATTERNS = [
    ("1099-R", re.compile(r"\b1099-?R\b", re.I)),
    ("1099-INT", re.compile(r"\b1099-?INT\b", re.I)),
    ("W-2", re.compile(r"\bW-?2\b", re.I)),
    ("1098", re.compile(r"\b1098\b")),
    ("1040", re.compile(r"\b1040\b")),
    ("account_statement", re.compile(r"\baccount statement\b", re.I)),
    ("1095", re.compile(r"\b1095(?:-[ABC])?\b|\bhealth coverage\b", re.I)),
]


def _detect_form(fields: list[TextractField], lines: list[str]) -> str | None:
    candidates = [f.text or "" for f in fields if _key(f.label) == "form"] + lines
    for text in candidates:
        for name, pattern in _FORM_PATTERNS:
            if pattern.search(text):
                return name
    return None


# ---------------------------------------------------------------- canonical mapping


def _key(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", label.lower()).strip()


# (form, label regex on normalized label) -> canonical member field
CANONICAL_LABELS: dict[str, list[tuple[re.Pattern[str], str]]] = {
    "1099-R": [
        (re.compile(r"^1 gross distribution"), "retirement_distribution"),
        (re.compile(r"^2a taxable amount$"), "retirement_distribution_taxable"),
        (re.compile(r"^4 federal income tax withheld"), "federal_tax_withheld"),
        (re.compile(r"^7a? dist(ribution)? code"), "distribution_code"),
        (re.compile(r"^7b ira sep simple"), "distribution_from_ira"),
        (re.compile(r"^13 date of payment"), "distribution_date"),
        (re.compile(r"^14 state tax withheld"), "state_tax_withheld"),
    ],
    "W-2": [
        (re.compile(r"^1 wages tips other comp"), "wages"),
        (re.compile(r"^2 federal income tax withheld"), "federal_tax_withheld"),
        (re.compile(r"^17 state income tax"), "state_tax_withheld"),
        (re.compile(r"^c employer s name"), "employer"),
    ],
    "1040": [
        (re.compile(r"^1a total amount from form s w 2"), "wages"),
        (re.compile(r"^8 business income"), "self_employment_income"),
        (re.compile(r"^11 adjusted gross income"), "adjusted_gross_income"),
        (re.compile(r"^number of dependents"), "dependents"),
    ],
    "account_statement": [
        (re.compile(r"^ending balance"), "cash_balance"),
    ],
    "1098": [
        (re.compile(r"^1 mortgage interest received"), "mortgage_interest"),
    ],
    "1095": [
        (re.compile(r"^hsa eligible high deductible health plan"), "hsa_eligible_health_plan"),
    ],
}
RECIPIENT_LABELS = {
    "1099-R": re.compile(r"^recipient s name"),
    "W-2": re.compile(r"^e employee s (first )?name"),
    "1040": re.compile(r"^your first name"),
    "account_statement": re.compile(r"^account holder"),
    "1098": re.compile(r"^payer s borrower s name"),
    "1095": re.compile(r"^covered member"),
}
# W-2 box 12 holds "<code> <amount>"; D = 401(k) elective deferrals, W = employer + employee HSA.
W2_BOX12 = re.compile(r"^12[a-d]\b")
W2_BOX12_CODES = {"D": "employee_401k_contribution", "W": "hsa_contribution"}

FORM_TITLE_LABELS = re.compile(r"^(form|omb no|copy [a-z]|department of the treasury)\b")
SENSITIVE_LABELS = re.compile(
    r"\b(tin|ssn|social security|ein|identification number|account number|account no|control number|"
    r"street|address|city|town|zip|postal|state country|payer s state no|state id|employer s state id|"
    r"telephone|phone)\b"
)


def _cut_address(text: str) -> str:
    """Payer/employer name values run into the street address on box-style forms: keep the name only."""
    tokens = text.split()
    kept: list[str] = []
    for token in tokens:
        if re.match(r"^\d", token):
            break
        kept.append(token)
    return " ".join(kept).rstrip(",")


def _canonical_value(form: str, canonical: str, f: TextractField) -> Any:
    if FIELD_KINDS.get(canonical) == "bool":
        return f.selected
    if f.text is None or PLACEHOLDER.match(f.text):
        return None
    if canonical == "employer":
        return _cut_address(f.text) or None
    return f.text


def textract_canonical_values(doc: TextractDocument, document_name: str) -> tuple[str | None, dict[str, dict]]:
    """-> (recipient name, {canonical field: FieldValue dict}). Empty boxes produce no field."""
    form = doc.form_type or ""
    recipient = None
    values: dict[str, dict] = {}

    def put(canonical: str, value: Any, f: TextractField) -> None:
        if value is None or canonical in values:
            return
        values[canonical] = {
            "value": value,
            "source_document": document_name,
            "page": f.page,
            "textract_confidence": f.confidence,
            "verified": False,
        }

    for f in doc.fields:
        key = _key(f.label)
        pattern = RECIPIENT_LABELS.get(form)
        if pattern and pattern.match(key) and f.text and recipient is None:
            recipient = _cut_address(f.text) or None
            continue
        if form == "W-2" and W2_BOX12.match(key) and f.text:
            match = re.match(r"^\s*([A-Za-z]{1,2})\s+(.*\d.*)$", f.text)
            if match and match.group(1).upper() in W2_BOX12_CODES:
                put(W2_BOX12_CODES[match.group(1).upper()], match.group(2), f)
            continue
        for label_pattern, canonical in CANONICAL_LABELS.get(form, []):
            if label_pattern.match(key):
                put(canonical, _canonical_value(form, canonical, f), f)
                break
    return recipient, values


# ---------------------------------------------------------------- redaction + evidence text

_REDACTIONS = [
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[redacted SSN]"),
    (re.compile(r"\b\d{2}-\d{7}\b"), "[redacted TIN]"),
    (re.compile(r"\b\*{3,}\d{2,4}\b"), "[redacted account]"),
    (re.compile(r"\b[A-Z]{2,}(?:-[A-Z0-9]+)*-\d[A-Z0-9-]*\b"), "[redacted account]"),
    (re.compile(r"\b(?:acct|account)\s*(?:no\.?|number|#)\s*[:#]?\s*(?=[A-Z0-9*-]*\d)[A-Z0-9*-]{4,}", re.I), "[redacted account]"),
    (re.compile(r"\b\d{1,6}\s+(?:[A-Z][A-Za-z]*\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Plaza|Blvd|Boulevard|Lane|Ln|Drive|Dr|Way|Court|Ct|Place|Pl)\b\.?(?:,?\s*(?:Suite|Ste|Apt|Unit)\.?\s*[\w-]+)?", re.I), "[redacted address]"),
    (re.compile(r",?\s*[A-Z][A-Za-z .]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b"), " [redacted address]"),
    (re.compile(r"\b[A-Z]{2}\s*/\s*[A-Z]{2,3}\s*/\s*\d{5}(?:-\d{4})?\b"), "[redacted address]"),
    (re.compile(r"\(\d{3}\)\s*\d{3}-\d{4}"), "[redacted phone]"),
]


def redact(text: str) -> str:
    for pattern, replacement in _REDACTIONS:
        text = pattern.sub(replacement, text)
    return re.sub(r"[ \t]+", " ", text).strip()


W2_BOX12_LABELS = {
    "D": "401(k) elective deferrals",
    "E": "403(b) elective deferrals",
    "W": "employer and employee contributions to a health savings account (HSA)",
    "DD": "cost of employer-sponsored health coverage",
}


def _render_value(f: TextractField) -> str | None:
    if f.selected is not None:
        return "yes, this box is checked" if f.selected else "no, this box is not checked"
    if f.text is None or PLACEHOLDER.match(f.text):
        return None
    return f.text


def _render_line(form: str | None, f: TextractField) -> str | None:
    key = _key(f.label)
    value = _render_value(f)
    if value is None:
        return None
    if re.match(r"^(payer s name|c employer s name|recipient s lender s name)", key):
        name = _cut_address(value)
        who = "Employer" if key.startswith("c ") else "Lender" if key.startswith("recipient") else "Payer"
        return f"{who}'s name: {name}." if name else None
    if FORM_TITLE_LABELS.match(key) or SENSITIVE_LABELS.search(key):
        return None
    if form == "W-2" and W2_BOX12.match(key):
        match = re.match(r"^\s*([A-Za-z]{1,2})\s+(.*\d.*)$", value)
        if match:
            code = match.group(1).upper()
            meaning = W2_BOX12_LABELS.get(code, "other")
            amount = match.group(2).strip()
            amount = amount if amount.startswith("$") else f"$ {amount}"
            return f"{f.label[:3].strip()} Code {code} ({meaning}): {amount}."
    return f"{f.label}: {value}."


_FORM_NAMES = {"account_statement": "Account statement", "1040": "Form 1040", "W-2": "Form W-2",
               "1099-R": "Form 1099-R", "1099-INT": "Form 1099-INT", "1098": "Form 1098",
               "1095": "Form 1095 (health coverage)"}


def evidence_render(doc: TextractDocument, document_name: str, recipient: str | None) -> str:
    who = recipient or "the recipient"
    title = _FORM_NAMES.get(doc.form_type or "", "Document")
    noun = "form" if title.startswith("Form") else "document"
    lines = [f"{title} for {who} ({document_name}). Every amount on this {noun} belongs to {who}."]
    lines += [line for f in doc.fields if (line := _render_line(doc.form_type, f))]
    return "\n".join(redact(line) for line in lines)


def evidence_from_textract(response: dict, document_name: str) -> EvidenceDocument:
    doc = textract_parse_blocks(response)
    recipient, values = textract_canonical_values(doc, document_name)
    return EvidenceDocument(
        name=document_name,
        form_type=doc.form_type,
        recipient=recipient,
        text=evidence_render(doc, document_name, recipient),
        values=values,
    )


def evidence_from_text(text: str, document_name: str, form_type: str | None = None) -> EvidenceDocument:
    """Pre-rendered evidence text from the pipeline: still redacted before it is kept."""
    return EvidenceDocument(name=document_name, form_type=form_type, recipient=None, text=redact(text))


def textract_member_fields(documents: Iterable[EvidenceDocument]) -> tuple[dict[str, Any], list[NormError]]:
    """Several documents -> normalized fields; disagreement between documents becomes a conflict."""
    by_field: dict[str, list[dict]] = {}
    for d in documents:
        for name, fv in d.values.items():
            by_field.setdefault(name, []).append(fv)
    errors: list[NormError] = []
    merged = {
        name: normalize_field(items, FIELD_KINDS[name], name, errors)
        for name, items in by_field.items()
    }
    return merged, errors
