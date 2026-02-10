'use client';

/**
 * Overview v2 — Executive Meeting Dashboard
 *
 * Purpose-built for weekly executive meetings. Every visual answers a
 * specific meeting question in 10 seconds or less.
 *
 * Phases:
 *  1. Pulse Header — Tri-Gauge cluster (Health + SPI + CPI) with delta arrows
 *  2. Operational Friction — Heat-Link Sankey with EX:QC ratio glow
 *  3. Finish Line — Asset Compliance Sunburst + Predictive Burn area chart
 *  4. Splash Zone — Dependency Impact Graph with critical path
 *  5. Controls — Asset/Site toggle, Role Heatmap, Meeting Snapshot
 *
 * Technical:
 *  - pinnacle-dark theme only (#40E0D0, #3B82F6, #F59E0B, #EF4444)
 *  - ChartWrapper for responsive ECharts
 *  - Consolidated 2-memo pipeline (projectBreakdown + portfolio)
 */

import React, { useMemo, useState, useCallback, useRef } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';
import useCrossFilter, { type CrossFilter } from '@/lib/hooks/useCrossFilter';
import {
  calculateMetricVariance,
  getComparisonDates,
  getMetricsForPeriod,
  type MetricsHistory,
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

const sn = (v: any, d = 2): string => {
  const n = Number(v); return isFinite(n) ? n.toFixed(d) : '0';
};
const truncName = (s: string, max = 25) =>
  s.length > max ? s.slice(0, max) + '...' : s;
const fmtHrs = (h: number) =>
  h >= 1000 ? `${(h / 1000).toFixed(1)}K` : h.toLocaleString();

const TT = {
  backgroundColor: 'rgba(15,15,18,0.96)',
  borderColor: C.border,
  borderWidth: 1,
  padding: [10, 15] as [number, number],
  textStyle: { color: '#fff', fontSize: 12 },
  confine: false,
  appendToBody: true,
  extraCssText:
    'z-index:99999!important;backdrop-filter:blur(20px);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.45);',
};

/* ================================================================== */
/*  HELPER UI                                                          */
/* ================================================================== */

function SectionCard({
  title, subtitle, badge, children, noPadding = false, actions,
}: {
  title: string; subtitle?: string; badge?: React.ReactNode;
  children: React.ReactNode; noPadding?: boolean; actions?: React.ReactNode;
}) {
  return (
    <div style={{ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0.875rem 1rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: C.textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
            {title}{badge}
          </h3>
          {subtitle && <span style={{ fontSize: '0.65rem', color: C.textMuted }}>{subtitle}</span>}
        </div>
        {actions}
      </div>
      <div style={{ padding: noPadding ? 0 : '1rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

function PhaseBadge({ n, label }: { n: number; label: string }) {
  return (
    <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: `${C.teal}18`, color: C.teal, letterSpacing: 0.5, textTransform: 'uppercase', marginLeft: 4 }}>
      Phase {n}: {label}
    </span>
  );
}

/* ================================================================== */
/*  PHASE 1 — TRI-GAUGE PULSE HEADER                                  */
/* ================================================================== */

function TriGaugePulse({
  healthScore, spi, cpi,
  spiDelta, cpiDelta, healthDelta,
}: {
  healthScore: number; spi: number; cpi: number;
  spiDelta: number; cpiDelta: number; healthDelta: number;
}) {
  const option: EChartsOption = useMemo(() => {
    const healthColor = healthScore >= 80 ? C.green : healthScore >= 60 ? C.amber : C.red;
    const spiColor = spi >= 1 ? C.green : spi >= 0.9 ? C.amber : C.red;
    const cpiColor = cpi >= 1 ? C.green : cpi >= 0.9 ? C.amber : C.red;

    const mkGauge = (
      center: [string, string], radius: string, min: number, max: number,
      val: number, color: string, label: string, delta: number,
      fontSize: number, isIndex = false,
    ): any => {
      const arrow = delta >= 0 ? '▲' : '▼';
      const deltaColor = isIndex ? (delta >= 0 ? C.green : C.red) : (delta >= 0 ? C.green : C.red);
      const deltaStr = isIndex ? `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}` : `${delta >= 0 ? '+' : ''}${Math.round(delta)}`;
      return {
        type: 'gauge', center, radius,
        startAngle: 220, endAngle: -40,
        min, max,
        pointer: { show: false },
        progress: { show: true, roundCap: true, itemStyle: { color }, width: isIndex ? 10 : 16 },
        axisLine: { lineStyle: { width: isIndex ? 10 : 16, color: [[1, 'rgba(255,255,255,0.06)']] } },
        axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        title: { show: true, offsetCenter: [0, '62%'], fontSize: isIndex ? 10 : 12, color: C.textMuted, fontWeight: 600 },
        detail: {
          valueAnimation: true, fontSize, fontWeight: 900,
          offsetCenter: [0, isIndex ? '-5%' : '-10%'], color,
          formatter: () => {
            const valStr = isIndex ? sn(val) : String(Math.round(val));
            return `{val|${valStr}}\n{delta|${arrow} ${deltaStr}}`;
          },
          rich: {
            val: { fontSize, fontWeight: 900, color, lineHeight: fontSize + 6 },
            delta: { fontSize: isIndex ? 10 : 11, fontWeight: 700, color: deltaColor, lineHeight: 16 },
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
  }, [healthScore, spi, cpi, spiDelta, cpiDelta, healthDelta]);

  return <ChartWrapper option={option} height="260px" />;
}

/* ================================================================== */
/*  PHASE 2 — HEAT-LINK SANKEY                                        */
/* ================================================================== */

function HeatLinkSankey({
  projectBreakdown, portfolio, onClick,
}: {
  projectBreakdown: any[]; portfolio: any; onClick?: (p: any) => void;
}) {
  const option: EChartsOption = useMemo(() => {
    if (!projectBreakdown.length) return {};

    const nodes: any[] = [];
    const links: any[] = [];
    const added = new Set<string>();
    const add = (name: string, color: string) => {
      if (!added.has(name)) { nodes.push({ name, itemStyle: { color, borderWidth: 0 } }); added.add(name); }
    };

    // Calculate per-project EX:QC ratios
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

      // EX:QC ratio calculation
      const exHrs = (Number(ct['EX']) || 0) * scale;
      const qcHrs = (Number(ct['QC']) || 0) * scale;
      const ratio = qcHrs > 0 ? exHrs / qcHrs : exHrs > 0 ? 999 : 0;
      exQcRatios.set(nm, ratio);

      // Charge type nodes
      Object.entries(ct).forEach(([type, hrs]) => {
        const scaled = Math.round((hrs as number) * scale);
        if (scaled > 0) {
          const label = CHARGE_LABELS[type] || type;
          add(label, CHARGE_COLORS[type] || '#6B7280');
          links.push({ source: nm, target: label, value: scaled });
        }
      });

      if (Object.keys(ct).length === 0) {
        add('Unclassified', '#6B7280');
        links.push({ source: nm, target: 'Unclassified', value: projTotal });
      }
    });

    // Outcome layer: Earned / Remaining
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

    // Validate
    const nodeNames = new Set(nodes.map(n => n.name));
    const validLinks = links.filter(l => l.value > 0 && nodeNames.has(l.source) && nodeNames.has(l.target));
    if (validLinks.length === 0) return {};

    const totalHours = projectBreakdown.reduce((s, p) => s + Math.max(p.actualHours, p.timesheetHours), 0) || 1;

    // Apply red glow emphasis to high EX:QC ratio projects
    validLinks.forEach(link => {
      const ratio = exQcRatios.get(link.target) || exQcRatios.get(link.source) || 0;
      if (ratio > 10 && link.source === 'Portfolio') {
        link.lineStyle = {
          color: 'gradient', opacity: 0.6,
          shadowBlur: 15, shadowColor: C.red,
        };
      }
    });

    return {
      tooltip: {
        ...TT, trigger: 'item',
        formatter: (params: any) => {
          if (params.dataType === 'edge') {
            const pct = sn((params.data.value / totalHours) * 100, 1);
            const srcRatio = exQcRatios.get(params.data.source);
            const ratioLine = srcRatio != null && srcRatio > 0
              ? `<br/>EX:QC Ratio: <strong style="color:${srcRatio > 10 ? C.red : srcRatio > 5 ? C.amber : C.green}">${sn(srcRatio, 1)}:1</strong>${srcRatio > 10 ? ' <span style="color:' + C.red + '">QUALITY RISK</span>' : ''}`
              : '';
            return `<strong>${params.data.source}</strong> → <strong>${params.data.target}</strong><br/>Hours: <strong>${Math.round(params.data.value).toLocaleString()}</strong><br/>Share: ${pct}%${ratioLine}`;
          }
          const ratio = exQcRatios.get(params.name);
          const ratioLine = ratio != null && ratio > 0
            ? `<br/>EX:QC Ratio: <strong>${sn(ratio, 1)}:1</strong>`
            : '';
          return `<strong>${params.name}</strong>${ratioLine}<br/>Click to filter`;
        },
      },
      series: [{
        type: 'sankey',
        emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.85 } },
        nodeAlign: 'justify', nodeWidth: 26, nodeGap: 16, layoutIterations: 64,
        orient: 'horizontal', left: 50, right: 180, top: 20, bottom: 20,
        label: {
          color: C.textPrimary, fontSize: 11.5, fontWeight: 600,
          formatter: (p: any) => {
            const ratio = exQcRatios.get(p.name);
            const short = truncName(p.name, 28);
            const warning = ratio != null && ratio > 10 ? ' ⚠' : '';
            return short + warning;
          },
        },
        lineStyle: { color: 'gradient', curveness: 0.45, opacity: 0.38 },
        data: nodes,
        links: validLinks,
      }],
    };
  }, [projectBreakdown, portfolio]);

  const totalHours = projectBreakdown.reduce((s, p) => s + Math.max(p.actualHours, p.timesheetHours), 0);
  if (!projectBreakdown.length) return <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No data</div>;

  // EX:QC ratio summary
  const totalEX = projectBreakdown.reduce((s, p) => s + (Number(p.chargeTypes?.EX) || 0), 0);
  const totalQC = projectBreakdown.reduce((s, p) => s + (Number(p.chargeTypes?.QC) || 0), 0);
  const portfolioRatio = totalQC > 0 ? totalEX / totalQC : 0;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center', fontSize: '0.7rem' }}>
        <span style={{ color: C.textMuted }}>{fmtHrs(totalHours)} hrs | {projectBreakdown.length} projects</span>
        <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 6, background: portfolioRatio > 10 ? `${C.red}20` : portfolioRatio > 5 ? `${C.amber}20` : `${C.green}20`, color: portfolioRatio > 10 ? C.red : portfolioRatio > 5 ? C.amber : C.green, fontWeight: 700 }}>
          EX:QC Ratio {sn(portfolioRatio, 1)}:1
          {portfolioRatio > 10 && ' — QUALITY RISK'}
        </span>
      </div>
      <ChartWrapper option={option} height="520px" onClick={onClick} isEmpty={!Object.keys(option).length} visualTitle="Heat-Link Sankey" />
    </div>
  );
}

/* ================================================================== */
/*  PHASE 3A — ASSET COMPLIANCE SUNBURST                               */
/* ================================================================== */

function AssetComplianceSunburst({
  data, projectBreakdown, onHierarchyClick,
}: {
  data: any; projectBreakdown: any[];
  onHierarchyClick?: (path: string[]) => void;
}) {
  const option: EChartsOption = useMemo(() => {
    const customers = data.customers || [];
    const sites = data.sites || [];
    const projects = data.projects || [];
    const deliverables = data.deliverables || [];

    // Build hierarchy: Customer → Site → Project → Deliverable status
    const projMap = new Map<string, any>();
    projectBreakdown.forEach(p => projMap.set(p.id, p));

    // Build site lookup
    const siteMap = new Map<string, any>();
    sites.forEach((s: any) => siteMap.set(s.id || s.siteId, s));

    // Build customer lookup
    const customerMap = new Map<string, any>();
    customers.forEach((c: any) => customerMap.set(c.id || c.customerId, c));

    // Group projects by customer → site
    const tree: any[] = [];
    const custGroups = new Map<string, Map<string, any[]>>();

    projects.forEach((proj: any) => {
      const siteId = proj.siteId || proj.site_id;
      const site = siteMap.get(siteId);
      const custId = site?.customerId || site?.customer_id || proj.customerId || proj.customer_id;
      const custName = customerMap.get(custId)?.name || 'Unknown Client';
      const siteName = site?.name || 'Unknown Site';

      if (!custGroups.has(custName)) custGroups.set(custName, new Map());
      const siteGroup = custGroups.get(custName)!;
      if (!siteGroup.has(siteName)) siteGroup.set(siteName, []);
      siteGroup.get(siteName)!.push(proj);
    });

    custGroups.forEach((siteGroup, custName) => {
      const custChildren: any[] = [];
      siteGroup.forEach((projs, siteName) => {
        const siteChildren = projs.slice(0, 8).map((proj: any) => {
          const pb = projMap.get(proj.id || proj.projectId);
          const pc = pb?.percentComplete || 0;
          const clr = pc >= 80 ? C.green : pc >= 50 ? C.amber : C.red;
          return {
            name: truncName(proj.name || proj.projectName || 'Project', 18),
            value: Math.max(1, pb?.actualHours || 1),
            itemStyle: { color: clr },
          };
        });
        if (siteChildren.length > 0) {
          custChildren.push({
            name: truncName(siteName, 20),
            itemStyle: { color: C.blue },
            children: siteChildren,
          });
        }
      });
      if (custChildren.length > 0) {
        tree.push({
          name: truncName(custName, 20),
          itemStyle: { color: C.teal },
          children: custChildren,
        });
      }
    });

    if (tree.length === 0) {
      // Fallback: flat project breakdown
      return {
        series: [{
          type: 'sunburst',
          data: [{
            name: 'Portfolio',
            itemStyle: { color: C.teal },
            children: projectBreakdown.slice(0, 12).map(p => ({
              name: truncName(p.name, 18),
              value: Math.max(1, p.actualHours),
              itemStyle: { color: p.percentComplete >= 80 ? C.green : p.percentComplete >= 50 ? C.amber : C.red },
            })),
          }],
          radius: ['12%', '90%'],
          label: { color: C.textPrimary, fontSize: 9, rotate: 'radial' },
          itemStyle: { borderWidth: 2, borderColor: C.bgCard },
          emphasis: { focus: 'ancestor', itemStyle: { shadowBlur: 10, shadowColor: `${C.teal}40` } },
        }],
        tooltip: { ...TT, trigger: 'item', formatter: (p: any) => `<strong>${p.name}</strong><br/>Value: ${p.value?.toLocaleString()}` },
      };
    }

    return {
      tooltip: {
        ...TT, trigger: 'item',
        formatter: (p: any) => `<strong>${p.name}</strong><br/>Hours: ${(p.value || 0).toLocaleString()}<br/>Click to filter by this ${p.treePathInfo?.length <= 2 ? 'client' : p.treePathInfo?.length <= 3 ? 'site' : 'project'}`,
      },
      series: [{
        type: 'sunburst',
        data: tree,
        radius: ['12%', '90%'],
        label: { color: C.textPrimary, fontSize: 9, rotate: 'radial' },
        itemStyle: { borderWidth: 2, borderColor: C.bgCard },
        emphasis: { focus: 'ancestor', itemStyle: { shadowBlur: 10, shadowColor: `${C.teal}40` } },
        levels: [
          {},
          { r0: '12%', r: '35%', label: { fontSize: 10, fontWeight: 700 } },
          { r0: '35%', r: '62%', label: { fontSize: 9 } },
          { r0: '62%', r: '90%', label: { fontSize: 8 } },
        ],
      }],
    };
  }, [data.customers, data.sites, data.projects, data.deliverables, projectBreakdown]);

  return <ChartWrapper option={option} height="440px" onClick={(params: any) => {
    if (params?.treePathInfo) {
      const path = params.treePathInfo.map((p: any) => p.name).filter(Boolean);
      onHierarchyClick?.(path);
    }
  }} />;
}

/* ================================================================== */
/*  PHASE 3B — PREDICTIVE BURN AREA CHART                              */
/* ================================================================== */

function PredictiveBurn({ portfolio, projectBreakdown }: { portfolio: any; projectBreakdown: any[] }) {
  const option: EChartsOption = useMemo(() => {
    const months = Array.from({ length: 18 }, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() - 11 + i);
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    });

    const totalBl = portfolio.baselineHours || 1;
    const totalAc = portfolio.totalHours || 0;
    const cpi = portfolio.cpi || 1;
    const todayIdx = 11; // "Today" is at month 12 (index 11)

    // Baseline (planned) — linear S-curve up to total
    const baseline = months.map((_, i) => i <= 17 ? Math.round(totalBl * Math.min(1, (i + 1) / 16)) : totalBl);

    // Actual — up to today
    const actual: (number | null)[] = months.map((_, i) => {
      if (i > todayIdx) return null;
      return Math.round(totalAc * ((i + 1) / (todayIdx + 1)));
    });

    // Projected (from today forward using CPI)
    const projectedFinish = cpi > 0 ? Math.round(totalBl / cpi) : totalBl * 1.5;
    const projected: (number | null)[] = months.map((_, i) => {
      if (i < todayIdx) return null;
      const remaining = projectedFinish - totalAc;
      const monthsLeft = 17 - todayIdx;
      return Math.round(totalAc + remaining * Math.min(1, (i - todayIdx) / Math.max(1, monthsLeft)));
    });

    const overBudget = projectedFinish > totalBl;

    return {
      tooltip: { ...TT, trigger: 'axis' },
      legend: { data: ['Baseline (PV)', 'Actual (AC)', 'Projected (CPI)'], bottom: 0, textStyle: { color: C.textMuted, fontSize: 10 } },
      grid: { left: 60, right: 40, top: 40, bottom: 55 },
      xAxis: {
        type: 'category', data: months,
        axisLabel: { color: C.textMuted, fontSize: 9 },
        axisLine: { lineStyle: { color: C.axis } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: C.textMuted, fontSize: 10, formatter: (v: number) => fmtHrs(v) },
        splitLine: { lineStyle: { color: C.gridLine, type: 'dashed' } },
      },
      series: [
        {
          name: 'Baseline (PV)', type: 'line', data: baseline,
          lineStyle: { color: C.blue, width: 2, type: 'dashed' }, symbol: 'none', smooth: true,
          areaStyle: { opacity: 0.04, color: C.blue },
        },
        {
          name: 'Actual (AC)', type: 'line',
          data: actual,
          lineStyle: { color: C.teal, width: 3 }, symbol: 'circle', symbolSize: 4, smooth: true,
          areaStyle: { opacity: 0.1, color: C.teal },
        },
        {
          name: 'Projected (CPI)', type: 'line',
          data: projected,
          lineStyle: { color: overBudget ? C.red : C.green, width: 2, type: 'dotted' },
          symbol: 'none', smooth: true,
          areaStyle: overBudget ? {
            opacity: 0.12,
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: `${C.red}40` },
                { offset: 1, color: `${C.red}05` },
              ],
            } as any,
          } : { opacity: 0.06, color: C.green },
        },
      ],
      markLine: {
        silent: true,
        data: [{
          xAxis: todayIdx,
          lineStyle: { color: C.teal, type: 'solid', width: 2 },
          label: { formatter: 'TODAY', color: C.teal, fontSize: 10, fontWeight: 'bold' },
        }],
      },
      graphic: overBudget ? [{
        type: 'text', right: 50, top: 15,
        style: {
          text: `PROJECTED OVERRUN: +${fmtHrs(projectedFinish - totalBl)} hrs`,
          fill: C.red, fontSize: 11, fontWeight: 'bold',
        },
      }] : [{
        type: 'text', right: 50, top: 15,
        style: {
          text: `ON TRACK — EAC: ${fmtHrs(projectedFinish)} hrs`,
          fill: C.green, fontSize: 11, fontWeight: 'bold',
        },
      }],
    };
  }, [portfolio, projectBreakdown]);

  return <ChartWrapper option={option} height="380px" />;
}

/* ================================================================== */
/*  PHASE 4 — DEPENDENCY IMPACT GRAPH                                  */
/* ================================================================== */

function DependencyImpactGraph({
  tasks, projectBreakdown, onClick,
}: {
  tasks: any[]; projectBreakdown: any[]; onClick?: (p: any) => void;
}) {
  const { graphNodes, graphLinks, criticalPath } = useMemo(() => {
    if (!tasks.length) return { graphNodes: [], graphLinks: [], criticalPath: new Set<string>() };

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
      if (pred && pred !== tid && taskMap.has(pred)) {
        linkData.push({ source: pred, target: tid, type: 'predecessor' });
      }
    });

    // Build node set
    const nodeIdSet = new Set<string>();
    const nodeList: any[] = [];
    const parentIds = [...childrenOf.keys()].sort((a, b) =>
      (childrenOf.get(b)?.length || 0) - (childrenOf.get(a)?.length || 0),
    );

    parentIds.forEach(pid => {
      if (nodeIdSet.size >= 50) return;
      const t = taskMap.get(pid); if (!t) return;
      nodeIdSet.add(pid);
      const hrs = Number(t.baselineHours || t.actualHours || 0);
      const pc = Number(t.percentComplete || 0);
      const isCrit = !!t.isCritical || (t.totalFloat != null && Number(t.totalFloat) <= 0);
      const variance = Number(t.actualHours || 0) - Number(t.baselineHours || 0);
      nodeList.push({
        id: pid, name: truncName(t.name || t.taskName || pid, 26),
        childCount: childrenOf.get(pid)?.length || 0, hours: hrs,
        pc, isCritical: isCrit, isParent: true, variance,
      });
      (childrenOf.get(pid) || []).forEach(cid => {
        if (nodeIdSet.size >= 50 || nodeIdSet.has(cid)) return;
        const ct = taskMap.get(cid); if (!ct) return;
        nodeIdSet.add(cid);
        const chrs = Number(ct.baselineHours || ct.actualHours || 0);
        const cpc = Number(ct.percentComplete || 0);
        const cCrit = !!ct.isCritical || (ct.totalFloat != null && Number(ct.totalFloat) <= 0);
        const cVar = Number(ct.actualHours || 0) - Number(ct.baselineHours || 0);
        nodeList.push({
          id: cid, name: truncName(ct.name || ct.taskName || cid, 26),
          childCount: childrenOf.get(cid)?.length || 0, hours: chrs,
          pc: cpc, isCritical: cCrit, isParent: childrenOf.has(cid), variance: cVar,
        });
      });
    });

    // Identify critical path nodes
    const critSet = new Set<string>();
    nodeList.forEach(n => { if (n.isCritical) critSet.add(n.id); });

    return {
      graphNodes: nodeList,
      graphLinks: linkData.filter(l => nodeIdSet.has(l.source) && nodeIdSet.has(l.target)),
      criticalPath: critSet,
    };
  }, [tasks]);

  const option: EChartsOption = useMemo(() => {
    if (!graphNodes.length) return {};
    const maxH = Math.max(...graphNodes.map((n: any) => n.hours), 1);
    const maxC = Math.max(...graphNodes.map((n: any) => n.childCount), 1);

    return {
      tooltip: {
        ...TT, trigger: 'item',
        formatter: (params: any) => {
          const d = params.data;
          if (params.dataType === 'edge') {
            return `${d.sourceName || d.source} → ${d.targetName || d.target}<br/>Type: ${d.linkType === 'parent' ? 'Parent→Child' : 'Predecessor'}`;
          }
          return `<strong>${d.name}</strong><br/>Hours: ${Math.round(d.hours || 0).toLocaleString()}<br/>Progress: ${Math.round(d.pc || 0)}%<br/>Children: ${d.childCount || 0}${d.isCritical ? '<br/><span style="color:' + C.teal + ';font-weight:700">CRITICAL PATH</span>' : ''}${d.variance > 0 ? '<br/><span style="color:' + C.red + '">+' + Math.round(d.variance) + ' hrs over</span>' : ''}`;
        },
      },
      legend: {
        data: ['Critical Path', 'High Variance', 'Phase', 'Task'],
        bottom: 0, textStyle: { color: C.textMuted, fontSize: 10 },
      },
      series: [{
        type: 'graph', layout: 'force', roam: true, draggable: true,
        force: { repulsion: 280, gravity: 0.1, edgeLength: [60, 180], layoutAnimation: true },
        categories: [
          { name: 'Critical Path', itemStyle: { color: C.teal } },
          { name: 'High Variance', itemStyle: { color: C.red } },
          { name: 'Phase', itemStyle: { color: C.amber } },
          { name: 'Task', itemStyle: { color: C.blue } },
        ],
        data: graphNodes.map((n: any) => ({
          name: n.name, id: n.id,
          symbolSize: n.isParent
            ? Math.max(32, Math.min(65, 32 + (n.childCount / maxC) * 33))
            : Math.max(16, Math.min(40, (n.hours / maxH) * 40)),
          category: n.isCritical ? 0 : n.variance > 0 && !n.isParent ? 1 : n.isParent ? 2 : 3,
          hours: n.hours, pc: n.pc, childCount: n.childCount,
          isCritical: n.isCritical, variance: n.variance,
          label: {
            show: n.isParent || n.isCritical,
            position: 'right', color: C.textPrimary, fontSize: 10,
          },
          itemStyle: {
            shadowBlur: n.isCritical ? 20 : n.isParent ? 8 : 3,
            shadowColor: n.isCritical ? `${C.teal}90` : 'rgba(0,0,0,0.2)',
            borderWidth: n.isCritical ? 3 : n.isParent ? 2 : 1,
            borderColor: n.isCritical ? C.teal : n.isParent ? C.amber : `${C.blue}80`,
          },
        })),
        links: graphLinks.map((l: any) => {
          const src = graphNodes.find((n: any) => n.id === l.source);
          const tgt = graphNodes.find((n: any) => n.id === l.target);
          const isCritLink = criticalPath.has(l.source) && criticalPath.has(l.target);
          return {
            source: l.source, target: l.target,
            sourceName: src?.name, targetName: tgt?.name, linkType: l.type,
            lineStyle: {
              color: isCritLink ? C.teal : l.type === 'predecessor' ? `${C.red}80` : `${C.amber}50`,
              width: isCritLink ? 4 : l.type === 'predecessor' ? 2.5 : 1.5,
              curveness: 0.15,
              type: isCritLink ? 'solid' as const : l.type === 'parent' ? 'solid' as const : 'dashed' as const,
              shadowBlur: isCritLink ? 8 : 0,
              shadowColor: isCritLink ? `${C.teal}60` : 'transparent',
            },
            symbol: ['none', 'arrow'], symbolSize: [0, 8],
          };
        }),
        emphasis: {
          focus: 'adjacency',
          itemStyle: { shadowBlur: 20, shadowColor: `${C.teal}80` },
          lineStyle: { width: 4, color: C.teal },
        },
      }],
    };
  }, [graphNodes, graphLinks, criticalPath]);

  if (!graphNodes.length) return <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No task dependency data</div>;

  const critCount = graphNodes.filter(n => n.isCritical).length;
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center', fontSize: '0.7rem' }}>
        <span style={{ color: C.textMuted }}>{graphNodes.length} nodes | {graphLinks.length} edges</span>
        <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 6, background: `${C.teal}20`, color: C.teal, fontWeight: 700 }}>
          {critCount} Critical Path {critCount === 1 ? 'Node' : 'Nodes'}
        </span>
      </div>
      <ChartWrapper option={option} height="520px" onClick={onClick} />
    </div>
  );
}

/* ================================================================== */
/*  PHASE 5A — ROLE-BASED HEATMAP                                      */
/* ================================================================== */

function RoleHeatmap({ hours, employees }: { hours: any[]; employees: any[] }) {
  const option: EChartsOption = useMemo(() => {
    // Group hours by employee role × week
    const roleMap = new Map<string, string>();
    employees.forEach((e: any) => {
      const id = e.id || e.employeeId;
      const role = e.role || e.jobTitle || e.position || 'Unknown';
      roleMap.set(id, role);
    });

    // Build week labels (last 12 weeks)
    const weeks: string[] = [];
    const weekStarts: Date[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7 - d.getDay());
      weekStarts.push(new Date(d));
      weeks.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }

    // Aggregate hours by role × week
    const roleWeekHours = new Map<string, number[]>();
    hours.forEach((h: any) => {
      const empId = h.employeeId || h.employee_id;
      const role = roleMap.get(empId) || 'Unknown';
      const hrs = Number(h.hours || 0);
      if (hrs <= 0) return;

      const entryDate = new Date(h.date);
      const weekIdx = weekStarts.findIndex((ws, i) => {
        const weekEnd = new Date(ws);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return entryDate >= ws && entryDate < weekEnd;
      });
      if (weekIdx < 0) return;

      if (!roleWeekHours.has(role)) roleWeekHours.set(role, Array(12).fill(0));
      roleWeekHours.get(role)![weekIdx] += hrs;
    });

    // Sort by total hours and take top 12
    const roles = [...roleWeekHours.entries()]
      .map(([role, hrs]) => ({ role: truncName(role, 22), hrs, total: hrs.reduce((s, h) => s + h, 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);

    if (!roles.length) {
      // Fallback with dummy data
      return {};
    }

    const roleNames = roles.map(r => r.role);
    const heatData: [number, number, number][] = [];
    let maxVal = 0;
    roles.forEach((r, ri) => {
      r.hrs.forEach((h, wi) => {
        heatData.push([wi, ri, Math.round(h)]);
        if (h > maxVal) maxVal = h;
      });
    });

    return {
      tooltip: {
        ...TT,
        formatter: (params: any) => {
          const [wi, ri, val] = params.data;
          return `<strong>${roleNames[ri]}</strong><br/>Week: ${weeks[wi]}<br/>Hours: <strong>${val.toLocaleString()}</strong>`;
        },
      },
      grid: { left: 160, right: 60, top: 20, bottom: 50 },
      xAxis: {
        type: 'category', data: weeks, splitArea: { show: true },
        axisLabel: { color: C.textMuted, fontSize: 9, rotate: 30 },
      },
      yAxis: {
        type: 'category', data: roleNames,
        axisLabel: { color: C.textPrimary, fontSize: 10 },
        axisLine: { lineStyle: { color: C.axis } },
      },
      visualMap: {
        min: 0, max: Math.max(maxVal, 40), calculable: true,
        orient: 'vertical', right: 5, top: 20, bottom: 50,
        inRange: { color: [`${C.blue}10`, `${C.blue}40`, C.blue, C.amber, C.red] },
        textStyle: { color: C.textMuted, fontSize: 9 },
      },
      series: [{
        type: 'heatmap', data: heatData,
        label: { show: true, color: C.textPrimary, fontSize: 9, formatter: (p: any) => p.data[2] > 0 ? String(p.data[2]) : '' },
        itemStyle: { borderWidth: 2, borderColor: C.bgCard },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: `${C.teal}60` } },
      }],
    };
  }, [hours, employees]);

  if (!Object.keys(option).length) return <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No employee/hours data for heatmap</div>;
  return <ChartWrapper option={option} height="400px" />;
}

/* ================================================================== */
/*  PHASE 5B — MEETING SNAPSHOT BUTTON                                 */
/* ================================================================== */

function MeetingSnapshotButton({ chartRefs }: { chartRefs?: any }) {
  const [exporting, setExporting] = useState(false);

  const handleSnapshot = useCallback(async () => {
    setExporting(true);
    try {
      // Collect all chart canvases on the page
      const canvases = document.querySelectorAll('canvas');
      if (canvases.length === 0) {
        alert('No charts found to export.');
        setExporting(false);
        return;
      }

      // Create a composite image
      const padding = 20;
      const maxWidth = Math.max(...Array.from(canvases).map(c => c.width));
      const totalHeight = Array.from(canvases).reduce((s, c) => s + c.height + padding, padding);

      const composite = document.createElement('canvas');
      composite.width = maxWidth + padding * 2;
      composite.height = totalHeight;
      const ctx = composite.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = C.bgSecondary;
      ctx.fillRect(0, 0, composite.width, composite.height);

      // Header
      ctx.fillStyle = C.teal;
      ctx.font = 'bold 20px system-ui';
      ctx.fillText(`Pinnacle Weekly Executive Summary — ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, padding, 30);

      let yOffset = 50;
      canvases.forEach(canvas => {
        try {
          ctx.drawImage(canvas, padding, yOffset);
          yOffset += canvas.height + padding;
        } catch { /* skip cross-origin canvases */ }
      });

      // Download
      const link = document.createElement('a');
      link.download = `pinnacle-executive-summary-${new Date().toISOString().split('T')[0]}.png`;
      link.href = composite.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Snapshot export failed:', err);
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <button
      onClick={handleSnapshot}
      disabled={exporting}
      style={{
        padding: '0.5rem 1rem', borderRadius: 8,
        border: `1px solid ${C.teal}`, background: `${C.teal}15`,
        color: C.teal, cursor: exporting ? 'wait' : 'pointer',
        fontSize: '0.75rem', fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 6,
        opacity: exporting ? 0.6 : 1,
        transition: 'all 0.15s',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {exporting ? 'Exporting...' : 'Meeting Snapshot'}
    </button>
  );
}

/* ================================================================== */
/*  MAIN PAGE                                                          */
/* ================================================================== */

export default function OverviewV2Page() {
  const {
    filteredData, isLoading, hierarchyFilter, setHierarchyFilter,
    variancePeriod, metricsHistory,
  } = useData();
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
    const tasks = data.tasks || [];
    const projects = data.projects || [];
    const hours = data.hours || [];
    const sites = data.sites || [];

    const nameMap = new Map<string, string>();
    projects.forEach((p: any) => nameMap.set(p.id || p.projectId, p.name || p.projectName || p.id));

    // Site lookup for asset-level rollup
    const siteMap = new Map<string, string>();
    const projToSite = new Map<string, string>();
    sites.forEach((s: any) => siteMap.set(s.id || s.siteId, s.name || 'Unknown Site'));
    projects.forEach((p: any) => {
      const siteId = p.siteId || p.site_id;
      if (siteId && siteMap.has(siteId)) projToSite.set(p.id || p.projectId, siteMap.get(siteId)!);
    });

    const planIds = new Set<string>();
    tasks.forEach((t: any) => { const pid = t.projectId || t.project_id; if (pid) planIds.add(pid); });

    const map = new Map<string, any>();
    tasks.forEach((t: any) => {
      const pid = t.projectId || t.project_id || 'Unknown';
      const key = aggregateBy === 'site' ? (projToSite.get(pid) || nameMap.get(pid) || pid) : pid;
      const name = aggregateBy === 'site' ? (projToSite.get(pid) || nameMap.get(pid) || pid) : (nameMap.get(pid) || pid);
      if (!map.has(key)) map.set(key, { name, tasks: 0, completed: 0, baselineHours: 0, actualHours: 0, pcSum: 0, chargeTypes: {} as Record<string, number>, hoursActual: 0, hoursCost: 0 });
      const e = map.get(key)!;
      e.tasks++;
      e.baselineHours += Number(t.baselineHours ?? t.budgetHours ?? 0) || 0;
      e.actualHours += Number(t.actualHours ?? 0) || 0;
      e.pcSum += Number(t.percentComplete ?? 0) || 0;
      if (String(t.status || '').toLowerCase().includes('complete') || (t.percentComplete || 0) >= 100) e.completed++;
    });

    hours.forEach((h: any) => {
      const pid = h.projectId || h.project_id;
      if (!pid || !planIds.has(pid)) return;
      const key = aggregateBy === 'site' ? (projToSite.get(pid) || nameMap.get(pid) || pid) : pid;
      const e = map.get(key);
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
  }, [data.tasks, data.projects, data.hours, data.sites, aggregateBy]);

  const portfolio = useMemo(() => {
    let totalBl = 0, totalAc = 0, totalEv = 0, tsHrs = 0, tsCost = 0;
    projectBreakdown.forEach(p => {
      totalBl += p.baselineHours; totalAc += p.actualHours;
      totalEv += p.baselineHours * (p.percentComplete / 100);
      tsHrs += p.timesheetHours; tsCost += p.timesheetCost;
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
      projectCount: projectBreakdown.length,
      totalHours: Math.round(totalAc), baselineHours: Math.round(totalBl),
      earnedHours: Math.round(totalEv), remainingHours: Math.round(Math.max(0, totalBl - totalAc)),
      timesheetHours: Math.round(tsHrs), timesheetCost: Math.round(tsCost),
    };
  }, [projectBreakdown]);

  /* ── Variance deltas from metricsHistory ── */
  const deltas = useMemo(() => {
    try {
      const comparison = getComparisonDates(variancePeriod);
      const current = getMetricsForPeriod(metricsHistory, comparison.current);
      const previous = getMetricsForPeriod(metricsHistory, comparison.previous);

      const spiV = calculateMetricVariance('spi', current, previous, comparison.periodLabel);
      const cpiV = calculateMetricVariance('cpi', current, previous, comparison.periodLabel);

      return {
        spi: spiV ? spiV.change : 0,
        cpi: cpiV ? cpiV.change : 0,
        health: 0, // No direct health history — derive from SPI+CPI change
      };
    } catch {
      return { spi: 0, cpi: 0, health: 0 };
    }
  }, [metricsHistory, variancePeriod]);

  const hasData = projectBreakdown.length > 0;

  /* ── Render ── */
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
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.6rem', color: C.teal, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
            Executive Meeting Dashboard
          </div>
          <div style={{ fontSize: '0.65rem', color: C.textMuted }}>
            {contextLabel} | {(data.tasks || []).length} tasks | {(data.hours || []).length} hours | {projectBreakdown.length} {aggregateBy === 'site' ? 'sites' : 'projects'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Aggregate toggle */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3 }}>
            {(['project', 'site'] as const).map(mode => (
              <button key={mode} onClick={() => setAggregateBy(mode)} style={{
                padding: '0.3rem 0.7rem', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3,
                background: aggregateBy === mode ? `${C.teal}20` : 'transparent',
                color: aggregateBy === mode ? C.teal : C.textMuted,
              }}>
                By {mode}
              </button>
            ))}
          </div>
          <MeetingSnapshotButton />
        </div>
      </div>

      {!hasData && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, textAlign: 'center' }}>
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="1.5" style={{ marginBottom: '1.5rem', opacity: 0.5 }}>
            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" />
          </svg>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem', fontWeight: 600, color: C.textPrimary }}>No Data Available</h2>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.9rem', color: C.textMuted, maxWidth: 420 }}>Upload project data from the Data Management page.</p>
          <a href="/project-controls/data-management" style={{ padding: '0.75rem 1.5rem', background: C.teal, color: '#000', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>Go to Data Management</a>
        </div>
      )}

      {hasData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* ═══ PHASE 1 — THE PULSE ═══ */}
          <SectionCard
            title="Portfolio Pulse"
            subtitle="Establish portfolio temperature in 10 seconds"
            badge={<PhaseBadge n={1} label="Pulse" />}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'center' }}>
              <TriGaugePulse
                healthScore={portfolio.healthScore}
                spi={portfolio.spi} cpi={portfolio.cpi}
                spiDelta={deltas.spi} cpiDelta={deltas.cpi} healthDelta={deltas.health}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 140 }}>
                {[
                  { label: 'Actual Hrs', value: fmtHrs(portfolio.totalHours), color: C.teal },
                  { label: 'Baseline Hrs', value: fmtHrs(portfolio.baselineHours), color: C.textSecondary },
                  { label: 'Earned Value', value: fmtHrs(portfolio.earnedHours), color: C.green },
                  { label: 'Remaining', value: fmtHrs(portfolio.remainingHours), color: portfolio.remainingHours > portfolio.baselineHours * 0.5 ? C.amber : C.green },
                  { label: 'Progress', value: `${portfolio.percentComplete}%`, color: portfolio.percentComplete >= 80 ? C.green : portfolio.percentComplete >= 50 ? C.amber : C.red },
                ].map(s => (
                  <div key={s.label} style={{ padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: '0.55rem', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* ═══ PHASE 2 — OPERATIONAL FRICTION ═══ */}
          <SectionCard
            title="Operational Friction — Hours Flow"
            subtitle="Portfolio → Projects → Charge Types → Outcome. Red glow = EX:QC ratio > 10:1 (quality crisis signal)"
            badge={<PhaseBadge n={2} label="Friction" />}
          >
            <HeatLinkSankey
              projectBreakdown={projectBreakdown}
              portfolio={portfolio}
              onClick={(p) => {
                if (!p?.name) return;
                crossFilter.toggleFilter({ type: 'project', value: p.name, label: p.name, source: 'sankey' });
              }}
            />
          </SectionCard>

          {/* ═══ PHASE 3 — THE FINISH LINE ═══ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '1rem' }}>
            <SectionCard
              title="Asset Compliance"
              subtitle="Client → Site → Project hierarchy. Click a slice to filter."
              badge={<PhaseBadge n={3} label="Finish Line" />}
            >
              <AssetComplianceSunburst
                data={data}
                projectBreakdown={projectBreakdown}
                onHierarchyClick={(path) => {
                  if (path.length >= 2) {
                    setHierarchyFilter({ path: [undefined, path[1], path[2], path[3]].filter(Boolean) as string[] });
                  }
                }}
              />
            </SectionCard>
            <SectionCard
              title="Predictive Burn"
              subtitle="Cumulative Actual vs Baseline. CPI projection from TODAY to finish. Red area = over-budget zone."
              badge={<PhaseBadge n={3} label="Finish Line" />}
            >
              <PredictiveBurn portfolio={portfolio} projectBreakdown={projectBreakdown} />
            </SectionCard>
          </div>

          {/* ═══ PHASE 4 — THE SPLASH ZONE ═══ */}
          <SectionCard
            title="Dependency Impact Graph"
            subtitle="Click a red node to see adjacency impact. Critical path highlighted in Teal. Drag to rearrange."
            badge={<PhaseBadge n={4} label="Splash Zone" />}
          >
            <DependencyImpactGraph
              tasks={data.tasks || []}
              projectBreakdown={projectBreakdown}
              onClick={(p) => {
                if (!p?.name) return;
                crossFilter.toggleFilter({ type: 'custom', value: p.name, label: p.name, source: 'dependency' });
              }}
            />
          </SectionCard>

          {/* ═══ PHASE 5 — CONTROLS ═══ */}
          <SectionCard
            title="Role-Based Utilization Heatmap"
            subtitle="Weekly hours by role across last 12 weeks. High-demand roles surface in red."
            badge={<PhaseBadge n={5} label="Controls" />}
          >
            <RoleHeatmap hours={data.hours || []} employees={data.employees || []} />
          </SectionCard>

          {/* Summary Table */}
          <SectionCard title={`${aggregateBy === 'site' ? 'Site' : 'Project'} Summary (${projectBreakdown.length})`} subtitle="Click any row for details" noPadding>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: C.bgCard, zIndex: 1 }}>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: C.bgCard, zIndex: 2 }}>{aggregateBy === 'site' ? 'Site' : 'Project'}</th>
                    <th className="number">Tasks</th>
                    <th className="number">SPI</th>
                    <th className="number">CPI</th>
                    <th className="number">Progress</th>
                    <th className="number">Baseline</th>
                    <th className="number">Actual</th>
                    <th className="number">Var%</th>
                  </tr>
                </thead>
                <tbody>
                  {projectBreakdown.map((p, i) => (
                    <tr key={p.id || i} style={{ cursor: 'pointer' }} onClick={() => {
                      setSelectedProject(p);
                      crossFilter.toggleFilter({ type: 'project', value: p.name, label: p.name, source: 'table' });
                    }}>
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
