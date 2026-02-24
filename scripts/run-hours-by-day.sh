#!/usr/bin/env bash
# Run workday hours sync 1 day per request (Feb 6–22) with cooldown.
# Uses Supabase workday-hours Edge Function (lightweight, single-day).
# Usage: ./scripts/run-hours-by-day.sh

set -e
cd "$(dirname "$0")/.."
if [[ -f .env.local ]]; then
  export $(grep -E '^NEXT_PUBLIC_SUPABASE_URL=|^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | xargs)
fi
COOLDOWN="${HOURS_COOLDOWN_SEC:-10}"
CURL_TIMEOUT="${CURL_TIMEOUT_SEC:-120}"

URL="${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/workday-hours"
KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}"
if [[ -z "$KEY" || -z "$NEXT_PUBLIC_SUPABASE_URL" ]]; then
  echo "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
  exit 1
fi

for d in 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22; do
  echo "=== Day 2026-02-$d ==="
  resp=$(curl -s --max-time "$CURL_TIMEOUT" -X POST "$URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $KEY" \
    -d "{\"startDate\":\"2026-02-$d\",\"endDate\":\"2026-02-$d\"}" || true)
  echo "$resp"
  if echo "$resp" | grep -q '"success":true'; then
    echo "OK 2026-02-$d"
  else
    echo "FAIL 2026-02-$d"
  fi
  if [[ "$d" != "22" ]]; then
    echo "Cooldown ${COOLDOWN}s..."
    sleep "$COOLDOWN"
  fi
done
echo "Done."
