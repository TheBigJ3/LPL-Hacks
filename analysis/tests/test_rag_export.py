"""CHECKPOINT R: RAG export (amendment §9)."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from rapid_analysis import RULESET_VERSION
from rapid_analysis import api as api_module
from rapid_analysis.fixtures import FIXTURE_IDS, fixture_household_documents, fixture_household_raw
from rapid_analysis.overview import overview_build
from rapid_analysis.rag import MAX_TEXT, rag_chunks
from rapid_analysis.taxonomy import tag_ids, tags

SAMPLE = Path(__file__).resolve().parents[1] / "docs" / "samples" / "rag_chunks.jsonl"
SCORE_WORDS = re.compile(r"\b0\.\d+|confidence|score|probabilit", re.I)
MONEY = re.compile(r"\$([\d,]+(?:\.\d+)?)")
PERCENT = re.compile(r"(\d+(?:\.\d+)?)%")
MONTHS = re.compile(r"(\d+(?:\.\d+)?) months")
ONE_PLURAL = re.compile(r"(?<![\d.,])1 (values|contributions|HSA contributions|documents|months)\b")
VERIFIED = re.compile(r"verified(?! against [\w.-]+\.pdf)")
REVIEW_REASONS = {"doc_type_unknown", "member_ambiguous", "member_unassigned", "member_model_disagrees"}
_builds: dict[str, object] = {}


def build(household_id):
    if household_id not in _builds:
        _builds[household_id] = overview_build(fixture_household_raw(household_id), fixture_household_documents(household_id))
    return _builds[household_id]


def chunks_for(household_id):
    b = build(household_id)
    return rag_chunks(b.overview, b.evidence, b.value_checks, b.textract_confidence)


def numbers_in(obj):
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        yield round(float(obj), 2)
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from numbers_in(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from numbers_in(v)


def overview_numbers(overview):
    nums = set(numbers_in(overview))
    for text in re.findall(r'"[^"]*"', json.dumps(overview)):  # numbers quoted in overview text (explanations, changes)
        nums |= {float(x.replace(",", "")) for x in MONEY.findall(text)} | {float(x) for x in PERCENT.findall(text)}
    return nums


def check_chunks(household_id, chunks, model_on):
    overview = build(household_id).overview
    known = overview_numbers(overview)
    other_names = {m["name"] for h in FIXTURE_IDS if h != household_id
                   for m in fixture_household_raw(h).get("members", []) if m.get("name")}
    ids = [c["id"] for c in chunks]
    assert len(ids) == len(set(ids))
    for c in chunks:
        text, md = c["text"], c["metadata"]
        assert c["id"].startswith(f"{household_id}:")
        assert len(text) < MAX_TEXT, (c["id"], len(text))
        assert "{" not in text and "}" not in text
        assert not SCORE_WORDS.search(text), (c["id"], SCORE_WORDS.search(text).group(0))
        assert "model_scores" not in text
        assert "? ." not in text and " . " not in text and ".." not in text, c["id"]
        assert "its document" not in text, c["id"]
        assert not VERIFIED.search(text), (c["id"], "verified without naming its document")
        assert not ONE_PLURAL.search(text), (c["id"], ONE_PLURAL.search(text).group(0))
        assert "tag_uncertain" not in text and "member_model_only" not in text, c["id"]
        assert isinstance(md["member_roles"], dict)
        assert all(isinstance(v, list) for v in md["member_roles"].values()), c["id"]
        if "events" in md["metrics"]:
            assert isinstance(md["metrics"]["events"], list), c["id"]
        if md["checklist_id"] == "major_changes" or md["chunk_type"] == "changes":
            assert isinstance(md["metrics"].get("events"), list), c["id"]
        for amount in MONEY.findall(text):
            assert float(amount.replace(",", "")) in known, (c["id"], amount)
        for value in PERCENT.findall(text) + MONTHS.findall(text):
            assert float(value) in known, (c["id"], value)
        for name in other_names:
            if name not in {m["name"] for m in overview["members"]}:
                assert name not in text, (c["id"], name)
        assert md["household_id"] == household_id and md["synthetic"] is True
        assert set(tags()["rag_chunk_metadata"]["fields"]) <= set(md)
        assert set(md["topics"]) <= set(tag_ids("topics"))
        assert md["doc_type"] is None or md["doc_type"] in tag_ids("doc_types")
        assert set(md["fields_present"]) <= set(tag_ids("fields"))
        assert md["checklist_id"] is None or md["checklist_id"] in tag_ids("checklist")
        assert md["attribution_status"] is None or md["attribution_status"] in tag_ids("attribution_status")
        roles = [r for v in md["member_roles"].values() for r in (v if isinstance(v, list) else [v])]
        assert set(roles) <= set(tag_ids("member_roles"))
        assert set(md["checks"].values()) <= set(tag_ids("check_status"))
        assert md["ruleset_version"] == RULESET_VERSION == "2025.2"
        if md["chunk_type"] == "member":
            assert len(md["person_ids"]) == 1 and c["id"].endswith(md["person_ids"][0])
        if md["chunk_type"] == "checklist":
            # every checklist chunk states its reason: a real sentence between the question and the rule
            before_rule = text.split(" Rule:")[0] if "Rule:" in text else text.split(" Result:")[0]
            question = next(i for i in overview["checklist"] if i["id"] == md["checklist_id"])["question"]
            reason = before_rule[len(question):].strip() if before_rule.startswith(question) else before_rule
            assert len(reason) > 10 and reason.endswith("."), (c["id"], reason)
        if md["chunk_type"] == "document":
            doc = next(d for d in overview["tags"]["documents"] if d["name"] == md["source_document"])
            assert set(doc["review_reasons"]) <= REVIEW_REASONS
            assert ("needs review" in text) == (doc["status"] == "needs_review"), c["id"]
            assert md["notes"] == doc["notes"]
        if md["chunk_type"] in ("checklist", "finding"):
            assert md["rule"] and ("Rule:" in text or "not been assessed" in text)
            assert "Result:" in text
            assert isinstance(md["metrics"], dict)
            if md["chunk_type"] == "finding" or md["answer"] != "not_assessed":
                assert md["metrics"], c["id"]
        if "model_scores" in md and not model_on:
            raise AssertionError("model scores without a model")
    # labels: a number is never presented as verified unless its check is verified
    for c in chunks:
        for sentence in re.split(r"[.;]\s", c["text"]):
            if "verified against" in sentence:
                assert "not checked" not in sentence.split("verified against")[0][-20:]
    return chunks


@pytest.fixture(autouse=True)
def reset():
    _builds.clear()
    yield
    _builds.clear()


@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_chunks_model_off(backend_none, household_id):
    chunks = check_chunks(household_id, chunks_for(household_id), model_on=False)
    assert all("model_scores" not in c["metadata"] for c in chunks)
    overview = build(household_id).overview
    types = [c["metadata"]["chunk_type"] for c in chunks]
    assert types.count("member") == len(overview["members"])
    assert types.count("checklist") == len(overview["checklist"])
    assert types.count("finding") == len(overview["findings"])
    assert types.count("document") == len(overview["tags"]["documents"])
    assert types.count("household_summary") == 1 and types.count("changes") == 1
    assert "not checked" in " ".join(c["text"] for c in chunks if c["metadata"]["chunk_type"] == "member")


def test_checklist_chunk_has_metrics_rule_answer(backend_none):
    chunk = next(c for c in chunks_for("HH006") if c["id"] == "HH006:checklist:retirement_can_improve")
    assert chunk["text"].startswith("Can retirement savings be improved? Taylor Mock contributes $2,000 to the 401(k) (not checked): "
                                    "1.8% of $110,000 pay, 9% of the $23,500 limit, leaving $21,500 of room. Rule: a 401(k) "
                                    "contribution under 50% of the $23,500 limit")
    assert "Result: flagged (yes)." in chunk["text"] and chunk["text"].endswith("Flag for review, not advice.")
    assert chunk["metadata"]["metrics"]["members"]["HH006-P1"]["room"] == 21500
    insurance = next(c for c in chunks_for("HH006") if c["id"] == "HH006:checklist:insurance_review")
    assert insurance["text"].startswith("Insurance has not been assessed: no data or rules yet.")


def test_checklist_reasons_for_no_needs_data_and_not_assessed(backend_none):
    texts = {h: {c["metadata"]["checklist_id"]: c["text"] for c in chunks_for(h) if c["metadata"]["chunk_type"] == "checklist"}
             for h in ("HH001", "HH004", "HH009", "HH010")}
    assert texts["HH001"]["tax_savings_possible"].startswith(
        "Can tax savings be made? No self-employment income or 1099-R on file. Rule: ")
    assert texts["HH004"]["retirement_can_improve"].startswith(
        "Can retirement savings be improved? Jordan's wages conflict ($120,000 vs $165,000), so this can't be assessed. Rule: ")
    assert texts["HH009"]["retirement_can_improve"].startswith(
        "Can retirement savings be improved? No wage earners in this household. Rule: ")
    assert "Missing cash balance and adjusted gross income, so this can't be assessed. Rule: " in texts["HH010"]["excess_cash"]
    assert "No prior year on file, so changes can't be assessed. Rule: " in texts["HH001"]["major_changes"]
    assert "0 values where documents disagree, 0 HSA contributions without plan proof" in texts["HH001"]["needs_documents"]
    hh003 = next(c for c in chunks_for("HH003") if c["id"] == "HH003:checklist:needs_documents")
    assert "1 HSA contribution without plan proof" in hh003["text"]


def test_major_changes_events_is_a_list(backend_none):
    hh005 = {c["id"]: c for c in chunks_for("HH005")}
    for key in ("HH005:checklist:major_changes", "HH005:changes:HH005"):
        metrics = hh005[key]["metadata"]["metrics"]
        assert metrics["events"] == ["life_event_new_dependent", "life_event_new_employer", "life_event_new_mortgage",
                                     "life_event_large_income_increase"]
        assert metrics["event_count"] == 4
    assert {c["id"]: c for c in chunks_for("HH001")}["HH001:changes:HH001"]["metadata"]["metrics"]["events"] == []


def test_document_chunk_uncertain_tag_is_a_note_not_review(backend_none):
    w2 = next(c for c in chunks_for("HH006") if c["id"] == "HH006:document:taylor_w2_2025.pdf")
    assert w2["text"].endswith("Status: accepted.")
    assert w2["metadata"]["member_roles"] == {"HH006-P1": ["owner"]}


def test_conflict_is_labeled(backend_none):
    member = next(c for c in chunks_for("HH004") if c["id"] == "HH004:member:HH004-P1")
    assert "documents disagree: $120,000 (jordan_w2_2025.pdf) vs $165,000 (hh004_1040_2025.pdf)" in member["text"]


@pytest.mark.model
@pytest.mark.parametrize("household_id", FIXTURE_IDS)
def test_chunks_model_on(loaded_engine, household_id):
    chunks = check_chunks(household_id, chunks_for(household_id), model_on=True)
    scored = [c for c in chunks if "model_scores" in c["metadata"]]
    for c in scored:
        for entries in c["metadata"]["model_scores"].values():
            for e in entries:
                assert set(e) <= {"document", "relation", "supports", "contradicts"}


@pytest.mark.model
def test_household_values_are_checked_against_documents(loaded_engine):
    for h in ("HH003", "HH006"):
        summary = next(c for c in chunks_for(h) if c["metadata"]["chunk_type"] == "household_summary")
        checks = summary["metadata"]["checks"]
        assert {checks[k] for k in ("dependents", "adjusted_gross_income", "cash_balance")} == {"verified"}, (h, checks)
    f3 = next(c for c in chunks_for("HH006") if c["id"] == "HH006:finding:F3")
    assert "$134,000" in f3["text"]
    assert ("Values: cash balance $210,000 (verified against hh006_bank_statement_2025.pdf); "
            "adjusted gross income $152,000 (verified against hh006_1040_2025.pdf).") in f3["text"]
    assert set(f3["metadata"]["checks"].values()) == {"verified"}


@pytest.mark.model
def test_model_on_uncertain_tags_never_need_review(loaded_engine):
    for h in FIXTURE_IDS:
        for doc in build(h).overview["tags"]["documents"]:
            if doc["status"] == "accepted":
                assert not doc["review_reasons"]
            assert not any(r.startswith("tag_uncertain") or r == "member_model_only" for r in doc["review_reasons"]), (h, doc)


@pytest.mark.model
def test_committed_sample_matches_and_validates(loaded_engine):
    rows = [json.loads(line) for line in SAMPLE.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert {r["metadata"]["household_id"] for r in rows} == set(FIXTURE_IDS)
    expected = [c for h in FIXTURE_IDS for c in chunks_for(h)]
    assert rows == json.loads(json.dumps(expected, sort_keys=True))
    for h in FIXTURE_IDS:
        check_chunks(h, [r for r in rows if r["metadata"]["household_id"] == h], model_on=True)


def test_endpoint(backend_none):
    api_module.STORE.clear()
    api_module.seed_fixtures()
    with TestClient(api_module.app) as client:
        body = client.get("/api/households/HH006/rag-chunks").json()
        assert body["household_id"] == "HH006" and body["chunks"][0]["id"] == "HH006:household_summary:HH006"
        assert client.get("/api/households/NOPE/rag-chunks").status_code == 404
        overview_text = json.dumps(client.get("/api/households/HH006/overview").json())
        assert "model_scores" not in overview_text
    api_module.STORE.clear()
