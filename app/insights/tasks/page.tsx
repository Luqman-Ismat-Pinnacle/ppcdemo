'use client';

/**
 * @fileoverview Tasks - Production Control Center (Phase 1-5)
 * 
 * High-impact visualizations for task management:
 * - SME Saturation Heatmap (Phase 1)
 * - Technical Pipeline Sankey (Phase 2)
 * - Splash Zone Dependency Graph (Phase 3)
 * - Quality vs. Velocity Scatter (Phase 4)
 * - Operational Snapshot Ticker (Phase 5)
 * - Cross-sync filtering across all charts
 * 
 * @module app/insights/tasks/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import PageLoader from '@/components/ui/PageLoader';
import useCrossFilter, { CrossFilter } from '@/lib/hooks/useCrossFilter';
import type { EChartsOption } from 'echarts';
import { useRouter } from 'next/navigation';

/** Safe number formatting */
const sn = (v: any, decimals = 2): string => {
  const n = Number(v);
  return isFinite(n) ? n.toFixed(decimals) : '0';
};

const C = {
  teal: '#40E0D0', blue: '#3B82F6', purple: '#8B5CF6', amber: '#F59E0B',
  green: '#10B981', red: '#EF4444', pink: '#EC4899', cyan: '#06B6D4',
  textPrimary: '#f4f4f5', textMuted: '#a1a1aa', textSecondary: '#e4e4e7',
  border: '#3f3f46', bgCard: '#18181b', bgSecondary: '#141416',
  axis: '#3f3f46', gridLine: '#27272a',
};

const TT = {
  backgroundColor: 'rgba(15,15,18,0.96)', borderColor: C.border, borderWidth: 1,
  padding: [10, 15] as [number, number], textStyle: { color: '#fff', fontSize: 12 },
  confine: true, appendToBody: true,
  extraCssText: 'z-index:99999!important;backdrop-filter:blur(20px);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.45);',
};

// ===== UI COMPONENTS =====

function SectionCard({ title, subtitle, badge, children, noPadding = false, actions }: {
  title: string; subtitle?: string; badge?: React.ReactNode;
  children: React.ReactNode; noPadding?: boolean; actions?: React.ReactNode;
}) {
  return (
    <div style={{ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: C.textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>{title}{badge}</h3>
          {subtitle && <div style={{ fontSize: '0.6rem', color: C.textMuted }}>{subtitle}</div>}
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

function CrossFilterBar({
  filters,
  onRemove,
  onClear,
}: {
  filters: CrossFilter[];
  onRemove: (type: string, value?: string) => void;
  onClear: () => void;
}) {
  if (filters.length === 0) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
      background: 'linear-gradient(90deg, rgba(64,224,208,0.08), rgba(205,220,57,0.05))',
      borderRadius: '12px', border: '1px solid rgba(64,224,208,0.2)', marginBottom: '1rem', flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2">
          <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
        </svg>
        <span style={{ fontSize: '0.75rem', color: C.teal, fontWeight: 600 }}>FILTERED</span>
      </div>

      {filters.map((f) => (
        <div key={`${f.type}-${f.value}`} style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.75rem',
          background: C.bgSecondary, borderRadius: '20px', border: `1px solid ${C.border}`,
        }}>
          <span style={{ fontSize: '0.65rem', color: C.textMuted, textTransform: 'uppercase' }}>{f.type}:</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: C.textPrimary }}>{f.label}</span>
          <button onClick={() => onRemove(f.type, f.value)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: '2px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}

      <button onClick={onClear} style={{ marginLeft: 'auto', padding: '0.35rem 0.75rem', borderRadius: '6px', border: `1px solid ${C.border}`, background: 'transparent', color: C.textSecondary, fontSize: '0.75rem', cursor: 'pointer' }}>
        Clear All
      </button>
    </div>
  );
}

// ===== CHART COMPONENTS =====

const SMESaturationHeatmap = ({ tasks, employees, onClick }: { tasks: any[], employees: any[], onClick?: (params: any) => void }) => {
  const heatmapOption: EChartsOption = useMemo(() => {
    // 1. Get technical roles
    const roles = [...new Set(employees.map(e => e.role || 'Unknown'))].filter(r =>
      ['Engineer', 'Analyst', 'Technical', 'Quality', 'Developer', 'Lead'].some(kw => r.toLowerCase().includes(kw.toLowerCase()))
    ).sort();

    if (roles.length === 0) return {};

    // 2. Generate 12 weeks
    const weeks: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + (i * 7));
      weeks.push(d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }));
    }

    // 3. Data aggregation
    const data: [number, number, number][] = [];
    roles.forEach((role, rIdx) => {
      const roleEmps = employees.filter(e => e.role === role);
      const capacity = roleEmps.length * 40;

      weeks.forEach((week, wIdx) => {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() + (wIdx * 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        let planned = 0;
        tasks.forEach(t => {
          const tStart = t.startDate ? new Date(t.startDate) : null;
          const tEnd = (t.finishDate || t.dueDate) ? new Date(t.finishDate || t.dueDate) : null;
          if (tStart && tEnd && tStart < weekEnd && tEnd > weekStart) {
            const isAssigned = roleEmps.some(e => e.name === (t.assignedTo || t.assignedResource));
            if (isAssigned) {
              const totalDays = Math.max(1, (tEnd.getTime() - tStart.getTime()) / (1000 * 3600 * 24));
              const daily = (t.baselineHours || 0) / totalDays;
              const overlap = (Math.min(tEnd.getTime(), weekEnd.getTime()) - Math.max(tStart.getTime(), weekStart.getTime())) / (1000 * 3600 * 24);
              planned += daily * Math.max(0, overlap);
            }
          }
        });

        const sat = capacity > 0 ? Math.round((planned / capacity) * 100) : 0;
        data.push([wIdx, rIdx, sat]);
      });
    });

    return {
      tooltip: { ...TT, position: 'top', formatter: (p: any) => `${roles[p.data[1]]}<br/>Week of ${weeks[p.data[0]]}: <strong>${p.data[2]}% Saturation</strong>` },
      grid: { top: '5%', bottom: '15%', left: '15%', right: '5%' },
      xAxis: { type: 'category', data: weeks, axisLabel: { fontSize: 9, color: C.textMuted }, splitArea: { show: true } },
      yAxis: { type: 'category', data: roles, axisLabel: { fontSize: 9, color: C.textMuted }, splitArea: { show: true } },
      visualMap: { min: 0, max: 100, calculable: true, orient: 'horizontal', left: 'center', bottom: '0%', inRange: { color: [C.bgSecondary, C.teal, C.amber, C.red] } },
      series: [{ name: 'Saturation', type: 'heatmap', data, label: { show: true, fontSize: 8, formatter: (p: any) => p.data[2] > 0 ? `${p.data[2]}%` : '' }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } } }]
    };
  }, [tasks, employees]);

  return <ChartWrapper option={heatmapOption} height="350px" onClick={onClick} />;
};

const TechnicalPipelineSankey = ({ tasks, onClick }: { tasks: any[], onClick?: (params: any) => void }) => {
  const option: EChartsOption = useMemo(() => {
    if (!tasks.length) return {};
    const stages = ['Analysis', 'QC', 'Approval', 'Complete'];
    const pNames = [...new Set(tasks.map(t => (t as any).projectName || (t as any).project_name || 'Global'))].slice(0, 5);

    const nodes: any[] = [];
    const links: any[] = [];
    const added = new Set<string>();
    const addNode = (name: string, color: string) => { if (!added.has(name)) { nodes.push({ name, itemStyle: { color } }); added.add(name); } };

    pNames.forEach(p => addNode(p, C.teal));
    stages.forEach((s, i) => addNode(s, [C.blue, C.purple, C.amber, C.green][i]));

    pNames.forEach(p => {
      const pTasks = tasks.filter(t => ((t as any).projectName || (t as any).project_name) === p);
      const flow = { Analysis: 0, QC: 0, Approval: 0, Complete: 0 };
      pTasks.forEach((t: any) => {
        const name = (t.name || t.taskName || '').toLowerCase();
        const hrs = Number(t.actualHours || t.baselineHours || 0);
        const pc = Number(t.percentComplete || 0);
        if (pc >= 100) flow.Complete += hrs;
        else if (name.includes('qc')) flow.QC += hrs;
        else if (name.includes('approve')) flow.Approval += hrs;
        else flow.Analysis += hrs;
      });
      Object.entries(flow).forEach(([s, v]) => { if (v > 0) links.push({ source: p, target: s, value: Math.round(v) }); });
    });

    return {
      tooltip: { ...TT, trigger: 'item' },
      series: [{ type: 'sankey', layout: 'none', zoom: 1, emphasis: { focus: 'adjacency' }, data: nodes, links, lineStyle: { color: 'gradient', opacity: 0.4 }, label: { fontSize: 10, color: C.textPrimary } }]
    };
  }, [tasks]);

  return <ChartWrapper option={option} height="350px" onClick={onClick} />;
};

const SplashZoneGraph = ({ tasks }: { tasks: any[] }) => {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const { nodes, links, impactedNodeIds } = useMemo(() => {
    const nodes: any[] = [];
    const links: any[] = [];
    const successors = new Map<string, string[]>();

    tasks.forEach(t => {
      const id = t.taskId || t.id;
      if (t.predecessorId) {
        const list = successors.get(t.predecessorId) || [];
        list.push(id);
        successors.set(t.predecessorId, list);
      }
    });

    const impacted = new Set<string>();
    if (selectedNode) {
      const queue = [selectedNode];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (!impacted.has(current)) {
          impacted.add(current);
          const next = successors.get(current) || [];
          queue.push(...next);
        }
      }
    }

    // Limit to tasks with dependencies or late/blocked for performance/clarity
    const relevantTasks = tasks.filter(t => t.predecessorId || t.isCritical || (t.status || '').toLowerCase().includes('block'));

    relevantTasks.forEach(t => {
      const id = t.taskId || t.id;
      const isLate = new Date(t.finishDate || t.dueDate) < new Date() && (t.percentComplete || 0) < 100;
      const isBlocked = (t.status || '').toLowerCase().includes('block');
      const inSplashZone = impacted.has(id) && id !== selectedNode;

      nodes.push({
        id,
        name: t.taskName || t.name || id,
        value: t.baselineHours || 0,
        symbolSize: Math.max(10, Math.min(35, (t.baselineHours || 0) / 4)),
        itemStyle: {
          color: id === selectedNode ? C.pink : inSplashZone ? C.red : isBlocked ? C.red : isLate ? C.amber : C.teal,
          opacity: selectedNode && !impacted.has(id) ? 0.2 : 1
        },
        label: { show: (t.baselineHours || 0) > 40 || id === selectedNode }
      });

      if (t.predecessorId) {
        links.push({
          source: t.predecessorId,
          target: id,
          lineStyle: {
            color: impacted.has(t.predecessorId) && impacted.has(id) ? C.red : C.border,
            opacity: selectedNode && (!impacted.has(t.predecessorId) || !impacted.has(id)) ? 0.1 : 0.4
          }
        });
      }
    });

    return { nodes, links, impactedNodeIds: impacted };
  }, [tasks, selectedNode]);

  const option: EChartsOption = useMemo(() => ({
    tooltip: { ...TT, trigger: 'item' },
    series: [{
      type: 'graph', layout: 'force', draggable: true,
      data: nodes, links: links,
      force: { repulsion: 200, edgeLength: [50, 150], gravity: 0.1 },
      label: { position: 'right', fontSize: 9, color: C.textSecondary },
      emphasis: { focus: 'adjacency', lineStyle: { width: 3 } }
    }]
  }), [nodes, links]);

  const onChartClick = (params: any) => {
    if (params.dataType === 'node') {
      setSelectedNode(params.data.id === selectedNode ? null : params.data.id);
    } else {
      setSelectedNode(null);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {selectedNode && (
        <div style={{ padding: '0.5rem 1rem', marginBottom: '0.75rem', background: `${C.pink}15`, border: `1px solid ${C.pink}40`, borderRadius: 8, fontSize: '0.7rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><span style={{ color: C.pink, fontWeight: 700 }}>SPLASH ZONE ACTIVE:</span> {impactedNodeIds.size - 1} downstream tasks impacted by this node.</div>
          <button onClick={() => setSelectedNode(null)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '0.65rem' }}>RESET</button>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChartWrapper option={option} height="100%" onClick={onChartClick} />
      </div>
    </div>
  );
};

// ===== PHASE 4: QUALITY VS. VELOCITY SCATTER =====

const AnalystPerformanceScatter = ({ tasks, qcData }: { tasks: any[], qcData: any[] }) => {
  const option: EChartsOption = useMemo(() => {
    // Build analyst map: name -> { hours, passRate }
    const analystMap = new Map<string, { hours: number; taskCount: number; passRate: number; name: string }>();

    // Aggregate hours per analyst from tasks
    tasks.forEach((t: any) => {
      const name = t.assignedResource || t.assignedTo;
      if (!name) return;
      const existing = analystMap.get(name) || { hours: 0, taskCount: 0, passRate: 0, name };
      existing.hours += Number(t.actualHours || 0);
      existing.taskCount += 1;
      analystMap.set(name, existing);
    });

    // Merge QC data for pass rates
    qcData.forEach((q: any) => {
      const existing = analystMap.get(q.name);
      if (existing) {
        existing.passRate = q.passRate || (q.closedCount > 0 ? Math.round((q.passCount / q.closedCount) * 100) : 0);
      }
    });

    const analysts = [...analystMap.values()].filter(a => a.hours > 0 && a.taskCount > 0);
    if (analysts.length === 0) return {};

    // X = velocity (hrs per task), Y = QC pass rate (%)
    const scatterData = analysts.map(a => ({
      value: [Math.round((a.hours / a.taskCount) * 10) / 10, a.passRate],
      name: a.name,
      symbolSize: Math.max(8, Math.min(30, a.taskCount * 2)),
    }));

    const maxVelocity = Math.max(...scatterData.map(d => d.value[0]), 20);
    const midX = maxVelocity / 2;

    return {
      tooltip: { ...TT, formatter: (p: any) => `<strong>${p.data.name}</strong><br/>Velocity: ${p.data.value[0]} hrs/task<br/>QC Pass Rate: ${p.data.value[1]}%` },
      grid: { top: '10%', bottom: '15%', left: '12%', right: '5%' },
      xAxis: { name: 'Velocity (hrs/task)', nameLocation: 'middle', nameGap: 30, type: 'value', axisLabel: { fontSize: 9, color: C.textMuted }, splitLine: { lineStyle: { color: C.gridLine } } },
      yAxis: { name: 'QC Pass Rate (%)', nameLocation: 'middle', nameGap: 35, type: 'value', min: 0, max: 100, axisLabel: { fontSize: 9, color: C.textMuted }, splitLine: { lineStyle: { color: C.gridLine } } },
      series: [
        {
          type: 'scatter', data: scatterData,
          itemStyle: {
            color: (p: any) => {
              const [vel, qc] = p.data.value;
              // Quadrant coloring: High QC + Low Velocity = green, High QC + High Velocity = blue, Low QC = amber/red
              if (qc >= 80 && vel <= midX) return C.green;
              if (qc >= 80 && vel > midX) return C.blue;
              if (qc >= 50) return C.amber;
              return C.red;
            }
          },
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.4)' } },
        },
        // Quadrant lines
        { type: 'line', markLine: { silent: true, lineStyle: { color: C.border, type: 'dashed' }, data: [{ yAxis: 80 }, { xAxis: midX }], label: { show: false } }, data: [] },
      ]
    };
  }, [tasks, qcData]);

  return <ChartWrapper option={option} height="350px" />;
};

// ===== PHASE 5: OPERATIONAL SNAPSHOT TICKER =====

const OperationalSnapshotTicker = ({ tasks, employees, qcData }: { tasks: any[], employees: any[], qcData: any[] }) => {
  const metrics = useMemo(() => {
    const totalTasks = tasks.length;
    const completed = tasks.filter(t => (t.percentComplete || 0) >= 100).length;
    const inProgress = tasks.filter(t => { const pc = t.percentComplete || 0; return pc > 0 && pc < 100; }).length;
    const blocked = tasks.filter(t => (t.status || '').toLowerCase().includes('block')).length;
    const totalPlanned = tasks.reduce((s, t) => s + (Number(t.baselineHours) || 0), 0);
    const totalActual = tasks.reduce((s, t) => s + (Number(t.actualHours) || 0), 0);
    const efficiency = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;
    const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;
    const avgPassRate = qcData.length > 0
      ? Math.round(qcData.reduce((s, q) => s + (q.passRate || 0), 0) / qcData.length)
      : 0;
    const activeEmployees = new Set(tasks.map(t => t.assignedResource || t.assignedTo).filter(Boolean)).size;

    return [
      { label: 'Completion Rate', value: `${completionRate}%`, color: completionRate >= 80 ? C.green : completionRate >= 50 ? C.amber : C.red, sub: `${completed}/${totalTasks} tasks` },
      { label: 'Efficiency Index', value: `${efficiency}%`, color: efficiency <= 105 ? C.green : efficiency <= 120 ? C.amber : C.red, sub: `${Math.round(totalActual)}h actual / ${Math.round(totalPlanned)}h planned` },
      { label: 'QC Pass Rate', value: `${avgPassRate}%`, color: avgPassRate >= 90 ? C.green : avgPassRate >= 75 ? C.amber : C.red, sub: `${qcData.length} analysts reviewed` },
      { label: 'Active Resources', value: `${activeEmployees}`, color: C.cyan, sub: `of ${employees.length} total` },
      { label: 'In Progress', value: `${inProgress}`, color: C.blue, sub: `${blocked} blocked` },
    ];
  }, [tasks, employees, qcData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {metrics.map((m, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: C.bgSecondary, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ width: 4, height: 28, borderRadius: 2, background: m.color, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.6rem', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{m.label}</div>
            <div style={{ fontSize: '0.7rem', color: C.textMuted }}>{m.sub}</div>
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: m.color }}>{m.value}</div>
        </div>
      ))}
    </div>
  );
};

// ===== MAIN PAGE =====

export default function TasksPage() {
  const { data, isLoading } = useData();
  const crossFilter = useCrossFilter();
  const router = useRouter();

  const crossFilteredTasks = useMemo(() => {
    let list = data.tasks || [];
    crossFilter.activeFilters.forEach(f => {
      if (f.type === 'project') list = list.filter(t => ((t as any).projectName || (t as any).project_name || '').toLowerCase().includes(f.value.toLowerCase()));
      if (f.type === 'status') list = list.filter(t => { const pc = t.percentComplete || 0; return f.value === 'Complete' ? pc >= 100 : pc > 0 && pc < 100; });
    });
    return list;
  }, [data.tasks, crossFilter.activeFilters]);

  const stats = useMemo(() => {
    const list = crossFilteredTasks;
    const completed = list.filter(t => (t.percentComplete || 0) >= 100).length;
    const totalActual = list.reduce((sum, t) => sum + (Number(t.actualHours) || 0), 0);
    return {
      total: list.length,
      progress: list.length > 0 ? Math.round((completed / list.length) * 100) : 0,
      hours: Math.round(totalActual)
    };
  }, [crossFilteredTasks]);

  const hasData = (data.tasks?.length ?? 0) > 0;

  if (isLoading) return <PageLoader />;

  if (!hasData) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', background: C.bgCard, borderRadius: 24, margin: '2rem' }}>
        <h2 style={{ color: C.textPrimary, marginBottom: '1rem' }}>No Production Data</h2>
        <p style={{ color: C.textMuted, marginBottom: '2rem' }}>Production metrics are generated from plan-enabled projects. Use the Project Plan page to create projects with task structures.</p>
        <button onClick={() => router.push('/insights/project-plan')} style={{ background: C.teal, color: '#000', padding: '0.75rem 1.5rem', borderRadius: 8, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Go to Project Plan</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: C.textPrimary, letterSpacing: '-0.02em' }}>Production Control Center</h1>
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: C.teal, fontWeight: 700 }}>{stats.hours.toLocaleString()}h</span> <span style={{ color: C.textMuted, fontSize: '0.8rem' }}>Total Actual</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: C.blue, fontWeight: 700 }}>{stats.progress}%</span> <span style={{ color: C.textMuted, fontSize: '0.8rem' }}>Completion Rate</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: C.purple, fontWeight: 700 }}>{stats.total}</span> <span style={{ color: C.textMuted, fontSize: '0.8rem' }}>Active Tasks</span></div>
        </div>
      </div>

      <CrossFilterBar filters={crossFilter.activeFilters} onRemove={crossFilter.removeFilter} onClear={crossFilter.clearFilters} />

      {/* Main Grid — Row 1: 2-col */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
        <SectionCard title="Bottleneck Radar" subtitle="SME Saturation Heatmap (12-Week Projection)" badge={<Badge label="Capacity" color={C.red} />}>
          <SMESaturationHeatmap tasks={data.tasks || []} employees={data.employees || []} />
        </SectionCard>

        <SectionCard title="Production Line" subtitle="Technical Pipeline (Subproject to Stage Flow)" badge={<Badge label="Live" color={C.green} />}>
          <TechnicalPipelineSankey tasks={crossFilteredTasks} />
        </SectionCard>
      </div>

      {/* Row 2: 3-col */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
        <SectionCard title="Impact Analysis" subtitle="The Splash Zone (Dependency Blast Radius)" badge={<Badge label="Risk" color={C.pink} />}>
          <SplashZoneGraph tasks={crossFilteredTasks} />
        </SectionCard>

        <SectionCard title="Performance Quadrant" subtitle="Quality vs. Velocity (Analyst Scatter)" badge={<Badge label="QC" color={C.purple} />}>
          <AnalystPerformanceScatter tasks={crossFilteredTasks} qcData={data.qcByNameAndRole || []} />
        </SectionCard>

        <SectionCard title="Operational Snapshot" subtitle="Real-time KPIs and Delta Indicators" badge={<Badge label="Live" color={C.cyan} />}>
          <OperationalSnapshotTicker tasks={crossFilteredTasks} employees={data.employees || []} qcData={data.qcByNameAndRole || []} />
        </SectionCard>
      </div>

      {/* Footer Ticker */}
      <div style={{ padding: '0.75rem 1rem', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '2rem', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: '0.7rem', color: C.teal, fontWeight: 700 }}>ALL PHASES ACTIVE</span>
        <span style={{ fontSize: '0.7rem', color: C.textMuted }}>SMES: {data.employees?.length || 0}</span>
        <span style={{ fontSize: '0.7rem', color: C.textMuted }}>TASKS: {(data.tasks?.length || 0).toLocaleString()}</span>
        <span style={{ fontSize: '0.7rem', color: C.textMuted }}>QC ANALYSTS: {(data.qcByNameAndRole?.length || 0)}</span>
      </div>
    </div>
  );
}
