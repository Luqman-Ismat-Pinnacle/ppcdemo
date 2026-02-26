'use client';

/**
 * @fileoverview PCA Mapping Workspace (Phase 7.2).
 *
 * Operational UI for reviewing, filtering, and actioning mapping suggestions.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/data-context';

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

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(projects[0].id);
    }
  }, [projectId, projects]);

  const loadStats = useCallback(async (selectedProjectId: string) => {
    if (!selectedProjectId) return;
    const response = await fetch('/api/data/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mappingSuggestionsStats', projectId: selectedProjectId }),
    });
    const result = await response.json();
    if (response.ok && result.success) {
      setStats(result.stats as SuggestionStats);
    }
  }, []);

  const loadSuggestions = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/data/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  }, [loadStats, minConfidence, projectId, status]);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  const applySuggestion = useCallback(async (id: number) => {
    const response = await fetch('/api/data/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'applyMappingSuggestion', suggestionId: id }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      setMessage(result.error || 'Failed to apply suggestion');
      return;
    }
    await refreshData();
    await loadSuggestions();
  }, [loadSuggestions, refreshData]);

  const dismissSuggestion = useCallback(async (id: number) => {
    const response = await fetch('/api/data/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismissMappingSuggestion', suggestionId: id }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      setMessage(result.error || 'Failed to dismiss suggestion');
      return;
    }
    await loadSuggestions();
  }, [loadSuggestions]);

  const applyBatch = useCallback(async () => {
    if (!projectId) return;
    const response = await fetch('/api/data/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  }, [loadSuggestions, minConfidence, projectId, refreshData]);

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

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 90px 120px 180px 150px', gap: '0.5rem', padding: '0.55rem 0.7rem', fontSize: '0.68rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
          <span>Hour Entry</span>
          <span>Task</span>
          <span>Confidence</span>
          <span>Status</span>
          <span>Reasoning</span>
          <span>Actions</span>
        </div>
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading suggestions...</div>
          ) : suggestions.length === 0 ? (
            <div style={{ padding: '0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No suggestions for current filter.</div>
          ) : suggestions.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 90px 120px 180px 150px', gap: '0.5rem', padding: '0.6rem 0.7rem', borderBottom: '1px solid var(--border-color)', alignItems: 'center', fontSize: '0.76rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{row.hourEntryId}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.taskName || row.taskId}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.66rem' }}>{row.hoursDate || 'n/a'} · {row.hoursQuantity ?? 0}h</div>
              </div>
              <span>{Number(row.confidence || 0).toFixed(2)}</span>
              <span>{row.status}</span>
              <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.reasoning || 'n/a'}</span>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <button type="button" disabled={row.status !== 'pending'} onClick={() => void applySuggestion(row.id)} style={{ padding: '0.26rem 0.46rem', borderRadius: 6, border: '1px solid var(--border-color)', background: row.status === 'pending' ? 'var(--bg-secondary)' : 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: row.status === 'pending' ? 'pointer' : 'not-allowed' }}>Apply</button>
                <button type="button" disabled={row.status !== 'pending'} onClick={() => void dismissSuggestion(row.id)} style={{ padding: '0.26rem 0.46rem', borderRadius: 6, border: '1px solid var(--border-color)', background: row.status === 'pending' ? 'var(--bg-secondary)' : 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: row.status === 'pending' ? 'pointer' : 'not-allowed' }}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
