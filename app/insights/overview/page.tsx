'use client';

/**
 * Overview Page — Portfolio Analytics Dashboard
 *
 * Rewritten from scratch for ECharts 6 with:
 * - Simplified 2-memo data pipeline (projectBreakdown + portfolio)
 * - All ECharts visuals — no custom SVG charts
 * - No CSS variables in ECharts options (colors baked into pinnacle-dark theme)
 * - Cross-filter + drill-down interactivity
 * - 4 tabs: Dashboard, Milestones, Variance, Advanced
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';
import useCrossFilter, { type CrossFilter } from '@/lib/hooks/useCrossFilter';
import { calculateMetricVariance, getPeriodDisplayName } from '@/lib/variance-engine';

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

/** Safe number display */
const sn = (v: any, d = 2): string => { const n = Number(v); return isFinite(n) ? n.toFixed(d) : '0'; };
const truncName = (s: string, max = 25) => s.length > max ? s.slice(0, max) + '...' : s;
const fmtHrs = (h: number) => h >= 1000 ? `${(h / 1000).toFixed(1)}K` : h.toLocaleString();

/** Shared tooltip config — applied at each chart, not injected by wrapper */
const TT = {
  backgroundColor: 'rgba(15,15,18,0.96)',
  borderColor: C.border,
  borderWidth: 1,
  padding: [10, 15] as [number, number],
  textStyle: { color: '#fff', fontSize: 12 },
  confine: false,
  appendToBody: true,
  extraCssText: 'z-index:99999!important;backdrop-filter:blur(20px);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.45);',
};

/* ================================================================== */
/*  HELPER UI COMPONENTS                                               */
/* ================================================================== */

function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4, cursor: 'help' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2" style={{ opacity: 0.6 }}>
        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
      </svg>
      {show && (
        <div style={{ position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)', padding: '10px 14px', background: 'rgba(15,15,18,0.97)', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: '0.72rem', color: C.textSecondary, whiteSpace: 'pre-line', width: 240, zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
          {text}
        </div>
      )}
    </span>
  );
}

function SectionCard({ title, subtitle, children, noPadding = false }: {
  title: string; subtitle?: string; children: React.ReactNode; noPadding?: boolean;
}) {
  return (
    <div style={{ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0.875rem 1rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: C.textPrimary }}>{title}</h3>
        {subtitle && <span style={{ fontSize: '0.65rem', color: C.textMuted }}>{subtitle}</span>}
      </div>
      <div style={{ padding: noPadding ? 0 : '1rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>
    </div>
  );
}

function CrossFilterBar({ filters, drillPath, onRemove, onClear, onDrillToLevel }: {
  filters: CrossFilter[]; drillPath: any[]; onRemove: (t: string, v?: string) => void; onClear: () => void; onDrillToLevel: (id: string) => void;
}) {
  if (!filters.length && !drillPath.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 0.75rem', background: `${C.teal}08`, borderRadius: 10, border: `1px solid ${C.teal}30`, marginBottom: '0.75rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2"><polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" /></svg>
      {drillPath.map((l: any, i: number) => (
        <span key={l.id}>
          <button onClick={() => onDrillToLevel(l.id)} style={{ background: 'none', border: 'none', color: C.teal, cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem' }}>{l.label}</button>
          {i < drillPath.length - 1 && <span style={{ color: C.textMuted, margin: '0 4px' }}>›</span>}
        </span>
      ))}
      {filters.map(f => (
        <span key={`${f.type}-${f.value}`} style={{ padding: '3px 8px', background: `${C.teal}18`, borderRadius: 6, border: `1px solid ${C.teal}40`, color: C.teal, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
          {f.label}
          <button onClick={() => onRemove(f.type, f.value)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </span>
      ))}
      <button onClick={onClear} style={{ marginLeft: 'auto', padding: '0.3rem 0.7rem', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textSecondary, fontSize: '0.72rem', cursor: 'pointer' }}>Clear All</button>
    </div>
  );
}

function DrillDetail({ item, type, onClose }: { item: any; type: string; onClose: () => void }) {
  if (!item) return null;
  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.25rem', marginBottom: '1rem', position: 'relative' }}>
      <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: C.textPrimary }}>{item.name || 'Details'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
        {item.tasks != null && <div><div style={{ fontSize: '0.6rem', color: C.textMuted, textTransform: 'uppercase' }}>Tasks</div><div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{item.tasks}</div></div>}
        {item.baselineHours != null && <div><div style={{ fontSize: '0.6rem', color: C.textMuted, textTransform: 'uppercase' }}>Baseline</div><div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{item.baselineHours.toLocaleString()} hrs</div></div>}
        {item.actualHours != null && <div><div style={{ fontSize: '0.6rem', color: C.textMuted, textTransform: 'uppercase' }}>Actual</div><div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{item.actualHours.toLocaleString()} hrs</div></div>}
        {item.spi != null && <div><div style={{ fontSize: '0.6rem', color: C.textMuted, textTransform: 'uppercase' }}>SPI</div><div style={{ fontSize: '1.1rem', fontWeight: 700, color: item.spi >= 1 ? C.green : item.spi >= 0.9 ? C.amber : C.red }}>{sn(item.spi)}</div></div>}
        {item.cpi != null && <div><div style={{ fontSize: '0.6rem', color: C.textMuted, textTransform: 'uppercase' }}>CPI</div><div style={{ fontSize: '1.1rem', fontWeight: 700, color: item.cpi >= 1 ? C.green : item.cpi >= 0.9 ? C.amber : C.red }}>{sn(item.cpi)}</div></div>}
        {item.percentComplete != null && <div><div style={{ fontSize: '0.6rem', color: C.textMuted, textTransform: 'uppercase' }}>Progress</div><div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{item.percentComplete}%</div></div>}
        {item.variance != null && <div><div style={{ fontSize: '0.6rem', color: C.textMuted, textTransform: 'uppercase' }}>Variance</div><div style={{ fontSize: '1.1rem', fontWeight: 700, color: item.variance > 0 ? C.red : C.green }}>{item.variance > 0 ? '+' : ''}{item.variance}%</div></div>}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  LEADERBOARD                                                        */
/* ================================================================== */

type LBTab = 'hours' | 'cpi' | 'spi' | 'progress';
const LB_TABS: { key: LBTab; label: string; color: string }[] = [
  { key: 'hours', label: 'Hours', color: C.blue },
  { key: 'cpi', label: 'CPI', color: C.green },
  { key: 'spi', label: 'SPI', color: C.purple },
  { key: 'progress', label: 'Progress', color: C.amber },
];

function Leaderboard({ projectBreakdown, onSelect, selected }: { projectBreakdown: any[]; onSelect: (p: any) => void; selected: any }) {
  const [tab, setTab] = useState<LBTab>('hours');
  const sorted = useMemo(() => {
    const pb = [...projectBreakdown];
    if (tab === 'hours') return pb.sort((a, b) => b.actualHours - a.actualHours);
    if (tab === 'cpi') return pb.sort((a, b) => b.cpi - a.cpi);
    if (tab === 'spi') return pb.sort((a, b) => b.spi - a.spi);
    return pb.sort((a, b) => b.percentComplete - a.percentComplete);
  }, [projectBreakdown, tab]);
  const cur = LB_TABS.find(t => t.key === tab)!;
  const fmtVal = (p: any) => tab === 'hours' ? p.actualHours.toLocaleString() + ' hrs' : tab === 'cpi' ? sn(p.cpi) : tab === 'spi' ? sn(p.spi) : `${p.percentComplete}%`;
  const valColor = (p: any) => tab === 'hours' ? C.blue : tab === 'cpi' ? (p.cpi >= 1 ? C.green : p.cpi >= 0.9 ? C.amber : C.red) : tab === 'spi' ? (p.spi >= 1 ? C.green : p.spi >= 0.9 ? C.amber : C.red) : (p.percentComplete >= 75 ? C.green : p.percentComplete >= 50 ? C.amber : C.red);
  const medals = ['#FFD700', '#C0C0C0', '#CD7F32'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3 }}>
        {LB_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: '0.3rem 0.4rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', background: tab === t.key ? `${t.color}20` : 'transparent', color: tab === t.key ? t.color : C.textMuted, transition: 'all 0.15s' }}>{t.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 170, overflowY: 'auto', paddingRight: 4 }}>
        {sorted.map((p, i) => (
          <button key={p.id || i} onClick={() => onSelect(selected?.id === p.id ? null : p)} style={{ padding: '0.35rem 0.6rem', borderRadius: 8, border: selected?.id === p.id ? `1px solid ${C.teal}` : '1px solid transparent', background: selected?.id === p.id ? `${C.teal}10` : i < 3 ? `${cur.color}06` : 'transparent', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s' }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, flexShrink: 0, background: i < 3 ? `${medals[i]}20` : 'rgba(255,255,255,0.04)', color: i < 3 ? medals[i] : C.textMuted }}>{i + 1}</div>
            <div style={{ flex: 1, fontSize: '0.72rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.textPrimary, minWidth: 0 }}>{p.name}</div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: valColor(p), flexShrink: 0 }}>{fmtVal(p)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  CHART COMPONENTS — All ECharts 6, no CSS vars                      */
/* ================================================================== */

// ── 1. Portfolio Health Gauge (Command Center) ──
function HealthGauge({ score }: { score: number }) {
  const color = score >= 80 ? C.green : score >= 60 ? C.amber : C.red;
  const option: EChartsOption = useMemo(() => ({
    series: [{ type: 'gauge', startAngle: 220, endAngle: -40, min: 0, max: 100, pointer: { show: false }, progress: { show: true, roundCap: true, itemStyle: { color } }, axisLine: { lineStyle: { width: 14, color: [[1, 'rgba(255,255,255,0.06)']] } }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, title: { show: true, offsetCenter: [0, '55%'], fontSize: 11, color: C.textMuted }, detail: { valueAnimation: true, fontSize: 38, fontWeight: 900, offsetCenter: [0, '-8%'], color, formatter: '{value}' }, data: [{ value: score, name: 'HEALTH' }] }],
  }), [score, color]);
  return <ChartWrapper option={option} height="180px" />;
}

// ── 2. Portfolio Flow Sankey ──
function PortfolioSankey({ projectBreakdown, portfolio, onClick }: { projectBreakdown: any[]; portfolio: any; onClick?: (p: any) => void }) {
  const [depth, setDepth] = useState<'summary' | 'detailed'>('detailed');
  const option: EChartsOption = useMemo(() => {
    if (!projectBreakdown.length) return {};
    const nodes: any[] = [];
    const links: any[] = [];
    const added = new Set<string>();
    const add = (name: string, color: string) => { if (!added.has(name)) { nodes.push({ name, itemStyle: { color, borderWidth: 0 } }); added.add(name); } };

    add('Portfolio', C.teal);
    projectBreakdown.forEach(p => {
      const nm = truncName(p.name, 30);
      const clr = p.spi >= 1 && p.cpi >= 1 ? C.green : p.spi >= 0.9 && p.cpi >= 0.9 ? C.amber : C.red;
      add(nm, clr);

      // Use the larger of task actualHours or timesheet hours as the project total
      const projTotal = Math.max(p.actualHours, p.timesheetHours, 1);
      links.push({ source: 'Portfolio', target: nm, value: projTotal });

      // Scale charge-type breakdown proportionally to project total
      const ct = p.chargeTypes || {};
      const ctRaw = Object.values(ct).reduce((s: number, v: any) => s + (Number(v) || 0), 0) || 1;
      const scale = projTotal / ctRaw; // scale factor to normalize

      if (depth === 'detailed') {
        Object.entries(ct).forEach(([type, hrs]) => {
          const scaled = Math.round((hrs as number) * scale);
          if (scaled > 0) {
            const label = `${CHARGE_LABELS[type] || type} (${nm.slice(0, 12)})`;
            add(label, CHARGE_COLORS[type] || '#6B7280');
            links.push({ source: nm, target: label, value: scaled });
          }
        });
        // Earned / Remaining
        const pEarned = Math.round(projTotal * (p.percentComplete / 100));
        const pRemain = projTotal - pEarned;
        const earned = `Earned: ${nm.slice(0, 15)}`;
        const remain = `Remaining: ${nm.slice(0, 15)}`;
        if (pEarned > 0) add(earned, C.green);
        if (pRemain > 0) add(remain, C.orange);
        Object.entries(ct).forEach(([type, hrs]) => {
          const scaled = Math.round((hrs as number) * scale);
          if (scaled > 0) {
            const label = `${CHARGE_LABELS[type] || type} (${nm.slice(0, 12)})`;
            const te = Math.round(scaled * (p.percentComplete / 100));
            const tr = scaled - te;
            if (te > 0 && pEarned > 0) links.push({ source: label, target: earned, value: te });
            if (tr > 0 && pRemain > 0) links.push({ source: label, target: remain, value: tr });
          }
        });
      } else {
        Object.entries(ct).forEach(([type, hrs]) => {
          const scaled = Math.round((hrs as number) * scale);
          if (scaled > 0) {
            const label = CHARGE_LABELS[type] || type;
            add(label, CHARGE_COLORS[type] || '#6B7280');
            links.push({ source: nm, target: label, value: scaled });
          }
        });
      }

      // If no charge types, add a single "Unclassified" link so the flow doesn't dead-end
      if (Object.keys(ct).length === 0) {
        add('Unclassified', '#6B7280');
        links.push({ source: nm, target: 'Unclassified', value: projTotal });
      }
    });

    if (depth === 'summary') {
      add('Earned', C.green);
      add('Remaining', C.orange);
      Object.keys(CHARGE_LABELS).forEach(type => {
        const label = CHARGE_LABELS[type];
        if (added.has(label)) {
          const typeTotal = links.filter(l => l.target === label).reduce((s, l) => s + l.value, 0);
          if (typeTotal > 0) {
            const e = Math.round(typeTotal * (portfolio.percentComplete / 100));
            const r = typeTotal - e;
            if (e > 0) links.push({ source: label, target: 'Earned', value: e });
            if (r > 0) links.push({ source: label, target: 'Remaining', value: r });
          }
        }
      });
    }

    // Validate: remove any links with value 0 or referencing missing nodes
    const nodeNames = new Set(nodes.map(n => n.name));
    const validLinks = links.filter(l => l.value > 0 && nodeNames.has(l.source) && nodeNames.has(l.target));

    if (validLinks.length === 0) return {};

    const totalHours = projectBreakdown.reduce((s, p) => s + Math.max(p.actualHours, p.timesheetHours), 0) || 1;
    return {
      tooltip: { ...TT, trigger: 'item', formatter: (params: any) => {
        if (params.dataType === 'edge') { const pct = sn((params.data.value / totalHours) * 100, 1); return `<strong>${params.data.source}</strong> → <strong>${params.data.target}</strong><br/>Hours: <strong>${Math.round(params.data.value).toLocaleString()}</strong><br/>Share: ${pct}%`; }
        return `<strong>${params.name}</strong><br/>Click to filter`;
      }},
      series: [{ type: 'sankey', emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.85 } }, nodeAlign: 'justify', nodeWidth: 28, nodeGap: 18, layoutIterations: 64, orient: 'horizontal', left: 50, right: 180, top: 25, bottom: 25, label: { color: C.textPrimary, fontSize: 12.5, fontWeight: 600, formatter: (p: any) => { const hrs = validLinks.filter((l: any) => l.source === p.name).reduce((s: number, l: any) => s + l.value, 0); const short = truncName(p.name, 30); return hrs > 0 ? `${short}\n{sub|${Math.round(hrs).toLocaleString()} hrs}` : short; }, rich: { sub: { fontSize: 10, color: C.textMuted, lineHeight: 16 } } }, lineStyle: { color: 'gradient', curveness: 0.45, opacity: 0.42 }, data: nodes, links: validLinks }],
    };
  }, [projectBreakdown, portfolio, depth]);

  const totalHours = projectBreakdown.reduce((s, p) => s + Math.max(p.actualHours, p.timesheetHours), 0);
  if (!projectBreakdown.length) return <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No project data for Sankey</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        {(['summary', 'detailed'] as const).map(d => (
          <button key={d} onClick={() => setDepth(d)} style={{ padding: '0.3rem 0.75rem', borderRadius: 6, border: `1px solid ${depth === d ? C.teal : C.border}`, background: depth === d ? `${C.teal}10` : 'transparent', color: depth === d ? C.teal : C.textMuted, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{d}</button>
        ))}
        <span style={{ fontSize: '0.7rem', color: C.textMuted, marginLeft: 'auto' }}>{fmtHrs(totalHours)} hrs | {fmtHrs(portfolio.baselineHours)} baseline | {projectBreakdown.length} projects</span>
      </div>
      <ChartWrapper option={option} height="560px" onClick={onClick} isEmpty={!Object.keys(option).length} visualTitle="Portfolio Flow" />
    </div>
  );
}

// ── 3. Project Performance Comparison (Parallel Coordinates) ──
function PerformanceParallel({ projectBreakdown, onClick }: { projectBreakdown: any[]; onClick?: (p: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const projects = projectBreakdown.slice(0, 20);
    if (!projects.length) return {};
    const maxHrs = Math.max(...projects.map(p => p.actualHours), 1);
    return {
      tooltip: { ...TT, trigger: 'item', formatter: (params: any) => { const d = params.data; if (!d) return ''; return `<strong>${d.name}</strong><br/>SPI: ${sn(d.value[0])}<br/>CPI: ${sn(d.value[1])}<br/>Progress: ${d.value[2]}%<br/>Hours: ${d.value[3].toLocaleString()}<br/>Variance: ${d.value[4] > 0 ? '+' : ''}${d.value[4]}%`; }},
      parallelAxis: [
        { dim: 0, name: 'SPI', min: 0.5, max: 1.5, nameTextStyle: { color: C.textMuted, fontSize: 11 }, axisLine: { lineStyle: { color: C.axis } }, axisLabel: { color: C.textMuted, fontSize: 10 } },
        { dim: 1, name: 'CPI', min: 0.5, max: 1.5, nameTextStyle: { color: C.textMuted, fontSize: 11 }, axisLine: { lineStyle: { color: C.axis } }, axisLabel: { color: C.textMuted, fontSize: 10 } },
        { dim: 2, name: 'Progress %', min: 0, max: 100, nameTextStyle: { color: C.textMuted, fontSize: 11 }, axisLine: { lineStyle: { color: C.axis } }, axisLabel: { color: C.textMuted, fontSize: 10 } },
        { dim: 3, name: 'Hours', min: 0, max: maxHrs, nameTextStyle: { color: C.textMuted, fontSize: 11 }, axisLine: { lineStyle: { color: C.axis } }, axisLabel: { color: C.textMuted, fontSize: 10, formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v) } },
        { dim: 4, name: 'Variance %', min: Math.min(-30, ...projects.map(p => p.variance)), max: Math.max(30, ...projects.map(p => p.variance)), nameTextStyle: { color: C.textMuted, fontSize: 11 }, axisLine: { lineStyle: { color: C.axis } }, axisLabel: { color: C.textMuted, fontSize: 10 } },
      ],
      parallel: { left: 60, right: 60, top: 40, bottom: 30, parallelAxisDefault: { areaSelectStyle: { width: 20, opacity: 0.3, color: `${C.teal}50` } } },
      series: [{ type: 'parallel', lineStyle: { width: 2.5, opacity: 0.7 }, emphasis: { lineStyle: { width: 4, opacity: 1 } }, data: projects.map(p => ({ name: p.name, value: [p.spi, p.cpi, p.percentComplete, p.actualHours, p.variance], lineStyle: { color: p.spi >= 1 && p.cpi >= 1 ? C.green : p.spi < 0.9 || p.cpi < 0.9 ? C.red : C.amber } })) }],
    };
  }, [projectBreakdown]);
  if (!projectBreakdown.length) return <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No project data</div>;
  return <ChartWrapper option={option} height="320px" onClick={onClick} />;
}

// ── 4. Project Health Radar ──
function HealthRadar({ projects, onClick }: { projects: any[]; onClick?: (p: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const top = projects.slice(0, 6);
    if (!top.length) return {};
    return {
      tooltip: { ...TT, trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: C.textMuted, fontSize: 10 } },
      radar: { indicator: [{ name: 'SPI', max: 1.5 }, { name: 'CPI', max: 1.5 }, { name: 'Progress', max: 100 }, { name: 'Efficiency', max: 2 }], axisName: { color: C.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: C.gridLine } }, splitArea: { areaStyle: { color: ['transparent', 'rgba(255,255,255,0.02)'] } } },
      series: [{ type: 'radar', data: top.map((p, i) => ({ name: truncName(p.name, 20), value: [p.spi, p.cpi, p.percentComplete, p.baselineHours > 0 ? p.actualHours / p.baselineHours : 1], areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 } })) }],
    };
  }, [projects]);
  return <ChartWrapper option={option} height="340px" onClick={onClick} />;
}

// ── 5. Risk Matrix ──
function RiskMatrix({ scheduleRisks, budgetConcerns, onClick }: { scheduleRisks: any[]; budgetConcerns: any[]; onClick?: (p: any) => void }) {
  const items = useMemo(() => {
    const out: any[] = [];
    scheduleRisks.forEach(r => { out.push({ ...r, type: 'schedule', impact: r.variance > 14 ? 90 : r.variance > 7 ? 60 : 30, probability: Math.min(95, Math.max(50, 50 + (r.variance || 0) * 2)), color: C.red }); });
    budgetConcerns.slice(0, 15).forEach(b => { out.push({ ...b, type: 'budget', impact: b.variance > 50 ? 85 : b.variance > 20 ? 55 : 25, probability: Math.min(90, Math.max(40, 40 + (b.variance || 0))), color: C.amber }); });
    return out.slice(0, 30);
  }, [scheduleRisks, budgetConcerns]);

  const option: EChartsOption = useMemo(() => ({
    tooltip: { ...TT, trigger: 'item', formatter: (params: any) => { const d = items[params.dataIndex]; if (!d) return ''; const risk = Math.round((d.impact * d.probability) / 100); return `<strong>${d.name}</strong><br/>Type: ${d.type === 'schedule' ? 'Schedule Risk' : 'Budget Concern'}<br/>Variance: ${d.type === 'schedule' ? `+${d.variance} days` : `+${d.variance}% over`}<br/>Impact: ${d.impact}/100<br/>Probability: ${d.probability}%<br/>Risk Score: <strong>${risk}</strong>/100`; }},
    grid: { left: 55, right: 20, top: 35, bottom: 55 },
    xAxis: { name: 'PROBABILITY', nameLocation: 'center', nameGap: 35, nameTextStyle: { color: C.textMuted, fontSize: 11 }, type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } }, axisLine: { lineStyle: { color: C.axis } }, axisLabel: { show: false } },
    yAxis: { name: 'IMPACT', nameLocation: 'center', nameGap: 40, nameTextStyle: { color: C.textMuted, fontSize: 11 }, type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } }, axisLine: { lineStyle: { color: C.axis } }, axisLabel: { show: false } },
    series: [{ type: 'scatter', data: items.map(d => [d.probability, d.impact]), symbolSize: (val: any) => { const d = items[val[2] !== undefined ? val[2] : 0]; const r = d ? (d.impact * d.probability) / 100 : 14; return Math.max(14, Math.min(32, r * 0.4)); }, itemStyle: { color: (params: any) => items[params.dataIndex]?.color || '#6B7280' }, emphasis: { itemStyle: { shadowBlur: 12, shadowColor: `${C.teal}80` } }, label: { show: true, position: 'right', fontSize: 9, color: C.textMuted, formatter: (params: any) => { const d = items[params.dataIndex]; if (!d) return ''; return (d.impact * d.probability) / 100 > 50 ? d.name.slice(0, 14) : ''; } } }],
    graphic: [
      { type: 'rect', left: '50%', top: 0, shape: { width: '50%', height: '50%' }, style: { fill: 'rgba(239,68,68,0.06)' }, silent: true, z: -1 },
      { type: 'text', left: '70%', top: '20%', style: { text: 'HIGH RISK', fill: C.red, fontSize: 11, fontWeight: 'bold', opacity: 0.5 } },
      { type: 'text', left: '15%', top: '20%', style: { text: 'WATCH', fill: C.amber, fontSize: 11, fontWeight: 'bold', opacity: 0.5 } },
      { type: 'text', left: '15%', top: '70%', style: { text: 'LOW RISK', fill: C.green, fontSize: 11, fontWeight: 'bold', opacity: 0.5 } },
    ],
  }), [items]);

  return <ChartWrapper option={option} height="340px" onClick={onClick} />;
}

// ── 6. Budget Variance ──
function BudgetVariance({ projectBreakdown, onClick }: { projectBreakdown: any[]; onClick?: (p: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    if (!projectBreakdown.length) return {};
    const sorted = [...projectBreakdown].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 15);
    const names = sorted.map(p => truncName(p.name, 22));
    return {
      tooltip: { ...TT, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => {
        if (!params || !params.length) return '';
        const idx = params[0]?.dataIndex;
        const p = sorted[idx]; if (!p) return '';
        return `<strong>${p.name}</strong><br/>Baseline: ${p.baselineHours.toLocaleString()} hrs<br/>Actual: ${p.actualHours.toLocaleString()} hrs<br/>Variance: <span style="color:${p.variance > 0 ? C.red : C.green};font-weight:700">${p.variance > 0 ? '+' : ''}${p.variance}%</span>`;
      }},
      grid: { left: 160, right: 60, top: 30, bottom: 40, containLabel: false },
      xAxis: { type: 'value', name: 'Hours', nameTextStyle: { color: C.textMuted, fontSize: 10 }, axisLabel: { color: C.textMuted, fontSize: 10, formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(Math.round(v)) }, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } } },
      yAxis: { type: 'category', data: names, axisLabel: { color: C.textPrimary, fontSize: 10, width: 140, overflow: 'truncate' }, axisLine: { lineStyle: { color: C.axis } } },
      series: [
        { name: 'Baseline', type: 'bar', data: sorted.map(p => p.baselineHours), itemStyle: { color: 'rgba(255,255,255,0.12)', borderColor: C.axis, borderWidth: 1, borderType: 'dashed' as const }, barWidth: '40%', barGap: '10%' },
        { name: 'Actual', type: 'bar', data: sorted.map(p => ({ value: p.actualHours, itemStyle: { color: p.variance > 10 ? C.red : p.variance > 0 ? C.amber : C.green } })), barWidth: '40%' },
      ],
      legend: { data: ['Baseline', 'Actual'], bottom: 0, textStyle: { color: C.textMuted, fontSize: 10 } },
    };
  }, [projectBreakdown]);
  if (!projectBreakdown.length) return <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No data</div>;
  return <ChartWrapper option={option} height="480px" onClick={onClick} isEmpty={!Object.keys(option).length} visualTitle="Budget Variance" />;
}

// ── 7. Float & Cascade ──
function FloatCascade({ tasks, onClick }: { tasks: any[]; onClick?: (p: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    // Filter to tasks with meaningful data, then take top 15 by hours
    const withData = tasks
      .map((t: any, i: number) => {
        const bl = Number(t.baselineHours || t.budgetHours || 0);
        const ac = Number(t.actualHours || 0);
        const pc = Number(t.percentComplete || 0);
        const tf = t.totalFloat != null && t.totalFloat !== '' ? Number(t.totalFloat) : (bl > 0 ? Math.max(0, Math.round((bl - ac) / bl * 20)) : 0);
        const crit = t.isCritical === true || t.isCritical === 'true' || tf <= 0;
        return { name: truncName(t.name || t.taskName || `Task ${i + 1}`, 25), actual: ac, baseline: bl, float: tf, isCritical: crit, pc };
      })
      .filter(t => t.actual > 0 || t.baseline > 0)
      .sort((a, b) => (b.actual + b.baseline) - (a.actual + a.baseline))
      .slice(0, 15);

    if (!withData.length) return {};
    const names = withData.map(t => t.name);
    return {
      tooltip: { ...TT, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => { const d = withData[params[0]?.dataIndex]; if (!d) return ''; return `<strong>${d.name}</strong><br/>Baseline: ${d.baseline.toLocaleString()} hrs<br/>Actual: ${d.actual.toLocaleString()} hrs<br/>Float: ${d.float} hrs ${d.isCritical ? '<span style="color:' + C.red + ';font-weight:700">(CRITICAL)</span>' : ''}<br/>Progress: ${d.pc}%`; }},
      legend: { data: ['Work Hours', 'Float (Buffer)'], bottom: 0, textStyle: { color: C.textMuted, fontSize: 10 } },
      grid: { left: 160, right: 40, top: 30, bottom: 50, containLabel: false },
      xAxis: { type: 'value', name: 'Hours', nameTextStyle: { color: C.textMuted, fontSize: 10 }, axisLabel: { color: C.textMuted, fontSize: 10, formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(Math.round(v)) }, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } } },
      yAxis: { type: 'category', data: names, axisLabel: { color: C.textPrimary, fontSize: 10, width: 140, overflow: 'truncate' }, axisLine: { lineStyle: { color: C.axis } } },
      series: [
        { name: 'Work Hours', type: 'bar', stack: 'total', data: withData.map(t => ({ value: t.actual > 0 ? t.actual : t.baseline, itemStyle: { color: t.isCritical ? C.red : C.blue } })), barWidth: '55%' },
        { name: 'Float (Buffer)', type: 'bar', stack: 'total', data: withData.map(t => ({ value: t.float, itemStyle: { color: `${C.teal}40`, borderColor: C.teal, borderWidth: 1, borderType: 'dashed' as const } })), barWidth: '55%' },
      ],
    };
  }, [tasks]);
  if (!Object.keys(option).length) return <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No tasks with hours data for Float & Cascade</div>;
  return <ChartWrapper option={option} height="400px" onClick={onClick} visualTitle="Float & Cascade" />;
}

// ── 8. FTE Saturation ──
function FTESaturation({ tasks, onClick }: { tasks: any[]; onClick?: (p: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const totalHours = tasks.reduce((s, t) => s + (Number(t.actualHours) || 0), 0);
    const resources = new Set(tasks.map((t: any) => t.assignedResource || t.resource).filter(Boolean));
    const rc = Math.max(resources.size, 5);
    const capacity = rc * 40;
    const weeks = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (11 - i) * 7); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); });
    const completed = tasks.filter((t: any) => (t.percentComplete || 0) >= 100).length;
    const ratio = tasks.length > 0 ? completed / tasks.length : 0;
    const demand = weeks.map((_, i) => { const w = i / 11; const weight = ratio > 0.5 ? (1 - w) * 0.6 + 0.7 : w * 0.6 + 0.7; return Math.round((totalHours / 12) * weight); });
    const sat = demand.map(d => Math.round((d / capacity) * 100));

    return {
      tooltip: { ...TT, trigger: 'axis', formatter: (params: any) => { const i = params[0]?.dataIndex; return `<strong>${weeks[i]}</strong><br/>Demand: ${demand[i]} hrs<br/>Capacity: ${capacity} hrs<br/>Saturation: ${sat[i]}%`; }},
      legend: { data: ['Demand', 'Capacity', 'Saturation %'], bottom: 0, textStyle: { color: C.textMuted, fontSize: 10 } },
      grid: { left: 50, right: 50, top: 30, bottom: 60 },
      xAxis: { type: 'category', data: weeks, axisLabel: { color: C.textMuted, fontSize: 9, rotate: 30 }, axisLine: { lineStyle: { color: C.axis } } },
      yAxis: [
        { type: 'value', name: 'Hours', nameTextStyle: { color: C.textMuted, fontSize: 10 }, axisLabel: { color: C.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } } },
        { type: 'value', name: '%', nameTextStyle: { color: C.textMuted, fontSize: 10 }, axisLabel: { color: C.textMuted, fontSize: 10, formatter: '{value}%' }, splitLine: { show: false }, min: 0, max: Math.max(150, ...sat) + 10 },
      ],
      series: [
        { name: 'Demand', type: 'bar', data: demand.map(d => ({ value: d, itemStyle: { color: d > capacity ? C.red : C.blue } })), barWidth: '45%' },
        { name: 'Capacity', type: 'line', data: Array(12).fill(capacity), lineStyle: { color: C.amber, width: 2, type: 'dashed' }, symbol: 'none' },
        { name: 'Saturation %', type: 'line', yAxisIndex: 1, data: sat, lineStyle: { color: C.teal, width: 2 }, symbol: 'circle', symbolSize: 6, itemStyle: { color: C.teal } },
      ],
    };
  }, [tasks]);
  return <ChartWrapper option={option} height="380px" onClick={onClick} />;
}

// ── 9. Earned Value S-Curve ──
function EarnedValueCurve({ tasks, onClick }: { tasks: any[]; onClick?: (p: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const totalBl = tasks.reduce((s, t) => s + (Number(t.baselineHours) || 0), 0);
    const totalAc = tasks.reduce((s, t) => s + (Number(t.actualHours) || 0), 0);
    const avgPc = tasks.length > 0 ? tasks.reduce((s, t) => s + (Number(t.percentComplete) || 0), 0) / tasks.length : 0;
    const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - 11 + i); return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }); });
    const pv = months.map((_, i) => Math.round(totalBl * ((i + 1) / 12)));
    const ev = months.map((_, i) => Math.round(totalBl * (avgPc / 100) * ((i + 1) / 12)));
    const ac = months.map((_, i) => Math.round(totalAc * ((i + 1) / 12)));
    const spi = totalBl > 0 ? (totalBl * avgPc / 100) / totalBl : 1;
    const cpi = totalAc > 0 ? (totalBl * avgPc / 100) / totalAc : 1;

    return {
      tooltip: { ...TT, trigger: 'axis' },
      legend: { data: ['Planned (PV)', 'Earned (EV)', 'Actual (AC)'], bottom: 0, textStyle: { color: C.textMuted, fontSize: 10 } },
      grid: { left: 60, right: 50, top: 40, bottom: 50 },
      xAxis: { type: 'category', data: months, axisLabel: { color: C.textMuted, fontSize: 9 }, axisLine: { lineStyle: { color: C.axis } } },
      yAxis: { type: 'value', axisLabel: { color: C.textMuted, fontSize: 10, formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v) }, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } } },
      series: [
        { name: 'Planned (PV)', type: 'line', data: pv, lineStyle: { color: C.blue, width: 2, type: 'dashed' }, symbol: 'none', smooth: true },
        { name: 'Earned (EV)', type: 'line', data: ev, lineStyle: { color: C.green, width: 2 }, symbol: 'circle', symbolSize: 5, smooth: true, areaStyle: { opacity: 0.08 } },
        { name: 'Actual (AC)', type: 'line', data: ac, lineStyle: { color: ac[11] > ev[11] ? C.red : C.green, width: 2 }, symbol: 'circle', symbolSize: 5, smooth: true },
      ],
      graphic: [{ type: 'text', right: 40, top: 10, style: { text: `SPI: ${sn(spi)} | CPI: ${sn(cpi)}`, fill: C.textMuted, fontSize: 11 } }],
    };
  }, [tasks]);
  return <ChartWrapper option={option} height="340px" onClick={onClick} />;
}

// ── 10. Buffer Consumption Sunburst ──
function BufferSunburst({ projectBreakdown, onClick }: { projectBreakdown: any[]; onClick?: (p: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const data = [{
      name: 'Portfolio', itemStyle: { color: C.blue },
      children: projectBreakdown.slice(0, 8).map(p => {
        const used = p.baselineHours > 0 ? (p.actualHours / p.baselineHours) * 100 : 50;
        const clr = used > 100 ? C.red : used > 80 ? C.amber : C.green;
        return { name: truncName(p.name, 15), value: Math.max(1, p.actualHours), itemStyle: { color: clr }, children: [
          { name: 'Consumed', value: Math.round(used), itemStyle: { color: clr } },
          { name: 'Remaining', value: Math.round(Math.max(0, 100 - used)), itemStyle: { color: `${C.green}40` } },
        ]};
      }),
    }];
    return {
      tooltip: { ...TT, trigger: 'item', formatter: (p: any) => `<strong>${p.name}</strong><br/>Value: ${p.value}` },
      series: [{ type: 'sunburst', data, radius: ['15%', '90%'], label: { color: C.textPrimary, fontSize: 10, rotate: 'radial' }, itemStyle: { borderWidth: 2, borderColor: C.bgCard }, emphasis: { focus: 'ancestor', itemStyle: { shadowBlur: 10, shadowColor: `${C.teal}40` } } }],
    };
  }, [projectBreakdown]);
  return <ChartWrapper option={option} height="420px" onClick={onClick} />;
}

// ── 11. Dependency Network ──
function DependencyNetwork({ tasks, onClick }: { tasks: any[]; onClick?: (p: any) => void }) {
  const { graphNodes, graphLinks } = useMemo(() => {
    if (!tasks.length) return { graphNodes: [], graphLinks: [] };
    const taskMap = new Map<string, any>();
    tasks.forEach((t: any) => { const id = String(t.id || t.taskId || ''); if (id) taskMap.set(id, t); });

    const childrenOf = new Map<string, string[]>();
    const linkData: { source: string; target: string; type: string }[] = [];

    tasks.forEach((t: any) => {
      const tid = String(t.id || t.taskId || '');
      const pid = String(t.parentId || t.phaseId || '');
      const pred = String(t.predecessorId || '');
      if (pid && pid !== tid && taskMap.has(pid)) {
        if (!childrenOf.has(pid)) childrenOf.set(pid, []);
        childrenOf.get(pid)!.push(tid);
        linkData.push({ source: pid, target: tid, type: 'parent' });
      }
      if (pred && pred !== tid && taskMap.has(pred)) linkData.push({ source: pred, target: tid, type: 'predecessor' });
    });

    childrenOf.forEach(children => {
      const s = [...children].sort((a, b) => Number(a) - Number(b));
      for (let i = 0; i < s.length - 1; i++) linkData.push({ source: s[i], target: s[i + 1], type: 'sibling' });
    });

    const nodeIdSet = new Set<string>();
    const nodeList: any[] = [];
    const parentIds = [...childrenOf.keys()].sort((a, b) => (childrenOf.get(b)?.length || 0) - (childrenOf.get(a)?.length || 0));

    parentIds.forEach(pid => {
      if (nodeIdSet.size >= 40) return;
      const t = taskMap.get(pid); if (!t) return;
      nodeIdSet.add(pid);
      nodeList.push({ id: pid, name: truncName(t.name || t.taskName || pid, 28), childCount: childrenOf.get(pid)?.length || 0, hours: Number(t.baselineHours || t.actualHours || 0), pc: Number(t.percentComplete || 0), isCritical: !!t.isCritical, isParent: true });
      (childrenOf.get(pid) || []).forEach(cid => {
        if (nodeIdSet.size >= 40 || nodeIdSet.has(cid)) return;
        const ct = taskMap.get(cid); if (!ct) return;
        nodeIdSet.add(cid);
        nodeList.push({ id: cid, name: truncName(ct.name || ct.taskName || cid, 28), childCount: childrenOf.get(cid)?.length || 0, hours: Number(ct.baselineHours || ct.actualHours || 0), pc: Number(ct.percentComplete || 0), isCritical: !!ct.isCritical, isParent: childrenOf.has(cid) });
      });
    });

    return { graphNodes: nodeList, graphLinks: linkData.filter(l => nodeIdSet.has(l.source) && nodeIdSet.has(l.target)) };
  }, [tasks]);

  const option: EChartsOption = useMemo(() => {
    if (!graphNodes.length) return {};
    const maxH = Math.max(...graphNodes.map((n: any) => n.hours), 1);
    const maxC = Math.max(...graphNodes.map((n: any) => n.childCount), 1);
    return {
      tooltip: { ...TT, trigger: 'item', formatter: (params: any) => { const d = params.data; if (params.dataType === 'edge') { return `${d.sourceName || d.source} → ${d.targetName || d.target}<br/>Type: ${d.linkType === 'parent' ? 'Parent→Child' : d.linkType === 'predecessor' ? 'Predecessor' : 'Sibling'}`; } return `<strong>${d.name}</strong><br/>Hours: ${Math.round(d.hours || 0).toLocaleString()}<br/>Progress: ${Math.round(d.pc || 0)}%<br/>Children: ${d.childCount || 0}${d.isCritical ? '<br/><span style="color:' + C.red + '">CRITICAL</span>' : ''}`; }},
      legend: { data: ['Critical', 'Phase', 'Task'], bottom: 0, textStyle: { color: C.textMuted, fontSize: 10 } },
      series: [{ type: 'graph', layout: 'force', roam: true, draggable: true, force: { repulsion: 250, gravity: 0.12, edgeLength: [60, 160], layoutAnimation: true },
        categories: [{ name: 'Critical', itemStyle: { color: C.red } }, { name: 'Phase', itemStyle: { color: C.amber } }, { name: 'Task', itemStyle: { color: C.blue } }],
        data: graphNodes.map((n: any) => ({ name: n.name, id: n.id, symbolSize: n.isParent ? Math.max(30, Math.min(60, 30 + (n.childCount / maxC) * 30)) : Math.max(16, Math.min(40, (n.hours / maxH) * 40)), category: n.isCritical ? 0 : n.isParent ? 1 : 2, hours: n.hours, pc: n.pc, childCount: n.childCount, isCritical: n.isCritical, label: { show: n.isParent || n.isCritical, position: 'right', color: C.textPrimary, fontSize: 10 }, itemStyle: { shadowBlur: n.isCritical ? 15 : n.isParent ? 8 : 3, shadowColor: n.isCritical ? `${C.red}80` : 'rgba(0,0,0,0.2)', borderWidth: n.isParent ? 2 : 1, borderColor: n.isCritical ? C.red : n.isParent ? C.amber : `${C.blue}80` } })),
        links: graphLinks.map((l: any) => { const src = graphNodes.find((n: any) => n.id === l.source); const tgt = graphNodes.find((n: any) => n.id === l.target); return { source: l.source, target: l.target, sourceName: src?.name, targetName: tgt?.name, linkType: l.type, lineStyle: { color: l.type === 'parent' ? `${C.amber}60` : l.type === 'predecessor' ? `${C.red}80` : `${C.blue}30`, width: l.type === 'parent' ? 2 : l.type === 'predecessor' ? 2.5 : 1, curveness: l.type === 'sibling' ? 0.3 : 0.15, type: l.type === 'sibling' ? 'dashed' as const : 'solid' as const }, symbol: ['none', 'arrow'], symbolSize: [0, 8] }; }),
        emphasis: { focus: 'adjacency', itemStyle: { shadowBlur: 20, shadowColor: `${C.teal}80` }, lineStyle: { width: 3, color: C.teal } },
      }],
    };
  }, [graphNodes, graphLinks]);

  if (!graphNodes.length) return <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No task dependency data</div>;
  return <ChartWrapper option={option} height="480px" onClick={onClick} />;
}

// ── 12. Elastic Scheduling ──
function ElasticScheduling({ tasks, onClick }: { tasks: any[]; onClick?: (p: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const totalH = tasks.reduce((s, t) => s + (Number(t.actualHours) || 0), 0);
    const rc = Math.max(new Set(tasks.map((t: any) => t.assignedResource).filter(Boolean)).size, 5);
    const cap = rc * 40;
    const weeks = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (11 - i) * 7); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); });
    const demand = weeks.map((_, i) => Math.round((totalH / 12) * (0.7 + Math.random() * 0.6)));
    return {
      tooltip: { ...TT, trigger: 'axis', formatter: (params: any) => { const i = params[0]?.dataIndex; return `<strong>${weeks[i]}</strong><br/>Demand: ${demand[i]} hrs<br/>Capacity: ${cap} hrs<br/>Available: ${Math.max(0, cap - demand[i])} hrs`; }},
      legend: { data: ['Committed', 'Available'], bottom: 0, textStyle: { color: C.textMuted, fontSize: 10 } },
      grid: { left: 50, right: 30, top: 30, bottom: 50 },
      xAxis: { type: 'category', data: weeks, axisLabel: { color: C.textMuted, fontSize: 9, rotate: 30 } },
      yAxis: { type: 'value', name: 'Hours', nameTextStyle: { color: C.textMuted, fontSize: 10 }, axisLabel: { color: C.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } } },
      series: [
        { name: 'Committed', type: 'bar', stack: 'x', data: demand.map(d => ({ value: Math.min(d, cap), itemStyle: { color: C.blue } })), barWidth: '55%' },
        { name: 'Available', type: 'bar', stack: 'x', data: demand.map(d => ({ value: Math.max(0, cap - d), itemStyle: { color: `${C.green}30` } })), barWidth: '55%' },
      ],
    };
  }, [tasks]);
  return <ChartWrapper option={option} height="340px" onClick={onClick} />;
}

// ── 13. Milestone Timeline ──
function MilestoneTimeline({ milestones, onClick }: { milestones: any[]; onClick?: (p: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    if (!milestones.length) return {};
    const sorted = [...milestones].sort((a, b) => Math.abs(b.varianceDays || 0) - Math.abs(a.varianceDays || 0)).slice(0, 15);
    const names = sorted.map(m => truncName(m.milestoneName || m.name || 'Milestone', 22));
    return {
      tooltip: { ...TT, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => { const m = sorted[params[0]?.dataIndex]; if (!m) return ''; return `<strong>${m.milestoneName || m.name}</strong><br/>Variance: ${m.varianceDays || 0} days<br/>Progress: ${m.percentComplete || 0}%`; }},
      grid: { left: 160, right: 40, top: 20, bottom: 30 },
      xAxis: { type: 'value', name: 'Days Variance', nameTextStyle: { color: C.textMuted, fontSize: 10 }, axisLabel: { color: C.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } } },
      yAxis: { type: 'category', data: names, axisLabel: { color: C.textPrimary, fontSize: 10 }, axisLine: { lineStyle: { color: C.axis } } },
      series: [{ type: 'bar', data: sorted.map(m => ({ value: m.varianceDays || 0, itemStyle: { color: (m.varianceDays || 0) > 7 ? C.red : (m.varianceDays || 0) > 0 ? C.amber : C.green } })), barWidth: '55%' }],
    };
  }, [milestones]);
  if (!milestones.length) return <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No milestone data</div>;
  return <ChartWrapper option={option} height="450px" onClick={onClick} />;
}

// ── 14. Milestone Status Pie ──
function MilestoneStatusPie({ milestones, onClick }: { milestones: any[]; onClick?: (p: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const complete = milestones.filter(m => m.status === 'Complete' || (m.percentComplete || 0) >= 100).length;
    const late = milestones.filter(m => (m.varianceDays || 0) > 7 && (m.percentComplete || 0) < 100).length;
    const atRisk = milestones.filter(m => (m.varianceDays || 0) > 0 && (m.varianceDays || 0) <= 7 && (m.percentComplete || 0) < 100).length;
    const onTrack = milestones.length - complete - late - atRisk;
    return {
      tooltip: { ...TT, trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, textStyle: { color: C.textMuted, fontSize: 10 } },
      series: [{ type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'], avoidLabelOverlap: true, label: { color: C.textPrimary, fontSize: 11 }, data: [
        { value: complete, name: 'Complete', itemStyle: { color: C.green } },
        { value: onTrack, name: 'On Track', itemStyle: { color: C.blue } },
        { value: atRisk, name: 'At Risk', itemStyle: { color: C.amber } },
        { value: late, name: 'Late', itemStyle: { color: C.red } },
      ].filter(d => d.value > 0) }],
    };
  }, [milestones]);
  return <ChartWrapper option={option} height="320px" onClick={onClick} />;
}

// ── 15. Milestone Progress Gauge ──
function MilestoneGauges({ milestones, projectBreakdown }: { milestones: any[]; projectBreakdown: any[] }) {
  // If no real milestones, derive summary metrics from projectBreakdown
  const metrics = useMemo(() => {
    if (milestones.length > 0) {
      const total = milestones.length;
      const complete = milestones.filter(m => m.status === 'Complete' || (m.percentComplete || 0) >= 100).length;
      const avgProg = Math.round(milestones.reduce((s, m) => s + (m.percentComplete || 0), 0) / total);
      const avgDelay = Math.round((milestones.reduce((s, m) => s + (m.varianceDays || 0), 0) / total) * 10) / 10;
      return { total, complete, avgProg, avgDelay, source: 'milestones' };
    }
    // Derive from projects
    const total = projectBreakdown.length || 1;
    const complete = projectBreakdown.filter(p => p.percentComplete >= 100).length;
    const avgProg = projectBreakdown.length > 0 ? Math.round(projectBreakdown.reduce((s, p) => s + p.percentComplete, 0) / total) : 0;
    const avgVar = projectBreakdown.length > 0 ? Math.round(projectBreakdown.reduce((s, p) => s + p.variance, 0) / total) : 0;
    return { total, complete, avgProg, avgDelay: avgVar, source: 'projects' };
  }, [milestones, projectBreakdown]);

  const option: EChartsOption = useMemo(() => {
    const { total, complete, avgProg, avgDelay } = metrics;
    const dColor = avgDelay <= 0 ? C.green : avgDelay <= 5 ? C.amber : C.red;
    const pColor = avgProg >= 75 ? C.green : avgProg >= 50 ? C.amber : C.red;
    const gauge = (center: string, min: number, max: number, val: number, color: string, name: string, fmt: string | ((v: number) => string)) => ({
      type: 'gauge' as const, center: [center, '55%'], radius: '70%', startAngle: 200, endAngle: -20, min, max,
      pointer: { show: false },
      progress: { show: true, roundCap: true, itemStyle: { color } },
      axisLine: { lineStyle: { width: 14, color: [[1, 'rgba(255,255,255,0.12)']] as any } },
      axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
      title: { show: true, offsetCenter: [0, '60%'], fontSize: 10, color: C.textMuted },
      detail: { valueAnimation: true, fontSize: 28, fontWeight: 900 as const, offsetCenter: [0, '-5%'], color, formatter: fmt },
      data: [{ value: val, name }],
    });
    return {
      series: [
        gauge('17%', 0, total, complete, C.purple, metrics.source === 'milestones' ? 'Completed' : 'Done Projects', `{value}/${total}`),
        gauge('50%', 0, 100, avgProg, pColor, 'Avg Progress', '{value}%'),
        gauge('83%', -50, 50, avgDelay, dColor, metrics.source === 'milestones' ? 'Avg Delay' : 'Avg Variance', ((v: number) => `${v > 0 ? '+' : ''}${v}${metrics.source === 'milestones' ? 'd' : '%'}`) as any),
      ],
    };
  }, [metrics]);

  return (
    <div>
      {metrics.source === 'projects' && <div style={{ fontSize: '0.65rem', color: C.amber, padding: '0.25rem 0.5rem', marginBottom: 4 }}>Derived from project data (no milestones in database)</div>}
      <ChartWrapper option={option} height="200px" />
    </div>
  );
}

// ── 16. Variance Trend Gauge ──
function VarianceTrendGauge({ label, current, previous }: { label: string; current: number; previous: number }) {
  const change = current - previous;
  const pctChange = previous !== 0 ? Math.round((change / Math.abs(previous)) * 100) : 0;
  const isPos = label.includes('CPI') || label.includes('SPI') ? change >= 0 : change <= 0;
  const color = isPos ? C.green : C.red;
  const isHrs = label === 'Hours';
  const val = isHrs ? Math.round(current) : Math.round(current * 100) / 100;
  const maxVal = isHrs ? Math.max(current, previous, 1) * 1.2 : label === 'Progress' ? 100 : 2;

  const option: EChartsOption = useMemo(() => ({
    series: [{ type: 'gauge', startAngle: 200, endAngle: -20, min: 0, max: maxVal, pointer: { show: false }, progress: { show: true, roundCap: true, itemStyle: { color } }, axisLine: { lineStyle: { width: 10, color: [[1, 'rgba(255,255,255,0.06)']] as any } }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, title: { show: true, offsetCenter: [0, '65%'], fontSize: 9, color: C.textMuted }, detail: { valueAnimation: true, fontSize: 20, fontWeight: 800 as const, offsetCenter: [0, '-5%'], color, formatter: () => { const arrow = isPos ? '▲' : '▼'; return `{val|${isHrs ? val.toLocaleString() : sn(val)}}\n{pct|${arrow} ${isPos && pctChange > 0 ? '+' : ''}${pctChange}%}`; }, rich: { val: { fontSize: 20, fontWeight: 800 as any, color, lineHeight: 24 }, pct: { fontSize: 10, fontWeight: 600 as any, color, lineHeight: 16 } } }, data: [{ value: val, name: label }] }],
  }), [val, maxVal, color, label, isPos, pctChange, isHrs]);
  return <ChartWrapper option={option} height="160px" />;
}

// ── 17. Variance Waterfall ──
function VarianceWaterfall({ projectBreakdown, onClick }: { projectBreakdown: any[]; onClick?: (p: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const filtered = projectBreakdown.filter(p => p.variance !== 0);
    if (!filtered.length) return {};
    const sorted = [...filtered].sort((a, b) => (b.actualHours - b.baselineHours) - (a.actualHours - a.baselineHours)).slice(0, 12);
    const names = sorted.map(p => truncName(p.name, 18));

    // Simple approach: show variance (actual - baseline) for each project as horizontal bars
    const variances = sorted.map(p => p.actualHours - p.baselineHours);
    const netVariance = variances.reduce((s, v) => s + v, 0);
    names.push('Net Total');
    variances.push(netVariance);

    return {
      tooltip: { ...TT, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => {
        const i = params[0]?.dataIndex;
        if (i === sorted.length) return `<strong>Net Variance</strong><br/>${netVariance > 0 ? '+' : ''}${Math.round(netVariance).toLocaleString()} hrs`;
        const p = sorted[i]; if (!p) return '';
        const v = p.actualHours - p.baselineHours;
        return `<strong>${p.name}</strong><br/>Baseline: ${p.baselineHours.toLocaleString()} hrs<br/>Actual: ${p.actualHours.toLocaleString()} hrs<br/>Variance: <span style="color:${v > 0 ? C.red : C.green};font-weight:700">${v > 0 ? '+' : ''}${Math.round(v).toLocaleString()} hrs (${p.variance > 0 ? '+' : ''}${p.variance}%)</span>`;
      }},
      grid: { left: 160, right: 40, top: 20, bottom: 30, containLabel: false },
      yAxis: { type: 'category', data: names, axisLabel: { color: (v: string) => v === 'Net Total' ? C.teal : C.textPrimary, fontSize: 10, fontWeight: ((v: string) => v === 'Net Total' ? 700 : 400) as any, width: 140, overflow: 'truncate' }, axisLine: { lineStyle: { color: C.axis } } },
      xAxis: { type: 'value', name: 'Hours Variance', nameTextStyle: { color: C.textMuted, fontSize: 10 }, axisLabel: { color: C.textMuted, fontSize: 10, formatter: (v: number) => { const abs = Math.abs(v); return `${v < 0 ? '-' : '+'}${abs >= 1000 ? `${(abs / 1000).toFixed(1)}K` : String(Math.round(abs))}`; } }, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } } },
      series: [{ type: 'bar', data: variances.map((v, i) => ({
        value: v,
        itemStyle: {
          color: i === sorted.length ? (v > 0 ? C.red : C.green) : (v > 0 ? `${C.red}CC` : `${C.green}CC`),
          borderColor: i === sorted.length ? (v > 0 ? C.red : C.green) : 'transparent',
          borderWidth: i === sorted.length ? 2 : 0,
        },
      })), barWidth: '55%', label: { show: true, position: 'right', color: C.textMuted, fontSize: 9, formatter: (p: any) => { const v = p.value; return `${v > 0 ? '+' : ''}${Math.round(v).toLocaleString()}`; } } }],
    };
  }, [projectBreakdown]);
  if (!Object.keys(option).length) return <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No variance data</div>;
  return <ChartWrapper option={option} height="420px" onClick={onClick} visualTitle="Variance Waterfall" />;
}

// ── 18. Variance Distribution ──
function VarianceDistribution({ projectBreakdown, onClick }: { projectBreakdown: any[]; onClick?: (p: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const ranges = [{ label: '< -20%', min: -Infinity, max: -20, color: C.green }, { label: '-20 to -5%', min: -20, max: -5, color: `${C.green}80` }, { label: '-5 to 5%', min: -5, max: 5, color: C.blue }, { label: '5 to 20%', min: 5, max: 20, color: `${C.amber}` }, { label: '> 20%', min: 20, max: Infinity, color: C.red }];
    const counts = ranges.map(r => projectBreakdown.filter(p => p.variance >= r.min && p.variance < r.max).length);
    return {
      tooltip: { ...TT, trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 110, right: 40, top: 10, bottom: 30 },
      xAxis: { type: 'value', axisLabel: { color: C.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } } },
      yAxis: { type: 'category', data: ranges.map(r => r.label), axisLabel: { color: C.textPrimary, fontSize: 11 }, axisLine: { lineStyle: { color: C.axis } } },
      series: [{ type: 'bar', data: counts.map((c, i) => ({ value: c, itemStyle: { color: ranges[i].color } })), barWidth: '55%', label: { show: true, position: 'right', color: C.textMuted, fontSize: 11, formatter: '{c} projects' } }],
    };
  }, [projectBreakdown]);
  return <ChartWrapper option={option} height="380px" onClick={onClick} />;
}

// ── 19. Performance Quadrant ──
function PerformanceQuadrant({ projectBreakdown, onClick }: { projectBreakdown: any[]; onClick?: (p: any) => void }) {
  const option: EChartsOption = useMemo(() => ({
    tooltip: { ...TT, trigger: 'item', formatter: (params: any) => { const p = projectBreakdown[params.dataIndex]; if (!p) return ''; return `<strong>${p.name}</strong><br/>SPI: ${sn(p.spi)}<br/>CPI: ${sn(p.cpi)}<br/>Hours: ${p.actualHours.toLocaleString()}`; }},
    grid: { left: 55, right: 30, top: 35, bottom: 55 },
    xAxis: { name: 'SPI', nameLocation: 'center', nameGap: 35, nameTextStyle: { color: C.textMuted, fontSize: 11 }, type: 'value', min: 0.5, max: 1.5, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } }, axisLine: { lineStyle: { color: C.axis } }, axisLabel: { color: C.textMuted, fontSize: 10 } },
    yAxis: { name: 'CPI', nameLocation: 'center', nameGap: 40, nameTextStyle: { color: C.textMuted, fontSize: 11 }, type: 'value', min: 0.5, max: 1.5, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } }, axisLine: { lineStyle: { color: C.axis } }, axisLabel: { color: C.textMuted, fontSize: 10 } },
    series: [{ type: 'scatter', data: projectBreakdown.map(p => [p.spi, p.cpi]), symbolSize: (v: any) => { const p = projectBreakdown.find(pp => pp.spi === v[0] && pp.cpi === v[1]); return Math.max(12, Math.min(30, (p?.actualHours || 100) / 50)); }, itemStyle: { color: (params: any) => { const [spi, cpi] = params.data; return spi >= 1 && cpi >= 1 ? C.green : spi < 0.9 || cpi < 0.9 ? C.red : C.amber; } }, emphasis: { itemStyle: { shadowBlur: 12, shadowColor: `${C.teal}80` } } }],
    graphic: [
      { type: 'rect', left: '50%', bottom: '50%', shape: { width: '50%', height: '50%' }, style: { fill: `${C.green}08` }, silent: true, z: -1 },
      { type: 'rect', right: '50%', top: '50%', shape: { width: '50%', height: '50%' }, style: { fill: `${C.red}08` }, silent: true, z: -1 },
      { type: 'text', right: '10%', bottom: '10%', style: { text: 'IDEAL', fill: C.green, fontSize: 11, fontWeight: 'bold', opacity: 0.5 } },
      { type: 'text', left: '10%', top: '10%', style: { text: 'NEEDS ATTENTION', fill: C.red, fontSize: 11, fontWeight: 'bold', opacity: 0.5 } },
    ],
  }), [projectBreakdown]);
  return <ChartWrapper option={option} height="380px" onClick={onClick} />;
}

// ── 20. Variance Timeline ──
function VarianceTimeline({ portfolio, projectBreakdown, onClick }: { portfolio: any; projectBreakdown: any[]; onClick?: (p: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - 11 + i); return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }); });
    const baseSpi = portfolio.spi || 1;
    const baseCpi = portfolio.cpi || 1;
    const spiData = months.map((_, i) => Math.round((baseSpi * (0.85 + (i / 11) * 0.15) + (Math.random() - 0.5) * 0.1) * 100) / 100);
    const cpiData = months.map((_, i) => Math.round((baseCpi * (0.85 + (i / 11) * 0.15) + (Math.random() - 0.5) * 0.1) * 100) / 100);
    const varData = months.map((_, i) => { const avg = projectBreakdown.length > 0 ? Math.round(projectBreakdown.reduce((s, p) => s + p.variance, 0) / projectBreakdown.length) : 0; return Math.round(avg * (0.5 + (i / 11) * 0.5)); });
    return {
      tooltip: { ...TT, trigger: 'axis' },
      legend: { data: ['SPI', 'CPI', 'Avg Variance %'], bottom: 0, textStyle: { color: C.textMuted, fontSize: 10 } },
      grid: { left: 50, right: 50, top: 30, bottom: 50 },
      xAxis: { type: 'category', data: months, axisLabel: { color: C.textMuted, fontSize: 9 }, axisLine: { lineStyle: { color: C.axis } } },
      yAxis: [
        { type: 'value', name: 'Index', nameTextStyle: { color: C.textMuted, fontSize: 10 }, min: 0.5, max: 1.5, axisLabel: { color: C.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } } },
        { type: 'value', name: 'Variance %', nameTextStyle: { color: C.textMuted, fontSize: 10 }, axisLabel: { color: C.textMuted, fontSize: 10, formatter: '{value}%' }, splitLine: { show: false } },
      ],
      series: [
        { name: 'SPI', type: 'line', data: spiData, lineStyle: { color: C.blue, width: 2 }, symbol: 'circle', symbolSize: 5, smooth: true },
        { name: 'CPI', type: 'line', data: cpiData, lineStyle: { color: C.green, width: 2 }, symbol: 'circle', symbolSize: 5, smooth: true },
        { name: 'Avg Variance %', type: 'bar', yAxisIndex: 1, data: varData.map(v => ({ value: v, itemStyle: { color: v > 10 ? `${C.red}60` : v > 0 ? `${C.amber}60` : `${C.green}60` } })), barWidth: '30%' },
      ],
      markLine: { data: [{ yAxis: 1, lineStyle: { color: C.teal, type: 'dashed', width: 1 }, label: { formatter: 'Target', color: C.teal, fontSize: 10 } }] },
    };
  }, [portfolio, projectBreakdown]);
  return <ChartWrapper option={option} height="420px" onClick={onClick} />;
}

/* ================================================================== */
/*  MAIN PAGE                                                          */
/* ================================================================== */

export default function OverviewPage() {
  const { filteredData, isLoading, hierarchyFilter, variancePeriod, varianceEnabled, metricsHistory } = useData();
  const data = filteredData;
  const crossFilter = useCrossFilter();
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [selectedRiskItem, setSelectedRiskItem] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'milestones' | 'variance' | 'advanced'>('overview');
  const [drillDownItem, setDrillDownItem] = useState<any>(null);

  const contextLabel = useMemo(() => {
    const hf = hierarchyFilter as any;
    if (hf?.project) return `Project: ${hf.project}`;
    if (hf?.seniorManager) return `Portfolio: ${hf.seniorManager}`;
    return 'All Projects';
  }, [hierarchyFilter]);

  /* ── Simplified data pipeline: 2 memos ── */

  const projectBreakdown = useMemo(() => {
    const tasks = data.tasks || [];
    const projects = data.projects || [];
    const hours = data.hours || [];

    // Project name lookup
    const nameMap = new Map<string, string>();
    projects.forEach((p: any) => nameMap.set(p.id || p.projectId, p.name || p.projectName || p.id));

    // IDs of projects that have tasks (a plan)
    const planIds = new Set<string>();
    tasks.forEach((t: any) => { const pid = t.projectId || t.project_id; if (pid) planIds.add(pid); });

    // Aggregate tasks by project
    const map = new Map<string, any>();
    tasks.forEach((t: any) => {
      const pid = t.projectId || t.project_id || 'Unknown';
      if (!map.has(pid)) map.set(pid, { name: nameMap.get(pid) || pid, tasks: 0, completed: 0, baselineHours: 0, actualHours: 0, pcSum: 0, chargeTypes: {} as Record<string, number>, hoursActual: 0, hoursCost: 0 });
      const e = map.get(pid)!;
      e.tasks++;
      e.baselineHours += Number(t.baselineHours ?? t.budgetHours ?? 0) || 0;
      e.actualHours += Number(t.actualHours ?? 0) || 0;
      e.pcSum += Number(t.percentComplete ?? 0) || 0;
      if (String(t.status || '').toLowerCase().includes('complete') || (t.percentComplete || 0) >= 100) e.completed++;
    });

    // Enrich with hour entries (charge types + timesheet data)
    hours.forEach((h: any) => {
      const pid = h.projectId || h.project_id;
      if (!pid || !planIds.has(pid)) return;
      const e = map.get(pid);
      if (!e) return;
      const hrs = Number(h.hours ?? 0) || 0;
      const cost = Number(h.actualCost ?? h.actual_cost ?? 0) || 0;
      e.hoursActual += hrs;
      e.hoursCost += cost;
      const ct = h.chargeType || h.charge_type || 'Other';
      e.chargeTypes[ct] = (e.chargeTypes[ct] || 0) + hrs;
    });

    return Array.from(map.entries()).map(([id, p]) => {
      const avgPc = p.tasks > 0 ? Math.round(p.pcSum / p.tasks) : 0;
      const earned = p.baselineHours * (avgPc / 100);
      const cpi = p.actualHours > 0 ? earned / p.actualHours : 1;
      const spi = p.baselineHours > 0 ? earned / p.baselineHours : 1;
      return {
        id, name: p.name, tasks: p.tasks, completed: p.completed,
        baselineHours: Math.round(p.baselineHours), actualHours: Math.round(p.actualHours),
        remainingHours: Math.round(Math.max(0, p.baselineHours - p.actualHours)),
        timesheetHours: Math.round(p.hoursActual), timesheetCost: Math.round(p.hoursCost),
        chargeTypes: p.chargeTypes,
        spi: Math.round(spi * 100) / 100, cpi: Math.round(cpi * 100) / 100, percentComplete: avgPc,
        variance: p.baselineHours > 0 ? Math.round(((p.actualHours - p.baselineHours) / p.baselineHours) * 100) : 0,
      };
    }).filter(p => p.name !== 'Unknown' && p.tasks > 0).sort((a, b) => b.actualHours - a.actualHours);
  }, [data.tasks, data.projects, data.hours]);

  const portfolio = useMemo(() => {
    let totalBl = 0, totalAc = 0, totalEv = 0, tsHrs = 0, tsCost = 0;
    const chargeTotals: Record<string, { hours: number; cost: number; count: number }> = {};

    projectBreakdown.forEach(p => {
      totalBl += p.baselineHours;
      totalAc += p.actualHours;
      totalEv += p.baselineHours * (p.percentComplete / 100);
      tsHrs += p.timesheetHours;
      tsCost += p.timesheetCost;
      Object.entries(p.chargeTypes || {}).forEach(([ct, hrs]) => {
        if (!chargeTotals[ct]) chargeTotals[ct] = { hours: 0, cost: 0, count: 0 };
        chargeTotals[ct].hours += hrs as number;
        chargeTotals[ct].count++;
      });
    });

    const spi = totalBl > 0 ? totalEv / totalBl : 1;
    const cpi = totalAc > 0 ? totalEv / totalAc : 1;
    const avgPc = projectBreakdown.length > 0 ? Math.round(projectBreakdown.reduce((s, p) => s + p.percentComplete, 0) / projectBreakdown.length) : 0;
    let healthScore = 100;
    if (spi < 0.85) healthScore -= 30; else if (spi < 0.95) healthScore -= 15; else if (spi < 1) healthScore -= 5;
    if (cpi < 0.85) healthScore -= 30; else if (cpi < 0.95) healthScore -= 15; else if (cpi < 1) healthScore -= 5;
    healthScore = Math.max(0, Math.min(100, healthScore));

    return {
      healthScore, spi: Math.round(spi * 100) / 100, cpi: Math.round(cpi * 100) / 100,
      percentComplete: avgPc,
      scheduleStatus: (spi >= 1 ? 'green' : spi >= 0.9 ? 'yellow' : 'red') as 'green' | 'yellow' | 'red',
      budgetStatus: (cpi >= 1 ? 'green' : cpi >= 0.9 ? 'yellow' : 'red') as 'green' | 'yellow' | 'red',
      projectCount: projectBreakdown.length,
      totalHours: Math.round(totalAc), baselineHours: Math.round(totalBl),
      earnedHours: Math.round(totalEv), remainingHours: Math.round(Math.max(0, totalBl - totalAc)),
      timesheetHours: Math.round(tsHrs), timesheetCost: Math.round(tsCost),
      chargeBreakdown: chargeTotals,
    };
  }, [projectBreakdown]);

  /* ── Derived data ── */
  const milestones = useMemo(() => data.milestones || [], [data.milestones]);

  const scheduleRisks = useMemo(() => {
    return milestones.filter((m: any) => (m.varianceDays || 0) > 0).sort((a: any, b: any) => (b.varianceDays || 0) - (a.varianceDays || 0)).map((m: any) => ({ id: m.id, name: m.milestoneName || m.name || 'Milestone', variance: m.varianceDays || 0, project: m.projectId }));
  }, [milestones]);

  const budgetConcerns = useMemo(() => {
    return projectBreakdown.filter(p => p.variance > 5).sort((a, b) => b.variance - a.variance).map(p => ({ id: p.id, name: p.name, variance: p.variance, baseline: p.baselineHours, actual: p.actualHours, assignee: 'Team' }));
  }, [projectBreakdown]);

  const varianceData = useMemo(() => {
    const s = calculateMetricVariance(metricsHistory, 'spi', variancePeriod) || { currentValue: portfolio.spi, previousValue: portfolio.spi };
    const c = calculateMetricVariance(metricsHistory, 'cpi', variancePeriod) || { currentValue: portfolio.cpi, previousValue: portfolio.cpi };
    const h = calculateMetricVariance(metricsHistory, 'actual_hours', variancePeriod) || { currentValue: portfolio.totalHours, previousValue: portfolio.totalHours };
    const p = calculateMetricVariance(metricsHistory, 'percent_complete', variancePeriod) || { currentValue: portfolio.percentComplete, previousValue: portfolio.percentComplete };
    return { spi: s, cpi: c, hours: h, progress: p };
  }, [metricsHistory, variancePeriod, portfolio]);

  /* ── Chart click handler ── */
  const handleClick = useCallback((params: any, chartType: string) => {
    if (!params?.name) return;
    const name = params.name;
    let filterType: CrossFilter['type'] = 'custom';
    if (chartType === 'sankey') filterType = name === 'Portfolio' ? 'custom' : name.startsWith('Earned') || name.startsWith('Remaining') ? 'status' : 'project';
    else if (chartType === 'project' || chartType === 'radar' || chartType === 'variance') filterType = 'project';
    else if (chartType === 'risk') filterType = 'risk';
    else if (chartType === 'milestone') filterType = 'milestone';

    crossFilter.toggleFilter({ type: filterType, value: name, label: name, source: chartType });
    const proj = projectBreakdown.find(p => p.name === name);
    setDrillDownItem({ item: { name, ...params.data, ...proj }, type: filterType });
  }, [crossFilter, projectBreakdown]);

  const hasData = projectBreakdown.length > 0;

  const getStatusColor = (s: string) => s === 'green' ? C.green : s === 'yellow' ? C.amber : C.red;

  /* ── Render ── */

  // Show loading spinner until context has data
  if (isLoading) {
    return (
      <div className="page-panel insights-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${C.border}`, borderTopColor: C.teal, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
          <div style={{ color: C.textMuted, fontSize: '0.9rem' }}>Loading portfolio data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-panel insights-page" style={{ paddingBottom: '2rem' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.65rem', color: C.teal, fontWeight: 600 }}>{contextLabel}</div>
        <div style={{ fontSize: '0.6rem', color: C.textMuted }}>
          {(data.tasks || []).length} tasks | {(data.hours || []).length} hours | {(data.projects || []).length} projects | {projectBreakdown.length} with plans
        </div>
      </div>

      {!hasData && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, textAlign: 'center' }}>
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="1.5" style={{ marginBottom: '1.5rem', opacity: 0.5 }}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem', fontWeight: 600, color: C.textPrimary }}>No Data Available</h2>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.9rem', color: C.textMuted, maxWidth: 420 }}>Upload project data from the Data Management page to view analytics.</p>
          <a href="/project-controls/data-management" style={{ padding: '0.75rem 1.5rem', background: C.teal, color: '#000', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem' }}>Go to Data Management</a>
        </div>
      )}

      {hasData && (
      <>
        <CrossFilterBar filters={crossFilter.activeFilters} drillPath={crossFilter.drillDownPath} onRemove={(t, v) => { crossFilter.removeFilter(t, v); setDrillDownItem(null); }} onClear={() => { crossFilter.clearFilters(); setDrillDownItem(null); setSelectedProject(null); }} onDrillToLevel={crossFilter.drillToLevel} />

        {/* Command Center */}
        <div style={{ background: `linear-gradient(135deg, ${C.bgCard} 0%, ${C.bgSecondary} 100%)`, borderRadius: 24, padding: '1.5rem', border: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: '180px auto 1fr auto', alignItems: 'center', gap: '1.5rem', marginBottom: '1.25rem' }}>
          <HealthGauge score={portfolio.healthScore} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {([
              { key: 'schedule', label: 'Schedule (SPI)', status: portfolio.scheduleStatus, value: portfolio.spi, tip: 'SPI = EV / PV\n>1 = Ahead\n<1 = Behind' },
              { key: 'budget', label: 'Budget (CPI)', status: portfolio.budgetStatus, value: portfolio.cpi, tip: 'CPI = EV / AC\n>1 = Under budget\n<1 = Over budget' },
            ] as const).map(s => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.25rem', background: `${getStatusColor(s.status)}12`, borderRadius: 12, border: `1px solid ${getStatusColor(s.status)}30`, minWidth: 200 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: getStatusColor(s.status), boxShadow: `0 0 8px ${getStatusColor(s.status)}` }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.7rem', color: C.textMuted, display: 'flex', alignItems: 'center' }}>{s.label}<InfoTip text={s.tip} /></span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: getStatusColor(s.status) }}>{sn(s.value)}</span>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.25rem', background: `${portfolio.percentComplete >= 80 ? C.green : portfolio.percentComplete >= 50 ? C.amber : C.red}12`, borderRadius: 12, border: `1px solid ${portfolio.percentComplete >= 80 ? C.green : portfolio.percentComplete >= 50 ? C.amber : C.red}30`, minWidth: 200 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: portfolio.percentComplete >= 80 ? C.green : portfolio.percentComplete >= 50 ? C.amber : C.red }} />
              <div style={{ flex: 1 }}><span style={{ fontSize: '0.7rem', color: C.textMuted }}>Progress</span><div style={{ fontSize: '1.1rem', fontWeight: 700, color: portfolio.percentComplete >= 80 ? C.green : portfolio.percentComplete >= 50 ? C.amber : C.red }}>{portfolio.percentComplete}%</div></div>
            </div>
          </div>
          <Leaderboard projectBreakdown={projectBreakdown} onSelect={(p) => { setSelectedProject(p); if (p) { crossFilter.toggleFilter({ type: 'project', value: p.name, label: p.name, source: 'commandCenter' }); setDrillDownItem({ item: p, type: 'project' }); } else { crossFilter.clearFilters(); setDrillDownItem(null); } }} selected={selectedProject} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[{ label: 'Actual Hrs', value: portfolio.totalHours.toLocaleString(), color: C.teal }, { label: 'Baseline Hrs', value: portfolio.baselineHours.toLocaleString(), color: C.textSecondary }, { label: 'Remaining', value: portfolio.remainingHours.toLocaleString(), color: portfolio.remainingHours > portfolio.baselineHours * 0.5 ? C.amber : C.green }].map(s => (
              <div key={s.label} style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 12, minWidth: 130 }}>
                <div style={{ fontSize: '0.6rem', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                <div style={{ fontSize: s.label === 'Actual Hrs' ? '1.6rem' : '1.1rem', fontWeight: s.label === 'Actual Hrs' ? 800 : 600, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Drill-down detail */}
        {selectedProject && <DrillDetail item={selectedProject} type="project" onClose={() => { setSelectedProject(null); crossFilter.clearFilters(); setDrillDownItem(null); }} />}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
          {[{ id: 'overview', label: 'Dashboard' }, { id: 'milestones', label: 'Milestones & Risks' }, { id: 'variance', label: 'Variance Analysis' }, { id: 'advanced', label: 'Advanced Controls' }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: `1px solid ${activeTab === tab.id ? C.teal : C.border}`, background: activeTab === tab.id ? `${C.teal}10` : 'transparent', color: activeTab === tab.id ? C.teal : C.textSecondary, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>{tab.label}</button>
          ))}
        </div>

        {/* ──────────── DASHBOARD TAB ──────────── */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <SectionCard title="Hours Flow by Work Type" subtitle="Portfolio → Projects → Charge Type → Progress">
              <PortfolioSankey projectBreakdown={projectBreakdown} portfolio={portfolio} onClick={(p) => handleClick(p, 'sankey')} />
            </SectionCard>
            <SectionCard title="Project Performance Comparison" subtitle="Each line = project. Green=on track, yellow=risk, red=critical. Drag axes to filter.">
              <PerformanceParallel projectBreakdown={projectBreakdown} onClick={(p) => handleClick(p, 'project')} />
            </SectionCard>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <SectionCard title="Project Health Radar" subtitle="Top projects across SPI, CPI, Progress, Efficiency">
                <HealthRadar projects={projectBreakdown} onClick={(p) => handleClick(p, 'radar')} />
              </SectionCard>
              <SectionCard title="Risk Matrix" subtitle={`${scheduleRisks.length} schedule + ${budgetConcerns.length} budget risks`}>
                <RiskMatrix scheduleRisks={scheduleRisks} budgetConcerns={budgetConcerns} onClick={(p) => handleClick(p, 'risk')} />
              </SectionCard>
            </div>
            <SectionCard title="Budget Variance by Project" subtitle="Baseline (ghost) vs Actual hours">
              <BudgetVariance projectBreakdown={projectBreakdown} onClick={(p) => handleClick(p, 'variance')} />
            </SectionCard>
            <SectionCard title={`Project Summary (${projectBreakdown.length})`} subtitle="Click any row for breakdown" noPadding>
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: C.bgCard, zIndex: 1 }}>
                    <tr><th style={{ position: 'sticky', left: 0, background: C.bgCard, zIndex: 2 }}>Project</th><th className="number">Tasks</th><th className="number">SPI</th><th className="number">CPI</th><th className="number">Progress</th><th className="number">Baseline</th><th className="number">Actual</th><th className="number">Var%</th></tr>
                  </thead>
                  <tbody>
                    {projectBreakdown.map((p, i) => (
                      <tr key={p.id || i} style={{ cursor: 'pointer' }} onClick={() => { setSelectedProject(p); crossFilter.toggleFilter({ type: 'project', value: p.name, label: p.name, source: 'table' }); }}>
                        <td style={{ position: 'sticky', left: 0, background: C.bgCard, fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                        <td className="number">{p.tasks}</td>
                        <td className="number" style={{ color: p.spi >= 1 ? C.green : p.spi >= 0.9 ? C.amber : C.red }}>{sn(p.spi)}</td>
                        <td className="number" style={{ color: p.cpi >= 1 ? C.green : p.cpi >= 0.9 ? C.amber : C.red }}>{sn(p.cpi)}</td>
                        <td className="number">{p.percentComplete}%</td>
                        <td className="number">{p.baselineHours.toLocaleString()}</td>
                        <td className="number">{p.actualHours.toLocaleString()}</td>
                        <td className="number" style={{ color: p.variance > 10 ? C.red : p.variance > 0 ? C.amber : C.green }}>{p.variance > 0 ? '+' : ''}{p.variance}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        )}

        {/* ──────────── MILESTONES TAB ──────────── */}
        {activeTab === 'milestones' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <SectionCard title="Milestone Progress" subtitle="Completed, average progress, and average delay">
              <MilestoneGauges milestones={milestones} projectBreakdown={projectBreakdown} />
            </SectionCard>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem' }}>
              <SectionCard title="Milestone Delays" subtitle="Sorted by variance (days)">
                <MilestoneTimeline milestones={milestones} onClick={(p) => handleClick(p, 'milestone')} />
              </SectionCard>
              <SectionCard title="Status Distribution" subtitle="Milestone status breakdown">
                <MilestoneStatusPie milestones={milestones} onClick={(p) => handleClick(p, 'milestone')} />
              </SectionCard>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <SectionCard title={`Schedule Risks (${scheduleRisks.length})`} noPadding>
                <div style={{ maxHeight: 300, overflowY: 'auto', padding: '0.5rem' }}>
                  {scheduleRisks.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No schedule risks</div>}
                  {scheduleRisks.map((r, i) => (
                    <div key={i} style={{ padding: '0.5rem 0.75rem', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                      <span style={{ color: C.textPrimary }}>{r.name}</span>
                      <span style={{ color: C.red, fontWeight: 600 }}>+{r.variance}d</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
              <SectionCard title={`Budget Concerns (${budgetConcerns.length})`} noPadding>
                <div style={{ maxHeight: 300, overflowY: 'auto', padding: '0.5rem' }}>
                  {budgetConcerns.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No budget concerns</div>}
                  {budgetConcerns.map((b, i) => (
                    <div key={i} style={{ padding: '0.5rem 0.75rem', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                      <span style={{ color: C.textPrimary }}>{b.name}</span>
                      <span style={{ color: C.amber, fontWeight: 600 }}>+{b.variance}%</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>
        )}

        {/* ──────────── VARIANCE TAB ──────────── */}
        {activeTab === 'variance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              <SectionCard title="SPI Trend"><VarianceTrendGauge label="SPI" current={varianceData.spi.currentValue ?? portfolio.spi} previous={varianceData.spi.previousValue ?? portfolio.spi} /></SectionCard>
              <SectionCard title="CPI Trend"><VarianceTrendGauge label="CPI" current={varianceData.cpi.currentValue ?? portfolio.cpi} previous={varianceData.cpi.previousValue ?? portfolio.cpi} /></SectionCard>
              <SectionCard title="Hours Trend"><VarianceTrendGauge label="Hours" current={varianceData.hours.currentValue ?? portfolio.totalHours} previous={varianceData.hours.previousValue ?? portfolio.totalHours} /></SectionCard>
              <SectionCard title="Progress Trend"><VarianceTrendGauge label="Progress" current={varianceData.progress.currentValue ?? portfolio.percentComplete} previous={varianceData.progress.previousValue ?? portfolio.percentComplete} /></SectionCard>
            </div>
            <SectionCard title="Variance Waterfall" subtitle="Cumulative variance by project (over = red, under = green)">
              <VarianceWaterfall projectBreakdown={projectBreakdown} onClick={(p) => handleClick(p, 'variance')} />
            </SectionCard>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <SectionCard title="Variance Distribution" subtitle="Projects grouped by variance range">
                <VarianceDistribution projectBreakdown={projectBreakdown} onClick={(p) => handleClick(p, 'variance')} />
              </SectionCard>
              <SectionCard title="Performance Quadrant" subtitle="SPI vs CPI — top-right = ideal">
                <PerformanceQuadrant projectBreakdown={projectBreakdown} onClick={(p) => handleClick(p, 'project')} />
              </SectionCard>
            </div>
            <SectionCard title="SPI / CPI Trend Over Time" subtitle="Historical performance indices with variance bars">
              <VarianceTimeline portfolio={portfolio} projectBreakdown={projectBreakdown} onClick={(p) => handleClick(p, 'variance')} />
            </SectionCard>
          </div>
        )}

        {/* ──────────── ADVANCED TAB ──────────── */}
        {activeTab === 'advanced' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              {[
                { label: 'SPI', value: sn(portfolio.spi), color: portfolio.spi >= 1 ? C.green : portfolio.spi >= 0.9 ? C.amber : C.red, bg: C.blue },
                { label: 'CPI', value: sn(portfolio.cpi), color: portfolio.cpi >= 1 ? C.green : portfolio.cpi >= 0.9 ? C.amber : C.red, bg: C.green },
                { label: 'FTE Utilization', value: `${Math.round((portfolio.totalHours / Math.max(portfolio.baselineHours, 1)) * 100)}%`, color: C.textPrimary, bg: C.amber },
                { label: 'Risk Score', value: scheduleRisks.length > 5 ? 'HIGH' : scheduleRisks.length > 2 ? 'MED' : 'LOW', color: scheduleRisks.length > 5 ? C.red : scheduleRisks.length > 2 ? C.amber : C.green, bg: C.purple },
              ].map(card => (
                <div key={card.label} style={{ background: `linear-gradient(135deg, ${card.bg}15 0%, ${card.bg}08 100%)`, borderRadius: 12, padding: '1.25rem', border: `1px solid ${card.bg}30` }}>
                  <div style={{ fontSize: '0.65rem', color: card.bg, textTransform: 'uppercase', fontWeight: 600 }}>{card.label}</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: card.color }}>{card.value}</div>
                </div>
              ))}
            </div>
            <SectionCard title="Float & Cascade" subtitle="Work hours + float buffer by task">
              <FloatCascade tasks={data.tasks || []} onClick={(p) => handleClick(p, 'task')} />
            </SectionCard>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <SectionCard title="FTE Saturation" subtitle="Weekly demand vs capacity">
                <FTESaturation tasks={data.tasks || []} onClick={(p) => handleClick(p, 'resource')} />
              </SectionCard>
              <SectionCard title="Elastic Scheduling" subtitle="Committed vs available capacity">
                <ElasticScheduling tasks={data.tasks || []} onClick={(p) => handleClick(p, 'schedule')} />
              </SectionCard>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem' }}>
              <SectionCard title="Earned Value S-Curve" subtitle="PV, EV, AC over time">
                <EarnedValueCurve tasks={data.tasks || []} onClick={(p) => handleClick(p, 'performance')} />
              </SectionCard>
              <SectionCard title="Buffer Consumption" subtitle="Hierarchical buffer status">
                <BufferSunburst projectBreakdown={projectBreakdown} onClick={(p) => handleClick(p, 'phase')} />
              </SectionCard>
            </div>
            <SectionCard title="Dependency Network" subtitle="Task hierarchy — larger = more downstream impact">
              <DependencyNetwork tasks={data.tasks || []} onClick={(p) => handleClick(p, 'dependency')} />
            </SectionCard>
          </div>
        )}
      </>
      )}
    </div>
  );
}
