# Household rapid analysis (OpenDecision fact-checking layer)

A Python FastAPI service behind the rapid analysis page: a quick overview of a household and its
members for fast checks and look-ups. It consumes normalized household data from the pipeline plus
the Textract output of the documents that data came from (the same `AnalyzeDocument` FORMS response
`backend/api/v1/extraction/analyze` produces). It never retrieves files.

- Python rules (ruleset `2025.2`) decide every checklist answer, finding, priority and dollar figure.
- OpenDecision (`MoritzLaurer/ModernBERT-large-zeroshot-v2.0`) does one thing: check each displayed
  value against its own source document → `verified` / `mismatch` / `unconfirmed` / `conflicted` / `not_checked`.
- If the model is off or failing, every check is `not_checked` and the overview still renders.
- Checklist answers are flags for review, not advice.

Contract: [`docs/CONTRACT.md`](docs/CONTRACT.md), [`docs/openapi.json`](docs/openapi.json), real
responses in [`docs/samples/`](docs/samples). Checkpoint history: [`docs/CHECKPOINTS.md`](docs/CHECKPOINTS.md).

All data in `fixtures/` is **synthetic test data**.

## Setup (from `analysis/`)

```powershell
python -m venv .venv
# NVIDIA GPU: install CUDA torch first (OpenDecision needs torch>=2.14; cu130 needs a CUDA 13 driver)
.venv\Scripts\python -m pip install torch==2.14.1+cu130 --index-url https://download.pytorch.org/whl/cu130
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python scripts\smoke.py          # downloads the model on first run; prints device + latency
```

CPU-only machines: a value check costs ~2.6 s on CPU, so run with `DECISION_BACKEND=none` (or point at
a shared GPU host). Pip can silently replace CUDA torch with a CPU build when installing OpenDecision;
`python -c "import torch; print(torch.cuda.is_available())"` should print `True`.

## Run

```powershell
.venv\Scripts\python -m uvicorn rapid_analysis.api:app --host 127.0.0.1 --port 8100
.venv\Scripts\python scripts\seed.py           # in a second shell: loads HH001-HH010 + their documents
curl http://127.0.0.1:8100/api/households/HH006/overview
```

Or seed at startup: `$env:SEED_FIXTURES="1"` before `uvicorn`. Swagger UI is at `/docs`.

| Env var | Default | Meaning |
|---|---|---|
| `DECISION_BACKEND` | `opendecision` | `none` turns the model off (every check `not_checked`) |
| `DECISION_TIMEOUT_SECONDS` | `30` | per model call; a timeout is treated as unavailable |
| `SEED_FIXTURES` | unset | `1` loads the fixtures at startup |
| `ANALYSIS_CORS_ORIGINS` | `http://localhost:5173` | comma-separated allowed origins |
| `LOW_CONFIDENCE_THRESHOLD` | `0.90` | Textract confidence below this is listed in data quality |

**Security:** the service has no authentication, like the rest of this demo. Bind it to `127.0.0.1`,
or put it behind the platform's auth before exposing it. Storage is in-process memory and only ever
holds redacted evidence text (TINs, SSNs, account numbers and addresses are removed at ingestion).

## Frontend

The `/analysis` page in `frontend/` (system `analysis`) renders the overview. Vite proxies `/api` and
`/health` to `http://127.0.0.1:8100`, so start this service, seed it, then `npm run dev` from the repo root.

## Test

```powershell
.venv\Scripts\python -m pytest -q                                   # full suite, model on
$env:DECISION_BACKEND="none"; .venv\Scripts\python -m pytest -q -m "not model"   # no GPU / no download
.venv\Scripts\python scripts\checkpoint.py "Phase N" tests --metrics  # run + append to docs/CHECKPOINTS.md
```

Known model limits are strict `xfail` tests in `tests/test_evidence.py` (raw Textract LINE order,
household-level `noul`). They must keep failing: an XPASS fails the run and means stop and report.

After changing an API shape: `scripts/export_openapi.py`, `scripts/write_samples.py` (needs the model),
and update `docs/CONTRACT.md` in the same change; `tests/test_handoff.py` enforces it.

## Layout

| Path | What |
|---|---|
| `rapid_analysis/normalization.py` | §4 input → `FieldValue`s with provenance; conflicts kept, errors collected |
| `rapid_analysis/textract.py` | AnalyzeDocument Blocks → canonical fields + redacted `label: value` evidence text |
| `rapid_analysis/engine.py` | loads OpenDecision once per process; lock + timeout around every call |
| `rapid_analysis/evidence.py` | the only model use: per-value, per-document checks |
| `rapid_analysis/rules.py` | deterministic checklist, findings and priorities (`RULESET_VERSION`) |
| `rapid_analysis/overview.py`, `contract.py` | composes and validates the overview |
| `rapid_analysis/api.py`, `store.py` | FastAPI endpoints and the in-memory store / overview cache |
| `scripts/` | smoke, fixture builder, samples, OpenAPI export, seed, checkpoint logger |
