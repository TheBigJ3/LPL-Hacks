"""Deterministic, versioned rules (§5). Python decides every answer, finding, category, priority and dollar figure.

OpenDecision is never consulted here; the only model output a rule reads is a value's check
(a `mismatch` makes more documentation necessary).

Ids, checklist questions, finding headlines and action labels come from config/tags.json. Every
finding and checklist item carries the exact numbers it was decided on (`metrics`) and the
threshold it applied (`rule`), so downstream text never recomputes anything.

Value keys: household fields are "household.<field>", member fields are "<person_id>.<field>".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

from rapid_analysis import RULESET_VERSION
from rapid_analysis.evidence import Check, money_format
from rapid_analysis.normalization import HOUSEHOLD_FIELDS, MEMBER_FIELDS, FieldValue, Household, Member
from rapid_analysis.taxonomy import field_label, finding_text, tag_by_id, tag_ids, tags

Answer = str
Priority = str
Category = str
Status = str

ANSWER_VALUES: tuple[str, ...] = tuple(tags()["checklist_answers"])
PRIORITY_VALUES: tuple[str, ...] = tuple(tags()["priorities"])
CATEGORY_VALUES: tuple[str, ...] = tuple(tags()["categories"])
STATUS_VALUES: tuple[str, ...] = tuple(tags()["household_status"])
PRIORITY_RANK = {p: i for i, p in enumerate(PRIORITY_VALUES)}
FINDING_CATEGORY = {fid: spec["category"] for fid, spec in tag_by_id("finding_types").items()}

# 401(k) employee elective deferral limit by tax year (IRS). Add a year only from IRS guidance.
# An unknown year means needs_data. Catch-up contributions are not modeled.
# 2026: IRS Notice 2025-67 / IRS news release 2025-11-13, https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500
LIMIT_401K: dict[int, float] = {2025: 23500.0, 2026: 24500.0}

RETIREMENT_LOW_SHARE = 0.50
RETIREMENT_HIGH_SHARE = 0.15
SELF_EMPLOYMENT_HIGH = 40000.0
EARLY_DISTRIBUTION_RATE = 0.10
NORMAL_WITHHOLDING_RATE = 0.10
CASH_MONTHS_TARGET = 6
CASH_MONTHS_HIGH = 12
AGI_CHANGE_SHARE = 0.25
LIFE_EVENTS_FOR_HIGH = 3

CHECKLIST_QUESTIONS: dict[str, str] = {c["id"]: c["question"] for c in tags()["checklist"]}
ASSESSED = [c["id"] for c in tags()["checklist"] if c["assessed"]]
PLACEHOLDER_REASONS = {
    "insurance_review": "No insurance data or rules yet",
    "estate_review": "No estate planning data or rules yet",
    "education_review": "No education savings data or rules yet",
}
CHANGE_TYPES = tuple(fid for fid, cat in FINDING_CATEGORY.items() if cat == "life_event")
FIELD_LABELS: dict[str, str] = {name: field_label(name) for name in [*HOUSEHOLD_FIELDS, *MEMBER_FIELDS]}

# The numbers each rule text quotes, always present in that checklist item's metrics.
RULE_THRESHOLDS: dict[str, dict[str, int]] = {
    "retirement_can_improve": {"flag_below_pct_of_limit": 50, "high_below_pct_of_limit": 15},
    "tax_savings_possible": {"self_employment_above": 0, "early_additional_tax_pct": 10, "flag_below_withholding_pct": 10},
    "excess_cash": {"target_months": CASH_MONTHS_TARGET, "high_above_months": CASH_MONTHS_HIGH},
    "major_changes": {"flag_change_pct": 25, "high_at_events": LIFE_EVENTS_FOR_HIGH},
}


def rule_text(item_id: str, limit: float | None = None) -> str:
    limit_text = money_format(limit) if limit else "IRS"
    return {
        "retirement_can_improve": (f"a 401(k) contribution under 50% of the {limit_text} limit flags retirement for review "
                                   "(under 15% is high priority)"),
        "tax_savings_possible": ("self-employment income above $0, a 1099-R code 1 early distribution (estimated 10% additional tax), "
                                 "or a code 7 distribution with federal withholding under 10% of the taxable amount flags tax for review"),
        "excess_cash": "cash above 6 months of income (AGI / 12) flags excess cash for review (above 12 months is high priority)",
        "needs_documents": ("documents that disagree, an HSA contribution with no documented eligible plan, or a value contradicted by "
                            "the document it came from means more documentation is needed"),
        "major_changes": ("with a prior year on file, a new dependent, a new employer, a new mortgage, or AGI changing 25% or more "
                          "is a major change (3 or more together is high priority)"),
    }.get(item_id, "not assessed: no data or rules yet")


@dataclass(kw_only=True)
class Finding:
    type: str
    priority: str
    explanation: str
    dollar_impact: float | int | None
    member: str | None = None
    person_id: str | None = None
    value_keys: list[str] = field(default_factory=list)  # values this finding rests on (for check + evidence drill-down)
    metrics: dict[str, Any] = field(default_factory=dict)
    rule: str = ""
    category: str = ""
    headline: str = ""
    action_label: str = ""
    id: str = ""


@dataclass
class ChecklistItem:
    id: str
    question: str
    answer: str
    reason: str
    dollar_impact: float | int | None = None
    finding_ids: list[str] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    rule: str = ""


@dataclass
class Change:
    type: str
    text: str


@dataclass
class RulesResult:
    checklist: list[ChecklistItem]
    findings: list[Finding]
    changes: list[Change]
    status: str
    priority: str | None
    ruleset_version: str = RULESET_VERSION


@dataclass
class _Answer:
    answer: str
    reason: str
    impact: float | None = None
    findings: list[Finding] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------- helpers


def first_name(member: Member) -> str:
    return (member.name or member.person_id).split()[0]


def pct(share: float, digits: int = 0) -> str:
    return f"{share * 100:.{digits}f}%"


def pct_num(share: float, digits: int = 0) -> float | int:
    value = round(share * 100, digits)
    return int(value) if digits == 0 else value


def num(value: float | None) -> float | int | None:
    """Round money to cents; integral amounts as int so JSON reads 21500, not 21500.0."""
    if value is None:
        return None
    value = round(value, 2)
    return int(value) if value == int(value) else value


def _amount(fv: FieldValue | None) -> float | None:
    if fv is None or fv.conflict or not isinstance(fv.value, (int, float)) or isinstance(fv.value, bool):
        return None
    return float(fv.value)


def _conflicted(fv: FieldValue | None) -> bool:
    return fv is not None and fv.conflict


def _join(parts: list[str]) -> str:
    if len(parts) <= 1:
        return "".join(parts)
    return ", ".join(parts[:-1]) + " and " + parts[-1]


def retirement_limit(tax_year: int | None) -> float | None:
    return LIMIT_401K.get(tax_year) if tax_year is not None else None


def _fmt(name: str, value: Any) -> str:
    if isinstance(value, (int, float)) and not isinstance(value, bool) and name not in ("dependents", "distribution_code"):
        return money_format(float(value))
    return str(value)


def _all_fields(household: Household) -> list[tuple[str, str, FieldValue | None, Member | None]]:
    out: list[tuple[str, str, FieldValue | None, Member | None]] = [
        (f"household.{name}", name, fv, None) for name, fv in household.fields.items()
    ]
    for m in household.members:
        out += [(f"{m.person_id}.{name}", name, fv, m) for name, fv in m.fields.items()]
    return out


# ---------------------------------------------------------------- rules


def _retirement(household: Household, findings: list[Finding]) -> _Answer:
    earners = [m for m in household.members if _conflicted(m.get("wages")) or (_amount(m.get("wages")) or 0) > 0]
    if not earners:
        return _Answer("not_assessed", "No household member has wages")
    limit = retirement_limit(household.tax_year)
    if limit is None:
        return _Answer("needs_data", f"No 401(k) limit on file for tax year {household.tax_year}",
                       metrics={"tax_year": household.tax_year})

    low, missing, per_member = [], [], {}
    for m in earners:
        contribution = _amount(m.get("employee_401k_contribution"))
        if _conflicted(m.get("wages")):
            missing.append(f"{first_name(m)}'s wages disagree between documents")
            continue
        if contribution is None:
            missing.append(f"{first_name(m)}'s 401(k) contribution is missing")
            continue
        wages = _amount(m.get("wages")) or 0.0
        share = contribution / limit
        facts = {"contribution": num(contribution), "wages": num(wages), "pct_of_pay": pct_num(contribution / wages, 1) if wages else None,
                 "pct_of_limit": pct_num(share), "room": num(max(limit - contribution, 0.0))}
        per_member[m.person_id] = facts
        if share < RETIREMENT_LOW_SHARE:
            low.append((m, contribution, share, facts))

    base = {"limit": num(limit), "flag_below_pct_of_limit": 50, "high_below_pct_of_limit": 15, "members": per_member}
    created = []
    for m, contribution, share, facts in low:
        finding = Finding(
            type="retirement_contribution_review", priority="high" if share < RETIREMENT_HIGH_SHARE else "medium",
            explanation=(f"{first_name(m)} contributed {money_format(contribution)} to a 401(k), {pct(facts['pct_of_pay'] / 100, 1)} of "
                         f"{money_format(facts['wages'])} wages and {facts['pct_of_limit']}% of the {money_format(limit)} limit."),
            dollar_impact=facts["room"], member=m.name, person_id=m.person_id,
            value_keys=[f"{m.person_id}.employee_401k_contribution", f"{m.person_id}.wages"],
            metrics={"limit": num(limit), "flag_below_pct_of_limit": 50, "high_below_pct_of_limit": 15, **facts},
            rule=rule_text("retirement_can_improve", limit),
        )
        findings.append(finding)
        created.append(finding)

    if low:
        reason = _join([f"{first_name(m)} uses {facts['pct_of_limit']}%" for m, _, _, facts in low]) + " of the 401(k) limit"
        return _Answer("yes", reason, sum(facts["room"] for *_, facts in low), created, base)
    if missing:
        return _Answer("needs_data", "; ".join(missing), metrics=base)
    return _Answer("no", "Every wage earner contributes at least half of the 401(k) limit", metrics=base)


def _tax(household: Household, findings: list[Finding]) -> _Answer:
    reasons, created, impact, gaps, per_member = [], [], [], [], {}
    tax_rule = rule_text("tax_savings_possible")
    for m in household.members:
        se_fv = m.get("self_employment_income")
        se = _amount(se_fv)
        if _conflicted(se_fv):
            gaps.append(f"{first_name(m)}'s self-employment income disagrees between documents")
        elif se is not None and se > 0:
            facts = {"self_employment_income": num(se), "high_at": num(SELF_EMPLOYMENT_HIGH)}
            per_member.setdefault(m.person_id, {}).update(facts)
            finding = Finding(
                type="self_employment_tax_review", priority="high" if se >= SELF_EMPLOYMENT_HIGH else "medium",
                explanation=(f"{first_name(m)} reported {money_format(se)} of self-employment income; "
                             "quarterly estimates and self-employed retirement accounts are worth a look."),
                dollar_impact=None, member=m.name, person_id=m.person_id,
                value_keys=[f"{m.person_id}.self_employment_income"], metrics=facts, rule=tax_rule,
            )
            findings.append(finding)
            created.append(finding)
            reasons.append(f"{first_name(m)} has {money_format(se)} of self-employment income")

        code_fv = m.get("distribution_code")
        if code_fv is None and m.get("retirement_distribution") is None:
            continue
        if _conflicted(code_fv) or code_fv is None:
            gaps.append(f"{first_name(m)}'s 1099-R distribution code is missing or disagrees")
            continue
        code = str(code_fv.value).upper()
        taxable = _amount(m.get("retirement_distribution_taxable"))
        withheld = _amount(m.get("federal_tax_withheld"))
        keys = [f"{m.person_id}.distribution_code", f"{m.person_id}.retirement_distribution_taxable"]
        facts: dict[str, Any] = {"distribution_code": code, "taxable": num(taxable), "federal_withheld": num(withheld)}
        if taxable and withheld is not None:
            facts["withholding_pct"] = pct_num(withheld / taxable, 1)
        per_member.setdefault(m.person_id, {}).update(facts)
        if "1" in code:
            penalty = taxable * EARLY_DISTRIBUTION_RATE if taxable is not None else None
            facts.update({"additional_tax_rate_pct": 10, "estimated_additional_tax": num(penalty)})
            finding = Finding(
                type="retirement_distribution_review", priority="high",
                explanation=(f"{first_name(m)}'s 1099-R shows code 1 (early distribution) on "
                             f"{money_format(taxable) if taxable is not None else 'an unknown'} taxable; "
                             f"the estimated additional tax is {money_format(penalty) if penalty is not None else 'unknown'} "
                             "unless an exception applies."),
                dollar_impact=num(penalty), member=m.name, person_id=m.person_id, value_keys=keys, metrics=facts, rule=tax_rule,
            )
            findings.append(finding)
            created.append(finding)
            if penalty is not None:
                impact.append(penalty)
            reasons.append(f"{first_name(m)} has a code 1 early distribution")
        elif code == "7":
            if taxable is None or withheld is None:
                gaps.append(f"{first_name(m)}'s 1099-R taxable amount or federal withholding is missing")
                continue
            under = withheld < taxable * NORMAL_WITHHOLDING_RATE
            facts["flag_below_withholding_pct"] = 10
            finding = Finding(
                type="retirement_distribution_review", priority="medium" if under else "low",
                explanation=(f"{first_name(m)}'s 1099-R shows code 7 (normal distribution): {money_format(withheld)} federal "
                             f"withholding on {money_format(taxable)} taxable ({facts['withholding_pct']}%)."),
                dollar_impact=None, member=m.name, person_id=m.person_id,
                value_keys=keys + [f"{m.person_id}.federal_tax_withheld"], metrics=facts, rule=tax_rule,
            )
            findings.append(finding)
            if under:
                created.append(finding)
                reasons.append(f"{first_name(m)}'s code 7 distribution has {facts['withholding_pct']}% federal withholding")
        else:
            findings.append(Finding(
                type="retirement_distribution_review", priority="informational" if code == "G" else "low",
                explanation=(f"{first_name(m)}'s 1099-R shows code G (direct rollover), which is normally not taxed." if code == "G"
                             else f"{first_name(m)}'s 1099-R shows distribution code {code}."),
                dollar_impact=None, member=m.name, person_id=m.person_id, value_keys=keys, metrics=facts, rule=tax_rule,
            ))

    metrics = {"members": per_member}
    if reasons:
        return _Answer("yes", "; ".join(reasons), sum(impact) if impact else None, created, metrics)
    if gaps:
        return _Answer("needs_data", "; ".join(gaps), metrics=metrics)
    return _Answer("no", "No self-employment income, early distribution or under-withheld distribution", metrics=metrics)


def _cash(household: Household, findings: list[Finding]) -> _Answer:
    cash, agi = _amount(household.get("cash_balance")), _amount(household.get("adjusted_gross_income"))
    if cash is None or agi is None or agi <= 0:
        missing = [label for label, value in (("cash balance", cash), ("adjusted gross income", agi if agi and agi > 0 else None)) if value is None]
        return _Answer("needs_data", f"Missing {_join(missing)}")
    monthly = agi / 12
    target = CASH_MONTHS_TARGET * monthly
    months = cash / monthly
    metrics = {"cash": num(cash), "agi": num(agi), "monthly_income": num(monthly), "months_of_income": round(months, 1),
               "target_months": CASH_MONTHS_TARGET, "target": num(target), "high_above_months": CASH_MONTHS_HIGH}
    if cash <= target:
        return _Answer("no", f"Cash covers {months:.1f} months of income, within {CASH_MONTHS_TARGET} months", metrics=metrics)
    excess = cash - target
    metrics["excess"] = num(excess)
    finding = Finding(
        type="excess_cash_review", priority="high" if months > CASH_MONTHS_HIGH else "medium",
        explanation=(f"The household holds {money_format(cash)} in cash, {months:.1f} months of income; "
                     f"{money_format(excess)} is above a {CASH_MONTHS_TARGET}-month cushion of {money_format(target)}."),
        dollar_impact=num(excess), value_keys=["household.cash_balance", "household.adjusted_gross_income"],
        metrics=dict(metrics), rule=rule_text("excess_cash"),
    )
    findings.append(finding)
    return _Answer("yes", f"Cash covers {months:.1f} months of income", excess, [finding], metrics)


def _documents(household: Household, findings: list[Finding], checks: Mapping[str, Check]) -> _Answer:
    created, reasons = [], []
    counts = {"conflicts": 0, "hsa_without_plan": 0, "mismatches": 0}
    docs_rule = rule_text("needs_documents")
    for key, name, fv, member in _all_fields(household):
        if not _conflicted(fv):
            continue
        whose = f"{first_name(member)}'s " if member else "Household "
        label = FIELD_LABELS.get(name, name).lower() if member else FIELD_LABELS.get(name, name)
        parts = [f"{_fmt(name, c.value)} on {c.source_document or 'an unnamed source'}" for c in fv.candidates]
        finding = Finding(
            type="source_data_conflict", priority="high",
            explanation=f"{whose}{label}: {_join(parts)}. No value is used until this is resolved.",
            dollar_impact=None, member=member.name if member else None,
            person_id=member.person_id if member else None, value_keys=[key],
            metrics={"field": name, "candidates": [{"value": num(c.value) if isinstance(c.value, float) else c.value,
                                                     "source_document": c.source_document} for c in fv.candidates]},
            rule=docs_rule,
        )
        findings.append(finding)
        created.append(finding)
        counts["conflicts"] += 1
        reasons.append(f"{whose}{label} disagree between documents")

    for m in household.members:
        hsa = _amount(m.get("hsa_contribution"))
        plan = m.get("hsa_eligible_health_plan")
        if hsa is None or hsa <= 0 or (plan is not None and not plan.conflict and plan.value is True):
            continue
        finding = Finding(
            type="hsa_eligibility_unverified", priority="medium",
            explanation=(f"{first_name(m)} contributed {money_format(hsa)} to an HSA, but no document shows coverage "
                         "under an HSA-eligible (high-deductible) health plan."),
            dollar_impact=None, member=m.name, person_id=m.person_id,
            value_keys=[f"{m.person_id}.hsa_contribution", f"{m.person_id}.hsa_eligible_health_plan"],
            metrics={"hsa_contribution": num(hsa), "eligible_plan_documented": False}, rule=docs_rule,
        )
        findings.append(finding)
        created.append(finding)
        counts["hsa_without_plan"] += 1
        reasons.append(f"{first_name(m)}'s HSA contribution has no documented eligible plan")

    for key, name, fv, member in _all_fields(household):
        if checks.get(key) != "mismatch" or fv is None:
            continue
        whose = f"{first_name(member)}'s " if member else "Household "
        label = FIELD_LABELS.get(name, name).lower() if member else FIELD_LABELS.get(name, name)
        finding = Finding(
            type="source_data_conflict", priority="medium",
            explanation=f"{whose}{label} of {_fmt(name, fv.value)} is not what {fv.source_document} shows.",
            dollar_impact=None, member=member.name if member else None,
            person_id=member.person_id if member else None, value_keys=[key],
            metrics={"field": name, "value": num(fv.value) if isinstance(fv.value, float) else fv.value,
                     "source_document": fv.source_document, "check": "mismatch"},
            rule=docs_rule,
        )
        findings.append(finding)
        created.append(finding)
        counts["mismatches"] += 1
        reasons.append(f"{whose}{label} does not match {fv.source_document}")

    if created:
        return _Answer("yes", "; ".join(reasons), None, created, counts)
    return _Answer("no", "No conflicts, missing proof or mismatched values", metrics=counts)


def _changes(household: Household, findings: list[Finding]) -> tuple[_Answer, list[Change]]:
    prior = household.prior_year
    if prior is None:
        return _Answer("not_assessed", "No prior year on file", metrics={"events": []}), []
    events: list[tuple[Change, Member | None, list[str], dict[str, Any]]] = []

    now_deps, then_deps = household.value("dependents"), prior.value("dependents")
    if isinstance(now_deps, int) and isinstance(then_deps, int) and now_deps > then_deps:
        events.append((Change("life_event_new_dependent", f"Dependents increased from {then_deps} to {now_deps}"), None,
                       ["household.dependents"], {"before": then_deps, "after": now_deps}))

    prior_members = {m.person_id: m for m in prior.members}
    for m in household.members:
        before = prior_members.get(m.person_id)
        now_employer, then_employer = m.value("employer"), before.value("employer") if before else None
        if isinstance(now_employer, str) and isinstance(then_employer, str) and now_employer.casefold() != then_employer.casefold():
            events.append((Change("life_event_new_employer", f"{first_name(m)} changed employer from {then_employer} to {now_employer}"),
                           m, [f"{m.person_id}.employer"], {"before": then_employer, "after": now_employer}))

    now_mortgage, then_mortgage = _amount(household.get("mortgage_interest")), _amount(prior.get("mortgage_interest"))
    if now_mortgage and now_mortgage > 0 and not (then_mortgage and then_mortgage > 0):
        events.append((Change("life_event_new_mortgage", f"Mortgage interest started ({money_format(now_mortgage)})"), None,
                       ["household.mortgage_interest"], {"before": num(then_mortgage) or 0, "after": num(now_mortgage)}))

    now_agi, then_agi = _amount(household.get("adjusted_gross_income")), _amount(prior.get("adjusted_gross_income"))
    if now_agi is not None and then_agi and then_agi > 0:
        change = (now_agi - then_agi) / then_agi
        if abs(change) >= AGI_CHANGE_SHARE:
            verb = "rose" if change > 0 else "fell"
            events.append((Change("life_event_large_income_increase",
                                  f"AGI {verb} {pct(abs(change))} from {money_format(then_agi)} to {money_format(now_agi)}"),
                           None, ["household.adjusted_gross_income"],
                           {"before": num(then_agi), "after": num(now_agi), "change_pct": pct_num(change), "flag_change_pct": 25}))

    metrics = {"prior_tax_year": prior.tax_year, "events": [c.type for c, *_ in events], "event_count": len(events),
               "high_at_events": LIFE_EVENTS_FOR_HIGH}
    if not events:
        return _Answer("no", "No major changes since last year", metrics=metrics), []
    priority = "high" if len(events) >= LIFE_EVENTS_FOR_HIGH else "medium"
    created = []
    for change, member, keys, facts in events:
        finding = Finding(
            type=change.type, priority=priority,
            explanation=change.text + " since last year." + (" Several changes happened together." if priority == "high" else ""),
            dollar_impact=None, member=member.name if member else None, person_id=member.person_id if member else None,
            value_keys=keys, metrics=facts, rule=rule_text("major_changes"),
        )
        findings.append(finding)
        created.append(finding)
    return _Answer("yes", _join([c.text for c, *_ in events]), None, created, metrics), [c for c, *_ in events]


# ---------------------------------------------------------------- entry point


def _label_finding(finding: Finding) -> None:
    """Category, headline and action label come from tags.json finding_types."""
    member = finding.member.split()[0] if finding.member else None
    field_id = finding.value_keys[0].split(".", 1)[1] if finding.value_keys else None
    finding.category = FINDING_CATEGORY[finding.type]
    finding.headline, finding.action_label = finding_text(
        finding.type, member, FIELD_LABELS.get(field_id, field_id).lower() if field_id else None)


def rules_evaluate(household: Household, checks: Mapping[str, Check] | None = None) -> RulesResult:
    checks = checks or {}
    findings: list[Finding] = []
    limit = retirement_limit(household.tax_year)
    answers = {
        "retirement_can_improve": _retirement(household, findings),
        "tax_savings_possible": _tax(household, findings),
        "excess_cash": _cash(household, findings),
        "needs_documents": _documents(household, findings, checks),
    }
    changes_answer, changes = _changes(household, findings)
    answers["major_changes"] = changes_answer

    for index, finding in enumerate(findings, start=1):
        finding.id = f"F{index}"
        _label_finding(finding)

    checklist = []
    for item_id, question in CHECKLIST_QUESTIONS.items():
        a = answers.get(item_id) or _Answer("not_assessed", PLACEHOLDER_REASONS.get(item_id, "No data or rules yet"))
        checklist.append(ChecklistItem(
            id=item_id, question=question, answer=a.answer, reason=a.reason, dollar_impact=num(a.impact),
            finding_ids=[f.id for f in a.findings], metrics={**RULE_THRESHOLDS.get(item_id, {}), **a.metrics},
            rule=rule_text(item_id, limit if item_id == "retirement_can_improve" else None),
        ))
    top = max((f.priority for f in findings), key=PRIORITY_RANK.__getitem__, default=None)
    status = "findings" if any(PRIORITY_RANK[f.priority] >= PRIORITY_RANK["medium"] for f in findings) else "no_findings"
    return RulesResult(checklist=checklist, findings=findings, changes=changes, status=status, priority=top)


__all__ = ["ANSWER_VALUES", "ASSESSED", "CATEGORY_VALUES", "CHANGE_TYPES", "CHECKLIST_QUESTIONS", "FIELD_LABELS",
           "LIMIT_401K", "PRIORITY_RANK", "PRIORITY_VALUES", "STATUS_VALUES", "first_name", "num", "pct",
           "retirement_limit", "rules_evaluate", "tag_ids"]
