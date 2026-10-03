# Analysis service image. CPU torch by default; for an NVIDIA host build with
#   docker build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cu130 -t lpl-analysis .
# and run with --gpus all. The model (~1.5 GB) downloads on first start into /models: mount a volume there.
FROM python:3.13-slim

ARG TORCH_VERSION=2.14.1
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models

WORKDIR /app

# torch first, from its own index, so OpenDecision cannot pull a different build.
RUN pip install torch==${TORCH_VERSION} --index-url ${TORCH_INDEX_URL}
COPY requirements.txt .
RUN pip install -r requirements.txt

# Triton (bundled with CUDA torch) compiles a small C helper the first time a GPU kernel runs. After the
# torch layers so changing it does not rebuild them.
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev && rm -rf /var/lib/apt/lists/*

COPY config config
COPY rapid_analysis rapid_analysis
# SageMaker runs `docker run <image> serve`: the same app on port 8080 with /ping and /invocations.
COPY --chmod=755 serve /usr/local/bin/serve

RUN useradd --create-home --uid 10001 app && mkdir -p /models && chown app /models
USER app

EXPOSE 8100 8080
# /health answers once the model has loaded (or failed to): allow for the first-start download.
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8100/health', timeout=4)"

# One worker: each worker loads its own copy of the model. Scale with more containers, not workers.
CMD ["uvicorn", "rapid_analysis.api:app", "--host", "0.0.0.0", "--port", "8100"]
