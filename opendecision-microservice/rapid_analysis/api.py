"""FastAPI service: stateless household analysis for the platform backend.

The backend owns the data. Every call carries everything it needs (a household and its documents) and
nothing is stored between requests. The only process state is the
loaded model and its memo of answers, which keeps a repeated request fast.

Run:  uvicorn rapid_analysis.api:app --host 0.0.0.0 --port 8100
Set ANALYSIS_SERVICE_TOKEN anywhere the port is reachable: /v1 then requires `Authorization: Bearer <token>`.
"""

from __future__ import annotations

import hmac
import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import APIRouter, Depends, FastAPI, Request, Security
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from rapid_analysis import RULESET_VERSION, SCHEMA_VERSION, contract
from rapid_analysis.documents import MemberRef, document_decision, member_key
from rapid_analysis.engine import engine_info, engine_load
from rapid_analysis.evidence import CHECK_VALUES
from rapid_analysis.normalization import DOC_TYPE_IDS, FILING_STATUS_ALIASES, normalize_household
from rapid_analysis.overview import overview_build_household
from rapid_analysis.rules import ANSWER_VALUES, CATEGORY_VALUES, CHANGE_TYPES, CHECKLIST_QUESTIONS, PRIORITY_VALUES, STATUS_VALUES
from rapid_analysis.settings import decision_backend, max_body_bytes, sagemaker_mode, service_token
from rapid_analysis.taxonomy import config_check, document_tags, tags
from rapid_analysis.textract import EvidenceDocument, evidence_from_text, evidence_from_textract

log = logging.getLogger("rapid_analysis.api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    config_check()  # a broken config file stops startup with a clear message
    engine_load()  # once per process, at startup; never per request
    if service_token() is None:
        log.warning("ANALYSIS_SERVICE_TOKEN is unset: /v1 accepts unauthenticated requests")
    yield


app = FastAPI(
    title="Household Rapid Analysis",
    version=SCHEMA_VERSION,
    description=("Stateless household analysis for the platform backend. Checklist answers are flags for review, not advice. "
                 "Every displayed number carries a check: verified / mismatch / unconfirmed / conflicted / not_checked."),
    lifespan=lifespan,
)


# ---------------------------------------------------------------- errors


class Unauthorized(Exception):
    pass


def _error(code: str, message: str, path: str = "") -> dict:
    return {"code": code, "path": path, "message": message, "severity": "error"}


def _needs_review(errors: list[dict], status_code: int = 422) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"status": "needs_review", "errors": errors})


@app.exception_handler(RequestValidationError)
async def _validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [_error("invalid_request", str(e.get("msg", "invalid")), ".".join(str(p) for p in e.get("loc", ()))) for e in exc.errors()]
    return _needs_review(errors)


@app.exception_handler(Unauthorized)
async def _unauthorized_handler(_: Request, __: Unauthorized) -> JSONResponse:
    return JSONResponse(status_code=401, headers={"WWW-Authenticate": "Bearer"}, content={
        "status": "unauthorized", "errors": [_error("unauthorized", "missing or wrong service token")]})


async def _read_json(request: Request) -> tuple[Any, JSONResponse | None]:
    body = await request.body()
    limit = max_body_bytes()
    if len(body) > limit:
        return None, _needs_review([_error("body_too_large", f"body is larger than {limit} bytes")], 413)
    try:
        return json.loads(body), None
    except (ValueError, UnicodeDecodeError) as err:
        return None, _needs_review([_error("malformed_json", f"body is not valid JSON: {type(err).__name__}")])


# ---------------------------------------------------------------- auth

_bearer = HTTPBearer(auto_error=False)


def _authorize(credentials: HTTPAuthorizationCredentials | None = Security(_bearer)) -> None:
    token = service_token()
    if token is None:
        return
    if credentials is None or not hmac.compare_digest(credentials.credentials.encode("utf-8"), token.encode("utf-8")):
        raise Unauthorized()


v1 = APIRouter(prefix="/v1", dependencies=[Depends(_authorize)], responses={401: {"model": contract.ErrorResponse}})


def _body(model: type) -> dict:
    """openapi_extra documenting a request body the handler parses by hand."""
    return {"requestBody": {"required": True, "content": {"application/json": {
        "schema": {"$ref": f"#/components/schemas/{model.__name__}"}}}}}


# ---------------------------------------------------------------- reading inputs


def _document_read(item: Any, path: str) -> tuple[EvidenceDocument | None, list[dict]]:
    """One {name, textract} or {name, text, form_type?} -> redacted evidence, or coded errors."""
    if not isinstance(item, dict):
        return None, [_error("invalid_document", "document must be a JSON object", path)]
    errors = []
    name = item.get("name")
    if not isinstance(name, str) or not name.strip():
        errors.append(_error("document_missing_name", "document has no name", f"{path}.name"))
    textract, text = item.get("textract"), item.get("text")
    if (textract is None) == (text is None):
        errors.append(_error("invalid_document", "send exactly one of textract or text", path))
    elif textract is not None and not (isinstance(textract, dict) and isinstance(textract.get("Blocks"), list)):
        errors.append(_error("invalid_textract", "textract must be an AnalyzeDocument response with Blocks", f"{path}.textract"))
    elif text is not None and (not isinstance(text, str) or not text.strip()):
        errors.append(_error("invalid_text", "text must be non-empty", f"{path}.text"))
    form_type = item.get("form_type")
    if form_type is not None and not isinstance(form_type, str):
        errors.append(_error("invalid_form_type", "form_type must be text", f"{path}.form_type"))
    if errors:
        return None, errors
    try:
        if textract is not None:
            return evidence_from_textract(textract, name.strip()), []
        return evidence_from_text(text, name.strip(), form_type), []
    except Exception:  # an input shape nothing anticipated: report it, never 500
        log.exception("document ingestion raised")
        return None, [_error("unprocessable", "document could not be read", path)]


def _documents_read(items: Any) -> tuple[dict[str, EvidenceDocument], list[dict]]:
    if items is None:
        return {}, []
    if not isinstance(items, list):
        return {}, [_error("invalid_documents", "documents must be a list", "documents")]
    documents: dict[str, EvidenceDocument] = {}
    errors: list[dict] = []
    for index, item in enumerate(items):
        doc, doc_errors = _document_read(item, f"documents[{index}]")
        errors += doc_errors
        if doc is None:
            continue
        if doc.name in documents:
            errors.append(_error("duplicate_document", f"document {doc.name} is listed twice", f"documents[{index}].name"))
        documents[doc.name] = doc
    return documents, errors


NAME_FIELDS = (("first_name", True), ("middle_name", False), ("last_name", True), ("suffix", False), ("person_id", False))


def _member_read(item: Any, path: str) -> tuple[MemberRef | None, list[dict]]:
    """{first_name, last_name, middle_name?, suffix?, person_id?} -> a member, or coded errors."""
    if not isinstance(item, dict):
        return None, [_error("invalid_member", "member must be a JSON object", path)]
    parts: dict[str, str | None] = {}
    errors = []
    for field, required in NAME_FIELDS:
        value = item.get(field)
        if isinstance(value, str) and value.strip():
            parts[field] = value.strip()
        elif value is not None and not isinstance(value, str):
            errors.append(_error("invalid_name", f"{field} must be text", f"{path}.{field}"))
        elif required:
            errors.append(_error("invalid_name", f"{field} is required", f"{path}.{field}"))
        else:
            parts[field] = None
    if errors:
        return None, errors
    return MemberRef(parts["person_id"] or "", parts["first_name"], parts["last_name"], parts["middle_name"], parts["suffix"]), []


def _members_read(items: Any) -> tuple[list[MemberRef], list[dict]]:
    if not isinstance(items, list):
        return [], [_error("invalid_members", "members must be a list", "members")]
    members: list[MemberRef] = []
    errors: list[dict] = []
    for index, item in enumerate(items):
        member, member_errors = _member_read(item, f"members[{index}]")
        errors += member_errors
        if member is None:
            continue
        if any(member_key(m) == member_key(member) for m in members):
            errors.append(_error("duplicate_member", f"two members have the same name ({member_key(member)})", f"members[{index}]"))
            continue
        members.append(member)
    return members, errors


# ---------------------------------------------------------------- meta


@app.get("/health", response_model=contract.Health, tags=["meta"])
def health() -> dict:
    """Liveness and model state. Open (no token) so orchestrators can probe it."""
    info = engine_info()
    degraded = decision_backend() != "none" and not info["model_loaded"]
    return {"status": "degraded" if degraded else "ok", "model_loaded": info["model_loaded"], "device": info["device"],
            "ruleset_version": RULESET_VERSION, "schema_version": SCHEMA_VERSION}


@v1.get("/meta/enums", response_model=contract.Enums, tags=["meta"])
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
        "document_tags": document_tags(),
        "severity": ["error", "warning"],
        "filing_status": sorted(set(FILING_STATUS_ALIASES.values())),
        "checklist": [{"id": k, "question": v} for k, v in CHECKLIST_QUESTIONS.items()],
        "checklist_label": contract.CHECKLIST_LABEL,
        "tags": tags(),
    }


# ---------------------------------------------------------------- analysis


@v1.post("/overview", response_model=contract.OverviewResult, tags=["analysis"],
         responses={422: {"model": contract.ErrorResponse}}, openapi_extra=_body(contract.OverviewRequest))
async def overview(request: Request):
    """Household + its documents -> the overview and, per finding, which document confirmed which number.

    An overview whose errors include `validator_unavailable` was built with the model off or failing: show it,
    but build it again later instead of keeping it as final.
    """
    body, error = await _read_json(request)
    if error is not None:
        return error
    if not isinstance(body, dict):
        return _needs_review([_error("invalid_request", "body must be a JSON object")])
    documents, errors = _documents_read(body.get("documents"))
    try:
        normalized = normalize_household(body.get("household"))
    except Exception:  # an input shape nothing anticipated: report it, never 500
        log.exception("household normalization raised")
        return _needs_review(errors + [_error("unprocessable", "household could not be read", "household")])
    errors += [_error(e.code, e.message, f"household.{e.path}" if e.path else "household") for e in normalized.errors]
    if errors or normalized.household is None:
        return _needs_review(errors or [_error("invalid_household", "household could not be read", "household")])
    build = overview_build_household(normalized.household, documents)
    return {"overview": build.overview, "evidence": build.evidence}


@v1.post("/documents/decision", response_model=contract.RawDocumentDecision, tags=["raw"],
         responses={422: {"model": contract.ErrorResponse}, 503: {"model": contract.ErrorResponse}},
         openapi_extra=_body(contract.DocumentDecisionRequest))
async def document_raw_decision(request: Request):
    """RAW OpenDecision answers for one document, grouped so each kind can be iterated: `docType`, `tags`
    (tag_<name>, from config/document_tags.json) and `members` (member_<first>_<middle>_<last>_<suffix>, one per member sent).
    The same response the strict document decision used.

    Probabilities and scores are uncalibrated. For audit and RAG experiments only; the overview never
    uses this. 503 when the model is off or failing (no answers to show).
    """
    body, error = await _read_json(request)
    if error is not None:
        return error
    if not isinstance(body, dict):
        return _needs_review([_error("invalid_request", "body must be a JSON object")])
    doc, errors = _document_read(body.get("document"), "document")
    members, member_errors = _members_read(body.get("members"))
    errors += member_errors
    if errors or doc is None:
        return _needs_review(errors)
    decision = document_decision(doc.name, doc.text, members)
    if decision.response is None:
        return JSONResponse(status_code=503, content={"status": "needs_review", "errors": [{
            "code": "validator_unavailable", "path": "document", "severity": "error",
            "message": "The decision model is off or failing; no raw answers for this document"}]})
    answers = decision.response.get("answers") or {}
    return {
        "docType": answers.get("docType") or {},
        "tags": {key: answer for key, answer in answers.items() if key.startswith("tag_")},
        "members": {key: answer for key, answer in answers.items() if key.startswith("member_")},
    }


app.include_router(v1)

# ---------------------------------------------------------------- SageMaker
# A SageMaker endpoint talks to its container on two fixed routes. They exist only in SageMaker mode
# (the `serve` script), where SageMaker's IAM auth stands in for the service token.

SAGEMAKER_OPERATIONS = ("overview", "decision", "enums", "health")


def _operation(request: Request) -> str | None:
    """InvokeEndpoint(CustomAttributes="operation=overview") arrives as this header."""
    attributes = request.headers.get("x-amzn-sagemaker-custom-attributes", "")
    for part in attributes.replace(";", ",").split(","):
        key, _, value = part.partition("=")
        if key.strip() == "operation":
            return value.strip()
    return None


@app.get("/ping", include_in_schema=False)
def sagemaker_ping():
    if not sagemaker_mode():
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    body = health()
    return JSONResponse(status_code=200 if body["status"] == "ok" else 503, content=body)


@app.post("/invocations", include_in_schema=False)
async def sagemaker_invocations(request: Request):
    """The body is exactly what the matching /v1 route takes; CustomAttributes picks the route."""
    if not sagemaker_mode():
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    operation = _operation(request)
    if operation == "overview":
        return await overview(request)
    if operation == "decision":
        return await document_raw_decision(request)
    if operation == "enums":
        return enums()
    if operation == "health":
        return health()
    return _needs_review([_error("invalid_operation", f"CustomAttributes must be operation=<{' | '.join(SAGEMAKER_OPERATIONS)}>",
                                 "CustomAttributes")])

# ---------------------------------------------------------------- OpenAPI

REQUEST_MODELS = (contract.OverviewRequest, contract.DocumentDecisionRequest)


def _openapi() -> dict:
    """FastAPI's spec plus the hand-parsed request bodies, so the backend can generate client types from it."""
    if app.openapi_schema is None:
        schema = get_openapi(title=app.title, version=app.version, description=app.description, routes=app.routes)
        components = schema.setdefault("components", {}).setdefault("schemas", {})
        for model in REQUEST_MODELS:
            body = model.model_json_schema(ref_template="#/components/schemas/{model}")
            for name, definition in body.pop("$defs", {}).items():
                components.setdefault(name, definition)
            components[model.__name__] = body
        app.openapi_schema = schema
    return app.openapi_schema


app.openapi = _openapi
