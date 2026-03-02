import { NextRequest, NextResponse } from 'next/server';
import { query, execute, refreshRollups } from '@/lib/db';
import { deleteFile, downloadFile } from '@/lib/azure-storage';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'document id required' }, { status: 400 });
    const rows = await query<{ id: string; file_name: string; storage_path: string }>(
      `SELECT id, file_name, storage_path FROM project_documents WHERE id = $1`,
      [id],
    );
    const doc = rows[0];
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    const file = await downloadFile(doc.storage_path);
    const safeName = (doc.file_name || 'project-file.mpp').replace(/["\r\n]/g, '_');
    return new NextResponse(new Uint8Array(file.data), {
      status: 200,
      headers: {
        'Content-Type': file.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'document id required' }, { status: 400 });

    const rows = await query<{
      id: string;
      project_id: string;
      storage_path: string;
      is_current_version: boolean;
    }>(
      `SELECT id, project_id, storage_path, is_current_version
       FROM project_documents
       WHERE id = $1`,
      [id],
    );
    const doc = rows[0];
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    let blobDeleted = false;
    try {
      blobDeleted = await deleteFile(doc.storage_path);
    } catch {
      blobDeleted = false;
    }

    await execute('DELETE FROM project_documents WHERE id = $1', [id]);

    const remainingDocs = await query<{ id: string }>(
      `SELECT id
       FROM project_documents
       WHERE project_id = $1
       ORDER BY uploaded_at DESC
       LIMIT 1`,
      [doc.project_id],
    );
    const replacement = remainingDocs[0];
    if (replacement) {
      await execute(
        `UPDATE project_documents
         SET is_current_version = CASE WHEN id = $1 THEN true ELSE false END,
             updated_at = NOW()
         WHERE project_id = $2`,
        [replacement.id, doc.project_id],
      );
    }

    let scheduleCleared = false;
    if (doc.is_current_version) {
      await execute('DELETE FROM sub_tasks WHERE project_id = $1', [doc.project_id]);
      await execute('DELETE FROM tasks WHERE project_id = $1', [doc.project_id]);
      await execute('DELETE FROM phases WHERE project_id = $1', [doc.project_id]);
      await execute('DELETE FROM units WHERE project_id = $1', [doc.project_id]);
      await execute('UPDATE projects SET has_schedule = false, updated_at = NOW() WHERE id = $1', [doc.project_id]);
      try { await refreshRollups(); } catch { /* non-fatal */ }
      scheduleCleared = true;
    }

    return NextResponse.json({
      success: true,
      blobDeleted,
      scheduleCleared,
      replacementDocumentId: replacement?.id || null,
      message: scheduleCleared
        ? 'Current processed document deleted. Schedule cleared; reprocess another file to restore WBS.'
        : 'Document deleted.',
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

