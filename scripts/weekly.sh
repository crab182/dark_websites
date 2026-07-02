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

# Refuse to run over uncommitted local edits: they would otherwise end up
# inside the routine's refresh commit. Fail loudly and let a human sort it out.
if [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: working tree is not clean; commit or stash local changes first:" >&2
    git status --short >&2
    exit 1
fi

# Cron often has no git identity configured; fall back so the commit succeeds.
GIT_ID=""
git config user.email >/dev/null 2>&1 || \
    GIT_ID="-c user.name=dark_websites-weekly -c user.email=weekly@localhost"

echo "== dark_websites weekly routine ($(date -u +%Y-%m-%dT%H:%M:%SZ)) =="

# Sync with the remote first so a long-lived clone doesn't fall behind and
# get a non-fast-forward rejection at push time. Skipped when PUSH=0 so the
# routine still works fully offline for local-only use.
if [ "$PUSH" = "1" ]; then
    echo "-- sync with origin/$BRANCH"
    git fetch origin "$BRANCH"
    if ! git merge --ff-only "origin/$BRANCH"; then
        echo "ERROR: local '$BRANCH' has diverged from origin/$BRANCH." >&2
        echo "       Reconcile by hand (e.g. git rebase origin/$BRANCH), then re-run." >&2
        exit 1
    fi
fi

echo "-- validate"
python3 scripts/validate.py

echo "-- build derived data"
python3 scripts/build.py

echo "-- link check (best effort)"
python3 scripts/linkcheck.py || echo "linkcheck reported problems (non-blocking); see data/linkcheck.json"

# Stage only what the routine itself generates — never a blanket add -A, so
# nothing unrelated can ride along even if files change mid-run.
git add data/ feed.xml FINDS.md README.md
if git diff --cached --quiet; then
    echo "-- no new changes to commit."
else
    echo "-- commit"
    # shellcheck disable=SC2086  # GIT_ID intentionally word-splits into -c flags
    git $GIT_ID commit -m "chore: weekly database refresh"
fi

# Push whenever local is ahead of the remote — not only when this run made a
# commit — so a commit stranded by an earlier failed push gets retried instead
# of leaving the published site stale behind a "no changes" early exit.
if [ "$PUSH" = "1" ]; then
    if [ "$(git rev-list --count "origin/$BRANCH..HEAD")" -gt 0 ]; then
        echo "-- push to origin/$BRANCH"
        git push origin "$BRANCH"
    else
        echo "-- nothing to push."
    fi
else
    echo "-- PUSH=0, skipping push"
fi

echo "== done =="
