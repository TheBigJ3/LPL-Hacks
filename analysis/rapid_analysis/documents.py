"""STRICT document type, tags and member relevance (amendment §3).

A document type, tag or member assignment is set only when certain. Only an unknown type or an
unsettled owner makes a document needs_review (REVIEW_REASONS); an uncertain tag, a model-only member
yes or a model doc-type disagreement is a note and leaves status alone. Decisions:
- doc_type: form-number patterns on the text. The model's docType is only ever a suggestion.
- tags: tags.json doc_types[].topics apply deterministically; a model tag counts only when its
  status is "confirmed".
- members: name matching decides. The model may only VETO a name-matched member
  (confirmed + answer false). A model-only YES never assigns anyone.

The model is called in-process through OpenDecision's DocumentDecisionService, one call per document,
with the redacted label: value text. The raw response is kept on the decision and served only by the raw
decision endpoint (GET .../documents/{name}/decision); the overview and frontend never carry it.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import threading
from dataclasses import dataclass, field
from typing import Any, Callable, Mapping, Sequence

from rapid_analysis.engine import ValidatorUnavailable, engine_call, engine_get
from rapid_analysis.taxonomy import tag_by_id
from rapid_analysis.textract import redact

log = logging.getLogger("rapid_analysis.documents")

DOC_TYPE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"form w-2|wage and tax statement", re.I), "w2"),
    (re.compile(r"1099-int", re.I), "1099_int"),
    (re.compile(r"1099-r\b", re.I), "1099_r"),
    (re.compile(r"1099-div", re.I), "1099_div"),
    (re.compile(r"1099-nec", re.I), "1099_nec"),
    (re.compile(r"form 1040", re.I), "1040"),
    (re.compile(r"form 1098", re.I), "1098"),
    (re.compile(r"5498-sa", re.I), "5498_sa"),
    (re.compile(r"form 1095", re.I), "1095"),
    (re.compile(r"account statement|statement period", re.I), "account_statement"),
]
OTHER_1099 = re.compile(r"\b1099-([A-Z]{1,4})\b", re.I)

DOC_TYPE_CRITERIA = {
    "w2": "IRS Form W-2 wage and tax statement",
    "1099": "IRS Form 1099 of any variant",
    "1040": "IRS Form 1040 individual income tax return",
    "1098": "IRS Form 1098 mortgage interest statement",
    "bank_statement": "A bank or brokerage account statement",
    "other": "None of the listed document types",
}
MODEL_DOC_TYPE = {"w2": "w2", "1040": "1040", "1098": "1098", "bank_statement": "account_statement", "other": "unknown"}
MODEL_DISAGREE_PROBABILITY = 0.90
TAG_QUESTIONS = {
    "tag_tax": ("tax", "This document is tax-related."),
    "tag_earnings": ("income", "This document reports employment earnings or wages."),
}
# The only reasons that make a document needs_review. Everything else the classifier records is a note.
REVIEW_REASONS = ("doc_type_unknown", "member_ambiguous", "member_unassigned", "member_model_disagrees")
FINANCIAL_VALUE = re.compile(r"\$\s?\d|\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b")


@dataclass(frozen=True)
class MemberRef:
    person_id: str
    name: str


@dataclass
class DocumentDecision:
    """The §3.3 per-document result plus the internal log (never sent to the frontend)."""

    result: dict[str, Any]
    logged: list[str] = field(default_factory=list)
    model_failed: bool = False
    response: dict[str, Any] | None = None  # the raw OpenDecision response this decision was made from


# ---------------------------------------------------------------- the model call (§3.1)


def _member_key(member: MemberRef) -> str:
    return "member_" + "_".join(re.sub(r"[^a-z0-9]+", " ", member.name.lower()).split())


def decision_request(text: str, members: Sequence[MemberRef]) -> dict[str, Any]:
    questions: dict[str, Any] = {
        "docType": {"type": "choice", "instructions": "Which document type is this?", "criteria": dict(DOC_TYPE_CRITERIA)},
        **{key: {"type": "noul", "instructions": instructions} for key, (_, instructions) in TAG_QUESTIONS.items()},
    }
    for member in members:
        questions[_member_key(member)] = {"type": "noul", "instructions": f"This document concerns {member.name}."}
    return {"document": text, "noul_mode": "both", "top_k": 4, "chunk_tokens": 384, "questions": questions}


def _decide_in_process(engine: Any, body: dict[str, Any]) -> dict[str, Any]:
    """The /v1/documents/decide handler, run in-process (no second server)."""
    from opendecision.documents import DocumentDecisionService

    service = DocumentDecisionService(engine, top_k=body["top_k"], chunk_tokens=body["chunk_tokens"])
    chunks = service.chunks(body["document"])
    answers = {}
    for name, question in body["questions"].items():
        if question["type"] == "choice":
            answers[name] = service.choice(chunks=chunks, instructions=question["instructions"], criteria=question["criteria"])
        else:
            answers[name] = service.noul(chunks=chunks, instructions=question["instructions"], criteria=None, mode=body["noul_mode"])
    return {"chunks": len(chunks), "answers": answers}


def document_decide(text: str, members: Sequence[MemberRef]) -> dict[str, Any] | None:
    """One model call for one document. None when the model is off; raises ValidatorUnavailable on failure."""
    if engine_get() is None:
        return None
    body = decision_request(text, members)
    response = engine_call(lambda engine: _decide_in_process(engine, body))
    log.debug("document decision %s", json.dumps(response, default=str)[:2000])
    return response


# ---------------------------------------------------------------- tolerant parsing


def _get(obj: Any, *path: str) -> Any:
    for key in path:
        if not isinstance(obj, Mapping):
            return None
        obj = obj.get(key)
    return obj


def _noul(response: Mapping[str, Any] | None, key: str) -> tuple[str | None, Any]:
    """-> (status, answer) for a document_noul answer; (None, None) when absent or malformed."""
    answer = _get(response, "answers", key)
    if not isinstance(answer, Mapping):
        return None, None
    status = answer.get("status") if isinstance(answer.get("status"), str) else None
    value = answer.get("answer") if isinstance(answer.get("answer"), bool) else None
    return status, value


def _model_doc_type(response: Mapping[str, Any] | None) -> tuple[str | None, float | None]:
    choice = _get(response, "answers", "docType", "choice")
    if not isinstance(choice, str):
        return None, None
    probability = _get(response, "answers", "docType", "probabilities", choice)
    return choice, float(probability) if isinstance(probability, (int, float)) else None


# ---------------------------------------------------------------- deterministic rules (§3.2)


def _tokens(text: str) -> list[str]:
    text = re.sub(r"'s\b", "", text.lower().replace("’", "'"))
    return [t for t in re.sub(r"[^a-z0-9]+", " ", text).split() if len(t) > 1]


def _contains(tokens: list[str], phrase: list[str]) -> bool:
    n = len(phrase)
    return n > 0 and any(tokens[i:i + n] == phrase for i in range(len(tokens) - n + 1))


def doc_type_detect(text: str) -> tuple[str, str | None]:
    """-> (doc_type, doc_subtype). First matching pattern wins; unlisted 1099 variants are unknown."""
    for pattern, doc_type in DOC_TYPE_PATTERNS:
        if pattern.search(text):
            return doc_type, None
    other = OTHER_1099.search(text)
    if other:
        return "unknown", f"1099-{other.group(1).upper()}"
    return "unknown", None


def members_match(text: str, members: Sequence[MemberRef]) -> tuple[list[MemberRef], list[MemberRef]]:
    """-> (fully matched members, ambiguous members). A surname/initial-only match is ambiguous only
    when nobody with that surname is fully matched."""
    tokens = _tokens(text)
    full, surname_only = [], []
    for member in members:
        parts = _tokens(member.name)
        if len(parts) < 2:
            continue
        if _contains(tokens, [parts[0], parts[-1]]):
            full.append(member)
        elif parts[-1] in tokens:
            surname_only.append(member)
    matched_surnames = {_tokens(m.name)[-1] for m in full}
    ambiguous = [m for m in surname_only if _tokens(m.name)[-1] not in matched_surnames]
    return full, ambiguous


def document_classify(name: str, text: str, members: Sequence[MemberRef], response: Mapping[str, Any] | None) -> DocumentDecision:
    """Pure: the §3.2 decision rules over the document text and (optionally) one model response."""
    reasons: list[str] = []
    logged: list[str] = []
    match_text = text.replace(name, " ")

    doc_type, doc_subtype = doc_type_detect(match_text)
    method = "pattern" if doc_type != "unknown" else "none"
    model_choice, model_probability = _model_doc_type(response)
    model_type = None
    if model_choice == "1099":
        model_type = doc_type if doc_type.startswith("1099_") else "unknown"
    elif model_choice is not None:
        model_type = MODEL_DOC_TYPE.get(model_choice, "unknown")
    suggested = None
    if doc_type == "unknown":
        reasons.append("doc_type_unknown")
        if model_type is not None:
            suggested = {"doc_type": model_type, "model_choice": model_choice, "probability": model_probability}
    elif model_type is not None and model_type != doc_type and (model_probability or 0) >= MODEL_DISAGREE_PROBABILITY:
        reasons.append("doc_type_model_disagrees")

    topics = list(tag_by_id("doc_types")[doc_type]["topics"])
    model_tags: list[str] = []
    if response is not None:
        for key, (topic, _) in TAG_QUESTIONS.items():
            status, answer = _noul(response, key)
            if status == "confirmed" and answer is True:
                model_tags.append(topic)
            elif not (status == "confirmed" and answer is False):
                reasons.append(f"tag_uncertain:{topic}")

    full, ambiguous = members_match(match_text, members)
    assigned = list(full)
    if response is not None:
        for member in full:
            status, answer = _noul(response, _member_key(member))
            if status == "confirmed" and answer is False:
                assigned.remove(member)
                reasons.append("member_model_disagrees")
                logged.append(f"member_model_disagrees:{member.person_id}")
        for member in members:
            if member in full:
                continue
            _, answer = _noul(response, _member_key(member))
            if answer is True:
                logged.append(f"member_model_only:{member.person_id}")
                reasons.append("member_model_only")
                log.info("ignored model-only member match %s on %s", member.person_id, name)

    if assigned:
        attribution = "assigned"
    elif ambiguous:
        attribution = "ambiguous"
        reasons.append("member_ambiguous")
    else:
        attribution = "unassigned"
        if FINANCIAL_VALUE.search(match_text):
            reasons.append("member_unassigned")
    role = "joint" if len(assigned) > 1 else "owner"

    reasons = list(dict.fromkeys(reasons))
    notes = [r for r in reasons if r not in REVIEW_REASONS]
    reasons = [r for r in reasons if r in REVIEW_REASONS]
    result = {
        "name": name,
        "doc_type": doc_type,
        "doc_subtype": doc_subtype,
        "doc_type_method": method,
        "suggested_doc_type": suggested,
        "topics": topics,
        "model_tags": model_tags,
        "members": [{"person_id": m.person_id, "name": m.name, "role": role, "method": "name_match"} for m in assigned],
        "attribution_status": attribution,
        "status": "needs_review" if reasons else "accepted",
        "review_reasons": reasons,
        "notes": notes,
    }
    return DocumentDecision(result=result, logged=logged)


# ---------------------------------------------------------------- cached entry point

_memo: dict[tuple[str, tuple[MemberRef, ...], bool], DocumentDecision] = {}
_memo_lock = threading.Lock()
Decider = Callable[[str, Sequence[MemberRef]], dict[str, Any] | None]


def documents_memo_clear() -> None:
    with _memo_lock:
        _memo.clear()


def document_decision(name: str, text: str, members: Sequence[MemberRef], decide: Decider = document_decide) -> DocumentDecision:
    """Classify one document for one household (memoized: classification happens once per document)."""
    text = redact(text)
    model_on = engine_get() is not None
    key = (hashlib.sha256((name + "\0" + text).encode("utf-8")).hexdigest(), tuple(members), model_on)
    with _memo_lock:
        cached = _memo.get(key)
    if cached is not None:
        return cached
    failed = False
    try:
        response = decide(text, members) if model_on else None
    except ValidatorUnavailable:
        response, failed = None, True
    decision = document_classify(name, text, members, response)
    decision.model_failed = failed
    decision.response = response
    if not failed:
        with _memo_lock:
            _memo[key] = decision
    return decision
