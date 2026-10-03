# Rapid analysis contract (schema 1.0, ruleset 2025.1)

The frontend renders `GET /api/households/{id}/overview` directly. Pydantic models in
`rapid_analysis/contract.py` are the source of truth; `openapi.json` is exported from them and
`docs/samples/` holds real responses for every fixture.

Checklist answers are **flags for review, not advice** (`checklist_label`). Deterministic Python rules
decide every answer, finding, category, priority and dollar figure. OpenDecision produces only the
per-value `check`. No model internals (scores, probabilities, backend, model name) appear in any response.

## Endpoints

| Method | Path | Response | Notes |
|---|---|---|---|
| GET | `/health` | `Health` | `{status, model_loaded, device, ruleset_version, schema_version}` |
| GET | `/api/meta/enums` | `Enums` | every enum value the UI renders |
| GET | `/api/households?q=&priority=&status=&needs_documents=` | `HouseholdList` | `q` matches household id or member name (case-insensitive) |
| GET | `/api/households/{id}/overview` | `Overview` | computed on first open, cached by (household, ruleset_version, data hash) |
| GET | `/api/households/{id}/members/{person_id}` | `MemberCard` | one card from the overview |
| GET | `/api/households/{id}/findings/{finding_id}/evidence` | `FindingEvidence` | which document confirmed which number |
| POST | `/api/households/{id}/refresh` | `Overview` | recompute, ignoring the cache |
| GET | `/api/stats/overview` | `Stats` | dashboard tiles across all households |
| POST | `/api/households` | `IngestResult` | a normalized household from the pipeline (§4 input) |
| POST | `/api/households/{id}/documents` | `DocumentIngestResult` | `{name, textract}` (AnalyzeDocument JSON) or `{name, text, form_type?}` |

Errors: unknown ids return **404** `{status: "not_found", errors}`. Bad input returns **422**
`{status: "needs_review", errors}`; it never returns 500. Every error item is
`{code, path, message, severity}`.

Ingest error codes: `malformed_json`, `body_too_large`, `invalid_household`, `missing_household_id`,
`missing_tax_year`, `invalid_tax_year`, `invalid_filing_status`, `invalid_money`, `negative_value`,
`value_out_of_range` (above 1e9), `invalid_integer`, `invalid_boolean`, `invalid_text`, `invalid_code`,
`invalid_date`, `invalid_confidence`, `invalid_page`, `invalid_source_document`, `invalid_name`,
`invalid_members`, `invalid_member`, `duplicate_member`, `invalid_documents`, `invalid_document`,
`document_missing_name`, `duplicate_document`, `invalid_prior_year`, `empty_profile`, `invalid_request`,
`invalid_textract`, `invalid_form_type`, `unprocessable`.

## Overview

```
schema_version "1.0" · ruleset_version "2025.1" · household_id · tax_year
status        findings | no_findings | needs_review
priority      informational | low | medium | high | null   (highest finding priority)
checklist_label "Flags for review, not advice"
summary       {filing_status, dependents, dependents_check, agi, cash (+months_of_income), mortgage_interest}
members[]     {person_id, name, employer, numbers[] {field, label, value, check, source_document, page, context, candidates}}
checklist[]   {id, question, answer, reason, dollar_impact, finding_ids}
changes_since_last_year[] {type, text}
findings[]    {id, type, category, priority, headline, explanation, dollar_impact, member, person_id, action_label, check}
data_quality  {documents, conflicts[], low_confidence_fields[], unchecked_values, missing_documents[]}
errors[]      {code, path, message, severity}
```

- `status` is `no_findings` when no finding is `medium` or above.
- Findings are sorted by priority, highest first. A finding's `check` is the worst check of the values it rests on.
- A conflicted value has `value: null`, `check: "conflicted"` and every `candidates[]` entry with its source document.
- `errors` with `severity: "error"` (input could not be normalized) means `status: "needs_review"`, `summary: null`,
  and every other section empty.
- `errors` with `validator_unavailable` (`severity: "warning"`) means the model was down or failing: the overview
  still renders, every check is `not_checked`, and that overview is not cached.
- `data_quality.low_confidence_fields` lists sources read below 0.90 Textract confidence (`LOW_CONFIDENCE_THRESHOLD`).

## Enums

| Enum | Values |
|---|---|
| check | `verified` ✔ matches its document · `mismatch` ✖ document says otherwise · `unconfirmed` ? not found in the document · `conflicted` ⚠ documents disagree · `not_checked` no document or checker off |
| answer | `yes` · `no` · `needs_data` · `not_assessed` |
| priority | `informational` · `low` · `medium` · `high` |
| status | `findings` · `no_findings` · `needs_review` |
| category | `retirement` · `tax` · `hsa` · `cash_management` · `life_event` · `data_quality` |
| change_type | `new_dependent` · `new_employer` · `new_mortgage` · `large_income_increase` · `large_income_decrease` |
| severity | `error` · `warning` |
| filing_status | `single` · `married_filing_jointly` · `married_filing_separately` · `head_of_household` · `qualifying_surviving_spouse` |

Checklist ids: `retirement_can_improve`, `tax_savings_possible`, `excess_cash`, `needs_documents`,
`major_changes`, `insurance_review`, `estate_review`, `education_review` (the last three are always
`not_assessed` placeholders).

## How a check is made

For each displayed value, every source document named in its `source_document` (or in each conflict
candidate) that belongs to the same household is checked on its own:
`engine.relation(state=<that document's redacted evidence text>, proposition="<Name>'s <field> was <value>.", contradiction="... was not ...")`.
`supports` → `verified`, `contradicts` → `mismatch`, `unknown` → `unconfirmed`. Across documents, any
`verified` plus any `mismatch` → `conflicted`. Documents are never merged into one call.
