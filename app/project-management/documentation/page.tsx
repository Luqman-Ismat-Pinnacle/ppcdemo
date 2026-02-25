'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import ContainerLoader from '@/components/ui/ContainerLoader';
import { useData } from '@/lib/data-context';
import { useAuth } from '@/lib/auth-context';

type DocType = 'DRD' | 'Workflow' | 'QMP' | 'SOP';
type FileFilter = 'all' | 'pdf' | 'word';

type DocRecord = {
  id: string;
  docType: DocType;
  name: string;
  owner: string;
  dueDate?: string | null;
  status?: string;
  clientSignoffRequired?: boolean;
  clientSignoffComplete?: boolean;
  latestVersionId?: string | null;
  portfolioId?: string | null;
  customerId?: string | null;
  siteId?: string | null;
  projectId?: string | null;
};

type DocVersion = {
  id: string;
  recordId: string;
  versionNumber: number;
  fileName: string;
  fileUrl?: string | null;
  blobPath: string;
  mimeType?: string | null;
  fileSize?: number | null;
  uploadedAt?: string;
  uploadedBy?: string | null;
  notes?: string | null;
  isLatest: boolean;
};

const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Pending Client', 'Complete'];

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
};

function isPdfOrWord(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.pdf') || lower.endsWith('.doc') || lower.endsWith('.docx');
}

function mapRecord(raw: any): DocRecord {
  return {
    id: String(raw.id),
    docType: (raw.docType ?? raw.doc_type ?? 'DRD') as DocType,
    name: String(raw.name || 'Untitled'),
    owner: String(raw.owner || 'System'),
    dueDate: (raw.dueDate ?? raw.due_date ?? null) as string | null,
    status: String(raw.status || 'Not Started'),
    clientSignoffRequired: Boolean(raw.clientSignoffRequired ?? raw.client_signoff_required),
    clientSignoffComplete: Boolean(raw.clientSignoffComplete ?? raw.client_signoff_complete),
    latestVersionId: (raw.latestVersionId ?? raw.latest_version_id ?? null) as string | null,
    portfolioId: (raw.portfolioId ?? raw.portfolio_id ?? null) as string | null,
    customerId: (raw.customerId ?? raw.customer_id ?? null) as string | null,
    siteId: (raw.siteId ?? raw.site_id ?? null) as string | null,
    projectId: (raw.projectId ?? raw.project_id ?? null) as string | null,
  };
}

function mapVersion(raw: any): DocVersion {
  return {
    id: String(raw.id),
    recordId: String(raw.recordId ?? raw.record_id),
    versionNumber: Number(raw.versionNumber ?? raw.version_number ?? 1),
    fileName: String(raw.fileName ?? raw.file_name ?? ''),
    fileUrl: (raw.fileUrl ?? raw.file_url ?? null) as string | null,
    blobPath: String(raw.blobPath ?? raw.blob_path ?? ''),
    mimeType: (raw.mimeType ?? raw.mime_type ?? null) as string | null,
    fileSize: Number(raw.fileSize ?? raw.file_size ?? 0) || null,
    uploadedAt: (raw.uploadedAt ?? raw.uploaded_at ?? null) as string | undefined,
    uploadedBy: (raw.uploadedBy ?? raw.uploaded_by ?? null) as string | null,
    notes: (raw.notes ?? null) as string | null,
    isLatest: Boolean(raw.isLatest ?? raw.is_latest),
  };
}

async function callDocsApi(payload: Record<string, unknown>) {
  const res = await fetch('/api/project-documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export default function DocumentationPage() {
  const { filteredData, isLoading, refreshData, hierarchyFilter } = useData();
  const { user } = useAuth();
  const [fileFilter, setFileFilter] = useState<FileFilter>('all');
  const [expandedRecords, setExpandedRecords] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string>('');
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [metaDraft, setMetaDraft] = useState<Record<string, Partial<DocRecord>>>({});
  const [uploadingRecordId, setUploadingRecordId] = useState<string>('');

  const fileInputByType = {
    DRD: useRef<HTMLInputElement | null>(null),
    Workflow: useRef<HTMLInputElement | null>(null),
    QMP: useRef<HTMLInputElement | null>(null),
    SOP: useRef<HTMLInputElement | null>(null),
  } as const;
  const fileInputByRecord = useRef<Record<string, HTMLInputElement | null>>({});

  const ownerName = user?.user_metadata?.name || user?.email || 'System';

  const records = useMemo(() => ((filteredData.projectDocumentRecords || []) as any[]).map(mapRecord), [filteredData.projectDocumentRecords]);
  const versions = useMemo(() => ((filteredData.projectDocumentVersions || []) as any[]).map(mapVersion), [filteredData.projectDocumentVersions]);

  const versionsByRecord = useMemo(() => {
    const map = new Map<string, DocVersion[]>();
    versions.forEach((v) => {
      if (!isPdfOrWord(v.fileName)) return;
      if (fileFilter === 'pdf' && !v.fileName.toLowerCase().endsWith('.pdf')) return;
      if (fileFilter === 'word' && !(v.fileName.toLowerCase().endsWith('.doc') || v.fileName.toLowerCase().endsWith('.docx'))) return;
      const list = map.get(v.recordId) || [];
      list.push(v);
      map.set(v.recordId, list);
    });
    for (const list of map.values()) list.sort((a, b) => b.versionNumber - a.versionNumber);
    return map;
  }, [versions, fileFilter]);

  const recordsByType = useMemo(() => {
    const byType: Record<DocType, DocRecord[]> = { DRD: [], Workflow: [], QMP: [], SOP: [] };
    records.forEach((r) => {
      const list = versionsByRecord.get(r.id) || [];
      if (list.length === 0) return;
      byType[r.docType].push(r);
    });
    (Object.keys(byType) as DocType[]).forEach((type) => {
      byType[type].sort((a, b) => a.name.localeCompare(b.name));
    });
    return byType;
  }, [records, versionsByRecord]);

  const toggleExpand = useCallback((recordId: string) => {
    setExpandedRecords((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  }, []);

  const saveRecordMeta = useCallback(async (record: DocRecord) => {
    const draft = metaDraft[record.id] || {};
    setSavingKey(`meta-${record.id}`);
    try {
      await callDocsApi({
        action: 'updateDocumentRecordMetadata',
        recordId: record.id,
        owner: draft.owner ?? record.owner,
        dueDate: draft.dueDate ?? record.dueDate ?? null,
        status: draft.status ?? record.status ?? 'Not Started',
        clientSignoffRequired: draft.clientSignoffRequired ?? record.clientSignoffRequired ?? false,
        clientSignoffComplete: draft.clientSignoffComplete ?? record.clientSignoffComplete ?? false,
        updatedBy: ownerName,
      });
      await refreshData();
    } finally {
      setSavingKey('');
    }
  }, [metaDraft, ownerName, refreshData]);

  const saveVersionNotes = useCallback(async (versionId: string, fallbackNotes: string | null | undefined) => {
    const notes = notesDraft[versionId] ?? fallbackNotes ?? '';
    setSavingKey(`notes-${versionId}`);
    try {
      await callDocsApi({ action: 'updateDocumentVersionNotes', versionId, notes });
      await refreshData();
    } finally {
      setSavingKey('');
    }
  }, [notesDraft, refreshData]);

  const handleCreateRecord = useCallback(async (docType: DocType) => {
    setSavingKey(`create-${docType}`);
    try {
      await callDocsApi({
        action: 'createDocumentRecord',
        docType,
        name: `${docType} Document`,
        owner: ownerName,
        projectId: hierarchyFilter?.project || null,
        portfolioId: hierarchyFilter?.portfolio || null,
        customerId: hierarchyFilter?.customer || null,
        siteId: hierarchyFilter?.site || null,
        status: 'Not Started',
        clientSignoffRequired: false,
        clientSignoffComplete: false,
      });
      await refreshData();
    } finally {
      setSavingKey('');
    }
  }, [hierarchyFilter?.customer, hierarchyFilter?.portfolio, hierarchyFilter?.project, hierarchyFilter?.site, ownerName, refreshData]);

  const uploadForRecord = useCallback(async (record: DocRecord, file: File) => {
    if (!isPdfOrWord(file.name)) {
      alert('Please upload PDF or Word files only.');
      return;
    }

    const scopedProject = record.projectId || hierarchyFilter?.project || 'global';
    const path = `docs/${scopedProject}/${record.docType}/${record.id}/${Date.now()}-${file.name}`;
    setUploadingRecordId(record.id);
    try {
      const { data: uploadData, error } = await storageApi.upload(path, file);
      if (error || !uploadData?.path) throw new Error(error?.message || 'Upload failed');

      await callDocsApi({
        action: 'uploadDocumentVersion',
        recordId: record.id,
        fileName: file.name,
        blobPath: uploadData.path,
        mimeType: file.type || null,
        fileSize: file.size,
        uploadedBy: ownerName,
        notes: '',
      });

      await refreshData();
    } catch (err: any) {
      alert(err.message || 'Upload failed');
    } finally {
      setUploadingRecordId('');
    }
  }, [hierarchyFilter?.project, ownerName, refreshData]);

  const handleDeleteLatest = useCallback(async (recordId: string) => {
    if (!confirm('Delete latest version for this document?')) return;
    setSavingKey(`delete-${recordId}`);
    try {
      await callDocsApi({ action: 'deleteLatestDocumentVersion', recordId });
      await refreshData();
    } finally {
      setSavingKey('');
    }
  }, [refreshData]);

  if (isLoading) {
    return (
      <div className="page-panel" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ContainerLoader message="Loading Documentation..." minHeight={200} />
      </div>
    );
  }

  const renderSection = (type: DocType, subtitle: string) => {
    const rows = recordsByType[type] || [];
    return (
      <section key={type} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem', gap: '0.75rem' }}>
          <div>
            <div style={{ color: 'var(--pinnacle-teal)', fontWeight: 800, fontSize: '0.82rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{type}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{subtitle}</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => handleCreateRecord(type)}
              style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.35rem 0.7rem', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.78rem' }}
            >
              {savingKey === `create-${type}` ? 'Adding...' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => fileInputByType[type].current?.click()}
              style={{ border: 'none', borderRadius: 8, padding: '0.35rem 0.7rem', background: 'var(--pinnacle-teal)', color: '#041717', fontWeight: 800, fontSize: '0.78rem' }}
            >
              Upload New
            </button>
            <input
              ref={fileInputByType[type]}
              type="file"
              accept=".pdf,.doc,.docx"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const targetRecord = rows[0];
                if (!targetRecord) {
                  await handleCreateRecord(type);
                  await refreshData();
                  const refreshed = ((filteredData.projectDocumentRecords || []) as any[]).map(mapRecord).find((r) => r.docType === type);
                  if (!refreshed) return;
                  await uploadForRecord(refreshed, f);
                  return;
                }
                await uploadForRecord(targetRecord, f);
              }}
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.35rem 0.1rem' }}>
            No documents for {type} in current global filters.
          </div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', minWidth: 1250 }}>
              <thead>
                <tr>
                  <th style={{ width: 44 }} />
                  <th>Name</th>
                  <th>Owner</th>
                  <th>Version</th>
                  <th>Upload Date</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Client Signoff Required</th>
                  <th>Client Signoff Complete</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((record) => {
                  const list = versionsByRecord.get(record.id) || [];
                  const latest = list.find((v) => v.isLatest) || list[0];
                  const old = list.filter((v) => v.id !== latest?.id);
                  const draft = metaDraft[record.id] || {};
                  const current = { ...record, ...draft };
                  const latestNotes = latest ? (notesDraft[latest.id] ?? latest.notes ?? '') : '';
                  return (
                    <React.Fragment key={record.id}>
                      <tr>
                        <td>
                          <button type="button" onClick={() => toggleExpand(record.id)} style={{ border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.95rem', cursor: 'pointer' }}>
                            {expandedRecords.has(record.id) ? '▾' : '▸'}
                          </button>
                        </td>
                        <td>{record.name}</td>
                        <td>
                          <input
                            type="text"
                            value={String(current.owner || '')}
                            onChange={(e) => setMetaDraft((prev) => ({ ...prev, [record.id]: { ...(prev[record.id] || {}), owner: e.target.value } }))}
                            onBlur={() => saveRecordMeta(record)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void saveRecordMeta(record); }}
                            style={{ width: '100%', minWidth: 140, background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.2rem 0.4rem' }}
                          />
                        </td>
                        <td>{latest ? `v${latest.versionNumber}` : '-'}</td>
                        <td>{latest?.uploadedAt ? new Date(latest.uploadedAt).toLocaleDateString() : '-'}</td>
                        <td>
                          <input
                            type="date"
                            value={String(current.dueDate || '')}
                            onChange={(e) => setMetaDraft((prev) => ({ ...prev, [record.id]: { ...(prev[record.id] || {}), dueDate: e.target.value || null } }))}
                            onBlur={() => saveRecordMeta(record)}
                            style={{ width: '100%', minWidth: 140, background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.2rem 0.4rem' }}
                          />
                        </td>
                        <td>
                          <select
                            value={String(current.status || 'Not Started')}
                            onChange={(e) => setMetaDraft((prev) => ({ ...prev, [record.id]: { ...(prev[record.id] || {}), status: e.target.value } }))}
                            onBlur={() => saveRecordMeta(record)}
                            style={{ width: '100%', minWidth: 130, background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.2rem 0.4rem' }}
                          >
                            {STATUS_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(current.clientSignoffRequired)}
                            onChange={(e) => {
                              setMetaDraft((prev) => ({ ...prev, [record.id]: { ...(prev[record.id] || {}), clientSignoffRequired: e.target.checked } }));
                              void saveRecordMeta({ ...record, clientSignoffRequired: e.target.checked });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(current.clientSignoffComplete)}
                            onChange={(e) => {
                              setMetaDraft((prev) => ({ ...prev, [record.id]: { ...(prev[record.id] || {}), clientSignoffComplete: e.target.checked } }));
                              void saveRecordMeta({ ...record, clientSignoffComplete: e.target.checked });
                            }}
                          />
                        </td>
                        <td>
                          {latest ? (
                            <input
                              type="text"
                              value={latestNotes}
                              onChange={(e) => setNotesDraft((prev) => ({ ...prev, [latest.id]: e.target.value }))}
                              onBlur={() => saveVersionNotes(latest.id, latest.notes)}
                              onKeyDown={(e) => { if (e.key === 'Enter') void saveVersionNotes(latest.id, latest.notes); }}
                              style={{ width: '100%', minWidth: 220, background: 'var(--bg-input)', color: 'var(--text-primary)', border: savingKey === `notes-${latest.id}` ? '1px solid var(--pinnacle-teal)' : '1px solid var(--border-color)', borderRadius: 6, padding: '0.2rem 0.4rem' }}
                            />
                          ) : '-'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => fileInputByRecord.current[record.id]?.click()}
                              style={{ border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.2rem 0.45rem', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.72rem', fontWeight: 700 }}
                            >
                              {uploadingRecordId === record.id ? 'Uploading...' : 'Upload'}
                            </button>
                            <input
                              ref={(el) => { fileInputByRecord.current[record.id] = el; }}
                              type="file"
                              accept=".pdf,.doc,.docx"
                              style={{ display: 'none' }}
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                if (!f) return;
                                await uploadForRecord(record, f);
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => void handleDeleteLatest(record.id)}
                              style={{ border: '1px solid #8b1a1a', borderRadius: 6, padding: '0.2rem 0.45rem', background: '#2a1010', color: '#fecaca', fontSize: '0.72rem', fontWeight: 700 }}
                            >
                              {savingKey === `delete-${record.id}` ? 'Deleting...' : 'Delete'}
                            </button>
                            {latest?.blobPath ? (
                              <a href={`/api/documents/download?path=${encodeURIComponent(latest.blobPath)}`} style={{ border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.2rem 0.45rem', color: 'var(--link-color)', textDecoration: 'none', fontSize: '0.72rem', fontWeight: 700 }}>
                                Download
                              </a>
                            ) : null}
                          </div>
                        </td>
                      </tr>

                      {expandedRecords.has(record.id) && old.map((ver) => (
                        <tr key={ver.id} style={{ background: 'var(--bg-secondary)' }}>
                          <td />
                          <td style={{ color: 'var(--text-muted)' }}>{record.name} (older)</td>
                          <td>{record.owner}</td>
                          <td>{`v${ver.versionNumber}`}</td>
                          <td>{ver.uploadedAt ? new Date(ver.uploadedAt).toLocaleDateString() : '-'}</td>
                          <td>{current.dueDate || '-'}</td>
                          <td>{current.status || '-'}</td>
                          <td>{current.clientSignoffRequired ? 'Yes' : 'No'}</td>
                          <td>{current.clientSignoffComplete ? 'Yes' : 'No'}</td>
                          <td>
                            <input
                              type="text"
                              value={notesDraft[ver.id] ?? ver.notes ?? ''}
                              onChange={(e) => setNotesDraft((prev) => ({ ...prev, [ver.id]: e.target.value }))}
                              onBlur={() => saveVersionNotes(ver.id, ver.notes)}
                              onKeyDown={(e) => { if (e.key === 'Enter') void saveVersionNotes(ver.id, ver.notes); }}
                              style={{ width: '100%', minWidth: 220, background: 'var(--bg-input)', color: 'var(--text-primary)', border: savingKey === `notes-${ver.id}` ? '1px solid var(--pinnacle-teal)' : '1px solid var(--border-color)', borderRadius: 6, padding: '0.2rem 0.4rem' }}
                            />
                          </td>
                          <td>
                            {ver.blobPath ? (
                              <a href={`/api/documents/download?path=${encodeURIComponent(ver.blobPath)}`} style={{ border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.2rem 0.45rem', color: 'var(--link-color)', textDecoration: 'none', fontSize: '0.72rem', fontWeight: 700 }}>
                                Download
                              </a>
                            ) : '-'}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="page-panel" style={{ padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div>
          <div style={{ color: 'var(--pinnacle-teal)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800, fontSize: '0.84rem' }}>Project Documentation</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
            Versioned DRD, Workflow, QMP, and SOP records. Latest version is shown in the top row; older versions are in the dropdown.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {([
            { key: 'all', label: 'All' },
            { key: 'pdf', label: 'PDF' },
            { key: 'word', label: 'Word' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFileFilter(opt.key)}
              style={{ border: '1px solid var(--border-color)', borderRadius: 999, padding: '0.25rem 0.65rem', fontSize: '0.76rem', fontWeight: 700, background: fileFilter === opt.key ? 'var(--pinnacle-teal)' : 'var(--bg-secondary)', color: fileFilter === opt.key ? '#041717' : 'var(--text-primary)' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {renderSection('DRD', 'Data requirements and source mappings')}
      {renderSection('Workflow', 'Process and operational workflows')}
      {renderSection('QMP', 'Quality management plan documentation')}
      {renderSection('SOP', 'Operating procedures and instructions')}
    </div>
  );
}
