'use client';

/**
 * @fileoverview PCA plan upload workstation route.
 *
 * Functional surface for upload -> parser publish workflow and project-level
 * version history visibility.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';

type PlanRow = {
  projectId: string;
  projectName: string;
  customer: string;
  lastUploadAt: string | null;
  daysSince: number | null;
  hasPlan: boolean;
  taskCount: number;
  status: 'missing' | 'overdue' | 'due_soon' | 'healthy';
};

type ProjectDocument = {
  id: string;
  projectId: string;
  fileName: string;
  storagePath: string | null;
  uploadedAt: string | null;
  version: number;
  isCurrentVersion: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function toText(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function toProjectDocuments(input: unknown[]): ProjectDocument[] {
  return input.map((item) => {
    const row = asRecord(item);
    const id = toText(row.id || row.documentId);
    const projectId = toText(row.projectId || row.project_id);
    const fileName = toText(row.fileName || row.file_name || row.name, 'Unnamed file');
    const storagePath = toText(row.storagePath || row.storage_path) || null;
    const uploadedAt = toText(row.uploadedAt || row.uploaded_at || row.createdAt || row.created_at || row.updatedAt || row.updated_at) || null;
    const versionRaw = Number(row.version);
    const version = Number.isFinite(versionRaw) && versionRaw > 0 ? versionRaw : 1;
    const currentRaw = row.isCurrentVersion ?? row.is_current_version;
    const isCurrentVersion = currentRaw === true || String(currentRaw).toLowerCase() === 'true' || String(currentRaw) === '1';
    return { id, projectId, fileName, storagePath, uploadedAt, version, isCurrentVersion };
  }).filter((doc) => Boolean(doc.id && doc.projectId));
}

export default function PcaPlanUploadsPage() {
  const { filteredData, data: fullData, refreshData } = useData();
  const { activeRole } = useRoleView();
  const { user } = useUser();

  const roleHeaders = useMemo(
    () => ({
      'x-role-view': activeRole.key,
      'x-actor-email': user?.email || '',
    }),
    [activeRole.key, user?.email],
  );

  const projects = useMemo(
    () => ((filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || []).map(asRecord),
    [filteredData?.projects, fullData?.projects],
  );
  const tasks = useMemo(
    () => ((filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || []).map(asRecord),
    [filteredData?.tasks, fullData?.tasks],
  );

  const allDocuments = useMemo<ProjectDocument[]>(() => {
    const source = ((fullData?.projectDocuments || []) as unknown[]);
    return toProjectDocuments(source);
  }, [fullData?.projectDocuments]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const rows = useMemo<PlanRow[]>(() => {
    const taskCountByProject = new Map<string, number>();
    for (const row of tasks) {
      const projectId = toText(row.projectId || row.project_id);
      if (!projectId) continue;
      taskCountByProject.set(projectId, (taskCountByProject.get(projectId) || 0) + 1);
    }

    const uploadByProject = new Map<string, Date>();
    for (const doc of allDocuments) {
      if (!doc.projectId || !doc.uploadedAt) continue;
      const uploadedAt = parseDate(doc.uploadedAt);
      if (!uploadedAt) continue;
      const current = uploadByProject.get(doc.projectId);
      if (!current || uploadedAt.getTime() > current.getTime()) {
        uploadByProject.set(doc.projectId, uploadedAt);
      }
    }

    return projects.map((project): PlanRow => {
      const projectId = toText(project.id || project.projectId);
      const projectName = toText(project.name || project.projectName, projectId || 'Project');
      const customer = toText(project.customer || project.customerName || project.customer_name, 'Unknown');
      const uploadedAt = uploadByProject.get(projectId) || null;
      const daysSince = uploadedAt ? Math.floor((Date.now() - uploadedAt.getTime()) / 86400000) : null;
      const hasPlan = Boolean(uploadedAt) || String(project.hasSchedule || project.has_schedule || '').toLowerCase() === 'true';
      let status: PlanRow['status'] = 'healthy';
      if (!hasPlan) status = 'missing';
      else if ((daysSince || 0) > 14) status = 'overdue';
      else if ((daysSince || 0) >= 7) status = 'due_soon';

      return {
        projectId,
        projectName,
        customer,
        lastUploadAt: uploadedAt ? uploadedAt.toISOString() : null,
        daysSince,
        hasPlan,
        taskCount: taskCountByProject.get(projectId) || 0,
        status,
      };
    });
  }, [allDocuments, projects, tasks]);

  const summary = useMemo(() => {
    const withPlan = rows.filter((row) => row.hasPlan).length;
    const missing = rows.filter((row) => row.status === 'missing').length;
    const overdue = rows.filter((row) => row.status === 'overdue').length;
    return { total: rows.length, withPlan, missing, overdue };
  }, [rows]);

  const selectedProject = useMemo(
    () => projects.find((project) => toText(project.id || project.projectId) === selectedProjectId) || null,
    [projects, selectedProjectId],
  );

  const projectVersions = useMemo(() => {
    if (!selectedProjectId) return [] as ProjectDocument[];
    return allDocuments
      .filter((doc) => doc.projectId === selectedProjectId && doc.fileName.toLowerCase().endsWith('.mpp'))
      .sort((a, b) => {
        const left = parseDate(a.uploadedAt)?.getTime() || 0;
        const right = parseDate(b.uploadedAt)?.getTime() || 0;
        return right - left;
      })
      .slice(0, 10);
  }, [allDocuments, selectedProjectId]);

  const mppDocumentCountByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const doc of allDocuments) {
      if (!doc.fileName.toLowerCase().endsWith('.mpp')) continue;
      map.set(doc.projectId, (map.get(doc.projectId) || 0) + 1);
    }
    return map;
  }, [allDocuments]);

  async function handleUpload(): Promise<void> {
    if (!selectedProjectId || !selectedFile) {
      setStatusMessage('Select a project and .mpp file first.');
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith('.mpp')) {
      setStatusMessage('Only .mpp files are accepted.');
      return;
    }

    const project = selectedProject;
    if (!project) {
      setStatusMessage('Selected project is not available in scope.');
      return;
    }

    setUploading(true);
    setStatusMessage('Uploading file to storage...');
    try {
      const storagePath = `mpp/${Date.now()}_${selectedFile.name}`;
      const uploadForm = new FormData();
      uploadForm.append('file', selectedFile);
      uploadForm.append('path', storagePath);

      const uploadRes = await fetch('/api/storage', { method: 'POST', body: uploadForm });
      const uploadJson = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) {
        throw new Error(String(uploadJson.error || 'Storage upload failed'));
      }

      const savedPath = toText(uploadJson?.data?.path, storagePath);
      const docId = `mpp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const existing = allDocuments.filter((doc) => doc.projectId === selectedProjectId);
      const nextVersion = existing.reduce((max, doc) => Math.max(max, doc.version), 0) + 1;

      for (const doc of existing) {
        await fetch('/api/data/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...roleHeaders },
          body: JSON.stringify({
            dataKey: 'projectDocuments',
            operation: 'update',
            records: [{ id: doc.id, isCurrentVersion: false }],
          }),
        }).catch(() => null);
      }

      const syncRes = await fetch('/api/data/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...roleHeaders },
        body: JSON.stringify({
          dataKey: 'projectDocuments',
          records: [
            {
              id: docId,
              documentId: docId,
              projectId: selectedProjectId,
              name: selectedFile.name,
              fileName: selectedFile.name,
              fileType: 'mpp',
              fileSize: selectedFile.size,
              documentType: 'MPP',
              storagePath: savedPath,
              uploadedAt: new Date().toISOString(),
              isActive: true,
              isCurrentVersion: true,
              version: nextVersion,
            },
          ],
        }),
      });
      const syncJson = await syncRes.json().catch(() => ({}));
      if (!syncRes.ok || !syncJson.success) {
        throw new Error(String(syncJson.error || 'Failed to save document metadata'));
      }

      setStatusMessage(`Upload complete (v${nextVersion}). Use Publish to parse and apply schedule data.`);
      setSelectedFile(null);
      await refreshData();
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handlePublish(projectId: string): Promise<void> {
    const project = projects.find((item) => toText(item.id || item.projectId) === projectId);
    const latest = allDocuments
      .filter((doc) => doc.projectId === projectId && doc.fileName.toLowerCase().endsWith('.mpp'))
      .sort((a, b) => (parseDate(b.uploadedAt)?.getTime() || 0) - (parseDate(a.uploadedAt)?.getTime() || 0))[0];

    if (!project || !latest) {
      setStatusMessage('No uploaded MPP document found for this project.');
      return;
    }

    setBusyProjectId(projectId);
    setStatusMessage(`Publishing ${latest.fileName}...`);
    try {
      const formData = new FormData();
      formData.append('documentId', latest.id);
      formData.append('projectId', projectId);
      if (latest.storagePath) formData.append('storagePath', latest.storagePath);

      const portfolioId = toText(project.portfolioId || project.portfolio_id);
      const customerId = toText(project.customerId || project.customer_id);
      const siteId = toText(project.siteId || project.site_id);
      if (portfolioId) formData.append('portfolioId', portfolioId);
      if (customerId) formData.append('customerId', customerId);
      if (siteId) formData.append('siteId', siteId);

      const response = await fetch('/api/documents/process-mpp', {
        method: 'POST',
        headers: roleHeaders,
        body: formData,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) {
        throw new Error(String(result.error || 'Parser publish failed'));
      }

      setStatusMessage(`Publish complete for ${toText(project.name || project.projectName, projectId)}.`);
      await refreshData();
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : 'Publish failed');
    } finally {
      setBusyProjectId(null);
    }
  }

  return (
    <RoleWorkstationShell
      role="pca"
      requiredTier="tier2"
      title="Plan Uploads"
      subtitle="Upload, parse, reconcile, and publish project plans with audit-backed workflow."
      actions={(
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href="/project-controls/project-plans" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Open Full Project Plans Engine</Link>
          <Link href="/role-views/pca/mapping" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Mapping Workspace</Link>
          <Link href="/role-views/pca/data-quality" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Data Quality</Link>
        </div>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.65rem' }}>
        {[
          { label: 'Projects in Scope', value: summary.total },
          { label: 'With Plan', value: summary.withPlan },
          { label: 'Missing Plan', value: summary.missing },
          { label: 'Overdue Uploads', value: summary.overdue, danger: summary.overdue > 0 },
        ].map((card) => (
          <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{card.label}</div>
            <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: card.danger ? '#EF4444' : 'var(--text-primary)' }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem', display: 'grid', gridTemplateColumns: '1.1fr 1fr auto', gap: '0.55rem', alignItems: 'end' }}>
        <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'grid', gap: 6 }}>
          Project
          <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: '0.45rem 0.55rem' }}>
            <option value="">Select project</option>
            {rows.map((row) => (
              <option key={row.projectId} value={row.projectId}>{row.projectName}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'grid', gap: 6 }}>
          MPP File
          <input type="file" accept=".mpp" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: '0.38rem' }} />
        </label>
        <button type="button" disabled={uploading} onClick={handleUpload} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: uploading ? 'var(--bg-secondary)' : 'var(--bg-tertiary)', color: 'var(--text-primary)', padding: '0.52rem 0.8rem', fontSize: '0.74rem', cursor: uploading ? 'not-allowed' : 'pointer' }}>
          {uploading ? 'Uploading...' : 'Upload Version'}
        </button>
      </div>

      {statusMessage ? (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{statusMessage}</div>
      ) : null}

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 120px 110px 100px 130px 120px', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Project</span><span>Customer</span><span>Last Upload</span><span>Days Since</span><span>Tasks</span><span>Status</span><span>Publish</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No projects available in current scope.</div>
        ) : rows.map((row) => (
          <div key={row.projectId} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 120px 110px 100px 130px 120px', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem', alignItems: 'center' }}>
            <span>{row.projectName}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{row.customer}</span>
            <span>{row.lastUploadAt ? new Date(row.lastUploadAt).toLocaleDateString() : 'Never'}</span>
            <span>{row.daysSince == null ? '-' : `${row.daysSince}d`}</span>
            <span>{row.taskCount}</span>
            <span style={{ color: row.status === 'missing' || row.status === 'overdue' ? '#EF4444' : row.status === 'due_soon' ? '#F59E0B' : '#10B981' }}>
              {row.status === 'missing' ? 'Missing' : row.status === 'overdue' ? 'Overdue' : row.status === 'due_soon' ? 'Due Soon' : 'Healthy'}
            </span>
            <button
              type="button"
              onClick={() => handlePublish(row.projectId)}
              disabled={busyProjectId === row.projectId || !mppDocumentCountByProject.get(row.projectId)}
              style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: '0.35rem 0.45rem', fontSize: '0.68rem', cursor: busyProjectId === row.projectId || !mppDocumentCountByProject.get(row.projectId) ? 'not-allowed' : 'pointer' }}
            >
              {busyProjectId === row.projectId ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.45rem' }}>
          Latest Versions {selectedProject ? `for ${toText(selectedProject.name || selectedProject.projectName, selectedProjectId)}` : '(select a project above)'}
        </div>
        {selectedProjectId && projectVersions.length === 0 ? (
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>No uploaded versions for selected project.</div>
        ) : !selectedProjectId ? (
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Select a project to view version history.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 160px 100px', gap: '0.35rem 0.55rem', fontSize: '0.72rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Version</span>
            <span style={{ color: 'var(--text-muted)' }}>File</span>
            <span style={{ color: 'var(--text-muted)' }}>Uploaded</span>
            <span style={{ color: 'var(--text-muted)' }}>Current</span>
            {projectVersions.map((doc) => (
              <React.Fragment key={doc.id}>
                <span>v{doc.version}</span>
                <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.fileName}</span>
                <span>{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString() : '-'}</span>
                <span style={{ color: doc.isCurrentVersion ? '#10B981' : 'var(--text-muted)' }}>{doc.isCurrentVersion ? 'Yes' : 'No'}</span>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </RoleWorkstationShell>
  );
}
