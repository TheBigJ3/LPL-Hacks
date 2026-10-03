"""The overview contract (schema 1.1). The frontend renders this object directly.

Checklist answers are flags for review, not advice. Nothing here exposes OpenDecision internals:
the only model-derived field anywhere is `check`.
"""

from __future__ import annotations

from typing import Any, Literal, Union

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
    metrics: dict[str, Any] = Field(default_factory=dict)  # the exact numbers the rule used
    rule: str = ""  # the threshold the rule applied, in plain English


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
    metrics: dict[str, Any] = Field(default_factory=dict)
    rule: str = ""


class PriorYearNumber(_Model):
    field: str
    label: str
    value: Scalar


class PriorYearMember(_Model):
    person_id: str
    name: str | None
    numbers: list[PriorYearNumber]


class PriorYear(_Model):
    """Last year's values as received (no documents, so never checked)."""

    tax_year: int | None
    filing_status: str | None
    numbers: list[PriorYearNumber]
    members: list[PriorYearMember]


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
    unassigned_documents: list[str] = Field(default_factory=list)
    documents_needing_review: list["DocumentReview"] = Field(default_factory=list)


class DocumentReview(_Model):
    name: str
    review_reasons: list[str]


class DocumentMember(_Model):
    person_id: str
    name: str
    role: Literal["owner", "joint", "mentioned"]
    method: Literal["name_match", "model", "manual"]


class SuggestedDocType(_Model):
    doc_type: str
    model_choice: str | None
    probability: float | None


class DocumentResult(_Model):
    """Amendment §3.3: the strict per-document decision."""

    name: str
    doc_type: str
    doc_subtype: str | None
    doc_type_method: Literal["pattern", "none"]
    suggested_doc_type: SuggestedDocType | None
    topics: list[str]
    model_tags: list[str]
    members: list[DocumentMember]
    attribution_status: Literal["assigned", "ambiguous", "unassigned"]
    status: Literal["accepted", "needs_review"]
    review_reasons: list[str]


class CheckCounts(_Model):
    verified: int = 0
    unconfirmed: int = 0
    mismatch: int = 0
    conflicted: int = 0
    not_checked: int = 0


class HouseholdTags(_Model):
    topics: list[str]
    categories_flagged: list[str]
    checklist_yes: list[str]
    checklist_not_assessed: list[str]
    life_events: list[str]
    data_quality: list[str]


class MemberTags(_Model):
    person_id: str
    name: str | None
    topics: list[str]
    fields_present: list[str]
    documents: list[str]
    findings: list[str]
    checks: CheckCounts


class Tags(_Model):
    household: HouseholdTags
    members: list[MemberTags]
    documents: list[DocumentResult]


class ErrorItem(_Model):
    code: str
    path: str
    message: str
    severity: Severity = "error"


class Overview(_Model):
    schema_version: Literal["1.1"] = SCHEMA_VERSION
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
    prior_year: PriorYear | None = None
    tags: Tags | None = None


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


# ---------------------------------------------------------------- API envelopes


class Health(_Model):
    status: Literal["ok"]
    model_loaded: bool
    device: str
    ruleset_version: str
    schema_version: str


class ChecklistQuestion(_Model):
    id: str
    question: str


class Enums(_Model):
    check: list[Check]
    check_descriptions: dict[str, str]
    answer: list[Answer]
    priority: list[Priority]
    status: list[Status]
    category: list[Category]
    change_type: list[str]
    doc_type: list[str]
    severity: list[Severity]
    filing_status: list[str]
    checklist: list[ChecklistQuestion]
    checklist_label: str
    tags: dict[str, Any]  # the full config/tags.json


class HouseholdRow(_Model):
    household_id: str
    tax_year: int | None
    members: list[str]
    status: Status
    priority: Priority | None
    findings: int
    needs_documents: bool
    top_finding: str | None
    dollar_impact: float | int


class HouseholdList(_Model):
    total: int
    households: list[HouseholdRow]


class Stats(_Model):
    households: int
    by_status: dict[str, int]
    by_priority: dict[str, int]
    findings_by_category: dict[str, int]
    checklist_yes: dict[str, int]
    needs_documents: int
    conflicts: int
    values_checked: int
    values_by_check: dict[str, int]
    dollar_impact: float | int


class IngestResult(_Model):
    household_id: str | None
    status: Literal["accepted", "needs_review"]
    errors: list[ErrorItem]


class DocumentIngestResult(_Model):
    household_id: str
    name: str
    doc_type: str
    fields: list[str]
    status: Literal["accepted"]


class ErrorResponse(_Model):
    status: Literal["needs_review", "not_found"]
    errors: list[ErrorItem]


class AskUnderstood(_Model):
    intent: str  # tags.json intents[].id
    person_id: str | None
    member: str | None
    field: str | None  # tags.json fields[].id
    time_ref: str  # tags.json time_refs[].id
    router: str


class AskValue(_Model):
    field: str | None
    value: Scalar
    check: Check
    source_document: str | None
    page: int | None


class AskAnswer(_Model):
    type: Literal["checklist", "value", "overview", "documents", "changes", "verify", "none"]
    short: str
    text: str
    dollar_impact: float | int | None
    values: list[AskValue]


class AskResponse(_Model):
    question: str
    understood: AskUnderstood
    answer: AskAnswer
    suggestions: list[str]


class RagChunk(BaseModel):
    """id "<HH>:<chunk_type>:<key>"; text is plain English; metadata follows tags.json rag_chunk_metadata."""

    id: str
    text: str
    metadata: dict[str, Any]


class RagChunks(_Model):
    household_id: str
    chunks: list[RagChunk]


DataQuality.model_rebuild()

