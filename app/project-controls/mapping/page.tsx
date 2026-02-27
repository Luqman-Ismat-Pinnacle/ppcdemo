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

export default function MappingWorkspacePage() {
  const { filteredData, data: fullData, refreshData } = useData();
  const { activeRole } = useRoleView();
  const { user } = useUser();

  const projects = useMemo(() => {
    const active = filteredData?.projects?.length ? filteredData.projects : fullData?.projects;
    return (active || [])
      .map((project) => {
        const row = project as unknown as Record<string, unknown>;
        const id = String(row.id || row.projectId || '');
        const name = String(row.name || row.projectName || row.id || 'Unknown');
        return { id, name };
      })
      .filter((project) => project.id);
  }, [filteredData?.projects, fullData?.projects]);

  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState<'pending' | 'applied' | 'dismissed' | 'all'>('pending');
  const [minConfidence, setMinConfidence] = useState(0);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [stats, setStats] = useState<SuggestionStats | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingResult, setMappingResult] = useState<{ matched: number; unmatched: number; considered: number } | null>(null);

  const apiHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      'x-role-view': activeRole.key,
      'x-actor-email': user?.email || '',
    }),
    [activeRole.key, user?.email],
  );

  useEffect(() => {
    if (!projectId && projects.length > 0) setProjectId(projects[0].id);
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
    const rows = ((filteredData.hours?.length ? filteredData.hours : fullData.hours) || []) as unknown as Array<Record<string, unknown>>;
    return rows.filter((row) => String(row.projectId || row.project_id || '') === projectId);
  }, [filteredData.hours, fullData.hours, projectId]);

  const scopedWorkdayPhases = useMemo(() => {
    if (!projectId) return [];
    const rows = ((filteredData.workdayPhases?.length ? filteredData.workdayPhases : fullData.workdayPhases) || []) as unknown as Array<Record<string, unknown>>;
    return rows
      .filter((row) => String(row.projectId || row.project_id || '') === projectId)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [filteredData.workdayPhases, fullData.workdayPhases, projectId]);

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

  const unmappedHours = useMemo(
    () => scopedHours.filter((hour) => !String(hour.workdayPhaseId || hour.workday_phase_id || '').trim()),
    [scopedHours],
  );

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

      <MappingSuggestionPanel
        loading={loading}
        suggestions={suggestions}
        onApply={(id) => { void applySuggestion(id); }}
        onDismiss={(id) => { void dismissSuggestion(id); }}
      />
    </div>
  );
}
