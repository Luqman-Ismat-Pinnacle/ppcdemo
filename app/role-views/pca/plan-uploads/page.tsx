'use client';

/**
 * @fileoverview PCA plan upload/parser/publish workstation route.
 *
 * Provides a role-native operational checklist and embeds the canonical
 * Project Plans engine where upload, parser preview, and publish actions run.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/data-context';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleWorkflowActionBar from '@/components/role-workstations/RoleWorkflowActionBar';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function PcaPlanUploadsPage() {
  const { filteredData, data: fullData } = useData();

  const stats = useMemo(() => {
    const docs = (filteredData?.projectDocuments?.length ? filteredData.projectDocuments : fullData?.projectDocuments) || [];
    const rows = (docs as unknown as Array<Record<string, unknown>>);
    const total = rows.length;
    const processed = rows.filter((row) => Boolean(row.processedAt || row.processed_at || row.has_schedule)).length;
    const failed = rows.filter((row) => String(row.status || '').toLowerCase() === 'error').length;
    return { total, processed, failed };
  }, [filteredData?.projectDocuments, fullData?.projectDocuments]);

  return (
    <RoleWorkstationShell
      role="pca"
      title="Plan Uploads"
      subtitle="Run full MPP upload -> parser preview -> publish workflow with explicit operational controls."
      actions={(
        <RoleWorkflowActionBar
          actions={[
            { label: 'Open Project Plans Engine', href: '/project-controls/project-plans', permission: 'publishPlans' },
            { label: 'Go To Mapping Queue', href: '/role-views/pca/mapping', permission: 'editMapping' },
            { label: 'Data Quality', href: '/role-views/pca/data-quality', permission: 'editMapping' },
          ]}
        />
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.6rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-card)', padding: '0.6rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Uploaded Plans</div>
          <div style={{ marginTop: '0.25rem', fontSize: '1.2rem', fontWeight: 800 }}>{stats.total}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-card)', padding: '0.6rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Processed/Published</div>
          <div style={{ marginTop: '0.25rem', fontSize: '1.2rem', fontWeight: 800 }}>{stats.processed}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-card)', padding: '0.6rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Errors</div>
          <div style={{ marginTop: '0.25rem', fontSize: '1.2rem', fontWeight: 800, color: stats.failed > 0 ? '#EF4444' : 'var(--text-primary)' }}>{stats.failed}</div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem' }}>Operational Workflow</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.55rem', fontSize: '0.73rem' }}>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.5rem', background: 'var(--bg-secondary)' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>1. Upload</div>
            Select project and upload `.mpp` in Project Plans.
          </div>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.5rem', background: 'var(--bg-secondary)' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>2. Parser Preview</div>
            Run parser diagnostics and validate unit/phase/task conversion before publish.
          </div>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.5rem', background: 'var(--bg-secondary)' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>3. Publish + Validate</div>
            Publish updates, then review <Link href="/role-views/pca/mapping" style={{ color: 'var(--text-secondary)' }}>mapping</Link> and <Link href="/role-views/pca/data-quality" style={{ color: 'var(--text-secondary)' }}>data quality</Link>.
          </div>
        </div>
      </div>

      <EmbeddedAppSurface title="Project Plans" src="/project-controls/project-plans" />
    </RoleWorkstationShell>
  );
}
