/**
 * @fileoverview Role-native workstation navigation config.
 */

import type { RoleNavConfig, RolePreset, RoleViewKey } from '@/types/role-workstation';

export const ROLE_PRESETS: RolePreset[] = [
  { key: 'product_owner', label: 'Product Owner', dashboardRoute: '/role-views/product-owner', description: 'Global role simulation and end-to-end visibility.' },
  { key: 'pcl', label: 'PCL', dashboardRoute: '/role-views/pcl', description: 'Command center, compliance, and exception triage.' },
  { key: 'pca', label: 'PCA', dashboardRoute: '/role-views/pca', description: 'Project upload/parser/publish and mapping operations.' },
  { key: 'project_lead', label: 'Project Lead', dashboardRoute: '/role-views/project-lead', description: 'Forecast, schedule, commitments, and documents.' },
  { key: 'senior_manager', label: 'Senior Manager', dashboardRoute: '/role-views/senior-manager', description: 'Portfolio health, commitments, milestones, and docs.' },
  { key: 'coo', label: 'COO', dashboardRoute: '/role-views/coo', description: 'Executive operational review and AI briefing.' },
  { key: 'rda', label: 'RDA', dashboardRoute: '/role-views/rda', description: 'Task-level work lane and schedule execution.' },
  { key: 'client_portal', label: 'Client Portal', dashboardRoute: '/role-views/client-portal', description: 'External delivery lens and document transparency.' },
];

export const ROLE_NAV_CONFIG: Record<RoleViewKey, RoleNavConfig> = {
  product_owner: {
    role: 'product_owner',
    title: 'Product Owner',
    primary: [
      { label: 'Command Center', href: '/role-views/product-owner' },
    ],
    tools: [
      { label: 'Role Monitor', href: '/role-views/product-owner#role-monitor' },
      { label: 'System Health', href: '/role-views/product-owner#system-health' },
      { label: 'Data Management', href: '/project-controls/data-management' },
      { label: 'Project Plans', href: '/project-controls/project-plans' },
      { label: 'Resourcing', href: '/project-controls/resourcing' },
      { label: 'WBS / Gantt', href: '/project-controls/wbs-gantt' },
      { label: 'Sprint', href: '/project-management/sprint' },
      { label: 'Forecast', href: '/project-management/forecast' },
      { label: 'Feedback', href: '/project-management/qc-log' },
      { label: 'PCL Command', href: '/role-views/pcl' },
      { label: 'PCA Workstation', href: '/role-views/pca' },
      { label: 'Project Lead', href: '/role-views/project-lead' },
      { label: 'Senior Manager', href: '/role-views/senior-manager' },
      { label: 'COO', href: '/role-views/coo' },
      { label: 'RDA', href: '/role-views/rda' },
    ],
  },
  pcl: {
    role: 'pcl',
    title: 'PCL Workstation',
    primary: [
      { label: 'Command Center', href: '/role-views/pcl' },
    ],
    tools: [
      { label: 'Resourcing', href: '/project-controls/resourcing' },
      { label: 'Project Plans', href: '/project-controls/project-plans' },
      { label: 'WBS Queue', href: '/role-views/pcl/wbs', badgeKey: 'pcl_exceptions' },
      { label: 'WBS / Gantt', href: '/project-controls/wbs-gantt' },
      { label: 'Schedule Health', href: '/role-views/pcl/schedule-health' },
      { label: 'Plans & Mapping', href: '/role-views/pcl/plans-mapping' },
      { label: 'Exceptions', href: '/role-views/pcl/exceptions', badgeKey: 'pcl_exceptions' },
      { label: 'Data Management', href: '/project-controls/data-management' },
    ],
  },
  pca: {
    role: 'pca',
    title: 'PCA Workstation',
    primary: [
      { label: 'My Work', href: '/role-views/pca' },
    ],
    tools: [
      { label: 'Mapping', href: '/role-views/pca/mapping', badgeKey: 'pca_mapping' },
      { label: 'Plan Uploads', href: '/role-views/pca/plan-uploads' },
      { label: 'Data Quality', href: '/role-views/pca/data-quality' },
      { label: 'Assigned WBS', href: '/role-views/pca/wbs' },
      { label: 'WBS / Gantt', href: '/project-controls/wbs-gantt' },
      { label: 'Project Plans', href: '/project-controls/project-plans' },
      { label: 'Resourcing', href: '/project-controls/resourcing' },
    ],
  },
  project_lead: {
    role: 'project_lead',
    title: 'Project Lead Workstation',
    primary: [
      { label: 'My Project', href: '/role-views/project-lead' },
    ],
    tools: [
      { label: 'Sprint', href: '/project-management/sprint' },
      { label: 'Resourcing', href: '/project-controls/resourcing' },
      { label: 'Schedule', href: '/role-views/project-lead/schedule' },
      { label: 'Team', href: '/role-views/project-lead/team' },
      { label: 'Forecast', href: '/role-views/project-lead/forecast' },
      { label: 'Documents', href: '/role-views/project-lead/documents' },
      { label: 'Report', href: '/role-views/project-lead/report', badgeKey: 'pl_report' },
      { label: 'Week Ahead', href: '/role-views/project-lead/week-ahead', badgeKey: 'pl_due' },
      { label: 'WBS / Gantt', href: '/project-controls/wbs-gantt' },
      { label: 'Project Documentation', href: '/project-management/documentation' },
    ],
  },
  senior_manager: {
    role: 'senior_manager',
    title: 'Senior Manager Workstation',
    primary: [
      { label: 'Overview', href: '/role-views/senior-manager' },
    ],
    tools: [
      { label: 'Projects', href: '/role-views/senior-manager/projects' },
      { label: 'Team', href: '/role-views/senior-manager/team' },
      { label: 'Milestones', href: '/role-views/senior-manager/milestones' },
      { label: 'Commitments', href: '/role-views/senior-manager/commitments', badgeKey: 'sm_commitments' },
      { label: 'Documents', href: '/role-views/senior-manager/documents' },
      { label: 'Resourcing', href: '/project-controls/resourcing' },
      { label: 'Portfolio WBS', href: '/role-views/senior-manager/wbs' },
      { label: 'WBS / Gantt', href: '/project-controls/wbs-gantt' },
      { label: 'Milestone Insights', href: '/insights/milestones' },
    ],
  },
  coo: {
    role: 'coo',
    title: 'COO Workstation',
    primary: [
      { label: 'Portfolio', href: '/role-views/coo' },
    ],
    tools: [
      { label: 'Period Review', href: '/role-views/coo/period-review' },
      { label: 'Milestones', href: '/role-views/coo/milestones' },
      { label: 'Commitments', href: '/role-views/coo/commitments', badgeKey: 'coo_commitments' },
      { label: 'Resourcing', href: '/project-controls/resourcing' },
      { label: 'Executive WBS Lens', href: '/role-views/coo/wbs' },
      { label: 'WBS / Gantt', href: '/project-controls/wbs-gantt' },
      { label: 'Portfolio Overview', href: '/insights/overview-v2' },
      { label: 'Forecast Insights', href: '/project-management/forecast' },
    ],
  },
  rda: {
    role: 'rda',
    title: 'RDA Workstation',
    primary: [
      { label: 'My Work', href: '/role-views/rda' },
    ],
    tools: [
      { label: 'Sprint', href: '/role-views/rda/sprint' },
      { label: 'Hours', href: '/role-views/rda/hours' },
      { label: 'Work Queue', href: '/role-views/rda/work', badgeKey: 'rda_overdue' },
      { label: 'Schedule', href: '/role-views/rda/schedule' },
      { label: 'Task Boards', href: '/project-management/boards' },
      { label: 'Task Insights', href: '/insights/tasks' },
    ],
  },
  client_portal: {
    role: 'client_portal',
    title: 'Client Portal',
    primary: [{ label: 'Portal', href: '/role-views/client-portal' }],
    tools: [{ label: 'Milestones', href: '/insights/milestones' }],
  },
};

export function getRolePreset(key: RoleViewKey): RolePreset {
  return ROLE_PRESETS.find((preset) => preset.key === key) || ROLE_PRESETS[0];
}

export function normalizeRoleKey(value: string | null | undefined): RoleViewKey {
  const key = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (key === 'projectlead') return 'project_lead';
  if (key === 'seniormanager') return 'senior_manager';
  if (key === 'productowner') return 'product_owner';
  if (key === 'client') return 'client_portal';
  if (key === 'client_portal') return 'client_portal';
  if (key === 'pca') return 'pca';
  if (key === 'pcl') return 'pcl';
  if (key === 'coo') return 'coo';
  if (key === 'rda') return 'rda';
  if (key === 'project_lead') return 'project_lead';
  if (key === 'senior_manager') return 'senior_manager';
  if (key === 'product_owner') return 'product_owner';
  return 'project_lead';
}
