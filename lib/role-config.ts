export interface RoleConfig {
  id: string;
  label: string;
  shortLabel: string;
  avatar: string;
  apiBase: string;
  homePath: string;
}

export const ROLES: Record<string, RoleConfig> = {
  PCA: {
    id: 'PCA',
    label: 'Project Controls Analyst',
    shortLabel: 'PCA User',
    avatar: 'PC',
    apiBase: '/api/pca',
    homePath: '/pca',
  },
  PCL: {
    id: 'PCL',
    label: 'Project Controls Lead',
    shortLabel: 'PCL User',
    avatar: 'PL',
    apiBase: '/api/pcl',
    homePath: '/pcl',
  },
  COO: {
    id: 'COO',
    label: 'Chief Operating Officer',
    shortLabel: 'COO User',
    avatar: 'CO',
    apiBase: '/api/coo',
    homePath: '/coo',
  },
  SM: {
    id: 'SM',
    label: 'Senior Manager',
    shortLabel: 'SM User',
    avatar: 'SM',
    apiBase: '/api/senior-manager',
    homePath: '/senior-manager',
  },
  PL: {
    id: 'PL',
    label: 'Project Lead',
    shortLabel: 'PL User',
    avatar: 'PL',
    apiBase: '/api/project-lead',
    homePath: '/project-lead',
  },
};
