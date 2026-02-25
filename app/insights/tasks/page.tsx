'use client';

/**
 * @fileoverview Tasks — Production Floor
 * 
 * Granular "Production Floor" view for micro-decision making:
 * - Phase 1: Task Lifecycle "Pulse" Timeline (time-in-state by charge type)
 * - Phase 2: Priority & Resource Demand Engine (value vs risk scatter)
 * - Phase 3: TPW vs Execute Drill-Down Donut
 * - Phase 4: Contributor Efficiency Swimlanes
 * - Phase 5: Sprint Integration Panel
 * - Phase 6: Site/Sprint View Toggle + Ghost Bars
 * 
 * @module app/insights/tasks/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import ContainerLoader from '@/components/ui/ContainerLoader';
import useCrossFilter, { CrossFilter } from '@/lib/hooks/useCrossFilter';
import type { EChartsOption } from 'echarts';
import { useRouter } from 'next/navigation';

// ===== THEME =====

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

const CHARGE_COLORS: Record<string, string> = { EX: C.teal, QC: C.purple, CR: C.amber, TPW: C.pink, Other: C.blue };
const asNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ===== SHARED UI =====

function SectionCard({ title, subtitle, badge, children, noPadding = false, actions }: {
  title: string; subtitle?: string; badge?: React.ReactNode;
  children: React.ReactNode; noPadding?: boolean; actions?: React.ReactNode;
}) {
  return (
    <div style={{ background: C.bgCard, borderRadius: 18, border: `1px solid ${C.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '0.95rem 1.15rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: C.textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>{title}{badge}</h3>
          {subtitle && <div style={{ fontSize: '0.72rem', color: C.textMuted }}>{subtitle}</div>}
        </div>
        {actions}
      </div>
      <div style={{ padding: noPadding ? 0 : '1rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${color}18`, color, letterSpacing: 0.4, textTransform: 'uppercase', marginLeft: 4 }}>{label}</span>;
}

function CrossFilterBar({ filters, onRemove, onClear }: { filters: CrossFilter[]; onRemove: (type: string, value?: string) => void; onClear: () => void; }) {
  if (filters.length === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'linear-gradient(90deg, rgba(64,224,208,0.08), rgba(205,220,57,0.05))', borderRadius: '12px', border: '1px solid rgba(64,224,208,0.2)', marginBottom: '1rem', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2"><polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" /></svg>
        <span style={{ fontSize: '0.75rem', color: C.teal, fontWeight: 600 }}>FILTERED</span>
      </div>
      {filters.map(f => (
        <div key={`${f.type}-${f.value}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.75rem', background: C.bgSecondary, borderRadius: '20px', border: `1px solid ${C.border}` }}>
          <span style={{ fontSize: '0.65rem', color: C.textMuted, textTransform: 'uppercase' }}>{f.type}:</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: C.textPrimary }}>{f.label}</span>
          <button onClick={() => onRemove(f.type, f.value)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: '2px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      ))}
      <button onClick={onClear} style={{ marginLeft: 'auto', padding: '0.35rem 0.75rem', borderRadius: '6px', border: `1px solid ${C.border}`, background: 'transparent', color: C.textSecondary, fontSize: '0.75rem', cursor: 'pointer' }}>Clear All</button>
    </div>
  );
}

// ===== PHASE 1: TASK LIFECYCLE PULSE TIMELINE =====

const TaskLifecyclePulse = ({ task, hours }: { task: any; hours: any[] }) => {
  const lifecycle = useMemo(() => {
    const taskId = task.taskId || task.id;
    const taskHours = hours.filter((h: any) => h.taskId === taskId);

    // Group by charge type
    const byType: Record<string, number> = { EX: 0, QC: 0, CR: 0, TPW: 0, Other: 0 };
    taskHours.forEach((h: any) => {
      const ct = (h.chargeType || '').toUpperCase();
      const hrs = asNumber(h.hours);
      if (ct === 'EX') byType.EX += hrs;
      else if (ct === 'QC') byType.QC += hrs;
      else if (ct === 'CR') byType.CR += hrs;
      else if (ct.includes('TPW') || ct.includes('TRAIN')) byType.TPW += hrs;
      else byType.Other += hrs;
    });

    const totalHours = Object.values(byType).reduce((s, v) => s + v, 0);
    const createdDate = new Date(task.createdAt || task.startDate || task.baselineStartDate);
    const dwellDays = Math.max(1, Math.round((Date.now() - createdDate.getTime()) / (1000 * 3600 * 24)));

    // Detect dominant bottleneck
    let alert = '';
    const nonExPct = totalHours > 0 ? ((byType.QC + byType.CR + byType.TPW) / totalHours) * 100 : 0;
    if (nonExPct > 60 && totalHours > 0) {
      const dominant = byType.QC >= byType.CR && byType.QC >= byType.TPW ? 'Internal QC' : byType.CR >= byType.TPW ? 'Customer Relations' : 'TPW Overhead';
      alert = `Life-cycle Alert: Task '${task.taskName || task.name}' has existed for ${dwellDays} days, but ${Math.round(nonExPct)}% of its logged time was spent in '${dominant}' wait-states. This is a sign-off bottleneck, not an execution issue.`;
    }

    return { byType, totalHours, dwellDays, alert };
  }, [task, hours]);

  const segments = Object.entries(lifecycle.byType).filter(([, v]) => v > 0);
  const total = asNumber(lifecycle.totalHours) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Task header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: C.textPrimary }}>{task.taskName || task.name}</div>
          <div style={{ fontSize: '0.65rem', color: C.textMuted }}>{task.taskId || task.id} | {(task as any).projectName || (task as any).project_name || 'Project'}</div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.55rem', color: C.textMuted, textTransform: 'uppercase' }}>Dwell Time</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: lifecycle.dwellDays > 14 ? C.red : C.teal }}>{lifecycle.dwellDays}d</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.55rem', color: C.textMuted, textTransform: 'uppercase' }}>Active Time</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: C.blue }}>{asNumber(lifecycle?.totalHours ?? 0).toFixed(1)}h</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.55rem', color: C.textMuted, textTransform: 'uppercase' }}>Complete</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: (task.percentComplete || 0) >= 100 ? C.green : C.amber }}>{task.percentComplete || 0}%</div>
          </div>
        </div>
      </div>

      {/* Segmented bar */}
      <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', background: C.bgSecondary }}>
        {segments.map(([type, value]) => (
          <div key={type} style={{ width: `${(asNumber(value) / total) * 100}%`, background: CHARGE_COLORS[type] || C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', fontWeight: 700, color: '#000', minWidth: 24, transition: 'width 0.3s ease' }} title={`${type}: ${asNumber(value).toFixed(1)}h`}>
            {asNumber(value) > total * 0.08 ? `${type} ${asNumber(value).toFixed(0)}h` : ''}
          </div>
        ))}
        {segments.length === 0 && <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: C.textMuted }}>No hours logged</div>}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {Object.entries(CHARGE_COLORS).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            <span style={{ fontSize: '0.55rem', color: C.textMuted }}>{type}</span>
          </div>
        ))}
      </div>

      {/* Auto-insight */}
      {lifecycle.alert && (
        <div style={{ padding: '0.5rem 0.75rem', background: `${C.amber}12`, border: `1px solid ${C.amber}30`, borderRadius: 8, fontSize: '0.65rem', color: C.amber, lineHeight: 1.5 }}>
          {lifecycle.alert}
        </div>
      )}
    </div>
  );
};

// ===== PHASE 2: PRIORITY & RESOURCE DEMAND SCATTER =====

const PriorityDemandScatter = ({ tasks, hours, onSelect }: { tasks: any[]; hours: any[]; onSelect: (task: any) => void }) => {
  const option: EChartsOption = useMemo(() => {
    // Build downstream dependency count
    const successorCount = new Map<string, number>();
    const countDownstream = (taskId: string, visited = new Set<string>()): number => {
      if (visited.has(taskId)) return 0;
      visited.add(taskId);
      const successors = tasks.filter(t => t.predecessorId === taskId);
      let count = successors.length;
      successors.forEach(s => { count += countDownstream(s.taskId || s.id, visited); });
      return count;
    };
    tasks.forEach(t => {
      const id = t.taskId || t.id;
      successorCount.set(id, countDownstream(id));
    });

    // Build chargeType breakdown per task from hours
    const taskChargeHours = new Map<string, { ex: number; qc: number }>();
    hours.forEach((h: any) => {
      if (!h.taskId) return;
      const existing = taskChargeHours.get(h.taskId) || { ex: 0, qc: 0 };
      const ct = (h.chargeType || '').toUpperCase();
      if (ct === 'EX') existing.ex += h.hours;
      else if (ct === 'QC') existing.qc += h.hours;
      taskChargeHours.set(h.taskId, existing);
    });

    const scatterData = tasks.filter(t => (t.baselineHours || 0) > 0).map(t => {
      const id = t.taskId || t.id;
      const downstream = successorCount.get(id) || 0;
      const variance = (Number(t.actualHours) || 0) - (Number(t.baselineHours) || 0);
      const efficiency = (Number(t.baselineHours) || 1) > 0 ? (Number(t.actualHours) || 0) / (Number(t.baselineHours) || 1) : 1;
      const finishDate = new Date(t.finishDate || t.baselineEndDate || t.dueDate || '2099-01-01');
      const daysToDeadline = Math.round((finishDate.getTime() - Date.now()) / (1000 * 3600 * 24));
      const charge = taskChargeHours.get(id) || { ex: 0, qc: 0 };

      let needsTag = '';
      if (charge.ex > 0 && charge.qc === 0 && (t.percentComplete || 0) > 50) needsTag = 'Needs QC';
      else if (efficiency > 1.2 && daysToDeadline < 3) needsTag = 'Needs Support';

      return {
        value: [downstream, Math.round(variance * 10) / 10],
        name: t.taskName || t.name || id,
        taskId: id,
        symbolSize: Math.max(8, Math.min(40, (Number(t.baselineHours) || 0) / 3)),
        needsTag,
        itemStyle: {
          color: needsTag === 'Needs Support' ? C.red : needsTag === 'Needs QC' ? C.purple : t.isCritical ? C.amber : C.teal,
        },
        label: {
          show: needsTag !== '' || downstream > 3,
          formatter: needsTag || (t.taskName || t.name || '').substring(0, 12),
          fontSize: 8, color: C.textSecondary, position: 'right' as const,
        },
        task: t,
      };
    });

    return {
      tooltip: {
        ...TT, formatter: (p: any) => {
          const d = p.data;
          return `<strong>${d.name}</strong><br/>Downstream Impact: ${d.value[0]} tasks<br/>Hours Variance: ${d.value[1] > 0 ? '+' : ''}${d.value[1]}h${d.needsTag ? `<br/><span style="color:${d.needsTag === 'Needs Support' ? C.red : C.purple}">${d.needsTag}</span>` : ''}`;
        }
      },
      grid: { top: '8%', bottom: '15%', left: '12%', right: '5%' },
      xAxis: { name: 'Downstream Impact (tasks)', nameLocation: 'middle', nameGap: 30, type: 'value', axisLabel: { fontSize: 9, color: C.textMuted }, splitLine: { lineStyle: { color: C.gridLine } } },
      yAxis: { name: 'Hours Variance', nameLocation: 'middle', nameGap: 40, type: 'value', axisLabel: { fontSize: 9, color: C.textMuted }, splitLine: { lineStyle: { color: C.gridLine } } },
      series: [{ type: 'scatter', data: scatterData, emphasis: { itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.5)' } } }],
    };
  }, [tasks, hours]);

  const handleClick = useCallback((params: any) => {
    if (params.data?.task) onSelect(params.data.task);
  }, [onSelect]);

  return <ChartWrapper option={option} height="100%" onClick={handleClick} />;
};

// ===== PHASE 3: TPW VS EXECUTE DONUT =====

const TPWExecuteDonut = ({ hours, nonExecuteHours, selectedTaskId }: { hours: any[]; nonExecuteHours: any; selectedTaskId: string | null }) => {
  const option: EChartsOption = useMemo(() => {
    let exHours = 0, qcHours = 0, crHours = 0, tpwHours = 0, otherHours = 0;

    if (selectedTaskId) {
      // Task-level drill-down from raw hours
      const taskHours = hours.filter((h: any) => h.taskId === selectedTaskId);
      taskHours.forEach((h: any) => {
        const ct = (h.chargeType || '').toUpperCase();
        if (ct === 'EX') exHours += h.hours;
        else if (ct === 'QC') qcHours += h.hours;
        else if (ct === 'CR') crHours += h.hours;
        else if (ct.includes('TPW') || ct.includes('TRAIN')) tpwHours += h.hours;
        else otherHours += h.hours;
      });
    } else {
      // Global from nonExecuteHours
      const total = hours.reduce((s: number, h: any) => s + (h.hours || 0), 0);
      const nonExTotal = nonExecuteHours?.total || 0;
      exHours = total - nonExTotal;

      (nonExecuteHours?.tpwComparison || []).forEach((item: any) => { tpwHours += item.value || 0; });
      (nonExecuteHours?.otherBreakdown || []).forEach((item: any) => {
        const name = (item.name || '').toLowerCase();
        if (name.includes('qc') || name.includes('quality')) qcHours += item.value || 0;
        else if (name.includes('cr') || name.includes('customer')) crHours += item.value || 0;
        else otherHours += item.value || 0;
      });
    }

    const executeTotal = exHours;
    const nonExecuteTotal = qcHours + crHours + tpwHours + otherHours;

    return {
      tooltip: { ...TT, trigger: 'item' },
      series: [
        {
          name: 'Work Split', type: 'pie', radius: ['38%', '58%'], center: ['50%', '50%'],
          label: { show: true, fontSize: 10, color: C.textSecondary, formatter: '{b}\n{d}%' },
          emphasis: { scale: true, scaleSize: 6 },
          data: [
            { value: Math.round(executeTotal), name: 'Execute', itemStyle: { color: C.teal } },
            { value: Math.round(nonExecuteTotal), name: 'Non-Execute', itemStyle: { color: C.pink } },
          ].filter(d => d.value > 0),
        },
        {
          name: 'Breakdown', type: 'pie', radius: ['65%', '80%'], center: ['50%', '50%'],
          label: { show: false },
          emphasis: { scale: true, scaleSize: 4 },
          data: [
            { value: Math.round(qcHours), name: 'QC', itemStyle: { color: C.purple } },
            { value: Math.round(crHours), name: 'CR', itemStyle: { color: C.amber } },
            { value: Math.round(tpwHours), name: 'TPW', itemStyle: { color: C.pink } },
            { value: Math.round(otherHours), name: 'Admin', itemStyle: { color: C.blue } },
          ].filter(d => d.value > 0),
        },
      ],
    };
  }, [hours, nonExecuteHours, selectedTaskId]);

  const total = hours.reduce((s: number, h: any) => s + asNumber(h.hours), 0);
  const tpwPct = asNumber(nonExecuteHours?.percent);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChartWrapper option={option} height="100%" />
      </div>
      {tpwPct > 20 && !selectedTaskId && (
        <div style={{ padding: '0.4rem 0.6rem', background: `${C.pink}12`, border: `1px solid ${C.pink}30`, borderRadius: 6, fontSize: '0.6rem', color: C.pink, marginTop: '0.5rem' }}>
          Efficiency Note: Non-execute overhead is {tpwPct.toFixed(0)}% of total hours. While this ensures quality, it is the primary driver of baseline variance.
        </div>
      )}
    </div>
  );
};

// ===== PHASE 4: CONTRIBUTOR EFFICIENCY SWIMLANES =====

const ContributorSwimlanes = ({ task, hours, laborByWorker, qcByNameAndRole }: {
  task: any; hours: any[]; laborByWorker: any[]; qcByNameAndRole: any[];
}) => {
  const contributors = useMemo(() => {
    const taskId = task.taskId || task.id;
    const taskHours = hours.filter((h: any) => h.taskId === taskId);

    // Aggregate by employee
    const empMap = new Map<string, { name: string; actual: number; employeeId: string }>();
    taskHours.forEach((h: any) => {
      const key = h.employeeId;
      const existing = empMap.get(key) || { name: '', actual: 0, employeeId: key };
      existing.actual += asNumber(h.hours);
      existing.name = h.employeeName || laborByWorker.find((w: any) => w.name)?.name || key;
      empMap.set(key, existing);
    });

    // Resolve names from laborByWorker if not in hours
    laborByWorker.forEach((w: any) => {
      empMap.forEach((v, k) => {
        if (!v.name || v.name === k) {
          // Try matching by employee ID pattern
          v.name = w.name || k;
        }
      });
    });

    const baselinePerContributor = empMap.size > 0 ? (Number(task.baselineHours) || 0) / empMap.size : 0;

    return [...empMap.values()].map(c => {
      const efficiency = baselinePerContributor > 0 ? Math.round((c.actual / baselinePerContributor) * 100) : 0;
      const qcInfo = qcByNameAndRole.find((q: any) => q.name === c.name);
      const passRate = qcInfo?.passRate || 0;

      return { ...c, efficiency, passRate, baselineEstimate: baselinePerContributor };
    }).sort((a, b) => b.actual - a.actual);
  }, [task, hours, laborByWorker, qcByNameAndRole]);

  if (contributors.length === 0) {
    return <div style={{ fontSize: '0.7rem', color: C.textMuted, padding: '1rem', textAlign: 'center' }}>No contributor data for this task.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', overflow: 'auto', maxHeight: 320 }}>
      {contributors.map((c, i) => {
        const effColor = c.efficiency <= 100 ? C.green : c.efficiency <= 120 ? C.amber : C.red;
        const qcColor = c.passRate >= 90 ? C.green : c.passRate >= 75 ? C.amber : C.red;

        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', background: C.bgSecondary, borderRadius: 8, border: `1px solid ${C.border}` }}>
            {/* Name */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: C.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || c.employeeId}</div>
              <div style={{ fontSize: '0.55rem', color: C.textMuted }}>{asNumber(c.actual).toFixed(1)}h logged</div>
            </div>

            {/* Efficiency gauge */}
            <div style={{ width: 56, textAlign: 'center' }}>
              <div style={{ fontSize: '0.5rem', color: C.textMuted, textTransform: 'uppercase' }}>Efficiency</div>
              <div style={{ width: '100%', height: 4, background: C.bgCard, borderRadius: 2, marginTop: 2 }}>
                <div style={{ width: `${Math.min(150, c.efficiency)}%`, maxWidth: '100%', height: '100%', background: effColor, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: effColor }}>{c.efficiency}%</div>
            </div>

            {/* QC pass rate */}
            <div style={{ width: 52, textAlign: 'center' }}>
              <div style={{ fontSize: '0.5rem', color: C.textMuted, textTransform: 'uppercase' }}>QC Rate</div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: qcColor, marginTop: 2 }}>{c.passRate > 0 ? `${c.passRate}%` : '--'}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ===== PHASE 5: SPRINT INTEGRATION PANEL =====

const SprintIntegrationPanel = ({ tasks, hours, sprintFlags, onToggle }: {
  tasks: any[]; hours: any[]; sprintFlags: Set<string>; onToggle: (taskId: string) => void;
}) => {
  const flaggedTasks = useMemo(() => {
    const taskChargeHours = new Map<string, { ex: number; qc: number }>();
    hours.forEach((h: any) => {
      if (!h.taskId) return;
      const existing = taskChargeHours.get(h.taskId) || { ex: 0, qc: 0 };
      const ct = (h.chargeType || '').toUpperCase();
      if (ct === 'EX') existing.ex += h.hours;
      else if (ct === 'QC') existing.qc += h.hours;
      taskChargeHours.set(h.taskId, existing);
    });

    return tasks.filter(t => {
      const id = t.taskId || t.id;
      const efficiency = (Number(t.baselineHours) || 1) > 0 ? (Number(t.actualHours) || 0) / (Number(t.baselineHours) || 1) : 1;
      const finishDate = new Date(t.finishDate || t.baselineEndDate || t.dueDate || '2099-01-01');
      const daysToDeadline = Math.round((finishDate.getTime() - Date.now()) / (1000 * 3600 * 24));
      const charge = taskChargeHours.get(id) || { ex: 0, qc: 0 };

      const needsQC = charge.ex > 0 && charge.qc === 0 && (t.percentComplete || 0) > 50;
      const needsSupport = efficiency > 1.2 && daysToDeadline < 3;

      return needsQC || needsSupport || sprintFlags.has(id);
    }).map(t => {
      const id = t.taskId || t.id;
      const charge = taskChargeHours.get(id) || { ex: 0, qc: 0 };
      const needsQC = charge.ex > 0 && charge.qc === 0 && (t.percentComplete || 0) > 50;
      const efficiency = (Number(t.baselineHours) || 1) > 0 ? (Number(t.actualHours) || 0) / (Number(t.baselineHours) || 1) : 1;
      const tag = needsQC ? 'Needs QC' : efficiency > 1.2 ? 'Needs Support' : 'Flagged';
      return { ...t, tag, isFlagged: sprintFlags.has(id) };
    });
  }, [tasks, hours, sprintFlags]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', overflow: 'auto', maxHeight: 320 }}>
      {flaggedTasks.length === 0 && <div style={{ fontSize: '0.7rem', color: C.textMuted, padding: '1rem', textAlign: 'center' }}>No tasks flagged for sprint attention.</div>}
      {flaggedTasks.map((t, i) => {
        const id = t.taskId || t.id;
        const tagColor = t.tag === 'Needs QC' ? C.purple : t.tag === 'Needs Support' ? C.red : C.cyan;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: C.bgSecondary, borderRadius: 8, border: `1px solid ${t.isFlagged ? C.cyan + '60' : C.border}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: C.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.taskName || t.name}</div>
              <Badge label={t.tag} color={tagColor} />
            </div>
            <button
              onClick={() => onToggle(id)}
              style={{
                padding: '0.3rem 0.6rem', borderRadius: 6, fontSize: '0.6rem', fontWeight: 700,
                border: `1px solid ${t.isFlagged ? C.cyan : C.border}`,
                background: t.isFlagged ? `${C.cyan}20` : 'transparent',
                color: t.isFlagged ? C.cyan : C.textMuted,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {t.isFlagged ? 'IN SPRINT' : 'ADD TO SPRINT'}
            </button>
          </div>
        );
      })}
      {sprintFlags.size > 0 && (
        <div style={{ padding: '0.4rem 0.6rem', background: `${C.cyan}12`, border: `1px solid ${C.cyan}30`, borderRadius: 6, fontSize: '0.6rem', color: C.cyan, marginTop: '0.25rem' }}>
          Decision Exported: {sprintFlags.size} task(s) flagged for the next Sprint due to efficiency deficit or milestone impact.
        </div>
      )}
    </div>
  );
};

// ===== TASK SELECTOR TABLE =====

const TaskSelectorTable = ({ tasks, selectedId, onSelect, view }: {
  tasks: any[]; selectedId: string | null; onSelect: (task: any) => void; view: 'sprint';
}) => {
  const sorted = useMemo(() => {
    const list = tasks.map(t => {
      const efficiency = (Number(t.baselineHours) || 1) > 0 ? Math.round(((Number(t.actualHours) || 0) / (Number(t.baselineHours) || 1)) * 100) : 0;
      return { ...t, efficiency };
    });

    return list.sort((a, b) => {
      const da = new Date(a.finishDate || a.baselineEndDate || a.dueDate || '2099-01-01').getTime();
      const db = new Date(b.finishDate || b.baselineEndDate || b.dueDate || '2099-01-01').getTime();
      return da - db;
    });
  }, [tasks, view]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', overflow: 'auto', maxHeight: 600 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 90px 90px 70px', gap: '0.6rem', padding: '0.55rem 0.85rem', fontSize: '0.62rem', color: C.textMuted, textTransform: 'uppercase', fontWeight: 700, position: 'sticky', top: 0, background: C.bgCard, zIndex: 1 }}>
        <span>Task</span><span>Deadline</span><span>Progress</span><span>Efficiency</span><span>Status</span>
      </div>
      {sorted.slice(0, 50).map((t, i) => {
        const id = t.taskId || t.id;
        const isSelected = id === selectedId;
        const pc = t.percentComplete || 0;
        const effColor = t.efficiency <= 100 ? C.green : t.efficiency <= 120 ? C.amber : C.red;
        const deadline = new Date(t.finishDate || t.baselineEndDate || t.dueDate || '2099-01-01');
        const dateLabel = Number.isNaN(deadline.getTime())
          ? '--'
          : deadline.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
        const daysLeft = Math.round((deadline.getTime() - Date.now()) / (1000 * 3600 * 24));
        const statusColor = pc >= 100 ? C.green : t.isCritical ? C.red : daysLeft < 3 ? C.amber : C.teal;

        return (
          <div
            key={i}
            onClick={() => onSelect(t)}
            style={{
              display: 'grid', gridTemplateColumns: '2fr 1.2fr 90px 90px 70px', gap: '0.6rem', padding: '0.6rem 0.85rem',
              background: isSelected ? `${C.teal}10` : 'transparent',
              border: isSelected ? `1px solid ${C.teal}40` : '1px solid transparent',
              borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: '0.82rem', color: C.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.taskName || t.name || id}</div>
            <div style={{ fontSize: '0.76rem', color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dateLabel}</div>
            <div style={{ fontSize: '0.74rem', color: pc >= 100 ? C.green : C.blue }}>{pc}%</div>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: effColor }}>{t.efficiency}%</div>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, alignSelf: 'center', justifySelf: 'center' }} />
          </div>
        );
      })}
    </div>
  );
};

// ===== MAIN PAGE =====

export default function TasksPage() {
  const { filteredData, isLoading } = useData();
  const data = filteredData;
  const crossFilter = useCrossFilter();
  const router = useRouter();
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const viewMode = 'sprint' as const;
  const [sprintFlags, setSprintFlags] = useState<Set<string>>(new Set());

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
    const totalActual = list.reduce((s, t) => s + (Number(t.actualHours) || 0), 0);
    const totalBaseline = list.reduce((s, t) => s + (Number(t.baselineHours) || 0), 0);
    const critical = list.filter(t => t.isCritical).length;
    return {
      total: list.length,
      completed,
      progress: list.length > 0 ? Math.round((completed / list.length) * 100) : 0,
      hours: Math.round(totalActual),
      baseline: Math.round(totalBaseline),
      efficiency: totalBaseline > 0 ? Math.round((totalActual / totalBaseline) * 100) : 0,
      critical,
    };
  }, [crossFilteredTasks]);

  const handleSelectTask = useCallback((task: any) => {
    setSelectedTask((prev: any) => {
      const prevId = prev?.taskId || prev?.id;
      const newId = task?.taskId || task?.id;
      return prevId === newId ? null : task;
    });
  }, []);

  const handleSprintToggle = useCallback((taskId: string) => {
    setSprintFlags(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const hasData = (data.tasks?.length ?? 0) > 0;

  if (!hasData && !isLoading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', background: C.bgCard, borderRadius: 24, margin: '2rem' }}>
        <h2 style={{ color: C.textPrimary, marginBottom: '1rem' }}>No Production Data</h2>
        <p style={{ color: C.textMuted, marginBottom: '2rem' }}>Production metrics are generated from plan-enabled projects. Use the Project Plan page to create projects with task structures.</p>
        <button onClick={() => router.push('/project-controls/project-plans')} style={{ background: C.teal, color: '#000', padding: '0.75rem 1.5rem', borderRadius: 8, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Go to Project Plans</button>
      </div>
    );
  }

  const selectedId = selectedTask ? (selectedTask.taskId || selectedTask.id) : null;

  if (isLoading) {
    return (
      <div style={{ padding: '1.25rem 1.5rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 96px)' }}>
        <ContainerLoader message="Loading Production Floor..." minHeight={300} />
      </div>
    );
  }

  return (
    <div style={{ padding: '1.25rem 1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: 'none', minHeight: 'calc(100vh - 96px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2.2rem', fontWeight: 900, color: C.textPrimary, letterSpacing: '-0.02em' }}>Production Floor</h1>
          <div style={{ fontSize: '0.82rem', color: C.textMuted, marginTop: 4 }}>360-degree task biographies for micro-decision making</div>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: C.teal, fontWeight: 700 }}>{stats.hours.toLocaleString()}h</span><span style={{ color: C.textMuted, fontSize: '0.75rem' }}>Actual</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: C.blue, fontWeight: 700 }}>{stats.efficiency}%</span><span style={{ color: C.textMuted, fontSize: '0.75rem' }}>Efficiency</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: C.purple, fontWeight: 700 }}>{stats.critical}</span><span style={{ color: C.textMuted, fontSize: '0.75rem' }}>Critical</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: C.green, fontWeight: 700 }}>{stats.progress}%</span><span style={{ color: C.textMuted, fontSize: '0.75rem' }}>Complete</span></div>
          </div>
        </div>

        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}`, padding: '0.45rem 0.9rem', fontSize: '0.72rem', color: C.teal, fontWeight: 700, textTransform: 'uppercase' }}>
          Sprint View
        </div>
      </div>

      <CrossFilterBar filters={crossFilter.activeFilters} onRemove={crossFilter.removeFilter} onClear={crossFilter.clearFilters} />

      {/* Phase 1: Lifecycle Pulse (full-width, shown when task selected) */}
      {selectedTask && (
        <SectionCard title="Task Lifecycle Biography" subtitle="Time-in-State by Work Type (EX / QC / CR / TPW)" badge={<Badge label="Deep Dive" color={C.teal} />}
          actions={<button onClick={() => setSelectedTask(null)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '0.3rem 0.6rem', color: C.textMuted, fontSize: '0.6rem', cursor: 'pointer' }}>DESELECT</button>}>
          <TaskLifecyclePulse task={selectedTask} hours={data.hours || []} />
        </SectionCard>
      )}

      {/* Row 1: Task Matrix + Priority Scatter */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedTask ? '1.15fr 1.35fr' : '1.3fr 1.7fr', gap: '1.5rem', alignItems: 'stretch' }}>
        <SectionCard title="Deliverable Matrix" subtitle={`Sprint View | ${crossFilteredTasks.length} Tasks`} badge={<Badge label={viewMode} color={C.blue} />}>
          <TaskSelectorTable tasks={crossFilteredTasks} selectedId={selectedId} onSelect={handleSelectTask} view={viewMode} />
        </SectionCard>

        <SectionCard title="Priority Demand Engine" subtitle="Value vs Risk (Downstream Impact x Hours Variance)" badge={<Badge label="Risk" color={C.red} />}>
          <PriorityDemandScatter tasks={crossFilteredTasks} hours={data.hours || []} onSelect={handleSelectTask} />
        </SectionCard>
      </div>

      {/* Row 2: TPW Donut + Contributors + Sprint Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedTask ? '1fr 1fr 1fr' : '1.1fr 1fr', gap: '1.5rem' }}>
        <SectionCard title="Efficiency Anatomy" subtitle={selectedId ? `Filtered: ${selectedTask?.taskName || selectedTask?.name}` : 'Global Execute vs Non-Execute Split'} badge={<Badge label="TPW" color={C.pink} />}>
          <TPWExecuteDonut hours={data.hours || []} nonExecuteHours={data.nonExecuteHours} selectedTaskId={selectedId} />
        </SectionCard>

        {selectedTask && (
          <SectionCard title="Contributor Swimlanes" subtitle="Individual Efficiency and QC Pass Rates" badge={<Badge label="People" color={C.cyan} />}>
            <ContributorSwimlanes task={selectedTask} hours={data.hours || []} laborByWorker={data.laborBreakdown?.byWorker || []} qcByNameAndRole={data.qcByNameAndRole || []} />
          </SectionCard>
        )}

        <SectionCard title="Sprint Planner" subtitle="Push Decisions to Next Sprint" badge={<Badge label={`${sprintFlags.size} Queued`} color={C.cyan} />}>
          <SprintIntegrationPanel tasks={crossFilteredTasks} hours={data.hours || []} sprintFlags={sprintFlags} onToggle={handleSprintToggle} />
        </SectionCard>
      </div>

      {/* Footer Ticker */}
      <div style={{ padding: '0.75rem 1rem', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '2rem', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: '0.7rem', color: C.teal, fontWeight: 700 }}>PRODUCTION FLOOR ONLINE</span>
        <span style={{ fontSize: '0.7rem', color: C.textMuted }}>TASKS: {stats.total}</span>
        <span style={{ fontSize: '0.7rem', color: C.textMuted }}>SMES: {data.employees?.length || 0}</span>
        <span style={{ fontSize: '0.7rem', color: C.textMuted }}>SPRINT QUEUE: {sprintFlags.size}</span>
        <span style={{ fontSize: '0.7rem', color: C.textMuted }}>MODE: {viewMode.toUpperCase()}</span>
      </div>
    </div>
  );
}
