/**
 * @fileoverview Workflow audit log writer.
 */

type DbExecutor = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

export interface WorkflowAuditEvent {
  eventType: string;
  roleKey?: string | null;
  actorEmail?: string | null;
  projectId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}

let ensured = false;

export async function ensureWorkflowAuditTable(db: DbExecutor): Promise<void> {
  if (ensured) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS workflow_audit_log (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      role_key TEXT,
      actor_email TEXT,
      project_id TEXT,
      entity_type TEXT,
      entity_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_audit_event_created ON workflow_audit_log(event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_audit_project_created ON workflow_audit_log(project_id, created_at DESC);
  `);
  ensured = true;
}

export async function writeWorkflowAudit(db: DbExecutor, event: WorkflowAuditEvent): Promise<void> {
  await ensureWorkflowAuditTable(db);
  await db.query(
    `INSERT INTO workflow_audit_log (event_type, role_key, actor_email, project_id, entity_type, entity_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      event.eventType,
      event.roleKey || null,
      event.actorEmail || null,
      event.projectId || null,
      event.entityType || null,
      event.entityId || null,
      JSON.stringify(event.payload || {}),
    ],
  );
}
