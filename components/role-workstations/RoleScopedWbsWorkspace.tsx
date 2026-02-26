'use client';

/**
 * @fileoverview Embedded WBS workspace shell scoped by role capabilities.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/data-context';
import { useRoleView } from '@/lib/role-view-context';
import { getWbsCapabilities } from '@/lib/wbs-role-adapter';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export default function RoleScopedWbsWorkspace({
  defaultProjectId,
}: {
  defaultProjectId?: string;
}) {
  const { activeRole } = useRoleView();
  const { filteredData, data: fullData } = useData();
  const capabilities = getWbsCapabilities(activeRole.key);

  const projects = useMemo(() => {
    const list = (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [];
    return list
      .map(asRecord)
      .map((project) => ({
        id: String(project.id || project.projectId || project.project_id || ''),
        name: String(project.name || project.projectName || project.id || 'Unnamed Project'),
      }))
      .filter((project) => project.id);
  }, [filteredData?.projects, fullData?.projects]);

  const initialProjectId = defaultProjectId || projects[0]?.id || '';
  const [projectId, setProjectId] = useState<string>(initialProjectId);

  const src = useMemo(() => {
    const params = new URLSearchParams();
    params.set('embedded', '1');
    params.set('role', activeRole.key);
    if (projectId) params.set('projectId', projectId);
    return `/project-controls/wbs-gantt-v2?${params.toString()}`;
  }, [activeRole.key, projectId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Scope Project</label>
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            style={{ padding: '0.42rem 0.52rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', minWidth: 260 }}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Scope: {capabilities.scope.replace('_', ' ')}</span>
          <span>•</span>
          <span>{capabilities.canEditStructure ? 'Edit' : 'Read/Annotate'} Mode</span>
          <Link href={`/project-controls/wbs-gantt-v2${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`} style={{ color: 'var(--text-secondary)' }}>
            Open Full WBS
          </Link>
        </div>
      </div>
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden', minHeight: 600, background: 'var(--bg-card)' }}>
        <iframe
          src={src}
          title="Role Scoped WBS"
          style={{ width: '100%', height: 700, border: 'none', background: 'transparent' }}
        />
      </div>
    </div>
  );
}
