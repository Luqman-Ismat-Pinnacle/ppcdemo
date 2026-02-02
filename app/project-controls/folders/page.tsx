'use client';

/**
 * Project Plans Page
 * Upload MPP files, process with MPXJ, run auto project health checks, and sync to Supabase.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useData } from '@/lib/data-context';
import { useLogs } from '@/lib/logs-context';
import { createClient } from '@supabase/supabase-js';
import { convertMppParserOutput } from '@/lib/data-converter';
import { runProjectHealthAutoCheck, type ProjectHealthAutoResult, type HealthCheckResult } from '@/lib/project-health-auto-check';
import SearchableDropdown, { type DropdownOption } from '@/components/ui/SearchableDropdown';

// Health check recommendations based on check name
const healthRecommendations: Record<string, { description: string; fix: string }> = {
  'All Tasks Have Predecessors/Successors': {
    description: 'Tasks without logic links (predecessors or successors) can cause scheduling inaccuracies and prevent accurate critical path analysis.',
    fix: 'Open the MPP file in MS Project and add predecessor/successor relationships to all tasks. Use Finish-to-Start (FS) relationships as the default.'
  },
  'No Orphaned Tasks': {
    description: 'Orphaned tasks are disconnected from the schedule network, making it impossible to calculate their impact on the project timeline.',
    fix: 'Review all tasks and ensure they are connected to at least one other task via a predecessor or successor link.'
  },
  'Resources Assigned to Execution Tasks': {
    description: 'Execution tasks without resource assignments cannot be tracked for utilization or cost, affecting project forecasting accuracy.',
    fix: 'Assign appropriate resources to all execution-level tasks in MS Project. Use generic resources if specific names are not yet known.'
  },
  'Planned Effort Entered': {
    description: 'Tasks without planned hours/effort cannot be used for earned value calculations or resource loading analysis.',
    fix: 'Enter baseline hours (work) for all tasks. This should represent the estimated effort to complete each task.'
  },
  'Duration Reasonable': {
    description: 'Tasks without duration prevent proper timeline visualization and critical path calculation.',
    fix: 'Set appropriate durations for all tasks based on the planned work and resource availability.'
  },
  'No Tasks >100 hrs with Count = 1': {
    description: 'Large tasks (>100 hours) with a count of 1 are difficult to track progress accurately and may indicate tasks that should be broken down further.',
    fix: 'Break down large tasks into smaller, more manageable subtasks (ideally 40-80 hours each) or increase the count if the task represents multiple units of work.'
  },
  'Non-Execution ≤ 25% of Execution Hours': {
    description: 'When non-execution work (meetings, admin, etc.) exceeds 25% of execution work, it may indicate an inefficient project structure.',
    fix: 'Review non-execution tasks and consider if they can be reduced, consolidated, or handled outside the project scope.'
  },
};

interface ProcessingLog {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

interface UploadedFile {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: Date;
  workdayProjectId?: string;
  status: 'uploading' | 'uploaded' | 'processing' | 'syncing' | 'complete' | 'error';
  storagePath?: string;
  healthCheck?: ProjectHealthAutoResult;
}

// Supabase client for storage
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const STORAGE_BUCKET = 'project-documents';

export default function DocumentsPage() {
  const { refreshData, filteredData } = useData();
  const { addEngineLog } = useLogs();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Split projects by plan status (has_schedule / hasSchedule) for the plan-status container
  const { projectsWithPlan, projectsWithoutPlan } = useMemo(() => {
    const projects = filteredData?.projects || [];
    const withPlan = projects.filter((p: any) => p.has_schedule === true || p.hasSchedule === true);
    const withoutPlan = projects.filter((p: any) => !(p.has_schedule === true || p.hasSchedule === true));
    return { projectsWithPlan: withPlan, projectsWithoutPlan: withoutPlan };
  }, [filteredData?.projects]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [workdayProjectId, setWorkdayProjectId] = useState('');
  const [availableWorkdayProjects, setAvailableWorkdayProjects] = useState<DropdownOption[]>([]);
  const [loadingWorkdayProjects, setLoadingWorkdayProjects] = useState(false);
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const [expandedHealthFileId, setExpandedHealthFileId] = useState<string | null>(null);
  
  // Project selection modal state
  const [showHierarchyModal, setShowHierarchyModal] = useState(false);

  const addLog = useCallback((type: ProcessingLog['type'], message: string) => {
    setLogs(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      type,
      message,
    }]);
  }, []);

  // Load existing files from Supabase Storage on mount
  useEffect(() => {
    loadStoredFiles();
    loadWorkdayProjects();
  }, []);

  const loadWorkdayProjects = async () => {
    setLoadingWorkdayProjects(true);
    try {
      const response = await fetch('/api/workday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-available-projects' })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.workday_projects) {
          const options: DropdownOption[] = data.workday_projects.map((project: any) => ({
            id: project.id,
            name: project.name,
            secondary: project.secondary || project.type || 'Project'
          }));
          setAvailableWorkdayProjects(options);
        }
      }
    } catch (error) {
      console.error('Error loading Workday projects:', error);
      addLog('error', 'Failed to load available projects');
    } finally {
      setLoadingWorkdayProjects(false);
    }
  };

  const loadStoredFiles = async () => {
    if (!supabase) return;

    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list('mpp', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

      if (error) {
        console.error('Error loading files:', error);
        return;
      }

      if (data && data.length > 0) {
        const files: UploadedFile[] = data
          .filter(f => f.name.toLowerCase().endsWith('.mpp'))
          .map(f => ({
            id: f.id || f.name,
            fileName: f.name,
            fileSize: f.metadata?.size || 0,
            uploadedAt: new Date(f.created_at || Date.now()),
            status: 'uploaded' as const,
            storagePath: `mpp/${f.name}`,
          }));

        setUploadedFiles(files);
      }
    } catch (err) {
      console.error('Error loading stored files:', err);
    }
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.mpp')) {
      addLog('error', 'Please select a .mpp file');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      addLog('error', 'File size must be less than 100MB');
      return;
    }

    setSelectedFile(file);
    addLog('info', `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
  }, [addLog]);

  // Upload file to Supabase Storage
  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      addLog('error', 'No file selected');
      return;
    }

    if (!supabase) {
      addLog('error', 'Supabase not configured');
      return;
    }

    // Show hierarchy selection modal instead of prompts
    setShowHierarchyModal(true);
    return;
  }, [selectedFile, supabase, addLog, showHierarchyModal]);

  // Actual upload function after project selection
  const handleUploadWithHierarchy = useCallback(async () => {
    if (!selectedFile || !workdayProjectId) {
      addLog('error', 'Please select a Workday project');
      return;
    }

    if (!supabase) {
      addLog('error', 'Supabase not configured');
      return;
    }

    setShowHierarchyModal(false);
    setIsUploading(true);
    const fileId = `mpp-${Date.now()}`;
    const storagePath = `mpp/${Date.now()}_${selectedFile.name}`;

    // Collect logs so we can persist them to project_log
    const logEntries: ProcessingLog[] = [];
    const pushLog = (type: ProcessingLog['type'], message: string) => {
      const entry: ProcessingLog = { id: `${Date.now()}-${Math.random()}`, timestamp: new Date(), type, message };
      logEntries.push(entry);
      addLog(type, message);
    };

    // Add file to list with uploading status
    const fileRecord: UploadedFile = {
      id: fileId,
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      uploadedAt: new Date(),
      workdayProjectId: workdayProjectId.trim() || undefined,
      status: 'uploading',
      storagePath,
    };
    setUploadedFiles(prev => [...prev, fileRecord]);

    pushLog('info', `[Storage] Uploading ${selectedFile.name} to Supabase...`);
    pushLog('info', `[Project] Linking to Workday project: ${workdayProjectId}`);

    try {
      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        throw new Error(error.message);
      }

      const savedStoragePath = data.path ?? storagePath;
      pushLog('success', `[Storage] File uploaded: ${savedStoragePath}`);

      // Update file status (use path returned by Supabase so it matches DB for setCurrentMpp/updateDocumentHealth)
      setUploadedFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'uploaded' as const, storagePath: savedStoragePath } : f
      ));

      // Also save metadata to project_documents (use data.path so setCurrentMpp/updateDocumentHealth find the row)
      try {
        const docId = `DOC_${Date.now()}`;
        const docRes = await fetch('/api/data/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataKey: 'projectDocuments',
            records: [{
              id: docId,
              documentId: docId,
              projectId: workdayProjectId.trim() || null,
              name: selectedFile.name,
              fileName: selectedFile.name,
              fileType: 'mpp',
              fileSize: selectedFile.size,
              documentType: 'MPP',
              storagePath: savedStoragePath,
              storageBucket: STORAGE_BUCKET,
              uploadedAt: new Date().toISOString(),
              isActive: true,
            }],
          }),
        });
        const docResult = await docRes.json();
        if (docRes.ok && docResult.success) {
          pushLog('success', '[Database] Document metadata saved (project_id and storage_path)');
        } else {
          pushLog('warning', `[Database] Document save failed: ${docResult.error || 'Unknown'}`);
        }
      } catch (dbErr: any) {
        pushLog('warning', `[Database] Metadata save failed: ${dbErr.message}`);
      }

      // Persist upload logs to project_log (project_id can be null if FK fails; table allows it after migration)
      try {
        const logRecords = logEntries.map((e, i) => ({
          id: `LOG_${fileId}_${i}_${Date.now()}`,
          projectId: workdayProjectId.trim() || null,
          entryDate: e.timestamp.toISOString(),
          entryType: e.type,
          message: e.message,
          createdBy: 'Upload',
        }));
        if (logRecords.length > 0) {
          const logRes = await fetch('/api/data/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataKey: 'projectLog', records: logRecords }),
          });
          const logResult = await logRes.json();
          if (logRes.ok && logResult.success) {
            pushLog('success', `[Database] ${logRecords.length} log entries saved to project_log`);
          } else {
            pushLog('warning', `[Database] Log save failed: ${logResult.error || 'Unknown'}`);
          }
        }
      } catch (logErr: any) {
        pushLog('warning', `[Database] Log save failed: ${logErr.message}`);
      }

      // Reset form
      setSelectedFile(null);
      setWorkdayProjectId('');
      if (fileInputRef.current) fileInputRef.current.value = '';

    } catch (error: any) {
      pushLog('error', `[Storage] Upload failed: ${error.message}`);
      // Remove failed file from list
      setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
    } finally {
      setIsUploading(false);
    }
  }, [selectedFile, workdayProjectId, addLog]);

  // Persist process/upload logs to project_log (parser logs)
  const saveLogsToProjectLog = useCallback(async (entries: ProcessingLog[], projectId: string) => {
    if (entries.length === 0) return;
    try {
      const logRecords = entries.map((e, i) => ({
        id: `LOG_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 9)}`,
        projectId: projectId || null,
        entryDate: e.timestamp.toISOString(),
        entryType: e.type,
        message: e.message,
        createdBy: 'Project Upload',
      }));
      const res = await fetch('/api/data/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataKey: 'projectLog', records: logRecords }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        console.error('[project_log] Save failed:', result.error);
      }
    } catch (err) {
      console.error('[project_log] Save error:', err);
    }
  }, []);

  // Process file with MPXJ Python service and sync to Supabase
  const handleProcess = useCallback(async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file || !file.storagePath) return;

    setIsProcessing(true);

    setUploadedFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, status: 'processing' as const } : f
    ));

    const logEntries: ProcessingLog[] = [];
    const pushLog = (type: ProcessingLog['type'], message: string) => {
      const entry: ProcessingLog = { id: `${Date.now()}-${Math.random()}`, timestamp: new Date(), type, message };
      logEntries.push(entry);
      addLog(type, message);
    };

    try {
      // Step 1: Download file from Supabase Storage
      pushLog('info', `[Storage] Downloading ${file.fileName}...`);

      if (!supabase) {
        throw new Error('Supabase not configured');
      }

      const { data: fileData, error: downloadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(file.storagePath);

      if (downloadError || !fileData) {
        throw new Error(`Download failed: ${downloadError?.message || 'Unknown error'}`);
      }

      pushLog('success', '[Storage] File downloaded');

      // Step 2: Send to MPXJ Python parser
      pushLog('info', '[MPXJ] Parsing MPP file...');

      const formData = new FormData();
      formData.append('file', fileData, file.fileName);

      // Call the Python MPP parser service
      let MPP_PARSER_URL = process.env.NEXT_PUBLIC_MPP_PARSER_URL || 'http://localhost:5001';

      // Ensure protocol is present
      if (MPP_PARSER_URL !== 'http://localhost:5001' && !MPP_PARSER_URL.startsWith('http')) {
        MPP_PARSER_URL = `https://${MPP_PARSER_URL}`;
      }

      console.log('Hitting MPP Parser at:', `${MPP_PARSER_URL}/parse`);
      pushLog('info', `[Network] Service URL: ${MPP_PARSER_URL}/parse`);

      const parseResponse = await fetch(`${MPP_PARSER_URL}/parse`, {
        method: 'POST',
        body: formData,
      });

      if (!parseResponse.ok) {
        const errorText = await parseResponse.text();
        throw new Error(`MPXJ parse failed: ${errorText}`);
      }

      const parseResult = await parseResponse.json();

      if (!parseResult.success) {
        throw new Error(parseResult.error || 'Parse failed');
      }

      pushLog('success', `[MPXJ] Parsed: ${parseResult.summary?.total_rows || parseResult.summary?.total_tasks || 0} tasks`);
      console.log('[DEBUG] MPP Parser result:', {
        success: parseResult.success,
        tasks: parseResult.tasks?.length,
        sampleTask: parseResult.tasks?.[0],
        outlineLevels: parseResult.tasks?.map((t: any) => t.outline_level)
      });

      // Convert flat MPP data to proper hierarchy using our converter
      const timestamp = Date.now();
      const projectId = file.workdayProjectId || `PRJ_MPP_${timestamp}`;
      
      pushLog('info', `[Hierarchy] Converting MPP data with outline levels to phases/units/tasks...`);
      
      // Use our converter to properly categorize by outline_level
      console.log('[DEBUG] About to call convertMppParserOutput with', parseResult.tasks?.length, 'tasks');
      const convertedData = convertMppParserOutput(parseResult, projectId);
      console.log('[DEBUG] Converter returned:', {
        phases: convertedData.phases?.length,
        units: convertedData.units?.length,
        tasks: convertedData.tasks?.length
      });
      
      // Apply hierarchy context from upload selection
      // Phases and units get hierarchy through project relationship, not direct columns
      if (convertedData.phases) {
        convertedData.phases.forEach((phase: any) => {
          // No hierarchy columns on phases - they get it through project
        });
      }
      
      if (convertedData.units) {
        convertedData.units.forEach((unit: any) => {
          // No hierarchy columns on units - they get it through project/site relationship
        });
      }
      
      if (convertedData.tasks) {
        convertedData.tasks.forEach((task: any) => {
          // Tasks don't have hierarchy columns - they get it through project/phase/unit relationships
        });
      }
      
      pushLog('success', `[Hierarchy] Converted to ${convertedData.phases?.length || 0} phases, ${convertedData.units?.length || 0} units, ${convertedData.tasks?.length || 0} tasks`);

      // Auto project health check
      const healthResult = runProjectHealthAutoCheck(convertedData);
      pushLog(healthResult.issues.length > 0 ? 'warning' : 'success', `[Health] Score: ${healthResult.score}% (${healthResult.passed}/${healthResult.totalChecks})${healthResult.issues.length > 0 ? ` · Issues: ${healthResult.issues.join('; ')}` : ''}`);

      // Parser log: names from MPP so we can verify converter output vs Workday
      const phasesList = (convertedData.phases || []).map((p: any) => `"${p.id}: ${(p.name || '').slice(0, 50)}"`).join(', ');
      const unitsList = (convertedData.units || []).map((u: any) => `"${u.id}: ${(u.name || '').slice(0, 40)} (project: ${u.projectId || u.project_id || '-'})"`).join(', ');
      const taskSample = (convertedData.tasks || []).slice(0, 8).map((t: any) => `"${t.id}: ${(t.name || t.taskName || '').slice(0, 30)}"`).join(', ');
      pushLog('info', `[MPP Parser] Phases from file: ${phasesList || 'none'}`);
      pushLog('info', `[MPP Parser] Units from file: ${unitsList || 'none'}`);
      pushLog('info', `[MPP Parser] Tasks from file: ${(convertedData.tasks?.length || 0)} total; sample: ${taskSample || 'none'}`);

      // Step 3: Sync to Supabase
      setUploadedFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'syncing' as const } : f
      ));

      const projectName = parseResult.project?.name || file.fileName.replace('.mpp', '');

      pushLog('info', `[Hierarchy] Project ID: ${projectId} - ALL phases and tasks will be linked to this project`);

      // Create project
      if (!file.workdayProjectId) {
        const projectResponse = await fetch('/api/data/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataKey: 'projects',
            records: [{
              id: projectId,
              projectId: projectId,
              name: projectName,
              startDate: parseResult.project?.start_date || null,
              endDate: parseResult.project?.finish_date || null,
              isActive: true,
            }]
          }),
        });
        const projectResult = await projectResponse.json();
        if (!projectResponse.ok || !projectResult.success) {
          pushLog('warning', `[Supabase] Project: ${projectResult.error || 'Failed'}`);
        } else {
          pushLog('success', `[Supabase] Project created: ${projectId}`);
        }
      }

      // Sync converted data to Supabase using our proper hierarchy
      pushLog('info', '[Supabase] Syncing converted hierarchy data...');

      // Use existing Workday project ID - no need to create new project
      const existingProjectId = file.workdayProjectId;
      if (!existingProjectId) {
        throw new Error('No Workday project selected - cannot create hierarchy without project');
      }
      
      pushLog('info', `[Supabase] Using existing project: ${existingProjectId}`);

      // Always apply the file: same structure = update numbers; new structure = replace schedule.
      // (No duplicate skip so updated project plans with revised dates/hours/costs are applied.)

      // Update the existing project: has_schedule = true (direct update to avoid name constraint)
      pushLog('info', '[Supabase] Enabling schedule visibility for project...');
      try {
        const projectUpdateResponse = await fetch('/api/data/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataKey: 'projects',
            operation: 'update',
            records: [{
              id: existingProjectId,
              has_schedule: true,
              updated_at: new Date().toISOString()
            }]
          }),
        });
        const projectUpdateResult = await projectUpdateResponse.json();
        if (!projectUpdateResponse.ok || !projectUpdateResult.success) {
          pushLog('warning', `[Supabase] Project update: ${projectUpdateResult.error || 'Failed'}`);
        } else {
          pushLog('success', `[Supabase] Project updated: has_schedule=true`);
        }
      } catch (updateErr: any) {
        pushLog('warning', `[Supabase] Project update error: ${updateErr.message}`);
      }

      // Remove existing phases/units/tasks for this project so only MPP hierarchy remains (no Workday extras)
      pushLog('info', '[Supabase] Removing existing phases/units/tasks for this project...');
      for (const key of ['tasks', 'units', 'phases']) {
        try {
          const delRes = await fetch('/api/data/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataKey: key, operation: 'deleteByProjectId', projectId: existingProjectId, records: [] }),
          });
          const delResult = await delRes.json();
          if (!delRes.ok || !delResult.success) {
            pushLog('warning', `[Supabase] Delete existing ${key}: ${delResult.error || 'Failed'}`);
        } else {
            pushLog('success', `[Supabase] Cleared existing ${key} for project`);
          }
        } catch (e: any) {
          pushLog('warning', `[Supabase] Delete ${key} error: ${e.message}`);
        }
      }

      // Update all phases, units, and tasks with the existing project ID
      // Remove empty projectId to prevent conflict with project_id during sync
      if (convertedData.phases) {
        convertedData.phases.forEach((phase: any) => {
          delete phase.projectId; // Remove camelCase version to avoid conflict
          phase.project_id = existingProjectId;
        });
      }
      if (convertedData.units) {
        convertedData.units.forEach((unit: any) => {
          delete unit.projectId; // Remove camelCase version to avoid conflict
          unit.project_id = existingProjectId;
        });
      }
      if (convertedData.tasks) {
        convertedData.tasks.forEach((task: any) => {
          delete task.projectId; // Remove camelCase version to avoid conflict
          task.project_id = existingProjectId;
        });
      }

      // Sync phases
      if (convertedData.phases && convertedData.phases.length > 0) {
        const phaseResponse = await fetch('/api/data/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataKey: 'phases',
            records: convertedData.phases,
          }),
        });
        const phaseResult = await phaseResponse.json();
        if (!phaseResponse.ok || !phaseResult.success) {
          pushLog('warning', `[Supabase] Phases: ${phaseResult.error || 'Failed'}`);
        } else {
          pushLog('success', `[Supabase] Phases synced: ${convertedData.phases.length}`);
        }
      }

      // Sync units
      if (convertedData.units && convertedData.units.length > 0) {
        const unitResponse = await fetch('/api/data/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataKey: 'units',
            records: convertedData.units,
          }),
        });
        const unitResult = await unitResponse.json();
        if (!unitResponse.ok || !unitResult.success) {
          pushLog('warning', `[Supabase] Units: ${unitResult.error || 'Failed'}`);
        } else {
          pushLog('success', `[Supabase] Units synced: ${convertedData.units.length}`);
        }
      }

      // Sync tasks
      if (convertedData.tasks && convertedData.tasks.length > 0) {
        const taskResponse = await fetch('/api/data/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataKey: 'tasks',
            records: convertedData.tasks,
          }),
        });
        const taskResult = await taskResponse.json();
        if (!taskResponse.ok || !taskResult.success) {
          pushLog('warning', `[Supabase] Tasks: ${taskResult.error || 'Failed'}`);
        } else {
          pushLog('success', `[Supabase] Tasks synced: ${convertedData.tasks.length}`);
        }
      }

      // Mark this file as the current version for the project in the Documents folder
      try {
        const setCurrentRes = await fetch('/api/data/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataKey: 'projectDocuments',
            operation: 'setCurrentMpp',
            projectId: existingProjectId,
            storagePath: file.storagePath,
          }),
        });
        const setCurrentResult = await setCurrentRes.json();
        if (setCurrentRes.ok && setCurrentResult.success) {
          pushLog('success', '[Documents] File marked as current version for this project.');
        } else {
          pushLog('warning', `[Documents] Could not set current version: ${setCurrentResult.error || 'Unknown'}`);
        }
      } catch (e: any) {
        pushLog('warning', `[Documents] Set current version failed: ${e.message}`);
      }

      // Save health score and health_check_json to project_documents (by storage_path)
      try {
        const healthRes = await fetch('/api/data/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataKey: 'projectDocuments',
            operation: 'updateDocumentHealth',
            storagePath: file.storagePath,
            healthScore: healthResult.score,
            healthCheckJson: {
              score: healthResult.score,
              passed: healthResult.passed,
              totalChecks: healthResult.totalChecks,
              issues: healthResult.issues,
            },
          }),
        });
        const healthResultJson = await healthRes.json();
        if (healthRes.ok && healthResultJson.success) {
          pushLog('success', '[Documents] Health score and parser result saved to project_documents.');
        } else {
          pushLog('warning', `[Documents] Health save failed: ${healthResultJson.error || 'Unknown'}`);
        }
      } catch (healthErr: any) {
        pushLog('warning', `[Documents] Health save failed: ${healthErr.message}`);
      }

      // Persist process logs to project_log
      await saveLogsToProjectLog(logEntries, existingProjectId);

      // Complete the process
      pushLog('success', '[Complete] MPP file processed and hierarchy imported successfully');
      setUploadedFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'complete' as const, healthCheck: healthResult } : f
      ));
      
      // Save logs to System Health dropdown
      const logLines = logEntries.map(e => `[${e.timestamp.toLocaleTimeString()}] ${e.type.toUpperCase()}: ${e.message}`);
      addEngineLog('ProjectPlan', logLines, { executionTimeMs: Date.now() - Date.parse(logEntries[0]?.timestamp.toISOString() || new Date().toISOString()) });
      
      await refreshData();

    } catch (err: any) {
      pushLog('error', `[Process] Error: ${err.message}`);
      setUploadedFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'error' as const } : f
      ));
    } finally {
      setIsProcessing(false);
    }
  }, [uploadedFiles, addLog, refreshData, saveLogsToProjectLog]);

  // Delete file from Supabase Storage
  const handleDelete = useCallback(async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file) return;

    // Delete the file from storage
    if (file.storagePath && supabase) {
      addLog('info', `[Storage] Deleting ${file.fileName}...`);

      try {
        const { error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([file.storagePath]);

        if (error) {
          addLog('error', `[Storage] Delete failed: ${error.message}`);
          return;
        }

        addLog('success', '[Storage] File deleted');
      } catch (err: any) {
        addLog('error', `[Storage] Delete error: ${err.message}`);
        return;
      }
    }

    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
    
    // Refresh data to update WBS and other views
    await refreshData();
    
    addLog('success', '[Complete] File deleted');
  }, [uploadedFiles, addLog, refreshData]);

  return (
    <div className="page-panel">
      <div className="page-header">
        <h1 className="page-title">Project Plans</h1>
      </div>

      <div className="dashboard-grid" style={{ gap: '1.5rem' }}>

        {/* Project plan status: how many have a plan, which do / don't */}
        <div className="chart-card grid-full">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Project plan status</h3>
          </div>
          <div className="chart-card-body" style={{ padding: '1.25rem 1.5rem' }}>
            <p style={{ marginBottom: '1rem', fontSize: '0.9375rem', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{projectsWithPlan.length}</strong> project{projectsWithPlan.length !== 1 ? 's' : ''} have a plan
              {' · '}
              <strong style={{ color: 'var(--text-primary)' }}>{projectsWithoutPlan.length}</strong> project{projectsWithoutPlan.length !== 1 ? 's' : ''} don&apos;t
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--pinnacle-teal)', marginBottom: '0.5rem' }}>
                  With plan ({projectsWithPlan.length})
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--text-secondary)', maxHeight: '180px', overflowY: 'auto' }}>
                  {projectsWithPlan.length === 0 ? (
                    <li style={{ listStyle: 'none', paddingLeft: 0, color: 'var(--text-muted)' }}>None</li>
                  ) : (
                    projectsWithPlan.map((p: any) => (
                      <li key={p.id || p.projectId}>{p.name || p.projectId || p.id}</li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Without plan ({projectsWithoutPlan.length})
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--text-secondary)', maxHeight: '180px', overflowY: 'auto' }}>
                  {projectsWithoutPlan.length === 0 ? (
                    <li style={{ listStyle: 'none', paddingLeft: 0, color: 'var(--text-muted)' }}>None</li>
                  ) : (
                    projectsWithoutPlan.map((p: any) => (
                      <li key={p.id || p.projectId}>{p.name || p.projectId || p.id}</li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* File Upload */}
        <div className="chart-card grid-full">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Upload MPP File</h3>
          </div>
          <div className="chart-card-body" style={{ padding: '1.5rem' }}>
            <div style={{ maxWidth: '500px', margin: '0 auto' }}>
              
              {/* File Selection */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>
                  Select MPP File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mpp"
                  onChange={handleFileSelect}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px dashed var(--border-color)',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                />
                {selectedFile && (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{selectedFile.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Upload Button */}
            <div style={{ marginTop: '1.5rem' }}>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                style={{
                  width: '100%',
                  padding: '0.75rem 1.5rem',
                  backgroundColor: selectedFile && !isUploading ? 'var(--pinnacle-teal)' : 'var(--bg-tertiary)',
                  border: 'none',
                  borderRadius: '6px',
                  color: selectedFile && !isUploading ? '#000' : 'var(--text-muted)',
                  cursor: selectedFile && !isUploading ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                {isUploading ? 'Uploading...' : 'Upload MPP File'}
              </button>
            </div>
          </div>
        </div>

        {/* Uploaded Files */}
        <div className="chart-card grid-full">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Files ({uploadedFiles.length})</h3>
            <button
              onClick={loadStoredFiles}
              style={{ padding: '0.25rem 0.75rem', backgroundColor: 'var(--bg-tertiary)', border: 'none', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
            >
              Refresh
            </button>
          </div>
          <div className="chart-card-body" style={{ padding: '1rem' }}>
            {uploadedFiles.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                No files in storage. Upload an MPP file above.
              </div>
            ) : (
              <table className="data-table" style={{ fontSize: '0.875rem' }}>
                <thead>
                  <tr>
                    <th>File Name</th>
                    <th>Size</th>
                    <th>Project ID</th>
                    <th>Health Score</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadedFiles.map((file) => {
                    const isCurrentVersion = filteredData?.projectDocuments?.some(
                      (d: any) =>
                        (d.storagePath === file.storagePath || d.storage_path === file.storagePath) &&
                        (d.isCurrentVersion === true || d.is_current_version === true)
                    );
                    return (
                    <tr key={file.id}>
                      <td>
                        {file.fileName}
                        {isCurrentVersion && (
                          <span
                            style={{
                              marginLeft: '0.5rem',
                              fontSize: '0.7rem',
                              padding: '0.15rem 0.4rem',
                              backgroundColor: 'var(--pinnacle-teal)',
                              color: '#000',
                              borderRadius: '4px',
                              fontWeight: 500,
                            }}
                          >
                            Current version
                          </span>
                        )}
                      </td>
                      <td>{(file.fileSize / 1024 / 1024).toFixed(2)} MB</td>
                      <td>{file.workdayProjectId || '-'}</td>
                      <td>
                        {file.healthCheck ? (
                          <span
                            onClick={() => setExpandedHealthFileId(expandedHealthFileId === file.id ? null : file.id)}
                            style={{
                              cursor: 'pointer',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: file.healthCheck.score >= 80 ? 'rgba(16,185,129,0.2)' : file.healthCheck.score >= 50 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)',
                              color: file.healthCheck.score >= 80 ? '#10B981' : file.healthCheck.score >= 50 ? '#F59E0B' : '#EF4444',
                              fontWeight: 600,
                              fontSize: '0.8rem',
                            }}
                            title={file.healthCheck.issues.join('\n') || 'All checks passed'}
                          >
                            {file.healthCheck.score}%
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge badge-${file.status === 'complete' ? 'success' :
                            file.status === 'uploading' || file.status === 'processing' || file.status === 'syncing' ? 'warning' :
                              file.status === 'error' ? 'error' : 'secondary'
                            }`}
                        >
                          {file.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => handleProcess(file.id)}
                            disabled={isProcessing || file.status === 'uploading' || file.status === 'processing' || file.status === 'syncing'}
                            style={{
                              padding: '0.25rem 0.75rem',
                              backgroundColor: (file.status === 'uploaded' || file.status === 'error' || file.status === 'complete') ? 'var(--pinnacle-teal)' : 'var(--bg-tertiary)',
                              color: (file.status === 'uploaded' || file.status === 'error' || file.status === 'complete') ? '#000' : 'var(--text-muted)',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              cursor: (file.status === 'uploading' || file.status === 'processing' || file.status === 'syncing') ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {file.status === 'processing' ? 'Processing...' :
                              file.status === 'syncing' ? 'Syncing...' :
                                file.status === 'complete' ? 'Re-run MPXJ' : 'Run MPXJ'}
                          </button>
                          <button
                            onClick={() => handleDelete(file.id)}
                            disabled={file.status === 'uploading' || file.status === 'processing' || file.status === 'syncing'}
                            style={{
                              padding: '0.25rem 0.75rem',
                              backgroundColor: 'var(--bg-tertiary)',
                              color: 'var(--error-color)',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              cursor: file.status === 'uploading' || file.status === 'processing' || file.status === 'syncing' ? 'not-allowed' : 'pointer',
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            )}
            {expandedHealthFileId && (() => {
              const file = uploadedFiles.find((f) => f.id === expandedHealthFileId);
              const h = file?.healthCheck;
              if (!file || !h) return null;
              const failedChecks = h.results.filter(r => !r.passed);
              return (
                <div style={{ marginTop: '1rem', padding: '1.25rem', background: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <strong style={{ fontSize: '1rem' }}>Project Health Analysis: {file.fileName}</strong>
                    <button onClick={() => setExpandedHealthFileId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem' }}>×</button>
                  </div>
                  
                  {/* Score Summary */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '1.5rem', 
                    padding: '1rem', 
                    background: h.score >= 80 ? 'rgba(16,185,129,0.1)' : h.score >= 50 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                    borderRadius: '6px',
                    marginBottom: '1.25rem',
                    border: `1px solid ${h.score >= 80 ? 'rgba(16,185,129,0.3)' : h.score >= 50 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`
                  }}>
                    <div style={{ 
                      fontSize: '2.5rem', 
                      fontWeight: 700, 
                      color: h.score >= 80 ? '#10B981' : h.score >= 50 ? '#F59E0B' : '#EF4444' 
                    }}>
                      {h.score}%
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        {h.score >= 80 ? 'Good Health' : h.score >= 50 ? 'Needs Improvement' : 'Critical Issues'}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {h.passed} of {h.totalChecks} checks passed
                      </div>
                    </div>
                  </div>

                  {/* All Checks Status */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      All Checks
                    </div>
                    <div style={{ display: 'grid', gap: '6px' }}>
                      {h.results.map((r, idx) => (
                        <div key={idx} style={{ 
                          display: 'flex', 
                          alignItems: 'flex-start', 
                          gap: '10px', 
                          padding: '8px 12px',
                          background: r.passed ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
                          borderRadius: '4px',
                          borderLeft: `3px solid ${r.passed ? '#10B981' : '#EF4444'}`
                        }}>
                          <span style={{ fontSize: '1rem', flexShrink: 0 }}>{r.passed ? '✓' : '✗'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>{r.checkName}</div>
                            {r.message && <div style={{ fontSize: '0.8rem', color: r.passed ? 'var(--text-muted)' : '#F59E0B', marginTop: '2px' }}>{r.message}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommendations Section - Only show if there are failed checks */}
                  {failedChecks.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#F59E0B', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 16v-4M12 8h.01" />
                        </svg>
                        Recommendations to Improve Health Score
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {failedChecks.map((check, idx) => {
                          const rec = healthRecommendations[check.checkName];
                          if (!rec) return null;
                          return (
                            <div key={idx} style={{ 
                              padding: '12px 14px', 
                              background: 'var(--bg-secondary)', 
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)'
                            }}>
                              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '6px' }}>
                                {check.checkName}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                {rec.description}
                              </div>
                              <div style={{ 
                                fontSize: '0.8rem', 
                                color: 'var(--pinnacle-teal)', 
                                padding: '8px 10px', 
                                background: 'rgba(64,224,208,0.08)', 
                                borderRadius: '4px',
                                borderLeft: '3px solid var(--pinnacle-teal)'
                              }}>
                                <strong>How to fix:</strong> {rec.fix}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* Success message when all checks pass */}
                  {failedChecks.length === 0 && (
                    <div style={{ 
                      padding: '1rem', 
                      background: 'rgba(16,185,129,0.08)', 
                      borderRadius: '6px', 
                      border: '1px solid rgba(16,185,129,0.2)',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>🎉</div>
                      <div style={{ fontWeight: 600, color: '#10B981', fontSize: '0.9rem' }}>All health checks passed!</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        This project plan follows best practices and is ready for execution tracking.
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Processing Logs */}
        <div className="chart-card grid-full">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Log</h3>
            <button
              onClick={() => setLogs([])}
              style={{ padding: '0.25rem 0.75rem', backgroundColor: 'var(--bg-tertiary)', border: 'none', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
            >
              Clear
            </button>
          </div>
          <div className="chart-card-body" style={{ padding: '1rem', maxHeight: '300px', overflowY: 'auto', backgroundColor: 'var(--bg-secondary)' }}>
            {logs.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem', fontFamily: 'monospace' }}>
                Ready
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {logs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      padding: '0.3rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: log.type === 'error' ? 'rgba(255, 99, 71, 0.15)' :
                        log.type === 'success' ? 'rgba(64, 224, 208, 0.15)' :
                          log.type === 'warning' ? 'rgba(255, 193, 7, 0.15)' : 'transparent',
                      display: 'flex',
                      gap: '0.5rem',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)', minWidth: '70px', fontSize: '0.7rem' }}>
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <span style={{
                      color: log.type === 'error' ? '#ff6347' :
                        log.type === 'success' ? 'var(--pinnacle-teal)' :
                          log.type === 'warning' ? '#ffc107' : 'var(--text-primary)',
                    }}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Hierarchy Selection Modal */}
      {showHierarchyModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'var(--bg-primary)',
            padding: '2rem',
            borderRadius: '8px',
            minWidth: '400px',
            maxWidth: '500px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          }}>
            <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>
              Select Workday Project for MPP Upload
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Workday Project *
                </label>
                <SearchableDropdown
                  value={workdayProjectId || null}
                  options={availableWorkdayProjects}
                  onChange={(id) => setWorkdayProjectId(id || '')}
                  placeholder="Select a Workday project..."
                  disabled={loadingWorkdayProjects}
                  searchable={true}
                  width="100%"
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                  The MPP schedule will be linked to this project. Customer and site info comes from Workday.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowHierarchyModal(false);
                  setWorkdayProjectId('');
                }}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleUploadWithHierarchy}
                disabled={!workdayProjectId}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: workdayProjectId ? 'var(--pinnacle-teal)' : 'var(--bg-tertiary)',
                  border: 'none',
                  borderRadius: '4px',
                  color: workdayProjectId ? '#000' : 'var(--text-muted)',
                  cursor: workdayProjectId ? 'pointer' : 'not-allowed',
                }}
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
