/**
 * @fileoverview Document Download API Route
 *
 * Downloads a document from Azure Blob Storage by document ID.
 * Looks up the storage_path from the project_documents table.
 *
 * GET /api/documents/download?documentId=...
 */

import { NextRequest, NextResponse } from 'next/server';
import { downloadFile, isAzureStorageConfigured } from '@/lib/azure-storage';
import { query } from '@/lib/postgres';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get('documentId');

  if (!documentId) {
    return NextResponse.json({ success: false, error: 'Missing documentId' }, { status: 400 });
  }

  try {
    // Look up document metadata
    const result = await query(
      'SELECT id, file_name, storage_path, file_type FROM project_documents WHERE id = $1',
      [documentId]
    );

    const doc = result.rows[0];
    if (!doc) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }

    if (!isAzureStorageConfigured()) {
      return NextResponse.json({ success: false, error: 'Azure Storage not configured' }, { status: 503 });
    }

    // Download from Azure Blob Storage
    const { data, contentType, error } = await downloadFile(doc.storage_path);

    if (error || !data) {
      return NextResponse.json({ success: false, error: error || 'Download failed' }, { status: 500 });
    }

    // Return the file as a downloadable response
    return new Response(data, {
      headers: {
        'Content-Type': contentType || doc.file_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${doc.file_name}"`,
        'Content-Length': data.length.toString(),
      },
    });
  } catch (err: any) {
    console.error('[documents/download] Error:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
