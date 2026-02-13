/**
 * @fileoverview Azure Blob Storage API Routes
 *
 * Provides server-side proxy for Azure Blob Storage operations.
 * Client-side code calls these endpoints instead of using Supabase Storage.
 *
 * GET  /api/storage?action=list&prefix=mpp      — List files
 * GET  /api/storage?action=download&path=...     — Download a file
 * POST /api/storage                              — Upload a file
 * DELETE /api/storage                            — Delete file(s)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  uploadFile,
  downloadFile,
  listFiles,
  deleteFile,
  deleteFiles,
  isAzureStorageConfigured,
} from '@/lib/azure-storage';

function isSafeStoragePath(path: string): boolean {
  if (!path || path.length > 500) return false;
  if (path.startsWith('/') || path.startsWith('\\')) return false;
  if (/[\0\r\n]/.test(path)) return false;
  return true;
}

export async function GET(req: NextRequest) {
  if (!isAzureStorageConfigured()) {
    return NextResponse.json(
      { error: 'Azure Storage not configured' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  if (action === 'list') {
    const prefix = searchParams.get('prefix') || '';
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const result = await listFiles(prefix, limit);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ data: result.files });
  }

  if (action === 'download') {
    const path = searchParams.get('path');
    if (!path) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
    }
    if (!isSafeStoragePath(path)) {
      return NextResponse.json({ error: 'Invalid path parameter' }, { status: 400 });
    }
    const result = await downloadFile(path);
    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error || 'Download failed' }, { status: 500 });
    }
    return new Response(result.data, {
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${path.split('/').pop()}"`,
      },
    });
  }

  return NextResponse.json({ error: 'Invalid action. Use action=list or action=download' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  if (!isAzureStorageConfigured()) {
    return NextResponse.json(
      { error: 'Azure Storage not configured' },
      { status: 503 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const storagePath = formData.get('path') as string | null;

    if (!file || !storagePath) {
      return NextResponse.json(
        { error: 'Missing file or path in form data' },
        { status: 400 }
      );
    }
    if (!isSafeStoragePath(storagePath)) {
      return NextResponse.json({ error: 'Invalid storage path' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(storagePath, buffer, file.type);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ data: { path: result.path } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAzureStorageConfigured()) {
    return NextResponse.json(
      { error: 'Azure Storage not configured' },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const paths: string[] = body.paths || (body.path ? [body.path] : []);

    if (paths.length === 0) {
      return NextResponse.json(
        { error: 'Missing path(s) to delete' },
        { status: 400 }
      );
    }
    if (paths.some((path) => !isSafeStoragePath(path))) {
      return NextResponse.json({ error: 'One or more paths are invalid' }, { status: 400 });
    }

    const result =
      paths.length === 1
        ? await deleteFile(paths[0])
        : await deleteFiles(paths);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
