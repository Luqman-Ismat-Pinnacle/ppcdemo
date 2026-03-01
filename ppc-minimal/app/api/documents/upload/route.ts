import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/db';
import { uploadFile } from '@/lib/azure-storage';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const projectId = formData.get('projectId') as string | null;
    if (!file || !projectId) return NextResponse.json({ error: 'file and projectId required' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `minimal/${projectId}/${Date.now()}-${file.name}`;
    await uploadFile(storagePath, buffer, file.type);

    const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await execute(
      `INSERT INTO project_documents (id, project_id, file_name, storage_path, document_type, is_current_version)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (id) DO UPDATE SET file_name=EXCLUDED.file_name, storage_path=EXCLUDED.storage_path, updated_at=NOW()`,
      [docId, projectId, file.name, storagePath, 'mpp'],
    );

    return NextResponse.json({ success: true, documentId: docId, storagePath });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
