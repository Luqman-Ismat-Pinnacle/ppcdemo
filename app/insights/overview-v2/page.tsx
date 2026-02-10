'use client';

/**
 * Overview v2 — Executive Meeting Command Center
 *
 * Narrative-driven meeting experience with freeze/compare snapshots.
 *
 * Phases:
 *  1. Pulse Header — Tri-Gauge with weekly deltas + Blocker Pulse ticker
 *  2. Operational Friction — Heat-Link Sankey with pulsing red EX:QC links
 *  3. Finish Line — Site-Compliance Sunburst (drill-down filters whole page) + Predictive Burn with confidence shadow
 *  4. Meeting Snapshot & Delta — Freeze/compare (Baseline Review, Weekly Catch-up, QC Recovery)
 *  5. Splash Zone — Dependency Impact Graph with downstream "splash" + Predictive accountability
 *  6. Controls — Asset/Site toggle, Role Heatmap, Meeting Snapshot export
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';
import useCrossFilter, { type CrossFilter } from '@/lib/hooks/useCrossFilter';
import {
  calculateMetricVariance,
  getComparisonDates,
  getMetricsForPeriod,
  getPeriodDisplayName,
  type MetricsHistory,
  type VariancePeriod,
} from '@/lib/variance-engine';

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

const CHARGE_LABELS: Record<string, string> = {
  EX: 'Execution', QC: 'Quality Control', CR: 'Customer Relations',
  SC: 'Supervision', Other: 'Other',
};
const CHARGE_COLORS: Record<string, string> = {
  EX: C.blue, QC: C.purple, CR: C.amber, SC: C.cyan, Other: '#6B7280',
};

const sn = (v: any, d = 2): string => { const n = Number(v); return isFinite(n) ? n.toFixed(d) : '0'; };
const truncName = (s: string, max = 25) => s.length > max ? s.slice(0, max) + '...' : s;
const fmtHrs = (h: number) => h >= 1000 ? `${(h / 1000).toFixed(1)}K` : h.toLocaleString();

const TT = {
  backgroundColor: 'rgba(15,15,18,0.96)', borderColor: C.border, borderWidth: 1,
  padding: [10, 15] as [number, number], textStyle: { color: '#fff', fontSize: 12 },
  confine: false, appendToBody: true,
  extraCssText: 'z-index:99999!important;backdrop-filter:blur(20px);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.45);',
};

/* ================================================================== */
/*  HELPER UI                                                          */
/* ================================================================== */

function SectionCard({ title, subtitle, badge, children, noPadding = false, actions }: {
  title: string; subtitle?: string; badge?: React.ReactNode;
  children: React.ReactNode; noPadding?: boolean; actions?: React.ReactNode;
}) {
  return (
    <div style={{ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0.875rem 1rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: C.textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>{title}{badge}</h3>
          {subtitle && <span style={{ fontSize: '0.65rem', color: C.textMuted }}>{subtitle}</span>}
        </div>
        {actions}
      </div>
      <div style={{ padding: noPadding ? 0 : '1rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>
    </div>
  );
}

function PhaseBadge({ n, label }: { n: number; label: string }) {
  return <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: `${C.teal}18`, color: C.teal, letterSpacing: 0.5, textTransform: 'uppercase', marginLeft: 4 }}>Phase {n}: {label}</span>;
}

/* ================================================================== */
/*  PHASE 1 — TRI-GAUGE PULSE + BLOCKER TICKER                        */
/* ================================================================== */

function TriGaugePulse({ healthScore, spi, cpi, spiDelta, cpiDelta, healthDelta, periodLabel }: {
  healthScore: number; spi: number; cpi: number;
  spiDelta: number; cpiDelta: number; healthDelta: number; periodLabel: string;
}) {
  const option: EChartsOption = useMemo(() => {
    const healthColor = healthScore >= 80 ? C.green : healthScore >= 60 ? C.amber : C.red;
    const spiColor = spi >= 1 ? C.green : spi >= 0.9 ? C.amber : C.red;
    const cpiColor = cpi >= 1 ? C.green : cpi >= 0.9 ? C.amber : C.red;

    const mkGauge = (center: [string, string], radius: string, min: number, max: number, val: number, color: string, label: string, delta: number, fontSize: number, isIndex = false): any => {
      const arrow = delta >= 0 ? '▲' : '▼';
      const deltaColor = delta >= 0 ? C.green : C.red;
      const deltaStr = isIndex ? `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}` : `${delta >= 0 ? '+' : ''}${Math.round(delta)}`;
      return {
        type: 'gauge', center, radius, startAngle: 220, endAngle: -40, min, max,
        pointer: { show: false },
        progress: { show: true, roundCap: true, itemStyle: { color }, width: isIndex ? 10 : 16 },
        axisLine: { lineStyle: { width: isIndex ? 10 : 16, color: [[1, 'rgba(255,255,255,0.06)']] } },
        axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        title: { show: true, offsetCenter: [0, '62%'], fontSize: isIndex ? 10 : 12, color: C.textMuted, fontWeight: 600 },
        detail: {
          valueAnimation: true, fontSize, fontWeight: 900,
          offsetCenter: [0, isIndex ? '-5%' : '-10%'], color,
          formatter: () => `{val|${isIndex ? sn(val) : String(Math.round(val))}}\n{delta|${arrow} ${deltaStr} ${periodLabel}}`,
          rich: {
            val: { fontSize, fontWeight: 900, color, lineHeight: fontSize + 6 },
            delta: { fontSize: isIndex ? 9 : 10, fontWeight: 700, color: deltaColor, lineHeight: 14 },
          },
        },
        data: [{ value: val, name: label }],
      };
    };

    return {
      series: [
        mkGauge(['50%', '52%'], '85%', 0, 100, healthScore, healthColor, 'PORTFOLIO HEALTH', healthDelta, 42),
        mkGauge(['18%', '56%'], '52%', 0, 2, spi, spiColor, 'SPI', spiDelta, 22, true),
        mkGauge(['82%', '56%'], '52%', 0, 2, cpi, cpiColor, 'CPI', cpiDelta, 22, true),
      ],
    };
  }, [healthScore, spi, cpi, spiDelta, cpiDelta, healthDelta, periodLabel]);

  return <ChartWrapper option={option} height="260px" />;
}

/** Blocker Pulse — Critical Decisions ticker */
function BlockerPulse({ tasks }: { tasks: any[] }) {
  const stats = useMemo(() => {
    const blocked = tasks.filter((t: any) => {
      const s = String(t.status || '').toLowerCase();
      return s.includes('block') || s.includes('hold') || s === 'blocked' || s === 'on hold';
    });
    const atRisk = tasks.filter((t: any) => {
      const pc = Number(t.percentComplete || 0);
      const bl = Number(t.baselineHours || 0);
      const ac = Number(t.actualHours || 0);
      const overBudget = bl > 0 && ac > bl * 1.2;
      const spiLow = bl > 0 && pc < 50 && ac > bl * 0.7;
      const s = String(t.status || '').toLowerCase();
      return s.includes('risk') || s.includes('late') || s.includes('delay') || overBudget || spiLow;
    });
    const critical = tasks.filter((t: any) => t.isCritical === true || t.isCritical === 'true' || (t.totalFloat != null && Number(t.totalFloat) <= 0));
    const stalled = tasks.filter((t: any) => {
      const pc = Number(t.percentComplete || 0);
      return pc > 0 && pc < 100 && Number(t.actualHours || 0) === 0;
    });
    return { blocked: blocked.length, atRisk: atRisk.length, critical: critical.length, stalled: stalled.length, total: blocked.length + atRisk.length };
  }, [tasks]);

  const items = [
    { label: 'Blocked', count: stats.blocked, color: C.red, icon: '⛔' },
    { label: 'At Risk', count: stats.atRisk, color: C.amber, icon: '⚠' },
    { label: 'Critical Path', count: stats.critical, color: C.teal, icon: '◆' },
    { label: 'Stalled', count: stats.stalled, color: C.purple, icon: '⏸' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div style={{ fontSize: '0.6rem', fontWeight: 700, color: stats.total > 0 ? C.red : C.green, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
        {stats.total > 0 ? `${stats.total} Critical Decisions Required` : 'No Blockers'}
      </div>
      {items.map(item => (
        <div key={item.label} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0.4rem 0.6rem', borderRadius: 8,
          background: item.count > 0 ? `${item.color}12` : 'rgba(255,255,255,0.02)',
          border: `1px solid ${item.count > 0 ? `${item.color}30` : 'transparent'}`,
        }}>
          <span style={{ fontSize: '0.8rem' }}>{item.icon}</span>
          <span style={{ flex: 1, fontSize: '0.7rem', color: C.textMuted }}>{item.label}</span>
          <span style={{ fontSize: '1rem', fontWeight: 800, color: item.count > 0 ? item.color : C.textMuted }}>{item.count}</span>
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  PHASE 2 — HEAT-LINK SANKEY (with CSS pulse animation)              */
/* ================================================================== */

function HeatLinkSankey({ projectBreakdown, portfolio, onClick }: {
  projectBreakdown: any[]; portfolio: any; onClick?: (p: any) => void;
}) {
  const option: EChartsOption = useMemo(() => {
    if (!projectBreakdown.length) return {};
    const nodes: any[] = [];
    const links: any[] = [];
    const added = new Set<string>();
    const add = (name: string, color: string) => { if (!added.has(name)) { nodes.push({ name, itemStyle: { color, borderWidth: 0 } }); added.add(name); } };
    const exQcRatios = new Map<string, number>();

    add('Portfolio', C.teal);
    projectBreakdown.forEach(p => {
      const nm = truncName(p.name, 28);
      const clr = p.spi >= 1 && p.cpi >= 1 ? C.green : p.spi >= 0.9 && p.cpi >= 0.9 ? C.amber : C.red;
      add(nm, clr);
      const projTotal = Math.max(p.actualHours, p.timesheetHours, 1);
      links.push({ source: 'Portfolio', target: nm, value: projTotal });

      const ct = p.chargeTypes || {};
      const ctRaw = Object.values(ct).reduce((s: number, v: any) => s + (Number(v) || 0), 0) || 1;
      const scale = projTotal / ctRaw;
      const exHrs = (Number(ct['EX']) || 0) * scale;
      const qcHrs = (Number(ct['QC']) || 0) * scale;
      exQcRatios.set(nm, qcHrs > 0 ? exHrs / qcHrs : exHrs > 0 ? 999 : 0);

      Object.entries(ct).forEach(([type, hrs]) => {
        const scaled = Math.round((hrs as number) * scale);
        if (scaled > 0) {
          const label = CHARGE_LABELS[type] || type;
          add(label, CHARGE_COLORS[type] || '#6B7280');
          links.push({ source: nm, target: label, value: scaled });
        }
      });
      if (Object.keys(ct).length === 0) { add('Unclassified', '#6B7280'); links.push({ source: nm, target: 'Unclassified', value: projTotal }); }
    });

    add('Earned Value', C.green);
    add('Remaining Work', C.orange);
    Object.keys(CHARGE_LABELS).forEach(type => {
      const label = CHARGE_LABELS[type];
      if (added.has(label)) {
        const typeTotal = links.filter(l => l.target === label).reduce((s, l) => s + l.value, 0);
        if (typeTotal > 0) {
          const e = Math.round(typeTotal * (portfolio.percentComplete / 100));
          const r = typeTotal - e;
          if (e > 0) links.push({ source: label, target: 'Earned Value', value: e });
          if (r > 0) links.push({ source: label, target: 'Remaining Work', value: r });
        }
      }
    });

    const nodeNames = new Set(nodes.map(n => n.name));
    const validLinks = links.filter(l => l.value > 0 && nodeNames.has(l.source) && nodeNames.has(l.target));
    if (validLinks.length === 0) return {};
    const totalHours = projectBreakdown.reduce((s, p) => s + Math.max(p.actualHours, p.timesheetHours), 0) || 1;

    // High EX:QC ratio links get pulsing red glow
    validLinks.forEach(link => {
      const ratio = exQcRatios.get(link.target) || exQcRatios.get(link.source) || 0;
      if (ratio > 10 && link.source === 'Portfolio') {
        link.lineStyle = { color: C.red, opacity: 0.7, shadowBlur: 18, shadowColor: C.red };
      }
    });

    return {
      tooltip: { ...TT, trigger: 'item', formatter: (params: any) => {
        if (params.dataType === 'edge') {
          const pct = sn((params.data.value / totalHours) * 100, 1);
          const srcRatio = exQcRatios.get(params.data.source);
          const ratioLine = srcRatio != null && srcRatio > 0
            ? `<br/>EX:QC Ratio: <strong style="color:${srcRatio > 10 ? C.red : srcRatio > 5 ? C.amber : C.green}">${sn(srcRatio, 1)}:1</strong>${srcRatio > 10 ? ' <span style="color:' + C.red + '">⚠ QUALITY RISK — Not enough QC to clear reports</span>' : ''}`
            : '';
          return `<strong>${params.data.source}</strong> → <strong>${params.data.target}</strong><br/>Hours: <strong>${Math.round(params.data.value).toLocaleString()}</strong><br/>Share: ${pct}%${ratioLine}`;
        }
        const ratio = exQcRatios.get(params.name);
        return `<strong>${params.name}</strong>${ratio && ratio > 0 ? '<br/>EX:QC: <strong>' + sn(ratio, 1) + ':1</strong>' : ''}<br/>Click to filter`;
      }},
      series: [{
        type: 'sankey', emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.85 } },
        nodeAlign: 'justify', nodeWidth: 26, nodeGap: 16, layoutIterations: 64,
        orient: 'horizontal', left: 50, right: 180, top: 20, bottom: 20,
        label: { color: C.textPrimary, fontSize: 11.5, fontWeight: 600, formatter: (p: any) => {
          const ratio = exQcRatios.get(p.name);
          return truncName(p.name, 28) + (ratio != null && ratio > 10 ? ' ⚠' : '');
        }},
        lineStyle: { color: 'gradient', curveness: 0.45, opacity: 0.38 },
        data: nodes, links: validLinks,
      }],
    };
  }, [projectBreakdown, portfolio]);

  const totalHours = projectBreakdown.reduce((s, p) => s + Math.max(p.actualHours, p.timesheetHours), 0);
  const totalEX = projectBreakdown.reduce((s, p) => s + (Number(p.chargeTypes?.EX) || 0), 0);
  const totalQC = projectBreakdown.reduce((s, p) => s + (Number(p.chargeTypes?.QC) || 0), 0);
  const portfolioRatio = totalQC > 0 ? totalEX / totalQC : 0;

  if (!projectBreakdown.length) return <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No data</div>;
  return (
    <div>
      <style>{`@keyframes pulseGlow { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }`}</style>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center', fontSize: '0.7rem' }}>
        <span style={{ color: C.textMuted }}>{fmtHrs(totalHours)} hrs | {projectBreakdown.length} projects</span>
        <span style={{
          marginLeft: 'auto', padding: '2px 8px', borderRadius: 6,
          background: portfolioRatio > 10 ? `${C.red}20` : portfolioRatio > 5 ? `${C.amber}20` : `${C.green}20`,
          color: portfolioRatio > 10 ? C.red : portfolioRatio > 5 ? C.amber : C.green, fontWeight: 700,
          animation: portfolioRatio > 10 ? 'pulseGlow 2s ease-in-out infinite' : 'none',
        }}>
          EX:QC {sn(portfolioRatio, 1)}:1 {portfolioRatio > 10 && '— QUALITY CRISIS'}
        </span>
      </div>
      <ChartWrapper option={option} height="520px" onClick={onClick} isEmpty={!Object.keys(option).length} visualTitle="Heat-Link Sankey" />
    </div>
  );
}

/* ================================================================== */
/*  PHASE 3A — SITE-COMPLIANCE SUNBURST                                */
/* ================================================================== */

function SiteComplianceSunburst({ data, projectBreakdown, onHierarchyClick }: {
  data: any; projectBreakdown: any[]; onHierarchyClick?: (filter: { path: string[] }) => void;
}) {
  const option: EChartsOption = useMemo(() => {
    const customers = data.customers || [];
    const sites = data.sites || [];
    const projects = data.projects || [];
    const deliverables = data.deliverables || [];
    const projMap = new Map<string, any>();
    projectBreakdown.forEach(p => projMap.set(p.id, p));
    const siteMap = new Map<string, any>();
    sites.forEach((s: any) => siteMap.set(s.id || s.siteId, s));
    const customerMap = new Map<string, any>();
    customers.forEach((c: any) => customerMap.set(c.id || c.customerId, c));

    // Deliverable status counts by project
    const delivCountByProj = new Map<string, { total: number; approved: number }>();
    deliverables.forEach((d: any) => {
      const pid = d.projectId || d.project_id;
      if (!pid) return;
      if (!delivCountByProj.has(pid)) delivCountByProj.set(pid, { total: 0, approved: 0 });
      const dc = delivCountByProj.get(pid)!;
      dc.total++;
      const st = String(d.status || '').toLowerCase();
      if (st.includes('approved') || st.includes('complete') || st.includes('signed')) dc.approved++;
    });

    const custGroups = new Map<string, Map<string, any[]>>();
    projects.forEach((proj: any) => {
      const siteId = proj.siteId || proj.site_id;
      const site = siteMap.get(siteId);
      const custId = site?.customerId || site?.customer_id || proj.customerId || proj.customer_id;
      const custName = customerMap.get(custId)?.name || 'Unknown Client';
      const siteName = site?.name || 'Unknown Site';
      if (!custGroups.has(custName)) custGroups.set(custName, new Map());
      const sg = custGroups.get(custName)!;
      if (!sg.has(siteName)) sg.set(siteName, []);
      sg.get(siteName)!.push(proj);
    });

    const tree: any[] = [];
    custGroups.forEach((siteGroup, custName) => {
      const custChildren: any[] = [];
      siteGroup.forEach((projs, siteName) => {
        const siteChildren = projs.slice(0, 10).map((proj: any) => {
          const pb = projMap.get(proj.id || proj.projectId);
          const pc = pb?.percentComplete || 0;
          const dc = delivCountByProj.get(proj.id || proj.projectId);
          const delivPct = dc && dc.total > 0 ? Math.round((dc.approved / dc.total) * 100) : -1;
          const clr = pc >= 80 ? C.green : pc >= 50 ? C.amber : C.red;
          const nm = truncName(proj.name || proj.projectName || 'Project', 18);
          return {
            name: delivPct >= 0 ? `${nm} (${delivPct}% docs)` : nm,
            value: Math.max(1, pb?.actualHours || 1),
            itemStyle: { color: clr },
            projectName: nm,
          };
        });
        if (siteChildren.length > 0) {
          custChildren.push({ name: truncName(siteName, 20), itemStyle: { color: C.blue }, children: siteChildren, siteName });
        }
      });
      if (custChildren.length > 0) {
        tree.push({ name: truncName(custName, 20), itemStyle: { color: C.teal }, children: custChildren, custName });
      }
    });

    if (tree.length === 0) {
      return {
        series: [{ type: 'sunburst', data: [{ name: 'Portfolio', itemStyle: { color: C.teal }, children: projectBreakdown.slice(0, 12).map(p => ({ name: truncName(p.name, 18), value: Math.max(1, p.actualHours), itemStyle: { color: p.percentComplete >= 80 ? C.green : p.percentComplete >= 50 ? C.amber : C.red } })) }], radius: ['12%', '90%'], label: { color: C.textPrimary, fontSize: 9, rotate: 'radial' }, itemStyle: { borderWidth: 2, borderColor: C.bgCard }, emphasis: { focus: 'ancestor', itemStyle: { shadowBlur: 10, shadowColor: `${C.teal}40` } } }],
        tooltip: { ...TT, trigger: 'item', formatter: (p: any) => `<strong>${p.name}</strong><br/>Hours: ${p.value?.toLocaleString()}` },
      };
    }

    return {
      tooltip: { ...TT, trigger: 'item', formatter: (p: any) => {
        const depth = p.treePathInfo?.length || 0;
        const levelName = depth <= 2 ? 'Client' : depth <= 3 ? 'Site/Refinery' : 'Project';
        return `<strong>${p.name}</strong><br/>Hours: ${(p.value || 0).toLocaleString()}<br/>Level: ${levelName}<br/><span style="color:${C.teal}">Click to filter entire dashboard by this ${levelName.toLowerCase()}</span>`;
      }},
      series: [{ type: 'sunburst', data: tree, radius: ['12%', '90%'], label: { color: C.textPrimary, fontSize: 9, rotate: 'radial' }, itemStyle: { borderWidth: 2, borderColor: C.bgCard }, emphasis: { focus: 'ancestor', itemStyle: { shadowBlur: 12, shadowColor: `${C.teal}50` } },
        levels: [{}, { r0: '12%', r: '35%', label: { fontSize: 10, fontWeight: 700 } }, { r0: '35%', r: '62%', label: { fontSize: 9 } }, { r0: '62%', r: '90%', label: { fontSize: 8 } }],
      }],
    };
  }, [data.customers, data.sites, data.projects, data.deliverables, projectBreakdown]);

  return <ChartWrapper option={option} height="440px" onClick={(params: any) => {
    if (params?.treePathInfo && params.treePathInfo.length >= 2) {
      const info = params.treePathInfo;
      // Build a proper hierarchy filter path: [portfolio, customer, site, project]
      const path: string[] = [];
      // info[0] = root (empty), info[1] = customer, info[2] = site, info[3] = project
      if (info[1]?.name) path.push(info[1].name); // customer in path[0] (used as path[1] in filter)
      if (info[2]?.name) path.push(info[2].name);
      if (info[3]?.name) path.push(info[3].name);
      // The filter expects: path[0]=portfolio, path[1]=customer, path[2]=site, path[3]=project
      onHierarchyClick?.({ path: [undefined as any, ...path].filter(Boolean) });
    }
  }} />;
}

/* ================================================================== */
/*  PHASE 3B — PREDICTIVE BURN WITH CONFIDENCE SHADOW                  */
/* ================================================================== */

function PredictiveBurn({ portfolio }: { portfolio: any }) {
  const option: EChartsOption = useMemo(() => {
    const months = Array.from({ length: 18 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - 11 + i); return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }); });
    const totalBl = portfolio.baselineHours || 1;
    const totalAc = portfolio.totalHours || 0;
    const cpi = portfolio.cpi || 1;
    const todayIdx = 11;

    const baseline = months.map((_, i) => Math.round(totalBl * Math.min(1, (i + 1) / 16)));
    const actual: (number | null)[] = months.map((_, i) => i > todayIdx ? null : Math.round(totalAc * ((i + 1) / (todayIdx + 1))));

    const projectedFinish = cpi > 0 ? Math.round(totalBl / cpi) : totalBl * 1.5;
    const projected: (number | null)[] = months.map((_, i) => {
      if (i < todayIdx) return null;
      const remaining = projectedFinish - totalAc;
      return Math.round(totalAc + remaining * Math.min(1, (i - todayIdx) / Math.max(1, 17 - todayIdx)));
    });

    // Confidence shadow: +/- 15% around projection
    const confUpper: (number | null)[] = months.map((_, i) => {
      if (i < todayIdx) return null;
      const base = projected[i];
      return base != null ? Math.round(base * 1.15) : null;
    });
    const confLower: (number | null)[] = months.map((_, i) => {
      if (i < todayIdx) return null;
      const base = projected[i];
      return base != null ? Math.round(base * 0.85) : null;
    });

    const overBudget = projectedFinish > totalBl;
    const margin = totalBl > 0 ? Math.round(((totalBl - projectedFinish) / totalBl) * 100) : 0;
    const estFinishMonth = months[Math.min(17, todayIdx + Math.ceil((projectedFinish - totalAc) / Math.max(1, (projectedFinish - totalAc) / 6)))];

    return {
      tooltip: { ...TT, trigger: 'axis' },
      legend: { data: ['Baseline (PV)', 'Actual (AC)', 'Projected (CPI)', 'Confidence Band'], bottom: 0, textStyle: { color: C.textMuted, fontSize: 10 } },
      grid: { left: 60, right: 40, top: 50, bottom: 55 },
      xAxis: { type: 'category', data: months, axisLabel: { color: C.textMuted, fontSize: 9 }, axisLine: { lineStyle: { color: C.axis } } },
      yAxis: { type: 'value', axisLabel: { color: C.textMuted, fontSize: 10, formatter: (v: number) => fmtHrs(v) }, splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } } },
      series: [
        { name: 'Confidence Band', type: 'line', data: confUpper, lineStyle: { opacity: 0 }, symbol: 'none', smooth: true, areaStyle: { opacity: 0.08, color: overBudget ? C.red : C.green }, stack: 'conf' },
        { name: 'Confidence Band', type: 'line', data: confLower, lineStyle: { opacity: 0 }, symbol: 'none', smooth: true, areaStyle: { opacity: 0 }, stack: 'conf' },
        { name: 'Baseline (PV)', type: 'line', data: baseline, lineStyle: { color: C.blue, width: 2, type: 'dashed' }, symbol: 'none', smooth: true, areaStyle: { opacity: 0.03, color: C.blue } },
        { name: 'Actual (AC)', type: 'line', data: actual, lineStyle: { color: C.teal, width: 3 }, symbol: 'circle', symbolSize: 4, smooth: true, areaStyle: { opacity: 0.1, color: C.teal } },
        { name: 'Projected (CPI)', type: 'line', data: projected, lineStyle: { color: overBudget ? C.red : C.green, width: 2, type: 'dotted' }, symbol: 'none', smooth: true,
          areaStyle: overBudget ? { opacity: 0.12, color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${C.red}40` }, { offset: 1, color: `${C.red}05` }] } as any } : { opacity: 0.06, color: C.green },
        },
      ],
      markLine: { silent: true, data: [{ xAxis: todayIdx, lineStyle: { color: C.teal, type: 'solid', width: 2 }, label: { formatter: 'TODAY', color: C.teal, fontSize: 10, fontWeight: 'bold' } }] },
      graphic: [{
        type: 'text', right: 40, top: 12,
        style: {
          text: overBudget
            ? `OVERRUN: +${fmtHrs(projectedFinish - totalBl)} hrs (${Math.abs(margin)}% over)\nEst. Finish: ${estFinishMonth}`
            : `ON TRACK — EAC: ${fmtHrs(projectedFinish)} hrs\nMargin: ${margin}% | Est. Finish: ${estFinishMonth}`,
          fill: overBudget ? C.red : C.green, fontSize: 10, fontWeight: 'bold', lineHeight: 16,
        },
      }],
    };
  }, [portfolio]);

  return <ChartWrapper option={option} height="400px" />;
}

/* ================================================================== */
/*  PHASE 4 — MEETING SNAPSHOT & DELTA                                 */
/* ================================================================== */

interface SnapshotData {
  label: string;
  frozenAt: string;
  spi: number; cpi: number; healthScore: number;
  totalHours: number; baselineHours: number; percentComplete: number;
  projectCount: number;
  exQcRatio: number;
  projects: { name: string; spi: number; cpi: number; actualHours: number; percentComplete: number; variance: number }[];
}

function MeetingSnapshotDelta({ portfolio, projectBreakdown }: { portfolio: any; projectBreakdown: any[] }) {
  const [snapshots, setSnapshots] = useState<SnapshotData[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('ppc_meeting_snapshots') || '[]'); } catch { return []; }
  });
  const [compareIdx, setCompareIdx] = useState<number | null>(null);
  const [scenarioLabel, setScenarioLabel] = useState('');

  const totalEX = projectBreakdown.reduce((s, p) => s + (Number(p.chargeTypes?.EX) || 0), 0);
  const totalQC = projectBreakdown.reduce((s, p) => s + (Number(p.chargeTypes?.QC) || 0), 0);

  const currentSnapshot: Omit<SnapshotData, 'label' | 'frozenAt'> = useMemo(() => ({
    spi: portfolio.spi, cpi: portfolio.cpi, healthScore: portfolio.healthScore,
    totalHours: portfolio.totalHours, baselineHours: portfolio.baselineHours,
    percentComplete: portfolio.percentComplete, projectCount: projectBreakdown.length,
    exQcRatio: totalQC > 0 ? totalEX / totalQC : 0,
    projects: projectBreakdown.map(p => ({ name: p.name, spi: p.spi, cpi: p.cpi, actualHours: p.actualHours, percentComplete: p.percentComplete, variance: p.variance })),
  }), [portfolio, projectBreakdown, totalEX, totalQC]);

  const freezeSnapshot = useCallback(() => {
    const label = scenarioLabel || `Snapshot ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    const snap: SnapshotData = { ...currentSnapshot, label, frozenAt: new Date().toISOString() };
    const updated = [snap, ...snapshots].slice(0, 10);
    setSnapshots(updated);
    setScenarioLabel('');
    if (typeof window !== 'undefined') localStorage.setItem('ppc_meeting_snapshots', JSON.stringify(updated));
  }, [currentSnapshot, snapshots, scenarioLabel]);

  const compared = compareIdx != null ? snapshots[compareIdx] : null;

  const DeltaVal = ({ current, previous, suffix = '', invert = false, fmt }: { current: number; previous: number; suffix?: string; invert?: boolean; fmt?: (n: number) => string }) => {
    const delta = current - previous;
    const isGood = invert ? delta <= 0 : delta >= 0;
    const color = Math.abs(delta) < 0.005 ? C.textMuted : isGood ? C.green : C.red;
    const arrow = delta > 0.005 ? '▲' : delta < -0.005 ? '▼' : '●';
    const display = fmt ? fmt(delta) : (Math.abs(delta) < 0.01 ? '0' : `${delta > 0 ? '+' : ''}${sn(delta)}`);
    return <span style={{ color, fontWeight: 700, fontSize: '0.75rem' }}>{arrow} {display}{suffix}</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Freeze controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={scenarioLabel}
          onChange={e => setScenarioLabel(e.target.value)}
          placeholder="Scenario label (e.g. Kickoff Baseline, Weekly Catch-up)..."
          style={{ flex: 1, padding: '0.4rem 0.7rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.textPrimary, fontSize: '0.75rem', outline: 'none' }}
        />
        <button onClick={freezeSnapshot} style={{ padding: '0.4rem 1rem', borderRadius: 8, border: `1px solid ${C.teal}`, background: `${C.teal}15`, color: C.teal, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
          Freeze Snapshot
        </button>
      </div>

      {/* Saved snapshots */}
      {snapshots.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {snapshots.map((snap, i) => (
            <button key={i} onClick={() => setCompareIdx(compareIdx === i ? null : i)} style={{
              padding: '0.3rem 0.6rem', borderRadius: 6, fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${compareIdx === i ? C.teal : C.border}`,
              background: compareIdx === i ? `${C.teal}15` : 'transparent',
              color: compareIdx === i ? C.teal : C.textMuted,
            }}>
              {snap.label} <span style={{ opacity: 0.6 }}>({new Date(snap.frozenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})</span>
            </button>
          ))}
        </div>
      )}

      {/* Delta comparison */}
      {compared && (
        <div style={{ background: `${C.teal}08`, border: `1px solid ${C.teal}25`, borderRadius: 12, padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: C.teal }}>
              Delta: {compared.label} → Now
            </div>
            <div style={{ fontSize: '0.6rem', color: C.textMuted }}>
              Frozen: {new Date(compared.frozenAt).toLocaleString()}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '0.75rem' }}>
            {[
              { label: 'SPI', prev: compared.spi, curr: portfolio.spi },
              { label: 'CPI', prev: compared.cpi, curr: portfolio.cpi },
              { label: 'Progress', prev: compared.percentComplete, curr: portfolio.percentComplete, suffix: '%', fmt: (d: number) => `${d > 0 ? '+' : ''}${Math.round(d)}` },
              { label: 'Hours', prev: compared.totalHours, curr: portfolio.totalHours, invert: true, fmt: (d: number) => `${d > 0 ? '+' : ''}${fmtHrs(Math.abs(d))}` },
            ].map(m => (
              <div key={m.label} style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.3)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: '0.55rem', color: C.textMuted, textTransform: 'uppercase', marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: C.textPrimary }}>{m.label === 'Progress' ? `${m.curr}%` : m.label === 'Hours' ? fmtHrs(m.curr) : sn(m.curr)}</div>
                <DeltaVal current={m.curr} previous={m.prev} suffix={m.suffix} invert={m.invert} fmt={m.fmt} />
              </div>
            ))}
          </div>
          {/* EX:QC ratio delta */}
          {compared.exQcRatio > 0 && (
            <div style={{ fontSize: '0.7rem', color: C.textMuted, marginBottom: '0.5rem' }}>
              EX:QC Ratio: {sn(compared.exQcRatio, 1)}:1 → {sn(totalQC > 0 ? totalEX / totalQC : 0, 1)}:1{' '}
              <DeltaVal current={totalQC > 0 ? totalEX / totalQC : 0} previous={compared.exQcRatio} invert />
            </div>
          )}
          {/* Stalled tasks highlight */}
          <div style={{ fontSize: '0.65rem', color: C.textMuted }}>
            {(() => {
              const movedProjects = compared.projects.filter(sp => {
                const cp = projectBreakdown.find(p => p.name === sp.name);
                return cp && Math.abs(cp.spi - sp.spi) > 0.05;
              });
              if (!movedProjects.length) return 'No significant SPI changes since snapshot.';
              return `${movedProjects.length} project(s) with SPI movement > 0.05 since snapshot.`;
            })()}
          </div>
        </div>
      )}

      {snapshots.length === 0 && (
        <div style={{ padding: '1rem', textAlign: 'center', color: C.textMuted, fontSize: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
          No snapshots yet. Freeze the current state to start comparing.<br />
          <span style={{ fontSize: '0.65rem', color: C.textMuted }}>Use cases: Baseline Review (Kickoff vs Current), Weekly Catch-up (Last Tuesday vs Today), QC Recovery (Post-Audit tracking)</span>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  PHASE 5 — DEPENDENCY IMPACT GRAPH (with Splash Zone)               */
/* ================================================================== */

function DependencyImpactGraph({ tasks, onClick }: { tasks: any[]; onClick?: (p: any) => void }) {
  const { graphNodes, graphLinks, criticalPath, blockedSplash } = useMemo(() => {
    if (!tasks.length) return { graphNodes: [], graphLinks: [], criticalPath: new Set<string>(), blockedSplash: new Set<string>() };
    const taskMap = new Map<string, any>();
    tasks.forEach((t: any) => { const id = String(t.id || t.taskId || ''); if (id) taskMap.set(id, t); });
    const childrenOf = new Map<string, string[]>();
    const linkData: { source: string; target: string; type: string }[] = [];
    const successorsOf = new Map<string, string[]>(); // downstream tracking

    tasks.forEach((t: any) => {
      const tid = String(t.id || t.taskId || '');
      const pid = String(t.parentId || t.phaseId || '');
      const pred = String(t.predecessorId || '');
      if (pid && pid !== tid && taskMap.has(pid)) {
        if (!childrenOf.has(pid)) childrenOf.set(pid, []);
        childrenOf.get(pid)!.push(tid);
        linkData.push({ source: pid, target: tid, type: 'parent' });
      }
      if (pred && pred !== tid && taskMap.has(pred)) {
        linkData.push({ source: pred, target: tid, type: 'predecessor' });
        if (!successorsOf.has(pred)) successorsOf.set(pred, []);
        successorsOf.get(pred)!.push(tid);
      }
    });

    const nodeIdSet = new Set<string>();
    const nodeList: any[] = [];
    const parentIds = [...childrenOf.keys()].sort((a, b) => (childrenOf.get(b)?.length || 0) - (childrenOf.get(a)?.length || 0));

    parentIds.forEach(pid => {
      if (nodeIdSet.size >= 50) return;
      const t = taskMap.get(pid); if (!t) return;
      nodeIdSet.add(pid);
      const isCrit = !!t.isCritical || (t.totalFloat != null && Number(t.totalFloat) <= 0);
      const isBlocked = String(t.status || '').toLowerCase().includes('block') || String(t.status || '').toLowerCase().includes('late');
      nodeList.push({ id: pid, name: truncName(t.name || t.taskName || pid, 26), childCount: childrenOf.get(pid)?.length || 0, hours: Number(t.baselineHours || t.actualHours || 0), pc: Number(t.percentComplete || 0), isCritical: isCrit, isParent: true, variance: Number(t.actualHours || 0) - Number(t.baselineHours || 0), isBlocked });
      (childrenOf.get(pid) || []).forEach(cid => {
        if (nodeIdSet.size >= 50 || nodeIdSet.has(cid)) return;
        const ct = taskMap.get(cid); if (!ct) return;
        nodeIdSet.add(cid);
        const cCrit = !!ct.isCritical || (ct.totalFloat != null && Number(ct.totalFloat) <= 0);
        const cBlocked = String(ct.status || '').toLowerCase().includes('block') || String(ct.status || '').toLowerCase().includes('late');
        nodeList.push({ id: cid, name: truncName(ct.name || ct.taskName || cid, 26), childCount: childrenOf.get(cid)?.length || 0, hours: Number(ct.baselineHours || ct.actualHours || 0), pc: Number(ct.percentComplete || 0), isCritical: cCrit, isParent: childrenOf.has(cid), variance: Number(ct.actualHours || 0) - Number(ct.baselineHours || 0), isBlocked: cBlocked });
      });
    });

    const critSet = new Set<string>();
    nodeList.forEach(n => { if (n.isCritical) critSet.add(n.id); });

    // Compute "Splash Zone" — all downstream tasks from blocked/late nodes
    const splashSet = new Set<string>();
    const propagate = (id: string) => {
      (successorsOf.get(id) || []).forEach(sid => {
        if (nodeIdSet.has(sid) && !splashSet.has(sid)) { splashSet.add(sid); propagate(sid); }
      });
      (childrenOf.get(id) || []).forEach(cid => {
        if (nodeIdSet.has(cid) && !splashSet.has(cid)) { splashSet.add(cid); propagate(cid); }
      });
    };
    nodeList.filter(n => n.isBlocked).forEach(n => { splashSet.add(n.id); propagate(n.id); });

    return { graphNodes: nodeList, graphLinks: linkData.filter(l => nodeIdSet.has(l.source) && nodeIdSet.has(l.target)), criticalPath: critSet, blockedSplash: splashSet };
  }, [tasks]);

  const option: EChartsOption = useMemo(() => {
    if (!graphNodes.length) return {};
    const maxH = Math.max(...graphNodes.map((n: any) => n.hours), 1);
    const maxC = Math.max(...graphNodes.map((n: any) => n.childCount), 1);

    return {
      tooltip: { ...TT, trigger: 'item', formatter: (params: any) => {
        const d = params.data;
        if (params.dataType === 'edge') return `${d.sourceName || d.source} → ${d.targetName || d.target}<br/>Type: ${d.linkType === 'parent' ? 'Parent→Child' : 'Predecessor'}`;
        const splashTag = d.inSplash && !d.isBlocked ? '<br/><span style="color:' + C.amber + ';font-weight:700">IN SPLASH ZONE — Mathematically delayed</span>' : '';
        const blockedTag = d.isBlocked ? '<br/><span style="color:' + C.red + ';font-weight:700">BLOCKED / LATE</span>' : '';
        return `<strong>${d.name}</strong><br/>Hours: ${Math.round(d.hours || 0).toLocaleString()}<br/>Progress: ${Math.round(d.pc || 0)}%${d.isCritical ? '<br/><span style="color:' + C.teal + ';font-weight:700">CRITICAL PATH</span>' : ''}${blockedTag}${splashTag}${d.variance > 0 ? '<br/><span style="color:' + C.red + '">+' + Math.round(d.variance) + ' hrs over</span>' : ''}`;
      }},
      legend: { data: ['Critical Path', 'Blocked/Late', 'Splash Zone', 'Phase', 'Task'], bottom: 0, textStyle: { color: C.textMuted, fontSize: 10 } },
      series: [{
        type: 'graph', layout: 'force', roam: true, draggable: true,
        force: { repulsion: 280, gravity: 0.1, edgeLength: [60, 180], layoutAnimation: true },
        categories: [
          { name: 'Critical Path', itemStyle: { color: C.teal } },
          { name: 'Blocked/Late', itemStyle: { color: C.red } },
          { name: 'Splash Zone', itemStyle: { color: C.amber } },
          { name: 'Phase', itemStyle: { color: `${C.blue}CC` } },
          { name: 'Task', itemStyle: { color: C.blue } },
        ],
        data: graphNodes.map((n: any) => {
          const inSplash = blockedSplash.has(n.id);
          const cat = n.isBlocked ? 1 : n.isCritical ? 0 : inSplash ? 2 : n.isParent ? 3 : 4;
          return {
            name: n.name, id: n.id,
            symbolSize: n.isParent ? Math.max(32, Math.min(65, 32 + (n.childCount / maxC) * 33)) : Math.max(16, Math.min(40, (n.hours / maxH) * 40)),
            category: cat, hours: n.hours, pc: n.pc, childCount: n.childCount, isCritical: n.isCritical, variance: n.variance, isBlocked: n.isBlocked, inSplash,
            label: { show: n.isParent || n.isCritical || n.isBlocked, position: 'right', color: C.textPrimary, fontSize: 10 },
            itemStyle: {
              shadowBlur: n.isBlocked ? 25 : n.isCritical ? 20 : inSplash ? 12 : n.isParent ? 8 : 3,
              shadowColor: n.isBlocked ? `${C.red}90` : n.isCritical ? `${C.teal}90` : inSplash ? `${C.amber}60` : 'rgba(0,0,0,0.2)',
              borderWidth: n.isBlocked ? 3 : n.isCritical ? 3 : 2,
              borderColor: n.isBlocked ? C.red : n.isCritical ? C.teal : inSplash ? C.amber : n.isParent ? `${C.amber}80` : `${C.blue}80`,
            },
          };
        }),
        links: graphLinks.map((l: any) => {
          const src = graphNodes.find((n: any) => n.id === l.source);
          const tgt = graphNodes.find((n: any) => n.id === l.target);
          const isCritLink = criticalPath.has(l.source) && criticalPath.has(l.target);
          const isSplashLink = blockedSplash.has(l.source) && blockedSplash.has(l.target);
          return {
            source: l.source, target: l.target, sourceName: src?.name, targetName: tgt?.name, linkType: l.type,
            lineStyle: {
              color: isCritLink ? C.teal : isSplashLink ? C.amber : l.type === 'predecessor' ? `${C.red}80` : `${C.blue}30`,
              width: isCritLink ? 4 : isSplashLink ? 3 : l.type === 'predecessor' ? 2.5 : 1.5,
              curveness: 0.15,
              type: isCritLink ? 'solid' as const : isSplashLink ? 'dashed' as const : 'solid' as const,
              shadowBlur: isCritLink ? 8 : isSplashLink ? 6 : 0,
              shadowColor: isCritLink ? `${C.teal}60` : isSplashLink ? `${C.amber}40` : 'transparent',
            },
            symbol: ['none', 'arrow'], symbolSize: [0, 8],
          };
        }),
        emphasis: { focus: 'adjacency', itemStyle: { shadowBlur: 20, shadowColor: `${C.teal}80` }, lineStyle: { width: 4, color: C.teal } },
      }],
    };
  }, [graphNodes, graphLinks, criticalPath, blockedSplash]);

  if (!graphNodes.length) return <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No task dependency data</div>;
  const critCount = graphNodes.filter(n => n.isCritical).length;
  const splashCount = [...blockedSplash].filter(id => !graphNodes.find(n => n.id === id)?.isBlocked).length;
  const blockedCount = graphNodes.filter(n => n.isBlocked).length;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', fontSize: '0.7rem', flexWrap: 'wrap' }}>
        <span style={{ color: C.textMuted }}>{graphNodes.length} nodes | {graphLinks.length} edges</span>
        <span style={{ padding: '2px 8px', borderRadius: 6, background: `${C.teal}20`, color: C.teal, fontWeight: 700 }}>{critCount} Critical Path</span>
        {blockedCount > 0 && <span style={{ padding: '2px 8px', borderRadius: 6, background: `${C.red}20`, color: C.red, fontWeight: 700 }}>{blockedCount} Blocked</span>}
        {splashCount > 0 && <span style={{ padding: '2px 8px', borderRadius: 6, background: `${C.amber}20`, color: C.amber, fontWeight: 700 }}>{splashCount} in Splash Zone</span>}
      </div>
      <ChartWrapper option={option} height="520px" onClick={onClick} />
    </div>
  );
}

/* ================================================================== */
/*  PHASE 6 — ROLE HEATMAP                                             */
/* ================================================================== */

function RoleHeatmap({ hours, employees }: { hours: any[]; employees: any[] }) {
  const option: EChartsOption = useMemo(() => {
    const roleMap = new Map<string, string>();
    employees.forEach((e: any) => roleMap.set(e.id || e.employeeId, e.role || e.jobTitle || e.position || 'Unknown'));
    const weeks: string[] = []; const weekStarts: Date[] = [];
    for (let i = 11; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i * 7 - d.getDay()); weekStarts.push(new Date(d)); weeks.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })); }
    const roleWeekHours = new Map<string, number[]>();
    hours.forEach((h: any) => {
      const role = roleMap.get(h.employeeId || h.employee_id) || 'Unknown';
      const hrs = Number(h.hours || 0); if (hrs <= 0) return;
      const entryDate = new Date(h.date);
      const weekIdx = weekStarts.findIndex(ws => { const we = new Date(ws); we.setDate(we.getDate() + 7); return entryDate >= ws && entryDate < we; });
      if (weekIdx < 0) return;
      if (!roleWeekHours.has(role)) roleWeekHours.set(role, Array(12).fill(0));
      roleWeekHours.get(role)![weekIdx] += hrs;
    });
    const roles = [...roleWeekHours.entries()].map(([role, hrs]) => ({ role: truncName(role, 22), hrs, total: hrs.reduce((s, h) => s + h, 0) })).sort((a, b) => b.total - a.total).slice(0, 12);
    if (!roles.length) return {};
    const roleNames = roles.map(r => r.role);
    const heatData: [number, number, number][] = []; let maxVal = 0;
    roles.forEach((r, ri) => { r.hrs.forEach((h, wi) => { heatData.push([wi, ri, Math.round(h)]); if (h > maxVal) maxVal = h; }); });
    return {
      tooltip: { ...TT, formatter: (params: any) => { const [wi, ri, val] = params.data; return `<strong>${roleNames[ri]}</strong><br/>Week: ${weeks[wi]}<br/>Hours: <strong>${val.toLocaleString()}</strong>`; } },
      grid: { left: 160, right: 60, top: 20, bottom: 50 },
      xAxis: { type: 'category', data: weeks, splitArea: { show: true }, axisLabel: { color: C.textMuted, fontSize: 9, rotate: 30 } },
      yAxis: { type: 'category', data: roleNames, axisLabel: { color: C.textPrimary, fontSize: 10 }, axisLine: { lineStyle: { color: C.axis } } },
      visualMap: { min: 0, max: Math.max(maxVal, 40), calculable: true, orient: 'vertical', right: 5, top: 20, bottom: 50, inRange: { color: [`${C.blue}10`, `${C.blue}40`, C.blue, C.amber, C.red] }, textStyle: { color: C.textMuted, fontSize: 9 } },
      series: [{ type: 'heatmap', data: heatData, label: { show: true, color: C.textPrimary, fontSize: 9, formatter: (p: any) => p.data[2] > 0 ? String(p.data[2]) : '' }, itemStyle: { borderWidth: 2, borderColor: C.bgCard }, emphasis: { itemStyle: { shadowBlur: 8, shadowColor: `${C.teal}60` } } }],
    };
  }, [hours, employees]);
  if (!Object.keys(option).length) return <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No employee/hours data for heatmap</div>;
  return <ChartWrapper option={option} height="400px" />;
}

/* ================================================================== */
/*  MEETING SNAPSHOT EXPORT BUTTON                                     */
/* ================================================================== */

function MeetingSnapshotButton() {
  const [exporting, setExporting] = useState(false);
  const handleSnapshot = useCallback(async () => {
    setExporting(true);
    try {
      const canvases = document.querySelectorAll('canvas');
      if (canvases.length === 0) { alert('No charts found.'); setExporting(false); return; }
      const padding = 20;
      const maxWidth = Math.max(...Array.from(canvases).map(c => c.width));
      const totalHeight = Array.from(canvases).reduce((s, c) => s + c.height + padding, padding);
      const composite = document.createElement('canvas');
      composite.width = maxWidth + padding * 2; composite.height = totalHeight;
      const ctx = composite.getContext('2d'); if (!ctx) return;
      ctx.fillStyle = C.bgSecondary; ctx.fillRect(0, 0, composite.width, composite.height);
      ctx.fillStyle = C.teal; ctx.font = 'bold 20px system-ui';
      ctx.fillText(`Pinnacle Executive Summary — ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, padding, 30);
      let yOffset = 50;
      canvases.forEach(canvas => { try { ctx.drawImage(canvas, padding, yOffset); yOffset += canvas.height + padding; } catch { } });
      const link = document.createElement('a');
      link.download = `pinnacle-executive-summary-${new Date().toISOString().split('T')[0]}.png`;
      link.href = composite.toDataURL('image/png'); link.click();
    } catch (err) { console.error('Snapshot export failed:', err); } finally { setExporting(false); }
  }, []);

  return (
    <button onClick={handleSnapshot} disabled={exporting} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: `1px solid ${C.teal}`, background: `${C.teal}15`, color: C.teal, cursor: exporting ? 'wait' : 'pointer', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, opacity: exporting ? 0.6 : 1 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
      {exporting ? 'Exporting...' : 'Meeting Snapshot'}
    </button>
  );
}

/* ================================================================== */
/*  MAIN PAGE                                                          */
/* ================================================================== */

export default function OverviewV2Page() {
  const { filteredData, isLoading, hierarchyFilter, setHierarchyFilter, variancePeriod, metricsHistory } = useData();
  const data = filteredData;
  const crossFilter = useCrossFilter();
  const [aggregateBy, setAggregateBy] = useState<'project' | 'site'>('project');
  const [selectedProject, setSelectedProject] = useState<any>(null);

  const contextLabel = useMemo(() => {
    const hf = hierarchyFilter as any;
    if (hf?.project) return `Project: ${hf.project}`;
    if (hf?.path?.[2]) return `Site: ${hf.path[2]}`;
    if (hf?.path?.[1]) return `Client: ${hf.path[1]}`;
    if (hf?.seniorManager) return `Portfolio: ${hf.seniorManager}`;
    return 'All Projects';
  }, [hierarchyFilter]);

  /* ── 2-Memo Data Pipeline ── */
  const projectBreakdown = useMemo(() => {
    const tasks = data.tasks || []; const projects = data.projects || []; const hours = data.hours || []; const sites = data.sites || [];
    const nameMap = new Map<string, string>(); projects.forEach((p: any) => nameMap.set(p.id || p.projectId, p.name || p.projectName || p.id));
    const siteMap = new Map<string, string>(); const projToSite = new Map<string, string>();
    sites.forEach((s: any) => siteMap.set(s.id || s.siteId, s.name || 'Unknown Site'));
    projects.forEach((p: any) => { const sid = p.siteId || p.site_id; if (sid && siteMap.has(sid)) projToSite.set(p.id || p.projectId, siteMap.get(sid)!); });
    const planIds = new Set<string>(); tasks.forEach((t: any) => { const pid = t.projectId || t.project_id; if (pid) planIds.add(pid); });

    const map = new Map<string, any>();
    tasks.forEach((t: any) => {
      const pid = t.projectId || t.project_id || 'Unknown';
      const key = aggregateBy === 'site' ? (projToSite.get(pid) || nameMap.get(pid) || pid) : pid;
      const name = aggregateBy === 'site' ? key : (nameMap.get(pid) || pid);
      if (!map.has(key)) map.set(key, { name, tasks: 0, completed: 0, baselineHours: 0, actualHours: 0, pcSum: 0, chargeTypes: {} as Record<string, number>, hoursActual: 0, hoursCost: 0 });
      const e = map.get(key)!; e.tasks++;
      e.baselineHours += Number(t.baselineHours ?? t.budgetHours ?? 0) || 0;
      e.actualHours += Number(t.actualHours ?? 0) || 0;
      e.pcSum += Number(t.percentComplete ?? 0) || 0;
      if (String(t.status || '').toLowerCase().includes('complete') || (t.percentComplete || 0) >= 100) e.completed++;
    });
    hours.forEach((h: any) => {
      const pid = h.projectId || h.project_id; if (!pid || !planIds.has(pid)) return;
      const key = aggregateBy === 'site' ? (projToSite.get(pid) || nameMap.get(pid) || pid) : pid;
      const e = map.get(key); if (!e) return;
      e.hoursActual += Number(h.hours ?? 0) || 0; e.hoursCost += Number(h.actualCost ?? h.actual_cost ?? 0) || 0;
      const ct = h.chargeType || h.charge_type || 'Other'; e.chargeTypes[ct] = (e.chargeTypes[ct] || 0) + (Number(h.hours ?? 0) || 0);
    });

    return Array.from(map.entries()).map(([id, p]) => {
      const avgPc = p.tasks > 0 ? Math.round(p.pcSum / p.tasks) : 0;
      const earned = p.baselineHours * (avgPc / 100);
      return {
        id, name: p.name, tasks: p.tasks, completed: p.completed,
        baselineHours: Math.round(p.baselineHours), actualHours: Math.round(p.actualHours),
        remainingHours: Math.round(Math.max(0, p.baselineHours - p.actualHours)),
        timesheetHours: Math.round(p.hoursActual), timesheetCost: Math.round(p.hoursCost), chargeTypes: p.chargeTypes,
        spi: Math.round((p.baselineHours > 0 ? earned / p.baselineHours : 1) * 100) / 100,
        cpi: Math.round((p.actualHours > 0 ? earned / p.actualHours : 1) * 100) / 100,
        percentComplete: avgPc,
        variance: p.baselineHours > 0 ? Math.round(((p.actualHours - p.baselineHours) / p.baselineHours) * 100) : 0,
      };
    }).filter(p => p.name !== 'Unknown' && p.tasks > 0).sort((a, b) => b.actualHours - a.actualHours);
  }, [data.tasks, data.projects, data.hours, data.sites, aggregateBy]);

  const portfolio = useMemo(() => {
    let totalBl = 0, totalAc = 0, totalEv = 0, tsHrs = 0, tsCost = 0;
    projectBreakdown.forEach(p => { totalBl += p.baselineHours; totalAc += p.actualHours; totalEv += p.baselineHours * (p.percentComplete / 100); tsHrs += p.timesheetHours; tsCost += p.timesheetCost; });
    const spi = totalBl > 0 ? totalEv / totalBl : 1; const cpi = totalAc > 0 ? totalEv / totalAc : 1;
    const avgPc = projectBreakdown.length > 0 ? Math.round(projectBreakdown.reduce((s, p) => s + p.percentComplete, 0) / projectBreakdown.length) : 0;
    let hs = 100; if (spi < 0.85) hs -= 30; else if (spi < 0.95) hs -= 15; else if (spi < 1) hs -= 5;
    if (cpi < 0.85) hs -= 30; else if (cpi < 0.95) hs -= 15; else if (cpi < 1) hs -= 5;
    return { healthScore: Math.max(0, Math.min(100, hs)), spi: Math.round(spi * 100) / 100, cpi: Math.round(cpi * 100) / 100, percentComplete: avgPc, projectCount: projectBreakdown.length, totalHours: Math.round(totalAc), baselineHours: Math.round(totalBl), earnedHours: Math.round(totalEv), remainingHours: Math.round(Math.max(0, totalBl - totalAc)), timesheetHours: Math.round(tsHrs), timesheetCost: Math.round(tsCost) };
  }, [projectBreakdown]);

  const deltas = useMemo(() => {
    try {
      const comp = getComparisonDates(variancePeriod);
      const cur = getMetricsForPeriod(metricsHistory, comp.current);
      const prev = getMetricsForPeriod(metricsHistory, comp.previous);
      const spiV = calculateMetricVariance('spi', cur, prev, comp.periodLabel);
      const cpiV = calculateMetricVariance('cpi', cur, prev, comp.periodLabel);
      return { spi: spiV?.change || 0, cpi: cpiV?.change || 0, health: 0, periodLabel: comp.periodLabel };
    } catch { return { spi: 0, cpi: 0, health: 0, periodLabel: 'vs last week' }; }
  }, [metricsHistory, variancePeriod]);

  const hasData = projectBreakdown.length > 0;

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.6rem', color: C.teal, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>Meeting Command Center</div>
          <div style={{ fontSize: '0.65rem', color: C.textMuted }}>{contextLabel} | {(data.tasks || []).length} tasks | {(data.hours || []).length} hours | {projectBreakdown.length} {aggregateBy === 'site' ? 'sites' : 'projects'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3 }}>
            {(['project', 'site'] as const).map(mode => (
              <button key={mode} onClick={() => setAggregateBy(mode)} style={{ padding: '0.3rem 0.7rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, background: aggregateBy === mode ? `${C.teal}20` : 'transparent', color: aggregateBy === mode ? C.teal : C.textMuted }}>By {mode}</button>
            ))}
          </div>
          <MeetingSnapshotButton />
        </div>
      </div>

      {!hasData && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem', fontWeight: 600, color: C.textPrimary }}>No Data Available</h2>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.9rem', color: C.textMuted, maxWidth: 420 }}>Upload project data from the Data Management page.</p>
          <a href="/project-controls/data-management" style={{ padding: '0.75rem 1.5rem', background: C.teal, color: '#000', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>Go to Data Management</a>
        </div>
      )}

      {hasData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* ═══ PHASE 1 — THE PULSE + BLOCKER TICKER ═══ */}
          <SectionCard title="Portfolio Pulse" subtitle="Temperature check + critical decisions requiring intervention" badge={<PhaseBadge n={1} label="Pulse" />}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 180px', gap: '1rem', alignItems: 'center' }}>
              <TriGaugePulse healthScore={portfolio.healthScore} spi={portfolio.spi} cpi={portfolio.cpi} spiDelta={deltas.spi} cpiDelta={deltas.cpi} healthDelta={deltas.health} periodLabel={deltas.periodLabel} />
              <BlockerPulse tasks={data.tasks || []} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {[
                  { label: 'Actual', value: fmtHrs(portfolio.totalHours), color: C.teal },
                  { label: 'Baseline', value: fmtHrs(portfolio.baselineHours), color: C.textSecondary },
                  { label: 'Earned', value: fmtHrs(portfolio.earnedHours), color: C.green },
                  { label: 'Remaining', value: fmtHrs(portfolio.remainingHours), color: portfolio.remainingHours > portfolio.baselineHours * 0.5 ? C.amber : C.green },
                  { label: 'Progress', value: `${portfolio.percentComplete}%`, color: portfolio.percentComplete >= 80 ? C.green : portfolio.percentComplete >= 50 ? C.amber : C.red },
                ].map(s => (
                  <div key={s.label} style={{ padding: '0.35rem 0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55rem', color: C.textMuted, textTransform: 'uppercase' }}>{s.label}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: s.color }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* ═══ PHASE 2 — OPERATIONAL FRICTION ═══ */}
          <SectionCard title="Operational Friction — Hours Flow" subtitle="Red pulsing links = EX:QC > 10:1 — not enough QC to clear reports" badge={<PhaseBadge n={2} label="Friction" />}>
            <HeatLinkSankey projectBreakdown={projectBreakdown} portfolio={portfolio} onClick={(p) => { if (p?.name) crossFilter.toggleFilter({ type: 'project', value: p.name, label: p.name, source: 'sankey' }); }} />
          </SectionCard>

          {/* ═══ PHASE 3 — THE FINISH LINE ═══ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '1rem' }}>
            <SectionCard title="Site-Compliance Sunburst" subtitle="Client → Site/Refinery → Project. Click any slice to filter the entire dashboard." badge={<PhaseBadge n={3} label="Finish Line" />}>
              <SiteComplianceSunburst data={data} projectBreakdown={projectBreakdown} onHierarchyClick={(filter) => setHierarchyFilter(filter as any)} />
            </SectionCard>
            <SectionCard title="Predictive Burn" subtitle="Dashed confidence shadow projects end date & final margin from current CPI" badge={<PhaseBadge n={3} label="Finish Line" />}>
              <PredictiveBurn portfolio={portfolio} />
            </SectionCard>
          </div>

          {/* ═══ PHASE 4 — MEETING SNAPSHOT & DELTA ═══ */}
          <SectionCard title="Meeting Snapshot & Delta" subtitle="Freeze current state, compare against any moment. Scenarios: Baseline Review, Weekly Catch-up, QC Recovery." badge={<PhaseBadge n={4} label="Delta" />}>
            <MeetingSnapshotDelta portfolio={portfolio} projectBreakdown={projectBreakdown} />
          </SectionCard>

          {/* ═══ PHASE 5 — SPLASH ZONE ═══ */}
          <SectionCard title="Dependency Impact — Splash Zone" subtitle="Blocked/Late nodes in RED. Amber = downstream tasks mathematically delayed. Critical path in Teal." badge={<PhaseBadge n={5} label="Splash Zone" />}>
            <DependencyImpactGraph tasks={data.tasks || []} onClick={(p) => { if (p?.name) crossFilter.toggleFilter({ type: 'custom', value: p.name, label: p.name, source: 'dependency' }); }} />
          </SectionCard>

          {/* ═══ PHASE 6 — CONTROLS ═══ */}
          <SectionCard title="Role-Based Utilization Heatmap" subtitle="Weekly hours by role. High-demand roles (RBI Leads, Sr. Engineers) surface in red." badge={<PhaseBadge n={6} label="Controls" />}>
            <RoleHeatmap hours={data.hours || []} employees={data.employees || []} />
          </SectionCard>

          {/* Summary Table */}
          <SectionCard title={`${aggregateBy === 'site' ? 'Site' : 'Project'} Summary (${projectBreakdown.length})`} subtitle="Click any row for details" noPadding>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: C.bgCard, zIndex: 1 }}>
                  <tr><th style={{ position: 'sticky', left: 0, background: C.bgCard, zIndex: 2 }}>{aggregateBy === 'site' ? 'Site' : 'Project'}</th><th className="number">Tasks</th><th className="number">SPI</th><th className="number">CPI</th><th className="number">Progress</th><th className="number">Baseline</th><th className="number">Actual</th><th className="number">Var%</th></tr>
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
    </div>
  );
}
