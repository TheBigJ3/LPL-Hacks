# LPL Hackathon 2026 — Backbone

A document intelligence and data layer for wealth-management platforms. Advisors upload client documents. AWS Textract extracts every field with its confidence score, source document and page. Fields with low confidence are flagged for review. An OpenDecision model tags each document and checks displayed values against the documents they came from.

## Information

### Team 7 Members
* Shane Sharma (Captain)
* Gerardo Medina
* Evan Packard
* Aidan Rus
* Aydan Soo-Hoo

---

## ⚠️ This environment only works with the AWS account provided for the hackathon

**We could only run this environment with the AWS account LPL provided for the hackathon (account `985503874603`, region `us-east-1`).** The code itself is ordinary Node and Python. But the backend depends on resources that exist only in that account, and every one of them authenticates with IAM credentials for that account:

| Dependency | Why it is tied to the provided account |
|---|---|
| **Postgres** (Aurora PostgreSQL) | Accepts **only IAM database authentication**. There is no password: the backend creates a 15-minute token from the caller's AWS identity on every connection. |
| **OpenDecision model** (SageMaker endpoint) | The account has **no EC2 GPU quota**, so the model runs on a SageMaker `ml.g5.xlarge` GPU endpoint, called with `sagemaker:InvokeEndpoint`. |
| **Document uploads** (S3) | Uploads are stored in a private bucket in the account. Nothing is stored in Postgres. |
| **Extraction** (Textract) | `AnalyzeDocument` is called with the account's credentials, one page at a time. |
| **Valkey / Redis** (ElastiCache) | Reachable only from inside the account's VPC. On the provided EC2 dev instances we used ElastiCache; on laptops we ran Valkey locally with Docker. This is the **only** dependency that works without the account. |

We got credentials in two ways: `aws login` with a `hackathon` CLI profile on our laptops, or the instance profile on the provided EC2 instances (the **Code Editor** and **Ubuntu Desktop** dev machines; the Code Editor instance was served through CloudFront for the demo).

**With another AWS account, or with no credentials, the backend does not work.** The settings it requires (`requireEnv`) stop it at startup, and with credentials for any other account its first database or AWS call fails. To run it somewhere else, recreate every resource in [AWS resources](#aws-resources) in your own account and put your values into `backend/.env.development`.

> **Cost:** the SageMaker endpoint is billed every hour it exists, busy or idle (`ml.g5.xlarge` is about $1.41/hour, ~$34/day). Delete it after the demo: `aws sagemaker delete-endpoint --endpoint-name opendecision-microservice`.

---

## Repository layout

| Path | What |
|---|---|
| `shared/` | `@lpl-hacks/shared`: the TypeScript types and zod schemas both sides import |
| `backend/` | Express API, Socket.IO, BullMQ jobs, Drizzle on Postgres, AWS clients (`backend/loaders/`) |
| `frontend/` | React + Vite single-page app |
| `opendecision-microservice/` | Python (FastAPI) analysis service, deployed as the SageMaker endpoint. See its [README](opendecision-microservice/README.md) |
| `docker-compose.yml` | Local Valkey, and an optional local build of the OpenDecision service |

`shared`, `backend` and `frontend` are npm workspaces of the root `package.json`.

---

## Dependencies

### Tooling

| Tool | Version | Used for |
|---|---|---|
| Node.js | 24 (built on 24.20.0) | backend, frontend, shared |
| npm | 11 (built on 11.19.0) | workspaces; `package-lock.json` is the lockfile |
| Python | 3.13 (the Docker image's version) | `opendecision-microservice/` |
| Docker + Buildx | recent | local Valkey; building the OpenDecision image for SageMaker (`linux/amd64`) |
| AWS CLI v2 | recent | `aws login`, pushing to ECR, managing the SageMaker endpoint |
| ngrok | optional | `npm run ngrok`: sharing the local frontend |

### AWS resources

All of these are in account `985503874603`, `us-east-1`.

| Service | Resource | Used for | IAM the backend's identity needs |
|---|---|---|---|
| Amazon Aurora PostgreSQL 17 (Serverless v2) | cluster `backbone` | all structured data (Drizzle) | `rds-db:connect` for the `POSTGRES_USER` DB role (role granted `rds_iam`) |
| Amazon S3 | bucket `lpl-hackathon-test-bucket-v2` | uploaded client documents | `s3:PutObject`, `s3:GetObject` |
| Amazon Textract | — | text, forms (key-value pairs) and tables from each page | `textract:AnalyzeDocument` |
| Amazon SageMaker | endpoint `opendecision-microservice` (`ml.g5.xlarge`, NVIDIA A10G) | document tagging and value checks | `sagemaker:InvokeEndpoint` |
| Amazon ECR | repository `opendecision-microservice` | the OpenDecision container image | (deploy only) |
| IAM | role `opendecision-sagemaker-execution` | the SageMaker model's execution role | (deploy only) |
| Amazon ElastiCache (Valkey 9) | cluster `lpl-hacks-valkey`, single node, no cluster mode | BullMQ queues, cache, Socket.IO adapter | network access from inside the VPC |
| Amazon EC2 + CloudFront | `CodeEditor`, `UbuntuDesktop` instances | provided dev machines; the demo was served through CloudFront | — |
| Amazon CloudWatch Logs | `/aws/sagemaker/Endpoints/opendecision-microservice` | OpenDecision model errors | — |

Amazon Bedrock is part of the design in `agent.md` (the LLM that answers questions) but is not wired into the code yet.

The RDS root CA bundle for TLS to Postgres is committed at `backend/certs/rds-global-bundle.pem`.

### npm packages

**Root** (`package.json`, dev only)

| Package | Version | Used for |
|---|---|---|
| `concurrently` | ^10.0.4 | `npm run dev` runs backend and frontend together |
| `typescript` | ^7.0.2 | workspace builds |
| `@types/node` | ^26.2.0 | Node types |

**`shared/`**

| Package | Version | Used for |
|---|---|---|
| `zod` | ^4.0.0 | API schemas shared by both sides |
| `typescript` (dev) | ^5.5.0 | build |

**`backend/`**

| Package | Version | Used for |
|---|---|---|
| `@aws-sdk/client-s3` | ^3.1146.0 | storing and reading uploads |
| `@aws-sdk/client-textract` | ^3.1146.0 | `AnalyzeDocument` |
| `@aws-sdk/client-sagemaker-runtime` | ^3.1146.0 | `InvokeEndpoint` on the OpenDecision endpoint |
| `@aws-sdk/rds-signer` | 3.1146.0 | IAM auth tokens for Postgres |
| `express` | ^4.21.2 | HTTP API |
| `cors` | ^2.8.5 | CORS |
| `cookie-parser` | ^1.4.7 | cookies |
| `pg` | ^8.23.0 | Postgres driver |
| `drizzle-orm` | ^0.45.2 | ORM and schema |
| `drizzle-zod` | ^0.8.3 | zod schemas from Drizzle tables |
| `bullmq` | ^6.3.8 | background jobs (extraction) |
| `ioredis` | ^6.0.0 | Redis/Valkey client |
| `socket.io` | ^4.8.3 | real-time updates to the frontend |
| `@socket.io/redis-adapter` | ^8.3.0 | Socket.IO across processes |
| `pdf-lib` | ^1.17.1 | splitting PDFs into single pages for Textract |
| `dotenv` | ^16.4.7 | loading `.env` files |
| `@lpl-hacks/shared` | workspace | shared types |

Dev: `drizzle-kit` ^0.31.10 (migrations), `tsx` ^4.19.2 (dev server, scripts), `dotenv-cli` ^11.0.0, `vitest` ^4.1.10, `typescript` ^5.5.0, and `@types/*` for express, cors, cookie-parser, node and pg.

**`frontend/`**

| Package | Version | Used for |
|---|---|---|
| `react`, `react-dom` | ^19.2.8 | UI |
| `react-router` | ^8.3.0 | routing |
| `@tanstack/react-query` | 5.100.6 | server state |
| `zustand` | ^5.0.15 | client stores |
| `axios` | ^1.19.0 | HTTP client |
| `socket.io-client` | ^4.8.3 | real-time updates |
| `zod` | 4.4.2 | validation |
| `pdfjs-dist` | ^5.7.284 | document previews in the browser |
| `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`, `@tiptap/extensions` | ^3.31.4 | note editor |
| `motion` | ^13.1.0 | animation |
| `react-toastify` | 11.1.0 | toasts |
| `tailwindcss`, `@tailwindcss/vite` | ^4.3.3 | styling |
| `@lpl-hacks/shared` | workspace | shared types |

Dev: `vite` ^8.2.0, `@vitejs/plugin-react` ^6.0.4, `typescript` ~6.0.2, `oxlint` ^1.75.0, `vitest` 4.1.10, `jsdom` 26.1.0, `@testing-library/react` 16.3.0, `@testing-library/jest-dom` 6.8.0, `@testing-library/user-event` 14.6.1, and `@types/*` for node, react and react-dom.

### Python packages (`opendecision-microservice/`)

| Package | Version | Used for |
|---|---|---|
| `torch` | 2.14.1 | model runtime. Install it **first**, from the PyTorch index for the machine: `cu130` for NVIDIA (CUDA 13), `cpu` otherwise |
| `OpenDecision` | 0.1.2 | the decision model wrapper |
| `fastapi` | 0.142.2 | HTTP API |
| `uvicorn` | 0.54.0 | ASGI server |
| `pydantic` | 2.13.5 | request and response models |
| `pytest` (dev) | 9.1.1 | tests |
| `httpx` (dev) | 0.28.1 | test client |

The model, `MoritzLaurer/ModernBERT-large-zeroshot-v2.0` (~1.5 GB), downloads from Hugging Face the first time the service starts. The Docker image also installs `gcc` and `libc6-dev`, which Triton needs on GPU.

### Container images

| Image | Used for |
|---|---|
| `valkey/valkey:9` | local Redis-compatible store (`docker-compose.yml`) |
| `python:3.13-slim` | base of the OpenDecision image |

---

## Running it (with the provided account)

1. Sign in to the hackathon account: `aws login --profile hackathon` (or work on one of the provided EC2 instances, which use their instance profile).
2. Install: `npm install` at the repo root.
3. Configure: copy `backend/.env.example` to `backend/.env.development` and `frontend/.env.example` to `frontend/.env`. Fill in the values for the resources above (set `AWS_PROFILE=hackathon` on a laptop).
4. Start Valkey locally: `npm run valkey:up`, with `REDIS_HOST=127.0.0.1`. On an EC2 instance in the VPC, point `REDIS_HOST` at the ElastiCache endpoint instead.
5. Set up the database (first time only): `npm run db:migrate --workspace=backend`, then optionally `npm run db:seed --workspace=backend` for demo data.
6. Run: `npm run dev`. This builds `shared`, then starts the backend on `:3001` and the frontend on `:5173`. Vite proxies `/v1` and `/socket.io` to the backend.

The OpenDecision service has its own setup, test and SageMaker deployment steps in [opendecision-microservice/README.md](opendecision-microservice/README.md).
