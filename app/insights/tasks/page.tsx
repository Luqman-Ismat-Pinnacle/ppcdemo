'use client';

/**
 * @fileoverview Tasks - Operations Dashboard with Executive Features
 * 
 * Full-width visualizations with executive dashboard and variance analysis:
 * - Hours vs Efficiency dual-axis chart (full width, data zoom, click-to-filter)
 * - Hours flow Sankey with split options (phase/task/project/role)
 * - Hours by Work Type stacked bar (click nodes to filter)
 * - Cross-sync filtering across all charts
 * - Drill-down functionality for detailed breakdowns
 * - Variance Analysis section with trend charts
 * - Executive Summary with risks and action items
 * 
 * @module app/insights/tasks/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import { calculateMetricVariance, getPeriodDisplayName } from '@/lib/variance-engine';
import useCrossFilter, { CrossFilter, applyCrossFilters } from '@/lib/hooks/useCrossFilter';
import type { EChartsOption } from 'echarts';

/** Safe number formatting - returns '0' for NaN/Infinity */
const sn = (v: any, decimals = 2): string => {
  const n = Number(v);
  return isFinite(n) ? n.toFixed(decimals) : '0';
};

type SankeyGroupBy = 'role' | 'phase' | 'project' | 'status' | 'workType';

// ===== CROSS-FILTER BAR =====
function CrossFilterBar({ 
  filters, 
  drillPath,
  onRemove, 
  onClear,
  onDrillToLevel,
}: { 
  filters: CrossFilter[];
  drillPath: { id: string; label: string }[];
  onRemove: (type: string, value?: string) => void;
  onClear: () => void;
  onDrillToLevel: (id: string) => void;
}) {
  if (filters.length === 0 && drillPath.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.75rem 1rem',
      background: 'linear-gradient(90deg, rgba(64,224,208,0.08), rgba(205,220,57,0.05))',
      borderRadius: '12px',
      border: '1px solid rgba(64,224,208,0.2)',
      marginBottom: '1rem',
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
          <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
        </svg>
        <span style={{ fontSize: '0.75rem', color: 'var(--pinnacle-teal)', fontWeight: 600 }}>FILTERED</span>
      </div>

      {/* Drill path breadcrumbs */}
      {drillPath.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {drillPath.map((level, idx) => (
            <React.Fragment key={level.id}>
              {idx > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>/</span>}
              <button
                onClick={() => onDrillToLevel(level.id)}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: idx === drillPath.length - 1 ? 'rgba(64,224,208,0.15)' : 'transparent',
                  color: 'var(--pinnacle-teal)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                {level.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Active filter pills */}
      {filters.map((f) => (
        <div
          key={`${f.type}-${f.value}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.75rem',
            background: 'var(--bg-secondary)',
            borderRadius: '20px',
            border: '1px solid var(--border-color)',
          }}
        >
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{f.type}:</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{f.label}</span>
          <button
            onClick={() => onRemove(f.type, f.value)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}

      <button
        onClick={onClear}
        style={{
          marginLeft: 'auto',
          padding: '0.35rem 0.75rem',
          borderRadius: '6px',
          border: '1px solid var(--border-color)',
          background: 'transparent',
          color: 'var(--text-secondary)',
          fontSize: '0.75rem',
          cursor: 'pointer',
        }}
      >
        Clear All
      </button>
    </div>
  );
}

// ===== COMMAND CENTER =====
function CommandCenter({ stats, onFilterChange, activeFilter }: { 
  stats: any; onFilterChange: (filter: string) => void; activeFilter: string;
}) {
  const segments = [
    { key: 'completed', label: 'Complete', value: stats.completed, color: '#10B981' },
    { key: 'inProgress', label: 'Active', value: stats.inProgress, color: '#3B82F6' },
    { key: 'blocked', label: 'Blocked', value: stats.blocked, color: '#EF4444' },
    { key: 'notStarted', label: 'Pending', value: stats.notStarted, color: '#6B7280' },
  ];
  const total = stats.total || 1;
  
  return (
    <div style={{ background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)', borderRadius: '20px', padding: '1.25rem', border: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '160px 1fr auto', alignItems: 'center', gap: '1.5rem' }}>
      <div style={{ position: 'relative', width: '160px', height: '160px' }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-tertiary)" strokeWidth="8" />
          {segments.map((seg, idx) => {
            const circumference = 2 * Math.PI * 42;
            const strokeLength = (seg.value / total) * circumference;
            const offset = segments.slice(0, idx).reduce((acc, s) => acc + (s.value / total) * circumference, 0);
            return <circle key={seg.key} cx="50" cy="50" r="42" fill="none" stroke={seg.color}
              strokeWidth={activeFilter === seg.key ? 12 : 8} strokeDasharray={`${strokeLength} ${circumference}`} strokeDashoffset={-offset}
              style={{ cursor: 'pointer' }} onClick={() => onFilterChange(activeFilter === seg.key ? 'all' : seg.key)} />;
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--pinnacle-teal)' }}>{stats.overallProgress}%</span>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>COMPLETE</span>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
        {segments.map(seg => (
          <div key={seg.key} onClick={() => onFilterChange(activeFilter === seg.key ? 'all' : seg.key)}
            style={{ background: activeFilter === seg.key ? `${seg.color}15` : 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '0.75rem', border: `1px solid ${activeFilter === seg.key ? seg.color : 'transparent'}`, cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: seg.color }}>{seg.value}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{seg.label}</div>
          </div>
        ))}
      </div>
      
      <div style={{ display: 'grid', gridTemplateRows: 'repeat(3, 1fr)', gap: '0.5rem' }}>
        <div style={{ textAlign: 'center', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>EFFICIENCY</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: stats.efficiency <= 100 ? '#10B981' : '#EF4444' }}>{stats.efficiency}%</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>QC PASS</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: stats.qcPassRate >= 90 ? '#10B981' : '#F59E0B' }}>{stats.qcPassRate}%</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>HOURS</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pinnacle-teal)' }}>{stats.totalHours.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

// ===== HOURS EFFICIENCY CHART (FULL WIDTH with scroll/zoom) =====
function HoursEfficiencyChart({ data, onBarClick }: { data: any; onBarClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    // Handle large datasets - show all tasks up to 100
    const tasks = (data.tasks || []).slice(0, 100);
    const actual = (data.actualWorked || []).slice(0, 100);
    const estimated = (data.estimatedAdded || []).slice(0, 100);
    const efficiency = actual.map((a: number, i: number) => {
      const est = estimated[i] || 0;
      return est > 0 ? Math.round((a / (a + est)) * 100) : 100;
    });
    
    // Calculate how much to show initially based on data size
    const initialEnd = tasks.length > 30 ? Math.round((30 / tasks.length) * 100) : 100;

    return {
      backgroundColor: 'transparent',
      tooltip: { 
        trigger: 'axis', 
        backgroundColor: 'rgba(22,27,34,0.95)', 
        borderColor: 'var(--border-color)', 
        textStyle: { color: '#fff', fontSize: 11 },
        confine: true,
      },
      legend: { data: ['Actual Hours', 'Over/Under Budget', 'Efficiency'], bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 11 } },
      grid: { left: 60, right: 60, top: 30, bottom: 70, containLabel: true },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, start: 0, end: initialEnd },
        { type: 'slider', xAxisIndex: 0, bottom: 25, height: 20, start: 0, end: initialEnd, fillerColor: 'rgba(64,224,208,0.2)', borderColor: 'var(--border-color)' },
      ],
      xAxis: { 
        type: 'category', 
        data: tasks, 
        axisLabel: { 
          color: 'var(--text-muted)', 
          fontSize: 9, 
          rotate: 45, 
          interval: 0,
          formatter: (v: string) => v.length > 15 ? v.slice(0, 15) + '..' : v,
        }, 
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      yAxis: [
        { type: 'value', name: 'Hours', nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 }, axisLabel: { color: 'var(--text-muted)', fontSize: 10 }, splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } } },
        { type: 'value', name: 'Efficiency %', nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 }, max: 120, min: 0, axisLabel: { color: 'var(--text-muted)', fontSize: 10, formatter: '{value}%' }, splitLine: { show: false } },
      ],
      series: [
        { name: 'Actual Hours', type: 'bar', data: actual, itemStyle: { color: '#3B82F6' }, barWidth: '30%' },
        { name: 'Over/Under Budget', type: 'bar', data: estimated, itemStyle: { color: '#6B7280' }, barWidth: '30%' },
        { name: 'Efficiency', type: 'line', yAxisIndex: 1, data: efficiency, lineStyle: { color: '#10B981', width: 3 }, itemStyle: { color: '#10B981' }, symbol: 'circle', symbolSize: 6, smooth: true },
      ],
    };
  }, [data]);

  return <ChartWrapper option={option} height="400px" onClick={onBarClick} />;
}

// ===== HOURS BY WORK TYPE CHART (with scroll/zoom) =====
// Uses real chargeType data from hours entries (EX=Execution, QC=Quality, CR=Customer Relations)
function HoursByWorkTypeChart({ tasks, byChargeType, onClick }: { tasks: any[]; byChargeType?: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    // Get work types from real data or fall back to standard types
    const chargeTypeData = byChargeType || [];
    const hasRealData = chargeTypeData.length > 0;
    
    // Standard work types with colors
    const workTypeColors: Record<string, string> = {
      'Execution': '#3B82F6',
      'Quality': '#10B981',
      'Customer Relations': '#8B5CF6',
      'QC': '#10B981',
      'EX': '#3B82F6',
      'CR': '#8B5CF6',
      'Other': '#6B7280'
    };
    
    if (hasRealData) {
      // Use real chargeType aggregation
      const workTypes = chargeTypeData.map((ct: any) => ct.name);
      const colors = workTypes.map((wt: string) => workTypeColors[wt] || '#6B7280');
      const totalHours = chargeTypeData.reduce((s: number, ct: any) => s + (ct.total || 0), 0);
      
      return {
        backgroundColor: 'transparent',
        tooltip: { 
          trigger: 'item', 
          backgroundColor: 'rgba(22,27,34,0.95)', 
          borderColor: 'var(--border-color)', 
          textStyle: { color: '#fff', fontSize: 11 },
          formatter: (params: any) => {
            const pct = totalHours > 0 ? Math.round((params.value / totalHours) * 100) : 0;
            return `${params.name}: ${params.value.toLocaleString()} hrs (${pct}%)`;
          }
        },
        legend: { data: workTypes, bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 11 } },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 4, borderColor: 'var(--bg-card)', borderWidth: 2 },
          label: { 
            show: true, 
            color: 'var(--text-primary)', 
            formatter: '{b}\n{c} hrs',
            fontSize: 11
          },
          emphasis: { 
            label: { show: true, fontSize: 14, fontWeight: 'bold' },
            itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' }
          },
          data: chargeTypeData.map((ct: any, i: number) => ({
            name: ct.name,
            value: Math.round(ct.total || 0),
            itemStyle: { color: colors[i] }
          }))
        }]
      };
    }
    
    // Fallback: stacked bar by task (old behavior)
    const workTypes = ['Execution', 'Quality', 'Customer Relations'];
    const colors = workTypes.map(wt => workTypeColors[wt]);
    const taskList = tasks.slice(0, 80).map((t: any) => t.name || t.taskName || 'Task');
    const initialEnd = taskList.length > 25 ? Math.round((25 / taskList.length) * 100) : 100;
    
    return {
      backgroundColor: 'transparent',
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'shadow' }, 
        backgroundColor: 'rgba(22,27,34,0.95)', 
        borderColor: 'var(--border-color)', 
        textStyle: { color: '#fff', fontSize: 11 },
        confine: true,
      },
      legend: { data: workTypes, bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 11 } },
      grid: { left: 60, right: 30, top: 30, bottom: 70, containLabel: true },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, start: 0, end: initialEnd },
        { type: 'slider', xAxisIndex: 0, bottom: 25, height: 20, start: 0, end: initialEnd, fillerColor: 'rgba(64,224,208,0.2)', borderColor: 'var(--border-color)' },
      ],
      xAxis: { 
        type: 'category', 
        data: taskList, 
        axisLabel: { 
          color: 'var(--text-muted)', 
          fontSize: 9, 
          rotate: 45, 
          interval: 0,
          formatter: (v: string) => v.length > 12 ? v.slice(0, 12) + '..' : v,
        }, 
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      yAxis: { type: 'value', name: 'Hours', nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 }, axisLabel: { color: 'var(--text-muted)', fontSize: 10 }, splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } } },
      series: workTypes.map((wt, i) => ({
        name: wt,
        type: 'bar',
        stack: 'total',
        emphasis: { focus: 'series' },
        itemStyle: { color: colors[i] },
        data: taskList.map((_, idx) => {
          const task = tasks[idx];
          const total = task?.actualHours || 0;
          // Without real chargeType data, estimate distribution
          const ratios = [0.7, 0.2, 0.1]; // Execution, QC, CR
          return Math.round(total * ratios[i] * 10) / 10;
        }),
      })),
    };
  }, [tasks, byChargeType]);

  if (!tasks.length && !(byChargeType?.length)) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No task data</div>;
  return <ChartWrapper option={option} height="380px" onClick={onClick} />;
}

// ===== ENHANCED SANKEY WITH REAL DATA =====
const TASK_CHARGE_COLORS: Record<string, string> = { Execution: '#3B82F6', Quality: '#8B5CF6', 'Customer Relations': '#F59E0B', EX: '#3B82F6', QC: '#8B5CF6', CR: '#F59E0B', SC: '#06B6D4', Other: '#6B7280' };

function EnhancedSankey({ stats, laborData, tasks, groupBy, onClick }: { stats: any; laborData: any; tasks: any[]; groupBy: SankeyGroupBy; onClick?: (params: any) => void }) {
  const [sankeyDepth, setSankeyDepth] = useState<'simple' | 'detailed'>('detailed');
  
  const option: EChartsOption = useMemo(() => {
    const byChargeType = laborData.byChargeType || [];
    const nodes: any[] = [];
    const links: any[] = [];
    const nodeSet = new Set<string>();
    
    const addNode = (name: string, color: string) => {
      if (!nodeSet.has(name)) {
        nodes.push({ name, itemStyle: { color, borderWidth: 0 } });
        nodeSet.add(name);
      }
    };
    
    const projects = [...new Set(tasks.map((t: any) => t.projectName || t.project_name).filter(Boolean))];
    const totalHours = stats.totalHours || 1;
    const completeRatio = stats.overallProgress / 100;
    
    // Level 1: Source
    addNode('Total Hours', '#40E0D0');
    
    if (groupBy === 'project') {
      // Project → Charge Type → Progress
      projects.forEach(p => {
        const pTasks = tasks.filter((t: any) => (t.projectName || t.project_name) === p);
        const pHours = pTasks.reduce((s: number, t: any) => s + (Number(t.actualHours) || 0), 0);
        if (pHours > 0) {
          const shortName = String(p).length > 28 ? String(p).slice(0, 28) + '...' : String(p);
          addNode(shortName, '#10B981');
          links.push({ source: 'Total Hours', target: shortName, value: Math.round(pHours) });
          
          if (sankeyDepth === 'detailed') {
            // Project → Status breakdown
            const pComplete = pTasks.filter((t: any) => (t.percentComplete || 0) >= 100).reduce((s: number, t: any) => s + (Number(t.actualHours) || 0), 0);
            const pActive = pTasks.filter((t: any) => { const pc = t.percentComplete || 0; return pc > 0 && pc < 100; }).reduce((s: number, t: any) => s + (Number(t.actualHours) || 0), 0);
            const pPending = pHours - pComplete - pActive;
            if (pComplete > 0) { addNode('Complete', '#10B981'); links.push({ source: shortName, target: 'Complete', value: Math.round(pComplete) }); }
            if (pActive > 0) { addNode('In Progress', '#3B82F6'); links.push({ source: shortName, target: 'In Progress', value: Math.round(pActive) }); }
            if (pPending > 0) { addNode('Not Started', '#6B7280'); links.push({ source: shortName, target: 'Not Started', value: Math.max(1, Math.round(pPending)) }); }
          } else {
            const earned = Math.round(pHours * completeRatio);
            const remain = Math.round(pHours * (1 - completeRatio));
            addNode('Earned', '#10B981'); addNode('Remaining', '#F97316');
            if (earned > 0) links.push({ source: shortName, target: 'Earned', value: earned });
            if (remain > 0) links.push({ source: shortName, target: 'Remaining', value: remain });
          }
        }
      });
    } else if (groupBy === 'workType') {
      // Work Type → Projects → Progress
      const chargeItems = byChargeType.length > 0
        ? byChargeType.map((ct: any) => ({ name: ct.name, hours: ct.total || 0 })).filter((i: any) => i.hours > 0)
        : [{ name: 'Execution', hours: totalHours * 0.7 }, { name: 'Quality', hours: totalHours * 0.2 }, { name: 'Other', hours: totalHours * 0.1 }];
      
      chargeItems.forEach((ct: any) => {
        addNode(ct.name, TASK_CHARGE_COLORS[ct.name] || '#6B7280');
        links.push({ source: 'Total Hours', target: ct.name, value: Math.max(1, Math.round(ct.hours)) });
      });
      
      if (sankeyDepth === 'detailed') {
        // Charge type → projects (proportional)
        chargeItems.forEach((ct: any) => {
          projects.forEach(p => {
            const pTasks = tasks.filter((t: any) => (t.projectName || t.project_name) === p);
            const pHours = pTasks.reduce((s: number, t: any) => s + (Number(t.actualHours) || 0), 0);
            const share = totalHours > 0 ? (pHours / totalHours) * ct.hours : 0;
            if (share > 0) {
              const shortName = `${String(p).slice(0, 20)}`;
              addNode(shortName, '#10B981');
              links.push({ source: ct.name, target: shortName, value: Math.max(1, Math.round(share)) });
            }
          });
        });
        
        // Projects → outcome
        addNode('Earned', '#10B981'); addNode('Remaining', '#F97316');
        projects.forEach(p => {
          const shortName = `${String(p).slice(0, 20)}`;
          if (nodeSet.has(shortName)) {
            const incoming = links.filter(l => l.target === shortName).reduce((s, l) => s + l.value, 0);
            const earned = Math.round(incoming * completeRatio);
            const remain = incoming - earned;
            if (earned > 0) links.push({ source: shortName, target: 'Earned', value: earned });
            if (remain > 0) links.push({ source: shortName, target: 'Remaining', value: remain });
          }
        });
      } else {
        addNode('Earned', '#10B981'); addNode('Remaining', '#F97316');
        chargeItems.forEach((ct: any) => {
          const earned = Math.round(ct.hours * completeRatio);
          const remain = Math.round(ct.hours * (1 - completeRatio));
          if (earned > 0) links.push({ source: ct.name, target: 'Earned', value: earned });
          if (remain > 0) links.push({ source: ct.name, target: 'Remaining', value: remain });
        });
      }
    } else if (groupBy === 'status') {
      // Status → Projects
      const statuses = [
        { name: 'Complete', filter: (t: any) => (t.percentComplete || 0) >= 100, color: '#10B981' },
        { name: 'In Progress', filter: (t: any) => { const pc = t.percentComplete || 0; return pc > 0 && pc < 100; }, color: '#3B82F6' },
        { name: 'Not Started', filter: (t: any) => (t.percentComplete || 0) === 0, color: '#6B7280' },
      ];
      
      statuses.forEach(s => {
        const sHours = tasks.filter(s.filter).reduce((sum: number, t: any) => sum + (Number(t.actualHours) || 0), 0);
        if (sHours > 0) {
          addNode(s.name, s.color);
          links.push({ source: 'Total Hours', target: s.name, value: Math.round(sHours) });
          
          if (sankeyDepth === 'detailed') {
            projects.forEach(p => {
              const pTasks = tasks.filter((t: any) => (t.projectName || t.project_name) === p).filter(s.filter);
              const pHours = pTasks.reduce((sum: number, t: any) => sum + (Number(t.actualHours) || 0), 0);
              if (pHours > 0) {
                const shortName = `${String(p).slice(0, 22)}`;
                addNode(shortName, '#10B981');
                links.push({ source: s.name, target: shortName, value: Math.round(pHours) });
              }
            });
          }
        }
      });
    } else if (groupBy === 'role') {
      // Role → Projects → Progress
      const workers = laborData.byWorker || [];
      const roles = [...new Set(workers.map((w: any) => w.role).filter(Boolean))];
      
      roles.slice(0, 8).forEach(r => {
        const rHours = workers.filter((w: any) => w.role === r).reduce((s: number, w: any) => s + (w.total || 0), 0);
        if (rHours > 0) {
          const roleName = String(r).slice(0, 20);
          addNode(roleName, '#8B5CF6');
          links.push({ source: 'Total Hours', target: roleName, value: Math.round(rHours) });
          
          if (sankeyDepth === 'detailed') {
            addNode('Earned', '#10B981'); addNode('Remaining', '#F97316');
            const earned = Math.round(rHours * completeRatio);
            const remain = rHours - earned;
            if (earned > 0) links.push({ source: roleName, target: 'Earned', value: earned });
            if (remain > 0) links.push({ source: roleName, target: 'Remaining', value: remain });
          }
        }
      });
    } else {
      // Phase → Progress
      const phases = [...new Set(tasks.map((t: any) => t.phase || t.phaseId || 'General').filter(Boolean))];
      phases.slice(0, 8).forEach(ph => {
        const phTasks = tasks.filter((t: any) => (t.phase || t.phaseId || 'General') === ph);
        const phHours = phTasks.reduce((s: number, t: any) => s + (Number(t.actualHours) || 0), 0);
        if (phHours > 0) {
          const phaseName = String(ph).slice(0, 20);
          addNode(phaseName, '#F59E0B');
          links.push({ source: 'Total Hours', target: phaseName, value: Math.round(phHours) });
          
          if (sankeyDepth === 'detailed') {
            addNode('Earned', '#10B981'); addNode('Remaining', '#F97316');
            const earned = Math.round(phHours * completeRatio);
            const remain = phHours - earned;
            if (earned > 0) links.push({ source: phaseName, target: 'Earned', value: earned });
            if (remain > 0) links.push({ source: phaseName, target: 'Remaining', value: remain });
          }
        }
      });
    }

    return {
      backgroundColor: 'transparent',
      tooltip: { 
        trigger: 'item', 
        backgroundColor: 'rgba(22,27,34,0.95)', 
        borderColor: 'var(--border-color)', 
        textStyle: { color: '#fff', fontSize: 12 },
        confine: true,
        formatter: (params: any) => {
          if (params.dataType === 'edge') {
            const pct = sn((params.data.value / totalHours) * 100, 1);
            return `<strong>${params.data.source}</strong> → <strong>${params.data.target}</strong><br/>
              Hours: <strong>${Math.round(params.data.value).toLocaleString()}</strong><br/>
              Share: ${pct}%`;
          }
          return `<strong>${params.name}</strong><br/>Click to filter`;
        },
      },
      series: [{
        type: 'sankey', 
        emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.8 } },
        nodeAlign: 'justify',
        nodeWidth: 22, 
        nodeGap: 14, 
        layoutIterations: 64, 
        orient: 'horizontal',
        left: 40, right: 140, top: 20, bottom: 20,
        label: { 
          color: 'var(--text-primary)', 
          fontSize: 11, 
          fontWeight: 600,
          formatter: (params: any) => params.name.length > 22 ? params.name.slice(0, 22) + '..' : params.name,
        },
        lineStyle: { color: 'gradient', curveness: 0.45, opacity: 0.4 },
        data: nodes, 
        links,
      }],
    };
  }, [stats, laborData, tasks, groupBy, sankeyDepth]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
        {(['simple', 'detailed'] as const).map(depth => (
          <button
            key={depth}
            onClick={() => setSankeyDepth(depth)}
            style={{
              padding: '0.3rem 0.7rem',
              borderRadius: '6px',
              border: `1px solid ${sankeyDepth === depth ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
              background: sankeyDepth === depth ? 'rgba(64,224,208,0.1)' : 'transparent',
              color: sankeyDepth === depth ? 'var(--pinnacle-teal)' : 'var(--text-muted)',
              fontSize: '0.7rem',
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {depth}
          </button>
        ))}
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {stats.totalHours.toLocaleString()} actual hrs | {stats.total} tasks from plan projects
        </span>
      </div>
      <ChartWrapper option={option} height="440px" onClick={onClick} />
    </div>
  );
}

// ===== VARIANCE ANALYSIS SECTION =====
function VarianceAnalysisSection({ metricsHistory, variancePeriod, stats }: { metricsHistory: any[]; variancePeriod: string; stats: any }) {
  const varianceData = useMemo(() => {
    const getVariance = (metricKey: string, currentVal: number) => {
      const result = calculateMetricVariance(metricsHistory, metricKey, variancePeriod);
      return result || { currentValue: currentVal, previousValue: currentVal, change: 0, percentChange: 0 };
    };
    
    return {
      efficiency: getVariance('efficiency', stats.efficiency),
      hours: getVariance('actual_hours', stats.totalHours),
      qcPass: getVariance('qc_pass_rate', stats.qcPassRate),
      completion: getVariance('percent_complete', stats.overallProgress),
    };
  }, [metricsHistory, variancePeriod, stats]);

  const metrics = [
    { key: 'efficiency', label: 'Efficiency', ...varianceData.efficiency, suffix: '%', positive: (c: number) => c >= 0 },
    { key: 'hours', label: 'Total Hours', ...varianceData.hours, suffix: 'h', positive: (c: number) => c <= 0 },
    { key: 'qcPass', label: 'QC Pass Rate', ...varianceData.qcPass, suffix: '%', positive: (c: number) => c >= 0 },
    { key: 'completion', label: 'Completion', ...varianceData.completion, suffix: '%', positive: (c: number) => c >= 0 },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
      {metrics.map(m => {
        const isPositive = m.positive(m.change);
        return (
          <div key={m.key} style={{ background: 'var(--bg-tertiary)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{m.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{m.currentValue?.toFixed?.(1) || 0}{m.suffix}</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isPositive ? '#10B981' : '#EF4444' }}>
                {m.change >= 0 ? '+' : ''}{m.change?.toFixed?.(1) || 0}%
              </span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              vs {getPeriodDisplayName(variancePeriod)}: {m.previousValue?.toFixed?.(1) || 0}{m.suffix}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===== EXECUTIVE RISKS & ACTIONS (Creative Visual Version) =====
function ExecutiveSection({ tasks, stats }: { tasks: any[]; stats: any }) {
  const risks = useMemo(() => {
    const riskList: any[] = [];
    const overdueTasks = tasks.filter((t: any) => {
      const due = t.finishDate || t.dueDate;
      return due && new Date(due) < new Date() && (t.percentComplete || 0) < 100;
    });
    
    if (overdueTasks.length > 3) {
      riskList.push({ id: 'overdue', title: `${overdueTasks.length} Overdue Tasks`, impact: 3, probability: 0.9, category: 'Schedule' });
    }
    if (stats.efficiency > 110) {
      riskList.push({ id: 'overbudget', title: 'Hours Over Budget', impact: 2, probability: 0.7, category: 'Cost' });
    }
    if (stats.qcPassRate < 80) {
      riskList.push({ id: 'quality', title: 'Quality Concerns', impact: 3, probability: 0.8, category: 'Quality' });
    }
    if (stats.blocked > 5) {
      riskList.push({ id: 'blocked', title: `${stats.blocked} Blocked Items`, impact: 2, probability: 0.6, category: 'Resources' });
    }
    // Add some baseline risks for visualization
    riskList.push({ id: 'scope', title: 'Scope Creep', impact: 1.5, probability: 0.4, category: 'Scope' });
    riskList.push({ id: 'resource', title: 'Resource Availability', impact: 2, probability: 0.5, category: 'Resources' });
    return riskList;
  }, [tasks, stats]);

  // Risk Matrix Chart
  const riskMatrixOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { 
      trigger: 'item', 
      backgroundColor: 'rgba(22,27,34,0.95)', 
      borderColor: 'var(--border-color)', 
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (p: any) => `<strong>${p.data[2]}</strong><br/>Impact: ${sn(p.data[1], 1)}<br/>Probability: ${sn(p.data[0] * 100, 0)}%`,
    },
    grid: { left: 50, right: 20, top: 20, bottom: 50 },
    xAxis: { 
      type: 'value', 
      name: 'Probability', 
      nameLocation: 'center', 
      nameGap: 30, 
      nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
      min: 0, max: 1,
      axisLabel: { color: 'var(--text-muted)', fontSize: 9, formatter: (v: number) => `${(v * 100).toFixed(0)}%` },
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
    },
    yAxis: { 
      type: 'value', 
      name: 'Impact', 
      nameLocation: 'center', 
      nameGap: 35, 
      nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
      min: 0, max: 4,
      axisLabel: { color: 'var(--text-muted)', fontSize: 9 },
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
    },
    visualMap: { show: false, min: 0, max: 3, dimension: 1, inRange: { color: ['#10B981', '#F59E0B', '#EF4444'] } },
    series: [{
      type: 'scatter',
      symbolSize: (data: number[]) => Math.max(20, (data[0] * data[1]) * 25),
      data: risks.map(r => [r.probability, r.impact, r.title, r.category]),
      label: { show: true, formatter: (p: any) => p.data[2].slice(0, 10), fontSize: 8, color: '#fff', position: 'inside' },
      itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' },
    }],
    // Quadrant lines
    markLine: { silent: true, symbol: 'none', lineStyle: { color: 'var(--border-color)', type: 'dashed' },
      data: [{ xAxis: 0.5 }, { yAxis: 2 }],
    },
  }), [risks]);

  // Status Distribution Pie
  const statusPieOption: EChartsOption = useMemo(() => {
    const data = [
      { name: 'On Track', value: stats.completed + Math.round(stats.inProgress * 0.7), color: '#10B981' },
      { name: 'At Risk', value: Math.round(stats.inProgress * 0.3) + Math.round(stats.notStarted * 0.5), color: '#F59E0B' },
      { name: 'Critical', value: stats.blocked + Math.round(stats.notStarted * 0.5), color: '#EF4444' },
    ].filter(d => d.value > 0);
    
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff', fontSize: 11 } },
      series: [{
        type: 'pie',
        radius: ['50%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        label: { show: true, color: 'var(--text-primary)', fontSize: 10, formatter: '{b}: {c}' },
        labelLine: { lineStyle: { color: 'var(--border-color)' } },
        data: data.map(d => ({ ...d, itemStyle: { color: d.color } })),
      }],
    };
  }, [stats]);

  // Efficiency Gauge
  const efficiencyGaugeOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    series: [{
      type: 'gauge',
      startAngle: 200,
      endAngle: -20,
      radius: '90%',
      center: ['50%', '60%'],
      min: 0,
      max: 150,
      splitNumber: 5,
      axisLine: { lineStyle: { width: 15, color: [[0.6, '#10B981'], [0.85, '#F59E0B'], [1, '#EF4444']] } },
      pointer: { itemStyle: { color: 'var(--pinnacle-teal)' }, width: 6 },
      axisTick: { distance: -20, length: 6, lineStyle: { color: '#fff', width: 1 } },
      splitLine: { distance: -25, length: 15, lineStyle: { color: '#fff', width: 2 } },
      axisLabel: { color: 'var(--text-muted)', distance: 30, fontSize: 9 },
      detail: { valueAnimation: true, formatter: '{value}%', color: 'var(--text-primary)', fontSize: 18, offsetCenter: [0, '40%'] },
      title: { offsetCenter: [0, '70%'], fontSize: 11, color: 'var(--text-muted)' },
      data: [{ value: stats.efficiency, name: 'Efficiency' }],
    }],
  }), [stats]);

  // Action Items Treemap
  const actionTreemapOption: EChartsOption = useMemo(() => {
    const actions = [
      { name: 'Schedule', value: stats.overallProgress < 80 ? 30 : 10, children: [
        { name: 'Review timeline', value: 15 },
        { name: 'Update milestones', value: 10 },
      ]},
      { name: 'Resources', value: stats.blocked > 0 ? 25 : 8, children: [
        { name: 'Unblock tasks', value: stats.blocked || 5 },
        { name: 'Reallocate', value: 10 },
      ]},
      { name: 'Quality', value: stats.qcPassRate < 90 ? 28 : 12, children: [
        { name: 'Improve QC', value: 15 },
        { name: 'Training', value: 10 },
      ]},
      { name: 'Cost', value: stats.efficiency > 100 ? 22 : 8, children: [
        { name: 'Budget review', value: 12 },
        { name: 'Optimize', value: 10 },
      ]},
    ];
    
    return {
      backgroundColor: 'transparent',
      tooltip: { backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff', fontSize: 11 } },
      series: [{
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: { show: true, formatter: '{b}', fontSize: 10, color: '#fff' },
        upperLabel: { show: true, height: 22, formatter: '{b}', fontSize: 11, color: '#fff', fontWeight: 600 },
        itemStyle: { borderColor: 'var(--bg-card)', borderWidth: 2, gapWidth: 2 },
        levels: [
          { itemStyle: { borderWidth: 0, gapWidth: 2 } },
          { colorSaturation: [0.35, 0.5], itemStyle: { gapWidth: 2, borderColorSaturation: 0.6 } },
        ],
        data: actions,
        color: ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B'],
      }],
    };
  }, [stats]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      {/* Risk Matrix */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Risk Matrix</h3>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Impact vs Probability - size indicates severity</span>
        </div>
        <div style={{ padding: '0.5rem' }}>
          <ChartWrapper option={riskMatrixOption} height="220px" />
        </div>
      </div>

      {/* Action Priority Treemap */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Action Priority Map</h3>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Focus areas by urgency - larger = higher priority</span>
        </div>
        <div style={{ padding: '0.5rem' }}>
          <ChartWrapper option={actionTreemapOption} height="220px" />
        </div>
      </div>

      {/* Status Distribution */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Health Distribution</h3>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Task health breakdown</span>
        </div>
        <div style={{ padding: '0.5rem' }}>
          <ChartWrapper option={statusPieOption} height="220px" />
        </div>
      </div>

      {/* Efficiency Gauge */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Efficiency Meter</h3>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Actual vs planned hours ratio</span>
        </div>
        <div style={{ padding: '0.5rem' }}>
          <ChartWrapper option={efficiencyGaugeOption} height="220px" />
        </div>
      </div>
    </div>
  );
}

// ===== SECTION CARD =====
function SectionCard({ title, subtitle, children, headerRight, noPadding = false }: { 
  title: string; subtitle?: string; children: React.ReactNode; headerRight?: React.ReactNode; noPadding?: boolean;
}) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
      <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>{title}</h3>
          {subtitle && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{subtitle}</span>}
        </div>
        {headerRight}
      </div>
      <div style={{ padding: noPadding ? 0 : '1rem' }}>{children}</div>
    </div>
  );
}

// ===== CREATIVE TASK EXPLORER =====
function TaskExplorerSection({ tasks, searchTerm, setSearchTerm, statusFilter, setStatusFilter, selectedTask, setSelectedTask }: {
  tasks: any[];
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  selectedTask: any;
  setSelectedTask: (t: any) => void;
}) {
  const [viewMode, setViewMode] = useState<'treemap' | 'timeline' | 'cards' | 'table'>('treemap');
  
  // Task Treemap by Project and Status
  const treemapOption: EChartsOption = useMemo(() => {
    const projectGroups = tasks.reduce((acc: any, t: any) => {
      const proj = t.projectName || t.project_name || 'Unassigned';
      if (!acc[proj]) acc[proj] = [];
      acc[proj].push(t);
      return acc;
    }, {});
    
    const data = Object.entries(projectGroups).slice(0, 12).map(([proj, projTasks]: [string, any]) => {
      const statusGroups: any = { complete: [], active: [], pending: [] };
      projTasks.forEach((t: any) => {
        const pc = t.percentComplete || 0;
        if (pc >= 100) statusGroups.complete.push(t);
        else if (pc > 0) statusGroups.active.push(t);
        else statusGroups.pending.push(t);
      });
      
      return {
        name: proj.slice(0, 20),
        value: projTasks.length,
        children: [
          { name: 'Complete', value: statusGroups.complete.length || 0.1, itemStyle: { color: '#10B981' } },
          { name: 'Active', value: statusGroups.active.length || 0.1, itemStyle: { color: '#3B82F6' } },
          { name: 'Pending', value: statusGroups.pending.length || 0.1, itemStyle: { color: '#6B7280' } },
        ].filter(c => c.value > 0.1),
      };
    }).filter(p => p.children.length > 0);
    
    return {
      backgroundColor: 'transparent',
      tooltip: { backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff', fontSize: 11 } },
      series: [{
        type: 'treemap',
        roam: false,
        breadcrumb: { show: true, height: 22, itemStyle: { color: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }, textStyle: { color: 'var(--text-primary)', fontSize: 11 } },
        label: { show: true, formatter: '{b}\n{c}', fontSize: 10, color: '#fff' },
        upperLabel: { show: true, height: 24, formatter: '{b}', fontSize: 11, color: '#fff', fontWeight: 600 },
        itemStyle: { borderColor: 'var(--bg-card)', borderWidth: 2, gapWidth: 2 },
        levels: [
          { itemStyle: { borderWidth: 3, gapWidth: 3 }, upperLabel: { show: true } },
          { itemStyle: { gapWidth: 1 }, colorSaturation: [0.3, 0.6] },
        ],
        data,
        color: ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#06B6D4', '#EC4899'],
      }],
    };
  }, [tasks]);
  
  // Task Timeline Bar Chart
  const timelineOption: EChartsOption = useMemo(() => {
    const sortedTasks = [...tasks]
      .filter((t: any) => t.startDate || t.finishDate)
      .slice(0, 30)
      .sort((a: any, b: any) => new Date(a.startDate || a.finishDate).getTime() - new Date(b.startDate || b.finishDate).getTime());
    
    const now = new Date();
    const data = sortedTasks.map((t: any, idx: number) => {
      const start = t.startDate ? new Date(t.startDate).getTime() : now.getTime();
      const end = t.finishDate ? new Date(t.finishDate).getTime() : start + 7 * 24 * 60 * 60 * 1000;
      const pc = t.percentComplete || 0;
      return {
        name: (t.name || t.taskName || `Task ${idx + 1}`).slice(0, 25),
        value: [idx, start, end, pc],
        itemStyle: { color: pc >= 100 ? '#10B981' : pc > 0 ? '#3B82F6' : '#6B7280' },
      };
    });
    
    const minDate = Math.min(...data.map(d => d.value[1]));
    const maxDate = Math.max(...data.map(d => d.value[2]));
    
    return {
      backgroundColor: 'transparent',
      tooltip: { 
        backgroundColor: 'rgba(22,27,34,0.95)', 
        borderColor: 'var(--border-color)', 
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (p: any) => {
          const start = new Date(p.value[1]).toLocaleDateString();
          const end = new Date(p.value[2]).toLocaleDateString();
          return `<strong>${p.name}</strong><br/>Start: ${start}<br/>End: ${end}<br/>Progress: ${p.value[3]}%`;
        },
      },
      grid: { left: 150, right: 30, top: 20, bottom: 60 },
      xAxis: { 
        type: 'time', 
        min: minDate, 
        max: maxDate,
        axisLabel: { color: 'var(--text-muted)', fontSize: 9 },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      },
      yAxis: { 
        type: 'category', 
        data: data.map(d => d.name),
        axisLabel: { color: 'var(--text-muted)', fontSize: 9, width: 140, overflow: 'truncate' },
        inverse: true,
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0 },
        { type: 'slider', xAxisIndex: 0, bottom: 10, height: 20, fillerColor: 'rgba(64,224,208,0.2)', borderColor: 'var(--border-color)' },
        { type: 'slider', yAxisIndex: 0, right: 5, width: 15, fillerColor: 'rgba(64,224,208,0.2)', borderColor: 'var(--border-color)' },
      ],
      series: [{
        type: 'custom',
        renderItem: (params: any, api: any) => {
          const categoryIndex = api.value(0);
          const start = api.coord([api.value(1), categoryIndex]);
          const end = api.coord([api.value(2), categoryIndex]);
          const height = api.size([0, 1])[1] * 0.6;
          
          return {
            type: 'rect',
            shape: { x: start[0], y: start[1] - height / 2, width: Math.max(end[0] - start[0], 4), height },
            style: { fill: api.visual('color'), stroke: 'rgba(255,255,255,0.3)', lineWidth: 1 },
          };
        },
        encode: { x: [1, 2], y: 0 },
        data,
      }],
    };
  }, [tasks]);
  
  // Progress Distribution Bar Chart
  const progressBarOption: EChartsOption = useMemo(() => {
    const brackets = [
      { label: '0%', min: 0, max: 0, color: '#6B7280' },
      { label: '1-25%', min: 1, max: 25, color: '#EF4444' },
      { label: '26-50%', min: 26, max: 50, color: '#F59E0B' },
      { label: '51-75%', min: 51, max: 75, color: '#3B82F6' },
      { label: '76-99%', min: 76, max: 99, color: '#06B6D4' },
      { label: '100%', min: 100, max: 100, color: '#10B981' },
    ];
    
    const data = brackets.map(b => ({
      name: b.label,
      value: tasks.filter((t: any) => {
        const pc = t.percentComplete || 0;
        return pc >= b.min && pc <= b.max;
      }).length,
      itemStyle: { color: b.color },
    }));
    
    return {
      backgroundColor: 'transparent',
      tooltip: { backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff', fontSize: 11 } },
      grid: { left: 80, right: 30, top: 20, bottom: 40 },
      xAxis: { type: 'value', axisLabel: { color: 'var(--text-muted)', fontSize: 10 }, splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } } },
      yAxis: { type: 'category', data: brackets.map(b => b.label), axisLabel: { color: 'var(--text-muted)', fontSize: 10 } },
      series: [{ type: 'bar', data, barWidth: '60%', label: { show: true, position: 'right', fontSize: 10, color: 'var(--text-primary)' } }],
    };
  }, [tasks]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header with controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Task Explorer</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '2px 8px', background: 'var(--bg-secondary)', borderRadius: '10px' }}>{tasks.length} tasks</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <input type="text" placeholder="Search tasks..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: '6px 10px 6px 32px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem', width: '180px' }} />
            <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </div>
          <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            {(['treemap', 'timeline', 'cards', 'table'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                style={{ padding: '6px 12px', border: 'none', background: viewMode === mode ? 'var(--pinnacle-teal)' : 'var(--bg-secondary)', color: viewMode === mode ? '#000' : 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Visual Content based on view mode */}
      <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'cards' ? '1fr' : '2fr 1fr', gap: '1rem' }}>
        {viewMode === 'treemap' && (
          <>
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', padding: '1rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Tasks by Project</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>Click to drill down</span>
              </div>
              <ChartWrapper option={treemapOption} height="400px" />
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', padding: '1rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Progress Distribution</span>
              </div>
              <ChartWrapper option={progressBarOption} height="400px" />
            </div>
          </>
        )}

        {viewMode === 'timeline' && (
          <>
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', padding: '1rem', gridColumn: '1 / -1' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Task Timeline</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>Gantt view - scroll/zoom to navigate</span>
              </div>
              <ChartWrapper option={timelineOption} height="450px" />
            </div>
          </>
        )}

        {viewMode === 'cards' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem', maxHeight: '600px', overflowY: 'auto', padding: '0.5rem' }}>
            {tasks.slice(0, 50).map((t: any, idx: number) => {
              const pc = t.percentComplete || 0;
              const isOver = (t.actualHours || 0) > (t.baselineHours || Infinity);
              const isSelected = selectedTask?.name === t.name;
              const statusColor = pc >= 100 ? '#10B981' : pc > 0 ? '#3B82F6' : '#6B7280';
              
              return (
                <div key={idx} onClick={() => setSelectedTask(t)}
                  style={{ 
                    background: isSelected ? 'rgba(64,224,208,0.08)' : 'var(--bg-card)', 
                    borderRadius: '12px', 
                    border: `1px solid ${isSelected ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
                    padding: '0.875rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.3, maxWidth: '70%' }}>{(t.name || t.taskName || 'Task').slice(0, 40)}</span>
                    <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 600, background: `${statusColor}20`, color: statusColor }}>
                      {pc >= 100 ? 'Done' : pc > 0 ? 'Active' : 'Pending'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{t.projectName || t.project_name || '-'}</div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem' }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>Plan:</span> {t.baselineHours || 0}h</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Actual:</span> <span style={{ color: isOver ? '#EF4444' : 'inherit', fontWeight: isOver ? 600 : 400 }}>{t.actualHours || 0}h</span></div>
                  </div>
                  <div style={{ marginTop: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${pc}%`, height: '100%', background: statusColor, borderRadius: '4px' }} />
                  </div>
                  <div style={{ marginTop: '0.35rem', fontSize: '0.65rem', textAlign: 'right', color: 'var(--text-muted)' }}>{pc}% complete</div>
                </div>
              );
            })}
            {tasks.length > 50 && <div style={{ gridColumn: '1 / -1', padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Showing 50 of {tasks.length} tasks</div>}
          </div>
        )}

        {viewMode === 'table' && (
          <div style={{ gridColumn: '1 / -1', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                  <tr>
                    <th>Task</th><th>Project</th><th>Assignee</th><th>Status</th><th className="number">Planned</th><th className="number">Actual</th><th className="number">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.slice(0, 100).map((t: any, idx: number) => {
                    const pc = t.percentComplete || 0;
                    const isOver = (t.actualHours || 0) > (t.baselineHours || Infinity);
                    const isSelected = selectedTask?.name === t.name;
                    return (
                      <tr key={idx} onClick={() => setSelectedTask(t)} style={{ cursor: 'pointer', background: isSelected ? 'rgba(64,224,208,0.1)' : 'transparent' }}>
                        <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name || t.taskName || '-'}</td>
                        <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.projectName || t.project_name || '-'}</td>
                        <td>{t.assignedResource || t.assignedTo || '-'}</td>
                        <td><span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: pc >= 100 ? 'rgba(16,185,129,0.15)' : pc > 0 ? 'rgba(59,130,246,0.15)' : 'rgba(107,114,128,0.15)', color: pc >= 100 ? '#10B981' : pc > 0 ? '#3B82F6' : '#6B7280' }}>{pc >= 100 ? 'Done' : pc > 0 ? 'Active' : 'Pending'}</span></td>
                        <td className="number">{t.baselineHours || t.budgetHours || 0}</td>
                        <td className="number" style={{ color: isOver ? '#EF4444' : 'inherit', fontWeight: isOver ? 600 : 400 }}>{t.actualHours || 0}</td>
                        <td className="number">{pc}%</td>
                      </tr>
                    );
                  })}
                  {tasks.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No tasks found</td></tr>}
                </tbody>
              </table>
              {tasks.length > 100 && <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Showing 100 of {tasks.length} tasks</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== QC RADAR =====
function QCPerformanceRadar({ qcData, onClick }: { qcData: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const topAnalysts = [...qcData].sort((a, b) => (b.closedCount || 0) - (a.closedCount || 0)).slice(0, 5);
    const maxClosed = Math.max(...topAnalysts.map(a => a.closedCount || 0), 1);
    const colors = ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EF4444'];

    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff', fontSize: 11 } },
      legend: { data: topAnalysts.map(a => a.name), bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 }, type: 'scroll' },
      radar: {
        indicator: [{ name: 'Pass Rate', max: 100 }, { name: 'Volume', max: maxClosed }, { name: 'Open', max: Math.max(...topAnalysts.map(a => a.openCount || 0), 1) }, { name: 'Closed', max: maxClosed }],
        shape: 'polygon', radius: '55%', center: ['50%', '45%'],
        axisName: { color: 'var(--text-muted)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'var(--border-color)' } },
        splitArea: { areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.04)'] } },
      },
      series: [{
        type: 'radar',
        data: topAnalysts.map((a, i) => ({
          name: a.name,
          value: [a.passRate || 0, a.closedCount || 0, a.openCount || 0, a.closedCount || 0],
          lineStyle: { color: colors[i], width: 2 }, itemStyle: { color: colors[i] }, areaStyle: { color: colors[i] + '25' },
        })),
      }],
    };
  }, [qcData]);

  if (!qcData.length) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No QC data</div>;
  return <ChartWrapper option={option} height="320px" onClick={onClick} />;
}

// ===== DRILL-DOWN DETAIL PANEL =====
function DrillDownPanel({ 
  item, 
  type,
  onClose,
  relatedData,
}: { 
  item: any;
  type: string;
  onClose: () => void;
  relatedData?: { tasks: any[]; hours: number; workers: any[] };
}) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(64,224,208,0.1) 0%, rgba(205,220,57,0.05) 100%)',
      borderRadius: '16px',
      padding: '1.25rem',
      marginBottom: '1rem',
      border: '1px solid var(--pinnacle-teal)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.65rem', color: 'var(--pinnacle-teal)', textTransform: 'uppercase', fontWeight: 600 }}>
            {type} Drill-Down
          </span>
          <h3 style={{ margin: '0.25rem 0 0', fontSize: '1.1rem', fontWeight: 700 }}>
            {item.name || item.taskName || item.label || 'Details'}
          </h3>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
        {item.projectName && (
          <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Project</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{item.projectName}</div>
          </div>
        )}
        {item.status && (
          <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Status</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{item.status}</div>
          </div>
        )}
        {item.actualHours !== undefined && (
          <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Actual Hours</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--pinnacle-teal)' }}>{item.actualHours}h</div>
          </div>
        )}
        {item.baselineHours !== undefined && (
          <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Baseline Hours</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{item.baselineHours}h</div>
          </div>
        )}
        {item.percentComplete !== undefined && (
          <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Progress</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{item.percentComplete}%</div>
          </div>
        )}
        {item.assignedResource && (
          <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Assigned To</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{item.assignedResource}</div>
          </div>
        )}
        {relatedData && (
          <>
            <div style={{ padding: '0.75rem', background: 'rgba(59,130,246,0.1)', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.65rem', color: '#3B82F6', marginBottom: '0.25rem' }}>Related Tasks</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#3B82F6' }}>{relatedData.tasks.length}</div>
            </div>
            <div style={{ padding: '0.75rem', background: 'rgba(16,185,129,0.1)', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.65rem', color: '#10B981', marginBottom: '0.25rem' }}>Total Hours</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10B981' }}>{relatedData.hours.toLocaleString()}</div>
            </div>
          </>
        )}
      </div>

      {relatedData && relatedData.tasks.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
            Related Tasks ({Math.min(5, relatedData.tasks.length)} of {relatedData.tasks.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {relatedData.tasks.slice(0, 5).map((t: any, idx: number) => (
              <div key={idx} style={{ 
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.5rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px',
              }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{t.name || t.taskName}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.actualHours || 0}h</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== MAIN PAGE =====
export default function TasksPage() {
  const { filteredData, hierarchyFilters, metricsHistory, variancePeriod } = useData();
  const data = filteredData;
  
  // Cross-filter state
  const crossFilter = useCrossFilter();
  
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [activeSection, setActiveSection] = useState<string>('hours');
  const [sankeyGroupBy, setSankeyGroupBy] = useState<SankeyGroupBy>('role');
  const [drillDownItem, setDrillDownItem] = useState<{ item: any; type: string } | null>(null);

  const contextLabel = useMemo(() => {
    if (hierarchyFilters?.project) return `Project: ${hierarchyFilters.project}`;
    if (hierarchyFilters?.seniorManager) return `Portfolio: ${hierarchyFilters.seniorManager}`;
    return 'All Projects';
  }, [hierarchyFilters]);

  // Apply cross-filters to tasks - MUST be defined first
  const crossFilteredTasks = useMemo(() => {
    let taskList = data.tasks || [];
    
    // Apply cross-filters
    crossFilter.activeFilters.forEach(filter => {
      switch (filter.type) {
        case 'project':
          taskList = taskList.filter((t: any) => 
            (t.projectName || t.project_name || '').toLowerCase().includes(filter.value.toLowerCase())
          );
          break;
        case 'status':
          taskList = taskList.filter((t: any) => {
            const status = (t.status || '').toLowerCase();
            const pc = t.percentComplete || 0;
            const filterVal = filter.value.toLowerCase();
            if (filterVal === 'complete' || filterVal === 'completed') return status.includes('complete') || pc >= 100;
            if (filterVal === 'inprogress' || filterVal === 'in progress' || filterVal === 'active') return pc > 0 && pc < 100;
            if (filterVal === 'blocked') return status.includes('block') || status.includes('hold');
            return true;
          });
          break;
        case 'resource':
          taskList = taskList.filter((t: any) => 
            (t.assignedResource || t.assignedTo || '').toLowerCase().includes(filter.value.toLowerCase())
          );
          break;
        case 'phase':
          taskList = taskList.filter((t: any) => 
            (t.phase || t.phaseId || '').toLowerCase().includes(filter.value.toLowerCase())
          );
          break;
        case 'workType':
          // Filter by work type would require additional field
          break;
      }
    });
    
    return taskList;
  }, [data.tasks, crossFilter.activeFilters]);

  // Task stats - uses cross-filtered tasks when filters are active
  const taskStats = useMemo(() => {
    const taskList = crossFilter.activeFilters.length > 0 ? crossFilteredTasks : (data.tasks || []);
    let completed = 0, inProgress = 0, blocked = 0, notStarted = 0, totalPlanned = 0, totalActual = 0;
    taskList.forEach((t: any) => {
      const status = (t.status || '').toLowerCase();
      const pc = t.percentComplete || 0;
      if (status.includes('complete') || pc >= 100) completed++;
      else if (status.includes('block') || status.includes('hold')) blocked++;
      else if (pc > 0 || status.includes('progress')) inProgress++;
      else notStarted++;
      const bh = Number(t.baselineHours ?? t.budgetHours ?? 0);
      const ah = Number(t.actualHours ?? 0);
      totalPlanned += isFinite(bh) ? bh : 0;
      totalActual += isFinite(ah) ? ah : 0;
    });
    const qcByName = data.qcByNameAndRole || [];
    const totalClosed = qcByName.reduce((s: number, q: any) => s + (q.closedCount || 0), 0);
    const totalPassed = qcByName.reduce((s: number, q: any) => s + (q.passCount || 0), 0);
    return { 
      total: taskList.length, completed, inProgress, blocked, notStarted, 
      overallProgress: taskList.length > 0 ? Math.round((completed / taskList.length) * 100) : 0,
      efficiency: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 100,
      totalHours: Math.round(totalActual),
      qcPassRate: totalClosed > 0 ? Math.round((totalPassed / totalClosed) * 100) : 0,
    };
  }, [data.tasks, data.qcByNameAndRole, crossFilteredTasks, crossFilter.activeFilters]);

  const laborData = useMemo(() => data.laborBreakdown || { byWorker: [], weeks: [] }, [data.laborBreakdown]);
  const qcByAnalyst = useMemo(() => data.qcByNameAndRole || [], [data.qcByNameAndRole]);
  // Use cross-filtered tasks for charts when filters are active
  const tasks = useMemo(() => {
    return crossFilter.activeFilters.length > 0 ? crossFilteredTasks : (data.tasks || []);
  }, [data.tasks, crossFilteredTasks, crossFilter.activeFilters]);

  const filteredTasks = useMemo(() => {
    let taskList = crossFilteredTasks;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      taskList = taskList.filter((t: any) => (t.name || t.taskName || '').toLowerCase().includes(term) || (t.assignedResource || t.assignedTo || '').toLowerCase().includes(term));
    }
    if (statusFilter !== 'all') {
      taskList = taskList.filter((t: any) => {
        const status = (t.status || '').toLowerCase();
        const pc = t.percentComplete || 0;
        switch (statusFilter) {
          case 'completed': return status.includes('complete') || pc >= 100;
          case 'inProgress': return pc > 0 && pc < 100 && !status.includes('block');
          case 'blocked': return status.includes('block') || status.includes('hold');
          case 'notStarted': return pc === 0 && !status.includes('progress');
          default: return true;
        }
      });
    }
    return taskList;
  }, [crossFilteredTasks, searchTerm, statusFilter]);

  // Get drill-down related data
  const drillDownRelatedData = useMemo(() => {
    if (!drillDownItem) return undefined;
    
    const item = drillDownItem.item;
    let relatedTasks: any[] = [];
    
    if (drillDownItem.type === 'project') {
      relatedTasks = (data.tasks || []).filter((t: any) => 
        (t.projectName || t.project_name) === item.name || t.projectId === item.id
      );
    } else if (drillDownItem.type === 'resource') {
      relatedTasks = (data.tasks || []).filter((t: any) => 
        (t.assignedResource || t.assignedTo) === item.name
      );
    } else if (drillDownItem.type === 'status') {
      const statusVal = (item.name || '').toLowerCase();
      relatedTasks = (data.tasks || []).filter((t: any) => {
        const pc = t.percentComplete || 0;
        if (statusVal.includes('complete')) return pc >= 100;
        if (statusVal.includes('progress') || statusVal.includes('active')) return pc > 0 && pc < 100;
        return true;
      });
    }
    
    return {
      tasks: relatedTasks,
      hours: relatedTasks.reduce((sum: number, t: any) => sum + (t.actualHours || 0), 0),
      workers: [...new Set(relatedTasks.map((t: any) => t.assignedResource || t.assignedTo).filter(Boolean))],
    };
  }, [drillDownItem, data.tasks]);

  // Chart click handler for cross-filtering
  const handleChartClick = useCallback((params: any, chartType: string) => {
    if (!params || !params.name) return;
    
    const name = params.name;
    let filterType: CrossFilter['type'] = 'custom';
    let filterValue = name;
    
    // Determine filter type based on chart and data
    if (chartType === 'sankey') {
      if (['Complete', 'In Progress', 'Not Started', 'Blocked'].includes(name)) {
        filterType = 'status';
      } else if (sankeyGroupBy === 'project') {
        filterType = 'project';
      } else if (sankeyGroupBy === 'role') {
        filterType = 'resource';
      } else if (sankeyGroupBy === 'phase') {
        filterType = 'phase';
      }
    } else if (chartType === 'status') {
      filterType = 'status';
    } else if (chartType === 'workType') {
      filterType = 'workType';
    }
    
    // Toggle or set filter
    crossFilter.toggleFilter({
      type: filterType,
      value: filterValue,
      label: name,
      source: chartType,
    });
    
    // Set drill-down item
    setDrillDownItem({
      item: { name, ...params.data },
      type: filterType,
    });
  }, [crossFilter, sankeyGroupBy]);

  // Check for empty data — only plan projects have tasks
  const hasData = (data.tasks?.length ?? 0) > 0;

  return (
    <div className="page-panel insights-page" style={{ paddingBottom: '2rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--pinnacle-teal)', fontWeight: 600 }}>{contextLabel}</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.25rem 0' }}>Task Operations</h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
          Task-level hours and performance for projects with imported plans - click any visual to drill down
        </p>
      </div>

      {/* Empty State */}
      {!hasData && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4rem 2rem',
          background: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          textAlign: 'center',
        }}>
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ marginBottom: '1.5rem', opacity: 0.5 }}>
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="M9 12h6" />
            <path d="M9 16h6" />
          </svg>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Project Plans Found</h2>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '420px' }}>
            Upload and process an MPP project plan from the Project Plans page. Only projects with imported schedules appear here.
          </p>
          <a
            href="/project-controls/data-management"
            style={{
              padding: '0.75rem 1.5rem',
              background: 'var(--pinnacle-teal)',
              color: '#000',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            Go to Data Management
          </a>
        </div>
      )}

      {hasData && (
      <>
      {/* Cross-Filter Bar */}
      <CrossFilterBar
        filters={crossFilter.activeFilters}
        drillPath={crossFilter.drillDownPath}
        onRemove={(type, value) => {
          crossFilter.removeFilter(type, value);
          setDrillDownItem(null);
        }}
        onClear={() => {
          crossFilter.clearFilters();
          setDrillDownItem(null);
        }}
        onDrillToLevel={crossFilter.drillToLevel}
      />

      {/* Drill-Down Panel */}
      {drillDownItem && (
        <DrillDownPanel
          item={drillDownItem.item}
          type={drillDownItem.type}
          onClose={() => {
            setDrillDownItem(null);
            crossFilter.clearFilters();
          }}
          relatedData={drillDownRelatedData}
        />
      )}

      <div style={{ marginBottom: '1.25rem' }}>
        <CommandCenter stats={taskStats} onFilterChange={setStatusFilter} activeFilter={statusFilter} />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {[{ id: 'hours', label: 'Hours & Labor' }, { id: 'executive', label: 'Executive View' }, { id: 'qc', label: 'Quality Control' }, { id: 'tasks', label: 'Task Explorer' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveSection(tab.id)} style={{
            padding: '0.5rem 1rem', borderRadius: '8px', border: `1px solid ${activeSection === tab.id ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
            background: activeSection === tab.id ? 'rgba(64,224,208,0.1)' : 'transparent',
            color: activeSection === tab.id ? 'var(--pinnacle-teal)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
          }}>{tab.label}</button>
        ))}
      </div>

      {selectedTask && (
        <div style={{ background: 'linear-gradient(135deg, rgba(64,224,208,0.1) 0%, rgba(205,220,57,0.05) 100%)', borderRadius: '12px', padding: '1rem', marginBottom: '1rem', border: '1px solid var(--pinnacle-teal)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>{selectedTask.name || selectedTask.taskName}</h4>
            <button onClick={() => setSelectedTask(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.25rem' }}>x</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', fontSize: '0.8rem' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Project:</span> <strong>{selectedTask.projectName || '-'}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Assignee:</span> <strong>{selectedTask.assignedResource || selectedTask.assignedTo || '-'}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Status:</span> <strong>{selectedTask.status || '-'}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Planned:</span> <strong>{selectedTask.baselineHours || 0}h</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Actual:</span> <strong style={{ color: (selectedTask.actualHours || 0) > (selectedTask.baselineHours || 0) ? '#EF4444' : '#10B981' }}>{selectedTask.actualHours || 0}h</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Progress:</span> <strong>{selectedTask.percentComplete || 0}%</strong></div>
          </div>
        </div>
      )}

      {/* HOURS & LABOR */}
      {activeSection === 'hours' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <SectionCard 
            title="Hours vs Efficiency" 
            subtitle="Click any bar to filter by task - Actual hours, over/under budget, and efficiency trend"
          >
            <HoursEfficiencyChart 
              data={data.taskHoursEfficiency || { tasks: [], actualWorked: [], estimatedAdded: [] }} 
              onBarClick={(params) => handleChartClick(params, 'efficiency')}
            />
          </SectionCard>

          <SectionCard 
            title="Hours Flow" 
            subtitle="How hours distribute across your team - click any node to filter"
            headerRight={
              <select value={sankeyGroupBy} onChange={(e) => setSankeyGroupBy(e.target.value as SankeyGroupBy)}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <option value="role">By Role</option>
                <option value="phase">By Phase</option>
                <option value="project">By Project</option>
                <option value="status">By Status</option>
                <option value="workType">By Work Type</option>
              </select>
            }
          >
            <EnhancedSankey 
              stats={taskStats} 
              laborData={laborData} 
              tasks={tasks} 
              groupBy={sankeyGroupBy}
              onClick={(params) => handleChartClick(params, 'sankey')}
            />
          </SectionCard>

          <SectionCard title="Hours by Work Type" subtitle="Click to filter - Real charge types from Workday (EX=Execution, QC=Quality, CR=Customer Relations)">
            <HoursByWorkTypeChart 
              tasks={tasks}
              byChargeType={data.laborBreakdown?.byChargeType}
              onClick={(params) => handleChartClick(params, 'workType')}
            />
          </SectionCard>
        </div>
      )}

      {/* EXECUTIVE VIEW */}
      {activeSection === 'executive' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <SectionCard title="Variance Analysis" subtitle={`Comparing to ${getPeriodDisplayName(variancePeriod)}`}>
            <VarianceAnalysisSection metricsHistory={metricsHistory || []} variancePeriod={variancePeriod} stats={taskStats} />
          </SectionCard>

          <ExecutiveSection tasks={tasks} stats={taskStats} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <SectionCard title="Top Contributors" subtitle="By total hours logged">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(laborData.byWorker || []).filter((w: any) => w.total > 0).sort((a: any, b: any) => b.total - a.total).slice(0, 5).map((w: any, idx: number) => {
                  const maxHours = (laborData.byWorker || []).sort((a: any, b: any) => b.total - a.total)[0]?.total || 1;
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: idx === 0 ? '#F59E0B' : idx === 1 ? '#9CA3AF' : idx === 2 ? '#CD7F32' : 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: idx < 3 ? '#000' : 'var(--text-muted)' }}>{idx + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{w.name}</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--pinnacle-teal)' }}>{sn(w.total, 0)}h</span>
                        </div>
                        <div style={{ height: '4px', background: 'var(--bg-tertiary)', borderRadius: '2px' }}>
                          <div style={{ height: '100%', width: `${(w.total / maxHours) * 100}%`, background: 'linear-gradient(90deg, var(--pinnacle-teal), #CDDC39)', borderRadius: '2px' }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!(laborData.byWorker || []).length && <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No data</div>}
              </div>
            </SectionCard>

            <SectionCard title="Hours Summary" subtitle="Quick breakdown">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                <div style={{ padding: '1rem', background: 'rgba(59,130,246,0.1)', borderRadius: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3B82F6' }}>{taskStats.totalHours.toLocaleString()}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total Actual</div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(16,185,129,0.1)', borderRadius: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10B981' }}>{taskStats.efficiency}%</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Efficiency</div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(245,158,11,0.1)', borderRadius: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F59E0B' }}>{taskStats.inProgress}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Active Tasks</div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.1)', borderRadius: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#EF4444' }}>{taskStats.blocked}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Blocked</div>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* QC SECTION */}
      {activeSection === 'qc' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <SectionCard title="Analyst Performance Comparison" subtitle="Click to filter by analyst - Top analysts by volume and pass rate">
            <QCPerformanceRadar 
              qcData={qcByAnalyst}
              onClick={(params) => {
                if (params.name) {
                  crossFilter.toggleFilter({
                    type: 'resource',
                    value: params.name,
                    label: params.name,
                    source: 'qcRadar',
                  });
                }
              }}
            />
          </SectionCard>

          <SectionCard title="Individual QC Performance" subtitle={`${qcByAnalyst.length} analysts`} noPadding>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                  <tr>
                    <th>Employee</th>
                    <th>Role</th>
                    <th className="number">Pass Rate</th>
                    <th className="number">Open</th>
                    <th className="number">Closed</th>
                    <th className="number">Passed</th>
                  </tr>
                </thead>
                <tbody>
                  {[...qcByAnalyst].sort((a: any, b: any) => (b.passRate || 0) - (a.passRate || 0)).map((a: any, idx: number) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 500 }}>{a.name}</td>
                      <td>{a.role || '-'}</td>
                      <td className="number" style={{ fontWeight: 600, color: (a.passRate || 0) >= 90 ? '#10B981' : '#F59E0B' }}>{`${sn(a.passRate, 1)}%`}</td>
                      <td className="number">{a.openCount || 0}</td>
                      <td className="number">{a.closedCount || 0}</td>
                      <td className="number">{a.passCount || 0}</td>
                    </tr>
                  ))}
                  {qcByAnalyst.length > 0 && (
                    <tr style={{ fontWeight: 'bold', borderTop: '2px solid var(--border-color)' }}>
                      <td>Total</td>
                      <td></td>
                      <td className="number" style={{ color: 'var(--pinnacle-teal)' }}>{taskStats.qcPassRate}%</td>
                      <td className="number">{qcByAnalyst.reduce((s: number, a: any) => s + (a.openCount || 0), 0)}</td>
                      <td className="number">{qcByAnalyst.reduce((s: number, a: any) => s + (a.closedCount || 0), 0)}</td>
                      <td className="number">{qcByAnalyst.reduce((s: number, a: any) => s + (a.passCount || 0), 0)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}

      {/* TASKS SECTION - Creative Visual Explorer */}
      {activeSection === 'tasks' && (
        <TaskExplorerSection 
          tasks={filteredTasks}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          selectedTask={selectedTask}
          setSelectedTask={setSelectedTask}
        />
      )}
      </>
      )}
    </div>
  );
}
