# PPC Migrations

## Source of truth

- **DB 2.17.26.sql** – Full schema for fresh installs (run at project root).

## Incremental migration

For existing databases that already have DB 2.17.26 applied:

```bash
psql $DATABASE_URL -f migrations/apply-all-pending.sql
```

`apply-all-pending.sql` is idempotent and adds:

- workday_phases, alert_events, task_assignments, mapping_suggestions
- commitments, workflow_audit_log
- mo_period_notes
- MPP task columns (outline_number, deadline, etc.)
- hour_entries mpp_task_phase, mpp_phase_unit, total_hours, work_date
- task_dependencies is_external
- Performance indexes
