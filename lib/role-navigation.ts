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
      { label: 'System Health', href: '/role-views/product-owner/system-health' },
      { label: 'Metric Provenance', href: '/shared/metric-provenance' },
      { label: 'Data Management', href: '/shared/data-management' },
    ],
    tools: [
      { label: "Mo's Page", href: '/shared/mos-page' },
      { label: 'Tasks', href: '/shared/tasks' },
      { label: 'Milestones', href: '/shared/milestones' },
      { label: 'Documents', href: '/shared/documents' },
      { label: 'Hours', href: '/shared/hours' },
      { label: 'WBS Gantt', href: '/shared/wbs-gantt-v2' },
      { label: 'Resourcing', href: '/shared/resourcing' },
      { label: 'Project Plans', href: '/shared/project-plans' },
      { label: 'Mapping', href: '/shared/mapping' },
      { label: 'Forecasting', href: '/shared/forecast' },
      { label: 'Sprint Planning', href: '/shared/sprint' },
      { label: 'QC Log', href: '/shared/qc-log' },
      { label: 'Backlog', href: '/shared/backlog' },
      { label: 'Boards', href: '/shared/boards' },
      { label: 'Resource Leveling', href: '/shared/resource-leveling' },
    ],
  },
  coo: {
    role: 'coo',
    title: 'COO',
    primary: [
      { label: 'Overviews', href: '/shared/overview-v2' },
      { label: "Mo's Page", href: '/shared/mos-page' },
      { label: 'WBS Gantt', href: '/shared/wbs-gantt-v2' },
      { label: 'Commitments', href: '/role-views/coo/commitments', badgeKey: 'coo_commitments' },
    ],
    tools: [],
  },
  pcl: {
    role: 'pcl',
    title: 'PCL',
    primary: [
      { label: 'Overview', href: '/role-views/pcl' },
      { label: 'WBS Gantt', href: '/shared/wbs-gantt-v2' },
      { label: 'Resourcing', href: '/shared/resourcing' },
      { label: 'Project Plans', href: '/shared/project-plans' },
      { label: 'Forecasting', href: '/shared/forecast' },
      { label: 'Metric Provenance', href: '/shared/metric-provenance' },
      { label: 'Data Management', href: '/shared/data-management' },
    ],
    tools: [],
  },
  pca: {
    role: 'pca',
    title: 'PCA',
    primary: [
      { label: 'Overview', href: '/role-views/pca' },
      { label: 'WBS Gantt', href: '/shared/wbs-gantt-v2' },
      { label: 'Mapping', href: '/shared/mapping', badgeKey: 'pca_mapping' },
      { label: 'Project Plans', href: '/shared/project-plans' },
      { label: 'Sprint Planning', href: '/shared/sprint' },
      { label: 'QC Log', href: '/shared/qc-log' },
      { label: 'Forecasting', href: '/shared/forecast' },
      { label: 'Data Management', href: '/shared/data-management' },
    ],
    tools: [],
  },
  project_lead: {
    role: 'project_lead',
    title: 'Project Lead',
    primary: [
      { label: 'Project Health', href: '/role-views/project-lead/project-health' },
      { label: 'Tasks', href: '/shared/tasks', badgeKey: 'pl_due' },
      { label: 'WBS Gantt', href: '/shared/wbs-gantt-v2' },
      { label: 'Sprint Planning', href: '/shared/sprint' },
      { label: 'Forecasting', href: '/shared/forecast', badgeKey: 'pl_report' },
    ],
    tools: [],
  },
  senior_manager: {
    role: 'senior_manager',
    title: 'Senior Manager',
    primary: [
      { label: 'Overview', href: '/shared/overview-v2' },
      { label: 'Portfolio Health', href: '/role-views/senior-manager/portfolio-health' },
      { label: 'WBS Gantt', href: '/shared/wbs-gantt-v2' },
      { label: 'Forecasting', href: '/shared/forecast', badgeKey: 'sm_commitments' },
    ],
    tools: [],
  },
  rda: {
    role: 'rda',
    title: 'RDA',
    primary: [
      { label: 'Tasks', href: '/role-views/rda/tasks', badgeKey: 'rda_overdue' },
      { label: 'Hours', href: '/role-views/rda/hours' },
      { label: 'Sprint Planning', href: '/shared/sprint' },
    ],
    tools: [],
  },
  client_portal: {
    role: 'client_portal',
    title: 'Client Portal',
    primary: [
      { label: 'WBS Gantt', href: '/role-views/client-portal/wbs' },
      { label: 'Progress', href: '/role-views/client-portal/progress' },
      { label: 'Updates', href: '/role-views/client-portal/updates' },
      { label: 'Milestones', href: '/role-views/client-portal/milestones' },
    ],
    tools: [],
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
