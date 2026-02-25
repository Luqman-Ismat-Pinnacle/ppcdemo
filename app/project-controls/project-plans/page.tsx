'use client';

/**
 * Project Plans Page
 * Upload MPP files, process with MPXJ, run auto project health checks, and sync to database.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/lib/data-context';
import ContainerLoader from '@/components/ui/ContainerLoader';
import { useLogs } from '@/lib/logs-context';
import { type ProjectHealthAutoResult, type HealthCheckResult } from '@/lib/project-health-auto-check';
import SearchableDropdown, { type DropdownOption } from '@/components/ui/SearchableDropdown';
import { parseHourDescription } from '@/lib/hours-description';
import EnhancedTooltip from '@/components/ui/EnhancedTooltip';

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
  version?: number;
  isCurrentVersion?: boolean;
}

const STORAGE_BUCKET = 'projectdoc';

// Azure Blob Storage API helpers (server-side via /api/storage)
const storageApi = {
  async upload(path: string, file: File): Promise<{ data: { path: string } | null; error: Error | null }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', path);
      const res = await fetch('/api/storage', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) return { data: null, error: new Error(json.error || 'Upload failed') };
      return { data: json.data, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },
  async download(path: string): Promise<{ data: Blob | null; error: Error | null }> {
    try {
      const res = await fetch(`/api/storage?action=download&path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        return { data: null, error: new Error(json.error || 'Download failed') };
      }
      const blob = await res.blob();
      return { data: blob, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },
  async list(prefix: string, limit: number = 100): Promise<{ data: any[] | null; error: Error | null }> {
    try {
      const res = await fetch(`/api/storage?action=list&prefix=${encodeURIComponent(prefix)}&limit=${limit}`);
      const json = await res.json();
      if (!res.ok) return { data: null, error: new Error(json.error || 'List failed') };
      return { data: json.data, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },
  async remove(paths: string[]): Promise<{ error: Error | null }> {
    try {
      const res = await fetch('/api/storage', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      });
      const json = await res.json();
      if (!res.ok) return { error: new Error(json.error || 'Delete failed') };
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  },
};

export default function DocumentsPage() {
  const router = useRouter();
  const { refreshData, data, filteredData, isLoading } = useData();
  const { addEngineLog } = useLogs();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track which file row has its dropdown expanded
  const [expandedDropdownId, setExpandedDropdownId] = useState<string | null>(null);

  // Split projects by plan status: has_schedule flag OR has at least one document in project_documents
  // Uses unfiltered `data` to show ALL projects from Data Management, not just the filtered subset
  const { projectsWithPlan, projectsWithoutPlan } = useMemo(() => {
    const projects = data?.projects || [];
    const docs = data?.projectDocuments || [];
    const projectIdsWithDoc = new Set(
      docs.map((d: any) => d.project_id ?? d.projectId).filter(Boolean)
    );
    const withPlan = projects.filter((p: any) => {
      const id = p.id ?? p.projectId;
      return p.has_schedule === true || p.hasSchedule === true || (id != null && projectIdsWithDoc.has(String(id)));
    });
    const withoutPlan = projects.filter((p: any) => {
      const id = p.id ?? p.projectId;
      return !(p.has_schedule === true || p.hasSchedule === true || (id != null && projectIdsWithDoc.has(String(id))));
    });
    return { projectsWithPlan: withPlan, projectsWithoutPlan: withoutPlan };
  }, [data?.projects, data?.projectDocuments]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingFileId, setProcessingFileId] = useState<string | null>(null);
  const [processingStage, setProcessingStage] = useState<{
    step: number;
    label: string;
    fileName: string;
  } | null>(null);
  const [workdayProjectId, setWorkdayProjectId] = useState('');
  const [availableWorkdayProjects, setAvailableWorkdayProjects] = useState<DropdownOption[]>([]);
  const [loadingWorkdayProjects, setLoadingWorkdayProjects] = useState(false);
  const [processDiagnostics, setProcessDiagnostics] = useState<Record<string, string[]>>({});
  const [expandedHealthFileId, setExpandedHealthFileId] = useState<string | null>(null);
  const [storageConfigured, setStorageConfigured] = useState(true);
  const [hasLoadedFiles, setHasLoadedFiles] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState('');

  // Project selection modal state
  const [showHierarchyModal, setShowHierarchyModal] = useState(false);
  const [assignPortfolioId, setAssignPortfolioId] = useState('');
  const [disconnectDrafts, setDisconnectDrafts] = useState<Record<string, string>>({});
  const [savingDisconnectKey, setSavingDisconnectKey] = useState<string | null>(null);

  // Check if the selected project has a portfolio; build portfolio options
  // Use full data (not filtered) so ALL active portfolios are available for reassignment
  const portfolioOptions: DropdownOption[] = useMemo(() => {
    return (data?.portfolios || []).filter((p: any) => {
      const inactive = p.isActive === false || p.is_active === false || p.active === false;
      const status = (p.status || '').toString().toLowerCase();
      return !inactive && !status.includes('inactive') && !status.includes('closed');
    }).map((p: any) => ({
      id: p.id || p.portfolioId,
      name: p.name,
      secondary: p.manager || '',
    }));
  }, [data?.portfolios]);

  const selectedProjectMissingPortfolio = useMemo(() => {
    if (!workdayProjectId) return false;
    const projects = data?.projects || [];
    const proj = projects.find((p: any) => (p.id || p.projectId) === workdayProjectId);
    if (!proj) return false;
    const projRecord = proj as unknown as Record<string, unknown>;
    const portfolioId = (projRecord.portfolioId ?? projRecord.portfolio_id) as string | undefined;
    if (!portfolioId) return true;
    const portfolios = data?.portfolios || [];
    const portfolio = portfolios.find((p: any) => (p.id || p.portfolioId) === portfolioId);
    if (!portfolio) return true;
    const portfolioRecord = portfolio as unknown as Record<string, unknown>;
    return portfolioRecord.isActive === false || portfolioRecord.is_active === false;
  }, [workdayProjectId, data?.projects, data?.portfolios]);

  type HierarchyDisconnect = {
    key: string;
    issueType: string;
    entityType: 'customer' | 'site' | 'project';
    entityId: string;
    entityName: string;
    field: 'portfolioId' | 'customerId' | 'siteId';
    currentValue: string | null;
    options: DropdownOption[];
    scopeHint: string;
  };

  const customerOptions: DropdownOption[] = useMemo(() => {
    return (data?.customers || []).map((c: any) => ({
      id: String(c.id || c.customerId || ''),
      name: c.name || c.customerName || c.id || 'Unnamed customer',
      secondary: String(c.portfolioId ?? c.portfolio_id ?? '') || 'No portfolio',
    })).filter((c) => c.id);
  }, [data?.customers]);

  const siteOptions: DropdownOption[] = useMemo(() => {
    return (data?.sites || []).map((s: any) => ({
      id: String(s.id || s.siteId || ''),
      name: s.name || s.siteName || s.id || 'Unnamed site',
      secondary: String(s.customerId ?? s.customer_id ?? '') || 'No customer',
    })).filter((s) => s.id);
  }, [data?.sites]);

  const hierarchyDisconnects: HierarchyDisconnect[] = useMemo(() => {
    const portfolios = data?.portfolios || [];
    const customers = data?.customers || [];
    const sites = data?.sites || [];
    const projects = data?.projects || [];
    const activePortfolioIdSet = new Set(
      portfolios
        .filter((p: any) => p.isActive !== false && p.is_active !== false && p.active !== false)
        .map((p: any) => String(p.id || p.portfolioId || ''))
        .filter(Boolean)
    );
    const customerMap = new Map(customers.map((c: any) => [String(c.id || c.customerId || ''), c]));
    const siteMap = new Map(sites.map((s: any) => [String(s.id || s.siteId || ''), s]));
    const disconnects: HierarchyDisconnect[] = [];

    customers.forEach((customer: any) => {
      const id = String(customer.id || customer.customerId || '');
      if (!id) return;
      const portfolioId = String(customer.portfolioId ?? customer.portfolio_id ?? '');
      if (!portfolioId || !activePortfolioIdSet.has(portfolioId)) {
        disconnects.push({
          key: `customer:${id}:portfolio`,
          issueType: 'Customer missing active portfolio',
          entityType: 'customer',
          entityId: id,
          entityName: customer.name || customer.customerName || id,
          field: 'portfolioId',
          currentValue: portfolioId || null,
          options: portfolioOptions,
          scopeHint: 'Assign an active portfolio',
        });
      }
    });

    sites.forEach((site: any) => {
      const id = String(site.id || site.siteId || '');
      if (!id) return;
      const customerId = String(site.customerId ?? site.customer_id ?? '');
      if (!customerId || !customerMap.has(customerId)) {
        disconnects.push({
          key: `site:${id}:customer`,
          issueType: 'Site missing customer',
          entityType: 'site',
          entityId: id,
          entityName: site.name || site.siteName || id,
          field: 'customerId',
          currentValue: customerId || null,
          options: customerOptions,
          scopeHint: 'Assign the parent customer',
        });
      }
    });

    projects.forEach((project: any) => {
      const id = String(project.id || project.projectId || '');
      if (!id) return;
      const customerId = String(project.customerId ?? project.customer_id ?? '');
      const siteId = String(project.siteId ?? project.site_id ?? '');
      const portfolioId = String(project.portfolioId ?? project.portfolio_id ?? '');
      if (!customerId || !customerMap.has(customerId)) {
        disconnects.push({
          key: `project:${id}:customer`,
          issueType: 'Project missing customer',
          entityType: 'project',
          entityId: id,
          entityName: project.name || project.projectName || id,
          field: 'customerId',
          currentValue: customerId || null,
          options: customerOptions,
          scopeHint: 'Assign the parent customer',
        });
      }
      if (!siteId || !siteMap.has(siteId)) {
        disconnects.push({
          key: `project:${id}:site`,
          issueType: 'Project missing site',
          entityType: 'project',
          entityId: id,
          entityName: project.name || project.projectName || id,
          field: 'siteId',
          currentValue: siteId || null,
          options: siteOptions,
          scopeHint: 'Assign the parent site',
        });
      }
      if (!portfolioId || !activePortfolioIdSet.has(portfolioId)) {
        disconnects.push({
          key: `project:${id}:portfolio`,
          issueType: 'Project missing active portfolio',
          entityType: 'project',
          entityId: id,
          entityName: project.name || project.projectName || id,
          field: 'portfolioId',
          currentValue: portfolioId || null,
          options: portfolioOptions,
          scopeHint: 'Assign an active portfolio',
        });
      }
    });

    return disconnects;
  }, [data?.portfolios, data?.customers, data?.sites, data?.projects, portfolioOptions, customerOptions, siteOptions]);

  const addLog = useCallback((type: ProcessingLog['type'], message: string) => {
    const method = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log';
    console[method](`[Project Plans] ${message}`);
  }, []);

  const appendDiagnostic = useCallback((fileId: string, message: string) => {
    if (!fileId || !message) return;
    setProcessDiagnostics((prev) => {
      const existing = prev[fileId] || [];
      const next = [...existing, message];
      return { ...prev, [fileId]: next.slice(-30) };
    });
  }, []);

  // Load existing files from Azure Blob Storage on mount
  useEffect(() => {
    loadStoredFiles();
    loadWorkdayProjects();
  }, []);

  // Scroll expanded file row into view so Run MPXJ status is visible
  useEffect(() => {
    if (!expandedDropdownId) return;
    const el = document.querySelector(`[data-file-row="${expandedDropdownId}"]`);
    if (el) {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [expandedDropdownId]);

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

  /** Parse a DB document's health_check_json into our typed result */
  const parseHealthCheck = (dbDoc: any): ProjectHealthAutoResult | undefined => {
    const raw = dbDoc?.health_check_json ?? dbDoc?.healthCheckJson;
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed.score !== undefined) {
          const issues = parsed.issues ?? [];
          let results = Array.isArray(parsed.results) ? parsed.results : [];
          if (results.length === 0 && issues.length > 0) {
            results = issues.map((msg: string) => ({ checkName: msg, passed: false, message: msg }));
          }
          return {
            score: parsed.score,
            passed: parsed.passed ?? 0,
            failed: parsed.failed ?? (parsed.totalChecks ?? 0) - (parsed.passed ?? 0),
            totalChecks: parsed.totalChecks ?? Math.max(results.length, 1),
            issues,
            results,
          };
        }
      } catch { /* ignore */ }
    }
    if (dbDoc?.health_score != null || dbDoc?.healthScore != null) {
      const score = dbDoc.health_score ?? dbDoc.healthScore ?? 0;
      return { score, passed: 0, failed: 0, totalChecks: 0, issues: [], results: [] };
    }
    return undefined;
  };

  const loadStoredFiles = async () => {
    try {
      console.log('[loadStoredFiles] Fetching files...');

      // ── 1. Always fetch database documents first (reliable source) ──
      let dbDocs: any[] = [];
      try {
        const dbRes = await fetch('/api/data');
        const dbJson = await dbRes.json();
        const rawDocs = dbJson?.data?.projectDocuments || dbJson?.projectDocuments || [];
        dbDocs = rawDocs.map((d: any) => ({
          id: d.id || d.documentId,
          file_name: d.fileName || d.file_name || d.name,
          storage_path: d.storagePath || d.storage_path,
          project_id: d.projectId || d.project_id,
          version: d.version ?? 1,
          health_score: d.healthScore ?? d.health_score,
          health_check_json: d.healthCheckJson || d.health_check_json,
          uploaded_at: d.uploadedAt || d.uploaded_at,
          file_size: d.fileSize ?? d.file_size ?? 0,
          is_current_version: d.isCurrentVersion ?? d.is_current_version,
        }));
        console.log('[loadStoredFiles] DB docs:', dbDocs.length);
      } catch (dbErr) {
        console.error('[loadStoredFiles] DB fetch error:', dbErr);
      }

      // ── 2. Try Azure Blob Storage (may fail if not configured) ─────
      let storageFiles: any[] | null = null;
      let storageFailed = false;
      try {
        const { data, error } = await storageApi.list('mpp', 100);
        if (error) {
          console.warn('[loadStoredFiles] Storage list error:', error.message);
          storageFailed = true;
        } else {
          storageFiles = data;
        }
      } catch (storageErr) {
        console.warn('[loadStoredFiles] Storage unreachable:', storageErr);
        storageFailed = true;
      }

      setStorageConfigured(!storageFailed);

      // ── 3. Build the file list ─────────────────────────────────────
      const dbDocMap = new Map<string, any>();
      dbDocs.forEach(doc => {
        if (doc.storage_path) dbDocMap.set(doc.storage_path, doc);
      });

      const files: UploadedFile[] = [];
      const usedDbIds = new Set<string>();

      // If storage returned files, cross-reference with DB
      if (storageFiles && storageFiles.length > 0) {
        const mppFiles = storageFiles.filter((f: any) =>
          (f.name || '').toLowerCase().endsWith('.mpp')
        );
        mppFiles.forEach((f: any) => {
          // Storage list may return names with or without the prefix
          const nameOnly = (f.name || '').replace(/^mpp\//, '');
          const storagePath = f.name?.startsWith('mpp/') ? f.name : `mpp/${f.name}`;
          const dbDoc = dbDocMap.get(storagePath) || dbDocMap.get(f.name);
          if (dbDoc) usedDbIds.add(dbDoc.id);
          files.push({
            id: dbDoc?.id || f.id || nameOnly,
            fileName: nameOnly || f.name,
            fileSize: dbDoc?.file_size || f.size || 0,
            uploadedAt: new Date(dbDoc?.uploaded_at || f.lastModified || Date.now()),
            workdayProjectId: dbDoc?.project_id || undefined,
            status: dbDoc?.project_id ? 'complete' as const : 'uploaded' as const,
            storagePath,
            healthCheck: parseHealthCheck(dbDoc),
            version: dbDoc?.version ?? 1,
            isCurrentVersion: dbDoc?.is_current_version ?? false,
          });
        });
      }

      // Always add DB-only documents (not matched to storage files)
      dbDocs.forEach(doc => {
        if (usedDbIds.has(doc.id)) return;
        const fileName = doc.file_name || doc.storage_path?.split('/').pop() || 'Unknown';
        if (!fileName.toLowerCase().endsWith('.mpp')) return;
        files.push({
          id: doc.id,
          fileName,
          fileSize: doc.file_size || 0,
          uploadedAt: new Date(doc.uploaded_at || Date.now()),
          workdayProjectId: doc.project_id || undefined,
          status: doc.project_id ? 'complete' as const : 'uploaded' as const,
          storagePath: doc.storage_path,
          healthCheck: parseHealthCheck(doc),
          version: doc.version ?? 1,
          isCurrentVersion: doc.is_current_version ?? false,
        });
      });

      console.log('[loadStoredFiles] Total files:', files.length, '(storage:', storageFiles?.length || 0, ', db-only:', files.length - (storageFiles?.length || 0), ')');
      setUploadedFiles(files);
    } catch (err) {
      console.error('Error loading stored files:', err);
    } finally {
      setHasLoadedFiles(true);
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

  // Upload file to Azure Blob Storage
  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      addLog('error', 'No file selected');
      return;
    }

    // Show hierarchy selection modal instead of prompts
    setShowHierarchyModal(true);
    return;
  }, [selectedFile, addLog, showHierarchyModal]);

  // Actual upload function after project selection
  const handleUploadWithHierarchy = useCallback(async () => {
    if (!selectedFile || !workdayProjectId) {
      addLog('error', 'Please select a Workday project');
      return;
    }

    // If portfolio was missing and user assigned one, update the project + customer chain
    if (selectedProjectMissingPortfolio && assignPortfolioId) {
      try {
        const portfolio = (data?.portfolios || []).find((p: any) => (p.id || p.portfolioId) === assignPortfolioId);
        const proj = (data?.projects || []).find((p: any) => (p.id || p.projectId) === workdayProjectId);
        if (proj) {
          const projectId = proj.id || proj.projectId;
          const resProj = await fetch('/api/data/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dataKey: 'projects',
              operation: 'update',
              records: [{ id: projectId, portfolioId: assignPortfolioId }],
            }),
          });
          const resultProj = await resProj.json();
          if (!resultProj.success) {
            throw new Error(resultProj.error || 'Project update failed');
          }
          const projRecord = proj as unknown as Record<string, unknown>;
          const customerId = (projRecord.customerId ?? projRecord.customer_id) as string | undefined;
          if (customerId) {
            const resCust = await fetch('/api/data/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                dataKey: 'customers',
                operation: 'update',
                records: [{ id: customerId, portfolioId: assignPortfolioId }],
              }),
            });
            const resultCust = await resCust.json();
            if (!resultCust.success) {
              addLog('warning', `Project reassigned; customer portfolio update failed: ${resultCust.error || ''}`);
            }
          }
          await refreshData();
          addLog('success', `Project reassigned to portfolio: ${portfolio?.name || assignPortfolioId}`);
        }
      } catch (err: any) {
        addLog('warning', `Portfolio reassignment failed: ${err.message}`);
      }
    }

    setShowHierarchyModal(false);
    setAssignPortfolioId('');
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

    pushLog('info', `[Storage] Uploading ${selectedFile.name} to Azure Blob Storage...`);
    pushLog('info', `[Project] Linking to Workday project: ${workdayProjectId}`);

    try {
      // Upload to Azure Blob Storage via API
      const { data: uploadData, error } = await storageApi.upload(storagePath, selectedFile);

      if (error) {
        throw new Error(error.message);
      }

      const savedStoragePath = uploadData?.path ?? storagePath;
      pushLog('success', `[Storage] File uploaded: ${savedStoragePath}`);

      // Update file status (use path returned by storage so it matches DB for setCurrentMpp/updateDocumentHealth)
      setUploadedFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'uploaded' as const, storagePath: savedStoragePath } : f
      ));

      // Determine version from DB-backed documents for this project (avoid stale local UI state)
      const existingProjectDocs = (data?.projectDocuments || []).filter((d: any) => {
        const pid = String(d.projectId || d.project_id || '');
        const type = String(d.documentType || d.document_type || '').toUpperCase();
        return pid === workdayProjectId.trim() && (type === 'MPP' || type === '');
      });
      const maxVersion = existingProjectDocs.reduce((max, f) => Math.max(max, f.version || 1), 0);
      const newVersion = maxVersion + 1;

      // Mark all previous versions for this project as non-current
      if (existingProjectDocs.length > 0) {
        pushLog('info', `[Versioning] Existing version(s) found — this will be v${newVersion}`);
        try {
          // Mark old versions as non-current in the database
          for (const oldDoc of existingProjectDocs) {
            await fetch('/api/data/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                dataKey: 'projectDocuments',
                operation: 'update',
                records: [{ id: oldDoc.id || oldDoc.documentId, is_current_version: false }],
              }),
            });
          }
          pushLog('success', `[Versioning] ${existingProjectDocs.length} previous version(s) marked as non-current`);
        } catch (e: any) {
          pushLog('warning', `[Versioning] Could not update old versions: ${e.message}`);
        }
      }

      // Save metadata to project_documents (use fileId so Process can look up by file.id)
      try {
        const docRes = await fetch('/api/data/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataKey: 'projectDocuments',
            records: [{
              id: fileId,
              documentId: fileId,
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
              isCurrentVersion: true,
              version: newVersion,
            }],
          }),
        });
        const docResult = await docRes.json();
        if (docRes.ok && docResult.success) {
          pushLog('success', `[Database] Document metadata saved (v${newVersion}, project_id: ${workdayProjectId})`);
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
      await refreshData();
      await loadStoredFiles();

    } catch (error: any) {
      pushLog('error', `[Storage] Upload failed: ${error.message}`);
      // Remove failed file from list
      setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
    } finally {
      setIsUploading(false);
    }
  }, [selectedFile, workdayProjectId, addLog, selectedProjectMissingPortfolio, assignPortfolioId, data?.portfolios, data?.projects, data?.projectDocuments, refreshData, loadStoredFiles]);

  // Process file via server-side transactional import (single atomic upsert path)
  const handleProcess = useCallback(async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file) return;

    setExpandedDropdownId(fileId);
    setIsProcessing(true);
    setProcessingFileId(fileId);
    setProcessingStage({ step: 1, label: 'Preparing import...', fileName: file.fileName });
    setUploadedFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'processing' as const } : f));

    const logEntries: ProcessingLog[] = [];
    setProcessDiagnostics((prev) => ({ ...prev, [fileId]: [] }));
    const pushLog = (type: ProcessingLog['type'], message: string) => {
      const entry: ProcessingLog = { id: `${Date.now()}-${Math.random()}`, timestamp: new Date(), type, message };
      logEntries.push(entry);
      addLog(type, message);
      appendDiagnostic(fileId, `[${type.toUpperCase()}] ${message}`);
    };

    try {
      const projectId = (() => {
        if (file.workdayProjectId) return file.workdayProjectId;
        const docs = data?.projectDocuments || [];
        const match = docs.find((d: any) => {
          const byId = (d.id || d.documentId) === file.id;
          const byPath = file.storagePath && (d.storagePath === file.storagePath || d.storage_path === file.storagePath);
          const byName = (d.fileName || d.file_name || d.name) === file.fileName;
          return byId || byPath || byName;
        });
        if (!match) return '';
        const matchRecord = match as unknown as Record<string, unknown>;
        return String(matchRecord.projectId ?? matchRecord.project_id ?? '');
      })();

      if (!projectId) {
        throw new Error('File is not linked to a project. Link it to a project before running MPXJ.');
      }

      const project = (data?.projects || []).find((p: any) => String(p.id || p.projectId) === String(projectId));
      const projectRecord = project as unknown as Record<string, unknown> | undefined;
      const portfolioId = String(projectRecord?.portfolioId ?? projectRecord?.portfolio_id ?? assignPortfolioId ?? '');
      const customerId = String(projectRecord?.customerId ?? projectRecord?.customer_id ?? '');
      const siteId = String(projectRecord?.siteId ?? projectRecord?.site_id ?? '');

      setProcessingStage({ step: 2, label: 'Running parser and DB upsert...', fileName: file.fileName });
      setUploadedFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'syncing' as const } : f));
      pushLog('info', '[Import] Starting transactional parser -> converter -> database upsert...');

      const formData = new FormData();
      formData.append('documentId', file.id);
      formData.append('projectId', String(projectId));
      if (file.storagePath) formData.append('storagePath', file.storagePath);
      if (portfolioId) formData.append('portfolioId', portfolioId);
      if (customerId) formData.append('customerId', customerId);
      if (siteId) formData.append('siteId', siteId);

      const response = await fetch('/api/documents/process-mpp', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      if (Array.isArray(result?.diagnostics)) {
        result.diagnostics.forEach((d: string) => appendDiagnostic(fileId, d));
      }

      if (!response.ok || !result.success) {
        const details = Array.isArray(result?.diagnostics) ? result.diagnostics.slice(-4).join(' | ') : '';
        throw new Error(details ? `${result.error || 'MPP import failed'} :: ${details}` : (result.error || 'MPP import failed'));
      }

      const routeLogs = Array.isArray(result.logs) ? result.logs : [];
      routeLogs.forEach((log: any) => {
        pushLog((log?.type as ProcessingLog['type']) || 'info', String(log?.message || ''));
      });

      setProcessingStage({ step: 3, label: 'Refreshing UI data...', fileName: file.fileName });
      setUploadedFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'complete' as const } : f));
      pushLog('success', '[Complete] MPP import committed to database');

      const logLines = logEntries.map(e => `[${e.timestamp.toLocaleTimeString()}] ${e.type.toUpperCase()}: ${e.message}`);
      addEngineLog('ProjectPlan', logLines, { executionTimeMs: Date.now() - Date.parse(logEntries[0]?.timestamp.toISOString() || new Date().toISOString()) });

      await refreshData();
      await loadStoredFiles();
      setProcessingStage({ step: 7, label: 'Done', fileName: file.fileName });
    } catch (err: any) {
      pushLog('error', `[Process] Error: ${err.message}`);
      if (err?.stack) {
        appendDiagnostic(fileId, `[STACK] ${String(err.stack).split('\n').slice(0, 3).join(' | ')}`);
      }
      setUploadedFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'error' as const } : f));
    } finally {
      setIsProcessing(false);
    }
  }, [uploadedFiles, addLog, refreshData, loadStoredFiles, data, addEngineLog, assignPortfolioId, appendDiagnostic]);

  // Delete file — clears blob, project_documents record, and all associated data
  const handleDelete = useCallback(async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file) return;

    const projectId = (() => {
      if (file.workdayProjectId) return file.workdayProjectId;
      const docs = data?.projectDocuments || [];
      const match = docs.find((d: any) => {
        const byId = (d.id || d.documentId) === file.id;
        const byPath = file.storagePath && (d.storagePath === file.storagePath || d.storage_path === file.storagePath);
        const byName = (d.fileName || d.file_name || d.name) === file.fileName;
        return byId || byPath || byName;
      });
      if (!match) return '';
      const matchRecord = match as unknown as Record<string, unknown>;
      return String(matchRecord.projectId ?? matchRecord.project_id ?? '');
    })();

    // 1. Delete the file from Azure Blob Storage
    if (file.storagePath) {
      addLog('info', `[Storage] Deleting ${file.fileName}...`);
      try {
        const { error } = await storageApi.remove([file.storagePath]);
        if (error) {
          addLog('warning', `[Storage] Delete failed: ${error.message}`);
        } else {
          addLog('success', '[Storage] Blob deleted');
        }
      } catch (err: any) {
        addLog('warning', `[Storage] Delete error: ${err.message}`);
      }
    }

    // 2. Delete the project_documents record from the database
    addLog('info', '[Database] Removing document record...');
    try {
      await fetch('/api/data/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataKey: 'projectDocuments', operation: 'delete', records: [{ id: file.id }] }),
      });
      addLog('success', '[Database] Document record deleted');
    } catch (e: any) {
      addLog('warning', `[Database] Document record delete failed: ${e.message}`);
    }

    // 3. If this file was linked to a project, clean up all associated schedule data
    if (projectId) {
      addLog('info', `[Database] Cleaning up schedule data for project ${projectId}...`);

      // Check if there are other active MPP files for this project
      const otherFiles = uploadedFiles.filter(f => f.id !== fileId && f.workdayProjectId === projectId);
      const hasOtherVersions = otherFiles.length > 0;

      if (!hasOtherVersions) {
        // No other versions — remove all tasks, units, phases, and dependencies for this project

        // Delete task_dependencies first (FK references tasks)
        try {
          // Get task IDs for this project to delete their dependencies
          const taskIds = (filteredData?.tasks || [])
            .filter((t: any) => (t.projectId || t.project_id) === projectId)
            .map((t: any) => t.id || t.taskId);
          if (taskIds.length > 0) {
            await fetch('/api/data/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dataKey: 'taskDependencies', operation: 'deleteByTaskIds', taskIds, records: [] }),
            });
            addLog('success', `[Database] Task dependencies cleared`);
          }
        } catch (e: any) {
          addLog('warning', `[Database] Dependencies cleanup: ${e.message}`);
        }

        // Delete logs + tasks + units + phases (order matters for FKs)
        for (const key of ['projectLog', 'tasks', 'units', 'phases']) {
          try {
            const res = await fetch('/api/data/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dataKey: key, operation: 'deleteByProjectId', projectId, records: [] }),
            });
            const result = await res.json();
            if (res.ok && result.success) {
              addLog('success', `[Database] ${key} cleared for project`);
            }
          } catch (e: any) {
            addLog('warning', `[Database] ${key} cleanup: ${e.message}`);
          }
        }

        // Reset has_schedule on the project
        try {
          await fetch('/api/data/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dataKey: 'projects',
              operation: 'update',
              records: [{ id: projectId, has_schedule: false, updated_at: new Date().toISOString() }],
            }),
          });
          addLog('success', '[Database] Project has_schedule reset to false');
        } catch (e: any) {
          addLog('warning', `[Database] Project update: ${e.message}`);
        }
      } else {
        addLog('info', `[Database] Other versions exist for this project — schedule data preserved`);
      }
    }

    // 4. Remove from local state and refresh
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
    await refreshData();
    addLog('success', '[Complete] File and associated data deleted');
  }, [uploadedFiles, addLog, refreshData, filteredData, data]);

  const handleDownloadFile = useCallback(async (file: UploadedFile) => {
    if (!file.storagePath) {
      addLog('warning', `[Download] Missing storage path for ${file.fileName}`);
      return;
    }
    try {
      addLog('info', `[Download] Downloading ${file.fileName}...`);
      const { data: blob, error } = await storageApi.download(file.storagePath);
      if (error || !blob) throw new Error(error?.message || 'Download failed');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      addLog('success', `[Download] Downloaded ${file.fileName}`);
    } catch (err: any) {
      addLog('error', `[Download] ${err.message}`);
    }
  }, [addLog]);

  const handleFixHierarchyDisconnect = useCallback(async (disconnect: HierarchyDisconnect) => {
    const nextValue = (disconnectDrafts[disconnect.key] ?? '').trim();
    if (!nextValue) {
      addLog('warning', `Select a value to fix: ${disconnect.issueType}`);
      return;
    }
    setSavingDisconnectKey(disconnect.key);
    try {
      const dataKey = disconnect.entityType === 'customer' ? 'customers' : disconnect.entityType === 'site' ? 'sites' : 'projects';
      const updateRecord: Record<string, string> = { id: disconnect.entityId };
      updateRecord[disconnect.field] = nextValue;
      const res = await fetch('/api/data/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataKey,
          operation: 'update',
          records: [updateRecord],
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to update hierarchy');
      addLog('success', `${disconnect.entityType} updated: ${disconnect.entityName}`);
      await refreshData();
      setDisconnectDrafts((prev) => {
        const next = { ...prev };
        delete next[disconnect.key];
        return next;
      });
    } catch (err: any) {
      addLog('error', err.message || 'Hierarchy update failed');
    } finally {
      setSavingDisconnectKey(null);
    }
  }, [disconnectDrafts, addLog, refreshData]);

  const workdayPhasesByProject = useMemo(() => {
    const phases = data?.workdayPhases || filteredData?.workdayPhases || [];
    const map = new Map<string, any[]>();
    phases.forEach((wp: any) => {
      const pid = wp.projectId ?? wp.project_id;
      if (!pid) return;
      const list = map.get(String(pid)) || [];
      list.push(wp);
      map.set(String(pid), list);
    });
    return map;
  }, [data?.workdayPhases, filteredData?.workdayPhases]);

  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingProjectFilter, setMappingProjectFilter] = useState<string>('');
  const [mappingSearch, setMappingSearch] = useState('');
  const [mappingResult, setMappingResult] = useState<{ matched: number; unmatched: number; considered: number } | null>(null);
  const [mappingTaskPickerByBucket, setMappingTaskPickerByBucket] = useState<Record<string, string | null>>({});
  const autoMatchedProjectRef = useRef<string>('');

  const mappingProjectOptions = useMemo(() => {
    return projectsWithPlan.map((p: any) => ({ id: String(p.id ?? p.projectId ?? ''), name: p.name || p.id || 'Unknown' }));
  }, [projectsWithPlan]);

  const mappingProjectWorkdayPhases = useMemo(() => {
    if (!mappingProjectFilter) return [];
    const list = workdayPhasesByProject.get(mappingProjectFilter) || [];
    return [...list].sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [mappingProjectFilter, workdayPhasesByProject]);

  const mappingProjectHours = useMemo(() => {
    if (!mappingProjectFilter) return [];
    const hours = data?.hours || filteredData?.hours || [];
    let list = hours.filter((h: any) => String(h.projectId ?? h.project_id) === mappingProjectFilter);
    if (mappingSearch.trim()) {
      const q = mappingSearch.trim().toLowerCase();
      list = list.filter((h: any) => {
        const parsed = parseHourDescription(String(h.description ?? ''));
        const haystack = [
          h.id,
          h.date,
          h.description,
          h.chargeCode,
          h.charge_code,
          h.phases,
          h.task,
          parsed.chargeCode,
          parsed.phases,
          parsed.task,
          h.workday_phase,
          h.workday_task,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    return list;
  }, [data?.hours, filteredData?.hours, mappingProjectFilter, mappingSearch]);

  const mappingProjectTasks = useMemo(() => {
    if (!mappingProjectFilter) return [];
    const tasks = data?.tasks || filteredData?.tasks || [];
    let list = tasks.filter((t: any) => String(t.projectId ?? t.project_id) === mappingProjectFilter);
    if (mappingSearch.trim()) {
      const q = mappingSearch.trim().toLowerCase();
      list = list.filter((t: any) => {
        const haystack = [
          t.id,
          t.taskId,
          t.name,
          t.taskName,
          t.wbsCode,
          t.description,
          t.assignedResource,
          t.assignedResourceName,
          t.workdayPhaseId,
          t.workday_phase_id,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    return list;
  }, [data?.tasks, filteredData?.tasks, mappingProjectFilter, mappingSearch]);

  const hoursByWorkdayPhaseForProject = useMemo(() => {
    const byPhase = new Map<string | 'unassigned', any[]>();
    byPhase.set('unassigned', []);
    mappingProjectHours.forEach((h: any) => {
      const wpId = h.workdayPhaseId ?? h.workday_phase_id;
      const key = wpId ? String(wpId) : 'unassigned';
      const list = byPhase.get(key) || [];
      list.push(h);
      byPhase.set(key, list);
    });
    return byPhase;
  }, [mappingProjectHours]);

  const tasksByWorkdayPhaseForProject = useMemo(() => {
    const byPhase = new Map<string | 'unassigned', any[]>();
    byPhase.set('unassigned', []);
    mappingProjectTasks.forEach((t: any) => {
      const wpId = t.workdayPhaseId ?? t.workday_phase_id;
      const key = wpId ? String(wpId) : 'unassigned';
      const list = byPhase.get(key) || [];
      list.push(t);
      byPhase.set(key, list);
    });
    return byPhase;
  }, [mappingProjectTasks]);

  const hoursByTaskForMappingProject = useMemo(() => {
    const map = new Map<string, any[]>();
    mappingProjectHours.forEach((h: any) => {
      const tid = h.taskId ?? h.task_id;
      if (!tid) return;
      const key = String(tid);
      const list = map.get(key) || [];
      list.push(h);
      map.set(key, list);
    });
    return map;
  }, [mappingProjectHours]);

  const taskOptionsForSelectedProject = useMemo<DropdownOption[]>(() => {
    const allTasks = (data?.tasks || filteredData?.tasks || [])
      .filter((t: any) => String(t.projectId ?? t.project_id) === mappingProjectFilter)
      .map((t: any) => ({
        id: String(t.id ?? t.taskId ?? ''),
        name: String(t.name || t.taskName || t.id || ''),
        secondary: String(t.wbsCode || t.phaseId || t.phase_id || ''),
      }))
      .filter((opt) => opt.id);
    return allTasks;
  }, [data?.tasks, filteredData?.tasks, mappingProjectFilter]);

  const handleAssignHourToWorkdayPhase = useCallback(async (hourId: string, workdayPhaseId: string | null) => {
    if (!hourId) return;
    setMappingSaving(true);
    try {
      const res = await fetch('/api/data/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assignHourToWorkdayPhase', hourId, workdayPhaseId }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed');
      addLog('success', 'Hour entry assigned to Workday phase');
      await refreshData();
    } catch (err: any) {
      addLog('error', err.message);
    } finally {
      setMappingSaving(false);
    }
  }, [addLog, refreshData]);

  const handleAssignHourToTask = useCallback(async (hourId: string, taskId: string | null) => {
    if (!hourId) return;
    setMappingSaving(true);
    try {
      const res = await fetch('/api/data/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assignHourToTask', hourId, taskId }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed');
      addLog('success', taskId ? 'Hour entry linked to task' : 'Hour entry unlinked from task');
      await refreshData();
    } catch (err: any) {
      addLog('error', err.message);
    } finally {
      setMappingSaving(false);
    }
  }, [addLog, refreshData]);

  const handleAssignTaskToWorkdayPhase = useCallback(async (taskId: string, workdayPhaseId: string | null) => {
    if (!taskId) return;
    setMappingSaving(true);
    try {
      const res = await fetch('/api/data/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assignTaskToWorkdayPhase', taskId, workdayPhaseId }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed');
      addLog('success', 'Task assigned to Workday phase');
      await refreshData();
    } catch (err: any) {
      addLog('error', err.message);
    } finally {
      setMappingSaving(false);
    }
  }, [addLog, refreshData]);

  const handleAutoMatchHoursToTasksInBucket = useCallback(async (workdayPhaseId: string) => {
    if (!mappingProjectFilter || !workdayPhaseId) return;
    setMappingSaving(true);
    try {
      const res = await fetch('/api/data/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'autoMatchHoursToTasksInWorkdayPhaseBucket',
          projectId: mappingProjectFilter,
          workdayPhaseId,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed');
      addLog('success', `[Auto-Match] ${result.matched} matched in bucket, ${result.unmatched} unmatched`);
      await refreshData();
    } catch (err: any) {
      addLog('error', err.message);
    } finally {
      setMappingSaving(false);
    }
  }, [mappingProjectFilter, addLog, refreshData]);

  const handleAutoMatchWorkdayPhaseToHours = useCallback(async (rematchAll: boolean = false) => {
    if (!mappingProjectFilter) return;
    setMappingSaving(true);
    setMappingResult(null);
    try {
      const res = await fetch('/api/data/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'matchWorkdayPhaseToHoursPhases', projectId: mappingProjectFilter, rematchAll }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed');
      setMappingResult({
        matched: Number(result.matched || 0),
        unmatched: Number(result.unmatched || 0),
        considered: Number(result.considered || 0),
      });
      addLog('success', `[Matching] Hours-to-Workday-phases complete: ${result.matched} matched, ${result.unmatched} unmatched`);
      await refreshData();
    } catch (err: any) {
      addLog('error', err.message);
    } finally {
      setMappingSaving(false);
    }
  }, [mappingProjectFilter, addLog, refreshData]);

  const handleSelectTaskForBucket = useCallback(async (bucketWorkdayPhaseId: string | null, taskId: string | null) => {
    if (!taskId) return;
    await handleAssignTaskToWorkdayPhase(taskId, bucketWorkdayPhaseId);
    const bucketKey = bucketWorkdayPhaseId || 'unassigned';
    setMappingTaskPickerByBucket((prev) => ({ ...prev, [bucketKey]: null }));
  }, [handleAssignTaskToWorkdayPhase]);

  const buildHourTooltip = useCallback((h: any) => {
    const parsed = parseHourDescription(String(h.description ?? ''));
    return {
      title: `Hour Entry ${h.id || ''}`,
      description: `${String(h.date || '').slice(0, 10)} · ${h.hours ?? 0}h`,
      details: [
        `Employee: ${h.employeeId ?? h.employee_id ?? ''}`,
        `Charge Code: ${h.chargeCode ?? h.charge_code ?? parsed.chargeCode ?? ''}`,
        `Phase: ${h.phases ?? parsed.phases ?? ''}`,
        `Task: ${h.task ?? parsed.task ?? ''}`,
        `Workday Phase ID: ${h.workdayPhaseId ?? h.workday_phase_id ?? ''}`,
        `Description: ${h.description ?? ''}`,
      ],
    };
  }, []);

  useEffect(() => {
    if (!mappingProjectFilter) {
      autoMatchedProjectRef.current = '';
      return;
    }
    if (!mappingProjectWorkdayPhases.length) return;
    if (autoMatchedProjectRef.current === mappingProjectFilter) return;
    autoMatchedProjectRef.current = mappingProjectFilter;
    void handleAutoMatchWorkdayPhaseToHours(true);
  }, [mappingProjectFilter, mappingProjectWorkdayPhases.length, handleAutoMatchWorkdayPhaseToHours]);

  const visibleFiles = useMemo(() => {
    const q = fileSearchQuery.trim().toLowerCase();
    if (!q) return uploadedFiles;
    return uploadedFiles.filter((file) => {
      const healthScore = file.healthCheck?.score != null ? String(file.healthCheck.score) : '';
      const haystack = [
        file.fileName,
        file.workdayProjectId || '',
        file.storagePath || '',
        file.status,
        `v${file.version || 1}`,
        healthScore,
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [uploadedFiles, fileSearchQuery]);

  const showInitialLoad = isLoading && !hasLoadedFiles && !isProcessing && !isUploading;

  return (
    <div className="page-panel">
      {showInitialLoad ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <ContainerLoader message="Loading project files..." minHeight={200} />
        </div>
      ) : (
      <>
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
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.9rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                    Hierarchy Disconnects ({hierarchyDisconnects.length})
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.7rem' }}>
                    Fix missing parent links (portfolio/customer/site) and save directly to the database.
                  </div>
                  {hierarchyDisconnects.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No hierarchy disconnects detected.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '320px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                      {hierarchyDisconnects.map((disconnect) => {
                        const draftValue = disconnectDrafts[disconnect.key] ?? '';
                        const selectedValue = draftValue || disconnect.currentValue || null;
                        const isSaving = savingDisconnectKey === disconnect.key;
                        return (
                          <div key={disconnect.key} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.65rem', background: 'var(--bg-secondary)' }}>
                            <div style={{ fontSize: '0.77rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                              {disconnect.issueType}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '0.45rem' }}>
                              {disconnect.entityName} ({disconnect.entityType}) · {disconnect.scopeHint}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.45rem', alignItems: 'center' }}>
                              <SearchableDropdown
                                value={selectedValue}
                                options={disconnect.options}
                                onChange={(id) => setDisconnectDrafts((prev) => ({ ...prev, [disconnect.key]: id || '' }))}
                                placeholder={`Select ${disconnect.field === 'portfolioId' ? 'portfolio' : disconnect.field === 'customerId' ? 'customer' : 'site'}...`}
                                searchable={true}
                                width="100%"
                              />
                              <button
                                type="button"
                                onClick={() => handleFixHierarchyDisconnect(disconnect)}
                                disabled={isSaving || !(disconnectDrafts[disconnect.key] ?? '').trim()}
                                style={{
                                  padding: '0.42rem 0.7rem',
                                  borderRadius: '6px',
                                  border: 'none',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  background: !isSaving && (disconnectDrafts[disconnect.key] ?? '').trim() ? 'var(--pinnacle-teal)' : 'var(--bg-tertiary)',
                                  color: !isSaving && (disconnectDrafts[disconnect.key] ?? '').trim() ? '#000' : 'var(--text-muted)',
                                  cursor: !isSaving && (disconnectDrafts[disconnect.key] ?? '').trim() ? 'pointer' : 'not-allowed',
                                  minWidth: '64px',
                                }}
                              >
                                {isSaving ? 'Saving...' : 'Fix'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Storage Warning — Enhanced */}
        {!storageConfigured && (
          <div className="chart-card grid-full" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '12px' }}>
            <div style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#F59E0B" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <div style={{ fontWeight: 700, color: '#F59E0B', fontSize: '1rem', marginBottom: '0.25rem' }}>Azure Blob Storage Not Connected</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    File uploads and downloads are currently unavailable because the storage connection could not be established.
                    Existing documents from the database are still shown below.
                  </div>
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '1rem', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>What&apos;s happening</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  The application tried to connect to Azure Blob Storage (container: <code style={{ background: 'rgba(245,158,11,0.15)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>projectdoc</code>) but the environment variable
                  <code style={{ background: 'rgba(245,158,11,0.15)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>AZURE_STORAGE_CONNECTION_STRING</code> is either missing or invalid.
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>How to fix</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {[
                    { step: '1', text: 'Verify the connection string exists in Azure DevOps Pipeline Variables (Settings > Pipelines > ppc_final > Variables)' },
                    { step: '2', text: 'Trigger a new deployment by pushing to main — the pipeline will inject the variable into the Container App' },
                    { step: '3', text: 'Or set it directly: Azure Portal > Container App (ppc1) > Settings > Environment Variables > Add AZURE_STORAGE_CONNECTION_STRING' },
                    { step: '4', text: 'After setting, the Container App will restart automatically. Refresh this page to verify.' },
                  ].map(s => (
                    <div key={s.step} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#F59E0B', flexShrink: 0 }}>{s.step}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s.text}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(59,130,246,0.08)', borderRadius: '6px', border: '1px solid rgba(59,130,246,0.2)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <strong style={{ color: '#3B82F6' }}>Note:</strong> If this is a local development environment, add the connection string to your <code>.env.local</code> file.
                For production, the Azure DevOps pipeline (ID: 457) is already configured to pass this variable during deployment.
              </div>
            </div>
          </div>
        )}

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
              {!storageConfigured && (
                <div style={{ marginBottom: '0.75rem', padding: '0.6rem 0.75rem', background: 'rgba(239,68,68,0.08)', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.25)', fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#EF4444" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                  <span>Uploads disabled — Azure Blob Storage is not connected. See the configuration guide above.</span>
                </div>
              )}
              <button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading || !storageConfigured}
                style={{
                  width: '100%',
                  padding: '0.75rem 1.5rem',
                  backgroundColor: selectedFile && !isUploading && storageConfigured ? 'var(--pinnacle-teal)' : 'var(--bg-tertiary)',
                  border: 'none',
                  borderRadius: '6px',
                  color: selectedFile && !isUploading && storageConfigured ? '#000' : 'var(--text-muted)',
                  cursor: selectedFile && !isUploading && storageConfigured ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                {isUploading ? 'Uploading...' : !storageConfigured ? 'Storage Not Connected' : 'Upload MPP File'}
              </button>
            </div>
          </div>
        </div>

        {/* Uploaded Files */}
        <div className="chart-card grid-full">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Files ({visibleFiles.length})</h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                value={fileSearchQuery}
                onChange={(e) => setFileSearchQuery(e.target.value)}
                placeholder="Search files..."
                style={{
                  padding: '0.3rem 0.55rem',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                  minWidth: '220px',
                }}
              />
              <button
                onClick={loadStoredFiles}
                style={{ padding: '0.25rem 0.75rem', backgroundColor: 'var(--bg-tertiary)', border: 'none', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                Refresh
              </button>
            </div>
          </div>
          <div className="chart-card-body" style={{ padding: '1rem' }}>
            {visibleFiles.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                {uploadedFiles.length === 0 ? 'No files in storage. Upload an MPP file above.' : 'No files match your search.'}
              </div>
            ) : (
              <table className="data-table" style={{ fontSize: '0.875rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>File Name</th>
                    <th>Version</th>
                    <th>Size</th>
                    <th>Project ID</th>
                    <th>Health Score</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFiles.map((file) => {
                    const isCurrentVersion = file.isCurrentVersion ?? filteredData?.projectDocuments?.some(
                      (d: any) =>
                        (d.storagePath === file.storagePath || d.storage_path === file.storagePath) &&
                        (d.isCurrentVersion === true || d.is_current_version === true)
                    );
                    const isDropdownOpen = expandedDropdownId === file.id;
                    const failedChecks = file.healthCheck?.results?.filter((r: HealthCheckResult) => !r.passed) || [];

                    return (
                      <React.Fragment key={file.id}>
                        <tr
                          data-file-row={file.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setExpandedDropdownId(isDropdownOpen ? null : file.id)}
                        >
                          <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setExpandedDropdownId(isDropdownOpen ? null : file.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                width="16"
                                height="16"
                                fill="none"
                                stroke="var(--text-muted)"
                                strokeWidth="2"
                                style={{
                                  transform: isDropdownOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                                  transition: 'transform 0.2s',
                                }}
                              >
                                <path d="M9 18l6-6-6-6" />
                              </svg>
                            </button>
                          </td>
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
                                Current
                              </span>
                            )}
                            {!isCurrentVersion && file.workdayProjectId && (
                              <span
                                style={{
                                  marginLeft: '0.5rem',
                                  fontSize: '0.7rem',
                                  padding: '0.15rem 0.4rem',
                                  backgroundColor: 'rgba(156,163,175,0.2)',
                                  color: 'var(--text-muted)',
                                  borderRadius: '4px',
                                  fontWeight: 500,
                                }}
                              >
                                Old
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              padding: '0.15rem 0.5rem',
                              borderRadius: '4px',
                              backgroundColor: isCurrentVersion ? 'rgba(64,224,208,0.12)' : 'rgba(156,163,175,0.1)',
                              color: isCurrentVersion ? 'var(--pinnacle-teal)' : 'var(--text-muted)',
                            }}>
                              v{file.version || 1}
                            </span>
                          </td>
                          <td>{(file.fileSize / 1024 / 1024).toFixed(2)} MB</td>
                          <td>{file.workdayProjectId || '-'}</td>
                          <td onClick={(e) => e.stopPropagation()}>
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
                          <td onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                onClick={() => handleDownloadFile(file)}
                                disabled={!file.storagePath || file.status === 'uploading' || file.status === 'processing' || file.status === 'syncing'}
                                style={{
                                  padding: '0.25rem 0.75rem',
                                  backgroundColor: 'var(--bg-tertiary)',
                                  color: 'var(--text-secondary)',
                                  border: 'none',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  cursor: !file.storagePath || file.status === 'uploading' || file.status === 'processing' || file.status === 'syncing' ? 'not-allowed' : 'pointer',
                                }}
                              >
                                Download
                              </button>
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

                        {/* Expandable row: card-based Health + Actions */}
                        {isDropdownOpen && (
                          <tr>
                            <td colSpan={8} style={{ padding: 0, background: 'var(--bg-tertiary)', verticalAlign: 'top' }}>
                              <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr auto', gap: '1.5rem', alignItems: 'start' }}>
                                {processingStage && processingFileId === file.id && (
                                  <div style={{ gridColumn: '1 / -1', marginBottom: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.9rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                      <div style={{ width: '14px', height: '14px', border: '2px solid var(--pinnacle-teal)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                      <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{processingStage.label}</strong>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.75rem' }}>
                                      {[
                                        { step: 1, label: 'Download' },
                                        { step: 2, label: 'Parse' },
                                        { step: 3, label: 'Convert' },
                                        { step: 4, label: 'Health Check' },
                                        { step: 5, label: 'Sync' },
                                        { step: 6, label: 'Match Hours' },
                                        { step: 7, label: 'Done' },
                                      ].map(({ step, label }) => (
                                        <div key={step} style={{ flex: 1, textAlign: 'center' }}>
                                          <div style={{
                                            height: '4px',
                                            borderRadius: '2px',
                                            backgroundColor: step < processingStage.step ? '#10B981'
                                              : step === processingStage.step ? 'var(--pinnacle-teal)'
                                                : 'var(--bg-tertiary)',
                                            transition: 'background-color 0.3s ease',
                                          }} />
                                          <div style={{
                                            fontSize: '0.62rem',
                                            color: step <= processingStage.step ? 'var(--text-secondary)' : 'var(--text-muted)',
                                            marginTop: '4px',
                                            fontWeight: step === processingStage.step ? 600 : 400,
                                          }}>
                                            {label}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                                      <div style={{
                                        height: '100%',
                                        width: `${(processingStage.step / 7) * 100}%`,
                                        borderRadius: '3px',
                                        backgroundColor: processingStage.step === 7 ? '#10B981' : 'var(--pinnacle-teal)',
                                        transition: 'width 0.5s ease',
                                      }} />
                                    </div>
                                    {!!(processDiagnostics[file.id] || []).length && (
                                      <div style={{ marginTop: '0.75rem', padding: '0.55rem', borderRadius: '6px', background: 'rgba(0,0,0,0.22)', border: '1px solid var(--border-color)', maxHeight: '150px', overflowY: 'auto' }}>
                                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Status Trace</div>
                                        {(processDiagnostics[file.id] || []).slice(-8).map((entry, idx) => (
                                          <div key={`${file.id}-diag-${idx}`} style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', lineHeight: 1.35, marginBottom: '0.2rem' }}>
                                            {entry}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {!processingStage && file.status === 'error' && !!(processDiagnostics[file.id] || []).length && (
                                  <div style={{ gridColumn: '1 / -1', marginBottom: '0.5rem', background: 'rgba(127,29,29,0.25)', border: '1px solid rgba(248,113,113,0.45)', borderRadius: 'var(--radius-md)', padding: '0.75rem' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#FCA5A5', marginBottom: '0.45rem' }}>Import Error Trace</div>
                                    {(processDiagnostics[file.id] || []).slice(-10).map((entry, idx) => (
                                      <div key={`${file.id}-err-${idx}`} style={{ fontSize: '0.68rem', color: '#FECACA', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', lineHeight: 1.35, marginBottom: '0.2rem' }}>
                                        {entry}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {/* Health card */}
                                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden', minWidth: 0 }}>
                                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                                      Health
                                    </span>
                                    {file.healthCheck && (
                                      <span style={{ padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 600, backgroundColor: file.healthCheck.score >= 80 ? 'rgba(16,185,129,0.2)' : file.healthCheck.score >= 50 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)', color: file.healthCheck.score >= 80 ? '#10B981' : file.healthCheck.score >= 50 ? '#F59E0B' : '#EF4444' }}>
                                        {file.healthCheck.score}%{file.healthCheck.totalChecks ? ` (${file.healthCheck.passed}/${file.healthCheck.totalChecks})` : ''}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ padding: '1rem' }}>
                                    {!file.healthCheck ? (
                                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Run MPXJ to analyze this plan.</p>
                                    ) : (file.healthCheck.results?.length ?? 0) === 0 ? (
                                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--text-primary)' }}>Score: {file.healthCheck.score}%.</strong> Re-run MPXJ for detailed checks.</p>
                                    ) : failedChecks.length === 0 ? (
                                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#10B981', fontWeight: 500 }}>All checks passed.</p>
                                    ) : (
                                      <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        {failedChecks.slice(0, 5).map((check: HealthCheckResult, idx: number) => (
                                          <li key={idx} style={{ color: 'var(--text-primary)' }}>{check.checkName}{check.message ? ` — ${check.message}` : ''}</li>
                                        ))}
                                        {failedChecks.length > 5 && <li style={{ color: 'var(--text-muted)' }}>+{failedChecks.length - 5} more. Open full report for details.</li>}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                                {/* Actions card */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
                                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Actions</div>
                                  <button onClick={() => setExpandedHealthFileId(expandedHealthFileId === file.id ? null : file.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                                    Full health report
                                  </button>
                                  {file.storagePath && (
                                    <button onClick={() => window.open(`/project-controls/health-report?storagePath=${encodeURIComponent(file.storagePath ?? '')}&autoPrint=1`, '_blank')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2h9l3 3v17H6z" /><path d="M9 7h6" /><path d="M9 11h6" /><path d="M9 15h3" /></svg>
                                      Print / Save as PDF
                                    </button>
                                  )}
                                  {file.workdayProjectId && (
                                    <button onClick={() => router.push(`/project-controls/wbs-gantt?projectId=${file.workdayProjectId}`)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><rect x="6" y="6" width="8" height="6" rx="1" /></svg>
                                      WBS Gantt
                                    </button>
                                  )}
                                  <button onClick={() => { const pid = file.workdayProjectId; router.push(pid ? `/project-controls/resourcing?projectId=${pid}&section=requirements` : '/project-controls/resourcing?section=requirements'); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--pinnacle-teal)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#000', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                    Resources
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
            {expandedHealthFileId && (() => {
              const file = uploadedFiles.find((f) => f.id === expandedHealthFileId);
              const h = file?.healthCheck;
              if (!file || !h) return null;
              const failedChecks = (h.results || []).filter(r => !r.passed);
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
                    {(!h.results || h.results.length === 0) ? (
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Re-run MPXJ to get detailed check results.</p>
                    ) : (
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
                    )}
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
                      <div style={{ fontSize: '0.9rem', marginBottom: '6px', fontWeight: 600, color: '#10B981' }}>Success</div>
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

        {/* Mapping: guided project-scoped workflow */}
        <div className="chart-card grid-full">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Mapping</h3>
          </div>
          <div className="chart-card-body" style={{ padding: '1.25rem 1.5rem' }}>
            <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Select a project to open one combined mapping board. Each Workday phase bucket contains both project tasks and hour entries.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem', alignItems: 'center' }}>
              <div style={{ minWidth: '180px' }}>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                  Project
                </label>
                <select
                  value={mappingProjectFilter}
                  onChange={(e) => setMappingProjectFilter(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem 0.6rem', fontSize: '0.875rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }}
                >
                  <option value="">Select project...</option>
                  {mappingProjectOptions.map((p: { id: string; name: string }) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: '220px' }}>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                  Search (tasks + hours)
                </label>
                <input
                  type="text"
                  value={mappingSearch}
                  onChange={(e) => setMappingSearch(e.target.value)}
                  placeholder="Filter entries..."
                  style={{ width: '100%', padding: '0.5rem 0.6rem', fontSize: '0.875rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }}
                />
              </div>
              <div style={{ minWidth: '220px', display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => handleAutoMatchWorkdayPhaseToHours(true)}
                  disabled={mappingSaving || !mappingProjectFilter}
                  style={{
                    padding: '0.55rem 0.9rem',
                    background: !mappingSaving && mappingProjectFilter ? 'var(--pinnacle-teal)' : 'var(--bg-tertiary)',
                    color: !mappingSaving && mappingProjectFilter ? '#000' : 'var(--text-muted)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: !mappingSaving && mappingProjectFilter ? 'pointer' : 'not-allowed',
                  }}
                >
                  {mappingSaving ? 'Matching...' : 'Re-Match Hours by Phase Name'}
                </button>
              </div>
            </div>

            {!mappingProjectFilter ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Select a project to begin mapping.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-card)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Hours: <strong style={{ color: 'var(--text-primary)' }}>{mappingProjectHours.length}</strong>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Mapped Hours: <strong style={{ color: 'var(--text-primary)' }}>{mappingProjectHours.filter((h: any) => Boolean(h.workdayPhaseId ?? h.workday_phase_id)).length}</strong>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Unassigned Hours: <strong style={{ color: 'var(--text-primary)' }}>{(hoursByWorkdayPhaseForProject.get('unassigned') || []).length}</strong>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Tasks Assigned to Buckets: <strong style={{ color: 'var(--text-primary)' }}>{mappingProjectTasks.filter((t: any) => Boolean(t.workdayPhaseId ?? t.workday_phase_id)).length}</strong>
                    </div>
                  </div>
                  {mappingResult && (
                    <div style={{
                      marginTop: '0.75rem',
                      padding: '0.6rem 0.8rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-secondary)',
                      fontSize: '0.8rem',
                      color: 'var(--text-primary)',
                    }}>
                      Last phase matching run: {mappingResult.matched} matched, {mappingResult.unmatched} unmatched, {mappingResult.considered} considered.
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '0.85rem', alignItems: 'start' }}>
                  {[{ id: 'unassigned', name: 'Unassigned' }, ...mappingProjectWorkdayPhases.map((wp: any) => ({ id: String(wp.id), name: String(wp.name || wp.id), unit: wp.unit }))].map((bucket: any) => {
                    const bucketKey = bucket.id;
                    const bucketPhaseId = bucketKey === 'unassigned' ? null : bucketKey;
                    const bucketTasks = tasksByWorkdayPhaseForProject.get(bucketKey as any) || [];
                    const bucketHours = hoursByWorkdayPhaseForProject.get(bucketKey as any) || [];
                    const pickerValue = mappingTaskPickerByBucket[bucketKey] || null;
                    const bucketTaskIds = new Set(bucketTasks.map((t: any) => String(t.id)));
                    const taskOptions = taskOptionsForSelectedProject.filter((opt) => !bucketTaskIds.has(opt.id));
                    return (
                      <div key={bucketKey} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {bucket.unit ? `${bucket.unit} -> ` : ''}{bucket.name}
                        </div>

                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-tertiary)', padding: '0.6rem' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.45rem' }}>
                            Tasks ({bucketTasks.length})
                          </div>
                          <SearchableDropdown
                            value={pickerValue}
                            options={taskOptions}
                            onChange={(id) => {
                              setMappingTaskPickerByBucket((prev) => ({ ...prev, [bucketKey]: id }));
                              void handleSelectTaskForBucket(bucketPhaseId, id);
                            }}
                            placeholder="Add task to this bucket..."
                            searchable={true}
                            clearable={false}
                            width="100%"
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.55rem', maxHeight: '210px', overflowY: 'auto' }}>
                            {bucketTasks.map((task: any) => (
                              <div key={`task-${bucketKey}-${task.id}`} style={{ border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.45rem', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', gap: '0.35rem' }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {task.name || task.taskName || task.id}
                                  </div>
                                  <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>
                                    {task.wbsCode || task.id} · Linked hours: {(hoursByTaskForMappingProject.get(String(task.id)) || []).length}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleAssignTaskToWorkdayPhase(String(task.id), null)}
                                  style={{ border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderRadius: 6, padding: '0.2rem 0.45rem', fontSize: '0.68rem', cursor: 'pointer' }}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-tertiary)', padding: '0.6rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.35rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                              Hours Entries ({bucketHours.length})
                            </div>
                            {bucketPhaseId && (
                              <button
                                type="button"
                                onClick={() => handleAutoMatchHoursToTasksInBucket(bucketPhaseId)}
                                disabled={mappingSaving}
                                style={{ border: '1px solid var(--border-color)', borderRadius: 999, padding: '0.18rem 0.45rem', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.66rem', fontWeight: 700, cursor: 'pointer' }}
                              >
                                Auto-Match
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '280px', overflowY: 'auto' }}>
                            {bucketHours.map((h: any) => {
                              const parsed = parseHourDescription(String(h.description ?? ''));
                              const selectedTaskId = String(h.taskId ?? h.task_id ?? '');
                              return (
                                <EnhancedTooltip key={`hour-${bucketKey}-${h.id}`} content={buildHourTooltip(h)}>
                                  <div style={{ border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.45rem', background: 'var(--bg-primary)', display: 'grid', gridTemplateColumns: '1fr', gap: '0.35rem' }}>
                                    <div style={{ fontSize: '0.73rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                      {String(h.date || '').slice(0, 10)} · {h.hours ?? 0}h · {h.id}
                                    </div>
                                    <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>
                                      Phase: {String(h.phases ?? parsed.phases ?? 'Unspecified')}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                                      <select
                                        value={bucketPhaseId || ''}
                                        onChange={(e) => handleAssignHourToWorkdayPhase(String(h.id), e.target.value || null)}
                                        style={{ width: '100%', padding: '0.25rem 0.35rem', fontSize: '0.7rem', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)' }}
                                      >
                                        <option value="">Unassigned phase</option>
                                        {mappingProjectWorkdayPhases.map((wp: any) => (
                                          <option key={`phase-opt-${wp.id}`} value={String(wp.id)}>
                                            {wp.name || wp.id}
                                          </option>
                                        ))}
                                      </select>
                                      <select
                                        value={selectedTaskId}
                                        onChange={(e) => handleAssignHourToTask(String(h.id), e.target.value || null)}
                                        style={{ width: '100%', padding: '0.25rem 0.35rem', fontSize: '0.7rem', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)' }}
                                      >
                                        <option value="">Link task...</option>
                                        {bucketTasks.map((task: any) => (
                                          <option key={`hour-task-opt-${h.id}-${task.id}`} value={String(task.id)}>
                                            {task.name || task.taskName || task.id}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                </EnhancedTooltip>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
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

              {/* Portfolio warning — shown when selected project has no portfolio */}
              {selectedProjectMissingPortfolio && (
                <div style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'rgba(251, 146, 60, 0.1)',
                  border: '1px solid rgba(251, 146, 60, 0.4)',
                  borderRadius: '6px',
                }}>
                  <div style={{ fontSize: '0.8rem', color: '#FB923C', fontWeight: 600, marginBottom: '0.5rem' }}>
                    No Portfolio Assigned
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    No active portfolio is currently assigned to this project. Please select a portfolio below to continue.
                  </div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Assign to Portfolio *
                  </label>
                  <SearchableDropdown
                    value={assignPortfolioId || null}
                    options={portfolioOptions}
                    onChange={(id) => setAssignPortfolioId(id || '')}
                    placeholder="Select a portfolio..."
                    searchable={true}
                    width="100%"
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  if (isUploading) return;
                  setShowHierarchyModal(false);
                  setWorkdayProjectId('');
                  setAssignPortfolioId('');
                }}
                disabled={isUploading}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text-secondary)',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  opacity: isUploading ? 0.65 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleUploadWithHierarchy}
                disabled={isUploading || !workdayProjectId || (selectedProjectMissingPortfolio && !assignPortfolioId)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor:
                    !isUploading && workdayProjectId && (!selectedProjectMissingPortfolio || assignPortfolioId)
                      ? 'var(--pinnacle-teal)'
                      : 'var(--bg-tertiary)',
                  border: 'none',
                  borderRadius: '4px',
                  color:
                    !isUploading && workdayProjectId && (!selectedProjectMissingPortfolio || assignPortfolioId)
                      ? '#000'
                      : 'var(--text-muted)',
                  cursor:
                    !isUploading && workdayProjectId && (!selectedProjectMissingPortfolio || assignPortfolioId)
                      ? 'pointer'
                      : 'not-allowed',
                }}
              >
                {isUploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
