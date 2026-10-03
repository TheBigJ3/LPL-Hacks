"""CHECKPOINT C: the Ask endpoint (amendment §6). KeywordRouter only; answers come from overview data."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from rapid_analysis import api as api_module
from rapid_analysis.ask import KeywordRouter, ask
from rapid_analysis.contract import AskResponse
from rapid_analysis.fixtures import FIXTURE_IDS, fixture_household_documents, fixture_household_raw
from rapid_analysis.overview import overview_build
from rapid_analysis.taxonomy import tag_ids

ROOT = Path(__file__).resolve().parents[1]
HELDOUT = json.loads((ROOT / "tests" / "heldout_ask.json").read_text(encoding="utf-8"))["cases"]
METRICS = ROOT / "logs" / "ask_metrics.json"
_cache: dict[str, dict] = {}


def overview(household_id):
    if household_id not in _cache:
        _cache[household_id] = overview_build(fixture_household_raw(household_id), fixture_household_documents(household_id)).overview
    return _cache[household_id]


def run(household_id, question):
    result = ask(question, overview(household_id))
    AskResponse.model_validate(result)
    return result


def all_numbers(obj):
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        yield float(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from all_numbers(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from all_numbers(v)


def assert_no_invented_numbers(household_id, result):
    known = set(all_numbers(overview(household_id)))
    for amount in re.findall(r"\$([\d,]+(?:\.\d+)?)", result["answer"]["text"] + " " + result["answer"]["short"]):
        assert float(amount.replace(",", "")) in known, amount
    if result["answer"]["dollar_impact"] is not None:
        assert float(result["answer"]["dollar_impact"]) in known or result["answer"]["dollar_impact"] == sum(
            f["dollar_impact"] or 0 for f in overview(household_id)["findings"])


@pytest.fixture(autouse=True)
def model_off(request):
    if request.node.get_closest_marker("model") is None:
        request.getfixturevalue("backend_none")
    _cache.clear()
    yield
    _cache.clear()


def test_sarah_income_last_year_no_data():
    r = run("HH001", "what was sarahs income last year")
    assert r["understood"] | {} == {**r["understood"], "intent": "lookup", "member": "Sarah Sample", "time_ref": "prior_year", "field": "wages"}
    assert r["answer"]["short"] == "No data"


def test_casey_income_last_year():
    r = run("HH005", "what was casey's income last year")
    assert (r["understood"]["intent"], r["understood"]["person_id"], r["understood"]["time_ref"]) == ("lookup", "HH005-P1", "prior_year")
    assert r["answer"]["short"] == "$90,000" and "$90,000" in r["answer"]["text"]
    assert_no_invented_numbers("HH005", r)


def test_how_much_does_john_make():
    r = run("HH001", "how much does john make")
    assert (r["understood"]["intent"], r["understood"]["field"], r["understood"]["person_id"]) == ("lookup", "wages", "HH001-P1")
    assert r["answer"]["short"] == "$120,000"
    assert r["answer"]["values"] == [{"field": "wages", "value": 120000, "check": "not_checked",
                                      "source_document": "john_w2_2025.pdf", "page": 1}]


def test_can_sarah_make_some_savings():
    r = run("HH001", "can sarah make some savings")
    assert (r["understood"]["intent"], r["understood"]["person_id"]) == ("savings_opportunity", "HH001-P2")
    assert (r["answer"]["short"], r["answer"]["dollar_impact"]) == ("Yes", 19000)
    assert r["answer"]["text"] == ("Sarah contributes $4,500 to the 401(k), 19% of the $23,500 limit. "
                                   "$19,000 of room is left.")
    assert_no_invented_numbers("HH001", r)


def test_pat_penalty():
    r = run("HH009", "does pat owe a penalty on that withdrawal")
    assert r["understood"]["intent"] == "tax_opportunity"
    assert (r["answer"]["short"], r["answer"]["dollar_impact"]) == ("Yes", 1200)
    assert_no_invented_numbers("HH009", r)


def test_too_much_money_in_savings():
    r = run("HH006", "are they holding too much money in savings")
    assert r["understood"]["intent"] == "cash_opportunity"
    assert (r["answer"]["short"], r["answer"]["dollar_impact"]) == ("Yes", 134000)


def test_paperwork_waiting_on():
    r = run("HH003", "what paperwork are we still waiting on")
    assert r["understood"]["intent"] == "documents_status"
    assert "HSA-eligible health plan" in r["answer"]["text"]


def test_casey_switch_jobs():
    r = run("HH005", "did casey switch jobs")
    assert r["understood"]["intent"] == "changes"
    assert "Acme Sample Corp to Bluefin Sample LLC" in r["answer"]["text"]


def test_johns_401k_verified_model_off_says_not_checked():
    r = run("HH001", "is john's 401k figure verified")
    assert (r["understood"]["intent"], r["understood"]["field"]) == ("verify", "employee_401k_contribution")
    assert r["answer"]["values"][0]["check"] == "not_checked"
    assert "not checked" in r["answer"]["text"]


def test_out_of_scope_meeting():
    r = run("HH001", "book a meeting with sarah for tuesday")
    assert r["understood"]["intent"] == "out_of_scope"
    assert r["answer"]["type"] == "none" and r["answer"]["text"] == ""
    assert len(r["suggestions"]) == 4
    for suggestion in r["suggestions"]:
        assert run("HH001", suggestion)["understood"]["intent"] != "out_of_scope", suggestion


def test_unknown_member_asks_which():
    r = run("HH001", "can bob save more")
    assert r["answer"]["type"] == "none" and r["answer"]["short"] == "Which member?"
    assert r["understood"]["person_id"] is None and r["answer"]["dollar_impact"] is None
    assert r["suggestions"] == ["Which member: John Sample?", "Which member: Sarah Sample?"]


def test_emitted_ids_exist_in_tag_file():
    questions = ["what was sarahs income last year", "how much does john make", "can sarah make some savings",
                 "is john's 401k figure verified", "book a meeting with sarah for tuesday", "what's the AGI for 2025",
                 "how much cash do they have", "what changed since last year", "give me a summary"]
    for q in questions:
        u = run("HH001", q)["understood"]
        assert u["intent"] in tag_ids("intents")
        assert u["field"] is None or u["field"] in tag_ids("fields")
        assert u["time_ref"] in tag_ids("time_refs")


def test_no_opendecision_in_router():
    source = (ROOT / "rapid_analysis" / "ask.py").read_text(encoding="utf-8")
    assert "engine" not in source and "opendecision" not in source.split('"""', 2)[2].lower()


def test_heldout_report():
    correct, wrong_member, misses = 0, 0, []
    for case in HELDOUT:
        r = run(case["household_id"], case["question"])
        u = r["understood"]
        if case.get("unknown_member"):
            ok = r["answer"]["short"] == "Which member?"
        else:
            ok = u["intent"] == case["intent"] and u["person_id"] == case["person_id"] and (
                "field" not in case or u["field"] == case["field"])
        if u["person_id"] is not None and u["person_id"] != case["person_id"]:
            wrong_member += 1
        correct += ok
        if not ok:
            misses.append({"q": case["question"], "got": u["intent"], "field": u["field"], "person": u["person_id"]})
    accuracy = round(correct / len(HELDOUT) * 100)
    METRICS.parent.mkdir(exist_ok=True)
    METRICS.write_text(json.dumps({"heldout_accuracy_pct": accuracy, "heldout_correct": f"{correct}/{len(HELDOUT)}",
                                   "heldout_wrong_member": wrong_member, "heldout_misses": misses}))
    assert wrong_member == 0  # the hard part of the report gate; accuracy is reported, not enforced


def test_api_ask(client_off_ask):
    response = client_off_ask.post("/api/households/HH001/ask", json={"question": "can sarah make some savings"})
    assert response.status_code == 200
    AskResponse.model_validate(response.json())
    assert response.json()["answer"]["dollar_impact"] == 19000
    assert client_off_ask.post("/api/households/HH001/ask", json={"question": ""}).status_code == 422
    assert client_off_ask.post("/api/households/HH001/ask", json={"q": "x"}).status_code == 422
    assert client_off_ask.post("/api/households/NOPE/ask", json={"question": "hi"}).status_code == 404


@pytest.fixture
def client_off_ask():
    api_module.STORE.clear()
    api_module.seed_fixtures()
    with TestClient(api_module.app) as c:
        yield c
    api_module.STORE.clear()


@pytest.mark.model
def test_johns_401k_verified_model_on(loaded_engine):
    r = run("HH001", "is john's 401k figure verified")
    assert r["understood"]["intent"] == "verify"
    assert r["answer"]["short"] == "Matches document"
    assert r["answer"]["values"] == [{"field": "employee_401k_contribution", "value": 8200, "check": "verified",
                                      "source_document": "john_w2_2025.pdf", "page": 1}]
    assert "verified against john_w2_2025.pdf" in r["answer"]["text"]


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_suggestions_route_somewhere(household_id):
    r = run(household_id, "what's the weather tomorrow")
    assert r["understood"]["intent"] == "out_of_scope" and len(r["suggestions"]) == 4
