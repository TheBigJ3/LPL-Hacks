# Getting the raw OpenDecision scores

The analysis service returns the raw model answers (document type, tags and household members, with
probabilities, scores and evidence) for every document it holds:

```
GET /api/households/{household_id}/documents/{document_name}/decision
```

Real example response: [`samples/raw_decision_HH006_taylor_w2.json`](samples/raw_decision_HH006_taylor_w2.json).
All data is synthetic test data.

## 1. Run the service (from `analysis/`)

First time only, set up the environment as in the [README](../README.md#setup-from-analysis) (needs an NVIDIA GPU;
the first run downloads the model). Then:

```powershell
$env:SEED_FIXTURES="1"
.venv\Scripts\python -m uvicorn rapid_analysis.api:app --host 127.0.0.1 --port 8100
```

`SEED_FIXTURES=1` loads the 10 test households (HH001-HH010) and their documents at startup. Check it is up and
the model is loaded:

```powershell
curl http://127.0.0.1:8100/health
# {"status":"ok","model_loaded":true,"device":"cuda",...}
```

`model_loaded` must be `true`. With the model off the endpoint returns 503 (there are no scores to return).

## 2. Get one document

```powershell
curl http://127.0.0.1:8100/api/households/HH006/documents/taylor_w2_2025.pdf/decision
```

Swagger UI at http://127.0.0.1:8100/docs lists it under **raw**.

## 3. Get every document

Document names come from the overview (`tags.documents[].name`):

```python
import httpx

BASE = "http://127.0.0.1:8100"
with httpx.Client(base_url=BASE, timeout=120) as c:
    raw = {}
    for h in c.get("/api/households").json()["households"]:
        hid = h["household_id"]
        overview = c.get(f"/api/households/{hid}/overview").json()
        for doc in overview["tags"]["documents"]:
            r = c.get(f"/api/households/{hid}/documents/{doc['name']}/decision")
            if r.status_code == 200:
                raw.setdefault(hid, {})[doc["name"]] = r.json()["answers"]
# raw["HH006"]["taylor_w2_2025.pdf"]["docType"]["probabilities"] -> {"w2": 0.89, ...}
```

29 documents across the 10 households. The first call per household runs the model (a second or two);
after that it is cached.

## Response shape

```
{"answers": {
  "docType":  {type: "choice", choice, probabilities {w2, 1099, 1040, 1098, bank_statement, other},
               confidence, evidence [{id, text, relevance}]},
  "tag_tax", "tag_earnings", "member_<first>_<last>" (one per household member):
              {type: "document_noul", mode, answer, status ("confirmed" | "tentative" | ...),
               binary {answer, probabilities {true, false}, confidence},
               three_way {answer, relation, scores {supports, contradicts}},
               evidence [{id, text, relevance}], compiler, compiled {proposition, contradiction}}
}}
```

Differences from a hand-written mock to watch for:

- `three_way.scores` has only `supports` and `contradicts`; there is **no `unknown` score**. Read it with
  `scores.get("unknown")`, not `scores["unknown"]`.
- These documents are short, so each answer has **one** evidence entry with `id: "document"` and the whole
  document text, not several `section-NNN` entries.
- Each yes/no answer also has `compiler` and `compiled` (the statement the model was asked). Ignore them if you
  don't need them.
- Evidence text is redacted: no SSNs, TINs, account numbers or street addresses.

## What the numbers mean (and don't)

- They are **raw and uncalibrated**. A 0.81 is not "81% likely". Use them for ranking, filtering or debugging,
  not as a confidence to show advisors, and don't let an LLM quote them.
- The service's actual decisions (document type, owner, tags, `accepted` / `needs_review`) are in the overview at
  `tags.documents[]`. Those are strict: e.g. a tag only counts when its `status` is `confirmed`, and a model
  "yes" alone never assigns a document to a member.
- The raw answers are the exact ones those decisions were made from, so the two always agree.

## Related

- Full contract: [`CONTRACT.md`](CONTRACT.md).
