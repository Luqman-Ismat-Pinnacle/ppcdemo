import { NextRequest, NextResponse } from 'next/server';
import { isPostgresConfigured, query as pgQuery } from '@/lib/postgres';
import { hasRolePermission, roleContextFromRequest } from '@/lib/api-role-guard';
import { writeWorkflowAudit } from '@/lib/workflow-audit';

type Action =
  | 'listDocumentRecords'
  | 'createDocumentRecord'
  | 'uploadDocumentVersion'
  | 'deleteLatestDocumentVersion'
  | 'updateDocumentRecordMetadata'
  | 'updateDocumentVersionNotes';

function mkId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNullableString(value: unknown): string | null {
  const str = asString(value);
  return str ? str : null;
}

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const s = asString(value).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function resolveActor(body: Record<string, unknown>): string {
  const actorEmail = asString(body.actorEmail);
  const actorName = asString(body.actorName);
  return actorEmail || actorName || 'System';
}

async function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
}

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const actorIdentity = resolveActor(body as Record<string, unknown>);
    const action = asString(body.action) as Action;
    const roleContext = roleContextFromRequest(req);

    const mutatingActions = new Set<Action>([
      'createDocumentRecord',
      'uploadDocumentVersion',
      'deleteLatestDocumentVersion',
      'updateDocumentRecordMetadata',
      'updateDocumentVersionNotes',
    ]);

    if (mutatingActions.has(action) && !hasRolePermission(roleContext, 'manageDocuments')) {
      return NextResponse.json({ success: false, error: 'Forbidden for current role view' }, { status: 403 });
    }

    if (!action) {
      return NextResponse.json({ success: false, error: 'action required' }, { status: 400 });
    }

    if (action === 'listDocumentRecords') {
      const projectId = asNullableString(body.projectId);
      const portfolioId = asNullableString(body.portfolioId);
      const customerId = asNullableString(body.customerId);
      const siteId = asNullableString(body.siteId);
      const docType = asNullableString(body.docType);

      if (isPostgresConfigured()) {
        const where: string[] = [];
        const params: unknown[] = [];
        const addWhere = (sql: string, value: unknown) => {
          params.push(value);
          where.push(`${sql} = $${params.length}`);
        };
        if (projectId) addWhere('project_id', projectId);
        if (portfolioId) addWhere('portfolio_id', portfolioId);
        if (customerId) addWhere('customer_id', customerId);
        if (siteId) addWhere('site_id', siteId);
        if (docType) addWhere('doc_type', docType);

        const recordsRes = await pgQuery(
          `SELECT *
           FROM project_document_records
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY doc_type, updated_at DESC`,
          params,
        );
        const versionsRes = await pgQuery(
          `SELECT *
           FROM project_document_versions
           WHERE record_id IN (
             SELECT id
             FROM project_document_records
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           )
           ORDER BY record_id, version_number DESC`,
          params,
        );
        return NextResponse.json({ success: true, records: recordsRes.rows || [], versions: versionsRes.rows || [] });
      }

      const supabase = await getSupabase();
      if (!supabase) return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      let query = supabase.from('project_document_records').select('*');
      if (projectId) query = query.eq('project_id', projectId);
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      if (customerId) query = query.eq('customer_id', customerId);
      if (siteId) query = query.eq('site_id', siteId);
      if (docType) query = query.eq('doc_type', docType);
      const { data: records, error } = await query.order('updated_at', { ascending: false });
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      const recordIds = (records || []).map((r: any) => r.id);
      const { data: versions, error: vErr } = recordIds.length
        ? await supabase.from('project_document_versions').select('*').in('record_id', recordIds).order('version_number', { ascending: false })
        : { data: [], error: null as any };
      if (vErr) return NextResponse.json({ success: false, error: vErr.message }, { status: 500 });
      return NextResponse.json({ success: true, records: records || [], versions: versions || [] });
    }

    if (action === 'createDocumentRecord') {
      const id = asString(body.id) || mkId('DOCREC');
      const owner = asString(body.owner) || asString(body.actorName) || actorIdentity;
      const payload = {
        id,
        doc_type: asString(body.docType),
        name: asString(body.name) || 'Untitled',
        owner,
        project_id: asNullableString(body.projectId),
        portfolio_id: asNullableString(body.portfolioId),
        customer_id: asNullableString(body.customerId),
        site_id: asNullableString(body.siteId),
        due_date: asNullableString(body.dueDate),
        status: asString(body.status) || 'Not Started',
        client_signoff_required: toBool(body.clientSignoffRequired),
        client_signoff_complete: toBool(body.clientSignoffComplete),
        created_by: actorIdentity,
        updated_by: actorIdentity,
      };
      if (!payload.doc_type) return NextResponse.json({ success: false, error: 'docType required' }, { status: 400 });

      if (isPostgresConfigured()) {
        await pgQuery(
          `INSERT INTO project_document_records (
            id, doc_type, name, owner, project_id, portfolio_id, customer_id, site_id,
            due_date, status, client_signoff_required, client_signoff_complete, created_by, updated_by
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
          )`,
          [
            payload.id, payload.doc_type, payload.name, payload.owner,
            payload.project_id, payload.portfolio_id, payload.customer_id, payload.site_id,
            payload.due_date, payload.status, payload.client_signoff_required,
            payload.client_signoff_complete, payload.created_by, payload.updated_by,
          ],
        );
        const rec = await pgQuery('SELECT * FROM project_document_records WHERE id = $1', [payload.id]);
        await writeWorkflowAudit({ query: pgQuery } as { query: typeof pgQuery }, {
          eventType: 'documents.create_record',
          roleKey: roleContext.roleKey,
          actorEmail: roleContext.actorEmail || actorIdentity,
          projectId: payload.project_id,
          entityType: 'project_document_record',
          entityId: payload.id,
          payload: { action, docType: payload.doc_type, recordName: payload.name },
        });
        return NextResponse.json({ success: true, record: rec.rows?.[0] || null });
      }

      const supabase = await getSupabase();
      if (!supabase) return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      const { data, error } = await supabase.from('project_document_records').insert(payload).select().single();
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, record: data });
    }

    if (action === 'uploadDocumentVersion') {
      const recordId = asString(body.recordId);
      const fileName = asString(body.fileName);
      const blobPath = asString(body.blobPath);
      if (!recordId || !fileName || !blobPath) {
        return NextResponse.json({ success: false, error: 'recordId, fileName, blobPath required' }, { status: 400 });
      }
      const uploadedBy = asString(body.uploadedBy) || actorIdentity;
      const notes = asNullableString(body.notes);
      const mimeType = asNullableString(body.mimeType);
      const fileUrl = asNullableString(body.fileUrl);
      const fileSize = Number(body.fileSize || 0) || null;
      const id = asString(body.id) || mkId('DOCVER');

      if (isPostgresConfigured()) {
        await pgQuery('BEGIN', []);
        try {
          const ver = await pgQuery(
            'SELECT COALESCE(MAX(version_number), 0) AS max_version FROM project_document_versions WHERE record_id = $1',
            [recordId],
          );
          const versionNumber = Number(ver.rows?.[0]?.max_version || 0) + 1;
          await pgQuery('UPDATE project_document_versions SET is_latest = false, updated_at = NOW() WHERE record_id = $1', [recordId]);
          await pgQuery(
            `INSERT INTO project_document_versions (
              id, record_id, version_number, file_name, file_url, blob_path, mime_type, file_size, uploaded_by, notes, is_latest
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
            [id, recordId, versionNumber, fileName, fileUrl, blobPath, mimeType, fileSize, uploadedBy, notes],
          );
          await pgQuery(
            'UPDATE project_document_records SET latest_version_id = $1, updated_by = $2, updated_at = NOW() WHERE id = $3',
            [id, uploadedBy, recordId],
          );
          const rec = await pgQuery('SELECT project_id FROM project_document_records WHERE id = $1', [recordId]);
          await writeWorkflowAudit({ query: pgQuery } as { query: typeof pgQuery }, {
            eventType: 'documents.upload_version',
            roleKey: roleContext.roleKey,
            actorEmail: roleContext.actorEmail || actorIdentity,
            projectId: rec.rows?.[0]?.project_id || null,
            entityType: 'project_document_version',
            entityId: id,
            payload: { action, recordId, fileName, versionNumber },
          });
          await pgQuery('COMMIT', []);
          const inserted = await pgQuery('SELECT * FROM project_document_versions WHERE id = $1', [id]);
          return NextResponse.json({ success: true, version: inserted.rows?.[0] || null });
        } catch (err) {
          await pgQuery('ROLLBACK', []);
          throw err;
        }
      }

      const supabase = await getSupabase();
      if (!supabase) return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      const { data: current } = await supabase
        .from('project_document_versions')
        .select('version_number')
        .eq('record_id', recordId)
        .order('version_number', { ascending: false })
        .limit(1);
      const versionNumber = Number(current?.[0]?.version_number || 0) + 1;
      await supabase.from('project_document_versions').update({ is_latest: false }).eq('record_id', recordId);
      const { data, error } = await supabase
        .from('project_document_versions')
        .insert({
          id, record_id: recordId, version_number: versionNumber, file_name: fileName, file_url: fileUrl,
          blob_path: blobPath, mime_type: mimeType, file_size: fileSize, uploaded_by: uploadedBy, notes, is_latest: true,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      await supabase.from('project_document_records').update({ latest_version_id: id, updated_by: uploadedBy }).eq('id', recordId);
      return NextResponse.json({ success: true, version: data });
    }

    if (action === 'deleteLatestDocumentVersion') {
      const recordId = asString(body.recordId);
      if (!recordId) return NextResponse.json({ success: false, error: 'recordId required' }, { status: 400 });

      if (isPostgresConfigured()) {
        await pgQuery('BEGIN', []);
        try {
          const latest = await pgQuery(
            'SELECT id FROM project_document_versions WHERE record_id = $1 AND is_latest = true LIMIT 1',
            [recordId],
          );
          const latestId = latest.rows?.[0]?.id;
          if (!latestId) {
            await pgQuery('COMMIT', []);
            return NextResponse.json({ success: true, removed: false });
          }
          await pgQuery('DELETE FROM project_document_versions WHERE id = $1', [latestId]);
          const next = await pgQuery(
            'SELECT id FROM project_document_versions WHERE record_id = $1 ORDER BY version_number DESC LIMIT 1',
            [recordId],
          );
          const nextId = next.rows?.[0]?.id || null;
          if (nextId) {
            await pgQuery('UPDATE project_document_versions SET is_latest = true, updated_at = NOW() WHERE id = $1', [nextId]);
            await pgQuery('UPDATE project_document_records SET latest_version_id = $1, updated_at = NOW() WHERE id = $2', [nextId, recordId]);
          } else {
            await pgQuery('DELETE FROM project_document_records WHERE id = $1', [recordId]);
          }
          const rec = await pgQuery('SELECT project_id FROM project_document_records WHERE id = $1', [recordId]);
          await writeWorkflowAudit({ query: pgQuery } as { query: typeof pgQuery }, {
            eventType: 'documents.delete_latest_version',
            roleKey: roleContext.roleKey,
            actorEmail: roleContext.actorEmail || actorIdentity,
            projectId: rec.rows?.[0]?.project_id || null,
            entityType: 'project_document_record',
            entityId: recordId,
            payload: { action, promotedVersionId: nextId },
          });
          await pgQuery('COMMIT', []);
          return NextResponse.json({ success: true, removed: true, promotedVersionId: nextId });
        } catch (err) {
          await pgQuery('ROLLBACK', []);
          throw err;
        }
      }

      const supabase = await getSupabase();
      if (!supabase) return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      const { data: latest } = await supabase
        .from('project_document_versions')
        .select('id')
        .eq('record_id', recordId)
        .eq('is_latest', true)
        .limit(1);
      const latestId = latest?.[0]?.id;
      if (!latestId) return NextResponse.json({ success: true, removed: false });
      await supabase.from('project_document_versions').delete().eq('id', latestId);
      const { data: next } = await supabase
        .from('project_document_versions')
        .select('id')
        .eq('record_id', recordId)
        .order('version_number', { ascending: false })
        .limit(1);
      const nextId = next?.[0]?.id || null;
      if (nextId) {
        await supabase.from('project_document_versions').update({ is_latest: true }).eq('id', nextId);
        await supabase.from('project_document_records').update({ latest_version_id: nextId }).eq('id', recordId);
      } else {
        await supabase.from('project_document_records').delete().eq('id', recordId);
      }
      return NextResponse.json({ success: true, removed: true, promotedVersionId: nextId });
    }

    if (action === 'updateDocumentRecordMetadata') {
      const recordId = asString(body.recordId);
      if (!recordId) return NextResponse.json({ success: false, error: 'recordId required' }, { status: 400 });
      const updates = {
        owner: asNullableString(body.owner),
        due_date: asNullableString(body.dueDate),
        status: asNullableString(body.status),
        client_signoff_required: body.clientSignoffRequired,
        client_signoff_complete: body.clientSignoffComplete,
        updated_by: asNullableString(body.updatedBy) || actorIdentity,
      } as Record<string, unknown>;
      const keys = Object.keys(updates).filter((k) => updates[k] !== undefined);
      if (!keys.length) return NextResponse.json({ success: true });

      if (isPostgresConfigured()) {
        const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
        const vals = [recordId, ...keys.map((k) => updates[k])];
        await pgQuery(`UPDATE project_document_records SET ${setClause}, updated_at = NOW() WHERE id = $1`, vals);
        const rec = await pgQuery('SELECT project_id FROM project_document_records WHERE id = $1', [recordId]);
        await writeWorkflowAudit({ query: pgQuery } as { query: typeof pgQuery }, {
          eventType: 'documents.update_record',
          roleKey: roleContext.roleKey,
          actorEmail: roleContext.actorEmail || actorIdentity,
          projectId: rec.rows?.[0]?.project_id || null,
          entityType: 'project_document_record',
          entityId: recordId,
          payload: { action, updatedKeys: keys },
        });
        return NextResponse.json({ success: true });
      }

      const supabase = await getSupabase();
      if (!supabase) return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      const { error } = await supabase.from('project_document_records').update(updates).eq('id', recordId);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action === 'updateDocumentVersionNotes') {
      const versionId = asString(body.versionId);
      if (!versionId) return NextResponse.json({ success: false, error: 'versionId required' }, { status: 400 });
      const notes = asNullableString(body.notes);
      if (isPostgresConfigured()) {
        const rec = await pgQuery(
          `SELECT r.project_id
           FROM project_document_versions v
           LEFT JOIN project_document_records r ON r.id = v.record_id
           WHERE v.id = $1
           LIMIT 1`,
          [versionId]
        );
        await pgQuery('UPDATE project_document_versions SET notes = $1, updated_at = NOW() WHERE id = $2', [notes, versionId]);
        await writeWorkflowAudit({ query: pgQuery } as { query: typeof pgQuery }, {
          eventType: 'documents.update_version_notes',
          roleKey: roleContext.roleKey,
          actorEmail: roleContext.actorEmail || actorIdentity,
          projectId: rec.rows?.[0]?.project_id || null,
          entityType: 'project_document_version',
          entityId: versionId,
          payload: { action },
        });
        return NextResponse.json({ success: true });
      }
      const supabase = await getSupabase();
      if (!supabase) return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      const { error } = await supabase.from('project_document_versions').update({ notes }).eq('id', versionId);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}
