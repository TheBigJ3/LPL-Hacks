from __future__ import annotations

import copy
import json

import pytest
from fastapi.testclient import TestClient

from rapid_analysis import api as api_module
from rapid_analysis.contract import Enums, FindingEvidence, Overview, OverviewResult
from tests.support.fixtures import FIXTURE_IDS, fixture_household_documents, fixture_household_raw, fixture_overview_request, fixture_textract
from rapid_analysis.documents import decision_request, document_decision
from rapid_analysis.overview import overview_build

FORBIDDEN = ["score", "probabilit", "entail", "backend", "modernbert", "moritzlaurer", "opendecision", "logit"]


@pytest.fixture
def client():
    with TestClient(api_module.app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def client_off(backend_none):
    with TestClient(api_module.app, raise_server_exceptions=False) as c:
        yield c


def overview_of(client, household_id):
    response = client.post("/v1/overview", json=fixture_overview_request(household_id))
    assert response.status_code == 200, response.text
    return response.json()


# ---------------------------------------------------------------- shapes (model off: deterministic)


def test_health(client_off):
    body = client_off.get("/health").json()
    assert body == {"status": "ok", "model_loaded": False, "device": "none", "ruleset_version": "2025.2", "schema_version": "1.1"}


def test_health_degraded_when_the_model_fails_to_load(isolated_engine):
    def broken():
        raise RuntimeError("no CUDA")

    isolated_engine.setattr("rapid_analysis.engine._factory", broken)
    with TestClient(api_module.app) as c:
        body = c.get("/health").json()
    assert body["status"] == "degraded" and body["model_loaded"] is False


def test_enums(client_off):
    body = client_off.get("/v1/meta/enums").json()
    Enums.model_validate(body)
    assert body["check"] == ["verified", "mismatch", "unconfirmed", "conflicted", "not_checked"]
    assert body["answer"] == ["yes", "no", "needs_data", "not_assessed"]
    assert body["priority"] == ["informational", "low", "medium", "high"]
    assert body["status"] == ["findings", "no_findings", "needs_review"]
    assert body["category"] == ["retirement", "tax", "hsa", "cash_management", "life_event", "data_quality"]
    assert body["checklist_label"] == "Flags for review, not advice"


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_overview_equals_builder(client_off, household_id):
    body = overview_of(client_off, household_id)
    OverviewResult.model_validate(body)
    expected = overview_build(fixture_household_raw(household_id), fixture_household_documents(household_id))
    assert body == {"overview": expected.overview, "evidence": expected.evidence}


def test_overview_is_stateless(client_off):
    """Nothing is kept between calls: new data in the request is reflected immediately."""
    first = overview_of(client_off, "HH001")["overview"]
    request = fixture_overview_request("HH001")
    request["household"]["members"][0]["employee_401k_contribution"]["value"] = 23500
    updated = client_off.post("/v1/overview", json=request).json()["overview"]
    retire = next(i for i in updated["checklist"] if i["id"] == "retirement_can_improve")
    assert retire["dollar_impact"] == 19000
    assert overview_of(client_off, "HH001")["overview"] == first


def test_evidence_comes_with_the_overview(client_off):
    body = overview_of(client_off, "HH004")
    evidence = body["evidence"]["F1"]
    FindingEvidence.model_validate(evidence)
    assert evidence["values"][0]["field"] == "wages" and evidence["check"] == "conflicted"
    assert set(body["evidence"]) == {f["id"] for f in body["overview"]["findings"]}


def test_overview_without_documents(client_off):
    response = client_off.post("/v1/overview", json={"household": fixture_household_raw("HH001")})
    assert response.status_code == 200
    numbers = [n for m in response.json()["overview"]["members"] for n in m["numbers"]]
    assert numbers and all(n["check"] == "not_checked" for n in numbers)


# ---------------------------------------------------------------- auth


def test_token_required_when_set(client_off, backend_none):
    backend_none.setenv("ANALYSIS_SERVICE_TOKEN", "s3cret")
    body = fixture_overview_request("HH001")
    response = client_off.post("/v1/overview", json=body)
    assert response.status_code == 401
    assert response.json()["status"] == "unauthorized" and response.json()["errors"][0]["code"] == "unauthorized"
    assert client_off.post("/v1/overview", json=body, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client_off.get("/v1/meta/enums").status_code == 401
    assert client_off.post("/v1/overview", json=body, headers={"Authorization": "Bearer s3cret"}).status_code == 200
    assert client_off.get("/health").status_code == 200  # probes never need the token


def test_no_token_configured_means_open(client_off):
    assert client_off.get("/v1/meta/enums").status_code == 200


# ---------------------------------------------------------------- bad inputs never 500

BASE = {"household_id": "HHBAD", "tax_year": 2025, "filing_status": "single", "adjusted_gross_income": 50000,
        "cash_balance": 1000, "members": [{"person_id": "P1", "name": "Bad Input", "wages": 50000, "employee_401k_contribution": 1000}],
        "documents": [{"name": "w2.pdf", "type": "W-2"}]}


def with_(**changes):
    raw = copy.deepcopy(BASE)
    raw.update(changes)
    return raw


def member_with(**changes):
    raw = copy.deepcopy(BASE)
    raw["members"][0].update(changes)
    return raw


BAD_INPUTS = {
    "empty household": ({}, "missing_household_id"),
    "missing tax_year": ({k: v for k, v in BASE.items() if k != "tax_year"}, "missing_tax_year"),
    "string for number": (with_(adjusted_gross_income="lots"), "invalid_money"),
    "string tax_year": (with_(tax_year="twenty"), "invalid_tax_year"),
    "negative contribution": (member_with(employee_401k_contribution=-500), "negative_value"),
    "duplicate documents": (with_(documents=[{"name": "w2.pdf"}, {"name": "w2.pdf"}]), "duplicate_document"),
    "duplicate member": (with_(members=[BASE["members"][0], BASE["members"][0]]), "duplicate_member"),
    "document with no name": (with_(documents=[{"type": "W-2"}]), "document_missing_name"),
    "values above 1e9": (member_with(wages=5e9), "value_out_of_range"),
    "all-null profile": ({"household_id": "HHNULL", "tax_year": 2025, "filing_status": None, "adjusted_gross_income": None,
                          "dependents": None, "cash_balance": None, "mortgage_interest": None,
                          "members": [{"person_id": "P1", "name": "Nul", **{f: None for f in ("wages", "employee_401k_contribution")}}]},
                         "empty_profile"),
    "array household": ([1, 2, 3], "invalid_household"),
    "members not a list": (with_(members="John"), "invalid_members"),
    "dict where number expected": (member_with(wages={"value": {"nested": 1}}), "invalid_money"),
    "bool where money expected": (member_with(wages=True), "invalid_money"),
    "bad confidence": (member_with(wages={"value": 1, "textract_confidence": 250}), "invalid_confidence"),
    "bad page": (member_with(wages={"value": 1, "page": "one"}), "invalid_page"),
}


@pytest.mark.parametrize("name", list(BAD_INPUTS))
def test_bad_inputs_are_coded_422(client_off, name):
    raw, code = BAD_INPUTS[name]
    response = client_off.post("/v1/overview", json={"household": raw})
    assert response.status_code == 422, response.text
    body = response.json()
    assert body["status"] == "needs_review"
    assert code in [e["code"] for e in body["errors"]]
    assert all({"code", "path", "message", "severity"} <= set(e) for e in body["errors"])


def test_malformed_json(client_off):
    response = client_off.post("/v1/overview", content=b'{"household_id": "HHX", "tax_year": 20', headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    assert response.json()["errors"][0]["code"] == "malformed_json"
    response = client_off.post("/v1/overview", content=b"\xff\xfe", headers={"Content-Type": "application/json"})
    assert response.status_code == 422


@pytest.mark.parametrize("payload", [
    '{"household": {"household_id": "HHN", "tax_year": 2025, "adjusted_gross_income": NaN, "members": []}}',
    '{"household": {"household_id": "HHN", "tax_year": 2025, "members": [{"person_id": "P1", "name": "N", "wages": Infinity}]}}',
    '{"household": {"household_id": "HHN", "tax_year": 2025, "dependents": NaN, "cash_balance": 1}}',
    '{"household": {"household_id": "HHN", "tax_year": NaN, "cash_balance": 1}}',
])
def test_nan_and_infinity(client_off, payload):
    response = client_off.post("/v1/overview", content=payload.encode(), headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    assert response.json()["status"] == "needs_review"
    json.loads(response.text)  # the error body itself is valid JSON (no NaN leaked)


def test_body_must_be_an_object(client_off):
    for body in (b"[1]", b'"x"', b"null"):
        response = client_off.post("/v1/overview", content=body, headers={"Content-Type": "application/json"})
        assert response.status_code == 422 and response.json()["errors"][0]["code"] == "invalid_request"


def test_body_too_large(client_off, backend_none):
    backend_none.setenv("ANALYSIS_MAX_BODY_BYTES", "100")
    response = client_off.post("/v1/overview", json=fixture_overview_request("HH001"))
    assert response.status_code == 413 and response.json()["errors"][0]["code"] == "body_too_large"


def test_valid_household_overview(client_off):
    response = client_off.post("/v1/overview", json={"household": BASE})
    assert response.status_code == 200
    overview = response.json()["overview"]
    Overview.model_validate(overview)
    assert overview["status"] == "findings"


def test_documents_as_textract_and_as_text(client_off):
    body = {"household": fixture_household_raw("HH010"),
            "documents": [{"name": "alex_example_1099r_2026.pdf", "textract": fixture_textract("alex_example_1099r_2026.pdf")}]}
    assert client_off.post("/v1/overview", json=body).status_code == 200
    body = {"household": BASE,
            "documents": [{"name": "w2.pdf", "text": "Form W-2 for Bad Input. 1 Wages: 50,000.00. SSN 000-00-0000", "form_type": "W-2"}]}
    response = client_off.post("/v1/overview", json=body)
    assert response.status_code == 200
    assert "000-00-0000" not in response.text


@pytest.mark.parametrize("document,code", [
    ({"text": "x"}, "document_missing_name"),
    ({"name": "a.pdf"}, "invalid_document"),
    ({"name": "a.pdf", "text": "x", "textract": {"Blocks": []}}, "invalid_document"),
    ({"name": "a.pdf", "textract": {"Pages": 1}}, "invalid_textract"),
    ({"name": "a.pdf", "text": "   "}, "invalid_text"),
    ({"name": "a.pdf", "text": "x", "form_type": 3}, "invalid_form_type"),
    ([1], "invalid_document"),
])
def test_bad_documents_are_coded_422(client_off, document, code):
    response = client_off.post("/v1/overview", json={"household": BASE, "documents": [document]})
    assert response.status_code == 422
    errors = response.json()["errors"]
    assert code in [e["code"] for e in errors]
    assert all(e["path"].startswith("documents[0]") for e in errors)


def test_documents_not_a_list_and_duplicates(client_off):
    response = client_off.post("/v1/overview", json={"household": BASE, "documents": {"name": "a.pdf"}})
    assert [e["code"] for e in response.json()["errors"]] == ["invalid_documents"]
    twice = [{"name": "a.pdf", "text": "Form W-2"}, {"name": "a.pdf", "text": "Form W-2"}]
    response = client_off.post("/v1/overview", json={"household": BASE, "documents": twice})
    assert response.status_code == 422
    assert [(e["code"], e["path"]) for e in response.json()["errors"]] == [("duplicate_document", "documents[1].name")]


def test_household_and_document_errors_are_reported_together(client_off):
    response = client_off.post("/v1/overview", json={"household": {}, "documents": [{"text": "x"}]})
    assert response.status_code == 422
    assert [(e["code"], e["path"]) for e in response.json()["errors"]] == [
        ("document_missing_name", "documents[0].name"), ("missing_household_id", "household.household_id")]


def test_garbage_textract_blocks_do_not_500(client_off):
    garbage = {"Blocks": [{"BlockType": "KEY_VALUE_SET", "Id": "k", "EntityTypes": ["KEY"],
                           "Relationships": [{"Type": "VALUE", "Ids": ["missing"]}, {"Type": "CHILD", "Ids": ["w"]}]},
                          {"BlockType": "WORD", "Id": "w", "Text": "Wages"}, {"no": "id"}]}
    response = client_off.post("/v1/overview", json={"household": fixture_household_raw("HH001"),
                                                     "documents": [{"name": "junk.pdf", "textract": garbage}]})
    assert response.status_code in (200, 422)


# ---------------------------------------------------------------- model failure


def test_model_failure_overview_still_returns(isolated_engine):
    class Broken:
        def relations(self, **kwargs):
            raise RuntimeError("CUDA error")

    isolated_engine.setattr("rapid_analysis.engine._factory", Broken)
    with TestClient(api_module.app, raise_server_exceptions=False) as c:
        response = c.post("/v1/overview", json=fixture_overview_request("HH001"))
        assert response.status_code == 200
        body = response.json()["overview"]
        assert body["status"] == "findings"
        assert [e["code"] for e in body["errors"]] == ["validator_unavailable"]
        numbers = [n for m in body["members"] for n in m["numbers"]]
        assert numbers and all(n["check"] == "not_checked" for n in numbers)


def test_swagger_loads(client_off):
    response = client_off.get("/docs")
    assert response.status_code == 200 and "swagger" in response.text.lower()
    spec = client_off.get("/openapi.json").json()
    assert set(spec["paths"]) == {"/health", "/v1/meta/enums", "/v1/overview", "/v1/documents/decision"}
    for name in ("OverviewRequest", "DocumentInput", "DocumentDecisionRequest", "OverviewResult"):
        assert name in spec["components"]["schemas"], name
    assert spec["paths"]["/v1/overview"]["post"]["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/OverviewRequest"}


# ---------------------------------------------------------------- model on


@pytest.mark.model
def test_health_model_loaded(client, loaded_engine):
    body = client.get("/health").json()
    assert body["status"] == "ok" and body["model_loaded"] is True and body["device"] in ("cuda", "cpu", "mps")


@pytest.mark.model
@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_overview_equals_builder_model_on(client, loaded_engine, household_id):
    body = overview_of(client, household_id)
    expected = overview_build(fixture_household_raw(household_id), fixture_household_documents(household_id))
    assert body == {"overview": expected.overview, "evidence": expected.evidence}
    text = json.dumps(body).lower()
    for word in FORBIDDEN:
        assert word not in text


# ---------------------------------------------------------------- raw document decision (RAG team)

RAW_TEAMMATE_SHAPE = {  # the keys the RAG team built against (the raw_decision sample)
    "choice": {"type", "choice", "probabilities", "confidence", "evidence"},
    "noul": {"type", "mode", "answer", "status", "binary", "three_way", "evidence"},
    "binary": {"answer", "probabilities", "confidence"},
    "three_way": {"answer", "relation", "scores"},
    "evidence": {"id", "text", "relevance"},
}


TAYLOR = {"first_name": "Taylor", "last_name": "Mock", "person_id": "HH006-P1"}
SAM = {"first_name": "Sam", "last_name": "Mock"}


def taylor_w2_request():
    return {"document": {"name": "taylor_w2_2025.pdf", "textract": fixture_textract("taylor_w2_2025.pdf")}, "members": [TAYLOR, SAM]}


def test_raw_decision_needs_the_model(client_off):
    response = client_off.post("/v1/documents/decision", json=taylor_w2_request())
    assert response.status_code == 503
    assert response.json()["errors"][0]["code"] == "validator_unavailable"


@pytest.mark.parametrize("members,code,path", [
    (None, "invalid_members", "members"),
    (["x"], "invalid_member", "members[0]"),
    ([{"last_name": "Mock"}], "invalid_name", "members[0].first_name"),
    ([{"first_name": "Taylor", "last_name": " "}], "invalid_name", "members[0].last_name"),
    ([{"first_name": "Taylor", "last_name": "Mock", "suffix": 3}], "invalid_name", "members[0].suffix"),
    ([TAYLOR, {"first_name": "taylor", "last_name": "MOCK"}], "duplicate_member", "members[1]"),
])
def test_raw_decision_bad_members_are_coded_422(client_off, members, code, path):
    body = {"document": {"name": "a.pdf", "text": "Form W-2"}, "members": members}
    response = client_off.post("/v1/documents/decision", json=body)
    assert response.status_code == 422
    assert (code, path) in [(e["code"], e["path"]) for e in response.json()["errors"]]


def test_raw_decision_bad_document_is_coded_422(client_off):
    response = client_off.post("/v1/documents/decision", json={"members": [TAYLOR]})
    assert response.status_code == 422 and response.json()["errors"][0]["code"] == "invalid_document"


def test_raw_decision_groups_answers_by_kind(isolated_engine):
    """Members come back under member_<first>_<middle>_<last>_<suffix>, in the order sent."""
    isolated_engine.setattr("rapid_analysis.engine._factory", lambda: object())

    def fake_decide(text, members):
        questions = decision_request(text, members)["questions"]
        return {"chunks": 1, "answers": {key: {"type": q["type"], "instructions": q["instructions"]} for key, q in questions.items()}}

    isolated_engine.setattr(api_module, "document_decision", lambda n, t, m: document_decision(n, t, m, decide=fake_decide))
    members = [{"first_name": "Taylor", "middle_name": "Ann", "last_name": "Mock", "suffix": "Jr."}, SAM]
    body = {"document": {"name": "grouping.pdf", "text": "Form W-2 for Taylor Ann Mock Jr. 1 Wages: 1.00"}, "members": members}
    with TestClient(api_module.app) as c:
        response = c.post("/v1/documents/decision", json=body)
    assert response.status_code == 200
    out = response.json()
    assert list(out) == ["docType", "tags", "members"]
    assert out["docType"]["type"] == "choice"
    assert list(out["tags"]) == ["tag_tax", "tag_income"]
    assert list(out["members"]) == ["member_taylor_ann_mock_jr", "member_sam_mock"]
    assert out["members"]["member_taylor_ann_mock_jr"]["instructions"] == "This document concerns Taylor Ann Mock Jr."


@pytest.mark.model
def test_raw_decision_shape_and_consistency(client, loaded_engine):
    body = client.post("/v1/documents/decision", json=taylor_w2_request()).json()
    assert list(body) == ["docType", "tags", "members"]
    assert list(body["tags"]) == ["tag_tax", "tag_income"]
    assert list(body["members"]) == ["member_taylor_mock", "member_sam_mock"]
    assert set(body["docType"]) >= RAW_TEAMMATE_SHAPE["choice"] and body["docType"]["type"] == "choice"
    assert body["docType"]["choice"] == "w2"
    for a in [*body["tags"].values(), *body["members"].values()]:
        assert a["type"] == "document_noul" and a["mode"] == "both"
        assert set(a) >= RAW_TEAMMATE_SHAPE["noul"]
        assert set(a["binary"]) >= RAW_TEAMMATE_SHAPE["binary"] and set(a["three_way"]) >= RAW_TEAMMATE_SHAPE["three_way"]
        assert all(set(e) >= RAW_TEAMMATE_SHAPE["evidence"] for e in a["evidence"])
    # the raw answers are the ones the strict decision used
    overview = overview_of(client, "HH006")["overview"]
    doc = next(d for d in overview["tags"]["documents"] if d["name"] == "taylor_w2_2025.pdf")
    confirmed = {"tag_tax": "tax", "tag_income": "income"}
    assert doc["model_tags"] == [t for k, t in confirmed.items()
                                 if body["tags"][k]["status"] == "confirmed" and body["tags"][k]["answer"] is True]
    # raw scores stay out of the advisor-facing overview
    assert "probabilit" not in json.dumps(overview).lower()


# ---------------------------------------------------------------- SageMaker


def test_sagemaker_routes_are_off_outside_sagemaker(client_off):
    assert client_off.get("/ping").status_code == 404
    assert client_off.post("/invocations", json={}).status_code == 404


def invoke(client, operation, body=None):
    headers = {"X-Amzn-SageMaker-Custom-Attributes": f"operation={operation}"} if operation else {}
    return client.post("/invocations", json=body if body is not None else {}, headers=headers)


def test_sagemaker_invocations_route_by_custom_attribute(client_off, backend_none):
    backend_none.setenv("SAGEMAKER_MODE", "1")
    backend_none.setenv("ANALYSIS_SERVICE_TOKEN", "s3cret")  # IAM guards the endpoint; the token is not needed
    assert client_off.get("/ping").status_code == 200
    request = fixture_overview_request("HH006")
    assert invoke(client_off, "overview", request).json() == client_off.post(
        "/v1/overview", json=request, headers={"Authorization": "Bearer s3cret"}).json()
    assert invoke(client_off, "decision", taylor_w2_request()).status_code == 503  # model off
    assert invoke(client_off, "enums").json()["checklist_label"] == "Flags for review, not advice"
    assert invoke(client_off, "health").json()["status"] == "ok"
    bad = invoke(client_off, "overview", {"household": {}})
    assert bad.status_code == 422 and bad.json()["errors"][0]["code"] == "missing_household_id"
    for operation in (None, "ask"):
        response = invoke(client_off, operation)
        assert response.status_code == 422 and response.json()["errors"][0]["code"] == "invalid_operation"


def test_sagemaker_ping_fails_when_the_model_did_not_load(isolated_engine):
    def broken():
        raise RuntimeError("no CUDA")

    isolated_engine.setattr("rapid_analysis.engine._factory", broken)
    isolated_engine.setenv("SAGEMAKER_MODE", "1")
    with TestClient(api_module.app) as c:
        assert c.get("/ping").status_code == 503
