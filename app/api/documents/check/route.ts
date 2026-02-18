/**
 * @fileoverview Document existence check – verify project_documents in DB
 *
 * GET /api/documents/check?name=NATREF
 * Returns whether any document matches (by file_name or name).
 */

import { NextRequest, NextResponse } from 'next/server';
import { isPostgresConfigured, query } from '@/lib/postgres';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name')?.trim();

  if (!name) {
    return NextResponse.json(
      { success: false, error: 'Missing name (e.g. ?name=NATREF)' },
      { status: 400 }
    );
  }

  if (!isPostgresConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Database not configured' },
      { status: 503 }
    );
  }

  try {
    const pattern = `%${name}%`;
    const result = await query(
      `SELECT id, project_id, file_name, storage_path, file_type, document_type, uploaded_at, is_current_version
       FROM project_documents
       WHERE file_name ILIKE $1 OR name ILIKE $1
       ORDER BY uploaded_at DESC`,
      [pattern]
    );

    const documents = (result?.rows || []).map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      fileName: row.file_name,
      storagePath: row.storage_path,
      fileType: row.file_type,
      documentType: row.document_type,
      uploadedAt: row.uploaded_at,
      isCurrentVersion: row.is_current_version,
    }));

    return NextResponse.json({
      success: true,
      exists: documents.length > 0,
      count: documents.length,
      documents,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[documents/check] Error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
