import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { convertProjectPlanJSON } from '@/lib/data-converter';

const PYTHON_SERVICE_URL = process.env.MPP_PARSER_URL || 'https://ppc-demo-production.up.railway.app';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const headers = new Headers();
    // Forward headers if needed, but fetch usually handles this
    
    // Check if we have a file directly or a document ID
    // If document ID, we need to read from storage (or simulate)
    // If file, we forward it to Python
    
    // For now, assume the frontend sends 'documentId' and 'projectId'
    // but the python service needs the actual file content.
    // If we only have documentId, we need to fetch it from Supabase Storage first.
    
    // HOWEVER, the previous implementation likely sent the file directly from the browser
    // or read it from the local upload folder if running locally.
    
    // Given the context: "app/api/documents: No such file or directory", this entire route was missing.
    // Let's implement a robust version.
    
    const documentId = formData.get('documentId') as string;
    const projectId = formData.get('projectId') as string;
    
    if (!documentId || !projectId) {
      return NextResponse.json({ success: false, error: 'Missing documentId or projectId' }, { status: 400 });
    }

    // 1. Get the document metadata from Supabase to find the path
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: doc, error: docError } = await supabase
      .from('project_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }
    
    // 2. Download the file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('documents')
      .download(doc.file_path); // Assuming file_path stores the storage path
      
    if (downloadError) {
       // Fallback for local dev if file is in public/uploads?
       // But assuming Supabase storage
       console.error('Download error:', downloadError);
       return NextResponse.json({ success: false, error: 'Failed to download file content' }, { status: 500 });
    }

    // 3. Send file to Python service
    const pythonFormData = new FormData();
    pythonFormData.append('file', fileData, doc.file_name);
    
    const pythonRes = await fetch(`${PYTHON_SERVICE_URL}/parse`, {
      method: 'POST',
      body: pythonFormData,
    });
    
    if (!pythonRes.ok) {
        const errText = await pythonRes.text();
        return NextResponse.json({ success: false, error: `Parser failed: ${errText}` }, { status: 500 });
    }
    
    const mppData = await pythonRes.json();
    if (!mppData.success) {
        return NextResponse.json({ success: false, error: mppData.error }, { status: 500 });
    }
    
    console.log('MPP Parsed successfully, converting...');
    
    // 4. Convert Data to Schema Format
    // We pass projectId to link everything correctly
    // The converter handles linking based on the structure we updated
    const convertedData = convertProjectPlanJSON(mppData, projectId);
    
    // 5. Save using Data Sync API (reusing logic)
    // We can call the sync logic directly or via internal API
    // Direct database calls are better for reliability here
    
    // Save Units
    if (convertedData.units && convertedData.units.length > 0) {
        const { error } = await supabase.from('units').upsert(convertedData.units, { onConflict: 'id' });
        if (error) console.error('Error saving units:', error);
    }
    
    // Save Projects (Update existing project with new data?)
    // Actually project already exists, we might update fields
    // But convertedData.project might be a list of 1
    
    // Save Phases
    if (convertedData.phases && convertedData.phases.length > 0) {
        const { error } = await supabase.from('phases').upsert(convertedData.phases, { onConflict: 'id' });
        if (error) console.error('Error saving phases:', error);
    }
    
    // Save Tasks
    if (convertedData.tasks && convertedData.tasks.length > 0) {
        const { error } = await supabase.from('tasks').upsert(convertedData.tasks, { onConflict: 'id' });
        if (error) console.error('Error saving tasks:', error);
    }
    
    return NextResponse.json({ 
        success: true, 
        message: 'Imported successfully',
        logs: [
            { type: 'info', message: `Parsed ${mppData.summary.total_tasks} tasks` },
            { type: 'success', message: `Imported ${convertedData.units?.length || 0} units and ${convertedData.phases?.length || 0} phases` }
        ]
    });

  } catch (error: any) {
    console.error('Process error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
