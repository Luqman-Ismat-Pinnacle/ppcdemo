'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type ProjectOption = {
  id: string;
  name: string;
};

type ProjectScopeContextValue = {
  projects: ProjectOption[];
  selectedProjectId: string;
  setSelectedProjectId: (_projectId: string) => void;
  isLoading: boolean;
};

const STORAGE_KEY = 'ppc.global_project_scope';
const ProjectScopeContext = createContext<ProjectScopeContextValue | null>(null);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function appendProjectParams(url: URL, projectId: string) {
  if (!projectId) return;
  if (!url.searchParams.get('projectId')) url.searchParams.set('projectId', projectId);
  if (!url.searchParams.get('project_id')) url.searchParams.set('project_id', projectId);
}

function maybeFilterByProject(value: unknown, projectId: string, projectName: string): unknown {
  if (Array.isArray(value)) {
    const filteredItems = value
      .map((v) => maybeFilterByProject(v, projectId, projectName))
      .filter((v) => v !== undefined);
    return filteredItems;
  }
  if (!isObject(value)) return value;

  const looksLikeProjectRecord = (
    value.id != null &&
    value.name != null &&
    (
      value.has_schedule != null ||
      value.percent_complete != null ||
      value.actual_hours != null ||
      value.customer_name != null ||
      value.portfolio_name != null ||
      value.workstream != null
    )
  );
  if (
    value.project_id != null ||
    value.projectId != null ||
    value.project_name != null ||
    value.projectName != null ||
    looksLikeProjectRecord
  ) {
    const idMatch = String(value.project_id ?? value.projectId ?? value.id ?? '') === projectId;
    const nameMatch = String(value.project_name ?? value.projectName ?? value.name ?? '').trim() === projectName;
    if (!idMatch && !nameMatch) return undefined;
  }

  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === 'taskStatusByProject' && isObject(v)) {
      next[k] = projectId in v ? { [projectId]: v[projectId] } : {};
      continue;
    }
    const child = maybeFilterByProject(v, projectId, projectName);
    if (child !== undefined) next[k] = child;
  }
  return next;
}

export function ProjectScopeProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectIdState] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/tables/projects?limit=2000', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const rows: Array<{ id?: unknown; name?: unknown }> = Array.isArray(d?.rows) ? d.rows : [];
        const options: ProjectOption[] = rows
          .map((row) => ({ id: String(row?.id || ''), name: String(row?.name || '') }))
          .filter((p: ProjectOption) => p.id && p.name)
          .sort((a: ProjectOption, b: ProjectOption) => a.name.localeCompare(b.name));
        setProjects(options);
        if (!options.length) {
          setSelectedProjectIdState('');
          setIsLoading(false);
          return;
        }
        const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : '';
        const fromUrl = typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('projectId')
          : '';
        const preferred = options.find((p) => p.id === fromUrl)?.id
          || options.find((p) => p.id === stored)?.id
          || options[0].id;
        setSelectedProjectIdState(preferred);
        setIsLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setProjects([]);
        setSelectedProjectIdState('');
        setIsLoading(false);
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedProjectId) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !selectedProjectId) return;
    const selectedProjectName = projects.find((p) => p.id === selectedProjectId)?.name || '';
    const originalFetch = window.fetch.bind(window);
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();
      if (method !== 'GET') return originalFetch(input, init);
      try {
        const requestUrl = typeof input === 'string' || input instanceof URL
          ? new URL(String(input), window.location.origin)
          : new URL(input.url, window.location.origin);
        if (requestUrl.origin !== window.location.origin || !requestUrl.pathname.startsWith('/api/')) {
          return originalFetch(input, init);
        }
        if (requestUrl.pathname === '/api/tables/projects') return originalFetch(input, init);
        appendProjectParams(requestUrl, selectedProjectId);
        const headers = new Headers(init?.headers || (typeof input === 'object' && 'headers' in input ? input.headers : undefined));
        if (!headers.get('x-project-id')) headers.set('x-project-id', selectedProjectId);
        return originalFetch(requestUrl.toString(), { ...init, headers }).then(async (res) => {
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) return res;
          try {
            const payload = await res.clone().json();
            const scoped = maybeFilterByProject(payload, selectedProjectId, selectedProjectName);
            if (scoped == null) return res;
            const nextHeaders = new Headers(res.headers);
            nextHeaders.delete('content-length');
            return new Response(JSON.stringify(scoped), {
              status: res.status,
              statusText: res.statusText,
              headers: nextHeaders,
            });
          } catch {
            return res;
          }
        });
      } catch {
        return originalFetch(input, init);
      }
    }) as typeof window.fetch;
    return () => {
      window.fetch = originalFetch;
    };
  }, [selectedProjectId, projects]);

  const value = useMemo<ProjectScopeContextValue>(() => ({
    projects,
    selectedProjectId,
    setSelectedProjectId: (projectId: string) => {
      setSelectedProjectIdState(projectId);
    },
    isLoading,
  }), [projects, selectedProjectId, isLoading]);

  return <ProjectScopeContext.Provider value={value}>{children}</ProjectScopeContext.Provider>;
}

export function useProjectScope() {
  const ctx = useContext(ProjectScopeContext);
  if (!ctx) throw new Error('useProjectScope must be used within ProjectScopeProvider');
  return ctx;
}
