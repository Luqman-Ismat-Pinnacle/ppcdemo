import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { convertProjectPlanJSON } from '@/lib/data-converter';
import { toSupabaseFormat } from '@/lib/supabase';

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
    const portfolioId = formData.get('portfolioId') as string;
    const customerId = formData.get('customerId') as string;
    const siteId = formData.get('siteId') as string;
    
    if (!documentId || !projectId) {
      return NextResponse.json({ success: false, error: 'Missing documentId or projectId' }, { status: 400 });
    }

    if (!portfolioId || !customerId || !siteId) {
      return NextResponse.json({ success: false, error: 'Missing portfolioId, customerId, or siteId' }, { status: 400 });
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
    
    // 4. Convert Data to Schema Format with hierarchy context
    // We pass projectId and hierarchy IDs to link everything correctly
    const convertedData = convertProjectPlanJSON(mppData, projectId);
    
    // Apply hierarchy context to all imported items
    if (convertedData.phases) {
      convertedData.phases.forEach((phase: any) => {
        phase.projectId = projectId;
        phase.portfolioId = portfolioId;
        phase.customerId = customerId;
        phase.siteId = siteId;
      });
    }
    
    if (convertedData.units) {
      convertedData.units.forEach((unit: any) => {
        unit.projectId = projectId;
        unit.portfolioId = portfolioId;
        unit.customerId = customerId;
        unit.siteId = siteId;
      });
    }
    
    if (convertedData.tasks) {
      convertedData.tasks.forEach((task: any) => {
        task.projectId = projectId;
        task.portfolioId = portfolioId;
        task.customerId = customerId;
        task.siteId = siteId;
      });
    }
    
    // 5. Save using Data Sync API (reusing logic)
    // We can call the sync logic directly or via internal API
    // Direct database calls are better for reliability here
    
    // Save Units (convert to snake_case)
    if (convertedData.units && convertedData.units.length > 0) {
        const unitsForDb = convertedData.units.map((u: Record<string, unknown>) => toSupabaseFormat(u));
        const { error } = await supabase.from('units').upsert(unitsForDb, { onConflict: 'id' });
        if (error) console.error('Error saving units:', error);
    }
    
    // Save Phases (convert to snake_case)
    if (convertedData.phases && convertedData.phases.length > 0) {
        const phasesForDb = convertedData.phases.map((p: Record<string, unknown>) => toSupabaseFormat(p));
        const { error } = await supabase.from('phases').upsert(phasesForDb, { onConflict: 'id' });
        if (error) console.error('Error saving phases:', error);
    }
    
    // Save Tasks (convert to snake_case so remaining_hours etc. are written correctly)
    const tasksForDb = (convertedData.tasks || []).map((t: Record<string, unknown>) => {
      const row = toSupabaseFormat(t);
      delete (row as any).employee_id; // tasks table has assigned_resource_id only
      return row;
    });
    if (tasksForDb.length > 0) {
        const { error } = await supabase.from('tasks').upsert(tasksForDb, { onConflict: 'id' });
        if (error) console.error('Error saving tasks:', error);
    }

    // 6. Match hours entries to MPP tasks/units
    // Fetch unassigned hours for this project
    const { data: projectHours } = await supabase
      .from('hour_entries')
      .select('*')
      .eq('project_id', projectId);

    const unassignedHours = (projectHours || []).filter((h: any) => !h.task_id);
    
    // Build lookup maps for matching
    const tasksByName = new Map<string, any>();
    const unitsByName = new Map<string, any>();
    
    // Normalize function for name matching
    const normalizeName = (s: string) => (s ?? '').toString().trim().toLowerCase().replace(/[\s_\-.,;:()]+/g, ' ');
    
    // Index tasks by (phase_name, task_name)
    (convertedData.tasks || []).forEach((task: any) => {
      const phaseName = task.phaseName || '';
      const taskName = task.name || task.taskName || '';
      const key = `${normalizeName(phaseName)}|${normalizeName(taskName)}`;
      if (!tasksByName.has(key)) tasksByName.set(key, task);
      // Also index by task name alone for looser matching
      const nameOnlyKey = normalizeName(taskName);
      if (nameOnlyKey && !tasksByName.has(nameOnlyKey)) tasksByName.set(nameOnlyKey, task);
    });
    
    // Index units by name
    (convertedData.units || []).forEach((unit: any) => {
      const unitName = unit.name || '';
      const key = normalizeName(unitName);
      if (key && !unitsByName.has(key)) unitsByName.set(key, unit);
    });

    // Match hours entries
    let tasksMatched = 0;
    let unitsMatched = 0;
    const hoursToUpdate: { id: string; task_id: string }[] = [];
    
    unassignedHours.forEach((h: any) => {
      const workdayPhase = normalizeName(h.workday_phase || '');
      const workdayTask = normalizeName(h.workday_task || '');
      
      // Try task match first (phase + task name)
      const phaseTaskKey = `${workdayPhase}|${workdayTask}`;
      let matchedTask = tasksByName.get(phaseTaskKey);
      
      // If no match, try task name only
      if (!matchedTask && workdayTask) {
        matchedTask = tasksByName.get(workdayTask);
      }
      
      if (matchedTask) {
        hoursToUpdate.push({ id: h.id, task_id: matchedTask.id || matchedTask.taskId });
        tasksMatched++;
        return;
      }
      
      // Try unit match (workday_phase often maps to unit name)
      if (workdayPhase) {
        const matchedUnit = unitsByName.get(workdayPhase);
        if (matchedUnit) {
          // For units, we still assign to task_id field but note in logs
          // Alternatively, if there's a unit_id field, use that
          hoursToUpdate.push({ id: h.id, task_id: matchedUnit.id || matchedUnit.unitId });
          unitsMatched++;
        }
      }
    });
    
    // Update matched hours
    if (hoursToUpdate.length > 0) {
      for (const update of hoursToUpdate) {
        await supabase.from('hour_entries').update({ task_id: update.task_id }).eq('id', update.id);
      }
    }
    
    // Build result logs
    const logs = [
      { type: 'info', message: `Parsed ${mppData.summary?.total_tasks || mppData.tasks?.length || 0} items from MPP` },
      { type: 'success', message: `Imported: ${convertedData.units?.length || 0} units, ${convertedData.phases?.length || 0} phases, ${convertedData.tasks?.length || 0} tasks` },
    ];
    
    if (unassignedHours.length > 0) {
      logs.push({ type: 'info', message: `Found ${unassignedHours.length} unassigned hours entries for this project` });
      if (tasksMatched > 0) {
        logs.push({ type: 'success', message: `Matched ${tasksMatched} hours entries to tasks` });
      }
      if (unitsMatched > 0) {
        logs.push({ type: 'success', message: `Matched ${unitsMatched} hours entries to units` });
      }
      const stillUnmatched = unassignedHours.length - tasksMatched - unitsMatched;
      if (stillUnmatched > 0) {
        logs.push({ type: 'warning', message: `${stillUnmatched} hours entries could not be matched` });
      }
    }
    
    return NextResponse.json({ 
        success: true, 
        message: 'Imported successfully',
        tasks: convertedData.tasks || [],
        logs
    });

  } catch (error: any) {
    console.error('Process error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
