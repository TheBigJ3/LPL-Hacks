"""Export the FastAPI OpenAPI spec to docs/openapi.json (commit the result).

  python tests/tools/export_openapi.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from rapid_analysis.api import app  # noqa: E402  (building the spec never loads the model)

OUT = ROOT / "docs" / "openapi.json"


def openapi_dumps() -> str:
    return json.dumps(app.openapi(), indent=2, ensure_ascii=False, sort_keys=True) + "\n"


if __name__ == "__main__":
    OUT.write_text(openapi_dumps(), encoding="utf-8")
    print(f"wrote {OUT}")
