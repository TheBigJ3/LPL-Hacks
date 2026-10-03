"""Ask: route an advisor's question to an answer built ONLY from overview data (amendment §6).

Routing is a pluggable Router; KeywordRouter is deterministic keyword rules over the tag file's
intents, field synonyms, time_refs and the household's member names. No OpenDecision anywhere here
(measured: `choice` routed 13/28 questions correctly). Answers never invent a number: every value
comes from the overview, and anything missing is "No data".
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field as dc_field
from typing import Any, Protocol

from rapid_analysis.evidence import money_format
from rapid_analysis.taxonomy import tag_by_id, tags

# ---------------------------------------------------------------- text helpers

LEMMAS = {"does": "do", "did": "do", "doing": "doing", "makes": "make", "made": "make", "earns": "earn", "earned": "earn",
          "works": "work", "worked": "work", "working": "work", "has": "have", "had": "have", "is": "be", "are": "be",
          "was": "be", "were": "be"}
STOPWORDS = set("""
a an and any anyone anything are as at be both client clients could did do does each either everyone family
for from has have he her here hers him his household how i if in is it its me my no not now of on or our
she should so some someone than that the their them then there these they this those to today tomorrow us
was we were what when where which who whom why will with would year years you your w2 w-2 1040 1099
""".split())
NAME_SLOTS = [re.compile(p) for p in (
    r"\b(?:can|could|does|did|is|has|will|should|would|about)\s+([a-z]+)\b",
    r"\bhow(?:'s| is| are)\s+([a-z]+)\b",
    r"\b([a-z]+)'s\b",
)]


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower().replace("’", "'")).strip()


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9()\-]+(?:'s)?", _clean(text))


def _stem(token: str) -> str:
    token = token.removesuffix("'s")
    token = LEMMAS.get(token, token)
    return token[:-1] if len(token) > 3 and token.endswith("s") and not token.endswith("ss") else token


def _stems(text: str) -> list[str]:
    return [_stem(t) for t in _words(text)]


def _has_phrase(stems: list[str], phrase: str) -> bool:
    """Phrase match on stems; '*' in the phrase matches exactly one word."""
    parts: list[str] = []
    for raw in phrase.lower().split():
        parts.extend(["*"] if raw == "*" else [_stem(w) for w in _words(raw)])
    n = len(parts)
    for i in range(len(stems) - n + 1):
        if n and all(p == "*" or stems[i + j] == p for j, p in enumerate(parts)):
            return True
    return False


# ---------------------------------------------------------------- routing


@dataclass
class Understood:
    intent: str
    person_id: str | None = None
    member: str | None = None
    field: str | None = None
    time_ref: str = "current_year"
    year: int | None = None
    router: str = "keyword"
    unknown_member: str | None = None
    ambiguous_members: list[str] = dc_field(default_factory=list)


class Router(Protocol):
    name: str

    def route(self, question: str, overview: dict) -> Understood: ...


# Intent keyword rules, in precedence order (verify > documents_status > changes > tax > cash > savings > overview).
INTENT_RULES: list[tuple[str, list[str]]] = [
    ("verify", ["verified", "verify", "confirmed", "confirm", "accurate", "trust", "correct", "match", "backed up"]),
    ("documents_status", ["missing", "paperwork", "document", "documents", "request", "waiting on", "ask them for",
                          "still need", "proof", "conflict", "disagree", "agree", "need from"]),
    ("changes", ["changed", "change", "switch", "switched", "new job", "since last year", "what's new", "what is new",
                 "baby", "buy a house", "bought a house", "new house", "happened", "happen", "moved"]),
    ("tax_opportunity", ["tax", "taxes", "penalty", "owe", "tax bill"]),
    ("cash_opportunity", ["too much cash", "too much money", "idle", "sitting", "invest", "put to work", "extra cash",
                          "excess cash", "holding too much"]),
    ("savings_opportunity", ["save", "saving", "savings", "maxing", "max out", "maxed", "enough", "bump",
                             "contribute more", "more for retirement"]),
    ("overview", ["summary", "rundown", "overview", "how is * doing", "how be * doing", "anything i should know",
                  "what should i know", "tell me about", "overall"]),
]
LOOKUP_WORDS = ["how much", "how many", "what be", "what's", "who", "where", "which"]
DOCUMENT_WORDS = ["w-2", "w2", "tax return", "1040", "1099", "1099-r", "1098", "statement"]


class KeywordRouter:
    name = "keyword"

    def __init__(self) -> None:
        self.fields = tags()["fields"]
        self.time_refs = tag_by_id("time_refs")

    def _member(self, question: str, overview: dict, u: Understood) -> None:
        words = [w.removesuffix("'s") for w in _words(question)]
        stems = set(words) | {w[:-1] for w in words if w.endswith("s")}
        members = [(m["person_id"], m["name"]) for m in overview.get("members", []) if m.get("name")]
        by_first: dict[str, list[tuple[str, str]]] = {}
        for pid, name in members:
            by_first.setdefault(name.split()[0].lower(), []).append((pid, name))
        hits = [(pid, name) for first, group in by_first.items() if first in stems for pid, name in group]
        if len(hits) == 1:
            u.person_id, u.member = hits[0]
            return
        if len(hits) > 1:
            u.ambiguous_members = [name for _, name in hits]
            return
        known = {n.lower() for _, name in members for n in name.split()}
        vocabulary = {_stem(w) for f in self.fields for s in f["synonyms"] for w in _words(s)}
        vocabulary |= {_stem(w) for _, words_ in INTENT_RULES for k in words_ for w in _words(k)}
        for pattern in NAME_SLOTS:
            for candidate in pattern.findall(_clean(question)):
                if candidate in STOPWORDS or candidate in known or _stem(candidate) in vocabulary or candidate.isdigit():
                    continue
                u.unknown_member = candidate
                return

    def _time(self, question: str, overview: dict, u: Understood) -> None:
        stems = _stems(question)
        year = re.search(self.time_refs["explicit_year"]["pattern"], question)
        if year:
            u.time_ref, u.year = "explicit_year", int(year.group(0))
            return
        for ref in ("prior_year", "current_year"):
            if any(_has_phrase(stems, s) for s in self.time_refs[ref]["synonyms"]):
                u.time_ref = ref
                return

    def _field(self, question: str, u: Understood) -> None:
        stems = _stems(question)
        best: tuple[int, str] | None = None
        for f in self.fields:
            for synonym in f["synonyms"]:
                if _has_phrase(stems, synonym):
                    length = len(_words(synonym))
                    if best is None or length > best[0]:
                        best = (length, f["id"])
        if best is None:
            return
        u.field = best[1]
        if u.field == "wages" and u.person_id is None and any(_has_phrase(stems, s) for s in ("income",)):
            u.field = "adjusted_gross_income"
        if u.field == "adjusted_gross_income" and u.person_id is not None:
            u.field = "wages"

    def route(self, question: str, overview: dict) -> Understood:
        u = Understood(intent="out_of_scope")
        self._member(question, overview, u)
        self._time(question, overview, u)
        self._field(question, u)
        stems = _stems(question)
        mentions = sum(1 for d in DOCUMENT_WORDS if _has_phrase(stems, d))
        if mentions >= 2 and any(_has_phrase(stems, w) for w in ("match", "agree", "disagree")):
            u.intent = "documents_status"
            return u
        for intent, keywords in INTENT_RULES:
            if any(_has_phrase(stems, k) for k in keywords):
                u.intent = intent
                return u
        if u.field is not None or any(_has_phrase(stems, w) for w in LOOKUP_WORDS) and u.person_id:
            u.intent = "lookup"
        return u


# ---------------------------------------------------------------- answering (overview data only)

CHECK_TEXT = {
    "verified": "verified against {doc}",
    "mismatch": "{doc} says otherwise",
    "unconfirmed": "unconfirmed: not found in {doc}",
    "conflicted": "documents disagree",
    "not_checked": "not checked",
}
ANSWER_SHORT = {"yes": "Yes", "no": "No", "needs_data": "Needs data", "not_assessed": "Not assessed"}


def _fmt(field_id: str | None, value: Any) -> str:
    unit = tag_by_id("fields").get(field_id or "", {}).get("unit")
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, (int, float)) and unit == "usd":
        return money_format(float(value))
    if field_id == "filing_status" and isinstance(value, str):
        return value.replace("_", " ")
    return str(value)


def _check_phrase(number: dict) -> str:
    if number.get("check") == "conflicted" and number.get("candidates"):
        parts = [f"{_fmt(number.get('field'), c['value'])} on {c['source_document']}" for c in number["candidates"]]
        return "documents disagree: " + " vs ".join(parts)
    return CHECK_TEXT[number.get("check", "not_checked")].format(doc=number.get("source_document") or "its document")


def _value_out(number: dict) -> dict:
    return {"field": number.get("field"), "value": number.get("value"), "check": number.get("check", "not_checked"),
            "source_document": number.get("source_document"), "page": number.get("page")}


def _first(name: str | None) -> str:
    return name.split()[0] if name else "The household"


def _card(overview: dict, person_id: str) -> dict:
    return next(m for m in overview["members"] if m["person_id"] == person_id)


def _summary_number(overview: dict, field_id: str) -> dict | None:
    s = overview.get("summary") or {}
    key = {"adjusted_gross_income": "agi", "cash_balance": "cash", "mortgage_interest": "mortgage_interest"}.get(field_id)
    if key:
        return {"field": field_id, **{k: s[key].get(k) for k in ("value", "check", "source_document", "page")}}
    if field_id == "dependents":
        return {"field": field_id, "value": s.get("dependents"), "check": s.get("dependents_check", "not_checked"),
                "source_document": s.get("dependents_source_document"), "page": None}
    if field_id == "filing_status":
        return {"field": field_id, "value": s.get("filing_status"), "check": "not_checked", "source_document": None, "page": None}
    return None


def _year_of(overview: dict, u: Understood) -> tuple[str, int | None]:
    """-> ('current'|'prior'|'none', year)."""
    current = overview.get("tax_year")
    prior = (overview.get("prior_year") or {}).get("tax_year")
    if u.time_ref == "prior_year":
        return ("prior", prior) if overview.get("prior_year") else ("none", (current - 1) if current else None)
    if u.time_ref == "explicit_year":
        if u.year == current:
            return "current", current
        if overview.get("prior_year") and u.year == prior:
            return "prior", prior
        return "none", u.year
    return "current", current


def _no_data(u: Understood, year: int | None, what: str) -> dict:
    when = f" for {year}" if year else ""
    return {"type": "value", "short": "No data", "text": f"No {what} on file{when}.", "dollar_impact": None, "values": []}


def _answer_lookup(overview: dict, u: Understood) -> dict:
    if u.field is None:
        return {"type": "none", "short": "Which number?", "text": "", "dollar_impact": None, "values": []}
    label = tag_by_id("fields")[u.field]["label"].lower()
    whose = f"{_first(u.member)}'s" if u.person_id else "The household's"
    period, year = _year_of(overview, u)
    if period == "none":
        return _no_data(u, year, f"{label} for {u.member or 'the household'}")
    if period == "prior":
        prior = overview["prior_year"]
        pool = next((m["numbers"] for m in prior["members"] if m["person_id"] == u.person_id), []) if u.person_id else prior["numbers"]
        if u.field == "filing_status" and not u.person_id:
            value = prior.get("filing_status")
        else:
            value = next((n["value"] for n in pool if n["field"] == u.field), None)
        if value is None:
            return _no_data(u, year, f"{label} for {u.member or 'the household'}")
        number = {"field": u.field, "value": value, "check": "not_checked", "source_document": None, "page": None}
        return {"type": "value", "short": _fmt(u.field, value),
                "text": f"{whose} {label} in {year} was {_fmt(u.field, value)} (not checked: prior-year values have no document).",
                "dollar_impact": None, "values": [number]}
    if u.person_id:
        card = _card(overview, u.person_id)
        if u.field == "employer":
            if not card.get("employer"):
                return _no_data(u, year, f"employer for {u.member}")
            number = {"field": "employer", "value": card["employer"], "check": "not_checked", "source_document": None, "page": None}
            return {"type": "value", "short": card["employer"], "text": f"{_first(u.member)} works for {card['employer']} (not checked).",
                    "dollar_impact": None, "values": [number]}
        number = next((n for n in card["numbers"] if n["field"] == u.field), None)
    else:
        number = _summary_number(overview, u.field)
    if number is None or (number.get("value") is None and number.get("check") != "conflicted"):
        return _no_data(u, year, f"{label} for {u.member or 'the household'}")
    shown = "not known until the documents agree" if number.get("value") is None else _fmt(u.field, number["value"])
    return {"type": "value", "short": shown if number.get("value") is not None else "Conflicted",
            "text": f"{whose} {label} for {year} is {shown} ({_check_phrase(number)}).",
            "dollar_impact": None, "values": [_value_out(number)]}


def _checklist(overview: dict, item_id: str) -> dict:
    return next(i for i in overview["checklist"] if i["id"] == item_id)


def _member_findings(overview: dict, person_id: str, category: str | None = None) -> list[dict]:
    return [f for f in overview["findings"] if f["person_id"] == person_id and (category is None or f["category"] == category)]


def _answer_savings(overview: dict, u: Understood) -> dict:
    item = _checklist(overview, "retirement_can_improve")
    if u.person_id is None:
        return {"type": "checklist", "short": ANSWER_SHORT[item["answer"]], "text": item["reason"] + ".",
                "dollar_impact": item["dollar_impact"], "values": []}
    facts = (item.get("metrics") or {}).get("members", {}).get(u.person_id)
    card = _card(overview, u.person_id)
    k401 = next((n for n in card["numbers"] if n["field"] == "employee_401k_contribution"), None)
    values = [_value_out(k401)] if k401 else []
    first = _first(u.member)
    if facts is None:
        if item["answer"] == "needs_data" and any(first in part for part in item["reason"].split(";")):
            return {"type": "checklist", "short": "Needs data", "text": item["reason"] + ".", "dollar_impact": None, "values": values}
        return {"type": "checklist", "short": "Not assessed", "text": f"{first} has no wages on file, so 401(k) savings are not assessed.",
                "dollar_impact": None, "values": values}
    limit = item["metrics"]["limit"]
    flagged = bool(_member_findings(overview, u.person_id, "retirement"))
    text = (f"{first} contributes {money_format(facts['contribution'])} to the 401(k), {facts['pct_of_limit']}% of the "
            f"{money_format(limit)} limit. {money_format(facts['room'])} of room is left.")
    return {"type": "checklist", "short": "Yes" if flagged else "No", "text": text,
            "dollar_impact": facts["room"] if flagged else None, "values": values}


def _answer_flag(overview: dict, u: Understood, item_id: str, category: str) -> dict:
    item = _checklist(overview, item_id)
    if u.person_id is not None:
        found = [f for f in _member_findings(overview, u.person_id, category) if f["priority"] not in ("informational", "low")]
        if found:
            impacts = [f["dollar_impact"] for f in found if f["dollar_impact"] is not None]
            return {"type": "checklist", "short": "Yes", "text": " ".join(f["explanation"] for f in found),
                    "dollar_impact": sum(impacts) if impacts else None, "values": []}
        if item["answer"] == "yes":
            return {"type": "checklist", "short": "No", "text": f"Nothing flagged for {_first(u.member)}; {item['reason']}.",
                    "dollar_impact": None, "values": []}
    return {"type": "checklist", "short": ANSWER_SHORT[item["answer"]], "text": item["reason"] + ".",
            "dollar_impact": item["dollar_impact"], "values": []}


def _answer_documents(overview: dict, u: Understood) -> dict:
    item = _checklist(overview, "needs_documents")
    dq = overview["data_quality"]
    parts = [m["description"] for m in dq["missing_documents"] if u.person_id in (None, m["person_id"])]
    parts += [f"{c['label']} disagree: " + " vs ".join(f"{_fmt(c['field'], x['value'])} on {x['source_document']}" for x in c["candidates"])
              for c in dq["conflicts"] if u.person_id in (None, c["person_id"])]
    parts += [f"{d['name']} needs review" for d in dq.get("documents_needing_review", [])
              if any(r.startswith("member_") or r.startswith("doc_type") for r in d["review_reasons"])]
    text = ("Still needed: " + "; ".join(parts) + ".") if parts else "Nothing is missing or conflicting."
    return {"type": "documents", "short": ANSWER_SHORT[item["answer"]], "text": text, "dollar_impact": None, "values": []}


def _answer_changes(overview: dict, u: Understood) -> dict:
    item = _checklist(overview, "major_changes")
    if item["answer"] == "not_assessed":
        return {"type": "changes", "short": "No data", "text": "No prior year on file, so changes are not assessed.",
                "dollar_impact": None, "values": []}
    changes = overview["changes_since_last_year"]
    if u.person_id:
        first = _first(u.member)
        changes = [c for c in changes if c["text"].startswith(first)]
    if not changes:
        return {"type": "changes", "short": "No", "text": f"No major changes{' for ' + _first(u.member) if u.person_id else ''} since last year.",
                "dollar_impact": None, "values": []}
    return {"type": "changes", "short": "Yes", "text": "; ".join(c["text"] for c in changes) + ".", "dollar_impact": None, "values": []}


def _answer_verify(overview: dict, u: Understood) -> dict:
    if u.person_id:
        numbers = _card(overview, u.person_id)["numbers"]
    else:
        numbers = [n for n in (_summary_number(overview, f) for f in ("adjusted_gross_income", "cash_balance", "mortgage_interest")) if n]
    if u.field:
        numbers = [n for n in numbers if n["field"] == u.field]
    numbers = [n for n in numbers if n.get("value") is not None or n.get("check") == "conflicted"]
    if not numbers:
        return {"type": "verify", "short": "No data", "text": "No such value on file.", "dollar_impact": None, "values": []}
    labels = tag_by_id("check_status")
    whose = f"{_first(u.member)}'s" if u.person_id else "The household's"
    sentences = [f"{whose} {tag_by_id('fields').get(n['field'], {}).get('label', n['field']).lower()} of "
                 f"{_fmt(n['field'], n['value']) if n.get('value') is not None else '(no single value)'} is {_check_phrase(n)}"
                 + (f" (page {n['page']})" if n.get("page") and n.get("check") == "verified" else "") for n in numbers]
    short = labels[numbers[0]["check"]]["label"] if len(numbers) == 1 else f"{sum(n['check'] == 'verified' for n in numbers)} of {len(numbers)} verified"
    return {"type": "verify", "short": short, "text": ". ".join(sentences) + ".", "dollar_impact": None,
            "values": [_value_out(n) for n in numbers]}


def _answer_overview(overview: dict, u: Understood) -> dict:
    findings = [f for f in overview["findings"] if u.person_id in (None, f["person_id"]) and f["priority"] in ("medium", "high")]
    who = _first(u.member) if u.person_id else "This household"
    if not findings:
        return {"type": "overview", "short": "Nothing flagged", "text": f"{who} has no findings at medium priority or above.",
                "dollar_impact": None, "values": []}
    impacts = [f["dollar_impact"] for f in findings if f["dollar_impact"] is not None]
    return {"type": "overview", "short": f"{len(findings)} flagged", "text": " ".join(f"{f['headline']}." for f in findings[:4]),
            "dollar_impact": sum(impacts) if impacts else None, "values": []}


def suggestions_for(overview: dict) -> list[str]:
    names = [m["name"].split()[0] for m in overview.get("members", []) if m.get("name")]
    first = names[0] if names else None
    earners = [m["name"].split()[0] for m in overview.get("members", []) if any(n["field"] == "wages" for n in m["numbers"])]
    out = []
    if earners:
        out.append(f"Can {earners[0]} save more for retirement?")
    out.append("Can they save on taxes?")
    out.append("Are we missing any documents?")
    out.append("What changed since last year?" if overview.get("prior_year") else "How much cash do they have?")
    if first:
        out.append(f"Is {first}'s income verified?")
    out.append("Give me a quick summary.")
    return list(dict.fromkeys(out))[:4]


ANSWERERS = {
    "lookup": _answer_lookup,
    "savings_opportunity": _answer_savings,
    "tax_opportunity": lambda o, u: _answer_flag(o, u, "tax_savings_possible", "tax"),
    "cash_opportunity": lambda o, u: _answer_flag(o, u, "excess_cash", "cash_management"),
    "documents_status": _answer_documents,
    "changes": _answer_changes,
    "verify": _answer_verify,
    "overview": _answer_overview,
}


def ask(question: str, overview: dict, router: Router | None = None) -> dict:
    router = router or KeywordRouter()
    u = router.route(question, overview)
    understood = {"intent": u.intent, "person_id": u.person_id, "member": u.member, "field": u.field,
                  "time_ref": u.time_ref, "router": router.name}
    if u.unknown_member or u.ambiguous_members:
        names = u.ambiguous_members or [m["name"] for m in overview.get("members", []) if m.get("name")]
        who = f"No household member named {u.unknown_member.capitalize()}." if u.unknown_member else "More than one member matches."
        return {"question": question, "understood": {**understood, "person_id": None, "member": None},
                "answer": {"type": "none", "short": "Which member?", "text": f"{who} Which member do you mean?",
                           "dollar_impact": None, "values": []},
                "suggestions": [f"Which member: {n}?" for n in names]}
    if u.intent == "out_of_scope":
        return {"question": question, "understood": understood,
                "answer": {"type": "none", "short": "", "text": "", "dollar_impact": None, "values": []},
                "suggestions": suggestions_for(overview)}
    answer = ANSWERERS[u.intent](overview, u)
    return {"question": question, "understood": understood, "answer": answer,
            "suggestions": [] if answer["type"] != "none" else suggestions_for(overview)}
