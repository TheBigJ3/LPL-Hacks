"""Overview builder: normalized household + its documents' evidence -> the rapid analysis page object.

Order of work: normalize -> check every displayed value (the only model use) -> rules (deterministic)
-> compose. Output is validated against contract.Overview before it is returned.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Mapping

from rapid_analysis import contract
from rapid_analysis.evidence import Check, CheckRequest, EvidenceChecker, FieldCheck, money_format
from rapid_analysis.normalization import FieldValue, Household, Member, normalize_household
from rapid_analysis.rules import (
    FIELD_LABELS,
    PRIORITY_RANK,
    num,
    pct,
    retirement_limit,
    rules_evaluate,
)
from rapid_analysis.textract import EvidenceDocument

LOW_CONFIDENCE_THRESHOLD = float(os.environ.get("LOW_CONFIDENCE_THRESHOLD", "0.90"))
CHECK_ORDER = ["conflicted", "mismatch", "unconfirmed", "not_checked", "verified"]  # worst first
CARD_FIELDS_EXCLUDED = {"employer"}
UNCHECKED_FIELDS = {"employer"}


@dataclass
class OverviewBuild:
    overview: dict
    evidence: dict[str, dict] = field(default_factory=dict)  # finding id -> FindingEvidence dict


def _display(fv: FieldValue | None) -> Any:
    if fv is None or fv.conflict:
        return None
    return num(fv.value) if isinstance(fv.value, float) else fv.value


def _candidates(fv: FieldValue | None) -> list[contract.SourceCandidate] | None:
    if fv is None or not fv.conflict:
        return None
    return [contract.SourceCandidate(value=num(c.value) if isinstance(c.value, float) else c.value,
                                     source_document=c.source_document, page=c.page) for c in fv.candidates]


def _household_subject(household: Household) -> str | None:
    names = [m.name for m in household.members if m.name]
    return " and ".join(names) if names else None


def _requests(household: Household) -> list[CheckRequest]:
    subject = _household_subject(household)
    requests = [CheckRequest(key=f"household.{name}", field_name=name, value=fv, subject_name=subject)
                for name, fv in household.fields.items() if fv is not None]
    for m in household.members:
        requests += [CheckRequest(key=f"{m.person_id}.{name}", field_name=name, value=fv, subject_name=m.name)
                     for name, fv in m.fields.items() if fv is not None and name not in UNCHECKED_FIELDS]
    return requests


def _worst(checks: list[Check]) -> Check:
    if not checks:
        return "not_checked"
    if all(c == "verified" for c in checks):
        return "verified"
    return min(checks, key=CHECK_ORDER.index)


def _checked(fv: FieldValue | None, check: Check) -> contract.CheckedValue:
    return contract.CheckedValue(value=_display(fv), check=check,
                                 source_document=None if fv is None or fv.conflict else fv.source_document,
                                 page=None if fv is None or fv.conflict else fv.page)


def _k401_context(household: Household, m: Member) -> str | None:
    contribution = m.get("employee_401k_contribution")
    if contribution is None or contribution.conflict:
        return None
    amount = float(contribution.value)
    wages = m.get("wages")
    parts = []
    if wages is not None and not wages.conflict and wages.value:
        parts.append(f"{pct(amount / float(wages.value), 1)} of pay")
    limit = retirement_limit(household.tax_year)
    if limit:
        parts.append(f"{pct(amount / limit)} of limit")
        parts.append(f"{money_format(max(limit - amount, 0.0))} room left")
    return " · ".join(parts) or None


def _member_card(household: Household, m: Member, checks: Mapping[str, Check]) -> contract.MemberCard:
    numbers = []
    for name, fv in m.fields.items():
        if fv is None or name in CARD_FIELDS_EXCLUDED:
            continue
        numbers.append(contract.MemberNumber(
            field=name, label=FIELD_LABELS.get(name, name), value=_display(fv),
            check=checks.get(f"{m.person_id}.{name}", "not_checked"),
            source_document=None if fv.conflict else fv.source_document,
            page=None if fv.conflict else fv.page,
            context=_k401_context(household, m) if name == "employee_401k_contribution" else None,
            candidates=_candidates(fv),
        ))
    employer = m.get("employer")
    return contract.MemberCard(person_id=m.person_id, name=m.name,
                               employer=None if employer is None or employer.conflict else employer.value,
                               numbers=numbers)


def _data_quality(household: Household, checks: Mapping[str, Check], findings) -> contract.DataQuality:
    conflicts, low = [], []
    fields = [(f"household.{n}", n, fv, None) for n, fv in household.fields.items()]
    for m in household.members:
        fields += [(f"{m.person_id}.{n}", n, fv, m) for n, fv in m.fields.items()]
    unchecked = 0
    for key, name, fv, m in fields:
        if fv is None:
            continue
        if fv.conflict:
            conflicts.append(contract.Conflict(field=name, label=FIELD_LABELS.get(name, name),
                                               member=m.name if m else None, person_id=m.person_id if m else None,
                                               candidates=_candidates(fv) or []))
        elif name not in UNCHECKED_FIELDS and checks.get(key, "not_checked") == "not_checked":
            unchecked += 1
        sources = fv.candidates if fv.candidates else [fv]
        for c in sources:
            if c.textract_confidence is not None and c.textract_confidence < LOW_CONFIDENCE_THRESHOLD:
                low.append(contract.LowConfidenceField(
                    field=name, label=FIELD_LABELS.get(name, name), member=m.name if m else None,
                    person_id=m.person_id if m else None,
                    value=num(c.value) if isinstance(c.value, float) else c.value,
                    textract_confidence=c.textract_confidence, source_document=c.source_document, page=c.page))
    missing = [
        contract.MissingDocument(type="hsa_plan_proof", member=f.member, person_id=f.person_id,
                                 description=f"Proof of an HSA-eligible health plan for {f.member or 'this member'}")
        for f in findings if f.type == "hsa_eligibility_proof_missing"
    ]
    return contract.DataQuality(documents=len(household.documents), conflicts=conflicts, low_confidence_fields=low,
                                unchecked_values=unchecked, missing_documents=missing)


def _label_for(key: str, household: Household) -> tuple[str, str, Member | None]:
    owner, name = key.split(".", 1)
    member = next((m for m in household.members if m.person_id == owner), None)
    return name, FIELD_LABELS.get(name, name), member


def _needs_review(household_id: str | None, tax_year: int | None, errors: list[contract.ErrorItem]) -> dict:
    return contract.Overview(
        household_id=household_id, tax_year=tax_year, status="needs_review", priority=None, summary=None,
        members=[], checklist=[], changes_since_last_year=[], findings=[],
        data_quality=contract.DataQuality(), errors=errors,
    ).model_dump(mode="json")


def overview_build(raw: Any, documents: Mapping[str, EvidenceDocument] | None = None) -> OverviewBuild:
    normalized = normalize_household(raw)
    if normalized.errors or normalized.household is None:
        household_id = raw.get("household_id") if isinstance(raw, dict) and isinstance(raw.get("household_id"), str) else None
        tax_year = normalized.household.tax_year if normalized.household else None
        errors = [contract.ErrorItem(code=e.code, path=e.path, message=e.message) for e in normalized.errors]
        return OverviewBuild(overview=_needs_review(household_id, tax_year, errors))
    household = normalized.household
    return overview_build_household(household, documents or {})


def overview_build_household(household: Household, documents: Mapping[str, EvidenceDocument]) -> OverviewBuild:
    checker = EvidenceChecker(documents)
    field_checks: dict[str, FieldCheck] = checker.check_many(_requests(household))
    checks: dict[str, Check] = {key: fc.check for key, fc in field_checks.items()}
    result = rules_evaluate(household, checks)

    errors: list[contract.ErrorItem] = []
    if checker.validator_unavailable:
        errors.append(contract.ErrorItem(code="validator_unavailable", path="",
                                         message="Value checks are unavailable; every value is not_checked",
                                         severity="warning"))

    def finding_check(keys: list[str]) -> Check:
        present = [checks[k] for k in keys if k in checks]
        return _worst(present)

    findings_out = [contract.Finding(
        id=f.id, type=f.type, category=f.category, priority=f.priority, headline=f.headline,
        explanation=f.explanation, dollar_impact=f.dollar_impact, member=f.member, person_id=f.person_id,
        action_label=f.action_label, check=finding_check(f.value_keys),
    ) for f in result.findings]
    findings_out.sort(key=lambda f: (-PRIORITY_RANK[f.priority], int(f.id[1:])))

    agi, cash = household.get("adjusted_gross_income"), household.get("cash_balance")
    months = None
    if agi and cash and not agi.conflict and not cash.conflict and float(agi.value) > 0:
        months = round(float(cash.value) / (float(agi.value) / 12), 1)
    cash_out = _checked(cash, checks.get("household.cash_balance", "not_checked"))
    dependents = household.get("dependents")
    summary = contract.Summary(
        filing_status=household.filing_status,
        dependents=_display(dependents),
        dependents_check=checks.get("household.dependents", "not_checked"),
        agi=_checked(agi, checks.get("household.adjusted_gross_income", "not_checked")),
        cash=contract.CashValue(**cash_out.model_dump(), months_of_income=months),
        mortgage_interest=_checked(household.get("mortgage_interest"), checks.get("household.mortgage_interest", "not_checked")),
    )

    overview = contract.Overview(
        household_id=household.household_id,
        tax_year=household.tax_year,
        status=result.status,
        priority=result.priority,
        summary=summary,
        members=[_member_card(household, m, checks) for m in household.members],
        checklist=[contract.ChecklistItem(id=i.id, question=i.question, answer=i.answer, reason=i.reason,
                                          dollar_impact=i.dollar_impact, finding_ids=i.finding_ids)
                   for i in result.checklist],
        changes_since_last_year=[contract.Change(type=c.type, text=c.text) for c in result.changes],
        findings=findings_out,
        data_quality=_data_quality(household, checks, result.findings),
        errors=errors,
    )

    evidence: dict[str, dict] = {}
    for f in result.findings:
        values = []
        for key in f.value_keys:
            name, label, member = _label_for(key, household)
            fv = household.get(name) if key.startswith("household.") else (member.get(name) if member else None)
            if fv is None:
                continue
            fc = field_checks.get(key)
            values.append(contract.EvidenceValue(
                key=key, field=name, label=label, member=member.name if member else None, value=_display(fv),
                check=checks.get(key, "not_checked"),
                documents=[contract.EvidenceDocumentCheck(document=d.document, page=d.page,
                                                          value=num(d.value) if isinstance(d.value, float) else d.value,
                                                          check=d.check)
                           for d in (fc.documents if fc else [])],
            ))
        evidence[f.id] = contract.FindingEvidence(
            household_id=household.household_id, finding_id=f.id, headline=f.headline,
            check=finding_check(f.value_keys), values=values,
        ).model_dump(mode="json")

    return OverviewBuild(overview=overview.model_dump(mode="json"), evidence=evidence)
