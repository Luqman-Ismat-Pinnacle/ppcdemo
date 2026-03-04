#!/usr/bin/env bash
# Run Supabase workday-hours Edge Function day-by-day for November 2025, then upsert to Azure.
# Usage: ./scripts/run-hours-november-2025.sh

set -e
cd "$(dirname "$0")/.."
if [[ -f .env.local ]]; then
  export $(grep -E '^NEXT_PUBLIC_SUPABASE_URL=|^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | xargs)
fi
COOLDOWN="${HOURS_COOLDOWN_SEC:-5}"
CURL_TIMEOUT="${CURL_TIMEOUT_SEC:-120}"

URL="${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/workday-hours"
KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}"
if [[ -z "$KEY" || -z "$NEXT_PUBLIC_SUPABASE_URL" ]]; then
  echo "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
  exit 1
fi

# November 2025: 01 through 30
for d in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  echo "=== Day 2025-11-$d ==="
  resp=$(curl -s --max-time "$CURL_TIMEOUT" -X POST "$URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $KEY" \
    -d "{\"startDate\":\"2025-11-$d\",\"endDate\":\"2025-11-$d\"}" || true)
  echo "$resp"
  if echo "$resp" | grep -q '"success":true'; then
    echo "OK 2025-11-$d"
  else
    echo "FAIL 2025-11-$d"
  fi
  if [[ "$d" != "30" ]]; then
    echo "Cooldown ${COOLDOWN}s..."
    sleep "$COOLDOWN"
  fi
done
echo "Edge function runs done. Syncing Supabase -> Azure (Nov 2025)..."
node scripts/sync-hours-supabase-to-azure.mjs 2025-11-01 2025-11-30
echo "Done."
