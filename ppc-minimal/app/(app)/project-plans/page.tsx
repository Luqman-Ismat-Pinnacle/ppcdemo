'use client';

import React, { useEffect, useState, useRef } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import SearchableSelect from '@/components/ui/SearchableSelect';

type Doc = { id: string; project_id: string; file_name: string; storage_path: string; uploaded_at: string; is_current_version: boolean };
type Project = { id: string; name: string };

export default function ProjectPlansPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState('');
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/tables/projects?limit=500').then(r => r.json()),
      fetch('/api/tables/project_documents?limit=500').then(r => r.json()),
    ]).then(([p, d]) => {
      setProjects((p.rows || []).map((r: Record<string, unknown>) => ({ id: String(r.id), name: String(r.name) })));
      setDocs((d.rows || []) as Doc[]);
    }).finally(() => setLoading(false));
  }, []);

  const filteredDocs = selectedProject ? docs.filter(d => d.project_id === selectedProject) : docs;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedProject) return;
    setUploading(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('projectId', selectedProject);
      const res = await fetch('/api/documents/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMsg({ type: 'ok', text: `Uploaded ${file.name}` });
      const refreshed = await fetch('/api/tables/project_documents?limit=500').then(r => r.json());
      setDocs((refreshed.rows || []) as Doc[]);
    } catch (err: unknown) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleProcess = async (doc: Doc) => {
    setProcessing(doc.id);
    setMsg(null);
    try {
      const res = await fetch('/api/documents/process-mpp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id, projectId: doc.project_id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMsg({ type: 'ok', text: `Processed: ${data.units || 0} units, ${data.phases || 0} phases, ${data.tasks || 0} tasks, ${data.sub_tasks || 0} sub-tasks` });
    } catch (err: unknown) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Process failed' });
    } finally {
      setProcessing(null);
    }
  };

  const projectName = (id: string) => projects.find(p => p.id === id)?.name || id;

  return (
    <div>
      <h1 className="page-title">Project Plans</h1>
      <p className="page-subtitle">Upload and process MPP files from Azure Blob Storage.</p>

      {msg && (
        <div className="glass" style={{
          padding: '0.5rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.78rem',
          background: msg.type === 'ok' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          color: msg.type === 'ok' ? 'var(--color-success)' : 'var(--color-error)',
          borderColor: msg.type === 'ok' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
        }}>{msg.text}</div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <SearchableSelect
          options={projects.map(p => ({ value: p.id, label: `${p.id} — ${p.name}` }))}
          value={selectedProject}
          onChange={setSelectedProject}
          placeholder="Search projects…"
          style={{ minWidth: 280 }}
        />
        <button className="btn btn-accent" onClick={() => fileRef.current?.click()} disabled={!selectedProject || uploading}>
          {uploading ? 'Uploading…' : 'Upload MPP'}
        </button>
        <input ref={fileRef} type="file" accept=".mpp,.xml,.mpx" style={{ display: 'none' }} onChange={handleUpload} />
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: '0.5rem' }}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={48} />)}</div>
      ) : (
        <div className="glass-solid" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
          <table className="dm-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>File</th>
                <th>Uploaded</th>
                <th>Current</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map(d => (
                <tr key={d.id}>
                  <td style={{ color: 'var(--text-secondary)' }}>{projectName(d.project_id)}</td>
                  <td style={{ fontWeight: 500 }}>{d.file_name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : '—'}</td>
                  <td>{d.is_current_version ? <span style={{ color: 'var(--color-success)' }}>Yes</span> : 'No'}</td>
                  <td>
                    <button className="btn" onClick={() => handleProcess(d)} disabled={processing === d.id} style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }}>
                      {processing === d.id ? 'Processing…' : 'Process'}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredDocs.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No documents uploaded.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
