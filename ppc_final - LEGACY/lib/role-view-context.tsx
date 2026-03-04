'use client';

/**
 * @fileoverview Global role-view lens context.
 *
 * Enables Product Owner "view as role" simulation across the entire app shell
 * so navigation and UI framing can be switched without logging in/out.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useUser } from '@/lib/user-context';
import { ROLE_PRESETS, getRolePreset, normalizeRoleKey } from '@/lib/role-navigation';
import type { RolePreset, RoleViewKey } from '@/types/role-workstation';

export type { RolePreset, RoleViewKey };

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
  if (canViewAll) return 'product_owner';
  const role = normalizeRole(userRole);
  if (role.includes('project lead')) return 'project_lead';
  if (role.includes('senior manager')) return 'senior_manager';
  if (role.includes('coo')) return 'coo';
  if (role.includes('pca')) return 'pca';
  if (role.includes('pcl')) return 'pcl';
  if (role.includes('rda')) return 'rda';
  if (role.includes('client')) return 'client_portal';
  return 'project_lead';
}

function asPreset(key: RoleViewKey): RolePreset {
  return getRolePreset(key);
}

export function RoleViewProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const canSwitchRoles = Boolean(user?.canViewAll);
  const userDefaultRole = defaultRoleForUser(user?.role, canSwitchRoles);
  const [activeRoleKey, setActiveRoleKey] = useState<RoleViewKey>(userDefaultRole);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedRaw = window.localStorage.getItem(STORAGE_KEY);
    const saved = savedRaw ? normalizeRoleKey(savedRaw) : null;
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
      const normalized = normalizeRoleKey(key);
      if (!canSwitchRoles && normalized !== userDefaultRole) return;
      setActiveRoleKey(normalized);
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
