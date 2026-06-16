#!/usr/bin/env python3
"""Validate data/sites.json against the project rules.

Pure standard library so it runs anywhere with no `pip install`. Exits
non-zero (and prints every problem it found) when the database is invalid,
which is what the weekly workflow keys off of.
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "sites.json"

ALLOWED_FACETS = {"obscure", "niche", "kitsch", "broad", "deep", "narrow"}


def _is_date(value: str) -> bool:
    try:
        dt.date.fromisoformat(value)
        return True
    except (ValueError, TypeError):
        return False


def validate(doc: dict) -> list[str]:
    errors: list[str] = []

    for key in ("version", "facets", "sites"):
        if key not in doc:
            errors.append(f"top-level key missing: {key!r}")
    if errors:
        return errors

    facet_keys = set(doc.get("facets", {}))
    if facet_keys != ALLOWED_FACETS:
        errors.append(
            "facets legend must define exactly "
            f"{sorted(ALLOWED_FACETS)}, got {sorted(facet_keys)}"
        )

    if "updated" in doc and not _is_date(doc["updated"]):
        errors.append(f"`updated` is not an ISO date: {doc['updated']!r}")

    sites = doc.get("sites")
    if not isinstance(sites, list) or not sites:
        errors.append("`sites` must be a non-empty array")
        return errors

    seen_ids: dict[str, int] = {}
    seen_urls: dict[str, int] = {}

    for i, site in enumerate(sites):
        where = f"sites[{i}]"
        name = site.get("name", where)

        for key in ("id", "name", "url", "description", "facets", "tags", "added"):
            if key not in site:
                errors.append(f"{name}: missing field {key!r}")

        sid = site.get("id", "")
        if sid:
            if sid in seen_ids:
                errors.append(f"{name}: duplicate id {sid!r} (also {where})")
            seen_ids[sid] = i

        url = site.get("url", "")
        if url and not url.startswith(("http://", "https://")):
            errors.append(f"{name}: url must start with http(s):// -> {url!r}")
        if url:
            if url in seen_urls:
                errors.append(f"{name}: duplicate url {url!r}")
            seen_urls[url] = i

        facets = site.get("facets", [])
        if not isinstance(facets, list) or not facets:
            errors.append(f"{name}: facets must be a non-empty array")
        else:
            bad = [f for f in facets if f not in ALLOWED_FACETS]
            if bad:
                errors.append(f"{name}: unknown facet(s) {bad}")

        tags = site.get("tags", [])
        if not isinstance(tags, list):
            errors.append(f"{name}: tags must be an array")

        added = site.get("added", "")
        if added and not _is_date(added):
            errors.append(f"{name}: added is not an ISO date: {added!r}")

    return errors


def main() -> int:
    try:
        doc = json.loads(DATA.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"ERROR: {DATA} not found", file=sys.stderr)
        return 2
    except json.JSONDecodeError as exc:
        print(f"ERROR: {DATA} is not valid JSON: {exc}", file=sys.stderr)
        return 2

    errors = validate(doc)
    if errors:
        print(f"FAILED: {len(errors)} problem(s) in {DATA.name}:")
        for err in errors:
            print(f"  - {err}")
        return 1

    print(f"OK: {len(doc['sites'])} sites validated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
