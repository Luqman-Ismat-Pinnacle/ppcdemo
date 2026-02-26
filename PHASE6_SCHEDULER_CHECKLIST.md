# Phase 6 Scheduler Checklist

Use this checklist to operationalize alert scanning in production.

## 1) Required environment variables
- `ALERT_SCAN_BASE_URL` = deployed app URL (for scheduled runner)
- `ALERT_SCAN_TOKEN` = shared secret used by `GET /api/alerts/scan`

## 2) Endpoint security
- Ensure `GET /api/alerts/scan` only runs with:
  - `Authorization: Bearer <ALERT_SCAN_TOKEN>`
  - or `?token=<ALERT_SCAN_TOKEN>`
- Never expose token in client-side code.

## 3) Trigger options
- Direct HTTP scheduler:
  - call `GET https://<host>/api/alerts/scan` with bearer token.
- Script runner:
  - `npm run alerts:scan`
  - requires `ALERT_SCAN_BASE_URL` and `ALERT_SCAN_TOKEN` in job env.

## 4) Recommended cadence
- Business hours: every 1 hour.
- Off hours: every 4 hours.

## 5) Observability
- Verify alert scan creates expected events:
  - `resource.overload`
  - `mapping.unmapped_hours`
  - `mapping.suggestions_stale`
- Verify header/System Health alerts panel reflects new events.

## 6) Failure handling
- If scan fails:
  - inspect server logs for `/api/alerts/scan`
  - validate DB connectivity and `phase6` tables
  - validate token mismatch issues first.

## 7) Post-deploy smoke
- `npm run check:phase5-contracts`
- `npm run check:phase5-smoke`
- open System Health panel and run manual scan once.
