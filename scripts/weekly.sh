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
# The branch the routine is allowed to refresh. Guards against a persistent
# clone accidentally left on a feature branch: the run fails loudly instead of
# silently updating the wrong branch. Override with BRANCH=... if you really
# mean to refresh something else.
BRANCH="${BRANCH:-main}"
CURRENT="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT" != "$BRANCH" ]; then
    echo "ERROR: clone is on '$CURRENT' but the routine targets '$BRANCH'." >&2
    echo "       git checkout $BRANCH   (or set BRANCH=$CURRENT to override)" >&2
    exit 1
fi

# Cron often has no git identity configured; fall back so the commit succeeds.
GIT_ID=""
git config user.email >/dev/null 2>&1 || \
    GIT_ID="-c user.name=dark_websites-weekly -c user.email=weekly@localhost"

echo "== dark_websites weekly routine ($(date -u +%Y-%m-%dT%H:%M:%SZ)) =="

echo "-- validate"
python3 scripts/validate.py

echo "-- build derived data"
python3 scripts/build.py

echo "-- link check (best effort)"
python3 scripts/linkcheck.py || echo "linkcheck reported problems (non-blocking); see data/linkcheck.json"

git add -A
if git diff --cached --quiet; then
    echo "-- no changes; done."
    exit 0
fi

echo "-- commit"
# shellcheck disable=SC2086  # GIT_ID intentionally word-splits into -c flags
git $GIT_ID commit -m "chore: weekly database refresh"

if [ "$PUSH" = "1" ]; then
    echo "-- push to origin/$BRANCH"
    git push origin "$BRANCH"
else
    echo "-- PUSH=0, skipping push"
fi

echo "== done =="
