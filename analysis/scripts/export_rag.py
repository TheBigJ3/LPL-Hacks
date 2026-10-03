"""Export RAG chunks for every fixture household to docs/samples/rag_chunks.jsonl (needs the model for real checks).

  .venv/Scripts/python scripts/export_rag.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from rapid_analysis.engine import engine_info, engine_load  # noqa: E402
from rapid_analysis.fixtures import FIXTURE_IDS, fixture_household_documents, fixture_household_raw  # noqa: E402
from rapid_analysis.overview import overview_build  # noqa: E402
from rapid_analysis.rag import rag_chunks  # noqa: E402

OUT = ROOT / "docs" / "samples" / "rag_chunks.jsonl"


def household_chunks(household_id: str) -> list[dict]:
    build = overview_build(fixture_household_raw(household_id), fixture_household_documents(household_id))
    return rag_chunks(build.overview, build.evidence, build.value_checks, build.textract_confidence)


def main() -> int:
    engine_load()
    if not engine_info()["model_loaded"]:
        print("model not loaded: chunks would say 'not checked' everywhere; refusing to write", file=sys.stderr)
        return 1
    lines = [json.dumps(chunk, ensure_ascii=False, sort_keys=True) for h in FIXTURE_IDS for chunk in household_chunks(h)]
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {len(lines)} chunks to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
