# Rapid analysis contract (schema 1.1, ruleset 2025.1)

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
| POST | `/api/households/{id}/ask` | `AskResponse` | `{question}`, routed by keyword rules and answered from the overview |
| GET | `/api/households/{id}/rag-chunks` | `RagChunks` | plain-English chunks + filter metadata for a RAG |

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
schema_version "1.1" · ruleset_version "2025.1" · household_id · tax_year
status        findings | no_findings | needs_review
priority      informational | low | medium | high | null   (highest finding priority)
checklist_label "Flags for review, not advice"
summary       {filing_status, dependents, dependents_check, agi, cash (+months_of_income), mortgage_interest}
members[]     {person_id, name, employer, numbers[] {field, label, value, check, source_document, page, context, candidates}}
checklist[]   {id, question, answer, reason, dollar_impact, finding_ids, metrics, rule}
changes_since_last_year[] {type, text}
findings[]    {id, type, category, priority, headline, explanation, dollar_impact, member, person_id, action_label, check, metrics, rule}
data_quality  {documents, conflicts[], low_confidence_fields[], unchecked_values, missing_documents[]}
errors[]      {code, path, message, severity}
prior_year    {tax_year, filing_status, numbers[] {field, label, value}, members[] {person_id, name, numbers[]}} | null
```

- `status` is `no_findings` when no finding is `medium` or above.
- Checklist questions, finding `type`/`category`/`headline`/`action_label` and field labels come from
  `config/tags.json` (headline `{member}` = the member's first name, `{field}` = the field label, lowercased).
- `metrics` holds the exact numbers a rule decided on (e.g. `contribution`, `pct_of_pay`, `pct_of_limit`, `room`,
  `limit`; `cash`, `months_of_income`, `target`, `excess`; `withholding_pct`); `rule` states the threshold applied.
  Downstream text (Ask, RAG) quotes these and never recomputes them.
- `prior_year` is last year's values exactly as received. They have no documents and are never checked.

## Tags block (`overview.tags`) and strict documents

```
tags.household  {topics[], categories_flagged[], checklist_yes[], checklist_not_assessed[], life_events[], data_quality[]}
tags.members[]  {person_id, name, topics[], fields_present[], documents[], findings[], checks {verified, unconfirmed, mismatch, conflicted, not_checked}}
tags.documents[] {name, doc_type, doc_subtype, doc_type_method, suggested_doc_type, topics[], model_tags[],
                  members[] {person_id, name, role, method}, attribution_status, status, review_reasons[]}
data_quality.unassigned_documents[]       names of documents not assigned to a member
data_quality.documents_needing_review[]   {name, review_reasons[]}
```

Every id is a `config/tags.json` id. `household.topics` is the union of document topics; `categories_flagged` are
categories of non-informational findings; `data_quality` uses the tag file's data-quality ids.

Per-document decisions are strict (anything uncertain is `needs_review` with a reason):
- `doc_type` comes from form-number patterns (`doc_type_method: "pattern"`); with no match it is `unknown`
  (`doc_type_unknown`). The model's guess is only stored as `suggested_doc_type`. A pattern result the model
  contradicts with probability ≥ 0.90 keeps the pattern and adds `doc_type_model_disagrees`.
- `topics` come from the tag file's `doc_types[].topics`; `model_tags` (`tax`, `income`) only when the model's
  status is `confirmed` (else `tag_uncertain:<topic>`).
- `members` come from name matching (`method: "name_match"`, `owner` or `joint`). Surname/initial-only is
  `ambiguous` (`member_ambiguous`); no match is `unassigned` (`member_unassigned` if it carries amounts). The model can
  only veto (`member_model_disagrees`); a model-only yes is ignored (`member_model_only`).
- Value checks use only documents assigned to that member; household values use joint documents (or, in a
  one-member household, that member's documents).

Review reasons: `doc_type_unknown`, `doc_type_model_disagrees`, `tag_uncertain:tax`, `tag_uncertain:income`,
`member_ambiguous`, `member_unassigned`, `member_model_disagrees`, `member_model_only`.
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
| change_type | `life_event_new_dependent` · `life_event_new_employer` · `life_event_new_mortgage` · `life_event_large_income_increase` (rise or fall of 25% or more) |
| finding type | `retirement_contribution_review` · `self_employment_tax_review` · `excess_cash_review` · `retirement_distribution_review` · `hsa_eligibility_unverified` · `source_data_conflict` · `life_event_new_dependent` · `life_event_new_employer` · `life_event_new_mortgage` · `life_event_large_income_increase` |
| doc_type | `w2` · `1040` · `1099_r` · `1099_int` · `1099_div` · `1099_nec` · `1098` · `5498_sa` · `1095` · `account_statement` · `unknown` |
| severity | `error` · `warning` |
| filing_status | `single` · `married_filing_jointly` · `married_filing_separately` · `head_of_household` · `qualifying_surviving_spouse` |

Checklist ids: `retirement_can_improve`, `tax_savings_possible`, `excess_cash`, `needs_documents`,
`major_changes`, `insurance_review`, `estate_review`, `education_review` (the last three are always
`not_assessed` placeholders).

## Ask (`POST /api/households/{id}/ask`)

Body `{"question": "can sarah make some savings"}` (1–500 characters). Response:

```
question
understood {intent, person_id, member, field, time_ref, router: "keyword"}   (intent/field/time_ref are tags.json ids)
answer     {type: checklist|value|overview|documents|changes|verify|none, short, text, dollar_impact, values[] {field, value, check, source_document, page}}
suggestions[]
```

- Routing is `KeywordRouter` (pluggable `Router`), with no model. Member = name match (a unique first name is enough);
  an unknown or ambiguous name never answers and asks which member. Time = `time_refs` synonyms or a
  4-digit year. Intent precedence: verify > documents_status > changes > tax_opportunity > cash_opportunity >
  savings_opportunity > overview > lookup. "income" means wages for a member and AGI for the household.
- Answers are built only from the overview (values, checks, metrics, prior_year). A missing year or value is
  `short: "No data"`. Nothing is computed or invented.
- Out of scope gives `answer.type: "none"`, empty text and 4 suggestions built from the household.

## RAG chunks (`GET /api/households/{id}/rag-chunks`, `scripts/export_rag.py`)

`{household_id, chunks[] {id, text, metadata}}`; the sample for all 10 households is `samples/rag_chunks.jsonl`.

- One chunk per household summary, member, checklist item, finding, document and changes-since-last-year.
  Ids are `"<HH>:<chunk_type>:<key>"`, e.g. `HH006:checklist:retirement_can_improve`.
- `text` is plain English under 700 characters. Every number states its check ("verified against <doc>",
  "unconfirmed: not found in <doc>", "documents disagree: $120,000 (…) vs $165,000 (…)", "not checked").
  Checklist and finding chunks state the exact metrics, then `Rule: …`, then `Result: …`, and end with
  "Flag for review, not advice." Placeholders say "has not been assessed".
- `metadata` has the tag file's `rag_chunk_metadata` fields plus `chunk_type`, `checklist_id`, `answer`, `dollar_impact`,
  `metrics`, `rule`, `checks` and `ruleset_version`. **`model_scores`** (raw OpenDecision relation and scores) appears
  only here, for audit. It is uncalibrated and never appears in `text`; the LLM must not see or repeat it.

## Schema 1.0 → 1.1 id mapping

All ids now come from [`tags.json`](tags.json) (the taxonomy, amendment Appendix A); `tests/test_tags.py`
fails if the service emits an id that is not in it. Ids not listed here did not change (checklist ids,
answers, priorities, statuses, categories and check statuses already matched).

| Where | 1.0 | 1.1 |
|---|---|---|
| `schema_version` | `1.0` | `1.1` |
| finding `type` | `excess_cash` | `excess_cash_review` |
| finding `type` | `early_distribution`, `distribution_under_withheld`, `normal_distribution`, `rollover_distribution`, `distribution_review` | `retirement_distribution_review` (priority still follows the code: 1 high, 7 under-withheld medium, 7 low, G informational) |
| finding `type` | `hsa_eligibility_proof_missing` | `hsa_eligibility_unverified` |
| finding `type` | `source_conflict`, `value_mismatch` | `source_data_conflict` |
| finding `type`, change `type` | `new_dependent`, `new_employer`, `new_mortgage` | `life_event_new_dependent`, `life_event_new_employer`, `life_event_new_mortgage` |
| finding `type`, change `type` | `large_income_increase`, `large_income_decrease` | `life_event_large_income_increase` (the text says "rose" or "fell") |
| `data_quality.missing_documents[].type` | `hsa_plan_proof` | `1095` (the doc type that would prove it) |
| document ingest response | `form_type` (`W-2`, `1099-R`, … or null) | `doc_type` (`w2`, `1099_r`, … or `unknown`) |
| household input `documents[].type` | free text, passed through | normalized to a `doc_type` id (`W-2` → `w2`); unrecognized → `unknown` |

## How a check is made

For each displayed value, every source document named in its `source_document` (or in each conflict
candidate) that belongs to the same household is checked on its own:
`engine.relation(state=<that document's redacted evidence text>, proposition="<Name>'s <field> was <value>.", contradiction="... was not ...")`.
`supports` → `verified`, `contradicts` → `mismatch`, `unknown` → `unconfirmed`. Across documents, any
`verified` plus any `mismatch` → `conflicted`. Documents are never merged into one call.
