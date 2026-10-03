"""FastAPI service for the rapid analysis page (§7).

Run:  uvicorn rapid_analysis.api:app --host 127.0.0.1 --port 8100
No authentication: bind to localhost or put it behind the platform's auth before exposing it.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from rapid_analysis import RULESET_VERSION, SCHEMA_VERSION, contract
from rapid_analysis.ask import ask
from rapid_analysis.rag import rag_chunks
from rapid_analysis.engine import engine_info, engine_load
from rapid_analysis.evidence import CHECK_VALUES
from rapid_analysis.fixtures import FIXTURE_IDS, fixture_household_raw, fixture_household_textract
from rapid_analysis.normalization import DOC_TYPE_IDS, FILING_STATUS_ALIASES, normalize_household
from rapid_analysis.overview import overview_build
from rapid_analysis.rules import (
    ANSWER_VALUES,
    CATEGORY_VALUES,
    CHANGE_TYPES,
    CHECKLIST_QUESTIONS,
    PRIORITY_RANK,
    PRIORITY_VALUES,
    STATUS_VALUES,
)
from rapid_analysis.store import Store
from rapid_analysis.taxonomy import tags
from rapid_analysis.textract import evidence_from_text, evidence_from_textract

log = logging.getLogger("rapid_analysis.api")

STORE = Store()
CORS_ORIGINS = [o.strip() for o in os.environ.get("ANALYSIS_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
MAX_BODY_BYTES = int(os.environ.get("ANALYSIS_MAX_BODY_BYTES", str(5 * 1024 * 1024)))


def seed_fixtures(store: Store = STORE) -> list[str]:
    """Load every synthetic fixture household and its Textract documents into the store."""
    for household_id in FIXTURE_IDS:
        store.household_put(household_id, fixture_household_raw(household_id))
        for name, response in fixture_household_textract(household_id).items():
            store.document_put(household_id, evidence_from_textract(response, name))
    return list(FIXTURE_IDS)


@asynccontextmanager
async def lifespan(_: FastAPI):
    engine_load()  # once per process, at startup; never per request
    if os.environ.get("SEED_FIXTURES", "").lower() in ("1", "true", "yes"):
        seed_fixtures()
    yield


app = FastAPI(
    title="Household Rapid Analysis",
    version=SCHEMA_VERSION,
    description=("Quick-look overview of a household for advisors. Checklist answers are flags for review, not advice. "
                 "Every displayed number carries a check: verified / mismatch / unconfirmed / conflicted / not_checked."),
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


# ---------------------------------------------------------------- errors


def _error(code: str, message: str, path: str = "") -> dict:
    return {"code": code, "path": path, "message": message, "severity": "error"}


def _needs_review(errors: list[dict], status_code: int = 422) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"status": "needs_review", "errors": errors})


def _not_found(what: str, path: str) -> JSONResponse:
    return JSONResponse(status_code=404, content={"status": "not_found", "errors": [_error("not_found", f"{what} not found", path)]})


@app.exception_handler(RequestValidationError)
async def _validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [_error("invalid_request", str(e.get("msg", "invalid")), ".".join(str(p) for p in e.get("loc", ()))) for e in exc.errors()]
    return _needs_review(errors)


async def _read_json(request: Request) -> tuple[Any, JSONResponse | None]:
    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        return None, _needs_review([_error("body_too_large", f"body is larger than {MAX_BODY_BYTES} bytes")], 413)
    try:
        return json.loads(body), None
    except (ValueError, UnicodeDecodeError) as err:
        return None, _needs_review([_error("malformed_json", f"body is not valid JSON: {type(err).__name__}")])


# ---------------------------------------------------------------- overview cache


def _data_hash(raw: dict, household_id: str) -> str:
    digest = hashlib.sha256(json.dumps(raw, sort_keys=True, default=str).encode("utf-8"))
    for name, doc in sorted(STORE.documents_for(household_id).items()):
        digest.update(name.encode("utf-8"))
        digest.update(doc.text.encode("utf-8"))
    return digest.hexdigest()[:16]


def _build(household_id: str, refresh: bool = False) -> dict | None:
    """Cached by (household, ruleset_version, data hash). Computed on first open; refresh recomputes."""
    raw = STORE.household_get(household_id)
    if raw is None:
        return None
    key = (household_id, RULESET_VERSION, _data_hash(raw, household_id))
    if refresh:
        STORE.overview_bust(household_id)
    else:
        cached = STORE.overview_get(key)
        if cached is not None:
            return cached
    build = overview_build(raw, STORE.documents_for(household_id))
    entry = {"overview": build.overview, "evidence": build.evidence,
             "value_checks": build.value_checks, "textract_confidence": build.textract_confidence}
    # A transient model failure must not stick: only cache overviews whose checks actually ran.
    if not any(e["code"] == "validator_unavailable" for e in build.overview["errors"]):
        STORE.overview_put(key, entry)
    return entry


# ---------------------------------------------------------------- meta


@app.get("/health", response_model=contract.Health, tags=["meta"])
def health() -> dict:
    info = engine_info()
    return {"status": "ok", "model_loaded": info["model_loaded"], "device": info["device"],
            "ruleset_version": RULESET_VERSION, "schema_version": SCHEMA_VERSION}


@app.get("/api/meta/enums", response_model=contract.Enums, tags=["meta"])
def enums() -> dict:
    return {
        "check": list(CHECK_VALUES),
        "check_descriptions": contract.CHECK_DESCRIPTIONS,
        "answer": list(ANSWER_VALUES),
        "priority": list(PRIORITY_VALUES),
        "status": list(STATUS_VALUES),
        "category": list(CATEGORY_VALUES),
        "change_type": list(CHANGE_TYPES),
        "doc_type": list(DOC_TYPE_IDS),
        "severity": ["error", "warning"],
        "filing_status": sorted(set(FILING_STATUS_ALIASES.values())),
        "checklist": [{"id": k, "question": v} for k, v in CHECKLIST_QUESTIONS.items()],
        "checklist_label": contract.CHECKLIST_LABEL,
        "tags": tags(),
    }


# ---------------------------------------------------------------- households


def _row(entry: dict) -> dict:
    o = entry["overview"]
    docs = next((i for i in o["checklist"] if i["id"] == "needs_documents"), None)
    impact = sum(i["dollar_impact"] or 0 for i in o["checklist"] if i["answer"] == "yes")
    return {
        "household_id": o["household_id"], "tax_year": o["tax_year"],
        "members": [m["name"] for m in o["members"] if m["name"]],
        "status": o["status"], "priority": o["priority"],
        "findings": sum(1 for f in o["findings"] if PRIORITY_RANK[f["priority"]] >= PRIORITY_RANK["medium"]),
        "needs_documents": bool(docs and docs["answer"] == "yes"),
        "top_finding": o["findings"][0]["headline"] if o["findings"] else None,
        "dollar_impact": round(impact, 2),
    }


@app.get("/api/households", response_model=contract.HouseholdList, tags=["households"])
def households_list(
    q: str | None = Query(None, max_length=100, description="Matches household id or member name"),
    priority: Literal["informational", "low", "medium", "high"] | None = None,
    status: Literal["findings", "no_findings", "needs_review"] | None = None,
    needs_documents: bool | None = None,
) -> dict:
    rows = []
    for household_id in STORE.household_ids():
        entry = _build(household_id)
        if entry is None:
            continue
        row = _row(entry)
        if q and q.strip().casefold() not in " ".join([row["household_id"], *row["members"]]).casefold():
            continue
        if priority is not None and row["priority"] != priority:
            continue
        if status is not None and row["status"] != status:
            continue
        if needs_documents is not None and row["needs_documents"] != needs_documents:
            continue
        rows.append(row)
    return {"total": len(rows), "households": rows}


@app.post("/api/households", response_model=contract.IngestResult, tags=["ingest"],
          responses={422: {"model": contract.ErrorResponse}})
async def household_ingest(request: Request):
    raw, error = await _read_json(request)
    if error is not None:
        return error
    try:
        result = normalize_household(raw)
    except Exception:  # an input shape nothing anticipated: report it, never 500
        log.exception("household normalization raised")
        return _needs_review([_error("unprocessable", "household could not be read")])
    if result.errors or result.household is None:
        return _needs_review([_error(e.code, e.message, e.path) for e in result.errors])
    STORE.household_put(result.household.household_id, raw)
    return {"household_id": result.household.household_id, "status": "accepted", "errors": []}


@app.get("/api/households/{household_id}/overview", response_model=contract.Overview, tags=["households"],
         responses={404: {"model": contract.ErrorResponse}})
def household_overview(household_id: str):
    entry = _build(household_id)
    return entry["overview"] if entry else _not_found("household", household_id)


@app.post("/api/households/{household_id}/refresh", response_model=contract.Overview, tags=["households"],
          responses={404: {"model": contract.ErrorResponse}})
def household_refresh(household_id: str):
    entry = _build(household_id, refresh=True)
    return entry["overview"] if entry else _not_found("household", household_id)


@app.get("/api/households/{household_id}/members/{person_id}", response_model=contract.MemberCard, tags=["households"],
         responses={404: {"model": contract.ErrorResponse}})
def household_member(household_id: str, person_id: str):
    entry = _build(household_id)
    if entry is None:
        return _not_found("household", household_id)
    member = next((m for m in entry["overview"]["members"] if m["person_id"] == person_id), None)
    return member if member else _not_found("member", f"{household_id}/{person_id}")


@app.get("/api/households/{household_id}/findings/{finding_id}/evidence", response_model=contract.FindingEvidence,
         tags=["households"], responses={404: {"model": contract.ErrorResponse}})
def finding_evidence(household_id: str, finding_id: str):
    entry = _build(household_id)
    if entry is None:
        return _not_found("household", household_id)
    evidence = entry["evidence"].get(finding_id)
    return evidence if evidence else _not_found("finding", f"{household_id}/{finding_id}")


@app.post("/api/households/{household_id}/ask", response_model=contract.AskResponse, tags=["households"],
          responses={404: {"model": contract.ErrorResponse}, 422: {"model": contract.ErrorResponse}})
async def household_ask(household_id: str, request: Request):
    """Answer an advisor's question from this household's overview only (KeywordRouter; no model)."""
    body, error = await _read_json(request)
    if error is not None:
        return error
    question = body.get("question") if isinstance(body, dict) else None
    if not isinstance(question, str) or not question.strip() or len(question) > 500:
        return _needs_review([_error("invalid_question", "question must be 1-500 characters of text", "question")])
    entry = _build(household_id)
    if entry is None:
        return _not_found("household", household_id)
    if entry["overview"]["status"] == "needs_review":
        return _needs_review(entry["overview"]["errors"])
    return ask(question.strip(), entry["overview"])


@app.get("/api/households/{household_id}/rag-chunks", response_model=contract.RagChunks, tags=["households"],
         responses={404: {"model": contract.ErrorResponse}, 422: {"model": contract.ErrorResponse}})
def household_rag_chunks(household_id: str):
    """Plain-English chunks + filter metadata for a RAG. Model scores appear only in metadata.model_scores."""
    entry = _build(household_id)
    if entry is None:
        return _not_found("household", household_id)
    if entry["overview"]["status"] == "needs_review":
        return _needs_review(entry["overview"]["errors"])
    chunks = rag_chunks(entry["overview"], entry["evidence"], entry.get("value_checks"), entry.get("textract_confidence"))
    return {"household_id": household_id, "chunks": chunks}


@app.post("/api/households/{household_id}/documents", response_model=contract.DocumentIngestResult, tags=["ingest"],
          responses={404: {"model": contract.ErrorResponse}, 422: {"model": contract.ErrorResponse}})
async def document_ingest(household_id: str, request: Request):
    """Body: {"name": "...", "textract": <AnalyzeDocument response>} or {"name": "...", "text": "...", "form_type": "w2"}."""
    if STORE.household_get(household_id) is None:
        return _not_found("household", household_id)
    body, error = await _read_json(request)
    if error is not None:
        return error
    if not isinstance(body, dict):
        return _needs_review([_error("invalid_document", "body must be a JSON object")])
    errors = []
    name = body.get("name")
    if not isinstance(name, str) or not name.strip():
        errors.append(_error("document_missing_name", "document has no name", "name"))
    textract, text = body.get("textract"), body.get("text")
    if (textract is None) == (text is None):
        errors.append(_error("invalid_document", "send exactly one of textract or text"))
    elif textract is not None and not (isinstance(textract, dict) and isinstance(textract.get("Blocks"), list)):
        errors.append(_error("invalid_textract", "textract must be an AnalyzeDocument response with Blocks", "textract"))
    elif text is not None and (not isinstance(text, str) or not text.strip()):
        errors.append(_error("invalid_text", "text must be non-empty", "text"))
    form_type = body.get("form_type")
    if form_type is not None and not isinstance(form_type, str):
        errors.append(_error("invalid_form_type", "form_type must be text", "form_type"))
    if errors:
        return _needs_review(errors)
    try:
        doc = evidence_from_textract(textract, name.strip()) if textract is not None else evidence_from_text(text, name.strip(), form_type)
    except Exception:
        log.exception("document ingestion raised")
        return _needs_review([_error("unprocessable", "document could not be read")])
    STORE.document_put(household_id, doc)
    return {"household_id": household_id, "name": doc.name, "doc_type": doc.form_type or "unknown",
            "fields": sorted(doc.values), "status": "accepted"}


# ---------------------------------------------------------------- stats


@app.get("/api/stats/overview", response_model=contract.Stats, tags=["households"])
def stats_overview() -> dict:
    entries = [e for e in (_build(h) for h in STORE.household_ids()) if e]
    overviews = [e["overview"] for e in entries]
    by_check = {c: 0 for c in CHECK_VALUES}
    for o in overviews:
        values = [o["summary"][k] for k in ("agi", "cash", "mortgage_interest")] if o["summary"] else []
        values += [n for m in o["members"] for n in m["numbers"]]
        for v in values:
            if v["value"] is not None or v["check"] == "conflicted":
                by_check[v["check"]] += 1
    return {
        "households": len(overviews),
        "by_status": {s: sum(o["status"] == s for o in overviews) for s in STATUS_VALUES},
        "by_priority": {p: sum(o["priority"] == p for o in overviews) for p in PRIORITY_VALUES},
        "findings_by_category": {c: sum(f["category"] == c for o in overviews for f in o["findings"]) for c in CATEGORY_VALUES},
        "checklist_yes": {k: sum(1 for o in overviews for i in o["checklist"] if i["id"] == k and i["answer"] == "yes")
                          for k in CHECKLIST_QUESTIONS},
        "needs_documents": sum(_row(e)["needs_documents"] for e in entries),
        "conflicts": sum(len(o["data_quality"]["conflicts"]) for o in overviews),
        "values_checked": sum(n for c, n in by_check.items() if c != "not_checked"),
        "values_by_check": by_check,
        "dollar_impact": round(sum(_row(e)["dollar_impact"] for e in entries), 2),
    }
