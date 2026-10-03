"""Write docs/samples/overview_HH0XX.json (and one evidence drill-down) from the fixtures.

Run with the model available so samples carry real checks:
  .venv/Scripts/python scripts/write_samples.py
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

SAMPLES = ROOT / "docs" / "samples"


def sample_dumps(body: dict) -> str:
    return json.dumps(body, indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    engine_load()
    if not engine_info()["model_loaded"]:
        print("model not loaded: samples would be all not_checked; refusing to write", file=sys.stderr)
        return 1
    SAMPLES.mkdir(parents=True, exist_ok=True)
    for household_id in FIXTURE_IDS:
        build = overview_build(fixture_household_raw(household_id), fixture_household_documents(household_id))
        (SAMPLES / f"overview_{household_id}.json").write_text(sample_dumps(build.overview), encoding="utf-8")
        if household_id == "HH004":
            (SAMPLES / "evidence_HH004_F1.json").write_text(sample_dumps(build.evidence["F1"]), encoding="utf-8")
    print(f"wrote {len(FIXTURE_IDS)} overview samples to {SAMPLES}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
