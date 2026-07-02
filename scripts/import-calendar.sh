#!/usr/bin/env bash
#
# Import calendar meetings one day at a time, pausing between days so the Fathom
# auto-link stays under its 60 requests/minute rate limit (a wide date range
# imported in one shot bursts past it and 429s).
#
# Usage:
#   scripts/import-calendar.sh <from> <to> [delay-seconds] [base-url]
#
# Examples:
#   scripts/import-calendar.sh 2026-06-01 2026-06-30
#   scripts/import-calendar.sh 2026-06-01 2026-06-30 45
#   scripts/import-calendar.sh 2026-06-01 2026-06-30 30 http://localhost:3001
#
# Dates are YYYY-MM-DD (inclusive). Defaults: delay=30s, base-url=http://localhost:3001.

set -euo pipefail

FROM="${1:-}"
TO="${2:-}"
DELAY="${3:-30}"
BASE_URL="${4:-http://localhost:3001}"

if [[ -z "$FROM" || -z "$TO" ]]; then
  echo "Usage: $0 <from YYYY-MM-DD> <to YYYY-MM-DD> [delay-seconds] [base-url]" >&2
  exit 1
fi

# Validate the dates by round-tripping them through `date` (BSD/macOS syntax).
if ! date -j -f "%Y-%m-%d" "$FROM" +%Y-%m-%d >/dev/null 2>&1; then
  echo "Invalid 'from' date: $FROM (expected YYYY-MM-DD)" >&2
  exit 1
fi
if ! date -j -f "%Y-%m-%d" "$TO" +%Y-%m-%d >/dev/null 2>&1; then
  echo "Invalid 'to' date: $TO (expected YYYY-MM-DD)" >&2
  exit 1
fi
if [[ "$FROM" > "$TO" ]]; then
  echo "'from' ($FROM) must be on or before 'to' ($TO)" >&2
  exit 1
fi

has_jq() { command -v jq >/dev/null 2>&1; }

echo "Importing $FROM → $TO, one day at a time (${DELAY}s between days) via $BASE_URL"
echo

cur="$FROM"
while [[ ! "$cur" > "$TO" ]]; do
  # Import a single day (from == to). The endpoint is idempotent, so re-runs are safe.
  response="$(curl -s -w $'\n%{http_code}' "$BASE_URL/api/import?from=$cur&to=$cur" || true)"
  http_code="$(printf '%s' "$response" | tail -n1)"
  body="$(printf '%s' "$response" | sed '$d')"

  if [[ "$http_code" == "200" ]] && has_jq; then
    summary="$(printf '%s' "$body" | jq -c '.totals')"
    errors="$(printf '%s' "$body" | jq -c '[.accounts[] | select(.error) | {email, error}]')"
    if [[ "$errors" != "[]" ]]; then
      echo "$cur  $summary  ⚠️  $errors"
    else
      echo "$cur  $summary"
    fi
  else
    echo "$cur  [HTTP $http_code]  $body"
  fi

  # Advance to the next day (BSD/macOS date). Skip the wait after the last day.
  next="$(date -j -v+1d -f "%Y-%m-%d" "$cur" +%Y-%m-%d)"
  if [[ ! "$next" > "$TO" ]]; then
    sleep "$DELAY"
  fi
  cur="$next"
done

echo
echo "Done."
