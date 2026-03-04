'use client';

import React, { useState } from 'react';
import { useClientPortalScope } from '../shared';

export default function ClientPortalProgressPage() {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const scoped = useClientPortalScope(selectedProjectId);

  return (
    <div className="page-panel" style={{ display: 'grid', gap: '0.75rem' }}>
      <div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Client Portal</div>
        <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.42rem' }}>Progress</h1>
      </div>
      <div style={{ maxWidth: 360 }}>
        <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4 }}>Project</label>
        <select value={scoped.selectedId} onChange={(event) => setSelectedProjectId(event.target.value)} style={{ width: '100%', padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          {scoped.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>% Complete</div>
          <div style={{ marginTop: 4, fontSize: '1.24rem', fontWeight: 800 }}>{scoped.metrics.percentComplete}%</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Planned vs Done</div>
          <div style={{ marginTop: 4, fontSize: '1.24rem', fontWeight: 800 }}>{scoped.metrics.workPlannedVsDone}</div>
        </div>
      </div>
    </div>
  );
}
