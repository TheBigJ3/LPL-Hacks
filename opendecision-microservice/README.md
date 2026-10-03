# Household rapid analysis (OpenDecision fact-checking layer)

A stateless Python microservice the platform backend calls to analyze a household: a quick overview of the
household and its members for fast checks and look-ups. The backend sends normalized household data plus the
Textract output of the documents that data came from (the same `AnalyzeDocument` FORMS response
`backend/api/v1/extraction/analyze` produces) and stores what comes back. The service keeps no data between
requests and never retrieves files.

- Python rules (ruleset `2025.2`) decide every checklist answer, finding, priority and dollar figure.
- OpenDecision (`MoritzLaurer/ModernBERT-large-zeroshot-v2.0`) does one thing: check each displayed
  value against its own source document → `verified` / `mismatch` / `unconfirmed` / `conflicted` / `not_checked`.
- If the model is off or failing, every check is `not_checked` and the overview still renders.
- Checklist answers are flags for review, not advice.

Contract: [`docs/CONTRACT.md`](docs/CONTRACT.md), [`docs/openapi.json`](docs/openapi.json), real
responses in [`tests/fixtures/expected/`](tests/fixtures/expected).

All data in `tests/fixtures/` is **synthetic test data**.

## API

| Call | What |
|---|---|
| `GET /health` | `ok`, or `degraded` when the model should be on but did not load. Open, for probes |
| `GET /v1/meta/enums` | every enum the UI renders, plus the tag file |
| `POST /v1/overview` | `{household, documents[]}` → `{overview, evidence}` |
| `POST /v1/documents/decision` | one document + members by name parts → raw answers grouped as `docType` / `tags` / `members` (audit / RAG only) |

Swagger UI is at `/docs`.

## Adding a document type or tag

Both are one entry in a config file; nothing in the code changes. The files are checked at startup, so a
mistake stops the service with a message naming the file and entry.

**Document type**: `config/doc_types.json`. Entries are tried in file order and the first match wins, so put
specific types (`1099_int`) before general ones (`account_statement`). (The `//` comments below are explanation only.)

```jsonc
"k1": {
  "label": "Schedule K-1",                                  // shown in evidence text and the UI
  "description": "IRS Schedule K-1 partner's share of income", // what the model chooses between
  "form_number": "K-1",                                     // optional: the printed form number (hyphen optional)
  "patterns": ["Schedule K-1"],                             // phrases that decide the type, whole words, any case
  "topics": ["income", "tax"]                               // topic ids from config/tags.json
}
```

`patterns` decide; the model's pick is only a suggestion. A type with no matching phrase is never detected, and
such documents come back `unknown` (`needs_review`). Reading individual values off a new form (wages, amounts)
still needs a mapping in `rapid_analysis/textract.py`; without one the document is classified and tagged but
contributes no numbers.

**Tag**: `config/document_tags.json`, tag name → the yes/no statement the model checks for every document.
It comes back as `tag_<name>` from `/v1/documents/decision` and in an overview document's `model_tags` when the
model is confident.

```json
"investments": "This document reports investment income."
```

Each tag adds one model question per document, so keep the list to tags someone uses.

## Setup

From `opendecision-microservice/`. Install torch first, from the index that matches the machine (OpenDecision needs torch>=2.14):

```bash
python -m venv .venv
source .venv/bin/activate                    # Windows: .venv\Scripts\activate
# NVIDIA GPU (cu130 needs a CUDA 13 driver):
pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cu130
# or CPU / Apple silicon:
pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements-dev.txt
python tests/tools/smoke.py                      # downloads the model on first run; prints device + latency
```

A value check costs ~2.6 s on CPU, and model calls time out after 30 s, so CPU-only machines should run
with `DECISION_BACKEND=none` (or point at a GPU host). Pip can silently replace CUDA torch with a CPU build;
`python -c "import torch; print(torch.cuda.is_available())"` should print `True` on a GPU host.

To work on everything except the model, skip torch and OpenDecision entirely:
`pip install fastapi uvicorn pydantic pytest httpx` (versions in `requirements*.txt`) and set `DECISION_BACKEND=none`.

## Run

```bash
python -m uvicorn rapid_analysis.api:app --port 8100
python -c "import json; from tests.support.fixtures import fixture_overview_request as r; print(json.dumps(r('HH006')))" > /tmp/hh006.json
curl -s -X POST http://127.0.0.1:8100/v1/overview -H "Content-Type: application/json" -d @/tmp/hh006.json
```

Or with Docker, from the repo root: `docker compose --profile opendecision up --build` (model off by default; see
`docker-compose.yml`). For a GPU host build with `--build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cu130`
and run with `--gpus all` (see `Dockerfile`). Run **one worker per container**: each worker loads its own copy of the
model, so scale with more containers instead.

### Deploy to SageMaker (GPU)

The hackathon account has no EC2 GPU quota, but it can run SageMaker GPU endpoints (`ml.g5.xlarge`: one NVIDIA
A10G). SageMaker starts the image as `docker run <image> serve` (the `serve` script: the same app on port 8080 with
`SAGEMAKER_MODE=1`) and sends it two routes: `GET /ping` (200 once the model is loaded, 503 if it failed) and
`POST /invocations`. The body of an invocation is exactly the `/v1` body; `CustomAttributes` picks the route:

| `CustomAttributes` | Same as |
|---|---|
| `operation=overview` | `POST /v1/overview` |
| `operation=decision` | `POST /v1/documents/decision` |
| `operation=enums` | `GET /v1/meta/enums` |
| `operation=health` | `GET /health` |

The backend calls it with the AWS SDK (`InvokeEndpoint` in `@aws-sdk/client-sagemaker-runtime`), so IAM is the
auth and no service token is needed. A non-200 answer (e.g. a 422 with coded errors) comes back as a `ModelError`
carrying the original status and body. Invocations time out after 60 s.

1. Build for x86 with CUDA 13 torch and push straight to ECR (after `docker login` to the registry). SageMaker only
   accepts Docker v2 manifests, so turn off the OCI format and buildx's attestations:
   ```bash
   docker buildx build --platform linux/amd64 \
     --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cu130 \
     --provenance=false --sbom=false \
     --output type=image,name=985503874603.dkr.ecr.us-east-1.amazonaws.com/opendecision-microservice:<tag>,oci-mediatypes=false,push=true .
   ```
2. Use the pushed image by digest (`<repo>@sha256:...`) in the SageMaker model, not by tag.
3. Create a SageMaker model (that image, role `opendecision-sagemaker-execution`), an endpoint config with
   `InstanceType=ml.g5.xlarge`, `InferenceAmiVersion=al2023-ami-sagemaker-inference-gpu-4-1` (NVIDIA driver 580 /
   CUDA 13.0, which the `cu130` torch build needs) and `ContainerStartupHealthCheckTimeoutInSeconds=1800` (the model
   downloads at startup), then the endpoint.

Live now: endpoint **`opendecision-microservice`** (us-east-1, config/model `opendecision-microservice-v3`, image
`opendecision-microservice:v3`). Measured on it: ~0.35–0.4 s of model work per document the first time a household
is seen, and every fixture overview equals its golden file. Two things the image needs that a Mac never shows:
`gcc` (Triton, bundled with CUDA torch, compiles a small C helper the first time a GPU kernel runs; without it every
check is `not_checked`) and the startup warm-up call in `engine.py` (so a broken GPU stack fails `/ping` and the
deploy, instead of serving `not_checked`). Model call failures are logged with their traceback in CloudWatch
(`/aws/sagemaker/Endpoints/opendecision-microservice`).

**An endpoint bills every hour it exists, busy or idle: `ml.g5.xlarge` is $1.408/hour (~$34/day). Delete it after
the demo:** `aws sagemaker delete-endpoint --endpoint-name opendecision-microservice` (the model, config, ECR image
and role cost nothing to keep, or delete them too).

| Env var | Default | Meaning |
|---|---|---|
| `DECISION_BACKEND` | `opendecision` | `none` turns the model off (every check `not_checked`) |
| `DECISION_TIMEOUT_SECONDS` | `30` | per model call; a timeout is treated as unavailable |
| `ANALYSIS_SERVICE_TOKEN` | unset | shared secret; when set, `/v1` requires `Authorization: Bearer <token>` |
| `ANALYSIS_MAX_BODY_BYTES` | `20971520` | largest request body (20 MB) |
| `LOW_CONFIDENCE_THRESHOLD` | `0.90` | Textract confidence below this is listed in data quality |

All of them are read in `rapid_analysis/settings.py`.

**Security:** set `ANALYSIS_SERVICE_TOKEN` anywhere the port is reachable by anything but the backend, and keep
the service off the public internet: only the backend should call it. Document text is redacted as soon as it is
read (TINs, SSNs, account numbers and addresses are removed) and the only thing held in memory between requests is
the model's memo of answers over that redacted text.

## Test

```bash
python -m pytest -q                                          # full suite, model on
DECISION_BACKEND=none python -m pytest -q -m "not model"     # no GPU / no download (PowerShell: $env:DECISION_BACKEND="none")
```

Known model limits are strict `xfail` tests in `tests/test_evidence.py` (raw Textract LINE order,
household-level `noul`). They must keep failing: an XPASS fails the run and means stop and report.

After changing an API shape: `tests/tools/export_openapi.py`, `tests/tools/write_samples.py` (needs the model),
and update `docs/CONTRACT.md` in the same change; `tests/test_handoff.py` enforces it.

## Layout

| Path | What |
|---|---|
| `rapid_analysis/api.py` | FastAPI endpoints, request parsing (coded errors, never a 500), service-token auth |
| `rapid_analysis/settings.py` | every environment variable |
| `rapid_analysis/taxonomy.py` | loads and validates `config/` (`tags.json`, `doc_types.json`, `document_tags.json`) |
| `rapid_analysis/normalization.py` | household input → `FieldValue`s with provenance; conflicts kept, errors collected |
| `rapid_analysis/textract.py` | AnalyzeDocument Blocks → canonical fields + redacted `label: value` evidence text |
| `rapid_analysis/engine.py` | loads OpenDecision once per process; lock + timeout around every call |
| `rapid_analysis/evidence.py` | the only model use for values: per-value, per-document checks (memoized) |
| `rapid_analysis/documents.py` | strict per-document type, tags and member assignment (memoized) |
| `rapid_analysis/rules.py` | deterministic checklist, findings and priorities (`RULESET_VERSION`) |
| `rapid_analysis/overview.py`, `contract.py` | composes and validates the overview; request/response models |
| `tests/` | the tests, plus `support/` (fixture loaders, Textract builder), `fixtures/` (synthetic households, documents,
  strict battery, `expected/` golden outputs) and `tools/` (model smoke test, fixture + sample builders, OpenAPI export) |
