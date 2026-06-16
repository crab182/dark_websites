#!/usr/bin/env python3
"""Best-effort liveness check for every URL in the database.

Writes data/linkcheck.json with the status of each site. Intended to be
informational — the weekly workflow runs it with `continue-on-error`, so a
flaky host never blocks the build. Pass --strict to exit non-zero when any
link is dead (useful for a manual audit).

Standard library only.
"""
from __future__ import annotations

import json
import pathlib
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "sites.json"
OUT = ROOT / "data" / "linkcheck.json"

TIMEOUT = 15
UA = "dark_websites-linkcheck/1.0 (+https://github.com/crab182/dark_websites)"


def check(url: str) -> dict:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return {"url": url, "ok": True, "status": resp.status}
    except urllib.error.HTTPError as exc:
        # Many servers reject HEAD; retry with GET before calling it dead.
        if exc.code in (403, 405, 501):
            return _get(url)
        return {"url": url, "ok": exc.code < 400, "status": exc.code}
    except Exception as exc:  # noqa: BLE001 - network errors are expected
        return _get(url, fallback_error=str(exc))


def _get(url: str, fallback_error: str | None = None) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return {"url": url, "ok": True, "status": resp.status}
    except urllib.error.HTTPError as exc:
        return {"url": url, "ok": exc.code < 400, "status": exc.code}
    except Exception as exc:  # noqa: BLE001
        return {"url": url, "ok": False, "error": fallback_error or str(exc)}


def main() -> int:
    strict = "--strict" in sys.argv
    doc = json.loads(DATA.read_text(encoding="utf-8"))
    results = [check(s["url"]) for s in doc["sites"]]
    dead = [r for r in results if not r["ok"]]

    OUT.write_text(json.dumps({"results": results, "dead": len(dead)}, indent=2) + "\n",
                   encoding="utf-8")

    print(f"Checked {len(results)} links, {len(dead)} not OK.")
    for r in dead:
        print(f"  DEAD {r['url']} -> {r.get('status') or r.get('error')}")

    return 1 if (strict and dead) else 0


if __name__ == "__main__":
    raise SystemExit(main())
