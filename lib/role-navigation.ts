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
    items: [
      { label: 'Command Center', href: '/role-views/product-owner' },
      { label: 'PCL', href: '/role-views/pcl' },
      { label: 'PCA', href: '/role-views/pca' },
      { label: 'Project Lead', href: '/role-views/project-lead' },
      { label: 'Senior Manager', href: '/role-views/senior-manager' },
      { label: 'COO', href: '/role-views/coo' },
      { label: 'RDA', href: '/role-views/rda' },
    ],
  },
  pcl: {
    role: 'pcl',
    title: 'PCL Workstation',
    items: [
      { label: 'Command Center', href: '/role-views/pcl' },
      { label: 'Schedule Health', href: '/role-views/pcl/schedule-health' },
      { label: 'Plans Mapping', href: '/role-views/pcl/plans-mapping' },
      { label: 'Resourcing', href: '/role-views/pcl/resourcing' },
      { label: 'Exceptions', href: '/role-views/pcl/exceptions' },
      { label: 'WBS', href: '/role-views/pcl/wbs' },
    ],
  },
  pca: {
    role: 'pca',
    title: 'PCA Workstation',
    items: [
      { label: 'My Projects', href: '/role-views/pca' },
      { label: 'Mapping', href: '/role-views/pca/mapping' },
      { label: 'Plan Uploads', href: '/role-views/pca/plan-uploads' },
      { label: 'Data Quality', href: '/role-views/pca/data-quality' },
      { label: 'WBS', href: '/role-views/pca/wbs' },
    ],
  },
  project_lead: {
    role: 'project_lead',
    title: 'Project Lead Workstation',
    items: [
      { label: 'My Project', href: '/role-views/project-lead' },
      { label: 'Schedule', href: '/role-views/project-lead/schedule' },
      { label: 'Team', href: '/role-views/project-lead/team' },
      { label: 'Week Ahead', href: '/role-views/project-lead/week-ahead' },
      { label: 'Report', href: '/role-views/project-lead/report' },
      { label: 'Forecast', href: '/role-views/project-lead/forecast' },
      { label: 'Documents', href: '/role-views/project-lead/documents' },
    ],
  },
  senior_manager: {
    role: 'senior_manager',
    title: 'Senior Manager Workstation',
    items: [
      { label: 'Portfolio', href: '/role-views/senior-manager' },
      { label: 'Projects', href: '/role-views/senior-manager/projects' },
      { label: 'Milestones', href: '/role-views/senior-manager/milestones' },
      { label: 'Commitments', href: '/role-views/senior-manager/commitments' },
      { label: 'Documents', href: '/role-views/senior-manager/documents' },
      { label: 'WBS', href: '/role-views/senior-manager/wbs' },
    ],
  },
  coo: {
    role: 'coo',
    title: 'COO Workstation',
    items: [
      { label: 'Pulse', href: '/role-views/coo' },
      { label: 'Period Review', href: '/role-views/coo/period-review' },
      { label: 'Milestones', href: '/role-views/coo/milestones' },
      { label: 'Commitments', href: '/role-views/coo/commitments' },
      { label: 'AI Briefing', href: '/role-views/coo/ai' },
      { label: 'WBS', href: '/role-views/coo/wbs' },
    ],
  },
  rda: {
    role: 'rda',
    title: 'RDA Workstation',
    items: [
      { label: 'Home', href: '/role-views/rda' },
      { label: 'Hours', href: '/role-views/rda/hours' },
      { label: 'Work', href: '/role-views/rda/work' },
      { label: 'Schedule', href: '/role-views/rda/schedule' },
    ],
  },
  client_portal: {
    role: 'client_portal',
    title: 'Client Portal',
    items: [{ label: 'Portal', href: '/role-views/client-portal' }],
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
