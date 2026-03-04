'use client';

import React, { useState } from 'react';
import { useClientPortalScope } from '../shared';

export default function ClientPortalUpdatesPage() {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const scoped = useClientPortalScope(selectedProjectId);

  return (
    <div className="page-panel" style={{ display: 'grid', gap: '0.75rem' }}>
      <div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Client Portal</div>
        <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.42rem' }}>Updates</h1>
      </div>
      <div style={{ maxWidth: 360 }}>
        <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4 }}>Project</label>
        <select value={scoped.selectedId} onChange={(event) => setSelectedProjectId(event.target.value)} style={{ width: '100%', padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          {scoped.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </div>
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem', color: 'var(--text-muted)' }}>Latest Client-Visible Documents</div>
        {scoped.docs.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No client-visible updates.</div>
        ) : scoped.docs.slice(0, 30).map((doc, index) => (
          <div key={`${String(doc.id || index)}`} style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.76rem', fontWeight: 600 }}>{String(doc.name || doc.documentName || doc.docType || 'Document')}</div>
            <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>{String(doc.status || 'unknown')} · updated {new Date(String(doc.updatedAt || doc.updated_at || doc.createdAt || doc.created_at || Date.now())).toLocaleDateString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
