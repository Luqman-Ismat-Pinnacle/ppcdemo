import { NextRequest, NextResponse } from 'next/server';
import { convertProjectPlanJSON } from '@/lib/data-converter';
import { toSupabaseFormat } from '@/lib/supabase';
import { downloadFile } from '@/lib/azure-storage';
import { query } from '@/lib/postgres';

const PYTHON_SERVICE_URL = process.env.MPP_PARSER_URL || process.env.NEXT_PUBLIC_MPP_PARSER_URL || 'https://ppcdemo-production.up.railway.app';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
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

    // 1. Get the document metadata from database to find the storage path
    const docResult = await query(
      'SELECT * FROM project_documents WHERE id = $1',
      [documentId]
    );

    const doc = docResult.rows[0];
    if (!doc) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }
    
    // 2. Download the file from Azure Blob Storage
    const { data: fileBuffer, error: downloadError } = await downloadFile(doc.storage_path);
      
    if (downloadError || !fileBuffer) {
       console.error('Download error:', downloadError);
       return NextResponse.json({ success: false, error: 'Failed to download file content' }, { status: 500 });
    }

    // Convert buffer to Blob for FormData
    const fileBlob = new Blob([fileBuffer], { type: 'application/octet-stream' });

    // 3. Send file to Python service
    const pythonFormData = new FormData();
    pythonFormData.append('file', fileBlob, doc.file_name);
    
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
    
    // 5. Save to database via PostgreSQL
    // Save Units
    if (convertedData.units && convertedData.units.length > 0) {
      for (const unit of convertedData.units) {
        const row = toSupabaseFormat(unit);
        const cols = Object.keys(row);
        const vals = Object.values(row);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const updateSet = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
        try {
          await query(
            `INSERT INTO units (${cols.join(', ')}) VALUES (${placeholders})
             ON CONFLICT (id) DO UPDATE SET ${updateSet}`,
            vals
          );
        } catch (err) { console.error('Error saving unit:', err); }
      }
    }
    
    // Save Phases
    if (convertedData.phases && convertedData.phases.length > 0) {
      for (const phase of convertedData.phases) {
        const row = toSupabaseFormat(phase);
        const cols = Object.keys(row);
        const vals = Object.values(row);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const updateSet = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
        try {
          await query(
            `INSERT INTO phases (${cols.join(', ')}) VALUES (${placeholders})
             ON CONFLICT (id) DO UPDATE SET ${updateSet}`,
            vals
          );
        } catch (err) { console.error('Error saving phase:', err); }
      }
    }
    
    // Save Tasks
    const tasksToSave = (convertedData.tasks || []).map((t: Record<string, unknown>) => {
      const row = toSupabaseFormat(t);
      delete (row as any).employee_id; // tasks table has assigned_resource_id only
      return row;
    });
    if (tasksToSave.length > 0) {
      for (const task of tasksToSave) {
        const cols = Object.keys(task);
        const vals = Object.values(task);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const updateSet = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
        try {
          await query(
            `INSERT INTO tasks (${cols.join(', ')}) VALUES (${placeholders})
             ON CONFLICT (id) DO UPDATE SET ${updateSet}`,
            vals
          );
        } catch (err) { console.error('Error saving task:', err); }
      }
    }

    // 6. Match hours entries to MPP tasks/units
    const hoursResult = await query(
      'SELECT * FROM hour_entries WHERE project_id = $1',
      [projectId]
    );
    const projectHours = hoursResult.rows || [];
    const unassignedHours = projectHours.filter((h: any) => !h.task_id);
    
    // Build lookup maps for matching
    const tasksByName = new Map<string, any>();
    const unitsByName = new Map<string, any>();
    
    const normalizeName = (s: string) => (s ?? '').toString().trim().toLowerCase().replace(/[\s_\-.,;:()]+/g, ' ');
    
    (convertedData.tasks || []).forEach((task: any) => {
      const phaseName = task.phaseName || '';
      const taskName = task.name || task.taskName || '';
      const key = `${normalizeName(phaseName)}|${normalizeName(taskName)}`;
      if (!tasksByName.has(key)) tasksByName.set(key, task);
      const nameOnlyKey = normalizeName(taskName);
      if (nameOnlyKey && !tasksByName.has(nameOnlyKey)) tasksByName.set(nameOnlyKey, task);
    });
    
    (convertedData.units || []).forEach((unit: any) => {
      const unitName = unit.name || '';
      const key = normalizeName(unitName);
      if (key && !unitsByName.has(key)) unitsByName.set(key, unit);
    });

    let tasksMatched = 0;
    let unitsMatched = 0;
    const hoursToUpdate: { id: string; task_id: string }[] = [];
    
    unassignedHours.forEach((h: any) => {
      const workdayPhase = normalizeName(h.workday_phase || '');
      const workdayTask = normalizeName(h.workday_task || '');
      
      const phaseTaskKey = `${workdayPhase}|${workdayTask}`;
      let matchedTask = tasksByName.get(phaseTaskKey);
      
      if (!matchedTask && workdayTask) {
        matchedTask = tasksByName.get(workdayTask);
      }
      
      if (matchedTask) {
        hoursToUpdate.push({ id: h.id, task_id: matchedTask.id || matchedTask.taskId });
        tasksMatched++;
        return;
      }
      
      if (workdayPhase) {
        const matchedUnit = unitsByName.get(workdayPhase);
        if (matchedUnit) {
          hoursToUpdate.push({ id: h.id, task_id: matchedUnit.id || matchedUnit.unitId });
          unitsMatched++;
        }
      }
    });
    
    // Update matched hours
    for (const update of hoursToUpdate) {
      try {
        await query(
          'UPDATE hour_entries SET task_id = $1 WHERE id = $2',
          [update.task_id, update.id]
        );
      } catch (err) { console.error('Error updating hour entry:', err); }
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
