'use client';

/**
 * Overview v2 — Executive Meeting Command Center
 *
 * Variance-driven, milestone-aware dashboard.
 * No SPI/CPI — replaced by Progress Made & Hours Burned (time-filter aware).
 *
 * Sections:
 *  1. Pulse — Health gauge + Progress Made + Hours Burned + KPIs + Leaderboard
 *  2. Decisions Required — Blocked, At Risk, Critical Path expandable categories
 *  3. Milestones — Status breakdown, upcoming, overdue, variance
 *  4. Operational Friction — Sankey with view modes (Charge Type / Role / Person)
 *  5. Risk Matrix (full width) + Hours Variance Waterfall (full width)
 *  6. Parameters & Suggestions — Combines Predictive Burn + Workforce Burn + Dependencies (circular graph)
 *  7. Meeting Snapshot & Delta
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import ContainerLoader from '@/components/ui/ContainerLoader';
import type { EChartsOption } from 'echarts';
// cross-filtering removed per user request
import {
  calculateMetricVariance,
  getComparisonDates,
  getMetricsForPeriod,
  type MetricsHistory,
  type VariancePeriod,
} from '@/lib/variance-engine';
import { buildPortfolioAggregate, buildProjectBreakdown } from '@/lib/calculations/selectors';
import EnhancedTooltip from '@/components/ui/EnhancedTooltip';
import type { MetricProvenance } from '@/lib/calculations/types';

/* ================================================================== */
/*  CONSTANTS                                                          */
/* ================================================================== */

const C = {
  teal: '#40E0D0', blue: '#3B82F6', purple: '#8B5CF6', amber: '#F59E0B',
  green: '#10B981', red: '#EF4444', pink: '#EC4899', cyan: '#06B6D4',
  lime: '#CDDC39', orange: '#FF9800', indigo: '#6366F1',
  textPrimary: '#f4f4f5', textMuted: '#a1a1aa', textSecondary: '#e4e4e7',
  border: '#3f3f46', bgCard: '#18181b', bgSecondary: '#141416',
  axis: '#3f3f46', gridLine: '#27272a',
};

const CHARGE_LABELS: Record<string, string> = { EX: 'Execution', QC: 'Quality Control', CR: 'Customer Relations', SC: 'Supervision', Other: 'Other' };
const CHARGE_COLORS: Record<string, string> = { EX: C.blue, QC: C.purple, CR: C.amber, SC: C.cyan, Other: '#6B7280' };

const sn = (v: any, d = 2): string => { const n = Number(v); return isFinite(n) ? n.toFixed(d) : '0'; };
const truncName = (s: string, max = 25) => s.length > max ? s.slice(0, max) + '...' : s;
const fmtHrs = (h: number) => h >= 1000 ? `${(h / 1000).toFixed(1)}K` : h.toLocaleString();
const fmtCost = (c: number) => c >= 1000 ? `$${(c / 1000).toFixed(1)}K` : `$${c.toLocaleString()}`;
const varColor = (v: number) => v > 10 ? C.red : v > 0 ? C.amber : C.green;

function provenanceToTooltip(prov: MetricProvenance | undefined, fallbackTitle: string) {
  if (!prov) {
    return {
      title: fallbackTitle,
      description: 'No provenance metadata available for this metric.',
    };
  }
  return {
    title: prov.label || fallbackTitle,
    description: `${prov.scope} · ${prov.timeWindow}`,
    calculation: prov.trace.formula,
    details: [
      prov.dataSources.length ? `Sources: ${prov.dataSources.join(', ')}` : '',
      `Computed at: ${new Date(prov.trace.computedAt).toLocaleString()}`,
    ].filter(Boolean),
  };
}

const TT = {
  backgroundColor: 'rgba(15,15,18,0.96)', borderColor: C.border, borderWidth: 1,
  padding: [10, 15] as [number, number], textStyle: { color: '#fff', fontSize: 12 },
  confine: false, appendToBody: true,
  extraCssText: 'z-index:99999!important;backdrop-filter:blur(20px);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.45);',
};

/* ================================================================== */
/*  HELPERS                                                            */
/* ================================================================== */

function SectionCard({ title, subtitle, badge, children, noPadding = false, actions }: {
  title: string; subtitle?: string; badge?: React.ReactNode;
  children: React.ReactNode; noPadding?: boolean; actions?: React.ReactNode;
}) {
  return (
    <div style={{ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: C.textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>{title}{badge}</h3>
          {subtitle && <span style={{ fontSize: '0.6rem', color: C.textMuted }}>{subtitle}</span>}
        </div>
        {actions}
      </div>
      <div style={{ padding: noPadding ? 0 : '0.75rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${color}18`, color, letterSpacing: 0.4, textTransform: 'uppercase', marginLeft: 4 }}>{label}</span>;
}

/* ================================================================== */
/*  1. PULSE — Health + Progress + Burn + Leaderboard                  */
/* ================================================================== */

/* ================================================================== */
/*  DECISIONS REQUIRED — Full section with expandable task dropdowns    */
/* ================================================================== */

function useDecisionTasks(tasks: any[], projects: any[]) {
  return useMemo(() => {
    const projNameMap = new Map<string, string>();
    projects.forEach((p: any) => projNameMap.set(p.id || p.projectId, p.name || p.projectName || p.id));

    const blocked: any[] = [];
    const atRisk: any[] = [];
    const overBudget: any[] = [];
    const critical: any[] = [];
    tasks.forEach((t: any) => {
      const s = String(t.status || '').toLowerCase();
      const bl = Number(t.baselineHours || 0);
      const ac = Number(t.actualHours || 0);
      const pc = Number(t.percentComplete || 0);
      const pid = t.projectId || t.project_id || '';
      const enriched = {
        ...t,
        _projName: projNameMap.get(pid) || pid,
        _bl: bl,
        _ac: ac,
        _pc: pc,
        _remaining: Math.max(0, bl - ac),
        _var: bl > 0 ? Math.round(((ac - bl) / bl) * 100) : 0,
      };

      if (s.includes('block') || s.includes('hold')) { blocked.push(enriched); return; }
      if (bl > 0 && ac > bl * 1.2) { overBudget.push(enriched); return; }
      if (s.includes('risk') || s.includes('late') || s.includes('delay')) { atRisk.push(enriched); return; }
      if (t.isCritical === true || t.isCritical === 'true' || (t.totalFloat != null && Number(t.totalFloat) <= 0)) { critical.push(enriched); }
    });
    return { blocked, atRisk, overBudget, critical, total: blocked.length + atRisk.length + overBudget.length };
  }, [tasks, projects]);
}

function DecisionsRequired({ tasks, projects }: { tasks: any[]; projects: any[] }) {
  const { blocked, atRisk, overBudget, critical, total } = useDecisionTasks(tasks, projects);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState('');
  const [minRemainingHours, setMinRemainingHours] = useState<number>(0);

  const applyFilters = useCallback((list: any[]) => {
    return list.filter((t: any) => {
      if (projectFilter && !(String(t._projName || '').toLowerCase().includes(projectFilter.toLowerCase()))) return false;
      if (minRemainingHours > 0 && Number(t._remaining || 0) < minRemainingHours) return false;
      return true;
    });
  }, [projectFilter, minRemainingHours]);

  const categories = [
    { key: 'blocked', label: 'Blocked / On Hold', tasks: applyFilters(blocked), color: C.red, desc: 'Tasks currently blocked or on hold requiring executive intervention' },
    { key: 'atRisk', label: 'At Risk', tasks: applyFilters(atRisk), color: C.amber, desc: 'Schedule-risk tasks flagged late, delayed, or explicitly marked at risk' },
    { key: 'overBudget', label: 'Over Budget', tasks: applyFilters(overBudget), color: C.orange, desc: 'Tasks with actual hours > 120% of baseline hours' },
    { key: 'critical', label: 'Critical Path', tasks: applyFilters(critical), color: C.teal, desc: 'Tasks on the critical path — zero float, any delay impacts the whole project' },
  ];

  if (total === 0 && critical.length === 0) {
    return <div style={{ padding: '1rem', textAlign: 'center', color: C.green, fontSize: '0.75rem', fontWeight: 600 }}>All clear — no blockers or at-risk items.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
        <input
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          placeholder="Filter by project..."
          style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.textPrimary, borderRadius: 6, padding: '4px 8px', fontSize: '0.65rem', minWidth: 160 }}
        />
        <label style={{ fontSize: '0.65rem', color: C.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
          Min Remaining Hours
          <input
            type="number"
            min={0}
            value={minRemainingHours}
            onChange={(e) => setMinRemainingHours(Math.max(0, Number(e.target.value) || 0))}
            style={{ width: 70, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.textPrimary, borderRadius: 6, padding: '3px 6px', fontSize: '0.65rem' }}
          />
        </label>
      </div>
      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        {categories.map(cat => (
          <div key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, background: cat.tasks.length > 0 ? `${cat.color}12` : 'rgba(255,255,255,0.02)', border: `1px solid ${cat.tasks.length > 0 ? `${cat.color}25` : 'transparent'}` }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.tasks.length > 0 ? cat.color : `${C.textMuted}30` }} />
            <span style={{ fontSize: '0.65rem', color: C.textMuted }}>{cat.label}</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: cat.tasks.length > 0 ? cat.color : C.textMuted }}>{cat.tasks.length}</span>
          </div>
        ))}
      </div>
      {/* Expandable categories */}
      {categories.map(cat => cat.tasks.length > 0 && (
        <div key={cat.key} style={{ borderRadius: 8, border: `1px solid ${cat.color}20`, overflow: 'hidden' }}>
          <button onClick={() => setExpanded(expanded === cat.key ? null : cat.key)} style={{ width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: expanded === cat.key ? `${cat.color}10` : 'rgba(255,255,255,0.02)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ fontSize: '0.6rem', color: expanded === cat.key ? cat.color : C.textMuted }}>{expanded === cat.key ? '▼' : '▶'}</span>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: '0.75rem', fontWeight: 700, color: cat.color }}>{cat.label}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: cat.color }}>{cat.tasks.length}</span>
          </button>
          {expanded === cat.key && (
            <div style={{ padding: '0 8px 8px', maxHeight: 350, overflowY: 'auto' }}>
              <div style={{ fontSize: '0.55rem', color: C.textMuted, padding: '4px 4px 6px', borderBottom: `1px solid ${C.border}` }}>{cat.desc}</div>
              {/* Header row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 60px 60px 55px 50px', gap: 4, padding: '5px 4px', fontSize: '0.5rem', color: C.textMuted, textTransform: 'uppercase', fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>
                <span>Task</span><span>Project</span><span style={{ textAlign: 'right' }}>Actual</span><span style={{ textAlign: 'right' }}>Baseline</span><span style={{ textAlign: 'right' }}>Variance</span><span style={{ textAlign: 'right' }}>Progress</span>
              </div>
              {cat.tasks.slice(0, 25).map((t: any, i: number) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 60px 60px 55px 50px', gap: 4, padding: '4px 4px', fontSize: '0.62rem', borderBottom: `1px solid ${C.border}`, alignItems: 'center' }}>
                  <span style={{ color: C.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.name || t.taskName || ''}>{t.name || t.taskName || 'Unknown'}</span>
                  <span style={{ color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t._projName}>{truncName(t._projName, 20)}</span>
                  <span style={{ textAlign: 'right', color: C.textMuted }}>{fmtHrs(t._ac)}h</span>
                  <span style={{ textAlign: 'right', color: C.textMuted }}>{fmtHrs(t._bl)}h</span>
                  <span style={{ textAlign: 'right', color: varColor(t._var), fontWeight: 600 }}>{t._var > 0 ? '+' : ''}{t._var}%</span>
                  <span style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                        <div style={{ width: `${Math.min(100, t._pc)}%`, height: '100%', background: t._pc >= 90 ? C.green : t._pc >= 50 ? C.amber : C.red, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: '0.5rem', color: C.textMuted }}>{t._pc}%</span>
                    </div>
                  </span>
                </div>
              ))}
              {cat.tasks.length > 25 && <div style={{ padding: '4px', fontSize: '0.6rem', color: C.textMuted, textAlign: 'center' }}>+ {cat.tasks.length - 25} more</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

type LBTab = 'variance' | 'hours' | 'progress';
const LB_TABS: { key: LBTab; label: string; color: string }[] = [
  { key: 'variance', label: 'Hour Var', color: C.red },
  { key: 'hours', label: 'Hours', color: C.blue },
  { key: 'progress', label: 'Progress', color: C.green },
];

function Leaderboard({ projectBreakdown, onSelect, selected }: { projectBreakdown: any[]; onSelect: (p: any) => void; selected: any }) {
  const [tab, setTab] = useState<LBTab>('hours');
  const { best, worst } = useMemo(() => {
    const pb = [...projectBreakdown];
    const sorted = pb.sort((a, b) => {
      if (tab === 'variance') {
        const av = (a.actualHours || 0) - (a.baselineHours || 0);
        const bv = (b.actualHours || 0) - (b.baselineHours || 0);
        return av - bv;
      }
      return tab === 'hours' ? b.actualHours - a.actualHours : b.percentComplete - a.percentComplete;
    });
    return { best: sorted.slice(0, 4), worst: [...sorted].reverse().slice(0, 4) };
  }, [projectBreakdown, tab]);
  const fmtVal = (p: any) => {
    if (tab === 'variance') {
      const delta = (p.actualHours || 0) - (p.baselineHours || 0);
      return `${delta > 0 ? '+' : ''}${fmtHrs(Math.round(delta))}h`;
    }
    return tab === 'hours' ? fmtHrs(p.actualHours) : `${p.percentComplete}%`;
  };
  const valColor = (p: any) => {
    if (tab === 'variance') {
      const delta = (p.actualHours || 0) - (p.baselineHours || 0);
      return delta > 0 ? C.red : delta < 0 ? C.green : C.textMuted;
    }
    return tab === 'hours' ? C.blue : (p.percentComplete >= 75 ? C.green : p.percentComplete >= 50 ? C.amber : C.red);
  };

  const renderList = (items: any[], label: string, isWorst: boolean) => (
    <div>
      <div style={{ fontSize: '0.6rem', fontWeight: 700, color: isWorst ? C.red : C.green, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
      {items.map((p, i) => (
        <div key={p.id || i} style={{ width: '100%', padding: '3px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${C.border}` }}>
          <span title={p.name} style={{ flex: 1, fontSize: '0.7rem', color: C.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: valColor(p), flexShrink: 0 }}>{fmtVal(p)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: 2 }}>
        {LB_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: '2px 4px', borderRadius: 3, border: 'none', cursor: 'pointer', fontSize: '0.55rem', fontWeight: 600, textTransform: 'uppercase', background: tab === t.key ? `${t.color}20` : 'transparent', color: tab === t.key ? t.color : C.textMuted }}>{t.label}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {renderList(best, tab === 'variance' ? 'Under Budget (hrs)' : tab === 'hours' ? 'Most Hours' : 'Top', false)}
        {renderList(worst, tab === 'variance' ? 'Over Budget (hrs)' : tab === 'hours' ? 'Least Hours' : 'Bottom', true)}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  2. MILESTONES                                                      */
/* ================================================================== */

function MilestoneMetrics({ milestones }: { milestones: any[] }) {
  const metrics = useMemo(() => {
    const total = milestones.length;
    const completed = milestones.filter((m: any) => String(m.status || '').toLowerCase().includes('complete')).length;
    const overdue = milestones.filter((m: any) => { const vd = Number(m.varianceDays || 0); return vd > 0 && !String(m.status || '').toLowerCase().includes('complete'); }).length;
    const upcoming = milestones.filter((m: any) => { const pd = new Date(m.plannedDate || m.plannedCompletion || ''); const now = new Date(); const diff = (pd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24); return diff >= 0 && diff <= 14 && !String(m.status || '').toLowerCase().includes('complete'); }).length;
    const avgVariance = total > 0 ? Math.round(milestones.reduce((s: number, m: any) => s + (Number(m.varianceDays || 0) || 0), 0) / total) : 0;
    const onTrack = milestones.filter((m: any) => Number(m.varianceDays || 0) <= 0 && !String(m.status || '').toLowerCase().includes('complete')).length;
    return { total, completed, overdue, upcoming, avgVariance, onTrack, completionRate: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }, [milestones]);

  const topOverdue = useMemo(() =>
    milestones.filter((m: any) => Number(m.varianceDays || 0) > 0 && !String(m.status || '').toLowerCase().includes('complete'))
      .sort((a: any, b: any) => Number(b.varianceDays || 0) - Number(a.varianceDays || 0))
      .slice(0, 6),
  [milestones]);

  const topUpcoming = useMemo(() =>
    milestones.filter((m: any) => { const pd = new Date(m.plannedDate || m.plannedCompletion || ''); const diff = (pd.getTime() - Date.now()) / 86400000; return diff >= 0 && diff <= 30 && !String(m.status || '').toLowerCase().includes('complete'); })
      .sort((a: any, b: any) => new Date(a.plannedDate || a.plannedCompletion || '').getTime() - new Date(b.plannedDate || b.plannedCompletion || '').getTime())
      .slice(0, 6),
  [milestones]);

  if (!milestones.length) return <div style={{ padding: '1rem', textAlign: 'center', color: C.textMuted, fontSize: '0.75rem' }}>No milestone data</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
        {[
          { label: 'Total', value: metrics.total, color: C.textPrimary },
          { label: 'Completed', value: metrics.completed, color: C.green },
          { label: 'On Track', value: metrics.onTrack, color: C.teal },
          { label: 'Overdue', value: metrics.overdue, color: C.red },
          { label: 'Next 14d', value: metrics.upcoming, color: C.amber },
          { label: 'Avg Var (days)', value: `${metrics.avgVariance > 0 ? '+' : ''}${metrics.avgVariance}`, color: metrics.avgVariance > 0 ? C.red : C.green },
        ].map(k => (
          <div key={k.label} style={{ padding: '0.4rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: '0.5rem', color: C.textMuted, textTransform: 'uppercase' }}>{k.label}</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      {/* Overdue + Upcoming */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: C.red, textTransform: 'uppercase', marginBottom: 4 }}>Overdue Milestones</div>
          {topOverdue.length === 0 && <div style={{ fontSize: '0.65rem', color: C.textMuted }}>None</div>}
          {topOverdue.map((m: any, i: number) => (
            <div key={i} style={{ fontSize: '0.65rem', color: C.textMuted, padding: '3px 0', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{m.milestoneName || m.name}</span>
              <span style={{ color: C.red, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>+{m.varianceDays}d</span>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: C.amber, textTransform: 'uppercase', marginBottom: 4 }}>Upcoming (30 days)</div>
          {topUpcoming.length === 0 && <div style={{ fontSize: '0.65rem', color: C.textMuted }}>None</div>}
          {topUpcoming.map((m: any, i: number) => {
            const pd = new Date(m.plannedDate || m.plannedCompletion || '');
            const daysLeft = Math.round((pd.getTime() - Date.now()) / 86400000);
            const plannedDateLabel = Number.isNaN(pd.getTime())
              ? '-'
              : pd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return (
              <div key={i} style={{ fontSize: '0.65rem', color: C.textMuted, padding: '3px 0', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{m.milestoneName || m.name}</span>
                <span style={{ color: daysLeft <= 7 ? C.amber : C.green, fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>{plannedDateLabel}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  3. SANKEY — View modes: Charge Type / Role / Person                */
/* ================================================================== */

function OperationalSankey({ projectBreakdown, hours, employees, tasks, onClick }: {
  projectBreakdown: any[]; hours: any[]; employees: any[]; tasks: any[]; onClick?: (p: any) => void;
}) {
  const [viewMode, setViewMode] = useState<'charge' | 'role' | 'phase'>('charge');

  const empMap = useMemo(() => {
    const m = new Map<string, any>();
    employees.forEach((e: any) => m.set(e.id || e.employeeId, e));
    return m;
  }, [employees]);

  const option: EChartsOption = useMemo(() => {
    if (!projectBreakdown.length) return {};
    const nodes: any[] = []; const links: any[] = []; const added = new Set<string>();
    const add = (name: string, color: string) => { if (!added.has(name)) { nodes.push({ name, itemStyle: { color, borderWidth: 0 } }); added.add(name); } };

    add('Portfolio', C.teal);

    if (viewMode === 'charge') {
      // Portfolio → Project → Charge Type
      projectBreakdown.forEach(p => {
        const nm = p.name;
        add(nm, p.variance > 10 ? C.red : p.variance > 0 ? C.amber : C.green);
        const total = Math.max(p.actualHours, p.timesheetHours, 1);
        links.push({ source: 'Portfolio', target: nm, value: total });
        const ct = p.chargeTypes || {};
        const ctRaw = Object.values(ct).reduce((s: number, v: any) => s + (Number(v) || 0), 0) || 1;
        const scale = total / ctRaw;
        Object.entries(ct).forEach(([type, hrs]) => {
          const scaled = Math.round((hrs as number) * scale);
          if (scaled > 0) { add(CHARGE_LABELS[type] || type, CHARGE_COLORS[type] || '#6B7280'); links.push({ source: nm, target: CHARGE_LABELS[type] || type, value: scaled }); }
        });
      });
    } else if (viewMode === 'role') {
      // Portfolio → Charge Type → Role → Employee (4 levels)
      const ctRoleHrs = new Map<string, Map<string, number>>();
      const roleEmpHrs = new Map<string, Map<string, number>>();
      hours.forEach((h: any) => {
        const ct = h.chargeType || h.charge_type || 'Other';
        const emp = empMap.get(h.employeeId || h.employee_id);
        const role = emp?.role || emp?.jobTitle || 'Unknown';
        const empName = emp?.name || 'Unknown';
        const hrs = Number(h.hours || 0); if (hrs <= 0) return;
        const pid = h.projectId || h.project_id;
        if (!projectBreakdown.find(p => p.id === pid)) return;
        // Charge Type → Role
        const ctLabel = CHARGE_LABELS[ct] || ct;
        if (!ctRoleHrs.has(ctLabel)) ctRoleHrs.set(ctLabel, new Map());
        ctRoleHrs.get(ctLabel)!.set(role, (ctRoleHrs.get(ctLabel)!.get(role) || 0) + hrs);
        // Role → Employee
        if (!roleEmpHrs.has(role)) roleEmpHrs.set(role, new Map());
        roleEmpHrs.get(role)!.set(empName, (roleEmpHrs.get(role)!.get(empName) || 0) + hrs);
      });
      // Portfolio → Charge Type
      ctRoleHrs.forEach((roles, ctLabel) => {
        const total = [...roles.values()].reduce((s, h) => s + h, 0);
        add(ctLabel, CHARGE_COLORS[Object.keys(CHARGE_LABELS).find(k => CHARGE_LABELS[k] === ctLabel) || ''] || '#6B7280');
        links.push({ source: 'Portfolio', target: ctLabel, value: Math.round(total) });
      });
      // Charge Type → Role
      ctRoleHrs.forEach((roles, ctLabel) => {
        roles.forEach((hrs, role) => {
          if (hrs > 0) { add(role, C.indigo); links.push({ source: ctLabel, target: role, value: Math.round(hrs) }); }
        });
      });
      // Role → Employee (top employees per role)
      roleEmpHrs.forEach((emps, role) => {
        const sorted = [...emps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
        sorted.forEach(([empName, hrs]) => {
          if (hrs > 0) {
            // Ensure unique name (employee names might collide with role names)
            const displayName = added.has(empName) ? `${empName} ` : empName;
            add(displayName, C.cyan);
            links.push({ source: role, target: displayName, value: Math.round(hrs) });
          }
        });
      });
    } else {
      // By Phase: Portfolio → Project → Phase → Task (4 levels)
      // Collect per-task data keyed by project → phase → task
      const projPhaseTaskHrs = new Map<string, Map<string, Map<string, number>>>();
      const projPhaseHrs = new Map<string, Map<string, number>>();
      (tasks || []).forEach((t: any) => {
        const pid = t.projectId || t.project_id || '';
        const proj = projectBreakdown.find(p => p.id === pid);
        if (!proj) return;
        const phase = t.phaseName || t.parentName || t.phaseId || 'Ungrouped';
        const taskName = t.name || t.taskName || t.id || 'Task';
        const hrs = Number(t.actualHours || t.baselineHours || 0);
        if (hrs <= 0) return;
        // Phase totals
        if (!projPhaseHrs.has(proj.name)) projPhaseHrs.set(proj.name, new Map());
        projPhaseHrs.get(proj.name)!.set(phase, (projPhaseHrs.get(proj.name)!.get(phase) || 0) + hrs);
        // Task breakdown
        if (!projPhaseTaskHrs.has(proj.name)) projPhaseTaskHrs.set(proj.name, new Map());
        if (!projPhaseTaskHrs.get(proj.name)!.has(phase)) projPhaseTaskHrs.get(proj.name)!.set(phase, new Map());
        projPhaseTaskHrs.get(proj.name)!.get(phase)!.set(taskName, (projPhaseTaskHrs.get(proj.name)!.get(phase)!.get(taskName) || 0) + hrs);
      });
      projPhaseHrs.forEach((phases, projName) => {
        const projTotal = [...phases.values()].reduce((s, h) => s + h, 0);
        const proj = projectBreakdown.find(p => p.name === projName);
        add(projName, proj && proj.variance > 10 ? C.red : proj && proj.variance > 0 ? C.amber : C.green);
        links.push({ source: 'Portfolio', target: projName, value: Math.round(projTotal) });
        // Project → Phase (top phases)
        const sortedPhases = [...phases.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        sortedPhases.forEach(([phase, hrs]) => {
          if (hrs > 0) {
            const phaseLabel = added.has(phase) ? `${phase} (${projName.substring(0, 8)})` : phase;
            add(phaseLabel, C.purple);
            links.push({ source: projName, target: phaseLabel, value: Math.round(hrs) });
            // Phase → Tasks (top tasks per phase)
            const phaseTaskMap = projPhaseTaskHrs.get(projName)?.get(phase);
            if (phaseTaskMap) {
              const sortedTasks = [...phaseTaskMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
              sortedTasks.forEach(([taskName, taskHrs]) => {
                if (taskHrs > 0) {
                  // Ensure unique by appending abbreviated phase if collision
                  let taskLabel = taskName;
                  if (added.has(taskLabel)) taskLabel = `${taskName} (${phase.substring(0, 10)})`;
                  if (added.has(taskLabel)) taskLabel = `${taskName} [${projName.substring(0, 6)}]`;
                  add(taskLabel, C.cyan);
                  links.push({ source: phaseLabel, target: taskLabel, value: Math.round(taskHrs) });
                }
              });
            }
          }
        });
      });
    }

    const nodeNames = new Set(nodes.map(n => n.name));
    const validLinks = links.filter(l => l.value > 0 && nodeNames.has(l.source) && nodeNames.has(l.target));
    if (!validLinks.length) return {};
    const totalHours = validLinks.filter(l => l.source === 'Portfolio').reduce((s, l) => s + l.value, 0) || 1;

    return {
      tooltip: { ...TT, trigger: 'item', confine: false, appendToBody: true,
        extraCssText: 'z-index:99999!important;backdrop-filter:blur(20px);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.45);max-width:500px;white-space:normal;word-wrap:break-word;',
        formatter: (params: any) => {
        if (params.dataType === 'edge') {
          const pct = sn((params.data.value / totalHours) * 100, 1);
          return `<strong style="word-break:break-word;">${params.data.source}</strong> → <strong style="word-break:break-word;">${params.data.target}</strong><br/>Hours: <strong>${fmtHrs(params.data.value)}</strong> (${pct}%)`;
        }
        return `<strong style="word-break:break-word;">${params.name}</strong>`;
      }},
      series: [{
        type: 'sankey', emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.85 } },
        nodeAlign: 'justify', nodeWidth: 28, nodeGap: 32, layoutIterations: 64,
        orient: 'horizontal', left: 50, right: 220, top: 28, bottom: 28,
        label: { color: C.textPrimary, fontSize: 11, fontWeight: 600, overflow: 'truncate', width: 180 },
        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.3 },
        data: nodes, links: validLinks,
      }],
      _nodeCount: nodes.length,
    };
  }, [projectBreakdown, hours, employees, tasks, empMap, viewMode]);

  // Calculate dynamic height based on the number of nodes
  const sankeyHeight = useMemo(() => {
    const nodeCount = (option as any)?._nodeCount || 0;
    const calculated = Math.max(550, nodeCount * 70);
    return Math.min(calculated, 2000);
  }, [option]);

  if (!projectBreakdown.length) return <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No data</div>;
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 2 }}>
          {([['charge', 'Charge Type'], ['role', 'By Role'], ['phase', 'By Phase']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setViewMode(k)} style={{ padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600, background: viewMode === k ? `${C.teal}20` : 'transparent', color: viewMode === k ? C.teal : C.textMuted }}>{l}</button>
          ))}
        </div>
        <span style={{ fontSize: '0.55rem', color: C.textMuted, fontStyle: 'italic' }}>
          {viewMode === 'charge' ? 'Portfolio → Project → Charge Type' : viewMode === 'role' ? 'Portfolio → Charge Type → Role → Employee' : 'Portfolio → Project → Phase → Task'}
        </span>
        <span style={{ fontSize: '0.65rem', color: C.textMuted, marginLeft: 'auto' }}>{fmtHrs(projectBreakdown.reduce((s, p) => s + Math.max(p.actualHours, p.timesheetHours), 0))} total hrs</span>
      </div>
      <ChartWrapper option={option} height={`${sankeyHeight}px`} onClick={onClick} isEmpty={!Object.keys(option).length} />
    </div>
  );
}

/* ================================================================== */
/*  4A. RISK MATRIX                                                    */
/* ================================================================== */

function RiskMatrix({ projectBreakdown, tasks, onSelect }: { projectBreakdown: any[]; tasks: any[]; onSelect: (p: any) => void }) {
  const [drillProject, setDrillProject] = useState<any>(null);
  const tasksByProject = useMemo(() => { const m = new Map<string, any[]>(); tasks.forEach((t: any) => { const pid = t.projectId || t.project_id || ''; if (!m.has(pid)) m.set(pid, []); m.get(pid)!.push(t); }); return m; }, [tasks]);

  const option: EChartsOption = useMemo(() => {
    if (!projectBreakdown.length) return {};
    return {
      tooltip: { ...TT, trigger: 'item', formatter: (params: any) => {
        const d = params.data;
        return `<strong>${d.name}</strong><br/>Variance: <strong style="color:${varColor(d.variance)}">${d.variance > 0 ? '+' : ''}${d.variance}%</strong><br/>Hours: ${fmtHrs(d.hours)} / ${fmtHrs(d.baseline)} baseline<br/>Progress: ${d.percentComplete}% | Tasks: ${d.tasks}<br/><span style="color:${C.teal}">Click for breakdown</span>`;
      }},
      toolbox: {
        show: true, right: 10, top: 5, iconStyle: { borderColor: C.textMuted },
        feature: {
          dataZoom: { title: { zoom: 'Zoom', back: 'Reset' } },
          restore: { title: 'Reset' },
        },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
        { type: 'inside', yAxisIndex: 0, filterMode: 'none' },
      ],
      grid: { left: 55, right: 25, top: 45, bottom: 45 },
      xAxis: { name: 'Schedule Variance', nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: C.textMuted, fontSize: 10 }, type: 'value', min: 0, max: 2, axisLabel: { color: C.textMuted, fontSize: 9, formatter: (v: number) => v <= 0.5 ? 'Low' : v <= 1 ? 'Med' : 'High' }, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } } },
      yAxis: { name: 'Budget Variance', nameLocation: 'middle', nameGap: 35, nameTextStyle: { color: C.textMuted, fontSize: 10 }, type: 'value', min: 0, max: 2, axisLabel: { color: C.textMuted, fontSize: 9, formatter: (v: number) => v <= 0.5 ? 'Low' : v <= 1 ? 'Med' : 'High' }, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } } },
      series: [{ type: 'scatter', data: projectBreakdown.map(p => {
        const schedRisk = Math.max(0, Math.min(2, p.variance > 0 ? Math.min(2, p.variance / 50 + 0.5) : 0.2));
        const budgetRisk = Math.max(0, Math.min(2, p.actualHours > p.baselineHours ? Math.min(2, ((p.actualHours - p.baselineHours) / Math.max(p.baselineHours, 1)) * 2 + 0.5) : 0.2));
        return { value: [schedRisk, budgetRisk], name: p.name, variance: p.variance, hours: p.actualHours, baseline: p.baselineHours, tasks: p.tasks, percentComplete: p.percentComplete, projectId: p.id, symbolSize: Math.max(16, Math.min(50, Math.sqrt(p.actualHours) * 1.4)), itemStyle: { color: varColor(p.variance), opacity: 0.85 } };
      }), label: { show: true, position: 'right', color: C.textMuted, fontSize: 9, overflow: 'truncate', width: 120, formatter: (p: any) => p.data.name }, emphasis: { itemStyle: { shadowBlur: 15, shadowColor: `${C.teal}80`, borderColor: C.teal, borderWidth: 2 } } }],
    };
  }, [projectBreakdown]);

  const drillData = useMemo(() => {
    if (!drillProject) return null;
    const pTasks = tasksByProject.get(drillProject.projectId || drillProject.id) || [];
    const phases = new Map<string, { name: string; tasks: any[]; hrs: number; bl: number }>();
    pTasks.forEach((t: any) => { const ph = t.phaseName || t.parentName || t.phaseId || 'Ungrouped'; if (!phases.has(ph)) phases.set(ph, { name: ph, tasks: [], hrs: 0, bl: 0 }); const p = phases.get(ph)!; p.tasks.push(t); p.hrs += Number(t.actualHours || 0); p.bl += Number(t.baselineHours || t.budgetHours || 0); });
    return { project: drillProject, phases: [...phases.values()].sort((a, b) => b.hrs - a.hrs), overBudget: pTasks.filter((t: any) => { const bl = Number(t.baselineHours || 0); return bl > 0 && Number(t.actualHours || 0) > bl * 1.1; }) };
  }, [drillProject, tasksByProject]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: drillData ? '1fr 280px' : '1fr', gap: '0.75rem' }}>
      <ChartWrapper option={option} height="420px" onClick={(params: any) => { if (params?.data) { const p = projectBreakdown.find(pb => pb.name === params.data.name); if (p) { setDrillProject(p); onSelect(p); } } }} />
      {drillData && (
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: `1px solid ${C.border}`, padding: '0.6rem', overflowY: 'auto', maxHeight: 420 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span title={drillData.project.name} style={{ fontSize: '0.75rem', fontWeight: 700, color: C.textPrimary }}>{drillData.project.name}</span>
            <button onClick={() => setDrillProject(null)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '0.7rem' }}>X</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, marginBottom: '0.4rem' }}>
            <div style={{ padding: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 5, textAlign: 'center' }}><div style={{ fontSize: '0.45rem', color: C.textMuted }}>VAR</div><div style={{ fontSize: '0.8rem', fontWeight: 700, color: varColor(drillData.project.variance) }}>{drillData.project.variance > 0 ? '+' : ''}{drillData.project.variance}%</div></div>
            <div style={{ padding: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 5, textAlign: 'center' }}><div style={{ fontSize: '0.45rem', color: C.textMuted }}>HRS</div><div style={{ fontSize: '0.8rem', fontWeight: 700, color: C.textPrimary }}>{fmtHrs(drillData.project.actualHours)}</div></div>
            <div style={{ padding: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 5, textAlign: 'center' }}><div style={{ fontSize: '0.45rem', color: C.textMuted }}>PROG</div><div style={{ fontSize: '0.8rem', fontWeight: 700, color: C.textPrimary }}>{drillData.project.percentComplete}%</div></div>
          </div>
          {drillData.overBudget.length > 0 && <div style={{ marginBottom: 4 }}><div style={{ fontSize: '0.55rem', fontWeight: 700, color: C.red, textTransform: 'uppercase', marginBottom: 2 }}>Over-Budget Tasks ({drillData.overBudget.length})</div>{drillData.overBudget.slice(0, 4).map((t: any, i: number) => <div key={i} title={t.name || t.taskName || 'Task'} style={{ fontSize: '0.6rem', color: C.textMuted, padding: '2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name || t.taskName || 'Task'} <span style={{ color: C.red }}>+{Math.round(Number(t.actualHours || 0) - Number(t.baselineHours || 0))}h</span></div>)}</div>}
          <div style={{ fontSize: '0.55rem', fontWeight: 700, color: C.textSecondary, textTransform: 'uppercase', marginBottom: 2 }}>Phases</div>
          {drillData.phases.slice(0, 6).map((ph, i) => { const v = ph.bl > 0 ? Math.round(((ph.hrs - ph.bl) / ph.bl) * 100) : 0; return <div key={i} title={String(ph.name)} style={{ fontSize: '0.6rem', color: C.textMuted, padding: '2px 0', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{ph.name} ({ph.tasks.length})</span><span style={{ color: varColor(v), flexShrink: 0 }}>{fmtHrs(ph.hrs)}/{fmtHrs(ph.bl)} {v !== 0 ? `(${v > 0 ? '+' : ''}${v}%)` : ''}</span></div>; })}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  4B. HOURS VARIANCE WATERFALL                                       */
/* ================================================================== */

function HoursVarianceWaterfall({ projectBreakdown, tasks }: { projectBreakdown: any[]; tasks: any[] }) {
  const [drillProject, setDrillProject] = useState<any>(null);

  const sorted = useMemo(() => [...projectBreakdown].sort((a, b) => (b.actualHours - b.baselineHours) - (a.actualHours - a.baselineHours)).slice(0, 16), [projectBreakdown]);

  const tasksByProject = useMemo(() => {
    const m = new Map<string, any[]>();
    tasks.forEach((t: any) => { const pid = t.projectId || t.project_id || ''; if (!m.has(pid)) m.set(pid, []); m.get(pid)!.push(t); });
    return m;
  }, [tasks]);

  const option: EChartsOption = useMemo(() => {
    if (!sorted.length) return {};
    const names = sorted.map(p => p.name);
    const totalVar = sorted.reduce((s, p) => s + (p.actualHours - p.baselineHours), 0);
    names.push('Net');
    const base: number[] = []; const positive: (number | string)[] = []; const negative: (number | string)[] = [];
    let running = 0;
    sorted.forEach(p => { const v = p.actualHours - p.baselineHours; if (v >= 0) { base.push(running); positive.push(v); negative.push('-'); running += v; } else { running += v; base.push(running); positive.push('-'); negative.push(Math.abs(v)); } });
    if (totalVar >= 0) { base.push(0); positive.push(totalVar); negative.push('-'); } else { base.push(0); positive.push('-'); negative.push(Math.abs(totalVar)); }

    return {
      tooltip: { ...TT, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => {
        const idx = params[0]?.dataIndex; if (idx == null) return '';
        if (idx === sorted.length) return `<strong>Net Variance</strong><br/>${totalVar >= 0 ? '+' : ''}${fmtHrs(totalVar)} hrs`;
        const p = sorted[idx]; const v = p.actualHours - p.baselineHours;
        return `<strong>${p.name}</strong><br/>Baseline: ${fmtHrs(p.baselineHours)}<br/>Actual: ${fmtHrs(p.actualHours)}<br/>Variance: <strong style="color:${varColor(p.variance)}">${v > 0 ? '+' : ''}${fmtHrs(v)} hrs (${p.variance > 0 ? '+' : ''}${p.variance}%)</strong><br/>Progress: ${p.percentComplete}% | Tasks: ${p.tasks}<br/><span style="color:${C.teal}">Click for breakdown</span>`;
      }},
      grid: { left: 55, right: 20, top: 15, bottom: 100 },
      xAxis: { type: 'category', data: names, axisLabel: { color: C.textMuted, fontSize: 9, rotate: 35, overflow: 'truncate', width: 100 }, axisLine: { lineStyle: { color: C.axis } }, axisPointer: { label: { formatter: (p: any) => p.value } } },
      yAxis: { type: 'value', axisLabel: { color: C.textMuted, fontSize: 9, formatter: (v: number) => fmtHrs(v) }, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } } },
      series: [
        { name: 'Base', type: 'bar', stack: 'w', data: base, itemStyle: { color: 'transparent' }, emphasis: { itemStyle: { color: 'transparent' } } },
        { name: 'Over', type: 'bar', stack: 'w', data: positive, itemStyle: { color: C.red, borderRadius: [3, 3, 0, 0] }, label: { show: true, position: 'top', color: C.red, fontSize: 8, formatter: (p: any) => p.value !== '-' && p.value > 0 ? `+${fmtHrs(p.value)}` : '' } },
        { name: 'Under', type: 'bar', stack: 'w', data: negative, itemStyle: { color: C.green, borderRadius: [3, 3, 0, 0] }, label: { show: true, position: 'top', color: C.green, fontSize: 8, formatter: (p: any) => p.value !== '-' && p.value > 0 ? `-${fmtHrs(p.value)}` : '' } },
      ],
    };
  }, [sorted]);

  const drillData = useMemo(() => {
    if (!drillProject) return null;
    const pTasks = tasksByProject.get(drillProject.id) || [];
    // Group by phase
    const phases = new Map<string, { name: string; tasks: any[]; hrs: number; bl: number }>();
    pTasks.forEach((t: any) => {
      const ph = t.phaseName || t.parentName || t.phaseId || 'Ungrouped';
      if (!phases.has(ph)) phases.set(ph, { name: ph, tasks: [], hrs: 0, bl: 0 });
      const p = phases.get(ph)!; p.tasks.push(t); p.hrs += Number(t.actualHours || 0); p.bl += Number(t.baselineHours || t.budgetHours || 0);
    });
    // Top over-budget tasks
    const overBudget = pTasks.filter((t: any) => { const bl = Number(t.baselineHours || 0); return bl > 0 && Number(t.actualHours || 0) > bl * 1.1; }).sort((a: any, b: any) => (Number(b.actualHours || 0) - Number(b.baselineHours || 0)) - (Number(a.actualHours || 0) - Number(a.baselineHours || 0)));
    // Employees on this project
    const empHrs = new Map<string, { name: string; hours: number }>();
    pTasks.forEach((t: any) => {
      const name = t.assignedTo || t.resource || '';
      if (!name) return;
      const hrs = Number(t.actualHours || 0);
      if (!empHrs.has(name)) empHrs.set(name, { name, hours: 0 });
      empHrs.get(name)!.hours += hrs;
    });
    const topEmployees = [...empHrs.values()].sort((a, b) => b.hours - a.hours).slice(0, 6);
    return { project: drillProject, phases: [...phases.values()].sort((a, b) => b.hrs - a.hrs), overBudget, topEmployees };
  }, [drillProject, tasksByProject]);

  if (!projectBreakdown.length) return <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No data</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: drillData ? '1fr 280px' : '1fr', gap: '0.75rem' }}>
      <ChartWrapper option={option} height="420px" onClick={(params: any) => {
        const idx = params?.dataIndex;
        if (idx != null && idx < sorted.length) {
          const p = sorted[idx];
          if (p) setDrillProject(p);
        }
      }} />
      {drillData && (
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: `1px solid ${C.border}`, padding: '0.6rem', overflowY: 'auto', maxHeight: 420 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span title={drillData.project.name} style={{ fontSize: '0.75rem', fontWeight: 700, color: C.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{drillData.project.name}</span>
            <button onClick={() => setDrillProject(null)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '0.7rem', flexShrink: 0 }}>X</button>
          </div>
          {/* Metrics strip */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, marginBottom: '0.5rem' }}>
            <div style={{ padding: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 5, textAlign: 'center' }}><div style={{ fontSize: '0.45rem', color: C.textMuted }}>VAR</div><div style={{ fontSize: '0.8rem', fontWeight: 700, color: varColor(drillData.project.variance) }}>{drillData.project.variance > 0 ? '+' : ''}{drillData.project.variance}%</div></div>
            <div style={{ padding: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 5, textAlign: 'center' }}><div style={{ fontSize: '0.45rem', color: C.textMuted }}>ACTUAL</div><div style={{ fontSize: '0.8rem', fontWeight: 700, color: C.textPrimary }}>{fmtHrs(drillData.project.actualHours)}</div></div>
            <div style={{ padding: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 5, textAlign: 'center' }}><div style={{ fontSize: '0.45rem', color: C.textMuted }}>BASELINE</div><div style={{ fontSize: '0.8rem', fontWeight: 700, color: C.textPrimary }}>{fmtHrs(drillData.project.baselineHours)}</div></div>
          </div>
          {/* Over-budget tasks */}
          {drillData.overBudget.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.55rem', fontWeight: 700, color: C.red, textTransform: 'uppercase', marginBottom: 2 }}>Over-Budget Tasks ({drillData.overBudget.length})</div>
              {drillData.overBudget.slice(0, 5).map((t: any, i: number) => (
                <div key={i} title={t.name || t.taskName} style={{ fontSize: '0.6rem', color: C.textMuted, padding: '2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, marginRight: 6 }}>{t.name || t.taskName || 'Task'}</span>
                  <span style={{ color: C.red, flexShrink: 0 }}>+{fmtHrs(Math.round(Number(t.actualHours || 0) - Number(t.baselineHours || 0)))}h</span>
                </div>
              ))}
            </div>
          )}
          {/* Top employees */}
          {drillData.topEmployees.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.55rem', fontWeight: 700, color: C.cyan, textTransform: 'uppercase', marginBottom: 2 }}>Top Contributors</div>
              {drillData.topEmployees.map((e, i) => (
                <div key={i} style={{ fontSize: '0.6rem', color: C.textMuted, padding: '2px 0', display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{e.name}</span>
                  <span style={{ color: C.cyan, flexShrink: 0 }}>{fmtHrs(Math.round(e.hours))}h</span>
                </div>
              ))}
            </div>
          )}
          {/* Phases */}
          <div style={{ fontSize: '0.55rem', fontWeight: 700, color: C.textSecondary, textTransform: 'uppercase', marginBottom: 2 }}>Phases</div>
          {drillData.phases.slice(0, 6).map((ph, i) => {
            const v = ph.bl > 0 ? Math.round(((ph.hrs - ph.bl) / ph.bl) * 100) : 0;
            return (
              <div key={i} title={String(ph.name)} style={{ fontSize: '0.6rem', color: C.textMuted, padding: '2px 0', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{ph.name} ({ph.tasks.length})</span>
                <span style={{ color: varColor(v), flexShrink: 0 }}>{fmtHrs(ph.hrs)}/{fmtHrs(ph.bl)} {v !== 0 ? `(${v > 0 ? '+' : ''}${v}%)` : ''}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  5. PREDICTIVE BURN — Enhanced confidence band + rich tooltips       */
/* ================================================================== */

function PredictiveBurn({ portfolio, metricsHistory = [] }: { portfolio: any; metricsHistory?: Array<{ recordedDate?: string; actualHours?: number }> }) {
  const [cpiOverride, setCpiOverride] = useState<string>('');
  const [projectionMonths, setProjectionMonths] = useState(6);
  const [confidenceWidth, setConfidenceWidth] = useState(20);

  const effectiveCpi = cpiOverride ? parseFloat(cpiOverride) : (portfolio.cpi || 1);

  const option: EChartsOption = useMemo(() => {
    const totalMonths = 12 + projectionMonths;
    const months = Array.from({ length: totalMonths }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - 11 + i); return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }); });
    const totalBl = portfolio.baselineHours || 1;
    const totalAc = portfolio.totalHours || 0;
    const cpi = effectiveCpi > 0 ? effectiveCpi : 1;
    const todayIdx = 11;
    const baseline = months.map((_, i) => Math.round(totalBl * Math.min(1, (i + 1) / (totalMonths - 2))));
    const actual: (number | null)[] = months.map((_, i) => i > todayIdx ? null : null);
    if (metricsHistory && metricsHistory.length > 0) {
      const sorted = [...metricsHistory].sort((a, b) => (a.recordedDate || (a as any).recorded_date || '').localeCompare(b.recordedDate || (b as any).recorded_date || ''));
      const now = new Date();
      let lastIdx = -1;
      for (const m of sorted) {
        const dateStr = m.recordedDate || (m as any).recorded_date;
        const d = dateStr ? new Date(dateStr) : null;
        if (!d || !Number.isFinite(d.getTime())) continue;
        const hrs = Number(m.actualHours ?? (m as any).actual_hours) || 0;
        const monthIdx = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()) + 11;
        if (monthIdx >= 0 && monthIdx < totalMonths && monthIdx <= todayIdx) {
          for (let j = lastIdx + 1; j < monthIdx; j++) actual[j] = j === 0 ? 0 : actual[j - 1];
          actual[monthIdx] = Math.round(hrs);
          lastIdx = monthIdx;
        }
      }
      for (let j = lastIdx + 1; j <= todayIdx; j++) actual[j] = lastIdx >= 0 ? actual[lastIdx] : Math.round(totalAc * ((j + 1) / (todayIdx + 1)));
    } else {
      for (let i = 0; i <= todayIdx; i++) actual[i] = Math.round(totalAc * ((i + 1) / (todayIdx + 1)));
    }
    const currentAc = (actual[todayIdx] != null ? actual[todayIdx]! : totalAc);
    const projectedFinish = cpi > 0 ? Math.round(totalBl / cpi) : totalBl * 1.5;
    const projected: (number | null)[] = months.map((_, i) => { if (i < todayIdx) return null; const rem = projectedFinish - currentAc; return Math.round(currentAc + rem * Math.min(1, (i - todayIdx) / Math.max(1, totalMonths - 1 - todayIdx))); });
    const confPct = confidenceWidth / 100;
    const confUpper: (number | null)[] = months.map((_, i) => i < todayIdx ? null : projected[i] != null ? Math.round(projected[i]! * (1 + confPct)) : null);
    const confLower: (number | null)[] = months.map((_, i) => i < todayIdx ? null : projected[i] != null ? Math.round(projected[i]! * (1 - confPct)) : null);
    const overBudget = projectedFinish > totalBl;
    const variance = totalBl > 0 ? Math.round(((currentAc - totalBl) / totalBl) * 100) : 0;

    return {
      tooltip: { ...TT, trigger: 'axis', formatter: (params: any) => {
        const idx = params[0]?.dataIndex; if (idx == null) return '';
        const month = months[idx];
        let lines = `<strong>${month}</strong>`;
        params.forEach((p: any) => {
          if (p.value != null && p.seriesName !== 'Confidence Band') lines += `<br/>${p.seriesName}: <strong>${fmtHrs(p.value)}</strong>`;
        });
        if (idx <= todayIdx && actual[idx] != null) lines += `<br/>Variance vs Baseline: <span style="color:${actual[idx]! > baseline[idx] ? C.red : C.green}">${actual[idx]! > baseline[idx] ? '+' : ''}${fmtHrs(actual[idx]! - baseline[idx])}</span>`;
        if (confUpper[idx] != null) lines += `<br/>Confidence: ${fmtHrs(confLower[idx]!)} — ${fmtHrs(confUpper[idx]!)}`;
        return lines;
      }},
      legend: { data: ['Baseline', 'Actual', 'Projected', 'Confidence Band'], bottom: 0, textStyle: { color: C.textMuted, fontSize: 10 } },
      grid: { left: 55, right: 35, top: 45, bottom: 50 },
      xAxis: { type: 'category', data: months, axisLabel: { color: C.textMuted, fontSize: 9 }, axisLine: { lineStyle: { color: C.axis } } },
      yAxis: { type: 'value', axisLabel: { color: C.textMuted, fontSize: 9, formatter: (v: number) => fmtHrs(v) }, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } } },
      series: [
        { name: 'Confidence Band', type: 'line', data: confUpper, lineStyle: { width: 1, color: overBudget ? `${C.red}50` : `${C.green}50`, type: 'dashed' }, symbol: 'none', smooth: true, areaStyle: { opacity: 0.15, color: overBudget ? C.red : C.green }, stack: 'conf' },
        { name: 'Confidence Band', type: 'line', data: confLower, lineStyle: { width: 1, color: overBudget ? `${C.red}50` : `${C.green}50`, type: 'dashed' }, symbol: 'none', smooth: true, areaStyle: { opacity: 0 }, stack: 'conf' },
        { name: 'Baseline', type: 'line', data: baseline, lineStyle: { color: C.blue, width: 2, type: 'dashed' }, symbol: 'none', smooth: true },
        { name: 'Actual', type: 'line', data: actual, lineStyle: { color: C.teal, width: 3 }, symbol: 'circle', symbolSize: 6, smooth: true, areaStyle: { opacity: 0.08, color: C.teal } },
        { name: 'Projected', type: 'line', data: projected, lineStyle: { color: overBudget ? C.red : C.green, width: 2, type: 'dotted' }, symbol: 'diamond', symbolSize: 5, smooth: true,
          areaStyle: overBudget ? { opacity: 0.1, color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${C.red}35` }, { offset: 1, color: `${C.red}05` }] } as any } : { opacity: 0.06, color: C.green },
        },
      ],
      markLine: { silent: true, data: [{ xAxis: todayIdx, lineStyle: { color: C.teal, type: 'solid', width: 2 }, label: { formatter: 'TODAY', color: C.teal, fontSize: 10, fontWeight: 'bold' } }] },
      graphic: [{ type: 'text', right: 35, top: 10, style: { text: overBudget ? `OVERRUN: +${fmtHrs(projectedFinish - totalBl)} hrs (${Math.abs(variance)}% over)` : `ON TRACK — EAC: ${fmtHrs(projectedFinish)} hrs`, fill: overBudget ? C.red : C.green, fontSize: 10, fontWeight: 'bold' } }],
    };
  }, [portfolio, effectiveCpi, projectionMonths, confidenceWidth, metricsHistory]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Parameters bar */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '0.65rem', color: C.textMuted, whiteSpace: 'nowrap' }}>CPI Override</label>
          <input type="number" step="0.05" min="0.1" max="3" value={cpiOverride} onChange={e => setCpiOverride(e.target.value)} placeholder={String(portfolio.cpi?.toFixed(2) || '1.00')} style={{ width: 65, padding: '3px 6px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.textPrimary, fontSize: '0.7rem' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '0.65rem', color: C.textMuted, whiteSpace: 'nowrap' }}>Projection</label>
          <select value={projectionMonths} onChange={e => setProjectionMonths(Number(e.target.value))} style={{ padding: '3px 6px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.textPrimary, fontSize: '0.7rem' }}>
            {[3, 6, 9, 12, 18].map(m => <option key={m} value={m}>{m} months</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '0.65rem', color: C.textMuted, whiteSpace: 'nowrap' }}>Confidence</label>
          <select value={confidenceWidth} onChange={e => setConfidenceWidth(Number(e.target.value))} style={{ padding: '3px 6px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.textPrimary, fontSize: '0.7rem' }}>
            {[10, 15, 20, 30, 40].map(w => <option key={w} value={w}>±{w}%</option>)}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '0.6rem', color: C.textMuted }}>
          Effective CPI: <strong style={{ color: effectiveCpi < 0.9 ? C.red : effectiveCpi < 1 ? C.amber : C.green }}>{effectiveCpi.toFixed(2)}</strong>
        </div>
      </div>
      <ChartWrapper option={option} height="380px" />
    </div>
  );
}

/* Meeting Snapshot & Delta section removed per user request */

/* ================================================================== */
/*  7. DEPENDENCY IMPACT GRAPH                                         */
/* ================================================================== */

function DependencyImpactGraph({ tasks }: { tasks: any[] }) {
  const [nodeLimit, setNodeLimit] = useState(60);
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [scenarioTaskId, setScenarioTaskId] = useState('');
  const [scenarioDelayDays, setScenarioDelayDays] = useState(5);
  const [scenarioActive, setScenarioActive] = useState(false);

  const CAT_COLORS = { critical: C.teal, blocked: '#F43F5E', splash: '#FB923C', task: '#94A3B8', scenario: '#E879F9' };

  const dependencyData = useMemo(() => {
    if (!tasks.length) return { items: [] as any[], successorsOfMap: new Map<string, string[]>(), edgeCount: 0 };

    const taskMap = new Map<string, any>();
    tasks.forEach((t: any) => {
      const id = String(t.id || t.taskId || '').trim();
      if (id) taskMap.set(id, t);
    });

    const successorsOf = new Map<string, string[]>();
    const addSuccessor = (from: string, to: string) => {
      if (!successorsOf.has(from)) successorsOf.set(from, []);
      const arr = successorsOf.get(from)!;
      if (!arr.includes(to)) arr.push(to);
    };

    tasks.forEach((t: any) => {
      const tid = String(t.id || t.taskId || '').trim();
      if (!tid) return;
      const pred = String(t.predecessorId || t.predecessor_id || '').trim();
      if (pred && pred !== tid && taskMap.has(pred)) addSuccessor(pred, tid);
      if (Array.isArray(t.predecessors)) {
        t.predecessors.forEach((p: any) => {
          const pid = String(p.predecessorTaskId || p.taskId || '').trim();
          if (pid && pid !== tid && taskMap.has(pid)) addSuccessor(pid, tid);
        });
      }
    });

    const items = [...taskMap.entries()].map(([id, t]) => {
      const startMs = new Date(t.startDate || t.plannedStartDate || t.baselineStartDate || t.createdAt || Date.now()).getTime();
      const endMs = new Date(t.endDate || t.finishDate || t.plannedEndDate || t.baselineEndDate || Date.now()).getTime();
      const baselineHours = Number(t.baselineHours || 0);
      const actualHours = Number(t.actualHours || 0);
      const variance = actualHours - baselineHours;
      const totalFloat = t.totalFloat ?? t.total_float ?? null;
      const isCritical = !!t.isCritical || (totalFloat != null && Number(totalFloat) <= 0);
      const status = String(t.status || '').toLowerCase();
      const isBlocked = status.includes('block') || status.includes('late');
      const downstream = successorsOf.get(id)?.length || 0;
      const name = String(t.name || t.taskName || id);
      return {
        id,
        name,
        startMs: Number.isNaN(startMs) ? Date.now() : startMs,
        endMs: Number.isNaN(endMs) ? Date.now() : endMs,
        baselineHours,
        actualHours,
        variance,
        isCritical,
        isBlocked,
        downstream,
        percentComplete: Number(t.percentComplete || 0),
        totalFloat: totalFloat == null ? null : Number(totalFloat),
      };
    }).filter((n: any) => n.downstream > 0 || tasks.some((t: any) => String(t.predecessorId || t.predecessor_id || '') === n.id));

    const sorted = items
      .filter((n: any) => !showCriticalOnly || n.isCritical || n.isBlocked)
      .sort((a: any, b: any) => ((b.isCritical ? 24 : 0) + (b.isBlocked ? 22 : 0) + (b.downstream * 4) + Math.max(0, b.variance))
        - ((a.isCritical ? 24 : 0) + (a.isBlocked ? 22 : 0) + (a.downstream * 4) + Math.max(0, a.variance)))
      .slice(0, nodeLimit);

    const edgeCount = [...successorsOf.values()].reduce((sum, arr) => sum + arr.length, 0);
    return { items: sorted, successorsOfMap: successorsOf, edgeCount };
  }, [tasks, nodeLimit, showCriticalOnly]);

  const scenarioImpacted = useMemo(() => {
    if (!scenarioActive || !scenarioTaskId) return new Set<string>();
    const impacted = new Set<string>();
    const propagate = (id: string) => {
      (dependencyData.successorsOfMap.get(id) || []).forEach(sid => {
        if (!impacted.has(sid)) { impacted.add(sid); propagate(sid); }
      });
    };
    impacted.add(scenarioTaskId);
    propagate(scenarioTaskId);
    return impacted;
  }, [scenarioActive, scenarioTaskId, scenarioDelayDays, dependencyData.successorsOfMap]);

  const option: EChartsOption = useMemo(() => {
    const rows = dependencyData.items;
    if (!rows.length) return { series: [] };

    const dateMin = Math.min(...rows.map((r: any) => Math.min(r.startMs, r.endMs)));
    const dateMax = Math.max(...rows.map((r: any) => Math.max(r.startMs, r.endMs)));
    const bucketCount = 7;
    const step = Math.max(1, Math.floor((dateMax - dateMin) / (bucketCount - 1)));
    const buckets = Array.from({ length: bucketCount }, (_, i) => dateMin + i * step);
    const bucketLabels = buckets.map(ms => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }));

    const scoresByBucket = buckets.map((bucketMs) => {
      return rows.map((n: any) => {
        const active = bucketMs >= Math.min(n.startMs, n.endMs) && bucketMs <= Math.max(n.startMs, n.endMs);
        const scenarioBump = scenarioActive && scenarioImpacted.has(n.id) ? Math.max(2, Math.round(scenarioDelayDays / 2)) : 0;
        const scoreBase = (n.isCritical ? 50 : 0) + (n.isBlocked ? 40 : 0) + (n.downstream * 6) + Math.max(0, n.variance) + scenarioBump;
        return { id: n.id, score: active ? scoreBase + Math.max(0, 100 - n.percentComplete) / 5 : -1000 };
      }).sort((a: any, b: any) => b.score - a.score);
    });

    const ranksById = new Map<string, (number | null)[]>();
    rows.forEach((n: any) => ranksById.set(n.id, Array(bucketCount).fill(null)));
    scoresByBucket.forEach((bucketScores, bucketIndex) => {
      bucketScores.forEach((s: any, rankIndex: number) => {
        if (s.score <= -1000) return;
        ranksById.get(s.id)![bucketIndex] = rankIndex + 1;
      });
    });

    const rowMap = new Map<string, any>(rows.map((r: any) => [r.id, r]));
    const series: any[] = rows.map((n: any) => {
      const isScenario = scenarioActive && scenarioImpacted.has(n.id);
      const color = isScenario ? CAT_COLORS.scenario : n.isBlocked ? CAT_COLORS.blocked : n.isCritical ? CAT_COLORS.critical : n.variance > 0 ? CAT_COLORS.splash : CAT_COLORS.task;
      const ranks = ranksById.get(n.id) || [];
      return {
        name: n.id,
        type: 'line' as const,
        smooth: 0.25,
        symbol: 'circle',
        symbolSize: 7,
        connectNulls: false,
        lineStyle: { width: n.isCritical || n.isBlocked || isScenario ? 3 : 2, color, opacity: 0.9 },
        itemStyle: { color, borderColor: 'rgba(255,255,255,0.8)', borderWidth: 1 },
        emphasis: { focus: 'series' as const, lineStyle: { width: 4 } },
        endLabel: {
          show: true,
          formatter: `${n.name.length > 16 ? `${n.name.slice(0, 16)}…` : n.name}`,
          color,
          fontSize: 9,
        },
        labelLayout: { moveOverlap: 'shiftY' as const },
        data: ranks,
      };
    });

    return {
      tooltip: {
        ...TT,
        trigger: 'item',
        formatter: (p: any) => {
          const m = rowMap.get(String(p.seriesName || ''));
          if (!m) return '';
          const rank = p.data == null ? 'N/A' : `#${p.data}`;
          return `<strong>${m.name}</strong><br/>Rank: <strong>${rank}</strong> @ ${bucketLabels[p.dataIndex] || ''}`
            + `<br/>Downstream: ${m.downstream} tasks`
            + `<br/>Baseline: ${Math.round(m.baselineHours)}h | Actual: ${Math.round(m.actualHours)}h`
            + `<br/>Variance: <strong style="color:${m.variance > 0 ? CAT_COLORS.blocked : C.green}">${m.variance > 0 ? '+' : ''}${Math.round(m.variance)}h</strong>`
            + `<br/>Progress: ${Math.round(m.percentComplete)}%`
            + (m.totalFloat != null ? `<br/>Total Float: ${m.totalFloat}d` : '')
            + (m.isCritical ? `<br/><span style="color:${CAT_COLORS.critical}">CRITICAL PATH</span>` : '')
            + (m.isBlocked ? `<br/><span style="color:${CAT_COLORS.blocked}">BLOCKED</span>` : '')
            + (scenarioActive && scenarioImpacted.has(m.id) ? `<br/><span style="color:${CAT_COLORS.scenario}">SCENARIO IMPACTED (+${scenarioDelayDays}d)</span>` : '');
        },
      },
      grid: { top: 34, left: 50, right: 140, bottom: 30 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: bucketLabels,
        axisLabel: { color: C.textMuted, fontSize: 10 },
        axisLine: { lineStyle: { color: C.border } },
      },
      yAxis: {
        type: 'value',
        min: 1,
        max: rows.length,
        inverse: true,
        axisLabel: { color: C.textMuted, fontSize: 10, formatter: (v: number) => `#${v}` },
        splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } },
        axisLine: { lineStyle: { color: C.border } },
      },
      series,
    };
  }, [dependencyData.items, scenarioImpacted, scenarioActive, scenarioTaskId, scenarioDelayDays]);

  const scenarioOptions = useMemo(() => {
    return dependencyData.items
      .filter((n: any) => n.downstream > 0)
      .sort((a: any, b: any) => b.downstream - a.downstream)
      .slice(0, 60);
  }, [dependencyData.items]);

  const inputStyle = { padding: '3px 6px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.textPrimary, fontSize: '0.7rem' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '0.65rem', color: C.textMuted, whiteSpace: 'nowrap' }}>Tracks</label>
          <select value={nodeLimit} onChange={e => setNodeLimit(Number(e.target.value))} style={inputStyle}>
            {[30, 60, 100, 150, 200].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '0.65rem', color: C.textMuted }}>
          <input type="checkbox" checked={showCriticalOnly} onChange={e => setShowCriticalOnly(e.target.checked)} style={{ accentColor: C.teal }} />
          Critical Only
        </label>
        <div style={{ marginLeft: 'auto', fontSize: '0.6rem', color: C.textMuted }}>
          {dependencyData.items.length} task tracks · {dependencyData.edgeCount} links
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.5rem 0.75rem', background: scenarioActive ? 'rgba(232,121,249,0.06)' : 'rgba(255,255,255,0.02)', borderRadius: 8, border: `1px solid ${scenarioActive ? CAT_COLORS.scenario + '40' : C.border}`, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: scenarioActive ? CAT_COLORS.scenario : C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scenario</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '0.65rem', color: C.textMuted }}>If task</label>
          <select value={scenarioTaskId} onChange={e => setScenarioTaskId(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }}>
            <option value="">Select a task...</option>
            {scenarioOptions.map((n: any) => <option key={n.id} value={n.id}>{n.name} ({n.downstream} downstream)</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '0.65rem', color: C.textMuted }}>is delayed by</label>
          <input type="number" value={scenarioDelayDays} onChange={e => setScenarioDelayDays(Number(e.target.value))} min={1} max={90} style={{ ...inputStyle, width: 50 }} />
          <span style={{ fontSize: '0.65rem', color: C.textMuted }}>days</span>
        </div>
        <button onClick={() => { if (scenarioTaskId) setScenarioActive(!scenarioActive); }} disabled={!scenarioTaskId} style={{ padding: '3px 10px', borderRadius: 4, border: 'none', cursor: scenarioTaskId ? 'pointer' : 'not-allowed', fontSize: '0.65rem', fontWeight: 600, background: scenarioActive ? CAT_COLORS.blocked : scenarioTaskId ? CAT_COLORS.scenario : C.border, color: scenarioActive ? '#fff' : scenarioTaskId ? '#fff' : C.textMuted }}>
          {scenarioActive ? 'Clear Scenario' : 'Run Scenario'}
        </button>
        {scenarioActive && scenarioImpacted.size > 0 && (
          <span style={{ fontSize: '0.6rem', color: CAT_COLORS.scenario, fontWeight: 600 }}>
            {scenarioImpacted.size} tasks impacted
          </span>
        )}
      </div>

      {dependencyData.items.length > 0 ? <ChartWrapper option={option} height="560px" /> : <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No dependency data</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.55rem', color: C.textMuted, padding: '0 0.25rem' }}>
        <span>Bump ranks show dependency pressure over schedule time windows</span>
        <div style={{ display: 'flex', gap: 12 }}>
          {Object.entries({ 'Critical Path': CAT_COLORS.critical, 'Blocked': CAT_COLORS.blocked, 'At Risk': CAT_COLORS.splash, 'Task': CAT_COLORS.task, ...(scenarioActive ? { 'Scenario': CAT_COLORS.scenario } : {}) }).map(([label, color]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  8. WORKFORCE BURN — Role → Employee → Tasks (replace heatmap)      */
/* ================================================================== */

function WorkforceBurn({ hours, employees, tasks }: { hours: any[]; employees: any[]; tasks: any[] }) {
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'hours' | 'burnRate' | 'people'>('hours');
  const [roleFilter, setRoleFilter] = useState('');
  const [showLimit, setShowLimit] = useState(12);

  const data = useMemo(() => {
    const empMap = new Map<string, any>(); employees.forEach((e: any) => empMap.set(e.id || e.employeeId, e));
    const taskMap = new Map<string, any>(); tasks.forEach((t: any) => taskMap.set(String(t.id || t.taskId), t));

    // Aggregate hours by employee
    const empHrs = new Map<string, { total: number; tasks: Map<string, number> }>();
    hours.forEach((h: any) => {
      const eid = h.employeeId || h.employee_id; const hrs = Number(h.hours || 0); if (hrs <= 0 || !eid) return;
      if (!empHrs.has(eid)) empHrs.set(eid, { total: 0, tasks: new Map() });
      const e = empHrs.get(eid)!; e.total += hrs;
      const tid = h.taskId || h.task_id; if (tid) e.tasks.set(tid, (e.tasks.get(tid) || 0) + hrs);
    });

    // Group by role
    const roles = new Map<string, { total: number; people: { emp: any; hours: number; taskHrs: Map<string, number> }[] }>();
    empHrs.forEach((data, eid) => {
      const emp = empMap.get(eid); if (!emp) return;
      const role = emp.role || emp.jobTitle || 'Unknown';
      if (!roles.has(role)) roles.set(role, { total: 0, people: [] });
      const r = roles.get(role)!; r.total += data.total;
      r.people.push({ emp, hours: data.total, taskHrs: data.tasks });
    });

    return [...roles.entries()].map(([role, d]) => ({
      role, total: d.total,
      people: d.people.sort((a, b) => b.hours - a.hours).slice(0, 15).map(p => ({
        name: p.emp.name, id: p.emp.id || p.emp.employeeId, hours: p.hours, role: p.emp.role || p.emp.jobTitle,
        tasks: [...p.taskHrs.entries()].map(([tid, hrs]) => {
          const t = taskMap.get(tid);
          const bl = Number(t?.baselineHours || t?.budgetHours || 0);
          const ac = Number(t?.actualHours || 0);
          const pc = Number(t?.percentComplete || 0);
          const remaining = bl > 0 ? Math.max(0, bl - ac) : 0;
          return { id: tid, name: t?.name || t?.taskName || tid, hours: hrs, pc, baseline: bl, actual: ac, remaining, burnRate: bl > 0 ? Math.round((ac / bl) * 100) : 0 };
        }).sort((a, b) => b.hours - a.hours).slice(0, 8),
      })),
    })).sort((a, b) => b.total - a.total);
  }, [hours, employees, tasks]);

  const filteredData = useMemo(() => {
    let result = data;
    if (roleFilter) result = result.filter(r => r.role.toLowerCase().includes(roleFilter.toLowerCase()));
    if (sortBy === 'burnRate') result = [...result].sort((a, b) => { const aAvg = a.people.reduce((s, p) => s + p.tasks.reduce((ss, t) => ss + t.burnRate, 0) / Math.max(1, p.tasks.length), 0) / Math.max(1, a.people.length); const bAvg = b.people.reduce((s, p) => s + p.tasks.reduce((ss, t) => ss + t.burnRate, 0) / Math.max(1, p.tasks.length), 0) / Math.max(1, b.people.length); return bAvg - aAvg; });
    else if (sortBy === 'people') result = [...result].sort((a, b) => b.people.length - a.people.length);
    return result;
  }, [data, roleFilter, sortBy]);

  if (!data.length) return <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No workforce data</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Parameters bar */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '0.65rem', color: C.textMuted, whiteSpace: 'nowrap' }}>Filter Role</label>
          <input type="text" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} placeholder="Search roles..." style={{ width: 120, padding: '3px 6px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.textPrimary, fontSize: '0.7rem' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '0.65rem', color: C.textMuted, whiteSpace: 'nowrap' }}>Sort</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={{ padding: '3px 6px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.textPrimary, fontSize: '0.7rem' }}>
            <option value="hours">Total Hours</option>
            <option value="burnRate">Burn Rate</option>
            <option value="people">People Count</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '0.65rem', color: C.textMuted, whiteSpace: 'nowrap' }}>Show</label>
          <select value={showLimit} onChange={e => setShowLimit(Number(e.target.value))} style={{ padding: '3px 6px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.textPrimary, fontSize: '0.7rem' }}>
            {[6, 12, 20, 30].map(n => <option key={n} value={n}>{n} roles</option>)}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '0.6rem', color: C.textMuted }}>
          {filteredData.length} roles · {filteredData.reduce((s, r) => s + r.people.length, 0)} people
        </div>
      </div>
    <div style={{ maxHeight: 500, overflowY: 'auto' }}>
      {filteredData.slice(0, showLimit).map(roleData => (
        <div key={roleData.role} style={{ marginBottom: 2 }}>
          <button onClick={() => setExpandedRole(expandedRole === roleData.role ? null : roleData.role)} style={{ width: '100%', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, background: expandedRole === roleData.role ? `${C.indigo}15` : 'rgba(255,255,255,0.02)', border: `1px solid ${expandedRole === roleData.role ? `${C.indigo}30` : 'transparent'}`, borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ fontSize: '0.55rem', color: expandedRole === roleData.role ? C.indigo : C.textMuted }}>{expandedRole === roleData.role ? '▼' : '▶'}</span>
            <span style={{ flex: 1, fontSize: '0.72rem', fontWeight: 600, color: C.textPrimary }}>{roleData.role}</span>
            <span style={{ fontSize: '0.65rem', color: C.blue, fontWeight: 700 }}>{fmtHrs(roleData.total)} hrs</span>
            <span style={{ fontSize: '0.6rem', color: C.textMuted }}>{roleData.people.length} people</span>
          </button>
          {expandedRole === roleData.role && (
            <div style={{ marginLeft: 16, borderLeft: `2px solid ${C.indigo}30`, paddingLeft: 8 }}>
              {roleData.people.map(person => (
                <div key={person.id} style={{ marginBottom: 1 }}>
                  <button onClick={() => setExpandedPerson(expandedPerson === person.id ? null : person.id)} style={{ width: '100%', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, background: expandedPerson === person.id ? `${C.cyan}10` : 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: '0.5rem', color: C.textMuted }}>{expandedPerson === person.id ? '▼' : '▶'}</span>
                    <span style={{ flex: 1, fontSize: '0.68rem', color: C.textPrimary }}>{person.name}</span>
                    <span style={{ fontSize: '0.62rem', color: C.cyan, fontWeight: 700 }}>{fmtHrs(person.hours)}</span>
                  </button>
                  {expandedPerson === person.id && (
                    <div style={{ marginLeft: 20, paddingLeft: 8, borderLeft: `1px solid ${C.cyan}20` }}>
                      {person.tasks.map(task => (
                        <div key={task.id} style={{ display: 'grid', gridTemplateColumns: '1fr 55px 55px 55px 50px', gap: 4, padding: '3px 4px', fontSize: '0.6rem', borderBottom: `1px solid ${C.border}`, alignItems: 'center' }}>
                          <span title={task.name} style={{ color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
                          <span style={{ color: C.textMuted, textAlign: 'right' }}>{fmtHrs(task.hours)}h</span>
                          <span style={{ color: task.burnRate > 110 ? C.red : task.burnRate > 90 ? C.amber : C.green, textAlign: 'right', fontWeight: 600 }}>{task.burnRate}% burn</span>
                          <span style={{ color: C.textMuted, textAlign: 'right' }}>{task.remaining > 0 ? `${fmtHrs(task.remaining)}h left` : 'done'}</span>
                          <span style={{ textAlign: 'right' }}>
                            <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                              <div style={{ width: `${Math.min(100, task.pc)}%`, height: '100%', background: task.pc >= 90 ? C.green : task.pc >= 50 ? C.amber : C.red, borderRadius: 2 }} />
                            </div>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
    </div>
  );
}

/* ================================================================== */
/*  (ParametersSuggestions removed — each chart is now its own section) */
/* ================================================================== */

/* ParametersSuggestions removed — each chart now has its own SectionCard with parameters */

/* ================================================================== */
/*  SNAPSHOT EXPORT                                                     */
/* ================================================================== */

function MeetingSnapshotButton() {
  const [exporting, setExporting] = useState(false);
  const handleSnapshot = useCallback(async () => {
    setExporting(true);
    try { const canvases = document.querySelectorAll('canvas'); if (!canvases.length) { alert('No charts.'); setExporting(false); return; } const p = 20; const mw = Math.max(...Array.from(canvases).map(c => c.width)); const th = Array.from(canvases).reduce((s, c) => s + c.height + p, p); const comp = document.createElement('canvas'); comp.width = mw + p * 2; comp.height = th; const ctx = comp.getContext('2d'); if (!ctx) return; ctx.fillStyle = C.bgSecondary; ctx.fillRect(0, 0, comp.width, comp.height); ctx.fillStyle = C.teal; ctx.font = 'bold 18px system-ui'; ctx.fillText(`Pinnacle Executive Summary — ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, p, 28); let y = 46; canvases.forEach(cv => { try { ctx.drawImage(cv, p, y); y += cv.height + p; } catch {} }); const a = document.createElement('a'); a.download = `pinnacle-summary-${new Date().toISOString().split('T')[0]}.png`; a.href = comp.toDataURL('image/png'); a.click(); } catch (e) { console.error(e); } finally { setExporting(false); }
  }, []);
  return <button onClick={handleSnapshot} disabled={exporting} style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: `1px solid ${C.teal}`, background: `${C.teal}15`, color: C.teal, cursor: exporting ? 'wait' : 'pointer', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, opacity: exporting ? 0.6 : 1 }}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
    {exporting ? 'Exporting...' : 'Snapshot'}
  </button>;
}

/* ================================================================== */
/*  MAIN PAGE                                                          */
/* ================================================================== */

export default function OverviewV2Page() {
  const { filteredData, isLoading, variancePeriod, metricsHistory } = useData();
  const data = filteredData;
  const [aggregateBy, setAggregateBy] = useState<'project' | 'site'>('project');

  const projectBreakdown = useMemo(
    () => buildProjectBreakdown(data.tasks || [], data.projects || [], data.hours || [], data.sites || [], aggregateBy),
    [data.tasks, data.projects, data.hours, data.sites, aggregateBy]
  );

  const portfolio = useMemo(
    () => buildPortfolioAggregate(projectBreakdown, aggregateBy),
    [projectBreakdown, aggregateBy]
  );

  // Milestones
  const allMilestones = useMemo(() => [...(data.milestones || []), ...(data.milestonesTable || [])], [data.milestones, data.milestonesTable]);

  const hasData = projectBreakdown.length > 0;

  if (isLoading) {
    return (
      <div className="page-panel insights-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <ContainerLoader message="Loading Insights..." minHeight={200} />
      </div>
    );
  }

  return (
    <div id="coo-period-review" className="page-panel insights-page" style={{ paddingBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontSize: '0.55rem', color: C.teal, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 1 }}>Meeting Command Center</div>
          <div style={{ fontSize: '0.6rem', color: C.textMuted }}>{projectBreakdown.length} {aggregateBy === 'site' ? 'sites' : 'projects'} | {(data.tasks || []).length} tasks</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 2 }}>
            {(['project', 'site'] as const).map(m => <button key={m} onClick={() => setAggregateBy(m)} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', background: aggregateBy === m ? `${C.teal}20` : 'transparent', color: aggregateBy === m ? C.teal : C.textMuted }}>By {m}</button>)}
          </div>
          <MeetingSnapshotButton />
        </div>
      </div>

      {!hasData && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 2rem', background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, textAlign: 'center' }}><h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 600, color: C.textPrimary }}>No Data</h2><p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: C.textMuted }}>Upload data from Data Management.</p><a href="/shared/data-management" style={{ padding: '0.6rem 1.2rem', background: C.teal, color: '#000', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>Go to Data Management</a></div>}

      {hasData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {/* ═══ 1. PULSE ═══ */}
          <SectionCard title="Portfolio Pulse" badge={<Badge label="Pulse" color={C.teal} />} noPadding>
            {(() => {
              const hsColor = portfolio.healthScore >= 80 ? C.green : portfolio.healthScore >= 60 ? C.amber : C.red;
              const pcColor = portfolio.percentComplete >= 75 ? C.green : portfolio.percentComplete >= 50 ? C.amber : C.red;
              const hrsRatio = portfolio.baselineHours > 0 ? Math.min(1, portfolio.totalHours / portfolio.baselineHours) : 0;
              const hrsBarColor = portfolio.totalHours > portfolio.baselineHours ? C.red : C.teal;
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', minHeight: 0 }}>
                  {/* ── Col 1: Health Score hero ── */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.25rem 0.75rem', borderRight: `1px solid ${C.border}`, background: `linear-gradient(180deg, ${hsColor}08, transparent)` }}>
                    <EnhancedTooltip
                      content={provenanceToTooltip(portfolio.provenance.health, 'Portfolio Health Score')}
                      placement="right"
                      maxWidth={420}
                    >
                      <div style={{ fontSize: '2.5rem', fontWeight: 900, color: hsColor, lineHeight: 1, display: 'flex', alignItems: 'center', gap: 4, cursor: 'help' }}>
                        <span>{portfolio.healthScore}</span>
                        <span style={{ fontSize: '0.7rem', color: C.textMuted }}>ⓘ</span>
                      </div>
                    </EnhancedTooltip>
                    <div style={{ fontSize: '0.6rem', color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>Health</div>
                    <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 8 }}>
                      <div style={{ width: `${portfolio.healthScore}%`, height: '100%', background: hsColor, borderRadius: 2, transition: 'width 0.5s' }} />
                    </div>
                    <EnhancedTooltip
                      content={provenanceToTooltip(portfolio.provenance.hoursVariance, 'Hours Variance')}
                      placement="right"
                      maxWidth={420}
                    >
                      <div style={{ fontSize: '0.6rem', color: varColor(portfolio.hrsVariance), fontWeight: 700, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, cursor: 'help' }}>
                        <span>{portfolio.hrsVariance > 0 ? '+' : ''}{portfolio.hrsVariance}% variance</span>
                        <span style={{ fontSize: '0.7rem', color: C.textMuted }}>ⓘ</span>
                      </div>
                    </EnhancedTooltip>
                  </div>

                  {/* ── Col 2: Metrics ── */}
                  <div style={{ padding: '0.75rem 1rem', borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
                    {/* Progress */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                        <span style={{ fontSize: '0.65rem', color: C.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>Progress</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: pcColor }}>{portfolio.percentComplete}%</span>
                      </div>
                      <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                        <div style={{ width: `${portfolio.percentComplete}%`, height: '100%', background: `linear-gradient(90deg, ${pcColor}, ${pcColor}90)`, borderRadius: 3, transition: 'width 0.5s' }} />
                      </div>
                      <div style={{ fontSize: '0.55rem', color: C.textMuted, marginTop: 2 }}>{portfolio.projectCount} projects</div>
                    </div>
                    {/* Hours: Actual vs Baseline */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                        <span style={{ fontSize: '0.65rem', color: C.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>Hours Burned</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: hrsBarColor }}>{fmtHrs(portfolio.totalHours)}</span>
                      </div>
                      <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, position: 'relative' }}>
                        <div style={{ width: `${Math.min(100, hrsRatio * 100)}%`, height: '100%', background: `linear-gradient(90deg, ${hrsBarColor}, ${hrsBarColor}90)`, borderRadius: 3, transition: 'width 0.5s' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', color: C.textMuted, marginTop: 2 }}>
                        <span>of {fmtHrs(portfolio.baselineHours)} baseline</span>
                        <span>{fmtHrs(portfolio.remainingHours)} remaining</span>
                      </div>
                    </div>
                    {/* Metrics row */}
                    <div style={{ display: 'flex', gap: 12 }}>
                      {[
                        { label: 'Earned', value: fmtHrs(portfolio.earnedHours), color: C.green },
                        { label: 'Cost', value: fmtCost(portfolio.timesheetCost), color: C.blue },
                        { label: 'Variance', value: `${portfolio.hrsVariance > 0 ? '+' : ''}${portfolio.hrsVariance}%`, color: varColor(portfolio.hrsVariance) },
                      ].map(m => (
                        <div key={m.label}>
                          <div style={{ fontSize: '0.5rem', color: C.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>{m.label}</div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: m.color }}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Col 3: Leaderboard ── */}
                  <div style={{ padding: '0.5rem 0.75rem' }}>
                    <Leaderboard projectBreakdown={projectBreakdown} onSelect={() => {}} selected={null} />
                  </div>
                </div>
              );
            })()}
          </SectionCard>

          {/* ═══ 2. DECISIONS REQUIRED ═══ */}
          <SectionCard title="Decisions Required" subtitle="Blocked, At Risk, and Critical Path tasks. Expand each category for details." badge={<Badge label="Action" color={C.red} />}>
            <DecisionsRequired tasks={data.tasks || []} projects={data.projects || []} />
          </SectionCard>

          {/* ═══ 3. MILESTONES ═══ */}
          <SectionCard title="Milestone Metrics" badge={<Badge label="Milestones" color={C.amber} />}>
            <MilestoneMetrics milestones={allMilestones} />
          </SectionCard>

          {/* ═══ 3. OPERATIONAL FRICTION ═══ */}
          <SectionCard title="Operational Friction" subtitle="View by Charge Type, Role, or Person" badge={<Badge label="Flow" color={C.blue} />}>
            <OperationalSankey projectBreakdown={projectBreakdown} hours={data.hours || []} employees={data.employees || []} tasks={data.tasks || []} />
          </SectionCard>

          {/* ═══ 4. RISK MATRIX — full width ═══ */}
          <SectionCard title="Risk Matrix" subtitle="Click a dot for task/phase breakdown" badge={<Badge label="Risk" color={C.red} />}>
            <RiskMatrix projectBreakdown={projectBreakdown} tasks={data.tasks || []} onSelect={() => {}} />
          </SectionCard>

          {/* ═══ 4B. HOURS VARIANCE — full width ═══ */}
          <SectionCard title="Hours Variance" subtitle="Waterfall: over (red) vs under (green) per project" badge={<Badge label="Variance" color={C.amber} />}>
            <HoursVarianceWaterfall projectBreakdown={projectBreakdown} tasks={data.tasks || []} />
          </SectionCard>

          {/* ═══ 5. PREDICTIVE BURN ═══ */}
          <SectionCard title="Predictive Burn" subtitle="Projected hours at completion using trending hours; configurable CPI, projection range, and confidence interval" badge={<Badge label="Forecast" color={C.green} />}>
            <PredictiveBurn portfolio={portfolio} metricsHistory={metricsHistory} />
          </SectionCard>

          {/* ═══ 6. WORKFORCE BURN RATE ═══ */}
          <SectionCard title="Workforce Burn Rate" subtitle="Role-based breakdown of hours burned, efficiency, and task progress" badge={<Badge label="Workforce" color={C.indigo} />}>
            <WorkforceBurn hours={data.hours || []} employees={data.employees || []} tasks={data.tasks || []} />
          </SectionCard>

          {/* ═══ 7. DEPENDENCY MAP ═══ */}
          <SectionCard title="Dependency Impact Bump Chart" subtitle="Ranked dependency pressure over time (critical path, blocked tasks, and scenario effects)" badge={<Badge label="Dependencies" color={C.purple} />}>
            <DependencyImpactGraph tasks={data.tasks || []} />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
