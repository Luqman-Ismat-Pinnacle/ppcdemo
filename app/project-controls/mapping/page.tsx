'use client';

/**
 * @fileoverview Simplified mapping workspace.
 *
 * Workflow:
 * 1) pick a project with an uploaded plan,
 * 2) review phase buckets,
 * 3) run phase-name matching,
 * 4) apply high-confidence suggestions.
 */

import React, { useMemo, useState } from 'react';
import { useData } from '@/lib/data-context';

type SuggestionRow = {
  id: number;
  confidence: number;
  reason: string;
  sourceValue: string | null;
  targetValue: string | null;
  status: 'pending' | 'applied' | 'dismissed';
  taskName?: string | null;
};

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function MappingPage() {
  const { data, filteredData, refreshData } = useData();
  const source = filteredData || data;
  const [projectId, setProjectId] = useState('');
  const [runningMatch, setRunningMatch] = useState(false);
  const [runningSuggest, setRunningSuggest] = useState(false);
  const [message, setMessage] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);

  const projectsWithPlan = useMemo(() => {
    const docs = (source.projectDocuments || []) as unknown as Array<Record<string, unknown>>;
    const docProjectIds = new Set(
      docs.map((row) => String(row.projectId || row.project_id || '')).filter(Boolean),
    );
    const projects = (source.projects || []) as unknown as Array<Record<string, unknown>>;
    return projects
      .filter((project) => {
        const id = String(project.id || project.projectId || project.project_id || '');
        const hasSchedule = Boolean(project.has_schedule || project.hasSchedule);
        return Boolean(id) && (hasSchedule || docProjectIds.has(id));
      })
      .map((project) => ({
        id: String(project.id || project.projectId || project.project_id || ''),
        name: String(project.name || project.projectName || project.id || 'Project'),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [source.projectDocuments, source.projects]);

  const scopedHours = useMemo(() => {
    if (!projectId) return [];
    return ((source.hours || []) as unknown as Array<Record<string, unknown>>).filter(
      (row) => String(row.projectId || row.project_id || '') === projectId,
    );
  }, [projectId, source.hours]);

  const scopedTasks = useMemo(() => {
    if (!projectId) return [];
    return ((source.tasks || []) as unknown as Array<Record<string, unknown>>).filter(
      (row) => String(row.projectId || row.project_id || '') === projectId,
    );
  }, [projectId, source.tasks]);

  const scopedWorkdayPhases = useMemo(() => {
    if (!projectId) return [];
    return ((source.workdayPhases || []) as unknown as Array<Record<string, unknown>>).filter(
      (row) => String(row.projectId || row.project_id || '') === projectId,
    );
  }, [projectId, source.workdayPhases]);

  const phaseBuckets = useMemo(() => {
    const map = new Map<string, { phase: string; hours: number; entries: number; exactPhaseMatch: boolean }>();
    const workdayNameSet = new Set(scopedWorkdayPhases.map((row) => normalize(String(row.name || ''))).filter(Boolean));
    for (const hour of scopedHours) {
      const phase = String(hour.phase || hour.phases || '').trim() || 'Unphased';
      const key = normalize(phase) || 'unphased';
      const current = map.get(key) || {
        phase,
        hours: 0,
        entries: 0,
        exactPhaseMatch: workdayNameSet.has(key),
      };
      current.hours += Number(hour.hours || 0);
      current.entries += 1;
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [scopedHours, scopedWorkdayPhases]);

  const mappedHours = useMemo(
    () => scopedHours.filter((row) => String(row.workdayPhaseId || row.workday_phase_id || '').trim()).length,
    [scopedHours],
  );

  const runPhaseMatch = async () => {
    if (!projectId || runningMatch) return;
    setRunningMatch(true);
    setMessage('');
    try {
      const response = await fetch('/api/data/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'matchWorkdayPhaseToHoursPhases', projectId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || 'Match failed'));
      setMessage(`Matched ${payload.matched || 0} hour entries by phase name.`);
      await refreshData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Match failed');
    } finally {
      setRunningMatch(false);
    }
  };

  const loadSuggestions = async () => {
    if (!projectId) return;
    const response = await fetch('/api/data/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'listMappingSuggestions', projectId, status: 'pending', minConfidence: 0.78 }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.success) {
      setSuggestions((payload.suggestions || []) as SuggestionRow[]);
    } else {
      setSuggestions([]);
    }
  };

  const generateSuggestions = async () => {
    if (!projectId || runningSuggest) return;
    setRunningSuggest(true);
    setMessage('');
    try {
      const response = await fetch('/api/data/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generateMappingSuggestions', projectId, minConfidence: 0.78, limit: 400 }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || 'Suggestion generation failed'));
      await loadSuggestions();
      setMessage(`Generated ${payload.created || 0} suggestions.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Suggestion generation failed');
    } finally {
      setRunningSuggest(false);
    }
  };

  const applySuggestion = async (suggestionId: number) => {
    const response = await fetch('/api/data/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'applyMappingSuggestion', suggestionId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      setMessage(String(payload.error || 'Failed to apply suggestion'));
      return;
    }
    await Promise.all([refreshData(), loadSuggestions()]);
  };

  return (
    <div className="page-panel" style={{ display: 'grid', gap: '0.8rem' }}>
      <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Mapping Workspace</h1>
      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        Projects with uploaded plans only. Hours are bucketed by phase and matched to Workday phases by phase name.
      </p>

      <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Project
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} style={{ marginLeft: 8 }}>
            <option value="">Select project</option>
            {projectsWithPlan.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-secondary" disabled={!projectId || runningMatch} onClick={() => { void runPhaseMatch(); }}>
          {runningMatch ? 'Matching...' : 'Match by Phase Name'}
        </button>
        <button type="button" className="btn btn-secondary" disabled={!projectId || runningSuggest} onClick={() => { void generateSuggestions(); }}>
          {runningSuggest ? 'Generating...' : 'Generate Suggestions'}
        </button>
        <button type="button" className="btn btn-secondary" disabled={!projectId} onClick={() => { void loadSuggestions(); }}>
          Refresh Suggestions
        </button>
      </div>

      {message ? <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{message}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.6rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-card)', padding: '0.6rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Hours Entries</div>
          <div style={{ marginTop: 4, fontSize: '1.1rem', fontWeight: 800 }}>{scopedHours.length}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-card)', padding: '0.6rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Mapped to Workday Phase</div>
          <div style={{ marginTop: 4, fontSize: '1.1rem', fontWeight: 800 }}>{mappedHours}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-card)', padding: '0.6rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Workday Phases</div>
          <div style={{ marginTop: 4, fontSize: '1.1rem', fontWeight: 800 }}>{scopedWorkdayPhases.length}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-card)', padding: '0.6rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Tasks in Project</div>
          <div style={{ marginTop: 4, fontSize: '1.1rem', fontWeight: 800 }}>{scopedTasks.length}</div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 120px 120px 120px', padding: '0.55rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          <span>Phase Bucket (from hours)</span>
          <span>Hours</span>
          <span>Entries</span>
          <span>In Workday</span>
        </div>
        {phaseBuckets.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>No hour phase buckets in selected project.</div>
        ) : phaseBuckets.map((bucket) => (
          <div key={`${bucket.phase}-${bucket.entries}`} style={{ display: 'grid', gridTemplateColumns: '1.2fr 120px 120px 120px', padding: '0.52rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
            <span>{bucket.phase}</span>
            <span>{bucket.hours.toFixed(1)}</span>
            <span>{bucket.entries}</span>
            <span style={{ color: bucket.exactPhaseMatch ? '#10B981' : '#F59E0B' }}>{bucket.exactPhaseMatch ? 'Yes' : 'No'}</span>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 100px 110px', padding: '0.55rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          <span>ID</span>
          <span>Source</span>
          <span>Target</span>
          <span>Confidence</span>
          <span>Action</span>
        </div>
        {suggestions.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>No pending suggestions.</div>
        ) : suggestions.slice(0, 200).map((row) => (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 100px 110px', padding: '0.52rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
            <span>{row.id}</span>
            <span>{row.sourceValue || '-'}</span>
            <span>{row.targetValue || row.taskName || '-'}</span>
            <span>{Math.round((row.confidence || 0) * 100)}%</span>
            <button type="button" onClick={() => { void applySuggestion(row.id); }} style={{ fontSize: '0.7rem' }}>Apply</button>
          </div>
        ))}
      </div>
    </div>
  );
}
