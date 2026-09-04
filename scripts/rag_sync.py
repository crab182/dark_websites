#!/usr/bin/env python3
"""Sync the reference database into the companion RAG stack.

Pushes every site in data/sites.json into a rag-mcp-server collection
(one small markdown document per site) so the curated web becomes
semantically searchable from any MCP client wired to that server.

Configuration (environment):
  RAG_ADMIN_KEY    required — admin-tier API key (ingest and delete are
                   admin endpoints on the backend)
  RAG_URL          backend REST base, default http://localhost:8900
  RAG_COLLECTION   target collection, default "dark-websites"

Usage:
  RAG_ADMIN_KEY=... python3 scripts/rag_sync.py [--dry-run]

Sync semantics — the collection is OWNED by this script:
  * each site becomes source "<id>.md";
  * re-runs are cheap: the backend content-hashes each source and skips
    unchanged text, so only new or edited sites are re-embedded;
  * sources in the collection that no longer match a site id are deleted,
    so removed sites disappear from search. Don't hand-upload documents
    into this collection; they will be treated as stale.

Standard library only.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "sites.json"

RAG_URL = os.environ.get("RAG_URL", "http://localhost:8900").rstrip("/")
COLLECTION = os.environ.get("RAG_COLLECTION", "dark-websites")
ADMIN_KEY = os.environ.get("RAG_ADMIN_KEY", "")

TIMEOUT = 120  # first ingest may load the embedding model server-side
SOURCE_RE = re.compile(r"^[a-z0-9-]+\.md$")  # sources this script owns
# Mirrors the backend's validate_collection_name so a malformed name fails
# here with a clear message instead of parsing inconsistently in URLs.
COLLECTION_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Refuse all redirects: a 3xx to another host must never be followed
    with the admin key attached."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D102
        return None  # urllib raises HTTPError for the 3xx instead


_OPENER = urllib.request.build_opener(_NoRedirect)


def _request(method: str, path: str, body: dict | None = None) -> dict:
    url = f"{RAG_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    # Unredirected: even if a redirect slipped through, the credential
    # would not be copied onto the follow-up request.
    req.add_unredirected_header("Authorization", f"Bearer {ADMIN_KEY}")
    with _OPENER.open(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode() or "{}")


def render_site(site: dict) -> str:
    """One small markdown document per site — a single chunk's worth."""
    return (
        f"# {site['name']}\n\n"
        f"{site['description']}\n\n"
        f"- URL: {site['url']}\n"
        f"- Facets: {', '.join(site['facets'])}\n"
        f"- Tags: {', '.join(site['tags'])}\n"
        f"- Added: {site['added']}\n"
    )


def main() -> int:
    dry_run = "--dry-run" in sys.argv

    if not COLLECTION_RE.match(COLLECTION):
        print("ERROR: RAG_COLLECTION must be 1-64 chars of letters, digits, "
              f"'_' or '-' (got {COLLECTION!r}).", file=sys.stderr)
        return 2
    if not ADMIN_KEY and not dry_run:
        print("ERROR: RAG_ADMIN_KEY is not set (ingest/delete are admin endpoints).",
              file=sys.stderr)
        return 2

    doc = json.loads(DATA.read_text(encoding="utf-8"))
    sites = doc["sites"]

    # Refuse to ingest any id the cleanup pass couldn't later reclaim
    # (rag_sync can run standalone, without weekly.sh's validate-first step).
    bad_ids = [repr(s.get("id", "")) for s in sites
               if not SOURCE_RE.match(f"{s.get('id', '')}.md")]
    if bad_ids:
        print(f"ERROR: ids must be non-empty lowercase [a-z0-9-]+; offending: "
              f"{', '.join(bad_ids[:5])}{' …' if len(bad_ids) > 5 else ''}. "
              f"Run scripts/validate.py.", file=sys.stderr)
        return 2

    desired = {f"{s['id']}.md": s for s in sites}

    if dry_run:
        print(f"[dry-run] would sync {len(desired)} sites -> "
              f"{RAG_URL} collection '{COLLECTION}'")
        for src in sorted(desired):
            print(f"  {src}")
        return 0

    col_q = urllib.parse.urlencode({"collection": COLLECTION})
    try:
        _request("POST", f"/api/documents/collections/{urllib.parse.quote(COLLECTION)}")
        existing = set(
            _request("GET", f"/api/documents/list?{col_q}")["documents"]
        )
    except urllib.error.HTTPError as exc:
        print(f"ERROR: RAG backend rejected setup ({exc.code}): {exc.read().decode()[:200]}",
              file=sys.stderr)
        return 1
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        print(f"ERROR: cannot reach RAG backend at {RAG_URL}: {exc}", file=sys.stderr)
        return 1

    ingested = skipped = failed = 0
    for src, site in sorted(desired.items()):
        try:
            res = _request("POST", "/api/documents/ingest-text", {
                "text": render_site(site),
                "source": src,
                "collection": COLLECTION,
            })
            if res.get("chunks_created", 0) > 0:
                ingested += 1
            else:
                skipped += 1  # backend content-hash says unchanged
        except Exception as exc:  # noqa: BLE001 - report and continue
            failed += 1
            print(f"  FAILED {src}: {exc}", file=sys.stderr)

    # Remove docs for sites no longer in the database. Only touch sources
    # matching our naming scheme so a stray manual upload is loudly ignored
    # rather than silently destroyed. Deletion is skipped entirely when any
    # ingest failed: after an id rename, deleting the old doc while the new
    # one failed to embed would leave the site absent from search until the
    # next run.
    deleted = 0
    if failed:
        print(f"  NOTE: skipping stale cleanup — {failed} ingest(s) failed this run.")
    else:
        for src in sorted(existing - set(desired)):
            if not SOURCE_RE.match(src):
                print(f"  WARNING: unmanaged document in '{COLLECTION}': {src} (left alone)")
                continue
            try:
                _request("DELETE",
                         f"/api/documents/{urllib.parse.quote(src)}?{col_q}")
                deleted += 1
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print(f"  FAILED deleting {src}: {exc}", file=sys.stderr)

    print(f"RAG sync: {ingested} ingested, {skipped} unchanged, "
          f"{deleted} stale deleted, {failed} failed "
          f"({RAG_URL}, collection '{COLLECTION}').")
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BrokenPipeError:
        # stdout piped into something that closed early (e.g. `| head`) —
        # not an error worth a traceback in a cron log.
        raise SystemExit(0)
