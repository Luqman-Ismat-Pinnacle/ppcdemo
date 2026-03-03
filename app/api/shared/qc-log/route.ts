import { NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function ensureQcLogTable() {
  await execute(
    `CREATE TABLE IF NOT EXISTS qc_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id),
      phase_id TEXT REFERENCES phases(id),
      unit_id TEXT REFERENCES units(id),
      qc_status TEXT NOT NULL DEFAULT 'not_started',
      severity TEXT DEFAULT 'low',
      item_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      minor_issues INTEGER DEFAULT 0,
      major_issues INTEGER DEFAULT 0,
      checklist_score NUMERIC(5,2) DEFAULT 0,
      defects_found INTEGER DEFAULT 0,
      defects_open INTEGER DEFAULT 0,
      inspector TEXT,
      inspected_at DATE,
      resolved_at DATE,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(task_id)
    )`,
  );

  await execute('CREATE INDEX IF NOT EXISTS idx_qcl_project ON qc_logs(project_id)');
  await execute('CREATE INDEX IF NOT EXISTS idx_qcl_status ON qc_logs(qc_status)');
  await execute('CREATE INDEX IF NOT EXISTS idx_qcl_severity ON qc_logs(severity)');
  await execute('CREATE INDEX IF NOT EXISTS idx_qcl_inspected ON qc_logs(inspected_at DESC)');
  await execute('ALTER TABLE qc_logs ADD COLUMN IF NOT EXISTS item_count INTEGER DEFAULT 0');
  await execute('ALTER TABLE qc_logs ADD COLUMN IF NOT EXISTS correct_count INTEGER DEFAULT 0');
  await execute('ALTER TABLE qc_logs ADD COLUMN IF NOT EXISTS minor_issues INTEGER DEFAULT 0');
  await execute('ALTER TABLE qc_logs ADD COLUMN IF NOT EXISTS major_issues INTEGER DEFAULT 0');
  await execute('DROP TRIGGER IF EXISTS trg_qc_logs_updated ON qc_logs');
  await execute(
    'CREATE TRIGGER trg_qc_logs_updated BEFORE UPDATE ON qc_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
  );
}

type Row = {
  task_id: string;
  task_name: string;
  project_id: string;
  project_name: string;
  phase_id: string;
  phase_name: string;
  unit_id: string;
  unit_name: string;
  epic_name: string;
  feature_name: string;
  is_critical: string;
  percent_complete: string;
  baseline_end: string;
  qc_status: string;
  severity: string;
  checklist_score: string;
  item_count: string;
  correct_count: string;
  minor_issues: string;
  major_issues: string;
  defects_found: string;
  defects_open: string;
  inspector: string;
  inspected_at: string;
  resolved_at: string;
  note: string;
  updated_at: string;
};

export async function GET() {
  try {
    await ensureQcLogTable();
    const rows = await query<Row>(
      `SELECT
         t.id AS task_id,
         t.name AS task_name,
         t.project_id,
         COALESCE(p.name, t.project_id) AS project_name,
         t.phase_id,
         COALESCE(ph.name, '') AS phase_name,
         t.unit_id,
         COALESCE(u.name, '') AS unit_name,
         COALESCE(ep.name, '') AS epic_name,
         COALESCE(ft.name, '') AS feature_name,
         COALESCE(t.is_critical, false)::text AS is_critical,
         COALESCE(t.percent_complete, 0)::text AS percent_complete,
         t.baseline_end::text,
         COALESCE(q.qc_status, 'not_started') AS qc_status,
         COALESCE(q.severity, 'low') AS severity,
         COALESCE(q.item_count, 0)::text AS item_count,
         COALESCE(q.correct_count, 0)::text AS correct_count,
         COALESCE(q.minor_issues, 0)::text AS minor_issues,
         COALESCE(q.major_issues, 0)::text AS major_issues,
         COALESCE(q.checklist_score, 0)::text AS checklist_score,
         COALESCE(q.defects_found, 0)::text AS defects_found,
         COALESCE(q.defects_open, 0)::text AS defects_open,
         COALESCE(q.inspector, '') AS inspector,
         q.inspected_at::text,
         q.resolved_at::text,
         COALESCE(q.note, '') AS note,
         q.updated_at::text
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN phases ph ON ph.id = t.phase_id
       LEFT JOIN units u ON u.id = t.unit_id
       LEFT JOIN epics ep ON ep.id = t.epic_id
       LEFT JOIN features ft ON ft.id = t.feature_id
       LEFT JOIN qc_logs q ON q.task_id = t.id
       WHERE p.is_active = true AND p.has_schedule = true
       ORDER BY p.name, ph.name NULLS LAST, ep.name NULLS LAST, t.name`,
    );

    const total = rows.length;
    const logged = rows.filter((r) => r.qc_status !== 'not_started').length;
    const passed = rows.filter((r) => r.qc_status === 'passed').length;
    const failed = rows.filter((r) => r.qc_status === 'failed').length;
    const rework = rows.filter((r) => r.qc_status === 'rework_required').length;
    const openDefects = rows.reduce((s, r) => s + Number(r.defects_open || 0), 0);
    const totalCount = rows.reduce((s, r) => s + Number(r.item_count || 0), 0);
    const totalCorrect = rows.reduce((s, r) => s + Number(r.correct_count || 0), 0);
    const totalMinor = rows.reduce((s, r) => s + Number(r.minor_issues || 0), 0);
    const totalMajor = rows.reduce((s, r) => s + Number(r.major_issues || 0), 0);
    const avgScore = rows.length
      ? Math.round((rows.reduce((s, r) => s + Number(r.checklist_score || 0), 0) / rows.length) * 10) / 10
      : 0;

    const statusMix: Record<string, number> = {};
    const severityMix: Record<string, number> = {};
    rows.forEach((r) => {
      statusMix[r.qc_status] = (statusMix[r.qc_status] || 0) + 1;
      if (r.qc_status === 'failed' || r.qc_status === 'rework_required' || Number(r.defects_open || 0) > 0) {
        severityMix[r.severity] = (severityMix[r.severity] || 0) + 1;
      }
    });

    const recentIssues = rows
      .filter((r) => r.qc_status === 'failed' || r.qc_status === 'rework_required' || Number(r.defects_open || 0) > 0)
      .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
      .slice(0, 20);

    return NextResponse.json({
      success: true,
      kpis: {
        totalTasks: total,
        coverage: total > 0 ? Math.round((logged / total) * 1000) / 10 : 0,
        passed,
        failed,
        rework,
        openDefects,
        totalCount,
        totalCorrect,
        totalMinor,
        totalMajor,
        avgScore,
      },
      statusMix,
      severityMix,
      recentIssues,
      rows: rows.map((r) => ({
        taskId: r.task_id,
        taskName: r.task_name,
        projectId: r.project_id,
        projectName: r.project_name,
        phaseId: r.phase_id,
        phaseName: r.phase_name,
        unitId: r.unit_id,
        unitName: r.unit_name,
        epicName: r.epic_name,
        featureName: r.feature_name,
        isCritical: r.is_critical === 'true',
        percentComplete: Number(r.percent_complete || 0),
        baselineEnd: r.baseline_end,
        qcStatus: r.qc_status,
        severity: r.severity,
        itemCount: Number(r.item_count || 0),
        correctCount: Number(r.correct_count || 0),
        minorIssues: Number(r.minor_issues || 0),
        majorIssues: Number(r.major_issues || 0),
        checklistScore: Number(r.checklist_score || 0),
        defectsFound: Number(r.defects_found || 0),
        defectsOpen: Number(r.defects_open || 0),
        inspector: r.inspector,
        inspectedAt: r.inspected_at,
        resolvedAt: r.resolved_at,
        note: r.note,
        updatedAt: r.updated_at,
      })),
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureQcLogTable();
    const body = await request.json();

    const taskId = String(body.taskId || '').trim();
    if (!taskId) {
      return NextResponse.json({ success: false, error: 'taskId is required' }, { status: 400 });
    }

    const taskRows = await query<{ project_id: string; phase_id: string; unit_id: string }>(
      'SELECT project_id, phase_id, unit_id FROM tasks WHERE id = $1',
      [taskId],
    );
    const task = taskRows[0];
    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    }

    const id = String(body.id || `qcl-${taskId}`);
    const qcStatus = String(body.qcStatus || 'not_started');
    const severity = String(body.severity || 'low');
    const itemCount = Number(body.itemCount || 0);
    const correctCount = Number(body.correctCount || 0);
    const minorIssues = Number(body.minorIssues || 0);
    const majorIssues = Number(body.majorIssues || 0);
    const checklistScore = Number(body.checklistScore || 0);
    const defectsFound = Number(body.defectsFound || 0);
    const defectsOpen = Number(body.defectsOpen || 0);
    const inspector = String(body.inspector || '');
    const inspectedAt = body.inspectedAt || null;
    const resolvedAt = body.resolvedAt || null;
    const note = String(body.note || '');

    await query(
      `INSERT INTO qc_logs (
         id, task_id, project_id, phase_id, unit_id,
         qc_status, severity, item_count, correct_count, minor_issues, major_issues,
         checklist_score, defects_found, defects_open, inspector, inspected_at, resolved_at, note
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18
       )
       ON CONFLICT (task_id) DO UPDATE SET
         qc_status = EXCLUDED.qc_status,
         severity = EXCLUDED.severity,
         item_count = EXCLUDED.item_count,
         correct_count = EXCLUDED.correct_count,
         minor_issues = EXCLUDED.minor_issues,
         major_issues = EXCLUDED.major_issues,
         checklist_score = EXCLUDED.checklist_score,
         defects_found = EXCLUDED.defects_found,
         defects_open = EXCLUDED.defects_open,
         inspector = EXCLUDED.inspector,
         inspected_at = EXCLUDED.inspected_at,
         resolved_at = EXCLUDED.resolved_at,
         note = EXCLUDED.note,
         updated_at = NOW()`,
      [
        id,
        taskId,
        task.project_id,
        task.phase_id,
        task.unit_id,
        qcStatus,
        severity,
        itemCount,
        correctCount,
        minorIssues,
        majorIssues,
        checklistScore,
        defectsFound,
        defectsOpen,
        inspector,
        inspectedAt,
        resolvedAt,
        note,
      ],
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
