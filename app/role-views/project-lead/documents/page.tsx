'use client';

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';
import RoleWorkflowActionBar from '@/components/role-workstations/RoleWorkflowActionBar';
import MetricProvenanceOverlay from '@/components/role-workstations/MetricProvenanceOverlay';

export default function ProjectLeadDocumentsPage() {
  return (
    <RoleWorkstationShell
      role="project_lead"
      title="Project Documents"
      subtitle="Upload, version, and manage project documentation with signoff status."
      actions={(
        <RoleWorkflowActionBar
          actions={[
            { label: 'Open Report + Commitments', href: '/role-views/project-lead/report', permission: 'submitCommitments' },
            { label: 'Open Forecast', href: '/role-views/project-lead/forecast', permission: 'updateForecast' },
            { label: 'Open Schedule', href: '/role-views/project-lead/schedule', permission: 'editWbs' },
          ]}
        />
      )}
    >
      <MetricProvenanceOverlay
        entries={[
          {
            metric: 'Document Freshness',
            formulaId: 'DOC_FRESHNESS_14D_V1',
            formula: 'Now - latest document upload timestamp <= 14 days',
            sources: ['project_document_records', 'project_document_versions', 'project_documents'],
            scope: 'project-lead role scope',
            window: 'rolling 14 days',
          },
          {
            metric: 'Signoff Completion',
            formulaId: 'DOC_SIGNOFF_RATIO_V1',
            formula: 'Complete signoffs / required signoffs',
            sources: ['project_document_records'],
            scope: 'project-lead role scope',
            window: 'current snapshot',
          },
        ]}
      />
      <EmbeddedAppSurface title="Documentation" src="/project-management/documentation" />
    </RoleWorkstationShell>
  );
}
