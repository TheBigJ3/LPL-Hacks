"""The config files are the source of truth for every id and label.

- config/tags.json: topics, fields, checklist, finding types and the other enums.
- config/doc_types.json: every document type: label, the description the model chooses between, the form
  number and phrases that detect it (first match wins, in file order), and its topics.
- config/document_tags.json: tag name -> the yes/no statement the model checks for each document.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

CONFIG = Path(__file__).resolve().parents[1] / "config"
TAGS_PATH = CONFIG / "tags.json"
DOC_TYPES_PATH = CONFIG / "doc_types.json"
DOCUMENT_TAGS_PATH = CONFIG / "document_tags.json"
ID = re.compile(r"^[a-z0-9_]+$")


class ConfigError(ValueError):
    pass


def _load(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except ValueError as err:
        raise ConfigError(f"config/{path.name} is not valid JSON: {err}") from err


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


# ---------------------------------------------------------------- document types and tags


@dataclass(frozen=True)
class DocType:
    id: str
    label: str
    description: str
    form_number: str | None
    phrases: tuple[str, ...]
    patterns: tuple[re.Pattern[str], ...]
    form_pattern: re.Pattern[str] | None
    topics: tuple[str, ...]

    def found_in(self, text: str, form_number: bool = False) -> bool:
        """A detection phrase (or, when asked, the form number) appears in the text as whole words."""
        if form_number and self.form_pattern is not None and self.form_pattern.search(text):
            return True
        return any(p.search(text) for p in self.patterns)


def _phrase(phrase: str) -> re.Pattern[str]:
    """Case-insensitive whole-word phrase; any run of spaces matches any whitespace."""
    return re.compile(r"(?<!\w)" + r"\s+".join(re.escape(w) for w in phrase.split()) + r"(?!\w)", re.I)


def _form(number: str) -> re.Pattern[str]:
    """A form number with its hyphens optional: W-2 matches W-2 and W2, 1095 matches 1095-B."""
    return re.compile(r"(?<!\w)" + "-?".join(re.escape(part) for part in number.split("-")) + r"(?!\w)", re.I)


def _text(value: Any, where: str, required: bool = True) -> str | None:
    if value is None and not required:
        return None
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"{where} must be non-empty text")
    return value.strip()


@lru_cache(maxsize=1)
def doc_types() -> dict[str, DocType]:
    """config/doc_types.json, validated. Order is detection order: put specific types before general ones."""
    raw = _load(DOC_TYPES_PATH)
    if not isinstance(raw, dict):
        raise ConfigError("config/doc_types.json must be an object of doc type id -> entry")
    topics = set(tag_ids("topics"))
    out: dict[str, DocType] = {}
    for doc_id, entry in raw.items():
        where = f"config/doc_types.json: {doc_id}"
        if not ID.match(doc_id):
            raise ConfigError(f"{where}: ids are lowercase letters, digits and _")
        if not isinstance(entry, dict):
            raise ConfigError(f"{where} must be an object")
        unknown_keys = set(entry) - {"label", "description", "form_number", "patterns", "topics"}
        if unknown_keys:
            raise ConfigError(f"{where}: unknown keys {sorted(unknown_keys)}")
        patterns = entry.get("patterns", [])
        if not isinstance(patterns, list):
            raise ConfigError(f"{where}.patterns must be a list of phrases")
        entry_topics = entry.get("topics", [])
        if not isinstance(entry_topics, list) or not set(entry_topics) <= topics:
            raise ConfigError(f"{where}.topics must be topic ids from config/tags.json: {sorted(set(entry_topics) - topics)}")
        form_number = _text(entry.get("form_number"), f"{where}.form_number", required=False)
        phrases = tuple(_text(p, f"{where}.patterns[]") for p in patterns)
        out[doc_id] = DocType(
            id=doc_id,
            label=_text(entry.get("label"), f"{where}.label"),
            description=_text(entry.get("description"), f"{where}.description"),
            form_number=form_number,
            phrases=phrases,
            patterns=tuple(_phrase(p) for p in phrases),
            form_pattern=_form(form_number) if form_number else None,
            topics=tuple(entry_topics),
        )
    if "unknown" not in out or out["unknown"].patterns or out["unknown"].form_number:
        raise ConfigError("config/doc_types.json needs an \"unknown\" entry with no patterns or form_number")
    return out


@lru_cache(maxsize=1)
def document_tags() -> dict[str, str]:
    """config/document_tags.json, validated: tag name -> the statement the model checks (asked as tag_<name>)."""
    raw = _load(DOCUMENT_TAGS_PATH)
    if not isinstance(raw, dict):
        raise ConfigError("config/document_tags.json must be an object of tag name -> statement")
    for name, statement in raw.items():
        if not ID.match(name):
            raise ConfigError(f"config/document_tags.json: {name}: names are lowercase letters, digits and _")
        _text(statement, f"config/document_tags.json: {name}")
    return {name: statement.strip() for name, statement in raw.items()}


def config_check() -> None:
    """Load and validate every config file (raises ConfigError). Called at startup."""
    tags()
    doc_types()
    document_tags()
