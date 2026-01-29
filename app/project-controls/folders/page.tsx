'use client';

/**
 * MPP File Import Page
 * 
 * Upload Microsoft Project files to Supabase Storage,
 * process with MPXJ, and sync extracted data to Supabase.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useData } from '@/lib/data-context';
import { createClient } from '@supabase/supabase-js';
import { convertMppParserOutput } from '@/lib/data-converter';
import SearchableDropdown, { type DropdownOption } from '@/components/ui/SearchableDropdown';

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
  portfolioId?: string;
  customerId?: string;
  siteId?: string;
}

// Supabase client for storage
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const STORAGE_BUCKET = 'project-documents';

export default function DocumentsPage() {
  const { refreshData, filteredData } = useData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [workdayProjectId, setWorkdayProjectId] = useState('');
  const [availableWorkdayProjects, setAvailableWorkdayProjects] = useState<DropdownOption[]>([]);
  const [loadingWorkdayProjects, setLoadingWorkdayProjects] = useState(false);
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  
  // Hierarchy selection state
  const [selectedPortfolio, setSelectedPortfolio] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [showHierarchyModal, setShowHierarchyModal] = useState(false);

  // Convert data to DropdownOption format
  const portfolioOptions = useMemo(() => 
    filteredData.portfolios?.map((portfolio: any) => ({
      id: portfolio.id,
      name: portfolio.name,
      secondary: 'Portfolio',
      type: 'portfolio'
    })) || [], [filteredData.portfolios]);

  const customerOptions = useMemo(() => 
    filteredData.customers
      ?.filter((customer: any) => !selectedPortfolio || customer.portfolioId === selectedPortfolio)
      ?.map((customer: any) => ({
        id: customer.id,
        name: customer.name,
        secondary: 'Customer',
        type: 'customer'
      })) || [], [filteredData.customers, selectedPortfolio]);

  const siteOptions = useMemo(() => 
    filteredData.sites
      ?.filter((site: any) => !selectedCustomer || site.customerId === selectedCustomer)
      ?.map((site: any) => ({
        id: site.id,
        name: site.name,
        secondary: 'Site',
        type: 'site'
      })) || [], [filteredData.sites, selectedCustomer]);

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

  // Actual upload function after hierarchy selection
  const handleUploadWithHierarchy = useCallback(async () => {
    if (!selectedFile || !selectedPortfolio || !selectedCustomer || !selectedSite) {
      addLog('error', 'Please select portfolio, customer, and site');
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

    // Add file to list with uploading status and hierarchy info
    const fileRecord: UploadedFile = {
      id: fileId,
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      uploadedAt: new Date(),
      workdayProjectId: workdayProjectId.trim() || undefined,
      status: 'uploading',
      storagePath,
      portfolioId: selectedPortfolio,
      customerId: selectedCustomer,
      siteId: selectedSite,
    };
    setUploadedFiles(prev => [...prev, fileRecord]);

    addLog('info', `[Storage] Uploading ${selectedFile.name} to Supabase...`);
    addLog('info', `[Hierarchy] Portfolio: ${selectedPortfolio}, Customer: ${selectedCustomer}, Site: ${selectedSite}`);

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
  }, [selectedFile, workdayProjectId, selectedPortfolio, selectedCustomer, selectedSite, addLog]);

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

      addLog('success', `[MPXJ] Parsed: ${parseResult.summary?.total_rows || parseResult.summary?.total_tasks || 0} tasks`);
      console.log('[DEBUG] MPP Parser result:', {
        success: parseResult.success,
        tasks: parseResult.tasks?.length,
        sampleTask: parseResult.tasks?.[0],
        outlineLevels: parseResult.tasks?.map((t: any) => t.outline_level)
      });

      // Convert flat MPP data to proper hierarchy using our converter
      const timestamp = Date.now();
      const projectId = file.workdayProjectId || `PRJ_MPP_${timestamp}`;
      
      addLog('info', `[Hierarchy] Converting MPP data with outline levels to phases/units/tasks...`);
      
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
      
      addLog('success', `[Hierarchy] Converted to ${convertedData.phases?.length || 0} phases, ${convertedData.units?.length || 0} units, ${convertedData.tasks?.length || 0} tasks`);

      // Step 3: Sync to Supabase
      setUploadedFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'syncing' as const } : f
      ));

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
              portfolioId: file.portfolioId,
              customerId: file.customerId,
              siteId: file.siteId,
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

      // Sync converted data to Supabase using our proper hierarchy
      addLog('info', '[Supabase] Syncing converted hierarchy data...');

      // Use existing Workday project ID - no need to create new project
      const existingProjectId = file.workdayProjectId;
      if (!existingProjectId) {
        throw new Error('No Workday project selected - cannot create hierarchy without project');
      }
      
      addLog('info', `[Supabase] Using existing project: ${existingProjectId}`);

      // Create project mapping if Workday project is selected
      if (file.workdayProjectId) {
        addLog('info', '[Mapping] Creating MPP to Workday project mapping...');
        try {
          const mappingResponse = await fetch('/api/data/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dataKey: 'projectMappings',
              records: [{
                id: `MAP_${Date.now()}`,
                mppProjectId: existingProjectId,
                workdayProjectId: file.workdayProjectId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                deleted: false,
                createdBy: 'MPP Upload',
                notes: `Created during MPP upload: ${file.fileName}`
              }]
            }),
          });
          
          const mappingResult = await mappingResponse.json();
          if (!mappingResponse.ok || !mappingResult.success) {
            addLog('warning', `[Mapping] Failed to create mapping: ${mappingResult.error || 'Unknown error'}`);
          } else {
            addLog('success', `[Mapping] MPP project mapped to Workday: ${file.workdayProjectId}`);
          }
        } catch (mappingError: any) {
          addLog('warning', `[Mapping] Error creating mapping: ${mappingError.message}`);
        }
      }

      // Update the existing project to set has_schedule = true
      addLog('info', '[Supabase] Updating project has_schedule = true...');
      const updateProjectResponse = await fetch('/api/data/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataKey: 'projects',
          records: [{
            id: existingProjectId,
            has_schedule: true,
            updatedAt: new Date().toISOString(),
          }]
        }),
      });
      const updateProjectResult = await updateProjectResponse.json();
      if (!updateProjectResponse.ok || !updateProjectResult.success) {
        addLog('warning', `[Supabase] Project update: ${updateProjectResult.error || 'Failed'}`);
      } else {
        addLog('success', `[Supabase] Project has_schedule set to true`);
      }

      // Update all phases, units, and tasks with the existing project ID
      if (convertedData.phases) {
        convertedData.phases.forEach((phase: any) => {
          phase.project_id = existingProjectId;
        });
      }
      if (convertedData.units) {
        convertedData.units.forEach((unit: any) => {
          unit.project_id = existingProjectId;
        });
      }
      if (convertedData.tasks) {
        convertedData.tasks.forEach((task: any) => {
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
          addLog('warning', `[Supabase] Phases: ${phaseResult.error || 'Failed'}`);
        } else {
          addLog('success', `[Supabase] Phases synced: ${convertedData.phases.length}`);
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
          addLog('warning', `[Supabase] Units: ${unitResult.error || 'Failed'}`);
        } else {
          addLog('success', `[Supabase] Units synced: ${convertedData.units.length}`);
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
          addLog('warning', `[Supabase] Tasks: ${taskResult.error || 'Failed'}`);
        } else {
          addLog('success', `[Supabase] Tasks synced: ${convertedData.tasks.length}`);
        }
      }

      // Complete the process
      addLog('success', '[Complete] MPP file processed and hierarchy imported successfully');
      setUploadedFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'complete' as const } : f
      ));
      await refreshData();

    } catch (err: any) {
      addLog('error', `[Process] Error: ${err.message}`);
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
        <h1 className="page-title">MPP File Import</h1>
      </div>

      <div className="dashboard-grid" style={{ gap: '1.5rem' }}>

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
              Select Hierarchy for MPP Upload
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Portfolio *
                </label>
                <SearchableDropdown
                  value={selectedPortfolio || null}
                  options={portfolioOptions}
                  onChange={(id) => {
                    setSelectedPortfolio(id || '');
                    setSelectedCustomer(''); // Reset customer when portfolio changes
                    setSelectedSite(''); // Reset site when portfolio changes
                  }}
                  placeholder="Select Portfolio..."
                  searchable={true}
                  width="100%"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Customer *
                </label>
                <SearchableDropdown
                  value={selectedCustomer || null}
                  options={customerOptions}
                  onChange={(id) => {
                    setSelectedCustomer(id || '');
                    setSelectedSite(''); // Reset site when customer changes
                  }}
                  placeholder="Select Customer..."
                  searchable={true}
                  width="100%"
                  disabled={!selectedPortfolio}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Site *
                </label>
                <SearchableDropdown
                  value={selectedSite || null}
                  options={siteOptions}
                  onChange={(id) => setSelectedSite(id || '')}
                  placeholder="Select Site..."
                  searchable={true}
                  width="100%"
                  disabled={!selectedCustomer}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Workday Project (for Cost Actuals)
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
                {workdayProjectId && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    This will link the MPP file's cost data to the selected Workday project
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowHierarchyModal(false);
                  setSelectedPortfolio('');
                  setSelectedCustomer('');
                  setSelectedSite('');
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
                disabled={!selectedPortfolio || !selectedCustomer || !selectedSite}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: selectedPortfolio && selectedCustomer && selectedSite ? 'var(--pinnacle-teal)' : 'var(--bg-tertiary)',
                  border: 'none',
                  borderRadius: '4px',
                  color: selectedPortfolio && selectedCustomer && selectedSite ? '#000' : 'var(--text-muted)',
                  cursor: selectedPortfolio && selectedCustomer && selectedSite ? 'pointer' : 'not-allowed',
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
