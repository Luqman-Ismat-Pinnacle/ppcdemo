'use client';

import React, { useState } from 'react';
import { useClientPortalScope } from '../shared';

export default function ClientPortalMilestonesPage() {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const scoped = useClientPortalScope(selectedProjectId);

  return (
    <div className="page-panel" style={{ display: 'grid', gap: '0.75rem' }}>
      <div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Client Portal</div>
        <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.42rem' }}>Milestones</h1>
      </div>
      <div style={{ maxWidth: 360 }}>
        <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4 }}>Project</label>
        <select value={scoped.selectedId} onChange={(event) => setSelectedProjectId(event.target.value)} style={{ width: '100%', padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          {scoped.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </div>
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem', color: 'var(--text-muted)' }}>Client-Visible Milestones</div>
        {scoped.milestones.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No client-visible milestones configured.</div>
        ) : scoped.milestones.slice(0, 30).map((milestone, index) => (
          <div key={String(milestone.id || milestone.milestoneId || index)} style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.76rem', fontWeight: 600 }}>{String(milestone.name || milestone.milestoneName || 'Milestone')}</div>
            <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>{String(milestone.status || 'Unknown')} · {String(milestone.dueDate || milestone.due_date || milestone.targetDate || milestone.target_date || '-')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
