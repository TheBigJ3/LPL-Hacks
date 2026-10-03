"""Final gate: start the server, seed it over HTTP, GET HH006's overview, compare with the committed sample.

  .venv/Scripts/python scripts/gate.py [--port 8100]

Owns the server process start to finish, so it never leaves one running.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.seed import seed  # noqa: E402

SAMPLE = ROOT / "docs" / "samples" / "overview_HH006.json"
LOG = ROOT / "logs" / "gate_server.log"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8100)
    args = parser.parse_args()
    url = f"http://127.0.0.1:{args.port}"
    LOG.parent.mkdir(exist_ok=True)
    with LOG.open("w", encoding="utf-8") as log:
        server = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "rapid_analysis.api:app", "--host", "127.0.0.1", "--port", str(args.port)],
            cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
        )
        try:
            deadline = time.time() + 120
            health = None
            while time.time() < deadline:
                try:
                    health = httpx.get(f"{url}/health", timeout=2).json()
                    break
                except httpx.HTTPError:
                    if server.poll() is not None:
                        print(f"server exited early; see {LOG}", file=sys.stderr)
                        return 1
                    time.sleep(0.5)
            if health is None:
                print("server did not come up", file=sys.stderr)
                return 1
            print("health:", json.dumps(health))
            if seed(url):
                return 1
            got = httpx.get(f"{url}/api/households/HH006/overview", timeout=60).json()
            expected = json.loads(SAMPLE.read_text(encoding="utf-8"))
            same = got == expected
            print("HH006 overview equals committed sample:", same)
            return 0 if same and health["model_loaded"] else 1
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()


if __name__ == "__main__":
    sys.exit(main())
