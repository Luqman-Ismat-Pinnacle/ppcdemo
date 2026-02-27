'use client';

/**
 * @fileoverview Canonical mapping workspace.
 *
 * Consolidates PCA mapping operations from legacy role routes into one
 * project-controls destination used by header navigation and parity redirects.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MappingSuggestionPanel from '@/components/role-workstations/MappingSuggestionPanel';
import MetricProvenanceOverlay from '@/components/role-workstations/MetricProvenanceOverlay';
import { useData } from '@/lib/data-context';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';
import { parseHourDescription } from '@/lib/hours-description';

type Suggestion = {
  id: number;
  hourEntryId: string;
  taskId: string;
  confidence: number;
  status: 'pending' | 'applied' | 'dismissed';
  hoursDate: string | null;
  hoursQuantity: number | null;
  taskName: string | null;
  reasoning: string | null;
  createdAt: string;
};

type SuggestionStats = {
  pendingCount: number;
  appliedCount: number;
  dismissedCount: number;
  stalePendingCount: number;
  avgPendingConfidence: number;
};

type PhaseBucket = {
  id: string;
  name: string;
  unit?: string;
};

export default function MappingWorkspacePage() {
  const { filteredData, data: fullData, refreshData } = useData();
  const { activeRole } = useRoleView();
  const { user } = useUser();

  const projects = useMemo(() => {
    // Drive project options from full data so mapping remains operational even when role
    // scope filters hide portions of data in the current view.
    const activeProjects = (fullData?.projects || filteredData?.projects || []) as unknown as Array<Record<string, unknown>>;
    const docs = (fullData?.projectDocuments || filteredData?.projectDocuments || []) as unknown as Array<Record<string, unknown>>;
    const workdayPhases = (fullData?.workdayPhases || filteredData?.workdayPhases || []) as unknown as Array<Record<string, unknown>>;
    const projectsWithDocs = new Set(
      docs.map((doc) => String(doc.projectId || doc.project_id || '')).filter(Boolean),
    );
    const projectsWithWorkdayPhases = new Set(
      workdayPhases.map((phase) => String(phase.projectId || phase.project_id || '')).filter(Boolean),
    );
    return (activeProjects || [])
      .map((project) => {
        const id = String(project.id || project.projectId || '');
        const name = String(project.name || project.projectName || project.id || 'Unknown');
        const hasPlan = Boolean(
          project.has_schedule ||
          project.hasSchedule ||
          projectsWithDocs.has(id) ||
          projectsWithWorkdayPhases.has(id),
        );
        return { id, name, hasPlan };
      })
      .filter((project) => project.id && project.hasPlan);
  }, [
    filteredData?.projects,
    fullData?.projects,
    fullData?.projectDocuments,
    filteredData?.projectDocuments,
    fullData?.workdayPhases,
    filteredData?.workdayPhases,
  ]);

  const [projectId, setProjectId] = useState('');
  const [mappingSearch, setMappingSearch] = useState('');
  const [status, setStatus] = useState<'pending' | 'applied' | 'dismissed' | 'all'>('pending');
  const [minConfidence, setMinConfidence] = useState(0);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [stats, setStats] = useState<SuggestionStats | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingResult, setMappingResult] = useState<{ matched: number; unmatched: number; considered: number } | null>(null);
  const [mappingTaskPickerByBucket, setMappingTaskPickerByBucket] = useState<Record<string, string | null>>({});

  const apiHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      'x-role-view': activeRole.key,
      'x-actor-email': user?.email || '',
    }),
    [activeRole.key, user?.email],
  );

  useEffect(() => {
    if (projects.length === 0) {
      if (projectId) setProjectId('');
      return;
    }
    if (!projectId || !projects.some((project) => project.id === projectId)) {
      setProjectId(projects[0].id);
    }
  }, [projectId, projects]);

  const loadStats = useCallback(async (selectedProjectId: string) => {
    if (!selectedProjectId) return;
    const response = await fetch('/api/data/mapping', {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({ action: 'mappingSuggestionsStats', projectId: selectedProjectId }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.success) setStats(result.stats as SuggestionStats);
  }, [apiHeaders]);

  const loadSuggestions = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/data/mapping', {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({
          action: 'listMappingSuggestions',
          projectId,
          status,
          minConfidence: minConfidence > 0 ? minConfidence : undefined,
          limit: 250,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to load suggestions');
      setSuggestions(Array.isArray(result.suggestions) ? result.suggestions : []);
      await loadStats(projectId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setMessage(detail);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [apiHeaders, loadStats, minConfidence, projectId, status]);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  const applySuggestion = useCallback(async (id: number) => {
    const response = await fetch('/api/data/mapping', {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({ action: 'applyMappingSuggestion', suggestionId: id }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      setMessage(result.error || 'Failed to apply suggestion');
      return;
    }
    await refreshData();
    await loadSuggestions();
  }, [apiHeaders, loadSuggestions, refreshData]);

  const dismissSuggestion = useCallback(async (id: number) => {
    const response = await fetch('/api/data/mapping', {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({ action: 'dismissMappingSuggestion', suggestionId: id }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      setMessage(result.error || 'Failed to dismiss suggestion');
      return;
    }
    await loadSuggestions();
  }, [apiHeaders, loadSuggestions]);

  const applyBatch = useCallback(async () => {
    if (!projectId) return;
    const response = await fetch('/api/data/mapping', {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({
        action: 'applyMappingSuggestionsBatch',
        projectId,
        minConfidence: Math.max(0.85, minConfidence || 0),
        limit: 150,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      setMessage(result.error || 'Failed to batch apply');
      return;
    }
    setMessage(`Applied ${Number(result.applied || 0)} suggestion(s).`);
    await refreshData();
    await loadSuggestions();
  }, [apiHeaders, loadSuggestions, minConfidence, projectId, refreshData]);

  const rematchHoursByPhaseName = useCallback(async () => {
    if (!projectId) return;
    setMappingSaving(true);
    setMessage(null);
    setMappingResult(null);
    try {
      const response = await fetch('/api/data/mapping', {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({
          action: 'matchWorkdayPhaseToHoursPhases',
          projectId,
          rematchAll: true,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to match hours by phase name');
      setMappingResult({
        matched: Number(result.matched || 0),
        unmatched: Number(result.unmatched || 0),
        considered: Number(result.considered || 0),
      });
      await refreshData();
      await loadSuggestions();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setMessage(detail);
    } finally {
      setMappingSaving(false);
    }
  }, [apiHeaders, loadSuggestions, projectId, refreshData]);

  const scopedHours = useMemo(() => {
    if (!projectId) return [];
    const rows = ((fullData.hours?.length ? fullData.hours : filteredData.hours) || []) as unknown as Array<Record<string, unknown>>;
    let scoped = rows.filter((row) => String(row.projectId || row.project_id || '') === projectId);
    if (mappingSearch.trim()) {
      const query = mappingSearch.trim().toLowerCase();
      scoped = scoped.filter((row) => {
        const parsed = parseHourDescription(String(row.description || ''));
        const haystack = [
          row.id,
          row.description,
          row.phases,
          row.task,
          row.chargeCode,
          row.charge_code,
          parsed.phases,
          parsed.task,
          parsed.chargeCode,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      });
    }
    return scoped;
  }, [fullData.hours, filteredData.hours, projectId, mappingSearch]);

  const scopedTasks = useMemo(() => {
    if (!projectId) return [];
    const rows = ((fullData.tasks?.length ? fullData.tasks : filteredData.tasks) || []) as unknown as Array<Record<string, unknown>>;
    let scoped = rows.filter((row) => String(row.projectId || row.project_id || '') === projectId);
    if (mappingSearch.trim()) {
      const query = mappingSearch.trim().toLowerCase();
      scoped = scoped.filter((row) => {
        const haystack = [
          row.id,
          row.taskId,
          row.name,
          row.taskName,
          row.wbsCode,
          row.workdayPhaseId,
          row.workday_phase_id,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      });
    }
    return scoped;
  }, [fullData.tasks, filteredData.tasks, projectId, mappingSearch]);

  const scopedWorkdayPhases = useMemo(() => {
    if (!projectId) return [];
    const rows = ((fullData.workdayPhases?.length ? fullData.workdayPhases : filteredData.workdayPhases) || []) as unknown as Array<Record<string, unknown>>;
    return rows
      .filter((row) => String(row.projectId || row.project_id || '') === projectId)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [fullData.workdayPhases, filteredData.workdayPhases, projectId]);

  const bucketedHours = useMemo(() => {
    const buckets = new Map<string, { entries: number; hours: number }>();
    scopedHours.forEach((hour) => {
      const phaseId = String(hour.workdayPhaseId || hour.workday_phase_id || 'unassigned');
      const next = buckets.get(phaseId) || { entries: 0, hours: 0 };
      next.entries += 1;
      next.hours += Number(hour.hours || 0);
      buckets.set(phaseId, next);
    });
    return buckets;
  }, [scopedHours]);

  const hoursByWorkdayPhaseForProject = useMemo(() => {
    const buckets = new Map<string, Array<Record<string, unknown>>>();
    buckets.set('unassigned', []);
    scopedHours.forEach((hour) => {
      const key = String(hour.workdayPhaseId || hour.workday_phase_id || 'unassigned');
      const current = buckets.get(key) || [];
      current.push(hour);
      buckets.set(key, current);
    });
    return buckets;
  }, [scopedHours]);

  const tasksByWorkdayPhaseForProject = useMemo(() => {
    const buckets = new Map<string, Array<Record<string, unknown>>>();
    buckets.set('unassigned', []);
    scopedTasks.forEach((task) => {
      const key = String(task.workdayPhaseId || task.workday_phase_id || 'unassigned');
      const current = buckets.get(key) || [];
      current.push(task);
      buckets.set(key, current);
    });
    return buckets;
  }, [scopedTasks]);

  const hoursByTaskForMappingProject = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    scopedHours.forEach((hour) => {
      const taskId = String(hour.taskId || hour.task_id || '');
      if (!taskId) return;
      const current = map.get(taskId) || [];
      current.push(hour);
      map.set(taskId, current);
    });
    return map;
  }, [scopedHours]);

  const taskOptionsForSelectedProject = useMemo(() => {
    return scopedTasks
      .map((task) => ({
        id: String(task.id || task.taskId || ''),
        name: String(task.name || task.taskName || task.id || ''),
      }))
      .filter((task) => task.id);
  }, [scopedTasks]);

  const unmappedHours = useMemo(
    () => scopedHours.filter((hour) => !String(hour.workdayPhaseId || hour.workday_phase_id || '').trim()),
    [scopedHours],
  );

  const assignHourToWorkdayPhase = useCallback(async (hourId: string, workdayPhaseId: string | null) => {
    if (!hourId) return;
    setMappingSaving(true);
    try {
      const response = await fetch('/api/data/mapping', {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ action: 'assignHourToWorkdayPhase', hourId, workdayPhaseId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to assign hour to phase');
      await refreshData();
      await loadSuggestions();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setMessage(detail);
    } finally {
      setMappingSaving(false);
    }
  }, [apiHeaders, refreshData, loadSuggestions]);

  const assignHourToTask = useCallback(async (hourId: string, taskId: string | null) => {
    if (!hourId) return;
    setMappingSaving(true);
    try {
      const response = await fetch('/api/data/mapping', {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ action: 'assignHourToTask', hourId, taskId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to assign hour to task');
      await refreshData();
      await loadSuggestions();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setMessage(detail);
    } finally {
      setMappingSaving(false);
    }
  }, [apiHeaders, refreshData, loadSuggestions]);

  const assignTaskToWorkdayPhase = useCallback(async (taskId: string, workdayPhaseId: string | null) => {
    if (!taskId) return;
    setMappingSaving(true);
    try {
      const response = await fetch('/api/data/mapping', {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ action: 'assignTaskToWorkdayPhase', taskId, workdayPhaseId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to assign task to phase');
      await refreshData();
      await loadSuggestions();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setMessage(detail);
    } finally {
      setMappingSaving(false);
    }
  }, [apiHeaders, refreshData, loadSuggestions]);

  const autoMatchHoursToTasksInBucket = useCallback(async (workdayPhaseId: string) => {
    if (!projectId || !workdayPhaseId) return;
    setMappingSaving(true);
    try {
      const response = await fetch('/api/data/mapping', {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ action: 'autoMatchHoursToTasksInWorkdayPhaseBucket', projectId, workdayPhaseId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to auto-match bucket');
      setMessage(`Auto-match in bucket complete: ${Number(result.matched || 0)} matched, ${Number(result.unmatched || 0)} unmatched.`);
      await refreshData();
      await loadSuggestions();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setMessage(detail);
    } finally {
      setMappingSaving(false);
    }
  }, [apiHeaders, loadSuggestions, projectId, refreshData]);

  return (
    <div className="page-panel" style={{ display: 'grid', gap: '0.75rem' }}>
      <div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Project Controls</div>
        <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.42rem' }}>Mapping Workspace</h1>
        <div style={{ marginTop: '0.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Full mapping parity route with suggestion triage, batch apply, and audit-backed actions.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.6rem' }}>
        {[
          { label: 'Pending', value: stats?.pendingCount ?? 0 },
          { label: 'Applied', value: stats?.appliedCount ?? 0 },
          { label: 'Dismissed', value: stats?.dismissedCount ?? 0 },
          { label: 'Stale Pending', value: stats?.stalePendingCount ?? 0 },
        ].map((card) => (
          <div key={card.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '0.65rem' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{card.label}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{card.value}</div>
          </div>
        ))}
      </div>

      <MetricProvenanceOverlay
        entries={[
          {
            metric: 'Pending Suggestions',
            formulaId: 'MAP_PENDING_COUNT_V1',
            formula: "COUNT(mapping_suggestions where status='pending')",
            sources: ['mapping_suggestions'],
            scope: 'selected project',
            window: 'current snapshot',
          },
          {
            metric: 'Stale Pending',
            formulaId: 'MAP_STALE_PENDING_V1',
            formula: "COUNT(pending suggestions older than 3 days)",
            sources: ['mapping_suggestions'],
            scope: 'selected project',
            window: 'rolling 3 days',
          },
        ]}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 260 }}>
          <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4 }}>Project</label>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} style={{ width: '100%', padding: '0.48rem 0.56rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 150 }}>
          <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4 }}>Status</label>
          <select value={status} onChange={(event) => setStatus(event.target.value as 'pending' | 'applied' | 'dismissed' | 'all')} style={{ width: '100%', padding: '0.48rem 0.56rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
            <option value="pending">Pending</option>
            <option value="applied">Applied</option>
            <option value="dismissed">Dismissed</option>
            <option value="all">All</option>
          </select>
        </div>
        <div style={{ minWidth: 150 }}>
          <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4 }}>Min Confidence</label>
          <input type="number" min={0} max={1} step={0.01} value={minConfidence} onChange={(event) => setMinConfidence(Math.min(1, Math.max(0, Number(event.target.value || 0))))} style={{ width: '100%', padding: '0.48rem 0.56rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }} />
        </div>
        <div style={{ minWidth: 220 }}>
          <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4 }}>Search (tasks + hours)</label>
          <input
            type="text"
            value={mappingSearch}
            onChange={(event) => setMappingSearch(event.target.value)}
            placeholder="Filter entries..."
            style={{ width: '100%', padding: '0.48rem 0.56rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
          />
        </div>
        <button type="button" onClick={() => { void loadSuggestions(); }} style={{ padding: '0.48rem 0.75rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          Refresh
        </button>
        <button type="button" onClick={() => { void applyBatch(); }} style={{ padding: '0.48rem 0.75rem', borderRadius: 8, border: 'none', background: 'var(--pinnacle-teal)', color: '#05201d', fontWeight: 700 }}>
          Apply Batch (&gt;= 0.85)
        </button>
        <button
          type="button"
          disabled={mappingSaving || !projectId}
          onClick={() => { void rematchHoursByPhaseName(); }}
          style={{
            padding: '0.48rem 0.75rem',
            borderRadius: 8,
            border: '1px solid var(--border-color)',
            background: mappingSaving ? 'var(--bg-tertiary)' : 'rgba(16,185,129,0.16)',
            color: mappingSaving ? 'var(--text-muted)' : '#10b981',
            fontWeight: 700,
          }}
        >
          {mappingSaving ? 'Matching...' : 'Re-Match Hours by Phase Name'}
        </button>
      </div>

      {message ? <div style={{ fontSize: '0.78rem', color: '#F59E0B' }}>{message}</div> : null}
      {mappingResult ? (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          Phase-name matching complete: <strong>{mappingResult.matched}</strong> matched, <strong>{mappingResult.unmatched}</strong> unmatched, <strong>{mappingResult.considered}</strong> considered.
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.6rem' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '0.65rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Project Hours</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{scopedHours.length}</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '0.65rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Workday Phases</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{scopedWorkdayPhases.length}</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '0.65rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Unmapped Hours</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{unmappedHours.length}</div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '0.65rem 0.75rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          Workday Phase Buckets (hours grouped by mapped phase id)
        </div>
        <div style={{ maxHeight: 280, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={{ textAlign: 'left', padding: '0.45rem 0.6rem', borderBottom: '1px solid var(--border-color)' }}>Phase</th>
                <th style={{ textAlign: 'left', padding: '0.45rem 0.6rem', borderBottom: '1px solid var(--border-color)' }}>Entries</th>
                <th style={{ textAlign: 'left', padding: '0.45rem 0.6rem', borderBottom: '1px solid var(--border-color)' }}>Hours</th>
              </tr>
            </thead>
            <tbody>
              {scopedWorkdayPhases.map((phase) => {
                const id = String(phase.id || '');
                const bucket = bucketedHours.get(id) || { entries: 0, hours: 0 };
                return (
                  <tr key={`phase-${id}`}>
                    <td style={{ padding: '0.42rem 0.6rem', borderBottom: '1px solid var(--border-color)' }}>{String(phase.name || id || '-')}</td>
                    <td style={{ padding: '0.42rem 0.6rem', borderBottom: '1px solid var(--border-color)' }}>{bucket.entries}</td>
                    <td style={{ padding: '0.42rem 0.6rem', borderBottom: '1px solid var(--border-color)' }}>{bucket.hours.toFixed(1)}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ padding: '0.42rem 0.6rem', borderBottom: '1px solid var(--border-color)' }}>Unassigned</td>
                <td style={{ padding: '0.42rem 0.6rem', borderBottom: '1px solid var(--border-color)' }}>{(bucketedHours.get('unassigned') || { entries: 0 }).entries}</td>
                <td style={{ padding: '0.42rem 0.6rem', borderBottom: '1px solid var(--border-color)' }}>{(bucketedHours.get('unassigned') || { hours: 0 }).hours.toFixed(1)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '0.85rem', alignItems: 'start' }}>
        {([
          { id: 'unassigned', name: 'Unassigned' },
          ...scopedWorkdayPhases.map((phase) => ({
            id: String(phase.id || ''),
            name: String(phase.name || phase.id || ''),
            unit: String(phase.unit || ''),
          })),
        ] as PhaseBucket[]).map((bucket) => {
          const bucketKey = bucket.id;
          const bucketPhaseId = bucketKey === 'unassigned' ? null : bucketKey;
          const bucketTasks = tasksByWorkdayPhaseForProject.get(bucketKey) || [];
          const bucketHours = hoursByWorkdayPhaseForProject.get(bucketKey) || [];
          const selectedTaskForBucket = mappingTaskPickerByBucket[bucketKey] || '';
          const taskIdsInBucket = new Set(bucketTasks.map((task) => String(task.id || task.taskId || '')));
          const availableTasks = taskOptionsForSelectedProject.filter((task) => !taskIdsInBucket.has(task.id));

          return (
            <div key={`bucket-${bucketKey}`} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {bucket.unit ? `${String(bucket.unit)} -> ` : ''}{bucket.name}
              </div>

              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-tertiary)', padding: '0.6rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.45rem' }}>
                  Tasks ({bucketTasks.length})
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <select
                    value={selectedTaskForBucket}
                    onChange={(event) => setMappingTaskPickerByBucket((prev) => ({ ...prev, [bucketKey]: event.target.value || null }))}
                    style={{ flex: 1, padding: '0.25rem 0.35rem', fontSize: '0.72rem', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)' }}
                  >
                    <option value="">Add task to bucket...</option>
                    {availableTasks.map((task) => (
                      <option key={`task-opt-${bucketKey}-${task.id}`} value={task.id}>{task.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedTaskForBucket) return;
                      void assignTaskToWorkdayPhase(selectedTaskForBucket, bucketPhaseId);
                      setMappingTaskPickerByBucket((prev) => ({ ...prev, [bucketKey]: null }));
                    }}
                    disabled={!selectedTaskForBucket || mappingSaving}
                    style={{ border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: 6, padding: '0.2rem 0.45rem', fontSize: '0.68rem', cursor: 'pointer' }}
                  >
                    Add
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.55rem', maxHeight: '210px', overflowY: 'auto' }}>
                  {bucketTasks.map((task) => {
                    const taskId = String(task.id || task.taskId || '');
                    return (
                      <div key={`task-${bucketKey}-${taskId}`} style={{ border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.45rem', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', gap: '0.35rem' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {String(task.name || task.taskName || taskId)}
                          </div>
                          <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>
                            {String(task.wbsCode || taskId)} · Linked hours: {(hoursByTaskForMappingProject.get(taskId) || []).length}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void assignTaskToWorkdayPhase(taskId, null)}
                          style={{ border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderRadius: 6, padding: '0.2rem 0.45rem', fontSize: '0.68rem', cursor: 'pointer' }}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-tertiary)', padding: '0.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.35rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    Hours Entries ({bucketHours.length})
                  </div>
                  {bucketPhaseId && (
                    <button
                      type="button"
                      onClick={() => void autoMatchHoursToTasksInBucket(bucketPhaseId)}
                      disabled={mappingSaving}
                      style={{ border: '1px solid var(--border-color)', borderRadius: 999, padding: '0.18rem 0.45rem', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.66rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Auto-Match
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '280px', overflowY: 'auto' }}>
                  {bucketHours.map((hour) => {
                    const hourId = String(hour.id || '');
                    const parsed = parseHourDescription(String(hour.description || ''));
                    const selectedTaskId = String(hour.taskId || hour.task_id || '');
                    return (
                      <div key={`hour-${bucketKey}-${hourId}`} style={{ border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.45rem', background: 'var(--bg-primary)', display: 'grid', gridTemplateColumns: '1fr', gap: '0.35rem' }}>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {String(hour.date || '').slice(0, 10)} · {Number(hour.hours || 0)}h · {hourId}
                        </div>
                        <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>
                          Phase: {String(hour.phases || parsed.phases || 'Unspecified')}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                          <select
                            value={bucketPhaseId || ''}
                            onChange={(event) => void assignHourToWorkdayPhase(hourId, event.target.value || null)}
                            style={{ width: '100%', padding: '0.25rem 0.35rem', fontSize: '0.7rem', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)' }}
                          >
                            <option value="">Unassigned phase</option>
                            {scopedWorkdayPhases.map((phase) => (
                              <option key={`phase-opt-${String(phase.id || '')}`} value={String(phase.id || '')}>
                                {String(phase.name || phase.id || '')}
                              </option>
                            ))}
                          </select>
                          <select
                            value={selectedTaskId}
                            onChange={(event) => void assignHourToTask(hourId, event.target.value || null)}
                            style={{ width: '100%', padding: '0.25rem 0.35rem', fontSize: '0.7rem', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)' }}
                          >
                            <option value="">Link task...</option>
                            {bucketTasks.map((task) => {
                              const taskId = String(task.id || task.taskId || '');
                              return (
                                <option key={`hour-task-opt-${hourId}-${taskId}`} value={taskId}>
                                  {String(task.name || task.taskName || taskId)}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <MappingSuggestionPanel
        loading={loading}
        suggestions={suggestions}
        onApply={(id) => { void applySuggestion(id); }}
        onDismiss={(id) => { void dismissSuggestion(id); }}
      />
    </div>
  );
}
