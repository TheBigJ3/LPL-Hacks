"""Deterministic, versioned rules (§5). Python decides every answer, finding, category, priority and dollar figure.

OpenDecision is never consulted here; the only model output a rule reads is a value's check
(a `mismatch` makes more documentation necessary).

Value keys: household fields are "household.<field>", member fields are "<person_id>.<field>".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Mapping

from rapid_analysis import RULESET_VERSION
from rapid_analysis.evidence import Check, money_format
from rapid_analysis.normalization import FieldValue, Household, Member

Answer = Literal["yes", "no", "needs_data", "not_assessed"]
Priority = Literal["informational", "low", "medium", "high"]
Category = Literal["retirement", "tax", "hsa", "cash_management", "life_event", "data_quality"]
Status = Literal["findings", "no_findings", "needs_review"]

ANSWER_VALUES: tuple[Answer, ...] = ("yes", "no", "needs_data", "not_assessed")
PRIORITY_VALUES: tuple[Priority, ...] = ("informational", "low", "medium", "high")
CATEGORY_VALUES: tuple[Category, ...] = ("retirement", "tax", "hsa", "cash_management", "life_event", "data_quality")
STATUS_VALUES: tuple[Status, ...] = ("findings", "no_findings", "needs_review")
PRIORITY_RANK = {p: i for i, p in enumerate(PRIORITY_VALUES)}

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

CHECKLIST_QUESTIONS: dict[str, str] = {
    "retirement_can_improve": "Can retirement savings be improved?",
    "tax_savings_possible": "Can tax savings be made?",
    "excess_cash": "Is there excess cash to put to work?",
    "needs_documents": "Is more documentation needed?",
    "major_changes": "Anything major changed since last year?",
    "insurance_review": "Insurance coverage reviewed?",
    "estate_review": "Estate plan reviewed?",
    "education_review": "Education savings reviewed?",
}
PLACEHOLDER_REASONS = {
    "insurance_review": "No insurance data or rules yet",
    "estate_review": "No estate planning data or rules yet",
    "education_review": "No education savings data or rules yet",
}
CHANGE_TYPES = ("life_event_new_dependent", "life_event_new_employer", "life_event_new_mortgage", "life_event_large_income_increase")


@dataclass
class Finding:
    type: str
    category: Category
    priority: Priority
    headline: str
    explanation: str
    dollar_impact: float | None
    action_label: str
    member: str | None = None
    person_id: str | None = None
    value_keys: list[str] = field(default_factory=list)  # values this finding rests on (for check + evidence drill-down)
    id: str = ""


@dataclass
class ChecklistItem:
    id: str
    question: str
    answer: Answer
    reason: str
    dollar_impact: float | None = None
    finding_ids: list[str] = field(default_factory=list)


@dataclass
class Change:
    type: str
    text: str


@dataclass
class RulesResult:
    checklist: list[ChecklistItem]
    findings: list[Finding]
    changes: list[Change]
    status: Status
    priority: Priority | None
    ruleset_version: str = RULESET_VERSION


# ---------------------------------------------------------------- helpers


def first_name(member: Member) -> str:
    return (member.name or member.person_id).split()[0]


def pct(share: float, digits: int = 0) -> str:
    return f"{share * 100:.{digits}f}%"


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


def _item(item_id: str, answer: Answer, reason: str, impact: float | None = None, findings: list[Finding] | None = None) -> ChecklistItem:
    return ChecklistItem(id=item_id, question=CHECKLIST_QUESTIONS[item_id], answer=answer, reason=reason,
                         dollar_impact=num(impact), finding_ids=[f.id for f in findings or []])


def retirement_limit(tax_year: int | None) -> float | None:
    return LIMIT_401K.get(tax_year) if tax_year is not None else None


# ---------------------------------------------------------------- rules


def _retirement(household: Household, findings: list[Finding]) -> list:
    earners = [m for m in household.members if _conflicted(m.get("wages")) or (_amount(m.get("wages")) or 0) > 0]
    if not earners:
        return ["not_assessed", "No household member has wages", None, []]
    limit = retirement_limit(household.tax_year)
    if limit is None:
        return ["needs_data", f"No 401(k) limit on file for tax year {household.tax_year}", None, []]

    low, missing, above = [], [], []
    for m in earners:
        contribution = _amount(m.get("employee_401k_contribution"))
        if _conflicted(m.get("wages")):
            missing.append(f"{first_name(m)}'s wages disagree between documents")
            continue
        if contribution is None:
            missing.append(f"{first_name(m)}'s 401(k) contribution is missing")
            continue
        share = contribution / limit
        (low if share < RETIREMENT_LOW_SHARE else above).append((m, contribution, share))

    created = []
    for m, contribution, share in low:
        wages = _amount(m.get("wages")) or 0.0
        room = max(limit - contribution, 0.0)
        high = share < RETIREMENT_HIGH_SHARE
        finding = Finding(
            type="retirement_contribution_review", category="retirement", priority="high" if high else "medium",
            headline=f"{first_name(m)} is saving very little for retirement" if high else f"{first_name(m)} could save more for retirement",
            explanation=(f"{first_name(m)} contributed {money_format(contribution)} to a 401(k), {pct(contribution / wages, 1)} of "
                         f"{money_format(wages)} wages and {pct(share)} of the {money_format(limit)} limit."),
            dollar_impact=num(room), action_label="Discuss savings", member=m.name, person_id=m.person_id,
            value_keys=[f"{m.person_id}.employee_401k_contribution", f"{m.person_id}.wages"],
        )
        findings.append(finding)
        created.append(finding)

    if low:
        reason = _join([f"{first_name(m)} uses {pct(share)}" for m, _, share in low]) + " of the 401(k) limit"
        return ["yes", reason, sum(max(limit - c, 0.0) for _, c, _ in low), created]
    if missing:
        return ["needs_data", "; ".join(missing), None, []]
    return ["no", "Every wage earner contributes at least half of the 401(k) limit", None, []]


def _tax(household: Household, findings: list[Finding]) -> list:
    reasons, created, impact, gaps = [], [], [], []
    for m in household.members:
        se_fv = m.get("self_employment_income")
        se = _amount(se_fv)
        if _conflicted(se_fv):
            gaps.append(f"{first_name(m)}'s self-employment income disagrees between documents")
        elif se is not None and se > 0:
            finding = Finding(
                type="self_employment_tax_review", category="tax",
                priority="high" if se >= SELF_EMPLOYMENT_HIGH else "medium",
                headline=f"{first_name(m)} has self-employment income to plan around",
                explanation=(f"{first_name(m)} reported {money_format(se)} of self-employment income; "
                             "quarterly estimates and self-employed retirement accounts are worth a look."),
                dollar_impact=None, action_label="Review self-employment taxes", member=m.name, person_id=m.person_id,
                value_keys=[f"{m.person_id}.self_employment_income"],
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
        if "1" in code:
            penalty = taxable * EARLY_DISTRIBUTION_RATE if taxable is not None else None
            finding = Finding(
                type="retirement_distribution_review", category="tax", priority="high",
                headline=f"{first_name(m)} took an early retirement distribution",
                explanation=(f"{first_name(m)}'s 1099-R shows code 1 (early distribution) on "
                             f"{money_format(taxable) if taxable is not None else 'an unknown'} taxable; "
                             f"the estimated additional tax is {money_format(penalty) if penalty is not None else 'unknown'} "
                             "unless an exception applies."),
                dollar_impact=num(penalty), action_label="Review early distribution", member=m.name, person_id=m.person_id,
                value_keys=keys,
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
            share = withheld / taxable if taxable else 0.0
            finding = Finding(
                type="retirement_distribution_review",
                category="tax", priority="medium" if under else "low",
                headline=(f"{first_name(m)}'s retirement distribution may be under-withheld" if under
                          else f"{first_name(m)} took a normal retirement distribution"),
                explanation=(f"{first_name(m)}'s 1099-R shows code 7 (normal distribution): {money_format(withheld)} federal "
                             f"withholding on {money_format(taxable)} taxable ({pct(share, 1)})."),
                dollar_impact=None, action_label="Check withholding" if under else "Note distribution",
                member=m.name, person_id=m.person_id, value_keys=keys + [f"{m.person_id}.federal_tax_withheld"],
            )
            findings.append(finding)
            if under:
                created.append(finding)
                reasons.append(f"{first_name(m)}'s code 7 distribution has {pct(share, 1)} federal withholding")
        elif code == "G":
            findings.append(Finding(
                type="retirement_distribution_review", category="tax", priority="informational",
                headline=f"{first_name(m)} rolled over a retirement distribution",
                explanation=f"{first_name(m)}'s 1099-R shows code G (direct rollover), which is normally not taxed.",
                dollar_impact=None, action_label="Note rollover", member=m.name, person_id=m.person_id, value_keys=keys,
            ))
        else:
            findings.append(Finding(
                type="retirement_distribution_review", category="tax", priority="low",
                headline=f"{first_name(m)} has a code {code} retirement distribution",
                explanation=f"{first_name(m)}'s 1099-R shows distribution code {code}.",
                dollar_impact=None, action_label="Note distribution", member=m.name, person_id=m.person_id, value_keys=keys,
            ))

    if reasons:
        return ["yes", "; ".join(reasons), sum(impact) if impact else None, created]
    if gaps:
        return ["needs_data", "; ".join(gaps), None, []]
    return ["no", "No self-employment income, early distribution or under-withheld distribution", None, []]


def _cash(household: Household, findings: list[Finding]) -> list:
    cash_fv, agi_fv = household.get("cash_balance"), household.get("adjusted_gross_income")
    cash, agi = _amount(cash_fv), _amount(agi_fv)
    if cash is None or agi is None or agi <= 0:
        missing = [label for label, value in (("cash balance", cash), ("adjusted gross income", agi if agi and agi > 0 else None)) if value is None]
        return ["needs_data", f"Missing {_join(missing)}", None, []]
    monthly = agi / 12
    target = CASH_MONTHS_TARGET * monthly
    months = cash / monthly
    if cash <= target:
        return ["no", f"Cash covers {months:.1f} months of income, within {CASH_MONTHS_TARGET} months", None, []]
    excess = cash - target
    finding = Finding(
        type="excess_cash_review", category="cash_management", priority="high" if months > CASH_MONTHS_HIGH else "medium",
        headline="Cash well above an emergency cushion",
        explanation=(f"The household holds {money_format(cash)} in cash, {months:.1f} months of income; "
                     f"{money_format(excess)} is above a {CASH_MONTHS_TARGET}-month cushion of {money_format(target)}."),
        dollar_impact=num(excess), action_label="Discuss putting cash to work",
        value_keys=["household.cash_balance", "household.adjusted_gross_income"],
    )
    findings.append(finding)
    return ["yes", f"Cash covers {months:.1f} months of income", excess, [finding]]


def _all_fields(household: Household) -> list[tuple[str, str, FieldValue | None, Member | None]]:
    out: list[tuple[str, str, FieldValue | None, Member | None]] = [
        (f"household.{name}", name, fv, None) for name, fv in household.fields.items()
    ]
    for m in household.members:
        out += [(f"{m.person_id}.{name}", name, fv, m) for name, fv in m.fields.items()]
    return out


FIELD_LABELS = {
    "adjusted_gross_income": "AGI", "dependents": "Dependents", "mortgage_interest": "Mortgage interest",
    "cash_balance": "Cash", "employer": "Employer", "wages": "Wages", "employee_401k_contribution": "401(k)",
    "hsa_contribution": "HSA contribution", "hsa_eligible_health_plan": "HSA-eligible plan",
    "interest_income": "Interest income", "dividend_income": "Dividend income",
    "self_employment_income": "Self-employment income", "retirement_distribution": "Gross distribution",
    "retirement_distribution_taxable": "Taxable distribution", "federal_tax_withheld": "Federal withholding",
    "state_tax_withheld": "State withholding", "distribution_code": "Distribution code",
    "distribution_from_ira": "IRA distribution", "distribution_date": "Distribution date",
}


def _fmt(name: str, value: Any) -> str:
    if isinstance(value, (int, float)) and not isinstance(value, bool) and name not in ("dependents", "distribution_code"):
        return money_format(float(value))
    return str(value)


def _documents(household: Household, findings: list[Finding], checks: Mapping[str, Check]) -> list:
    created, reasons = [], []
    for key, name, fv, member in _all_fields(household):
        if not _conflicted(fv):
            continue
        whose = f"{first_name(member)}'s " if member else "Household "
        label = FIELD_LABELS.get(name, name).lower() if member else FIELD_LABELS.get(name, name)
        parts = [f"{_fmt(name, c.value)} on {c.source_document or 'an unnamed source'}" for c in fv.candidates]
        finding = Finding(
            type="source_data_conflict", category="data_quality", priority="high",
            headline=f"{whose}{label} disagree between documents",
            explanation=f"{whose}{label}: {_join(parts)}. No value is used until this is resolved.",
            dollar_impact=None, action_label="Resolve conflict", member=member.name if member else None,
            person_id=member.person_id if member else None, value_keys=[key],
        )
        findings.append(finding)
        created.append(finding)
        reasons.append(f"{whose}{label} disagree between documents")

    for m in household.members:
        hsa = _amount(m.get("hsa_contribution"))
        plan = m.get("hsa_eligible_health_plan")
        if hsa is None or hsa <= 0 or (plan is not None and not plan.conflict and plan.value is True):
            continue
        finding = Finding(
            type="hsa_eligibility_unverified", category="hsa", priority="medium",
            headline=f"No proof of {first_name(m)}'s HSA-eligible health plan",
            explanation=(f"{first_name(m)} contributed {money_format(hsa)} to an HSA, but no document shows coverage "
                         "under an HSA-eligible (high-deductible) health plan."),
            dollar_impact=None, action_label="Request health plan proof", member=m.name, person_id=m.person_id,
            value_keys=[f"{m.person_id}.hsa_contribution", f"{m.person_id}.hsa_eligible_health_plan"],
        )
        findings.append(finding)
        created.append(finding)
        reasons.append(f"{first_name(m)}'s HSA contribution has no documented eligible plan")

    for key, name, fv, member in _all_fields(household):
        if checks.get(key) != "mismatch" or fv is None:
            continue
        whose = f"{first_name(member)}'s " if member else "Household "
        label = FIELD_LABELS.get(name, name).lower() if member else FIELD_LABELS.get(name, name)
        finding = Finding(
            type="source_data_conflict", category="data_quality", priority="medium",
            headline=f"{whose}{label} does not match its document",
            explanation=f"{whose}{label} of {_fmt(name, fv.value)} is not what {fv.source_document} shows.",
            dollar_impact=None, action_label="Check the document", member=member.name if member else None,
            person_id=member.person_id if member else None, value_keys=[key],
        )
        findings.append(finding)
        created.append(finding)
        reasons.append(f"{whose}{label} does not match {fv.source_document}")

    if created:
        return ["yes", "; ".join(reasons), None, created]
    return ["no", "No conflicts, missing proof or mismatched values", None, []]


def _changes(household: Household, findings: list[Finding]) -> tuple[list, list[Change]]:
    prior = household.prior_year
    if prior is None:
        return ["not_assessed", "No prior year on file", None, []], []
    events: list[tuple[Change, str | None, str | None, list[str]]] = []

    now_deps, then_deps = household.value("dependents"), prior.value("dependents")
    if isinstance(now_deps, int) and isinstance(then_deps, int) and now_deps > then_deps:
        events.append((Change("life_event_new_dependent", f"Dependents increased from {then_deps} to {now_deps}"), None, None, ["household.dependents"]))

    prior_members = {m.person_id: m for m in prior.members}
    for m in household.members:
        before = prior_members.get(m.person_id)
        now_employer, then_employer = m.value("employer"), before.value("employer") if before else None
        if isinstance(now_employer, str) and isinstance(then_employer, str) and now_employer.casefold() != then_employer.casefold():
            events.append((Change("life_event_new_employer", f"{first_name(m)} changed employer from {then_employer} to {now_employer}"),
                           m.name, m.person_id, [f"{m.person_id}.employer"]))

    now_mortgage, then_mortgage = _amount(household.get("mortgage_interest")), _amount(prior.get("mortgage_interest"))
    if now_mortgage and now_mortgage > 0 and not (then_mortgage and then_mortgage > 0):
        events.append((Change("life_event_new_mortgage", f"Mortgage interest started ({money_format(now_mortgage)})"), None, None, ["household.mortgage_interest"]))

    now_agi, then_agi = _amount(household.get("adjusted_gross_income")), _amount(prior.get("adjusted_gross_income"))
    if now_agi is not None and then_agi and then_agi > 0:
        change = (now_agi - then_agi) / then_agi
        if abs(change) >= AGI_CHANGE_SHARE:
            kind = "life_event_large_income_increase"
            verb = "rose" if change > 0 else "fell"
            events.append((Change(kind, f"AGI {verb} {pct(abs(change))} from {money_format(then_agi)} to {money_format(now_agi)}"),
                           None, None, ["household.adjusted_gross_income"]))

    if not events:
        return ["no", "No major changes since last year", None, []], []
    priority: Priority = "high" if len(events) >= LIFE_EVENTS_FOR_HIGH else "medium"
    created = []
    for change, member, person_id, keys in events:
        finding = Finding(
            type=change.type, category="life_event", priority=priority, headline=change.text,
            explanation=change.text + " since last year." + (" Several changes happened together." if priority == "high" else ""),
            dollar_impact=None, action_label="Review life changes", member=member, person_id=person_id, value_keys=keys,
        )
        findings.append(finding)
        created.append(finding)
    answer = ["yes", _join([c.text for c, _, _, _ in events]), None, created]
    return answer, [c for c, _, _, _ in events]


# ---------------------------------------------------------------- entry point


def rules_evaluate(household: Household, checks: Mapping[str, Check] | None = None) -> RulesResult:
    checks = checks or {}
    findings: list[Finding] = []
    retirement = _retirement(household, findings)
    tax = _tax(household, findings)
    cash = _cash(household, findings)
    documents = _documents(household, findings, checks)
    changes_answer, changes = _changes(household, findings)

    for index, finding in enumerate(findings, start=1):
        finding.id = f"F{index}"

    checklist = [
        _item("retirement_can_improve", *retirement),
        _item("tax_savings_possible", *tax),
        _item("excess_cash", *cash),
        _item("needs_documents", *documents),
        _item("major_changes", *changes_answer),
        *[_item(item_id, "not_assessed", reason) for item_id, reason in PLACEHOLDER_REASONS.items()],
    ]
    top = max((f.priority for f in findings), key=PRIORITY_RANK.__getitem__, default=None)
    status: Status = "findings" if any(PRIORITY_RANK[f.priority] >= PRIORITY_RANK["medium"] for f in findings) else "no_findings"
    return RulesResult(checklist=checklist, findings=findings, changes=changes, status=status, priority=top)
