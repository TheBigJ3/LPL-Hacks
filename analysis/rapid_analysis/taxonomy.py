"""The tag file (config/tags.json) is the source of truth for every id, label and synonym."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

TAGS_PATH = Path(__file__).resolve().parents[1] / "config" / "tags.json"


@lru_cache(maxsize=1)
def tags() -> dict[str, Any]:
    return json.loads(TAGS_PATH.read_text(encoding="utf-8"))


def tag_ids(section: str) -> list[str]:
    items = tags()[section]
    return [item["id"] if isinstance(item, dict) else item for item in items]


def tag_by_id(section: str) -> dict[str, dict[str, Any]]:
    return {item["id"]: item for item in tags()[section]}


def field_label(field_id: str) -> str:
    """Display label from the tag file; fields the tag file lacks fall back to a readable form of the id."""
    field = tag_by_id("fields").get(field_id)
    return field["label"] if field else FIELD_LABEL_FALLBACK.get(field_id, field_id.replace("_", " ").capitalize())


# Fields the pipeline sends that tags.json does not list yet (add them there to replace these).
FIELD_LABEL_FALLBACK = {
    "distribution_from_ira": "IRA distribution",
    "distribution_date": "Distribution date",
}


def finding_text(finding_type: str, member: str | None = None, field: str | None = None) -> tuple[str, str]:
    """(headline, action_label) from tags.json finding_types, with {member}/{field} filled in."""
    spec = tag_by_id("finding_types")[finding_type]
    headline = spec["headline"].replace("{member}", member or "This household").replace("{field}", field or "a value")
    return headline, spec["action_label"]
