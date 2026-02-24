'use client';

/**
 * Project Management → Documentation
 *
 * Main workspace for project leads to manage key documents:
 * - DRD
 * - Workflow
 * - QMP
 * - SOP
 *
 * Uses the same Azure Blob Storage container (`projectdoc`) as project plans and
 * global filters from DataContext (project / hierarchy / date) via `filteredData`.
 *
 * Each section:
 * - Filters to PDF / Word files for the selected project
 * - Allows new uploads into Blob storage + `project_documents`
 * - Exposes document-level metadata:
 *   - Due date
 *   - Status
 *   - Client signoff required?
 *   - Client signoff complete?
 *
 * Metadata is persisted as a small JSON object in `project_documents.description`
 * to avoid schema changes and integrate with existing data-sync APIs.
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useData } from '@/lib/data-context';
import ContainerLoader from '@/components/ui/ContainerLoader';

const STORAGE_BUCKET = 'projectdoc';

type DocType = 'DRD' | 'Workflow' | 'QMP' | 'SOP';
type FileFilter = 'all' | 'pdf' | 'word';

type DocumentMeta = {
  dueDate: string | null;
  status: string;
  clientSignoffRequired: boolean;
  clientSignoffComplete: boolean;
};

type ProjectDocumentRow = {
  id: string;
  projectId: string | null;
  name: string;
  fileName: string;
  fileType?: string;
  documentType: DocType;
  storagePath: string;
  description?: string | null;
  uploadedAt?: string;
};

const DEFAULT_META: DocumentMeta = {
  dueDate: null,
  status: 'Not Started',
  clientSignoffRequired: false,
  clientSignoffComplete: false,
};

function parseMeta(description: unknown): DocumentMeta {
  if (typeof description !== 'string' || !description.trim().startsWith('{')) {
    return { ...DEFAULT_META };
  }
  try {
    const parsed = JSON.parse(description) as Partial<DocumentMeta>;
    return {
      dueDate: parsed.dueDate ?? null,
      status: parsed.status ?? 'Not Started',
      clientSignoffRequired: parsed.clientSignoffRequired ?? false,
      clientSignoffComplete: parsed.clientSignoffComplete ?? false,
    };
  } catch {
    return { ...DEFAULT_META };
  }
}

function buildDescription(meta: DocumentMeta): string {
  return JSON.stringify(meta);
}

// Reuse the same storage API helpers as project-plans page
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

const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Pending Client', 'Complete'];

export default function DocumentationPage() {
  const { filteredData, isLoading } = useData();
  const data = filteredData;

  const allProjects = useMemo(() => (data.projects || []) as any[], [data.projects]);
  const [fileFilter, setFileFilter] = useState<FileFilter>('all');
  const uploadProjectId = useMemo(() => {
    const ids = allProjects.map((p) => (p.id || p.projectId)).filter(Boolean);
    return ids.length === 1 ? String(ids[0]) : null;
  }, [allProjects]);

  const projectDocuments = useMemo(() => (data.projectDocuments || []) as any[], [data.projectDocuments]);

  const docsByType: Record<DocType, ProjectDocumentRow[]> = useMemo(() => {
    const visibleProjectIds = new Set(
      allProjects.map((p) => p.id || p.projectId).filter((id: string | null | undefined) => !!id),
    );
    const docs = projectDocuments
      .map((d) => {
        const documentType = (d.documentType || d.document_type || '').toString() as DocType | '';
        if (!['DRD', 'Workflow', 'QMP', 'SOP'].includes(documentType)) return null;
        const id = (d.id || d.documentId) as string | undefined;
        if (!id) return null;
        const projectId = (d.projectId || d.project_id || null) as string | null;
        const fileName = (d.fileName || d.file_name || '') as string;
        if (!fileName || !isPdfOrWord(fileName)) return null;
        if (projectId && !visibleProjectIds.has(projectId)) {
          // respect global project filters
          return null;
        }
        return {
          id,
          projectId,
          name: (d.name || fileName) as string,
          fileName,
          fileType: (d.fileType || d.file_type || '') as string | undefined,
          documentType,
          storagePath: (d.storagePath || d.storage_path || '') as string,
          description: (d.description || null) as string | null,
          uploadedAt: (d.uploadedAt || d.uploaded_at || null) as string | undefined,
        } as ProjectDocumentRow;
      })
      .filter(Boolean) as ProjectDocumentRow[];

    const byType: Record<DocType, ProjectDocumentRow[]> = {
      DRD: [],
      Workflow: [],
      QMP: [],
      SOP: [],
    };
    docs.forEach((doc) => {
      byType[doc.documentType].push(doc);
    });
    return byType;
  }, [allProjects, projectDocuments]);

  const [metaById, setMetaById] = useState<Record<string, DocumentMeta>>({});

  // Initialize meta from description when documents change
  useEffect(() => {
    const next: Record<string, DocumentMeta> = {};
    (['DRD', 'Workflow', 'QMP', 'SOP'] as DocType[]).forEach((type) => {
      docsByType[type].forEach((doc) => {
        next[doc.id] = parseMeta(doc.description);
      });
    });
    setMetaById(next);
  }, [docsByType]);

  const updateMeta = useCallback(
    async (doc: ProjectDocumentRow, partial: Partial<DocumentMeta>) => {
      const current = metaById[doc.id] ?? DEFAULT_META;
      const next: DocumentMeta = { ...current, ...partial };
      setMetaById((prev) => ({ ...prev, [doc.id]: next }));

      // Persist into project_documents.description via generic data sync API
      try {
        await fetch('/api/data/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataKey: 'projectDocuments',
            operation: 'update',
            records: [{ id: doc.id, description: buildDescription(next) }],
          }),
        });
      } catch {
        // swallow; UI already optimistic
      }
    },
    [metaById],
  );

  const fileInputs = {
    DRD: useRef<HTMLInputElement | null>(null),
    Workflow: useRef<HTMLInputElement | null>(null),
    QMP: useRef<HTMLInputElement | null>(null),
    SOP: useRef<HTMLInputElement | null>(null),
  } as const;

  const handleUploadClick = (type: DocType) => {
    if (!uploadProjectId) {
      alert('Set the global hierarchy filter to a single project to upload documentation.');
      return;
    }
    fileInputs[type].current?.click();
  };

  const handleFileChange = async (type: DocType, evt: React.ChangeEvent<HTMLInputElement>) => {
    const file = evt.target.files?.[0];
    if (!file || !uploadProjectId) return;
    if (!isPdfOrWord(file.name)) {
      alert('Please upload a PDF or Word document.');
      return;
    }

    const safeProjectId = uploadProjectId;
    const path = `docs/${safeProjectId}/${type}/${file.name}`;

    const { data: uploadData, error } = await storageApi.upload(path, file);
    if (error || !uploadData?.path) {
      alert(`Upload failed: ${error?.message || 'unknown error'}`);
      return;
    }

    const id = `DOC_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Save metadata to project_documents via data sync API
    await fetch('/api/data/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataKey: 'projectDocuments',
        records: [
          {
            id,
            documentId: id,
            projectId: safeProjectId,
            name: file.name,
            fileName: file.name,
            fileType: file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'Word',
            fileSize: file.size,
            documentType: type,
            storagePath: uploadData.path,
            storageBucket: STORAGE_BUCKET,
            uploadedAt: new Date().toISOString(),
            isActive: true,
            version: 1,
            description: buildDescription(DEFAULT_META),
          },
        ],
      }),
    });

    // Clear input so same file can be re-selected if needed
    evt.target.value = '';
  };

  if (isLoading) {
    return (
      <div
        className="page-panel"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}
      >
        <ContainerLoader message="Loading Documentation..." minHeight={200} />
      </div>
    );
  }

  const renderSection = (type: DocType, description: string) => {
    const rows = docsByType[type].filter((doc) => {
      if (fileFilter === 'all') return true;
      const lower = (doc.fileName || '').toLowerCase();
      if (fileFilter === 'pdf') return lower.endsWith('.pdf');
      return lower.endsWith('.doc') || lower.endsWith('.docx');
    });

    return (
      <section
        key={type}
        style={{
          borderRadius: 12,
          border: '1px solid var(--border-color)',
          background: 'var(--bg-card)',
          padding: '1.2rem 1.4rem',
          marginBottom: '1.2rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
            gap: '0.75rem',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--pinnacle-teal)',
              }}
            >
              {type} Documentation
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{description}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleUploadClick(type)}
              style={{
                borderRadius: 999,
                padding: '0.4rem 1rem',
                background: 'var(--pinnacle-teal)',
                color: '#fff',
                border: 'none',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Upload {type}
            </button>
            <span
              style={{
                fontSize: '0.72rem',
                padding: '0.2rem 0.55rem',
                borderRadius: 999,
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                background: 'var(--bg-secondary)',
              }}
            >
              {rows.length} file{rows.length !== 1 ? 's' : ''}
            </span>
            <input
              ref={fileInputs[type]}
              type="file"
              accept=".pdf,.doc,.docx"
              style={{ display: 'none' }}
              onChange={(e) => handleFileChange(type, e)}
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              padding: '0.6rem 0.4rem',
            }}
          >
            No {type} documents for the current filters. Use global hierarchy filters, then upload the first file.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '0.85rem', minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Document</th>
                  <th style={{ minWidth: 120 }}>Uploaded</th>
                  <th style={{ minWidth: 140 }}>Due Date</th>
                  <th style={{ minWidth: 140 }}>Status</th>
                  <th style={{ minWidth: 170 }}>Client Signoff Required?</th>
                  <th style={{ minWidth: 170 }}>Client Signoff Complete?</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((doc) => {
                  const meta = metaById[doc.id] ?? DEFAULT_META;
                  return (
                    <tr key={doc.id}>
                      <td>
                        <a href={`/api/documents/download?id=${encodeURIComponent(doc.id)}`} style={{ color: 'var(--link-color)', textDecoration: 'none', fontWeight: 600 }}>
                          {doc.name}
                        </a>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{doc.fileName}</div>
                      </td>
                      <td>{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : '-'}</td>
                      <td>
                        <input
                          type="date"
                          value={meta.dueDate ?? ''}
                          onChange={(e) => updateMeta(doc, { dueDate: e.target.value || null })}
                          style={{
                            fontSize: '0.8rem',
                            padding: '0.15rem 0.35rem',
                            borderRadius: 6,
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                          }}
                        />
                      </td>
                      <td>
                        <select
                          value={meta.status}
                          onChange={(e) => updateMeta(doc, { status: e.target.value })}
                          style={{
                            fontSize: '0.8rem',
                            padding: '0.2rem 0.4rem',
                            borderRadius: 6,
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={meta.clientSignoffRequired}
                          onChange={(e) => updateMeta(doc, { clientSignoffRequired: e.target.checked })}
                        />
                      </td>
                      <td>
                        <input type="checkbox" checked={meta.clientSignoffComplete} onChange={(e) => updateMeta(doc, { clientSignoffComplete: e.target.checked })} />
                        {meta.clientSignoffRequired && !meta.clientSignoffComplete && (
                          <div style={{ fontSize: '0.68rem', color: '#f59e0b', marginTop: 4 }}>Pending</div>
                        )}
                      </td>
                    </tr>
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
    <div className="page-panel" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <div
          style={{
            fontSize: '0.9rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--pinnacle-teal)',
            marginBottom: '0.25rem',
          }}
        >
          Project Documentation
        </div>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: 840 }}>
          Central workspace for DRD, Workflow, QMP, and SOP documents. Global filters (date and hierarchy) still
          apply automatically. If a single project is selected in global filters, uploads go to that project;
          otherwise this page shows documents for all filtered projects.
        </div>
      </div>

      <div
        style={{
          borderRadius: 10,
          border: '1px solid var(--border-color)',
          background: 'var(--bg-card)',
          padding: '0.8rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
            File Type Filter
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Narrow all sections to PDF or Word documents.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {([
            { key: 'all', label: 'All Files' },
            { key: 'pdf', label: 'PDF Only' },
            { key: 'word', label: 'Word Only' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFileFilter(opt.key)}
              style={{
                borderRadius: 999,
                border: '1px solid var(--border-color)',
                padding: '0.35rem 0.8rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                background: fileFilter === opt.key ? 'var(--pinnacle-teal)' : 'var(--bg-secondary)',
                color: fileFilter === opt.key ? '#000' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
        {(['DRD', 'Workflow', 'QMP', 'SOP'] as DocType[]).map((type) => {
          const list = docsByType[type].filter((doc) => {
            if (fileFilter === 'all') return true;
            const lower = (doc.fileName || '').toLowerCase();
            if (fileFilter === 'pdf') return lower.endsWith('.pdf');
            return lower.endsWith('.doc') || lower.endsWith('.docx');
          });
          const pendingSignoff = list.filter((d) => {
            const m = metaById[d.id] ?? DEFAULT_META;
            return m.clientSignoffRequired && !m.clientSignoffComplete;
          }).length;
          return (
            <div key={`summary-${type}`} style={{ borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-card)', padding: '0.7rem 0.85rem' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{type}</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{list.length} Docs</div>
              <div style={{ fontSize: '0.72rem', color: pendingSignoff > 0 ? '#f59e0b' : 'var(--text-secondary)' }}>
                {pendingSignoff} Pending Client Signoff
              </div>
            </div>
          );
        })}
      </div>

      {renderSection(
        'DRD',
        'Data Requirement Document (DRD) – defines data sources, structures, and validation rules for the project.',
      )}
      {renderSection(
        'Workflow',
        'Workflow documentation – visual and narrative description of the end-to-end process and handoffs.',
      )}
      {renderSection(
        'QMP',
        'Quality Management Plan (QMP) – outlines quality standards, checks, and acceptance criteria.',
      )}
      {renderSection(
        'SOP',
        'Standard Operating Procedure (SOP) – step-by-step instructions for recurring project activities.',
      )}
    </div>
  );
}
