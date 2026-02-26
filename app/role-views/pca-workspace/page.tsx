'use client';

/**
 * @fileoverview PCA Mapping Workspace (Phase 7.2).
 *
 * Operational UI for reviewing, filtering, and actioning mapping suggestions.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/data-context';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';
import MetricProvenanceOverlay from '@/components/role-workstations/MetricProvenanceOverlay';
import MappingSuggestionPanel from '@/components/role-workstations/MappingSuggestionPanel';

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

export default function PcaWorkspacePage() {
  const { filteredData, data: fullData, refreshData } = useData();
  const { activeRole } = useRoleView();
  const { user } = useUser();
  const projects = useMemo(() => {
    const active = filteredData?.projects?.length ? filteredData.projects : fullData?.projects;
    return (active || []).map((project) => ({
      id: String(project.id || project.projectId || ''),
      name: String(project.name || project.id || project.projectId || 'Unknown'),
    })).filter((project) => project.id);
  }, [filteredData?.projects, fullData?.projects]);

  const [projectId, setProjectId] = useState<string>('');
  const [status, setStatus] = useState<'pending' | 'applied' | 'dismissed' | 'all'>('pending');
  const [minConfidence, setMinConfidence] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [stats, setStats] = useState<SuggestionStats | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const apiHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      'x-role-view': activeRole.key,
      'x-actor-email': user?.email || '',
    }),
    [activeRole.key, user?.email],
  );

  useEffect(() => {
    if (!projectId && projects.length > 0) {
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
    const result = await response.json();
    if (response.ok && result.success) {
      setStats(result.stats as SuggestionStats);
    }
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
          limit: 200,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load suggestions');
      }
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
    const result = await response.json();
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
    const result = await response.json();
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
        minConfidence: Math.max(0.9, minConfidence),
        limit: 100,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      setMessage(result.error || 'Failed to batch apply');
      return;
    }
    setMessage(`Applied ${Number(result.applied || 0)} suggestion(s).`);
    await refreshData();
    await loadSuggestions();
  }, [apiHeaders, loadSuggestions, minConfidence, projectId, refreshData]);

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Role View</div>
          <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.5rem' }}>PCA Mapping Workspace</h1>
        </div>
        <Link href="/role-views/pca" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Back to PCA workstation</Link>
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
            metric: 'Applied Suggestions',
            formulaId: 'MAP_APPLIED_COUNT_V1',
            formula: "COUNT(mapping_suggestions where status='applied')",
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
        <button type="button" onClick={() => void loadSuggestions()} style={{ padding: '0.48rem 0.75rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          Refresh
        </button>
        <button type="button" onClick={() => void applyBatch()} style={{ padding: '0.48rem 0.75rem', borderRadius: 8, border: 'none', background: 'var(--pinnacle-teal)', color: '#05201d', fontWeight: 700 }}>
          Apply Batch (&gt;= 0.90)
        </button>
      </div>

      {message ? <div style={{ fontSize: '0.78rem', color: '#F59E0B' }}>{message}</div> : null}

      <MappingSuggestionPanel
        loading={loading}
        suggestions={suggestions}
        onApply={(id) => { void applySuggestion(id); }}
        onDismiss={(id) => { void dismissSuggestion(id); }}
      />
    </div>
  );
}
