'use client';

/**
 * @fileoverview Global role-view lens context.
 *
 * Enables Product Owner "view as role" simulation across the entire app shell
 * so navigation and UI framing can be switched without logging in/out.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useUser } from '@/lib/user-context';

export type RoleViewKey =
  | 'product-owner'
  | 'project-lead'
  | 'pca'
  | 'pcl'
  | 'senior-manager'
  | 'coo'
  | 'client';

export interface RolePreset {
  key: RoleViewKey;
  label: string;
  dashboardRoute: string;
  description: string;
}

export const ROLE_PRESETS: RolePreset[] = [
  { key: 'product-owner', label: 'Product Owner', dashboardRoute: '/role-views', description: 'Full system visibility and cross-role simulation.' },
  { key: 'project-lead', label: 'Project Lead', dashboardRoute: '/role-views/project-lead', description: 'Execution, delivery health, and task risk.' },
  { key: 'pca', label: 'PCA Workspace', dashboardRoute: '/role-views/pca-workspace', description: 'Data mapping governance and suggestion workflows.' },
  { key: 'pcl', label: 'PCL Exceptions', dashboardRoute: '/role-views/pcl-exceptions', description: 'Exception triage and alert-response workflow.' },
  { key: 'senior-manager', label: 'Senior Manager', dashboardRoute: '/role-views/senior-manager', description: 'Portfolio posture, escalations, and alerts.' },
  { key: 'coo', label: 'COO + AI Q&A', dashboardRoute: '/role-views/coo', description: 'Executive KPI lens and Q&A decision support.' },
  { key: 'client', label: 'Client Portal', dashboardRoute: '/role-views/client-portal', description: 'External-facing status and delivery transparency.' },
];

const STORAGE_KEY = 'ppc.role_view_lens';

interface RoleViewContextValue {
  activeRole: RolePreset;
  canSwitchRoles: boolean;
  setActiveRole: (key: RoleViewKey) => void;
  presets: RolePreset[];
}

const RoleViewContext = createContext<RoleViewContextValue | null>(null);

function normalizeRole(role: string | null | undefined): string {
  return String(role || '').trim().toLowerCase();
}

function defaultRoleForUser(userRole: string | null | undefined, canViewAll: boolean): RoleViewKey {
  if (canViewAll) return 'product-owner';
  const role = normalizeRole(userRole);
  if (role.includes('project lead')) return 'project-lead';
  if (role.includes('senior manager')) return 'senior-manager';
  if (role.includes('coo')) return 'coo';
  if (role.includes('client')) return 'client';
  return 'project-lead';
}

function asPreset(key: RoleViewKey): RolePreset {
  return ROLE_PRESETS.find((preset) => preset.key === key) || ROLE_PRESETS[0];
}

export function RoleViewProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const canSwitchRoles = Boolean(user?.canViewAll);
  const userDefaultRole = defaultRoleForUser(user?.role, canSwitchRoles);
  const [activeRoleKey, setActiveRoleKey] = useState<RoleViewKey>(userDefaultRole);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(STORAGE_KEY) as RoleViewKey | null;
    if (!saved) return;
    if (!ROLE_PRESETS.some((preset) => preset.key === saved)) return;
    if (!canSwitchRoles && saved !== userDefaultRole) return;
    setActiveRoleKey(saved);
  }, [canSwitchRoles, userDefaultRole]);

  useEffect(() => {
    if (!canSwitchRoles && activeRoleKey !== userDefaultRole) {
      setActiveRoleKey(userDefaultRole);
    }
  }, [activeRoleKey, canSwitchRoles, userDefaultRole]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, activeRoleKey);
  }, [activeRoleKey]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-role-view', activeRoleKey);
    return () => {
      document.documentElement.removeAttribute('data-role-view');
    };
  }, [activeRoleKey]);

  const value = useMemo<RoleViewContextValue>(() => ({
    activeRole: asPreset(activeRoleKey),
    canSwitchRoles,
    setActiveRole: (key: RoleViewKey) => {
      if (!canSwitchRoles && key !== userDefaultRole) return;
      setActiveRoleKey(key);
    },
    presets: ROLE_PRESETS,
  }), [activeRoleKey, canSwitchRoles, userDefaultRole]);

  return <RoleViewContext.Provider value={value}>{children}</RoleViewContext.Provider>;
}

export function useRoleView() {
  const context = useContext(RoleViewContext);
  if (!context) {
    throw new Error('useRoleView must be used within RoleViewProvider');
  }
  return context;
}

