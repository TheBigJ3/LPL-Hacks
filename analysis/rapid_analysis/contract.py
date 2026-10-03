"""The overview contract (schema 1.0). The frontend renders this object directly.

Checklist answers are flags for review, not advice. Nothing here exposes OpenDecision internals:
the only model-derived field anywhere is `check`.
"""

from __future__ import annotations

from typing import Literal, Union

from pydantic import BaseModel, ConfigDict, Field

from rapid_analysis import RULESET_VERSION, SCHEMA_VERSION

Check = Literal["verified", "mismatch", "unconfirmed", "conflicted", "not_checked"]
Answer = Literal["yes", "no", "needs_data", "not_assessed"]
Priority = Literal["informational", "low", "medium", "high"]
Status = Literal["findings", "no_findings", "needs_review"]
Category = Literal["retirement", "tax", "hsa", "cash_management", "life_event", "data_quality"]
Severity = Literal["error", "warning"]
Scalar = Union[bool, int, float, str, None]

CHECKLIST_LABEL = "Flags for review, not advice"

CHECK_DESCRIPTIONS: dict[str, str] = {
    "verified": "Matches its document",
    "mismatch": "Document says otherwise",
    "unconfirmed": "Not found in the document",
    "conflicted": "Documents disagree",
    "not_checked": "No document or checker off",
}


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CheckedValue(_Model):
    value: Scalar = None
    check: Check = "not_checked"
    source_document: str | None = None
    page: int | None = None


class CashValue(CheckedValue):
    months_of_income: float | None = None


class Summary(_Model):
    filing_status: str | None
    dependents: int | None
    dependents_check: Check = "not_checked"
    agi: CheckedValue
    cash: CashValue
    mortgage_interest: CheckedValue


class SourceCandidate(_Model):
    value: Scalar
    source_document: str | None
    page: int | None


class MemberNumber(_Model):
    field: str
    label: str
    value: Scalar
    check: Check
    source_document: str | None = None
    page: int | None = None
    context: str | None = None
    candidates: list[SourceCandidate] | None = None


class MemberCard(_Model):
    person_id: str
    name: str | None
    employer: str | None
    numbers: list[MemberNumber]


class ChecklistItem(_Model):
    id: str
    question: str
    answer: Answer
    reason: str
    dollar_impact: float | int | None
    finding_ids: list[str]


class Change(_Model):
    type: str
    text: str


class Finding(_Model):
    id: str
    type: str
    category: Category
    priority: Priority
    headline: str
    explanation: str
    dollar_impact: float | int | None
    member: str | None
    person_id: str | None
    action_label: str
    check: Check


class Conflict(_Model):
    field: str
    label: str
    member: str | None
    person_id: str | None
    candidates: list[SourceCandidate]


class LowConfidenceField(_Model):
    field: str
    label: str
    member: str | None
    person_id: str | None
    value: Scalar
    textract_confidence: float
    source_document: str | None
    page: int | None


class MissingDocument(_Model):
    type: str
    member: str | None
    person_id: str | None
    description: str


class DataQuality(_Model):
    documents: int = 0
    conflicts: list[Conflict] = Field(default_factory=list)
    low_confidence_fields: list[LowConfidenceField] = Field(default_factory=list)
    unchecked_values: int = 0
    missing_documents: list[MissingDocument] = Field(default_factory=list)


class ErrorItem(_Model):
    code: str
    path: str
    message: str
    severity: Severity = "error"


class Overview(_Model):
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    ruleset_version: str = RULESET_VERSION
    household_id: str | None
    tax_year: int | None
    status: Status
    priority: Priority | None
    checklist_label: Literal["Flags for review, not advice"] = CHECKLIST_LABEL
    summary: Summary | None
    members: list[MemberCard]
    checklist: list[ChecklistItem]
    changes_since_last_year: list[Change]
    findings: list[Finding]
    data_quality: DataQuality
    errors: list[ErrorItem]


class EvidenceDocumentCheck(_Model):
    document: str
    page: int | None
    value: Scalar
    check: Literal["verified", "mismatch", "unconfirmed"]


class EvidenceValue(_Model):
    key: str
    field: str
    label: str
    member: str | None
    value: Scalar
    check: Check
    documents: list[EvidenceDocumentCheck]


class FindingEvidence(_Model):
    household_id: str
    finding_id: str
    headline: str
    check: Check
    values: list[EvidenceValue]
