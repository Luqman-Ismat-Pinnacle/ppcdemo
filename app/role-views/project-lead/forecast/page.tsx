'use client';

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';
import RoleWorkflowActionBar from '@/components/role-workstations/RoleWorkflowActionBar';
import MetricProvenanceOverlay from '@/components/role-workstations/MetricProvenanceOverlay';

export default function ProjectLeadForecastPage() {
  return (
    <RoleWorkstationShell
      role="project_lead"
      title="Forecast"
      subtitle="Full forecast operations, scenario edits, and snapshot decisions."
      actions={(
        <RoleWorkflowActionBar
          actions={[
            { label: 'Submit Commitments', href: '/role-views/project-lead/report', permission: 'submitCommitments' },
            { label: 'Open Schedule', href: '/role-views/project-lead/schedule', permission: 'editWbs' },
            { label: 'Open Documents', href: '/role-views/project-lead/documents', permission: 'manageDocuments' },
          ]}
        />
      )}
    >
      <MetricProvenanceOverlay
        entries={[
          {
            metric: 'Forecast IEAC',
            formulaId: 'IEAC_CPI_V1',
            formula: 'BAC / CPI',
            sources: ['projects', 'tasks', 'hour_entries'],
            scope: 'project-lead role scope',
            window: 'active filters + current forecast scenario',
          },
          {
            metric: 'Forecast TCPI',
            formulaId: 'TCPI_BAC_V1',
            formula: '(BAC - EV) / (BAC - AC)',
            sources: ['projects', 'tasks', 'hour_entries'],
            scope: 'project-lead role scope',
            window: 'active filters + current forecast scenario',
          },
        ]}
      />
      <EmbeddedAppSurface title="Forecast" src="/project-management/forecast" />
    </RoleWorkstationShell>
  );
}
