#!/usr/bin/env sh
# The weekly routine, self-hosted — no CI service required.
#
# Runs: validate -> build (stats, digest, feed, FINDS, README) -> linkcheck,
# then commits and (optionally) pushes whatever changed.
#
# Run it by hand:            scripts/weekly.sh
# Commit but don't push:     PUSH=0 scripts/weekly.sh
# From cron, every Monday 09:00 (crontab -e):
#   0 9 * * 1  cd /path/to/dark_websites && scripts/weekly.sh >> weekly.log 2>&1
# Or a systemd timer / launchd job pointing at the same command.
#
# POSIX sh + git + python3 only.
set -eu

cd "$(dirname "$0")/.."

PUSH="${PUSH:-1}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "== dark_websites weekly routine ($(date -u +%Y-%m-%dT%H:%M:%SZ)) =="

echo "-- validate"
python3 scripts/validate.py

echo "-- build derived data"
python3 scripts/build.py

echo "-- link check (best effort)"
python3 scripts/linkcheck.py || echo "linkcheck reported problems (non-blocking); see data/linkcheck.json"

if git diff --quiet && git diff --cached --quiet; then
    echo "-- no changes; done."
    exit 0
fi

echo "-- commit"
git add -A
git commit -m "chore: weekly database refresh"

if [ "$PUSH" = "1" ]; then
    echo "-- push to origin/$BRANCH"
    git push origin "$BRANCH"
else
    echo "-- PUSH=0, skipping push"
fi

echo "== done =="
