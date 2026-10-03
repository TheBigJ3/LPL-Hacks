"""Seed a running rapid analysis server with every synthetic fixture (households + Textract documents).

  .venv/Scripts/python scripts/seed.py [--url http://127.0.0.1:8100]

Goes through the public ingest endpoints, so it exercises the same path the pipeline uses.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from rapid_analysis.fixtures import FIXTURE_IDS, fixture_household_raw, fixture_household_textract  # noqa: E402


def seed(url: str) -> int:
    failures = 0
    with httpx.Client(base_url=url, timeout=60) as client:
        for household_id in FIXTURE_IDS:
            response = client.post("/api/households", json=fixture_household_raw(household_id))
            if response.status_code != 200:
                print(f"{household_id}: {response.status_code} {response.text}", file=sys.stderr)
                failures += 1
                continue
            documents = fixture_household_textract(household_id)
            for name, textract in documents.items():
                doc = client.post(f"/api/households/{household_id}/documents", json={"name": name, "textract": textract})
                if doc.status_code != 200:
                    print(f"{household_id}/{name}: {doc.status_code} {doc.text}", file=sys.stderr)
                    failures += 1
            print(f"{household_id}: household + {len(documents)} documents")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8100")
    args = parser.parse_args()
    failures = seed(args.url)
    print("seeded" if not failures else f"{failures} failures")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
