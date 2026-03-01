'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import SearchableSelect from '@/components/ui/SearchableSelect';

/* ═══════════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

type HourBucket = { phase: string; hours: number; entries: number };
type Suggestion = {
  hourPhase: string;
  mppTarget: string;
  mppTargetId: string;
  confidence: number;
  method: string;
};
type MppUnit = { id: string; name: string };
type MppPhase = { id: string; name: string; unit_id: string | null };
type MppTask = { id: string; name: string; phase_id: string | null };
type WdPhase = { id: string; unit: string; name: string; actual_hours: number };

type LeftGroup = {
  unit: string;
  items: Array<{ name: string; hours: number; entries: number }>;
};
type RightNode = {
  unit: { id: string; name: string };
  phases: Array<{ phase: MppPhase; tasks: MppTask[] }>;
  loose: MppTask[];
};

/* ═══════════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

function ConfidenceBadge({ value }: { value: number }) {
  const color =
    value >= 0.8
      ? 'var(--color-success)'
      : value >= 0.6
        ? 'var(--color-warning)'
        : 'var(--color-error)';
  return (
    <span
      style={{
        fontSize: '0.66rem',
        fontWeight: 700,
        color,
        padding: '2px 7px',
        borderRadius: 10,
        background: `${color}22`,
        whiteSpace: 'nowrap',
      }}
    >
      {Math.round(value * 100)}%
    </span>
  );
}

function CoverageBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const c =
    pct >= 80
      ? 'var(--color-success)'
      : pct >= 50
        ? 'var(--color-warning)'
        : 'var(--color-error)';
  return (
    <div style={{ flex: 1, minWidth: 140 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.68rem',
          marginBottom: 3,
        }}
      >
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontWeight: 700 }}>
          {pct}%{' '}
          <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
            ({value}/{max})
          </span>
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 3,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: c,
            borderRadius: 3,
            transition: 'width 0.3s',
          }}
        />
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      style={{
        transform: open ? 'rotate(90deg)' : 'rotate(0)',
        transition: 'transform 0.15s',
        flexShrink: 0,
        opacity: 0.55,
      }}
    >
      <path
        d="M4 2l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Shared style fragments
   ═══════════════════════════════════════════════════════════════════════ */

const sel: React.CSSProperties = {
  padding: '0.35rem 0.55rem',
  fontSize: '0.75rem',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--glass-border)',
  background: 'var(--glass-bg)',
  color: 'var(--text-primary)',
};

const hdr: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '0.78rem',
  fontWeight: 700,
  marginBottom: '0.5rem',
  paddingBottom: '0.4rem',
  borderBottom: '1px solid var(--glass-border)',
};

const tagStyle = (color: string): React.CSSProperties => ({
  fontSize: '0.6rem',
  fontWeight: 700,
  color,
  background: `${color}18`,
  padding: '1px 6px',
  borderRadius: 8,
  whiteSpace: 'nowrap',
  flexShrink: 0,
});

const muted66: React.CSSProperties = {
  fontSize: '0.66rem',
  fontWeight: 400,
  color: 'var(--text-muted)',
};

const emptyMsg: React.CSSProperties = {
  fontSize: '0.72rem',
  color: 'var(--text-muted)',
  padding: '1.5rem 0',
  textAlign: 'center',
};

/* ═══════════════════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════════════ */

export default function MappingPage() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  const [hourBuckets, setHourBuckets] = useState<HourBucket[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [stats, setStats] = useState({ mapped: 0, total: 0 });
  const [mppUnits, setMppUnits] = useState<MppUnit[]>([]);
  const [mppPhases, setMppPhases] = useState<MppPhase[]>([]);
  const [mppTasks, setMppTasks] = useState<MppTask[]>([]);
  const [wdPhases, setWdPhases] = useState<WdPhase[]>([]);

  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [manualMap, setManualMap] = useState<Map<string, string>>(new Map());
  const [threshold, setThreshold] = useState(0.6);
  const [exp, setExp] = useState<Record<string, boolean>>({});

  const isOpen = (k: string, def = true) => exp[k] ?? def;
  const toggle = (k: string, def = true) =>
    setExp(prev => ({ ...prev, [k]: !(prev[k] ?? def) }));

  /* ── Load projects ── */
  useEffect(() => {
    fetch('/api/tables/projects?limit=500', { cache: 'no-store' })
      .then(r => r.json())
      .then(d =>
        setProjects(
          (d.rows || []).map((r: Record<string, unknown>) => ({
            id: String(r.id),
            name: String(r.name),
          })),
        ),
      );
  }, []);

  /* ── Load all data for selected project ── */
  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setMsg(null);
    try {
      const pid = encodeURIComponent(projectId);
      const [mapR, wdR, uR, pR, tR] = await Promise.all([
        fetch(`/api/pca/mapping?projectId=${pid}`, { cache: 'no-store' }).then(r => r.json()),
        fetch(
          `/api/tables/workday_phases?project_id=${pid}&limit=2000`,
          { cache: 'no-store' },
        ).then(r => r.json()),
        fetch(`/api/tables/units?project_id=${pid}&limit=2000`, { cache: 'no-store' }).then(r =>
          r.json(),
        ),
        fetch(`/api/tables/phases?project_id=${pid}&limit=2000`, { cache: 'no-store' }).then(r =>
          r.json(),
        ),
        fetch(`/api/tables/tasks?project_id=${pid}&limit=2000`, { cache: 'no-store' }).then(r =>
          r.json(),
        ),
      ]);
      if (mapR.error) throw new Error(mapR.error);

      const str = (v: unknown) => (v != null ? String(v) : '');

      setHourBuckets(mapR.hourBuckets || []);
      setSuggestions(mapR.suggestions || []);
      setStats(mapR.stats || { mapped: 0, total: 0 });

      setMppUnits(
        (uR.rows || []).map((r: Record<string, unknown>) => ({
          id: str(r.id),
          name: str(r.name),
        })),
      );
      setMppPhases(
        (pR.rows || []).map((r: Record<string, unknown>) => ({
          id: str(r.id),
          name: str(r.name),
          unit_id: r.unit_id ? str(r.unit_id) : null,
        })),
      );
      setMppTasks(
        (tR.rows || []).map((r: Record<string, unknown>) => ({
          id: str(r.id),
          name: str(r.name),
          phase_id: r.phase_id ? str(r.phase_id) : null,
        })),
      );
      setWdPhases(
        (wdR.rows || []).map((r: Record<string, unknown>) => ({
          id: str(r.id),
          unit: str(r.unit),
          name: str(r.name),
          actual_hours: Number(r.actual_hours || 0),
        })),
      );

      setAccepted(new Set());
      setManualMap(new Map());
      setExp({});
    } catch (e: unknown) {
      setMsg({
        type: 'err',
        text: e instanceof Error ? e.message : 'Failed to load data',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ═══════════════════════════════════════════════════════════════════════
     Derived data
     ═══════════════════════════════════════════════════════════════════ */

  const leftTree: LeftGroup[] = useMemo(() => {
    const hourMap = new Map(hourBuckets.map(b => [b.phase, b]));
    const groups = new Map<string, LeftGroup>();

    for (const wp of wdPhases) {
      const u = wp.unit || 'Unassigned';
      if (!groups.has(u)) groups.set(u, { unit: u, items: [] });
      const b = hourMap.get(wp.name);
      groups.get(u)!.items.push({
        name: wp.name,
        hours: b?.hours ?? wp.actual_hours,
        entries: b?.entries ?? 0,
      });
    }

    const knownNames = new Set(wdPhases.map(w => w.name));
    for (const b of hourBuckets) {
      if (!knownNames.has(b.phase)) {
        const u = 'Unmatched Hours';
        if (!groups.has(u)) groups.set(u, { unit: u, items: [] });
        groups.get(u)!.items.push({
          name: b.phase,
          hours: b.hours,
          entries: b.entries,
        });
      }
    }

    return [...groups.values()].sort((a, b) => a.unit.localeCompare(b.unit));
  }, [wdPhases, hourBuckets]);

  const rightTree: RightNode[] = useMemo(() => {
    const byUnit = new Map<string, MppPhase[]>();
    const byPhase = new Map<string, MppTask[]>();

    for (const p of mppPhases) {
      const k = p.unit_id || '__none__';
      if (!byUnit.has(k)) byUnit.set(k, []);
      byUnit.get(k)!.push(p);
    }
    for (const t of mppTasks) {
      const k = t.phase_id || '__none__';
      if (!byPhase.has(k)) byPhase.set(k, []);
      byPhase.get(k)!.push(t);
    }

    const nodes: RightNode[] = [];
    for (const u of mppUnits) {
      nodes.push({
        unit: u,
        phases: (byUnit.get(u.id) || []).map(p => ({
          phase: p,
          tasks: byPhase.get(p.id) || [],
        })),
        loose: [],
      });
    }

    const noUnit = byUnit.get('__none__') || [];
    if (noUnit.length) {
      nodes.push({
        unit: { id: '__no_unit__', name: 'No Unit' },
        phases: noUnit.map(p => ({
          phase: p,
          tasks: byPhase.get(p.id) || [],
        })),
        loose: [],
      });
    }

    const loose = byPhase.get('__none__') || [];
    if (loose.length) {
      if (nodes.length) nodes[nodes.length - 1].loose = loose;
      else
        nodes.push({
          unit: { id: '__loose__', name: 'Unassigned' },
          phases: [],
          loose,
        });
    }

    return nodes;
  }, [mppUnits, mppPhases, mppTasks]);

  const suggestionMap = useMemo(
    () => new Map(suggestions.map(s => [s.hourPhase, s])),
    [suggestions],
  );

  const unmatched = useMemo(
    () => hourBuckets.filter(b => !suggestionMap.has(b.phase)),
    [hourBuckets, suggestionMap],
  );

  const coverage = useMemo(() => {
    const wdUnitNames = new Set(wdPhases.map(w => w.unit).filter(Boolean));
    const mppUnitNames = new Set(mppUnits.map(u => u.name));
    const matchedUnits = [...wdUnitNames].filter(u =>
      mppUnitNames.has(u),
    ).length;

    return {
      entries: { v: stats.mapped, m: stats.total },
      phases: { v: suggestions.length, m: hourBuckets.length },
      selected: { v: accepted.size + manualMap.size, m: hourBuckets.length },
      units: { v: matchedUnits, m: wdUnitNames.size || 0 },
    };
  }, [stats, hourBuckets, suggestions, accepted, manualMap, wdPhases, mppUnits]);

  /* ═══════════════════════════════════════════════════════════════════════
     Actions
     ═══════════════════════════════════════════════════════════════════ */

  const aboveThreshold = suggestions.filter(
    s => s.confidence >= threshold,
  ).length;

  const autoAccept = () => {
    const next = new Set(accepted);
    for (const s of suggestions) {
      if (s.confidence >= threshold) next.add(s.hourPhase);
    }
    setAccepted(next);
  };

  const handleApply = async () => {
    setApplying(true);
    setMsg(null);
    try {
      const mappings: Array<{ hourPhase: string; mppTargetId: string }> = [];

      for (const s of suggestions) {
        if (accepted.has(s.hourPhase) && !manualMap.has(s.hourPhase))
          mappings.push({ hourPhase: s.hourPhase, mppTargetId: s.mppTargetId });
      }
      for (const [phase, tid] of manualMap) {
        if (tid) mappings.push({ hourPhase: phase, mppTargetId: tid });
      }

      if (!mappings.length) {
        setMsg({ type: 'err', text: 'No mappings selected.' });
        setApplying(false);
        return;
      }

      const res = await fetch('/api/pca/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', projectId, mappings }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);

      setMsg({ type: 'ok', text: `Applied ${d.updated} hour entry mappings.` });
      loadData();
    } catch (e: unknown) {
      setMsg({
        type: 'err',
        text: e instanceof Error ? e.message : 'Apply failed',
      });
    } finally {
      setApplying(false);
    }
  };

  const selCount = accepted.size + manualMap.size;

  /* ═══════════════════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════════════ */

  return (
    <div>
      <h1 className="page-title">Hour-to-Plan Mapping</h1>
      <p className="page-subtitle">
        Match Workday hour entries to MPP units, phases, and tasks. Work through
        the hierarchy: Project → Unit → Phase → Task.
      </p>

      {/* ── Status message ── */}
      {msg && (
        <div
          style={{
            padding: '0.5rem 0.75rem',
            marginBottom: '0.75rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.78rem',
            background:
              msg.type === 'ok'
                ? 'rgba(16,185,129,0.1)'
                : 'rgba(239,68,68,0.1)',
            color:
              msg.type === 'ok' ? 'var(--color-success)' : 'var(--color-error)',
            border: `1px solid ${
              msg.type === 'ok'
                ? 'rgba(16,185,129,0.25)'
                : 'rgba(239,68,68,0.25)'
            }`,
          }}
        >
          {msg.text}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          marginBottom: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <SearchableSelect
          options={projects.map(p => ({ value: p.id, label: `${p.id} — ${p.name}` }))}
          value={projectId}
          onChange={setProjectId}
          placeholder="Search projects…"
          style={{ minWidth: 280 }}
        />

        {projectId && !loading && (
          <>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <span
                style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}
              >
                Threshold:
              </span>
              <select
                value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                style={{ ...sel, minWidth: 58 }}
              >
                {[0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(v => (
                  <option key={v} value={v}>
                    {v * 100}%
                  </option>
                ))}
              </select>
            </div>

            <button
              className="btn btn-accent"
              onClick={autoAccept}
              disabled={suggestions.length === 0}
            >
              Auto-Accept ({aboveThreshold})
            </button>

            <button
              className="btn"
              onClick={handleApply}
              disabled={applying || selCount === 0}
            >
              {applying ? 'Applying…' : `Apply Mappings (${selCount})`}
            </button>
          </>
        )}

        <button
          className="btn"
          style={{ marginLeft: 'auto', background: 'var(--color-accent)', color: '#fff', fontWeight: 700, fontSize: '0.72rem' }}
          disabled={applying}
          onClick={async () => {
            setApplying(true);
            setMsg(null);
            try {
              const res = await fetch('/api/pca/mapping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'auto-match', projectId: projectId || undefined }),
              });
              const d = await res.json();
              if (!d.success) throw new Error(d.error);
              const s = d.stats;
              setMsg({
                type: 'ok',
                text: `Multi-gate match complete: ${d.applied} entries updated. G1:${s.gate1_phase_to_workday} G2:${s.gate2_hour_to_mpp} G3:${s.gate3_mpp_to_workday} G4:${s.gate4_bucket_fill} G5:${s.gate5_learned_reuse} (${s.skipped_ambiguous} ambiguous skipped)`,
              });
              if (projectId) loadData();
            } catch (e: unknown) {
              setMsg({ type: 'err', text: e instanceof Error ? e.message : String(e) });
            } finally {
              setApplying(false);
            }
          }}
        >
          {applying ? 'Running…' : `Auto-Match All (5 Gates)${projectId ? '' : ' — All Projects'}`}
        </button>
      </div>

      {/* ── Coverage statistics ── */}
      {projectId && !loading && (
        <div
          className="glass"
          style={{ padding: '0.75rem', marginBottom: '0.75rem' }}
        >
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <CoverageBar
              label="Entry Coverage"
              value={coverage.entries.v}
              max={coverage.entries.m}
            />
            <CoverageBar
              label="Phases Suggested"
              value={coverage.phases.v}
              max={coverage.phases.m}
            />
            <CoverageBar
              label="Accepted / Manual"
              value={coverage.selected.v}
              max={coverage.selected.m}
            />
            <CoverageBar
              label="Units Matched"
              value={coverage.units.v}
              max={coverage.units.m}
            />
          </div>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={44} />
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
         Three-panel layout
         ═══════════════════════════════════════════════════════════════ */}
      {!loading && projectId && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.3fr 1fr',
            gap: '0.65rem',
            alignItems: 'start',
          }}
        >
          {/* ── LEFT PANEL: Workday Hours ── */}
          <div
            className="glass-raised"
            style={{
              padding: '0.65rem',
              maxHeight: 'calc(100vh - 290px)',
              overflowY: 'auto',
            }}
          >
            <div style={hdr}>
              <span>Workday Hours</span>
              <span style={muted66}>{hourBuckets.length} phases</span>
            </div>

            {leftTree.length === 0 && (
              <div style={emptyMsg}>
                No workday phase data for this project.
              </div>
            )}

            {leftTree.map(g => {
              const key = `l-${g.unit}`;
              const open = isOpen(key);
              const totalHrs = g.items.reduce((s, i) => s + i.hours, 0);

              return (
                <div key={g.unit} style={{ marginBottom: 2 }}>
                  {/* Unit row */}
                  <div
                    onClick={() => toggle(key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '0.4rem 0.3rem',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.75rem',
                      userSelect: 'none',
                    }}
                  >
                    <Chevron open={open} />
                    <span style={{ fontWeight: 600, flex: 1 }}>{g.unit}</span>
                    <span
                      style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}
                    >
                      {g.items.length} · {totalHrs.toFixed(0)}h
                    </span>
                  </div>

                  {/* Phase rows */}
                  {open &&
                    g.items.map(item => {
                      const hasSug = suggestionMap.has(item.name);
                      const isAcc = accepted.has(item.name);
                      const isMan = manualMap.has(item.name);

                      return (
                        <div
                          key={item.name}
                          style={{
                            padding: '0.3rem 0.3rem 0.3rem 1.4rem',
                            fontSize: '0.73rem',
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 500,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {item.name}
                            </div>
                            <div
                              style={{
                                fontSize: '0.64rem',
                                color: 'var(--text-muted)',
                              }}
                            >
                              {item.hours > 0
                                ? `${item.hours.toFixed(1)} hrs`
                                : ''}
                              {item.entries > 0
                                ? ` · ${item.entries} entries`
                                : ''}
                            </div>
                          </div>

                          {isAcc && (
                            <span style={tagStyle('var(--color-success)')}>
                              Accepted
                            </span>
                          )}
                          {!isAcc && isMan && (
                            <span style={tagStyle('var(--color-warning)')}>
                              Manual
                            </span>
                          )}
                          {!isAcc && !isMan && hasSug && (
                            <span style={tagStyle('rgb(96,165,250)')}>
                              Suggested
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>

          {/* ── CENTER PANEL: Suggestions + Manual Mapping ── */}
          <div
            className="glass-solid"
            style={{
              padding: '0.65rem',
              maxHeight: 'calc(100vh - 290px)',
              overflowY: 'auto',
            }}
          >
            <div style={hdr}>
              <span>Match Suggestions</span>
              <span style={muted66}>{suggestions.length} found</span>
            </div>

            {suggestions.length === 0 && unmatched.length === 0 && (
              <div style={emptyMsg}>
                No suggestions. Ensure both Workday hours and an MPP plan exist
                for this project.
              </div>
            )}

            {/* Suggestion rows */}
            {suggestions.map(s => {
              const isAcc = accepted.has(s.hourPhase);
              return (
                <div
                  key={s.hourPhase}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '0.45rem 0.25rem',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: isAcc
                      ? 'rgba(16,185,129,0.06)'
                      : 'transparent',
                    borderRadius: 4,
                    marginBottom: 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isAcc}
                    onChange={e => {
                      const next = new Set(accepted);
                      e.target.checked
                        ? next.add(s.hourPhase)
                        : next.delete(s.hourPhase);
                      setAccepted(next);
                    }}
                    style={{ marginTop: 3, accentColor: 'var(--color-success)' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.hourPhase}
                    </div>
                    <div
                      style={{
                        fontSize: '0.68rem',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        marginTop: 2,
                      }}
                    >
                      <span style={{ color: 'var(--color-success)' }}>→</span>
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {s.mppTarget}
                      </span>
                    </div>
                  </div>
                  <ConfidenceBadge value={s.confidence} />
                </div>
              );
            })}

            {/* Unmatched phases — manual mapping */}
            {unmatched.length > 0 && (
              <>
                <div
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    margin: '0.75rem 0 0.4rem',
                    padding: '0.35rem 0',
                    borderTop: '1px solid var(--glass-border)',
                  }}
                >
                  Unmatched Phases ({unmatched.length})
                </div>

                {unmatched.map(b => (
                  <div
                    key={b.phase}
                    style={{
                      padding: '0.4rem 0.25rem',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontWeight: 500, fontSize: '0.75rem' }}>
                        {b.phase}
                      </span>
                      <span
                        style={{
                          fontSize: '0.66rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {b.hours.toFixed(1)} hrs · {b.entries} entries
                      </span>
                    </div>

                    <select
                      value={manualMap.get(b.phase) || ''}
                      onChange={e => {
                        const next = new Map(manualMap);
                        e.target.value
                          ? next.set(b.phase, e.target.value)
                          : next.delete(b.phase);
                        setManualMap(next);
                      }}
                      style={{ ...sel, width: '100%' }}
                    >
                      <option value="">Select MPP target…</option>
                      {mppUnits.length > 0 && (
                        <optgroup label="Units">
                          {mppUnits.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {mppPhases.length > 0 && (
                        <optgroup label="Phases">
                          {mppPhases.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {mppTasks.length > 0 && (
                        <optgroup label="Tasks">
                          {mppTasks.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* ── RIGHT PANEL: MPP Plan Hierarchy ── */}
          <div
            className="glass-raised"
            style={{
              padding: '0.65rem',
              maxHeight: 'calc(100vh - 290px)',
              overflowY: 'auto',
            }}
          >
            <div style={hdr}>
              <span>MPP Plan Hierarchy</span>
              <span style={muted66}>
                {mppUnits.length}U · {mppPhases.length}P · {mppTasks.length}T
              </span>
            </div>

            {rightTree.length === 0 && (
              <div style={emptyMsg}>
                No MPP plan data. Upload a project plan first.
              </div>
            )}

            {rightTree.map(node => {
              const uk = `r-u-${node.unit.id}`;
              const uOpen = isOpen(uk);

              return (
                <div key={node.unit.id} style={{ marginBottom: 2 }}>
                  {/* Unit row */}
                  <div
                    onClick={() => toggle(uk)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '0.4rem 0.3rem',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.75rem',
                      userSelect: 'none',
                    }}
                  >
                    <Chevron open={uOpen} />
                    <span style={{ fontWeight: 600, flex: 1 }}>
                      {node.unit.name}
                    </span>
                    <span
                      style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}
                    >
                      {node.phases.length} phases
                    </span>
                  </div>

                  {/* Phase rows */}
                  {uOpen &&
                    node.phases.map(({ phase, tasks }) => {
                      const pk = `r-p-${phase.id}`;
                      const pOpen = isOpen(pk, false);

                      return (
                        <div key={phase.id}>
                          <div
                            onClick={() => toggle(pk, false)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '0.3rem 0.3rem 0.3rem 1.2rem',
                              cursor: 'pointer',
                              fontSize: '0.73rem',
                              userSelect: 'none',
                            }}
                          >
                            <Chevron open={pOpen} />
                            <span style={{ fontWeight: 500, flex: 1 }}>
                              {phase.name}
                            </span>
                            {tasks.length > 0 && (
                              <span
                                style={{
                                  fontSize: '0.62rem',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                {tasks.length} tasks
                              </span>
                            )}
                          </div>

                          {/* Task rows */}
                          {pOpen &&
                            tasks.map(t => (
                              <div
                                key={t.id}
                                style={{
                                  padding: '0.25rem 0.3rem 0.25rem 2.4rem',
                                  fontSize: '0.7rem',
                                  color: 'var(--text-muted)',
                                  borderBottom:
                                    '1px solid rgba(255,255,255,0.02)',
                                }}
                              >
                                <span style={{ opacity: 0.45, marginRight: 5 }}>
                                  ◦
                                </span>
                                {t.name}
                              </div>
                            ))}
                        </div>
                      );
                    })}

                  {/* Loose tasks (no phase) */}
                  {uOpen &&
                    node.loose.map(t => (
                      <div
                        key={t.id}
                        style={{
                          padding: '0.25rem 0.3rem 0.25rem 1.4rem',
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <span style={{ opacity: 0.45, marginRight: 5 }}>◦</span>
                        {t.name}
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
