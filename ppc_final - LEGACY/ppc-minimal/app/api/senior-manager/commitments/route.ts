import { NextRequest, NextResponse } from 'next/server';
import { execute, query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SM_COMMITMENT_METRIC = 'sm_commitment';
const VALID_STATUS = new Set(['open', 'in_progress', 'closed']);

type CommitmentRow = {
  id: string;
  scope: string;
  recordId: string | null;
  level: string | null;
  comment: string;
  status: string;
  project_name: string | null;
  owner: string | null;
  item_name: string | null;
  created_at: string;
  updated_at: string;
};

async function listCommitments(): Promise<{ commitments: CommitmentRow[]; summary: { total: number; open: number; inProgress: number; closed: number } }> {
  const rows = await query<{
    id: string; record_id: string; metric_key: string; comment: string;
    status: string; created_at: string; updated_at: string;
  }>(
    `SELECT id, record_id, comment, status, created_at::text, updated_at::text
     FROM variance_notes
     WHERE role = 'SM' AND metric_key = $1
     ORDER BY created_at DESC
     LIMIT 200`,
    [SM_COMMITMENT_METRIC],
  );

  const commitments: CommitmentRow[] = [];
  for (const r of rows) {
    let scope = 'general';
    let level: string | null = null;
    let projectName: string | null = null;
    let owner: string | null = null;
    let itemName: string | null = null;
    let commentText = r.comment || '';

    try {
      const parsed = JSON.parse(r.comment || '{}') as {
        scope?: string;
        level?: string;
        recordId?: string;
        comment?: string;
        status?: string;
      };
      scope = parsed.scope || 'general';
      level = parsed.level || null;
      commentText = parsed.comment || r.comment || '';
    } catch {
      /* use defaults */
    }

    if (r.record_id) {
      const [proj, unit, phase] = await Promise.all([
        query<{ name: string; owner: string }>(
          `SELECT p.name, COALESCE(lead.pca_name, COALESCE(NULLIF(TRIM(pf.name), ''), 'Unassigned')) AS owner
           FROM projects p
           LEFT JOIN portfolios pf ON pf.id = p.portfolio_id
           LEFT JOIN LATERAL (SELECT NULLIF(TRIM(e.name), '') AS pca_name FROM employees e WHERE LOWER(e.email) = LOWER(p.pca_email) LIMIT 1) lead ON true
           WHERE p.id = $1`,
          [r.record_id],
        ),
        query<{ name: string; project_id: string }>(`SELECT name, project_id FROM units WHERE id = $1`, [r.record_id]),
        query<{ name: string; unit_id: string }>(`SELECT name, unit_id FROM phases WHERE id = $1`, [r.record_id]),
      ]);
      if (phase[0]) {
        const u = await query<{ name: string; project_id: string }>(`SELECT name, project_id FROM units WHERE id = $1`, [phase[0].unit_id]);
        const pRow = u[0] ? await query<{ name: string; owner: string }>(
          `SELECT p.name, COALESCE(lead.pca_name, 'Unassigned') AS owner FROM projects p
           LEFT JOIN LATERAL (SELECT NULLIF(TRIM(e.name), '') AS pca_name FROM employees e WHERE LOWER(e.email) = LOWER(p.pca_email) LIMIT 1) lead ON true
           WHERE p.id = $1`, [u[0].project_id],
        ) : [];
        projectName = pRow[0]?.name;
        owner = pRow[0]?.owner ?? null;
        itemName = [pRow[0]?.name, u[0]?.name, phase[0].name].filter(Boolean).join(' › ');
      } else if (unit[0]) {
        const pRow = await query<{ name: string; owner: string }>(
          `SELECT p.name, COALESCE(lead.pca_name, 'Unassigned') AS owner FROM projects p
           LEFT JOIN LATERAL (SELECT NULLIF(TRIM(e.name), '') AS pca_name FROM employees e WHERE LOWER(e.email) = LOWER(p.pca_email) LIMIT 1) lead ON true
           WHERE p.id = $1`, [unit[0].project_id],
        );
        projectName = pRow[0]?.name;
        owner = pRow[0]?.owner ?? null;
        itemName = [pRow[0]?.name, unit[0].name].filter(Boolean).join(' › ');
      } else if (proj[0]) {
        projectName = proj[0].name;
        owner = proj[0].owner;
        itemName = projectName;
      }
    }

    const status = VALID_STATUS.has(r.status) ? r.status : 'open';
    commitments.push({
      id: r.id,
      scope,
      recordId: r.record_id,
      level,
      comment: commentText,
      status,
      project_name: projectName,
      owner,
      item_name: itemName,
      created_at: r.created_at,
      updated_at: r.updated_at,
    });
  }

  const summary = {
    total: commitments.length,
    open: commitments.filter((c) => c.status === 'open').length,
    inProgress: commitments.filter((c) => c.status === 'in_progress').length,
    closed: commitments.filter((c) => c.status === 'closed').length,
  };

  return { commitments, summary };
}

async function listProjectsWithHierarchy(): Promise<{ id: string; name: string; units: { id: string; name: string; phases: { id: string; name: string }[] }[] }[]> {
  const projRows = await query<{ id: string; name: string }>(
    `SELECT id, name FROM projects WHERE is_active = true AND has_schedule = true ORDER BY name`,
  );
  const result: { id: string; name: string; units: { id: string; name: string; phases: { id: string; name: string }[] }[] }[] = [];
  for (const p of projRows) {
    const unitRows = await query<{ id: string; name: string }>(
      `SELECT id, name FROM units WHERE project_id = $1 ORDER BY name`,
      [p.id],
    );
    const units: { id: string; name: string; phases: { id: string; name: string }[] }[] = [];
    for (const u of unitRows) {
      const phaseRows = await query<{ id: string; name: string }>(
        `SELECT id, name FROM phases WHERE unit_id = $1 ORDER BY name`,
        [u.id],
      );
      units.push({ id: u.id, name: u.name, phases: phaseRows.map((ph) => ({ id: ph.id, name: ph.name })) });
    }
    result.push({ id: p.id, name: p.name, units });
  }
  return result;
}

export async function GET() {
  try {
    const [commitmentsData, projectsHierarchy] = await Promise.all([
      listCommitments(),
      listProjectsWithHierarchy(),
    ]);
    const { commitments, summary } = commitmentsData;
    const projects = projectsHierarchy.map((p) => ({
      id: p.id,
      name: p.name,
      units: p.units.map((u) => ({
        id: u.id,
        name: u.name,
        phases: u.phases,
      })),
    }));
    return NextResponse.json(
      { success: true, commitments, summary, projects },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const scope = String(body.scope || 'general').trim();
    const recordId = body.recordId != null ? String(body.recordId).trim() : null;
    const level = body.level != null ? String(body.level).trim() : null;
    const comment = String(body.comment ?? '').trim();

    const id = `sm-cm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = JSON.stringify({ scope, recordId, level, comment, status: 'open' });

    await execute(
      `INSERT INTO variance_notes (id, role, table_name, record_id, metric_key, status, comment, created_by)
       VALUES ($1, 'SM', 'commitments', $2, $3, 'open', $4, 'sm_ui')`,
      [id, recordId || '', SM_COMMITMENT_METRIC, payload],
    );

    const { commitments, summary } = await listCommitments();
    return NextResponse.json({ success: true, commitments, summary });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body.id || '').trim();
    const status = String(body.status || '').trim();

    if (!id || !VALID_STATUS.has(status)) {
      return NextResponse.json({ success: false, error: 'id and valid status (open, in_progress, closed) required' }, { status: 400 });
    }

    const existing = await query<{ comment: string }>(
      `SELECT comment FROM variance_notes WHERE id = $1 AND role = 'SM' AND metric_key = $2`,
      [id, SM_COMMITMENT_METRIC],
    );

    if (!existing[0]) {
      return NextResponse.json({ success: false, error: 'Commitment not found' }, { status: 404 });
    }

    let payload = existing[0].comment || '{}';
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      parsed.status = status;
      payload = JSON.stringify(parsed);
    } catch {
      payload = JSON.stringify({ status, comment: existing[0].comment });
    }

    await execute(
      `UPDATE variance_notes SET comment = $1, status = $2, updated_at = NOW() WHERE id = $3`,
      [payload, status, id],
    );

    const { commitments, summary } = await listCommitments();
    return NextResponse.json({ success: true, commitments, summary });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
