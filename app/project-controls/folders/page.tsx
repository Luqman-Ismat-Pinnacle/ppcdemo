'use client';

/**
 * MPP File Import Page
 * 
 * Upload Microsoft Project files to Supabase Storage,
 * process with MPXJ, and sync extracted data to Supabase.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useData } from '@/lib/data-context';
import { createClient } from '@supabase/supabase-js';

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
}

// Supabase client for storage
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const STORAGE_BUCKET = 'project-documents';

export default function DocumentsPage() {
  const { refreshData } = useData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [workdayProjectId, setWorkdayProjectId] = useState('');
  const [logs, setLogs] = useState<ProcessingLog[]>([]);

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
  }, []);

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

    setIsUploading(true);
    const fileId = `mpp-${Date.now()}`;
    const storagePath = `mpp/${Date.now()}_${selectedFile.name}`;

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

    addLog('info', `[Storage] Uploading ${selectedFile.name} to Supabase...`);

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

      addLog('success', `[Storage] File uploaded: ${data.path}`);

      // Update file status
      setUploadedFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'uploaded' as const, storagePath: data.path } : f
      ));

      // Also save metadata to project_documents table
      try {
        const docId = `DOC_${Date.now()}`;
        await fetch('/api/data/sync', {
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
              storagePath: storagePath,
              storageBucket: STORAGE_BUCKET,
              uploadedAt: new Date().toISOString(),
              isActive: true,
            }],
          }),
        });
        addLog('success', '[Database] Document metadata saved');
      } catch (dbErr: any) {
        addLog('warning', `[Database] Metadata save failed: ${dbErr.message}`);
      }

      // Reset form
      setSelectedFile(null);
      setWorkdayProjectId('');
      if (fileInputRef.current) fileInputRef.current.value = '';

    } catch (error: any) {
      addLog('error', `[Storage] Upload failed: ${error.message}`);
      // Remove failed file from list
      setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
    } finally {
      setIsUploading(false);
    }
  }, [selectedFile, workdayProjectId, addLog]);

  // Process file with MPXJ Python service and sync to Supabase
  const handleProcess = useCallback(async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file || !file.storagePath) return;

    setIsProcessing(true);

    setUploadedFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, status: 'processing' as const } : f
    ));

    try {
      // Step 1: Download file from Supabase Storage
      addLog('info', `[Storage] Downloading ${file.fileName}...`);

      if (!supabase) {
        throw new Error('Supabase not configured');
      }

      const { data: fileData, error: downloadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(file.storagePath);

      if (downloadError || !fileData) {
        throw new Error(`Download failed: ${downloadError?.message || 'Unknown error'}`);
      }

      addLog('success', '[Storage] File downloaded');

      // Step 2: Send to MPXJ Python parser
      addLog('info', '[MPXJ] Parsing MPP file...');

      const formData = new FormData();
      formData.append('file', fileData, file.fileName);

      // Call the Python MPP parser service
      let MPP_PARSER_URL = process.env.NEXT_PUBLIC_MPP_PARSER_URL || 'http://localhost:5001';

      // Ensure protocol is present
      if (MPP_PARSER_URL !== 'http://localhost:5001' && !MPP_PARSER_URL.startsWith('http')) {
        MPP_PARSER_URL = `https://${MPP_PARSER_URL}`;
      }

      console.log('Hitting MPP Parser at:', `${MPP_PARSER_URL}/parse`);
      addLog('info', `[Network] Service URL: ${MPP_PARSER_URL}/parse`);

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

      addLog('success', `[MPXJ] Parsed: ${parseResult.summary.total_phases} phases, ${parseResult.summary.total_tasks} tasks, ${parseResult.summary.total_resources} resources`);

      // Step 3: Sync to Supabase
      setUploadedFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'syncing' as const } : f
      ));

      const timestamp = Date.now();
      const projectId = file.workdayProjectId || `PRJ_MPP_${timestamp}`;
      const projectName = parseResult.project?.name || file.fileName.replace('.mpp', '');

      addLog('info', `[Hierarchy] Project ID: ${projectId} - ALL phases and tasks will be linked to this project`);

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
          addLog('warning', `[Supabase] Project: ${projectResult.error || 'Failed'}`);
        } else {
          addLog('success', `[Supabase] Project created: ${projectId}`);
        }
      }

      // Build phase map for hierarchy - phases are summary tasks at outline level 1
      // All tasks in this file belong to this project
      const phases = parseResult.phases || [];
      const tasks = parseResult.tasks || [];
      const phaseIdMap: Record<string, string> = {};
      const phaseByWbsPrefix: Record<string, string> = {};

      // Create a default phase if no phases in the file
      let defaultPhaseId = `PHS_${timestamp}_default`;

      if (phases.length === 0) {
        // No explicit phases - create one default phase for all tasks
        addLog('info', '[Hierarchy] No phases found - creating default phase');
        await fetch('/api/data/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataKey: 'phases',
            records: [{
              id: defaultPhaseId,
              phaseId: defaultPhaseId,
              projectId: projectId,
              name: projectName + ' - Tasks',
              sequence: 1,
              isActive: true,
            }]
          }),
        });
        addLog('success', `[Supabase] Default phase created: ${defaultPhaseId}`);
      } else {
        // Create phases and build WBS prefix map for task assignment
        const phaseRecords = phases.map((p: any, idx: number) => {
          const phaseId = `PHS_${timestamp}_${p.id || idx}`;
          phaseIdMap[p.id] = phaseId;

          // Map WBS prefix to phase (e.g., "1" -> phaseId for tasks like "1.1", "1.2")
          if (p.wbs) {
            const wbsPrefix = p.wbs.split('.')[0];
            phaseByWbsPrefix[wbsPrefix] = phaseId;
          }

          return {
            id: phaseId,
            phaseId: phaseId,
            projectId: projectId,
            name: p.name,
            sequence: idx + 1,
            percentComplete: p.percent_complete || 0,
            baselineStartDate: p.baseline_start || null,
            baselineEndDate: p.baseline_finish || null,
            startDate: p.start_date || null,
            endDate: p.finish_date || null,
            isActive: true,
          };
        });

        addLog('info', `[Hierarchy] Creating ${phaseRecords.length} phases under project ${projectId}`);

        const phasesResponse = await fetch('/api/data/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataKey: 'phases', records: phaseRecords }),
        });
        const phasesResult = await phasesResponse.json();
        addLog(phasesResponse.ok && phasesResult.success ? 'success' : 'warning',
          `[Supabase] Phases synced: ${phasesResult.count || phaseRecords.length} (project_id: ${projectId})`);

        // Set default phase to first one
        defaultPhaseId = Object.values(phaseIdMap)[0] || defaultPhaseId;
      }

      addLog('info', `[Hierarchy] WBS prefix map: ${JSON.stringify(phaseByWbsPrefix)}`);

      // Sync tasks - assign to correct phase based on hierarchy
      // Priority: 1) phase_ancestor_id from parser, 2) WBS prefix match, 3) default phase
      if (tasks.length > 0) {
        const taskRecords = tasks.map((t: any, idx: number) => {
          let taskPhaseId = defaultPhaseId;

          // First try: use phase_ancestor_id from parser (walks parent chain to find phase)
          if (t.phase_ancestor_id && phaseIdMap[t.phase_ancestor_id]) {
            taskPhaseId = phaseIdMap[t.phase_ancestor_id];
          }
          // Second try: WBS prefix matching
          else if (t.wbs) {
            const wbsPrefix = t.wbs.split('.')[0];
            if (phaseByWbsPrefix[wbsPrefix]) {
              taskPhaseId = phaseByWbsPrefix[wbsPrefix];
            }
          }
          // Third try: outline_number prefix
          else if (t.outline_number) {
            const outlinePrefix = t.outline_number.split('.')[0];
            if (phaseByWbsPrefix[outlinePrefix]) {
              taskPhaseId = phaseByWbsPrefix[outlinePrefix];
            }
          }

          return {
            id: `TSK_${timestamp}_${t.id || idx}`,
            taskId: `TSK_${timestamp}_${t.id || idx}`,
            projectId: projectId,
            phaseId: taskPhaseId,
            name: t.name,
            wbsCode: t.wbs || t.outline_number || `${idx + 1}`,
            status: t.percent_complete >= 100 ? 'Complete' : t.percent_complete > 0 ? 'In Progress' : 'Not Started',
            percentComplete: t.percent_complete || 0,
            baselineStartDate: t.baseline_start || null,
            baselineEndDate: t.baseline_finish || null,
            startDate: t.start_date || null,
            endDate: t.finish_date || null,
            actualStartDate: t.actual_start || null,
            actualEndDate: t.actual_finish || null,
            baselineHours: t.work || 0,
            actualHours: t.actual_work || 0,
            remainingHours: t.remaining_work || 0,
            baselineCost: t.cost || 0,
            actualCost: t.actual_cost || 0,
            isMilestone: t.is_milestone || false,
            notes: t.notes || null,
          };
        });

        addLog('info', `[Hierarchy] Creating ${taskRecords.length} tasks under project ${projectId}`);

        const tasksResponse = await fetch('/api/data/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataKey: 'tasks', records: taskRecords }),
        });
        const tasksResult = await tasksResponse.json();
        addLog(tasksResponse.ok && tasksResult.success ? 'success' : 'warning',
          `[Supabase] Tasks synced: ${tasksResult.count || taskRecords.length} (project_id: ${projectId})`);
      }

      // Refresh app data
      addLog('info', '[App] Refreshing data...');
      await refreshData();
      addLog('success', '[App] Data refreshed');

      // Done
      setUploadedFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'complete' as const } : f
      ));

      addLog('success', `Complete: ${file.fileName} - ${phases.length} phases, ${tasks.length} tasks`);

    } catch (error: any) {
      addLog('error', `Processing failed: ${error.message}`);
      setUploadedFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'error' as const } : f
      ));
    } finally {
      setIsProcessing(false);
    }
  }, [uploadedFiles, addLog, refreshData]);

  // Delete file from Supabase Storage
  const handleDelete = useCallback(async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file) return;

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
  }, [uploadedFiles, addLog]);

  return (
    <div className="page-panel">
      <div className="page-header">
        <h1 className="page-title">MPP File Import</h1>
      </div>

      <div className="dashboard-grid" style={{ gap: '1.5rem' }}>

        {/* File Upload */}
        <div className="chart-card grid-half">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Select MPP File</h3>
          </div>
          <div className="chart-card-body" style={{ padding: '1.5rem' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mpp"
              onChange={handleFileSelect}
              style={{
                width: '100%',
                padding: '1rem',
                border: '2px dashed var(--border-color)',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-secondary)',
                cursor: 'pointer',
              }}
            />
            {selectedFile && (
              <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <strong>{selectedFile.name}</strong>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Workday Project ID & Upload */}
        <div className="chart-card grid-half">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Workday Project</h3>
          </div>
          <div className="chart-card-body" style={{ padding: '1.5rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>
                Workday Project ID
              </label>
              <input
                type="text"
                value={workdayProjectId}
                onChange={(e) => setWorkdayProjectId(e.target.value)}
                placeholder="e.g., PRJ-123456"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <button
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
              style={{
                width: '100%',
                padding: '1rem',
                backgroundColor: selectedFile && !isUploading ? 'var(--pinnacle-teal)' : 'var(--bg-tertiary)',
                color: selectedFile && !isUploading ? '#000' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: selectedFile && !isUploading ? 'pointer' : 'not-allowed',
              }}
            >
              {isUploading ? 'Uploading to Supabase...' : 'Upload to Storage'}
            </button>
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
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadedFiles.map((file) => (
                    <tr key={file.id}>
                      <td>{file.fileName}</td>
                      <td>{(file.fileSize / 1024 / 1024).toFixed(2)} MB</td>
                      <td>{file.workdayProjectId || '-'}</td>
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
                            disabled={isProcessing || file.status === 'uploading' || file.status === 'processing' || file.status === 'syncing' || file.status === 'complete'}
                            style={{
                              padding: '0.25rem 0.75rem',
                              backgroundColor: file.status === 'uploaded' || file.status === 'error' ? 'var(--pinnacle-teal)' : 'var(--bg-tertiary)',
                              color: file.status === 'uploaded' || file.status === 'error' ? '#000' : 'var(--text-muted)',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              cursor: file.status === 'uploaded' || file.status === 'error' ? 'pointer' : 'not-allowed',
                            }}
                          >
                            {file.status === 'processing' ? 'Processing...' :
                              file.status === 'syncing' ? 'Syncing...' :
                                'Run MPXJ'}
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
                  ))}
                </tbody>
              </table>
            )}
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
    </div>
  );
}
