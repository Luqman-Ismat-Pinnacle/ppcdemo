# Legacy Hard Prune Backup Notes (2026-02-25)

This note captures the pre-prune checklist for the hard-prune migration:
`migrations/2026-02-25-legacy-hard-prune.sql`.

## Tables targeted for removal
- `cost_actuals`
- `cost_transactions`
- `cost_categories`
- `resource_calendars`
- `progress_claims`
- `approval_records`
- `baseline_snapshots`
- `forecast_snapshots`
- `deliverables_tracker`
- `calendars`
- `change_log` (legacy duplicate; canonical is `change_logs`)

## Backup / audit checklist
Run before applying migration in shared/prod environments:

```sql
SELECT table_name, COALESCE(n_live_tup, 0) AS est_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND table_name IN (
    'cost_actuals','cost_transactions','cost_categories',
    'resource_calendars','progress_claims','approval_records',
    'baseline_snapshots','forecast_snapshots','deliverables_tracker',
    'calendars','change_log'
  )
ORDER BY table_name;
```

Optional schema-only backup:

```bash
pg_dump "$DATABASE_URL" --schema-only \
  --table=public.cost_actuals \
  --table=public.cost_transactions \
  --table=public.cost_categories \
  --table=public.resource_calendars \
  --table=public.progress_claims \
  --table=public.approval_records \
  --table=public.baseline_snapshots \
  --table=public.forecast_snapshots \
  --table=public.deliverables_tracker \
  --table=public.calendars \
  --table=public.change_log \
  > legacy-pre-prune-schema.sql
```
