from __future__ import annotations

import copy
import json

import pytest
from fastapi.testclient import TestClient

from rapid_analysis import api as api_module
from rapid_analysis.contract import Enums, FindingEvidence, HouseholdList, MemberCard, Overview, Stats
from rapid_analysis.fixtures import FIXTURE_IDS, fixture_household_documents, fixture_household_raw, fixture_textract
from rapid_analysis.overview import overview_build

FORBIDDEN = ["score", "probabilit", "entail", "backend", "modernbert", "moritzlaurer", "opendecision", "logit"]


@pytest.fixture
def client():
    api_module.STORE.clear()
    api_module.seed_fixtures()
    with TestClient(api_module.app, raise_server_exceptions=False) as c:
        yield c
    api_module.STORE.clear()


@pytest.fixture
def client_off(backend_none):
    api_module.STORE.clear()
    api_module.seed_fixtures()
    with TestClient(api_module.app, raise_server_exceptions=False) as c:
        yield c
    api_module.STORE.clear()


# ---------------------------------------------------------------- shapes (model off: deterministic)


def test_health(client_off):
    body = client_off.get("/health").json()
    assert body == {"status": "ok", "model_loaded": False, "device": "none", "ruleset_version": "2025.2", "schema_version": "1.1"}


def test_enums(client_off):
    body = client_off.get("/api/meta/enums").json()
    Enums.model_validate(body)
    assert body["check"] == ["verified", "mismatch", "unconfirmed", "conflicted", "not_checked"]
    assert body["answer"] == ["yes", "no", "needs_data", "not_assessed"]
    assert body["priority"] == ["informational", "low", "medium", "high"]
    assert body["status"] == ["findings", "no_findings", "needs_review"]
    assert body["category"] == ["retirement", "tax", "hsa", "cash_management", "life_event", "data_quality"]
    assert body["checklist_label"] == "Flags for review, not advice"


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_overview_equals_builder(client_off, household_id):
    response = client_off.get(f"/api/households/{household_id}/overview")
    assert response.status_code == 200
    Overview.model_validate(response.json())
    expected = overview_build(fixture_household_raw(household_id), fixture_household_documents(household_id)).overview
    assert response.json() == expected


def test_overview_cached_until_refresh_or_new_data(client_off):
    first = client_off.get("/api/households/HH001/overview").json()
    assert len(api_module.STORE.overviews) >= 1
    key = next(k for k in api_module.STORE.overviews if k[0] == "HH001")
    assert key[1] == "2025.2"
    assert client_off.get("/api/households/HH001/overview").json() == first
    refreshed = client_off.post("/api/households/HH001/refresh")
    assert refreshed.status_code == 200 and refreshed.json() == first

    raw = fixture_household_raw("HH001")
    raw["members"][0]["employee_401k_contribution"]["value"] = 23500
    assert client_off.post("/api/households", json=raw).status_code == 200
    updated = client_off.get("/api/households/HH001/overview").json()
    retire = next(i for i in updated["checklist"] if i["id"] == "retirement_can_improve")
    assert retire["dollar_impact"] == 19000


def test_member_card(client_off):
    body = client_off.get("/api/households/HH006/members/HH006-P1").json()
    MemberCard.model_validate(body)
    assert body["name"] == "Taylor Mock"
    assert client_off.get("/api/households/HH006/members/NOPE").status_code == 404


def test_evidence_endpoint(client_off):
    body = client_off.get("/api/households/HH004/findings/F1/evidence").json()
    FindingEvidence.model_validate(body)
    assert body["values"][0]["field"] == "wages" and body["check"] == "conflicted"
    assert client_off.get("/api/households/HH004/findings/F99/evidence").status_code == 404


def test_unknown_household_404(client_off):
    for path in ["/api/households/NOPE/overview", "/api/households/NOPE/members/X", "/api/households/NOPE/findings/F1/evidence"]:
        response = client_off.get(path)
        assert response.status_code == 404 and response.json()["status"] == "not_found"
    assert client_off.post("/api/households/NOPE/refresh").status_code == 404
    assert client_off.post("/api/households/NOPE/documents", json={"name": "a.pdf", "text": "x"}).status_code == 404


# ---------------------------------------------------------------- look-up and stats


def test_lookup_q_finds_mock(client_off):
    body = client_off.get("/api/households", params={"q": "Mock"}).json()
    HouseholdList.model_validate(body)
    assert [r["household_id"] for r in body["households"]] == ["HH006"]
    assert body["households"][0]["members"] == ["Taylor Mock", "Sam Mock"]
    assert [r["household_id"] for r in client_off.get("/api/households", params={"q": "hh00"}).json()["households"]] == FIXTURE_IDS[:9]


@pytest.mark.parametrize("params,expected", [
    ({"priority": "high"}, ["HH004", "HH005", "HH006", "HH009"]),
    ({"priority": "medium"}, ["HH001", "HH003", "HH008"]),
    ({"priority": "low"}, ["HH010"]),
    ({"status": "no_findings"}, ["HH002", "HH007", "HH010"]),
    ({"status": "needs_review"}, []),
    ({"needs_documents": "true"}, ["HH003", "HH004"]),
    ({"needs_documents": "false", "priority": "high"}, ["HH005", "HH006", "HH009"]),
    ({"q": "kim", "status": "no_findings"}, ["HH007"]),
])
def test_filters(client_off, params, expected):
    rows = client_off.get("/api/households", params=params).json()["households"]
    assert [r["household_id"] for r in rows] == expected
    for row in rows:
        for key in ("priority", "status"):
            if key in params:
                assert row[key] == params[key]


def test_bad_filter_is_422_not_500(client_off):
    response = client_off.get("/api/households", params={"priority": "urgent"})
    assert response.status_code == 422
    assert response.json()["status"] == "needs_review"
    assert response.json()["errors"][0]["code"] == "invalid_request"


HAND_COUNTS = {
    "households": 10,
    "by_status": {"findings": 7, "no_findings": 3, "needs_review": 0},
    "by_priority": {"informational": 0, "low": 1, "medium": 3, "high": 4},
    "findings_by_category": {"retirement": 4, "tax": 3, "hsa": 1, "cash_management": 1, "life_event": 5, "data_quality": 1},
    "checklist_yes": {"retirement_can_improve": 3, "tax_savings_possible": 2, "excess_cash": 1, "needs_documents": 2,
                      "major_changes": 2, "insurance_review": 0, "estate_review": 0, "education_review": 0},
    "needs_documents": 2,
    "conflicts": 1,
    "dollar_impact": 34300 + 21500 + 134000 + 14700 + 1200,
}


def test_stats_equal_hand_counts(client_off):
    body = client_off.get("/api/stats/overview").json()
    Stats.model_validate(body)
    assert {k: body[k] for k in HAND_COUNTS} == HAND_COUNTS
    assert body["values_checked"] == 1  # only the HH004 conflict counts as checked with the model off
    assert body["values_by_check"]["conflicted"] == 1


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
    "array body": ([1, 2, 3], "invalid_household"),
    "members not a list": (with_(members="John"), "invalid_members"),
    "dict where number expected": (member_with(wages={"value": {"nested": 1}}), "invalid_money"),
    "bool where money expected": (member_with(wages=True), "invalid_money"),
    "bad confidence": (member_with(wages={"value": 1, "textract_confidence": 250}), "invalid_confidence"),
    "bad page": (member_with(wages={"value": 1, "page": "one"}), "invalid_page"),
}


@pytest.mark.parametrize("name", list(BAD_INPUTS))
def test_bad_inputs_are_coded_422(client_off, name):
    raw, code = BAD_INPUTS[name]
    response = client_off.post("/api/households", json=raw)
    assert response.status_code == 422, response.text
    body = response.json()
    assert body["status"] == "needs_review"
    assert code in [e["code"] for e in body["errors"]]
    assert all({"code", "path", "message", "severity"} <= set(e) for e in body["errors"])


def test_malformed_json(client_off):
    response = client_off.post("/api/households", content=b'{"household_id": "HHX", "tax_year": 20', headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    assert response.json()["errors"][0]["code"] == "malformed_json"
    response = client_off.post("/api/households", content=b"\xff\xfe", headers={"Content-Type": "application/json"})
    assert response.status_code == 422


@pytest.mark.parametrize("payload", [
    '{"household_id": "HHN", "tax_year": 2025, "adjusted_gross_income": NaN, "members": []}',
    '{"household_id": "HHN", "tax_year": 2025, "members": [{"person_id": "P1", "name": "N", "wages": Infinity}]}',
    '{"household_id": "HHN", "tax_year": 2025, "dependents": NaN, "cash_balance": 1}',
    '{"household_id": "HHN", "tax_year": NaN, "cash_balance": 1}',
])
def test_nan_and_infinity(client_off, payload):
    response = client_off.post("/api/households", content=payload.encode(), headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    assert response.json()["status"] == "needs_review"
    json.loads(response.text)  # the error body itself is valid JSON (no NaN leaked)


def test_valid_ingest_then_overview(client_off):
    response = client_off.post("/api/households", json=BASE)
    assert response.status_code == 200 and response.json()["status"] == "accepted"
    overview = client_off.get("/api/households/HHBAD/overview").json()
    Overview.model_validate(overview)
    assert overview["status"] == "findings"


def test_document_ingest_textract_and_text(client_off):
    assert client_off.post("/api/households", json=BASE).status_code == 200
    response = client_off.post("/api/households/HH010/documents",
                               json={"name": "alex_example_1099r_2026.pdf", "textract": fixture_textract("alex_example_1099r_2026.pdf")})
    assert response.status_code == 200
    assert response.json()["doc_type"] == "1099_r"
    assert "distribution_code" in response.json()["fields"]
    response = client_off.post("/api/households/HHBAD/documents",
                               json={"name": "w2.pdf", "text": "Form W-2 for Bad Input. 1 Wages: 50,000.00. SSN 000-00-0000", "form_type": "W-2"})
    assert response.status_code == 200
    assert "000-00-0000" not in api_module.STORE.dump()


@pytest.mark.parametrize("body,code", [
    ({"text": "x"}, "document_missing_name"),
    ({"name": "a.pdf"}, "invalid_document"),
    ({"name": "a.pdf", "text": "x", "textract": {"Blocks": []}}, "invalid_document"),
    ({"name": "a.pdf", "textract": {"Pages": 1}}, "invalid_textract"),
    ({"name": "a.pdf", "text": "   "}, "invalid_text"),
    ([1], "invalid_document"),
])
def test_bad_documents_are_coded_422(client_off, body, code):
    response = client_off.post("/api/households/HH001/documents", json=body)
    assert response.status_code == 422
    assert code in [e["code"] for e in response.json()["errors"]]


def test_garbage_textract_blocks_do_not_500(client_off):
    garbage = {"Blocks": [{"BlockType": "KEY_VALUE_SET", "Id": "k", "EntityTypes": ["KEY"],
                           "Relationships": [{"Type": "VALUE", "Ids": ["missing"]}, {"Type": "CHILD", "Ids": ["w"]}]},
                          {"BlockType": "WORD", "Id": "w", "Text": "Wages"}, {"no": "id"}]}
    response = client_off.post("/api/households/HH001/documents", json={"name": "junk.pdf", "textract": garbage})
    assert response.status_code in (200, 422)


# ---------------------------------------------------------------- model failure


def test_model_failure_overview_still_returns(isolated_engine):
    class Broken:
        def relations(self, **kwargs):
            raise RuntimeError("CUDA error")

    isolated_engine.setattr("rapid_analysis.engine._factory", Broken)
    api_module.STORE.clear()
    api_module.seed_fixtures()
    try:
        with TestClient(api_module.app, raise_server_exceptions=False) as c:
            response = c.get("/api/households/HH001/overview")
            assert response.status_code == 200
            body = response.json()
            assert body["status"] == "findings"
            assert [e["code"] for e in body["errors"]] == ["validator_unavailable"]
            numbers = [n for m in body["members"] for n in m["numbers"]]
            assert numbers and all(n["check"] == "not_checked" for n in numbers)
            assert not any(k[0] == "HH001" for k in api_module.STORE.overviews)  # not cached
    finally:
        api_module.STORE.clear()


def test_swagger_loads(client_off):
    response = client_off.get("/docs")
    assert response.status_code == 200 and "swagger" in response.text.lower()
    spec = client_off.get("/openapi.json").json()
    for path in ["/health", "/api/meta/enums", "/api/households", "/api/households/{household_id}/overview",
                 "/api/households/{household_id}/members/{person_id}", "/api/households/{household_id}/findings/{finding_id}/evidence",
                 "/api/households/{household_id}/refresh", "/api/stats/overview", "/api/households/{household_id}/documents"]:
        assert path in spec["paths"], path


# ---------------------------------------------------------------- model on


@pytest.mark.model
def test_health_model_loaded(client, loaded_engine):
    body = client.get("/health").json()
    assert body["model_loaded"] is True and body["device"] in ("cuda", "cpu", "mps")


@pytest.mark.model
@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_overview_equals_builder_model_on(client, loaded_engine, household_id):
    body = client.get(f"/api/households/{household_id}/overview").json()
    assert body == overview_build(fixture_household_raw(household_id), fixture_household_documents(household_id)).overview
    text = json.dumps(body).lower()
    for word in FORBIDDEN:
        assert word not in text


@pytest.mark.model
def test_stats_rule_counts_model_on(client, loaded_engine):
    body = client.get("/api/stats/overview").json()
    assert {k: body[k] for k in HAND_COUNTS} == HAND_COUNTS
    assert body["values_by_check"]["mismatch"] == 0
    expected = 0
    for household_id in FIXTURE_IDS:
        overview = client.get(f"/api/households/{household_id}/overview").json()
        available = set(fixture_household_documents(household_id))
        values = [overview["summary"][k] for k in ("agi", "cash", "mortgage_interest")]
        values += [n for m in overview["members"] for n in m["numbers"]]
        expected += sum(1 for v in values if v["source_document"] in available or v["check"] == "conflicted")
    assert body["values_checked"] == expected


# ---------------------------------------------------------------- raw document decision (RAG team)

RAW_TEAMMATE_SHAPE = {  # the keys the RAG team built against (docs/samples/raw_decision_*.json)
    "choice": {"type", "choice", "probabilities", "confidence", "evidence"},
    "noul": {"type", "mode", "answer", "status", "binary", "three_way", "evidence"},
    "binary": {"answer", "probabilities", "confidence"},
    "three_way": {"answer", "relation", "scores"},
    "evidence": {"id", "text", "relevance"},
}


def test_raw_decision_needs_the_model(client_off):
    response = client_off.get("/api/households/HH006/documents/taylor_w2_2025.pdf/decision")
    assert response.status_code == 503
    assert response.json()["errors"][0]["code"] == "validator_unavailable"
    assert client_off.get("/api/households/NOPE/documents/taylor_w2_2025.pdf/decision").status_code == 404
    assert client_off.get("/api/households/HH006/documents/nope.pdf/decision").status_code == 404


@pytest.mark.model
def test_raw_decision_shape_and_consistency(client, loaded_engine):
    body = client.get("/api/households/HH006/documents/taylor_w2_2025.pdf/decision").json()
    answers = body["answers"]
    assert set(body) == {"answers"}
    assert set(answers) == {"docType", "tag_tax", "tag_earnings", "member_taylor_mock", "member_sam_mock"}
    assert set(answers["docType"]) >= RAW_TEAMMATE_SHAPE["choice"] and answers["docType"]["type"] == "choice"
    assert answers["docType"]["choice"] == "w2"
    for key in ("tag_tax", "tag_earnings", "member_taylor_mock", "member_sam_mock"):
        a = answers[key]
        assert a["type"] == "document_noul" and a["mode"] == "both"
        assert set(a) >= RAW_TEAMMATE_SHAPE["noul"]
        assert set(a["binary"]) >= RAW_TEAMMATE_SHAPE["binary"] and set(a["three_way"]) >= RAW_TEAMMATE_SHAPE["three_way"]
        assert all(set(e) >= RAW_TEAMMATE_SHAPE["evidence"] for e in a["evidence"])
    # the raw answers are the ones the strict decision used
    overview = client.get("/api/households/HH006/overview").json()
    doc = next(d for d in overview["tags"]["documents"] if d["name"] == "taylor_w2_2025.pdf")
    confirmed = {"tag_tax": "tax", "tag_earnings": "income"}
    assert doc["model_tags"] == [t for k, t in confirmed.items()
                                 if answers[k]["status"] == "confirmed" and answers[k]["answer"] is True]
    # raw scores stay out of the advisor-facing overview
    assert "probabilit" not in json.dumps(overview).lower()
