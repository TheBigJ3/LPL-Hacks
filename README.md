# Backbone

**We turn scattered client documents into tagged, verified, searchable data, so any AI an advisor uses gets the right answer faster.**

> Cyan is the brain. We're the filing system that makes it accurate.

Built in 10 hours for the **LPL Financial Hackathon 2026** by Team 7. The prompt: *build a product LPL Financial would acquire.*

---

## The problem

LPL supports ~32,000 independent financial advisors. Their single biggest pain point, in LPL's own words: **client documents are scattered everywhere.** W-2s, 1099s, statements and notes live in different places, so an AI assistant asked about a client either can't find the answer or makes one up.

Competitors are closing in. Altruist's AI, Hazel, offers tax planning because it first unifies client documents. The moat isn't the chatbot. It's the data layer underneath.

## What Backbone does

Backbone is a **document intelligence and data layer** for wealth management platforms. It's not another advisor app. It plugs underneath one (LPL's ClientWorks and its AI agent Cyan first) and makes every document:

- **Extracted:** text, form fields and tables pulled out by AWS Textract.
- **Verified:** every value keeps its confidence score, source document and page. Low-confidence values are flagged for an advisor to confirm.
- **Tagged:** document type, topics and *which family member it belongs to*, decided by an open-source decision model.
- **Searchable:** the AI filters to the right household, person and year *first*, then searches, and every number it gives cites its source.

## How it works

```
 Upload ──► Extract ──► Review ──► Tag ──► Index ──► Ask
 (PDF/      (Textract,  (advisor   (Open-   (Bedrock   (Claude: filter first,
  image)     per page)   confirms   Decision) Knowledge  then search; every number
                         flagged              Base)      cites its document)
                         values)
```

| Step | What happens | Status |
|---|---|---|
| 1. Upload | Advisor uploads documents to a client household; files are stored privately in S3 | ✅ on `main` |
| 2. Extraction | AWS Textract reads each page: text, key-value fields, tables, with confidence per value | ✅ on `main` |
| 3. Confidence review | Values below the threshold (default 90%) are flagged; the advisor confirms or corrects them on the original scan | ✅ on `main` |
| 4. Tagging | The OpenDecision microservice answers typed questions per document: what type is it, is it tax-related, which household member is it about | ✅ service on SageMaker, called from the backend |
| 5. Indexing | Document text plus its tags go into a Bedrock Knowledge Base with filterable metadata | 🚧 `feat/rag-answer` |
| 6–7. Ask | Claude filters by household, member and year, searches only that subset, and answers with a citation on every claim | 🚧 `feat/rag-answer` |

**Rules the whole pipeline follows:**

- **Provenance is never dropped.** A value always carries its confidence, source document and page, from Textract all the way to the answer.
- **Verified vs. unverified is stored, never guessed.** Only an advisor's confirmation makes a value verified.
- **No citation, no claim.** An answer stating a number or fact without a source is treated as a bug.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, TanStack Query, Zustand, React Router, Socket.IO client |
| Backend | Node.js, Express, TypeScript, Drizzle ORM, BullMQ, Socket.IO, Zod |
| Data | PostgreSQL on Amazon RDS (IAM auth), Amazon S3 (uploads), Redis / Valkey (Amazon ElastiCache) |
| AI & documents | Amazon Textract · Amazon Bedrock (Knowledge Bases + Claude) · OpenDecision (ModernBERT zero-shot) on Amazon SageMaker |
| Tagging service | Python, FastAPI, PyTorch |

## Repository layout

```
.
├── frontend/                   React app (Vite)
├── backend/                    Express API, job workers, loaders
├── shared/                     Types both sides import: API params and responses
├── opendecision-microservice/  Python tagging and fact-checking service (FastAPI)
├── docker-compose.yml          Local Valkey, plus the OpenDecision service (opt-in)
└── agent.md                    Project rules; start here before contributing
```

---

## Getting started

### Prerequisites

- **Node.js 22+** and npm (the team runs Node 24)
- **AWS access** to the team account (`aws sts get-caller-identity` should work), for S3, Textract, SageMaker, Bedrock and RDS
- **Docker**, to run Valkey locally (or point at ElastiCache instead)
- *Optional:* Python and, ideally, an NVIDIA GPU, only if you're working on the OpenDecision service. See [its README](opendecision-microservice/README.md).

### 1. Install

```bash
npm install
```

### 2. Configure

```bash
cp backend/.env.example backend/.env.development      # Windows: copy backend\.env.example backend\.env.development
cp frontend/.env.example frontend/.env                # Windows: copy frontend\.env.example frontend\.env
```

Fill in `backend/.env.development`. Every variable is documented in [`backend/.env.example`](backend/.env.example). The main ones:

| Variable | What |
|---|---|
| `AWS_REGION`, `AWS_PROFILE` | AWS account access; leave the key variables blank if you use a profile |
| `POSTGRES_HOST`, `POSTGRES_DB`, `POSTGRES_USER` | RDS Postgres; uses IAM auth, so there's no password |
| `S3_DOCUMENTS_BUCKET` | Private bucket for uploads, in `AWS_REGION` |
| `OPENDECISION_ENDPOINT_NAME` | The tagging service's SageMaker endpoint (default `opendecision-microservice`) |
| `REDIS_HOST`, `REDIS_PORT` | `localhost` / `6379` for the local Valkey below |
| `COOKIE_SECRET` | Any long random string |

`frontend/.env` can stay as-is. With `VITE_API_URL` blank, Vite proxies `/v1` and `/socket.io` to the backend on port 3001.

> Never commit `.env.development` or `.env`. They're gitignored, so keep it that way.

### 3. Start Redis (Valkey)

```bash
npm run valkey:up        # stop it with: npm run valkey:down
```

### 4. Set up the database

```bash
npm run db:migrate --workspace backend
```

### 5. Run it

```bash
npm run dev
```

This builds `shared/`, then starts both apps:

| App | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3001 (health check at `/`) |

## Using the app

| Page | Path | What it does |
|---|---|---|
| Documents | `/documents` · `/clients/:clientId/documents` | A household's documents, grouped and filterable by tag |
| Extract | `/extract` · `/clients/:clientId/extract` | Upload a document, run Textract and review flagged fields on the original scan |
| Notes | `/notes` · `/clients/:clientId/notes` | Rich-text advisor notes scoped to a client |

Use the sidebar's client switcher to change household. There's a light and dark theme too.

### API

| Method | Route | What |
|---|---|---|
| `GET` | `/v1/user/getUser` | The acting advisor (see *Security*) |
| `POST` | `/v1/documents/upload` | Upload a document for extraction |
| `GET` | `/v1/documents/get` | Fetch a document and its extracted fields |

Routes come from the folder structure: `backend/api/v1/documents/upload.ts` becomes `POST /v1/documents/upload`. Request and response types live in `shared/src/types`.

## OpenDecision microservice

The tagging step runs as a separate, stateless Python service, deployed as a SageMaker endpoint that the backend calls with the AWS SDK (IAM is the auth). The backend sends it a document's Textract output plus the household's members. It returns the document type, topic tags and which members the document concerns, and checks each displayed value against its source document (`verified` / `mismatch` / `unconfirmed` / `conflicted` / `not_checked`). Python rules make every final decision, so the model only answers yes/no questions; it never writes text.

```bash
docker compose --profile opendecision up --build     # run it locally instead; model off by default on CPU
```

Setup, API contract, GPU and SageMaker deployment: [`opendecision-microservice/README.md`](opendecision-microservice/README.md).

> ⚠️ **Cost:** the live SageMaker GPU endpoint bills about **$34/day while it exists, idle or not.** Delete it after the demo:
> `aws sagemaker delete-endpoint --endpoint-name opendecision-microservice`

---

## Testing

```bash
npm test --workspace backend             # backend unit tests (Vitest); no AWS, DB or Redis needed
npm run typecheck --workspace backend    # TypeScript check
npm test --workspace frontend            # frontend tests (Vitest; none written yet, so this passes empty)
npm run lint --workspace frontend        # oxlint
```

OpenDecision service (from `opendecision-microservice/`):

```bash
DECISION_BACKEND=none python -m pytest -q -m "not model"    # no GPU needed
```

## Security

This is a hackathon demo, and **authentication was deliberately cut.** Every API route and socket is public, protected only by rate limiting, and every request acts as one default advisor (from the `DEFAULT_USER_*` env vars). Real sign-in replaces one file, `backend/apiMiddleware/currentUser.ts`, without touching any routes. Don't expose the backend or the OpenDecision service to the public internet. If the OpenDecision port is reachable by anything other than the backend, set `ANALYSIS_SERVICE_TOKEN`.

All sample data in this repo (households, W-2s, 1099s) is **synthetic**.

## Contributing

- **Read [`agent.md`](agent.md) first.** Conventions live in `agent.md` files throughout the tree, and each governs its own folder and everything below it. Read the chain from the root down to the folder you're editing.
- **Branches:** `type/short-description`, e.g. `feat/textract-extraction`, `fix/confidence-review`.
- **Commits:** `type(Scope): short title`, with a `* type: change` bullet per notable change. The full format is in [`agent.md`](agent.md#git).
- Big changes (new systems, schema or API changes, anything spanning frontend and backend) go on their own branch.

---

## Team 7

- **Shane Sharma** (Captain)
- **Gerardo Medina**
- **Evan Packard**
- **Aidan Rus**
- **Aydan Soo-Hoo**
