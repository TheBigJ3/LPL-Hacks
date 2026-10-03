"""Record one real OpenDecision document-decision response per strict-battery document (needs the model).

  python tests/tools/record_strict.py

Writes fixtures/strict/responses/<id>.json; non-model tests replay these through the parser.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from rapid_analysis.documents import MemberRef, document_classify, document_decide  # noqa: E402
from rapid_analysis.engine import engine_info, engine_load  # noqa: E402
from rapid_analysis.textract import redact  # noqa: E402

BATTERY = ROOT / "tests" / "fixtures" / "strict" / "johnson_documents.json"
OUT = ROOT / "tests" / "fixtures" / "strict" / "responses"


def battery() -> tuple[list[MemberRef], list[dict]]:
    body = json.loads(BATTERY.read_text(encoding="utf-8"))
    return [MemberRef.from_name(m["person_id"], m["name"]) for m in body["members"]], body["documents"]


def main() -> int:
    engine_load()
    if not engine_info()["model_loaded"]:
        print("model not loaded", file=sys.stderr)
        return 1
    members, documents = battery()
    OUT.mkdir(parents=True, exist_ok=True)
    for doc in documents:
        response = document_decide(redact(doc["text"]), members)
        (OUT / f"{doc['id']}.json").write_text(json.dumps({"_synthetic": "SYNTHETIC TEST DATA - recorded OpenDecision 0.1.2 response", **response}, indent=1, default=float) + "\n", encoding="utf-8")
        decision = document_classify(doc["id"], redact(doc["text"]), members, response)
        r = decision.result
        print(doc["id"], r["doc_type"], r["suggested_doc_type"], [(m["person_id"], m["role"]) for m in r["members"]],
              r["attribution_status"], r["model_tags"], r["review_reasons"], decision.logged)
    return 0


if __name__ == "__main__":
    sys.exit(main())
