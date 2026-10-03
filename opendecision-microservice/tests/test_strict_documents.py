"""CHECKPOINT S: strict document type, tags and member relevance (amendment §3.4, Johnson battery verbatim)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from rapid_analysis.documents import (
    REVIEW_REASONS,
    TAG_CHECK_PROBABILITY,
    MemberRef,
    decision_request,
    document_classify,
    document_decide,
    doc_type_detect,
    members_match,
    noul_any,
)
from rapid_analysis.taxonomy import doc_types, document_tags, tag_ids
from rapid_analysis.textract import redact

ROOT = Path(__file__).resolve().parents[1]
STRICT = ROOT / "tests" / "fixtures" / "strict"
BODY = json.loads((STRICT / "johnson_documents.json").read_text(encoding="utf-8"))
MEMBERS = [MemberRef.from_name(m["person_id"], m["name"]) for m in BODY["members"]]
DOCS = BODY["documents"]


def recorded(doc_id):
    return json.loads((STRICT / "responses" / f"{doc_id}.json").read_text(encoding="utf-8"))


def classify(doc, response):
    return document_classify(doc["id"], redact(doc["text"]), MEMBERS, response)


def score(decisions):
    """-> (wrong member assignments, false tags, needs_review count) against the battery's expectations."""
    wrong = false_tags = review = 0
    for doc, decision in zip(DOCS, decisions):
        r = decision.result
        got = {m["person_id"]: m["role"] for m in r["members"]}
        wrong += sum(1 for pid, role in got.items() if doc["expected_members"].get(pid) != role)
        false_tags += sum(1 for tag in r["model_tags"] if doc["truth_tags"].get(tag) is False)
        review += r["status"] == "needs_review"
    return wrong, false_tags, review


def assert_gates(decisions):
    by_id = {doc["id"]: d for doc, d in zip(DOCS, decisions)}
    for doc, decision in zip(DOCS, decisions):
        r = decision.result
        assert r["doc_type"] == doc["expected_doc_type"], doc["id"]
        assert {m["person_id"]: m["role"] for m in r["members"]} == doc["expected_members"], doc["id"]
        assert r["attribution_status"] == doc["expected_attribution"], doc["id"]
        assert all(m["method"] == "name_match" for m in r["members"])
        for tag in r["model_tags"]:
            assert doc["truth_tags"].get(tag) is not False, (doc["id"], tag)
        assert (r["status"] == "needs_review") == bool(r["review_reasons"])
    for doc_id in ("sarah_1099int", "john_1099r"):
        assert "income" not in by_id[doc_id].result["model_tags"]
    assert by_id["near_name_w2"].result["members"] == []
    assert by_id["initial_only_w2"].result["members"] == []
    initial = by_id["initial_only_w2"]
    assert initial.result["status"] == "needs_review" and "member_ambiguous" in initial.result["review_reasons"]
    letter = by_id["no_name_letter"].result
    assert letter["status"] == "needs_review" and "doc_type_unknown" in letter["review_reasons"]
    assert letter["doc_type"] == "unknown"
    wrong, false_tags, _ = score(decisions)
    assert (wrong, false_tags) == (0, 0)


def assert_ids_in_tags(decisions):
    for decision in decisions:
        r = decision.result
        assert r["doc_type"] in list(doc_types())
        assert set(r["topics"]) <= set(tag_ids("topics"))
        assert set(r["model_tags"]) <= set(document_tags())
        assert r["attribution_status"] in tag_ids("attribution_status")
        assert all(m["role"] in tag_ids("member_roles") and m["method"] in tag_ids("attribution_methods") for m in r["members"])
        if r["suggested_doc_type"]:
            assert r["suggested_doc_type"]["doc_type"] in list(doc_types())


# ---------------------------------------------------------------- no model: rules + replayed real responses


def test_request_format_is_exact():
    body = decision_request("Form W-2 ...", MEMBERS)
    assert {k: body[k] for k in ("noul_mode", "top_k", "chunk_tokens")} == {"noul_mode": "both", "top_k": 4, "chunk_tokens": 384}
    criteria = body["questions"]["docType"]["criteria"]
    assert criteria == {doc_id: doc_type.description for doc_id, doc_type in doc_types().items()}
    assert criteria["w2"] == "a Form W-2 Wage and Tax Statement from an employer, showing wages and tax withheld"
    assert [k for k in body["questions"] if k.startswith("tag_")] == [f"tag_{name}" for name in document_tags()]
    assert body["questions"]["tag_income"]["type"] == "noul_any"
    assert body["questions"]["tag_income"]["checks"][0] == {"true": "This document reports employment earnings or wages.",
                                                            "false": "This document does not report employment earnings or wages."}
    assert body["questions"]["member_sarah_johnson"] == {"type": "noul", "instructions": "This document concerns Sarah Johnson."}
    assert body["document"] == "Form W-2 ..."


@pytest.mark.parametrize("text,expected", [
    ("Form W-2 Wage and Tax Statement", ("w2", None)), ("wage and tax statement", ("w2", None)),
    ("Form 1099-INT", ("1099_int", None)), ("FORM 1099-R", ("1099_r", None)), ("1099-DIV", ("1099_div", None)),
    ("1099-NEC", ("1099_nec", None)), ("Form 1040", ("1040", None)), ("Form 1098", ("1098", None)),
    ("5498-SA", ("5498_sa", None)), ("Form 1095-B", ("1095", None)), ("Statement period: Dec", ("account_statement", None)),
    ("Form 1099-B Proceeds", ("unknown", "1099-B")), ("Form 1099-MISC", ("unknown", "1099-MISC")), ("Notice", ("unknown", None)),
])
def test_doc_type_patterns(text, expected):
    assert doc_type_detect(text) == expected


def test_name_matching_rules():
    full, ambiguous = members_match("Employee: Sarah A. Johnson", MEMBERS)
    assert [m.person_id for m in full] == ["HHJ-P2"] and ambiguous == []
    full, ambiguous = members_match("Employee: J. Johnson", MEMBERS)
    assert full == [] and {m.person_id for m in ambiguous} == {"HHJ-P1", "HHJ-P2"}
    assert members_match("Employee: Sara Johnston", MEMBERS) == ([], [])
    full, ambiguous = members_match("John R. Johnson and the Johnson family", MEMBERS)
    assert [m.person_id for m in full] == ["HHJ-P1"] and ambiguous == []


def test_battery_replayed_through_parser():
    decisions = [classify(doc, recorded(doc["id"])) for doc in DOCS]
    assert_gates(decisions)
    assert_ids_in_tags(decisions)
    by_id = {doc["id"]: d for doc, d in zip(DOCS, decisions)}
    assert "member_model_only:HHJ-P1" in by_id["initial_only_w2"].logged
    assert "member_model_only:HHJ-P2" in by_id["near_name_w2"].logged
    assert by_id["no_name_letter"].result["suggested_doc_type"]["doc_type"] == "account_statement"


def test_battery_without_model_is_still_strict():
    decisions = [classify(doc, None) for doc in DOCS]
    assert_gates(decisions)
    assert all(d.result["model_tags"] == [] for d in decisions)


def test_model_veto_blocks_a_name_match():
    response = {"answers": {"member_sarah_johnson": {"status": "confirmed", "answer": False}}}
    decision = classify(DOCS[0], response)
    assert decision.result["members"] == []
    assert "member_model_disagrees" in decision.result["review_reasons"]


def test_model_yes_never_assigns_and_tentative_never_vetoes():
    response = {"answers": {"member_john_johnson": {"status": "confirmed", "answer": True},
                            "member_sarah_johnson": {"status": "tentative", "answer": False}}}
    decision = classify(DOCS[0], response)
    assert [m["person_id"] for m in decision.result["members"]] == ["HHJ-P2"]
    assert "member_model_only:HHJ-P1" in decision.logged


def test_model_disagreement_keeps_pattern_type():
    response = {"answers": {"docType": {"type": "choice", "choice": "1040", "probabilities": {"1040": 0.93}}}}
    r = classify(DOCS[0], response).result
    assert r["doc_type"] == "w2" and "doc_type_model_disagrees" in r["notes"]
    assert "doc_type_model_disagrees" not in r["review_reasons"]
    low = {"answers": {"docType": {"choice": "1040", "probabilities": {"1040": 0.6}}}}
    assert "doc_type_model_disagrees" not in classify(DOCS[0], low).result["notes"]
    agrees = {"answers": {"docType": {"choice": "1099_r", "probabilities": {"1099_r": 0.99}}}}
    assert "doc_type_model_disagrees" not in classify(DOCS[5], agrees).result["notes"]


def test_tags_only_when_confirmed():
    response = {"answers": {"tag_tax": {"status": "tentative", "answer": True},
                            "tag_income": {"status": "confirmed", "answer": False}}}
    r = classify(DOCS[0], response).result
    assert r["model_tags"] == []
    assert "tag_uncertain:tax" in r["notes"] and "tag_uncertain:income" not in r["notes"]
    assert not any(reason.startswith("tag_uncertain") for reason in r["review_reasons"])
    assert r["topics"] == ["income", "retirement", "tax"]


def test_uncertain_tag_on_certain_w2_is_accepted():
    """A W-2 with a certain type and owner but an uncertain tag is accepted; the tag is only a note."""
    response = {"answers": {"docType": {"choice": "w2", "probabilities": {"w2": 0.99}},
                            "tag_tax": {"status": "tentative", "answer": True},
                            "tag_income": {"status": "confirmed", "answer": True},
                            "member_sarah_johnson": {"status": "confirmed", "answer": True},
                            "member_john_johnson": {"status": "tentative", "answer": True}}}
    r = classify(DOCS[0], response).result
    assert r["doc_type"] == "w2" and r["attribution_status"] == "assigned"
    assert [m["person_id"] for m in r["members"]] == ["HHJ-P2"]
    assert r["status"] == "accepted" and r["review_reasons"] == []
    # every tag the response has no confirmed answer for is a note; income is the only confirmed one
    assert r["notes"] == [f"tag_uncertain:{tag}" for tag in document_tags() if tag != "income"] + ["member_model_only"]


def test_only_listed_reasons_set_needs_review():
    for doc in DOCS:
        for response in (recorded(doc["id"]), None):
            r = classify(doc, response).result
            assert set(r["review_reasons"]) <= set(REVIEW_REASONS)
            assert not set(r["notes"]) & set(REVIEW_REASONS)
            assert (r["status"] == "needs_review") == bool(r["review_reasons"])


@pytest.mark.parametrize("response", [{}, {"answers": None}, {"answers": {"docType": "x", "tag_tax": [], "member_john_johnson": {"status": 3}}},
                                      {"answers": {"docType": {"choice": None, "probabilities": "?"}}}])
def test_parser_is_tolerant(response):
    classify(DOCS[2], response)


# ---------------------------------------------------------------- model


@pytest.mark.model
def test_battery_live_twice_identical(loaded_engine):
    runs = []
    for _ in range(2):
        runs.append([document_classify(d["id"], redact(d["text"]), MEMBERS, document_decide(redact(d["text"]), MEMBERS)) for d in DOCS])
    assert [d.result for d in runs[0]] == [d.result for d in runs[1]]
    assert [d.logged for d in runs[0]] == [d.logged for d in runs[1]]
    assert_gates(runs[0])
    assert_ids_in_tags(runs[0])
    by_id = {doc["id"]: d for doc, d in zip(DOCS, runs[0])}
    assert "member_model_only:HHJ-P1" in by_id["initial_only_w2"].logged
    assert "member_model_only:HHJ-P2" in by_id["near_name_w2"].logged


@pytest.mark.model
def test_live_equals_recorded(loaded_engine):
    for doc in DOCS:
        live = document_classify(doc["id"], redact(doc["text"]), MEMBERS, document_decide(redact(doc["text"]), MEMBERS))
        assert live.result == classify(doc, recorded(doc["id"])).result, doc["id"]


def _check(statement, status, answer, true_probability):
    return {"type": "document_noul", "status": status, "answer": answer, "binary": {"probabilities": {"true": true_probability}},
            "compiled": {"proposition": statement, "contradiction": f"not {statement}"}, "evidence": []}


def test_a_tag_is_confirmed_by_any_one_check():
    out = noul_any([_check("a", "confirmed", False, 0.1), _check("b", "confirmed", True, 0.9), _check("c", "tentative", True, 0.99)])
    assert (out["status"], out["answer"], out["basis"], out["compiled"]["proposition"]) == ("confirmed", True, "confirmed", "b")
    assert [c["statement"] for c in out["checks"]] == ["a", "b", "c"]


def test_a_clear_tentative_yes_confirms_a_tag():
    out = noul_any([_check("a", "tentative", False, 0.3), _check("b", "tentative", True, TAG_CHECK_PROBABILITY)])
    assert (out["status"], out["answer"], out["basis"]) == ("confirmed", True, "probability")
    assert out["checks"][1]["status"] == "tentative"


@pytest.mark.parametrize("checks,status,answer,decided_by", [
    ([("a", "tentative", True, 0.79)], "tentative", True, "a"),
    ([("a", "conflicted", None, 0.95)], "conflicted", None, "a"),
    ([("a", "confirmed", False, 0.1), ("b", "tentative", True, 0.6)], "tentative", True, "b"),
    ([("a", "confirmed", False, 0.1), ("b", "confirmed", False, 0.2)], "confirmed", False, "a"),
])
def test_a_tag_without_a_yes_reports_its_first_undecided_check(checks, status, answer, decided_by):
    out = noul_any([_check(*c) for c in checks])
    assert (out["status"], out["answer"], out["basis"], out["compiled"]["proposition"]) == (status, answer, None, decided_by)
