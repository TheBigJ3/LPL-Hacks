"""RAG export (amendment §9): short plain-English chunks with filterable metadata, built from the overview.

- `text` is sentences only (no JSON), < 700 characters. Every number states its check. Checklist and
  finding chunks state their exact metrics, the rule threshold, then the answer.
- Metrics come from the rules layer (overview `metrics`); nothing is computed here.
- OpenDecision raw scores appear ONLY in `metadata.model_scores` (audit/debugging). They are uncalibrated,
  so they never appear in `text`.
"""

from __future__ import annotations

from typing import Any

from rapid_analysis import RULESET_VERSION
from rapid_analysis.evidence import money_format
from rapid_analysis.taxonomy import tag_by_id, tag_ids, tags

MAX_TEXT = 700
ANSWER_WORDS = {"yes": "flagged (yes)", "no": "not flagged (no)", "needs_data": "needs data", "not_assessed": "not assessed"}
CHECKLIST_SUBJECTS = {"insurance_review": "Insurance", "estate_review": "Estate planning", "education_review": "Education savings"}
TAIL = "Flag for review, not advice."
REVIEW_WORDS = {"doc_type_unknown": "document type not recognized", "member_ambiguous": "owner ambiguous",
                "member_unassigned": "no owner found", "member_model_disagrees": "the checker disputes the name match"}


def _money(value: Any) -> str:
    return money_format(float(value)) if isinstance(value, (int, float)) and not isinstance(value, bool) else str(value)


def _plural(count: int, singular: str, plural: str) -> str:
    return f"{count} {singular if count == 1 else plural}"


def _first(name: str) -> str:
    return name.split()[0]


def _value_text(field_id: str, value: Any) -> str:
    unit = tag_by_id("fields").get(field_id, {}).get("unit")
    if isinstance(value, bool):
        return "yes" if value else "no"
    if unit == "usd" or (unit is None and isinstance(value, (int, float)) and field_id not in ("dependents", "distribution_code")):
        return _money(value)
    return str(value)


def _check_text(number: dict, field_id: str) -> str:
    check = number.get("check", "not_checked")
    doc = number.get("source_document")
    if check == "verified":
        return f"verified against {doc}" if doc else "verified"
    if check == "mismatch":
        return f"mismatch: {doc} says otherwise" if doc else "mismatch: its source says otherwise"
    if check == "unconfirmed":
        return f"unconfirmed: not found in {doc}" if doc else "unconfirmed"
    if check == "conflicted":
        parts = [f"{_value_text(field_id, c['value'])} ({c['source_document']})" for c in number.get("candidates") or []]
        return "documents disagree: " + " vs ".join(parts) if parts else "documents disagree"
    return "not checked"


def _number_sentence(label: str, field_id: str, number: dict) -> str:
    if number.get("value") is None and number.get("check") != "conflicted":
        return f"{label}: none on file"
    shown = "no single value" if number.get("value") is None else _value_text(field_id, number["value"])
    return f"{label} {shown} ({_check_text(number, field_id)})"


def _member_names(overview: dict) -> dict[str, str]:
    return {m["person_id"]: m["name"] or m["person_id"] for m in overview["members"]}


def _number(overview: dict, person_id: str | None, field_id: str) -> dict | None:
    if person_id is None:
        s = overview.get("summary") or {}
        if field_id == "dependents":
            return {"value": s.get("dependents"), "check": s.get("dependents_check", "not_checked"),
                    "source_document": s.get("dependents_source_document")}
        key = {"adjusted_gross_income": "agi", "cash_balance": "cash", "mortgage_interest": "mortgage_interest"}.get(field_id)
        return s.get(key) if key else None
    card = next((m for m in overview["members"] if m["person_id"] == person_id), None)
    return next((n for n in card["numbers"] if n["field"] == field_id), None) if card else None


def _base_metadata(overview: dict, chunk_type: str) -> dict[str, Any]:
    return {
        "household_id": overview["household_id"], "person_ids": [], "member_roles": {}, "doc_type": None,
        "topics": [], "fields_present": [], "tax_year": overview["tax_year"], "source_document": None, "page": None,
        "textract_confidence_min": None, "attribution_status": None, "synthetic": True,
        "chunk_type": chunk_type, "checklist_id": None, "answer": None, "dollar_impact": None,
        "metrics": {}, "rule": None, "checks": {}, "notes": [], "ruleset_version": RULESET_VERSION,
    }


def _scores(value_checks: dict, keys: list[str]) -> dict[str, Any]:
    out = {k: [{"document": d["document"], **(d.get("model_scores") or {})} for d in value_checks.get(k, []) if d.get("model_scores")]
           for k in keys}
    return {k: v for k, v in out.items() if v}


def _min_conf(confidence: dict, keys: list[str]) -> float | None:
    values = [confidence[k] for k in keys if k in confidence]
    return min(values) if values else None


def _chunk(chunk_id: str, text: str, metadata: dict, value_checks: dict, keys: list[str]) -> dict:
    scores = _scores(value_checks, keys)
    if scores:
        metadata["model_scores"] = scores
    return {"id": chunk_id, "text": text, "metadata": metadata}


# ---------------------------------------------------------------- chunk builders


def _summary_chunk(overview: dict, vc: dict, conf: dict) -> dict:
    s = overview["summary"]
    hid = overview["household_id"]
    deps = s["dependents"]
    parts = [f"Household {hid}, tax year {overview['tax_year']}, filing status {(s['filing_status'] or 'unknown').replace('_', ' ')}",
             f"dependents {deps if deps is not None else 'none on file'} ({_check_text(_number(overview, None, 'dependents'), 'dependents')})",
             _number_sentence("AGI", "adjusted_gross_income", s["agi"]),
             _number_sentence("cash", "cash_balance", s["cash"])
             + (f", {s['cash']['months_of_income']} months of income" if s["cash"]["months_of_income"] is not None else ""),
             _number_sentence("mortgage interest", "mortgage_interest", s["mortgage_interest"])]
    text = "; ".join(parts) + f". Status: {overview['status'].replace('_', ' ')}, highest priority {overview['priority'] or 'none'}. {TAIL}"
    keys = ["household.dependents", "household.adjusted_gross_income", "household.cash_balance", "household.mortgage_interest"]
    md = _base_metadata(overview, "household_summary")
    md.update({"topics": overview["tags"]["household"]["topics"], "person_ids": [m["person_id"] for m in overview["members"]],
               "fields_present": [f for f in ("dependents", "adjusted_gross_income", "cash_balance", "mortgage_interest")
                                  if (s["dependents"] if f == "dependents" else _number(overview, None, f)["value"]) is not None],
               "checks": {k.split(".", 1)[1]: (s["dependents_check"] if k.endswith("dependents") else _number(overview, None, k.split(".", 1)[1])["check"]) for k in keys},
               "textract_confidence_min": _min_conf(conf, keys),
               "metrics": {"months_of_income": s["cash"]["months_of_income"]}})
    return _chunk(f"{hid}:household_summary:{hid}", text, md, vc, keys)


def _member_chunk(overview: dict, card: dict, vc: dict, conf: dict) -> dict:
    hid, pid = overview["household_id"], card["person_id"]
    member_tags = next(m for m in overview["tags"]["members"] if m["person_id"] == pid)
    sentences = [f"{card['name']} ({pid})" + (f", employer {card['employer']} (not checked)" if card["employer"] else "")]
    sentences += [_number_sentence(n["label"], n["field"], n) for n in card["numbers"]]
    text = ". ".join(sentences) + "."
    keys = [f"{pid}.{n['field']}" for n in card["numbers"]]
    roles = {}
    for d in overview["tags"]["documents"]:
        for m in d["members"]:
            if m["person_id"] == pid:
                roles[d["name"]] = m["role"]
    md = _base_metadata(overview, "member")
    md.update({"person_ids": [pid], "member_roles": {pid: sorted(set(roles.values()))},
               "topics": member_tags["topics"], "fields_present": member_tags["fields_present"],
               "checks": {n["field"]: n["check"] for n in card["numbers"]},
               "textract_confidence_min": _min_conf(conf, keys),
               "attribution_status": "assigned" if member_tags["documents"] else "unassigned",
               "source_document": None})
    return _chunk(f"{hid}:member:{pid}", text, md, vc, keys)


def _cannot_assess(overview: dict, item: dict, fields: tuple[str, ...]) -> list[str]:
    """Why a needs_data item can't be assessed, naming any conflicting values."""
    out = []
    for card in overview["members"]:
        for n in card["numbers"]:
            if n["field"] in fields and n["check"] == "conflicted":
                values = " vs ".join(_value_text(n["field"], c["value"]) for c in n.get("candidates") or [])
                out.append(f"{_first(card['name'] or card['person_id'])}'s {n['label'].lower()} conflict ({values}), so this can't be assessed")
    return out or [f"{item['reason']}, so this can't be assessed"]


def _retirement_sentences(overview: dict, item: dict) -> list[str]:
    if item["answer"] == "not_assessed":
        return ["No wage earners in this household"]
    if item["answer"] == "needs_data":
        return _cannot_assess(overview, item, ("wages", "employee_401k_contribution"))
    names = _member_names(overview)
    limit = item["metrics"].get("limit")
    out = []
    for pid, f in (item["metrics"].get("members") or {}).items():
        k401 = _number(overview, pid, "employee_401k_contribution") or {}
        out.append(f"{names.get(pid, pid)} contributes {_money(f['contribution'])} to the 401(k) "
                   f"({_check_text(k401, 'employee_401k_contribution')}): {f['pct_of_pay']}% of {_money(f['wages'])} pay, "
                   f"{f['pct_of_limit']}% of the {_money(limit)} limit, leaving {_money(f['room'])} of room")
    return out


def _tax_sentences(overview: dict, item: dict) -> list[str]:
    names = _member_names(overview)
    out = []
    for pid, f in (item["metrics"].get("members") or {}).items():
        name = names.get(pid, pid)
        if "self_employment_income" in f:
            se = _number(overview, pid, "self_employment_income") or {}
            out.append(f"{name} has {_money(f['self_employment_income'])} of self-employment income ({_check_text(se, 'self_employment_income')})")
        if "distribution_code" in f:
            taxable = _number(overview, pid, "retirement_distribution_taxable") or {}
            s = f"{name}'s 1099-R: code {f['distribution_code']}, taxable {_money(f['taxable'])} ({_check_text(taxable, 'retirement_distribution_taxable')})"
            if f.get("federal_withheld") is not None:
                s += f", federal withholding {_money(f['federal_withheld'])}"
                if f.get("withholding_pct") is not None:
                    s += f" ({f['withholding_pct']}% of taxable)"
            if f.get("estimated_additional_tax") is not None:
                s += f", estimated additional tax {_money(f['estimated_additional_tax'])} at {f['additional_tax_rate_pct']}%"
            out.append(s)
    if item["answer"] == "needs_data":
        out += _cannot_assess(overview, item, ("self_employment_income", "retirement_distribution_taxable", "federal_tax_withheld"))
    return out or ["No self-employment income or 1099-R on file"]


def _cash_sentences(overview: dict, item: dict) -> list[str]:
    m = item["metrics"]
    if "cash" not in m:
        return _cannot_assess(overview, item, ())
    s = overview["summary"]
    out = (f"Cash {_money(m['cash'])} ({_check_text(s['cash'], 'cash_balance')}) against AGI {_money(m['agi'])} "
           f"({_check_text(s['agi'], 'adjusted_gross_income')}): {m['months_of_income']} months of income vs a "
           f"{m['target_months']}-month cushion of {_money(m['target'])}")
    if m.get("excess") is not None:
        out += f"; {_money(m['excess'])} above it"
    return [out]


def _documents_sentences(overview: dict, item: dict) -> list[str]:
    m = item["metrics"]
    return [f"{_plural(m.get('conflicts', 0), 'value', 'values')} where documents disagree, "
            f"{_plural(m.get('hsa_without_plan', 0), 'HSA contribution', 'HSA contributions')} without plan proof, "
            f"{_plural(m.get('mismatches', 0), 'value', 'values')} that a document contradicts",
            *([item["reason"]] if item["answer"] == "yes" else [])]


def _changes_sentences(overview: dict, item: dict) -> list[str]:
    if item["answer"] == "not_assessed":
        return ["No prior year on file, so changes can't be assessed"]
    texts = [c["text"] for c in overview["changes_since_last_year"]]
    return [f"Compared with {item['metrics'].get('prior_tax_year')}: " + ("; ".join(texts) if texts else "no major changes")]


SENTENCES = {"retirement_can_improve": _retirement_sentences, "tax_savings_possible": _tax_sentences,
             "excess_cash": _cash_sentences, "needs_documents": _documents_sentences, "major_changes": _changes_sentences}


def _checklist_chunk(overview: dict, item: dict, vc: dict, conf: dict) -> dict:
    hid = overview["household_id"]
    spec = tag_by_id("checklist")[item["id"]]
    md = _base_metadata(overview, "checklist")
    md.update({"checklist_id": item["id"], "answer": item["answer"], "dollar_impact": item["dollar_impact"],
               "metrics": item["metrics"], "rule": item["rule"], "topics": [spec["topic"]] if spec["topic"] in tag_ids("topics") else []})
    if not spec["assessed"]:
        text = f"{CHECKLIST_SUBJECTS.get(item['id'], item['question'])} has not been assessed: no data or rules yet. Result: not assessed. {TAIL}"
        return _chunk(f"{hid}:checklist:{item['id']}", text, md, vc, [])
    sentences = SENTENCES[item["id"]](overview, item)
    impact = f" Dollar impact: {_money(item['dollar_impact'])}." if item["dollar_impact"] is not None else ""
    text = (f"{item['question']} " + ". ".join(sentences) + f". Rule: {item['rule']}. Result: {ANSWER_WORDS[item['answer']]}."
            + impact + f" {TAIL}")
    keys = _checklist_keys(overview, item)
    md["checks"] = {k: c for k, c in ((k, _key_check(overview, k)) for k in keys) if c}
    md["person_ids"] = sorted({k.split(".")[0] for k in keys if not k.startswith("household.")})
    md["fields_present"] = sorted({k.split(".", 1)[1] for k in keys} & set(tag_ids("fields")))
    md["textract_confidence_min"] = _min_conf(conf, keys)
    return _chunk(f"{hid}:checklist:{item['id']}", text, md, vc, keys)


def _checklist_keys(overview: dict, item: dict) -> list[str]:
    members = list((item["metrics"].get("members") or {}).keys())
    if item["id"] == "retirement_can_improve":
        return [f"{p}.{f}" for p in members for f in ("employee_401k_contribution", "wages")]
    if item["id"] == "tax_savings_possible":
        return [f"{p}.{f}" for p in members for f in ("self_employment_income", "retirement_distribution_taxable", "federal_tax_withheld")
                if _number(overview, p, f)]
    if item["id"] == "excess_cash":
        return ["household.cash_balance", "household.adjusted_gross_income"]
    return []


def _key_check(overview: dict, key: str) -> str | None:
    owner, field_id = key.split(".", 1)
    number = _number(overview, None if owner == "household" else owner, field_id)
    return number.get("check") if number else None


def _finding_chunk(overview: dict, finding: dict, evidence: dict, vc: dict, conf: dict) -> dict:
    hid = overview["household_id"]
    ev = evidence.get(finding["id"], {})
    keys = [v["key"] for v in ev.get("values", [])]
    values = []
    for v in ev.get("values", []):
        owner = v["key"].split(".", 1)[0]
        number = _number(overview, None if owner == "household" else owner, v["field"]) or {"check": v["check"], "value": v["value"]}
        values.append(_number_sentence(v["label"].lower(), v["field"], number))
    impact = f" Dollar impact: {_money(finding['dollar_impact'])}." if finding["dollar_impact"] is not None else ""
    text = (f"{finding['headline']}. {finding['explanation']} Values: {'; '.join(values) or 'none'}. Rule: {finding['rule']}. "
            f"Result: {finding['priority']} priority {finding['category'].replace('_', ' ')} finding.{impact} "
            f"Action: {finding['action_label']}. {TAIL}")
    md = _base_metadata(overview, "finding")
    md.update({"person_ids": [finding["person_id"]] if finding["person_id"] else [],
               "dollar_impact": finding["dollar_impact"], "metrics": finding["metrics"], "rule": finding["rule"],
               "answer": finding["priority"], "checks": {v["key"]: v["check"] for v in ev.get("values", [])},
               "fields_present": sorted({v["field"] for v in ev.get("values", [])} & set(tag_ids("fields"))),
               "topics": [], "textract_confidence_min": _min_conf(conf, keys), "finding_type": finding["type"],
               "category": finding["category"]})
    return _chunk(f"{hid}:finding:{finding['id']}", text, md, vc, keys)


def _document_chunk(overview: dict, doc: dict) -> dict:
    hid = overview["household_id"]
    doc_label = tag_by_id("doc_types")[doc["doc_type"]]["label"]
    topic_labels = [tag_by_id("topics")[t]["label"] for t in doc["topics"]]
    who = (", ".join(f"{m['name']} ({m['role']})" for m in doc["members"]) if doc["members"]
           else ("no member: the name match is ambiguous" if doc["attribution_status"] == "ambiguous" else "no household member"))
    method = "form-number pattern" if doc["doc_type_method"] == "pattern" else "not recognized"
    text = (f"Document {doc['name']}: {doc_label} ({method}). Belongs to {who}. "
            f"Topics: {', '.join(topic_labels) or 'none'}. "
            f"Confirmed content tags: {', '.join(doc['model_tags']) or 'none'}. "
            + ("Status: accepted." if doc["status"] == "accepted"
               else f"Status: needs review ({', '.join(REVIEW_WORDS.get(r, r) for r in doc['review_reasons'])})."))
    md = _base_metadata(overview, "document")
    md.update({"person_ids": [m["person_id"] for m in doc["members"]],
               "member_roles": {m["person_id"]: [m["role"]] for m in doc["members"]}, "notes": doc.get("notes", []),
               "doc_type": doc["doc_type"], "topics": doc["topics"], "source_document": doc["name"], "page": 1,
               "attribution_status": doc["attribution_status"],
               "fields_present": [f for f in tag_by_id("doc_types")[doc["doc_type"]]["fields"] if f in tag_ids("fields")]})
    return {"id": f"{hid}:document:{doc['name']}", "text": text, "metadata": md}


def _changes_chunk(overview: dict) -> dict:
    hid = overview["household_id"]
    item = next(i for i in overview["checklist"] if i["id"] == "major_changes")
    if item["answer"] == "not_assessed":
        text = "Changes since last year have not been assessed: no prior year on file."
    else:
        changes = overview["changes_since_last_year"]
        text = (f"Changes since {item['metrics'].get('prior_tax_year')}: " + ("; ".join(c["text"] for c in changes) if changes else "none")
                + f". Rule: {item['rule']}.")
    md = _base_metadata(overview, "changes")
    md.update({"answer": item["answer"], "metrics": item["metrics"], "rule": item["rule"], "topics": ["life_event"]})
    return {"id": f"{hid}:changes:{hid}", "text": text, "metadata": md}


def rag_chunks(overview: dict, evidence: dict, value_checks: dict | None = None, textract_confidence: dict | None = None) -> list[dict]:
    """Chunks for one household. Needs a full overview (status findings/no_findings)."""
    if overview["status"] == "needs_review" or overview.get("summary") is None:
        return []
    vc, conf = value_checks or {}, textract_confidence or {}
    chunks = [_summary_chunk(overview, vc, conf)]
    chunks += [_member_chunk(overview, card, vc, conf) for card in overview["members"]]
    chunks += [_checklist_chunk(overview, item, vc, conf) for item in overview["checklist"]]
    chunks += [_finding_chunk(overview, f, evidence, vc, conf) for f in overview["findings"]]
    chunks += [_document_chunk(overview, d) for d in overview["tags"]["documents"]]
    chunks.append(_changes_chunk(overview))
    return chunks


__all__ = ["MAX_TEXT", "rag_chunks", "tags"]
