"""In-process store ("the DB" for this service): households, document evidence, overview cache.

Only redacted evidence is ever written here. Thread-safe; swap for Postgres/Redis later behind
the same methods.
"""

from __future__ import annotations

import copy
import json
import threading
from dataclasses import asdict
from typing import Any

from rapid_analysis.textract import EvidenceDocument


class Store:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.households: dict[str, dict] = {}
        self.documents: dict[str, dict[str, EvidenceDocument]] = {}
        self.overviews: dict[tuple[str, str, str], dict] = {}

    def household_put(self, household_id: str, raw: dict) -> None:
        with self._lock:
            self.households[household_id] = copy.deepcopy(raw)
            self.overview_bust(household_id)

    def household_get(self, household_id: str) -> dict | None:
        with self._lock:
            raw = self.households.get(household_id)
            return copy.deepcopy(raw) if raw is not None else None

    def household_ids(self) -> list[str]:
        with self._lock:
            return sorted(self.households)

    def document_put(self, household_id: str, doc: EvidenceDocument) -> None:
        with self._lock:
            self.documents.setdefault(household_id, {})[doc.name] = doc
            self.overview_bust(household_id)

    def documents_for(self, household_id: str) -> dict[str, EvidenceDocument]:
        with self._lock:
            return dict(self.documents.get(household_id, {}))

    def overview_get(self, key: tuple[str, str, str]) -> dict | None:
        with self._lock:
            return self.overviews.get(key)

    def overview_put(self, key: tuple[str, str, str], overview: dict) -> None:
        with self._lock:
            self.overviews[key] = overview

    def overview_bust(self, household_id: str) -> None:
        with self._lock:
            for key in [k for k in self.overviews if k[0] == household_id]:
                del self.overviews[key]

    def clear(self) -> None:
        with self._lock:
            self.households.clear()
            self.documents.clear()
            self.overviews.clear()

    def dump(self) -> str:
        """Everything persisted, as JSON (used by tests to prove nothing sensitive is kept)."""
        with self._lock:
            body: dict[str, Any] = {
                "households": self.households,
                "documents": {h: {n: asdict(d) for n, d in docs.items()} for h, docs in self.documents.items()},
                "overviews": {"|".join(k): v for k, v in self.overviews.items()},
            }
            return json.dumps(body, sort_keys=True, default=str)
