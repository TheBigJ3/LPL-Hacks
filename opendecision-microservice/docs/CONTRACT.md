# Rapid analysis contract (schema 1.1, ruleset 2025.2)

The service is **stateless**: the platform backend sends a household and its documents, gets the overview back,
and stores it. Nothing is kept between requests except the loaded model and its memo of answers. Pydantic models in
`rapid_analysis/contract.py` are the source of truth; `openapi.json` is exported from them (request bodies
included, so client types can be generated from it) and `tests/fixtures/expected/` holds real responses.

Checklist answers are **flags for review, not advice** (`checklist_label`). Deterministic Python rules
decide every answer, finding, category, priority and dollar figure. OpenDecision produces only the
per-value `check`. No model internals (scores, probabilities, backend, model name) appear in any response.

## Endpoints

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| GET | `/health` | | `Health` | `{status: ok \| degraded, model_loaded, device, ruleset_version, schema_version}`; never needs the token |
| GET | `/v1/meta/enums` | | `Enums` | every enum value the UI renders, the document tags, plus the full tag file |
| POST | `/v1/overview` | `OverviewRequest` | `OverviewResult` | `{household, documents[]}` → `{overview, evidence}` |
| POST | `/v1/documents/decision` | `DocumentDecisionRequest` | `RawDocumentDecision` | raw OpenDecision answers for one document (see below) |

**Auth.** When `ANALYSIS_SERVICE_TOKEN` is set, every `/v1` call needs `Authorization: Bearer <token>`; a missing or
wrong token is **401** `{status: "unauthorized", errors: [{code: "unauthorized", ...}]}`. Unset, `/v1` is open:
only acceptable on a developer machine.

**Errors.** Bad input returns **422** `{status: "needs_review", errors}` and never a 500; every problem in the
request is reported at once. Every error item is `{code, path, message, severity}`, and `path` points into the
request body (`household.members[0].wages`, `documents[2].name`). A body over `ANALYSIS_MAX_BODY_BYTES` (20 MB) is
**413** `body_too_large`.

Error codes: `malformed_json`, `body_too_large`, `invalid_request`, `invalid_household`, `missing_household_id`,
`missing_tax_year`, `invalid_tax_year`, `invalid_filing_status`, `invalid_money`, `negative_value`,
`value_out_of_range` (above 1e9), `invalid_integer`, `invalid_boolean`, `invalid_text`, `invalid_code`,
`invalid_date`, `invalid_confidence`, `invalid_page`, `invalid_source_document`, `invalid_name`,
`invalid_members`, `invalid_member`, `duplicate_member`, `invalid_documents`, `invalid_document`,
`document_missing_name`, `duplicate_document`, `invalid_prior_year`, `empty_profile`, `invalid_textract`,
`invalid_text`, `invalid_form_type`, `invalid_operation` (SageMaker only), `unprocessable`, `unauthorized`.

## Overview request (`POST /v1/overview`)

```
{
  "household": { ...the normalized household, below... },
  "documents": [                                   optional; without documents every check is not_checked
    {"name": "taylor_w2_2025.pdf", "textract": <AnalyzeDocument FORMS response with Blocks>},
    {"name": "notes.pdf", "text": "Form W-2 ... 1 Wages: 110,000.00", "form_type": "W-2"}   text instead of textract
  ]
}
```

`documents[].name` must match the `source_document` names the household's values cite. Document text is redacted
(SSNs, TINs, account numbers, addresses) as soon as it is read and is never logged or returned.
`tests.support.fixtures.fixture_overview_request("HH006")` builds a complete, real request from the fixtures.

**Household input.** The pipeline's normalized household:

```
household_id   letters, digits, - or _ (required)
tax_year       integer (required)
filing_status  single | married_filing_jointly | married_filing_separately | head_of_household |
               qualifying_surviving_spouse (common aliases such as "MFJ" are accepted)
adjusted_gross_income, dependents, mortgage_interest, cash_balance          household values
members[]      {person_id, name, <member values>}
documents[]    {name, type ("W-2", "1099-R", ... normalized to a doc_type id, see below), date}
prior_year     {tax_year, filing_status, <household values>, members[]}      plain values, never checked
```

Member values: `employer`, `wages`, `employee_401k_contribution`, `hsa_contribution`, `hsa_eligible_health_plan`,
`interest_income`, `dividend_income`, `self_employment_income`, `retirement_distribution`,
`retirement_distribution_taxable`, `federal_tax_withheld`, `state_tax_withheld`, `distribution_code`,
`distribution_from_ira`, `distribution_date`.

Each value is either plain (`110000`, `"$110,000.00"`) or carries its provenance, which is what makes it checkable:

```
{"value": 110000, "source_document": "taylor_w2_2025.pdf", "page": 1, "textract_confidence": 0.981, "verified": false}
```

A list of those means the value came from several documents; if they disagree it becomes a conflict (`value: null`,
`check: "conflicted"`, every candidate kept). `textract_confidence` may be 0–1 or 0–100.

**Response.** `{overview, evidence}`: `evidence` maps each finding id in `overview.findings` to its `FindingEvidence`
(which document confirmed which number), so the drill-down needs no second call. Store both.

**Caching.** The service does not cache overviews; store them in the backend. Rebuild when the household, its
documents or `ruleset_version` change. Do **not** keep an overview whose `errors` include `validator_unavailable` as
final: it was built with the model off or failing (every check `not_checked`). Show it, and rebuild later. Model
answers are memoized in the service, so rebuilding an unchanged household is cheap.

**Moved to the backend.** The old in-memory endpoints (household list with filters, stats tiles, member card,
per-finding evidence, refresh) are gone. Their data is all in the stored overviews:
- list row: `household_id`, `tax_year`, member names, `status`, `priority`, `findings` = number of findings with
  priority `medium` or higher, `needs_documents` = checklist `needs_documents` answer is `yes`, `top_finding` =
  `findings[0].headline`, `dollar_impact` = sum of `dollar_impact` over checklist items answered `yes`.
- member card: `overview.members[]` by `person_id`. Finding evidence: `evidence[finding_id]`.

## Overview

```
schema_version "1.1" · ruleset_version "2025.2" · household_id · tax_year
status        findings | no_findings | needs_review
priority      informational | low | medium | high | null   (highest finding priority)
checklist_label "Flags for review, not advice"
summary       {filing_status, dependents, dependents_check, dependents_source_document, agi, cash (+months_of_income), mortgage_interest}
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
  Downstream text quotes these and never recomputes them.
- `prior_year` is last year's values exactly as received. They have no documents and are never checked.

## Tags block (`overview.tags`) and strict documents

```
tags.household  {topics[], categories_flagged[], checklist_yes[], checklist_not_assessed[], life_events[], data_quality[]}
tags.members[]  {person_id, name, topics[], fields_present[], documents[], findings[], checks {verified, unconfirmed, mismatch, conflicted, not_checked}}
tags.documents[] {name, doc_type, doc_subtype, doc_type_method, suggested_doc_type, topics[], model_tags[],
                  members[] {person_id, name, role, method}, attribution_status, status, review_reasons[], notes[]}
data_quality.unassigned_documents[]       names of documents not assigned to a member
data_quality.documents_needing_review[]   {name, review_reasons[]}
```

Every id comes from a config file: doc types from `config/doc_types.json`, `model_tags` from
`config/document_tags.json`, everything else from `config/tags.json`. `household.topics` is the union of document
topics; `categories_flagged` are categories of non-informational findings; `data_quality` uses the tag file's
data-quality ids.

Per-document decisions are strict. Only an unknown type or an unsettled owner makes a document `needs_review`;
everything else uncertain is recorded in `notes[]` and leaves `status` alone:
- `doc_type` comes from the doc types' `patterns` phrases on the document text, first match in file order
  (`doc_type_method: "pattern"`); with no match it is `unknown` (`doc_type_unknown`). The model chooses between
  every doc type's `description`, and its guess is only stored as `suggested_doc_type`. A pattern result the model
  contradicts with probability ≥ 0.90 keeps the pattern and adds the note `doc_type_model_disagrees`.
- `topics` come from the doc type's `topics`. `model_tags` (one per `config/document_tags.json` entry, each a topic id:
  `income` · `retirement` · `tax` · `self_employment` · `health_savings` · `banking_cash` · `investments` ·
  `mortgage_housing` · `insurance` · `estate` · `education` · `life_event` · `equity_compensation` · `debt` ·
  `charitable_giving` · `social_security`) count only when the model confirms one of the tag's checks (else the note
  `tag_uncertain:<tag>`). A check is a statement and its opposite; it says yes when OpenDecision confirms it, or when it
  is tentative and the statement beats its opposite with binary probability ≥ 0.80.
- `members` come from name matching (`method: "name_match"`, `owner` or `joint`). Surname/initial-only is
  `ambiguous` (`member_ambiguous`); no match is `unassigned` (`member_unassigned` if it carries amounts). The model can
  only veto (`member_model_disagrees`); a model-only yes is ignored (note `member_model_only`).
- Value checks use only documents assigned to that member; household values use joint documents (or, in a
  one-member household, that member's documents).

Review reasons (the only ones that set `status: "needs_review"`): `doc_type_unknown`, `member_ambiguous`,
`member_unassigned`, `member_model_disagrees`. Notes (never change `status`): `tag_uncertain:<tag>` (e.g.
`tag_uncertain:tax`, `tag_uncertain:income`), `member_model_only`, `doc_type_model_disagrees`.
- Findings are sorted by priority, highest first. A finding's `check` is the worst check of the values it rests on.
- A conflicted value has `value: null`, `check: "conflicted"` and every `candidates[]` entry with its source document.
- `errors` with `severity: "error"` (input could not be normalized) means `status: "needs_review"`, `summary: null`,
  and every other section empty.
- `errors` with `validator_unavailable` (`severity: "warning"`) means the model was down or failing: the overview
  still renders, every check is `not_checked`, and it should be rebuilt later rather than stored as final.
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
| doc_type | `w2` · `1099_int` · `1099_r` · `1099_div` · `1099_nec` · `1040` · `1098` · `5498_sa` · `1095` · `account_statement` · `unknown` (from `config/doc_types.json`) |
| severity | `error` · `warning` |
| filing_status | `single` · `married_filing_jointly` · `married_filing_separately` · `head_of_household` · `qualifying_surviving_spouse` |

Checklist ids: `retirement_can_improve`, `tax_savings_possible`, `excess_cash`, `needs_documents`,
`major_changes`, `insurance_review`, `estate_review`, `education_review` (the last three are always
`not_assessed` placeholders).

## Raw document decision (`POST /v1/documents/decision`)

Body:

```
{"document": {"name": "taylor_w2_2025.pdf", "textract": <AnalyzeDocument response>},   or {name, text, form_type?}
 "members": [{"first_name": "Taylor", "middle_name": "Ann", "last_name": "Mock", "suffix": "Jr.", "person_id": "HH006-P1"},
             {"first_name": "Sam", "last_name": "Mock"}]}
```

`first_name` and `last_name` are required; `middle_name`, `suffix` (Jr., Sr., III) and `person_id` are optional. Each
member is asked about under the key `member_<first>_<middle>_<last>_<suffix>`: lowercased, punctuation dropped, absent
parts skipped (`member_taylor_ann_mock_jr`, `member_sam_mock`). Two members with the same key are `duplicate_member`.
Name matching on the document uses the first name and the last name; middle names and suffixes never match alone.

Response, grouped so each kind can be iterated:

```
{"docType": {...},
 "tags":    {"tag_income": {...}, "tag_retirement": {...}, ...},                 one per config/document_tags.json entry
 "members": {"member_taylor_ann_mock_jr": {...}, "member_sam_mock": {...}}}     in the order sent
```

Sample: `tests/fixtures/expected/raw_decision_HH006_taylor_w2.json`.

- `docType`: `{type: "choice", choice, probabilities, confidence, evidence[] {id, text, relevance}}`.
- every `tags` and `members` entry: `{type: "document_noul", mode, answer, status, binary {answer, probabilities, confidence},
  three_way {answer, relation, scores}, evidence[], compiler, compiled {proposition, contradiction}}`.
- a `tags` entry is the tag's deciding check plus `basis` and `checks[] {statement, status, answer}` (every check, in
  config order). When a check says yes, the entry is that check with `status: "confirmed"`, `answer: true` and `basis`
  `"confirmed"` (OpenDecision confirmed it) or `"probability"` (tentative, binary probability ≥ 0.80); its own raw status
  stays in `checks[]`. Otherwise `basis` is null and the entry is the first check that is not a confirmed no (or the
  first check when all are).
- `three_way.scores` has only `supports` and `contradicts` (no `unknown`: read it with `.get`). Short documents give
  **one** evidence entry with `id: "document"` and the whole text. `compiled` is the statement the model was asked.
- It is the same response the strict document decision used (memoized; no second model call), so it always agrees
  with `tags.documents[]` of an overview built from the same document and members. Evidence text is redacted (no
  SSNs, TINs, account numbers or addresses).
- **Raw and uncalibrated** (a 0.81 is not "81% likely"). For audit and RAG experiments only: the overview never uses it, and the
  decided values (type, owner, tags, status) are in `tags.documents[]`. Do not show these numbers to advisors as
  confidence, and do not let an LLM quote them.
- 503 `validator_unavailable` when the model is off or failing.

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
| household input `documents[].type` | free text, passed through | normalized to a `doc_type` id (`W-2` → `w2`); unrecognized → `unknown` |

## How a check is made

For each displayed value, every source document named in its `source_document` (or in each conflict
candidate) that belongs to the same household is checked on its own:
`engine.relation(state=<that document's redacted evidence text>, proposition="<Name>'s <field> was <value>.", contradiction="... was not ...")`.
`supports` → `verified`, `contradicts` → `mismatch`, `unknown` → `unconfirmed`. Across documents, any
`verified` plus any `mismatch` → `conflicted`. Documents are never merged into one call.
