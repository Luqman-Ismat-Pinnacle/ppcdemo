'use client';

/**
 * Document and deliverable transformations.
 */

import type { SampleData } from '@/types/data';

export function buildDocumentSignoffGauges(data: Partial<SampleData>) {
  const deliverables = data.deliverables || data.deliverablesTracker || [];

  // Count by status for each document type
  const types = ['DRD', 'Workflow', 'SOP', 'QMP'];
  const colors = ['#40E0D0', '#8B5CF6', '#F59E0B', '#10B981'];

  if (deliverables.length > 0) {
    return types.map((type, idx) => {
      const typeDeliverables = deliverables.filter((d: any) =>
        (d.type || '').toLowerCase().includes(type.toLowerCase()) ||
        (d.name || '').toLowerCase().includes(type.toLowerCase())
      );

      const approved = typeDeliverables.filter((d: any) =>
        (d.status || d.drdStatus || '').toLowerCase().includes('approved') ||
        (d.status || d.drdStatus || '').toLowerCase().includes('complete') ||
        (d.status || d.drdStatus || '').toLowerCase().includes('signed')
      ).length;

      const total = typeDeliverables.length || 10;
      const value = total > 0 ? Math.round((approved / total) * 100) : Math.floor(60 + Math.random() * 35);

      return { name: type, value, color: colors[idx] };
    });
  }

  // Generate synthetic data
  return types.map((type, idx) => ({
    name: type,
    value: Math.floor(60 + Math.random() * 35),
    color: colors[idx]
  }));
}

export function buildDeliverableByStatus(data: Partial<SampleData>) {
  const deliverables = data.deliverables || data.deliverablesTracker || [];

  const statuses = ['Approved', 'In Review', 'Draft', 'Not Started'];
  const colors = ['#10B981', '#F59E0B', '#40E0D0', '#6B7280'];

  const buildPieData = (filterFn: (d: any) => boolean) => {
    const filtered = deliverables.filter(filterFn);
    if (filtered.length > 0) {
      const counts: Record<string, number> = {};
      filtered.forEach((d: any) => {
        const status = d.status || d.drdStatus || 'Not Started';
        let normalized = 'Not Started';
        if (status.toLowerCase().includes('approved') || status.toLowerCase().includes('complete') || status.toLowerCase().includes('signed')) {
          normalized = 'Approved';
        } else if (status.toLowerCase().includes('review')) {
          normalized = 'In Review';
        } else if (status.toLowerCase().includes('draft') || status.toLowerCase().includes('progress')) {
          normalized = 'Draft';
        }
        counts[normalized] = (counts[normalized] || 0) + 1;
      });

      const total = Object.values(counts).reduce((sum, v) => sum + v, 0) || 1;

      return Object.entries(counts).map(([name, value]) => ({
        name,
        value,
        percent: Math.round((value / total) * 100),
        color: colors[statuses.indexOf(name)] || '#6B7280'
      }));
    }

    // Synthetic data
    const syntheticData = statuses.map((status, idx) => ({
      name: status,
      value: Math.floor(3 + Math.random() * 8),
      percent: 0,
      color: colors[idx]
    }));
    const total = syntheticData.reduce((sum, d) => sum + d.value, 0) || 1;
    return syntheticData.map(d => ({ ...d, percent: Math.round((d.value / total) * 100) }));
  };

  return {
    drd: buildPieData((d: any) => (d.type || d.name || '').toLowerCase().includes('drd')),
    workflow: buildPieData((d: any) => (d.type || d.name || '').toLowerCase().includes('workflow')),
    sop: buildPieData((d: any) => (d.type || d.name || '').toLowerCase().includes('sop')),
    qmp: buildPieData((d: any) => (d.type || d.name || '').toLowerCase().includes('qmp'))
  };
}

export function buildDeliverablesTracker(data: Partial<SampleData>) {
  const deliverables = data.deliverables || data.deliverablesTracker || [];
  const projects = data.projects || [];
  const customers = data.customers || [];

  // Build Maps for O(1) lookups instead of O(n) find() calls
  const projectMap = new Map<string, any>();
  const customerMap = new Map<string, any>();

  projects.forEach((p: any) => {
    const id = p.id || p.projectId;
    if (id) projectMap.set(id, p);
  });

  customers.forEach((c: any) => {
    const id = c.id || c.customerId;
    if (id) customerMap.set(id, c);
  });

  if (deliverables.length > 0) {
    return deliverables.map((d: any) => {
      // Use Map lookups instead of find() - O(1) instead of O(n)
      const projectId = d.projectId || d.project_id;
      const project = projectId ? projectMap.get(projectId) : null;
      const customerId = project?.customerId || project?.customer_id;
      const customer = customerId ? customerMap.get(customerId) : null;

      return {
        customer: customer?.name || d.customer || 'Customer',
        projectNum: project?.name || d.projectNum || d.projectId || 'Project',
        name: d.name || 'Deliverable',
        drdStatus: d.drdStatus || d.status || 'Not Started',
        workflowStatus: d.workflowStatus || 'Not Started',
        sopStatus: d.sopStatus || 'Not Started',
        qmpStatus: d.qmpStatus || 'Not Started'
      };
    });
  }

  // Generate from projects
  const statusOptions = ['Customer Signed Off', 'In Review', 'Draft', 'Not Started'];

  return projects.slice(0, 8).map((p: any) => {
    // Use Map lookup instead of find() - O(1) instead of O(n)
    const customerId = p.customerId || p.customer_id;
    const customer = customerId ? customerMap.get(customerId) : null;

    return {
      customer: customer?.name || 'Customer',
      projectNum: p.name || p.projectId || 'Project',
      name: `${p.name || 'Project'} Deliverables`,
      drdStatus: statusOptions[Math.floor(Math.random() * statusOptions.length)],
      workflowStatus: statusOptions[Math.floor(Math.random() * statusOptions.length)],
      sopStatus: statusOptions[Math.floor(Math.random() * statusOptions.length)],
      qmpStatus: statusOptions[Math.floor(Math.random() * statusOptions.length)]
    };
  });
}

// ============================================================================
