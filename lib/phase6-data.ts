/**
 * @fileoverview Phase 6 shared persistence helpers.
 *
 * Centralizes table bootstrap and alert emission for:
 * - alert_events
 * - task_assignments
 * - mapping_suggestions
 */

type DbExecutor = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

const ENSURE_PHASE6_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS alert_events (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    title TEXT,
    message TEXT NOT NULL,
    source TEXT,
    entity_type TEXT,
    entity_id TEXT,
    related_project_id TEXT,
    related_task_id TEXT,
    dedupe_key TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_alert_events_created_at ON alert_events (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_alert_events_status ON alert_events (status);
  CREATE INDEX IF NOT EXISTS idx_alert_events_severity ON alert_events (severity);
  CREATE INDEX IF NOT EXISTS idx_alert_events_dedupe_key ON alert_events (dedupe_key);

  CREATE TABLE IF NOT EXISTS task_assignments (
    id BIGSERIAL PRIMARY KEY,
    task_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    assigned_by TEXT,
    assignment_source TEXT NOT NULL DEFAULT 'manual',
    previous_employee_id TEXT,
    previous_employee_name TEXT,
    note TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_task_assignments_task_id ON task_assignments (task_id);
  CREATE INDEX IF NOT EXISTS idx_task_assignments_employee_id ON task_assignments (employee_id);
  CREATE INDEX IF NOT EXISTS idx_task_assignments_changed_at ON task_assignments (changed_at DESC);

  CREATE TABLE IF NOT EXISTS mapping_suggestions (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL,
    workday_phase_id TEXT,
    hour_entry_id TEXT,
    task_id TEXT,
    suggestion_type TEXT NOT NULL,
    confidence NUMERIC(5,4) NOT NULL,
    reason TEXT NOT NULL,
    source_value TEXT,
    target_value TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    applied_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_mapping_suggestions_project_status ON mapping_suggestions (project_id, status);
  CREATE INDEX IF NOT EXISTS idx_mapping_suggestions_confidence ON mapping_suggestions (confidence DESC);
  CREATE INDEX IF NOT EXISTS idx_mapping_suggestions_hour_entry ON mapping_suggestions (hour_entry_id);
`;

let phase6TablesEnsured = false;

/**
 * Ensures all Phase 6 core tables/indexes exist before use.
 */
export async function ensurePhase6Tables(db: DbExecutor): Promise<void> {
  if (phase6TablesEnsured) return;
  await db.query(ENSURE_PHASE6_TABLES_SQL);
  phase6TablesEnsured = true;
}

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface AlertEventInput {
  eventType: string;
  severity?: AlertSeverity;
  title?: string;
  message: string;
  source?: string;
  entityType?: string;
  entityId?: string;
  relatedProjectId?: string;
  relatedTaskId?: string;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persists a single alert event row.
 */
export async function emitAlertEvent(db: DbExecutor, event: AlertEventInput): Promise<void> {
  await ensurePhase6Tables(db);
  await db.query(
    `INSERT INTO alert_events (
       event_type, severity, title, message, source, entity_type, entity_id,
       related_project_id, related_task_id, dedupe_key, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
    [
      event.eventType,
      event.severity ?? 'info',
      event.title ?? null,
      event.message,
      event.source ?? null,
      event.entityType ?? null,
      event.entityId ?? null,
      event.relatedProjectId ?? null,
      event.relatedTaskId ?? null,
      event.dedupeKey ?? null,
      JSON.stringify(event.metadata ?? {}),
    ],
  );
}

/**
 * Emits alert only when there is no recent open/acknowledged alert with same dedupe key.
 */
export async function emitAlertEventIfAbsent(
  db: DbExecutor,
  event: AlertEventInput,
  lookbackHours: number = 24,
): Promise<boolean> {
  if (!event.dedupeKey) {
    await emitAlertEvent(db, event);
    return true;
  }

  await ensurePhase6Tables(db);
  const check = await db.query(
    `SELECT 1
     FROM alert_events
     WHERE dedupe_key = $1
       AND status IN ('open', 'acknowledged')
       AND created_at >= NOW() - ($2::text || ' hours')::interval
     LIMIT 1`,
    [event.dedupeKey, String(Math.max(1, Math.floor(lookbackHours)))],
  ) as { rows?: unknown[] };

  if (check.rows && check.rows.length > 0) return false;
  await emitAlertEvent(db, event);
  return true;
}
