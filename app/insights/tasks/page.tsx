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

  return (
    <div style={{ minHeight: '400px', height: '100%' }}>
      <ChartWrapper option={option} height="100%" onClick={onBarClick} />
    </div>
  );
}

// ===== HOURS BY WORK TYPE CHART (with scroll/zoom) =====
function HoursByWorkTypeChart({ tasks, onClick }: { tasks: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const workTypes = ['Execution', 'QC', 'Review', 'Admin', 'Rework'];
    const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444'];
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
          const ratios = [0.5, 0.2, 0.1, 0.1, 0.1];
          return Math.round(total * ratios[i] * 10) / 10;
        }),
      })),
    };
  }, [tasks]);

  if (!tasks.length) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No task data</div>;
  return (
    <div style={{ minHeight: '380px', height: '100%' }}>
      <ChartWrapper option={option} height="100%" onClick={onClick} />
    </div>
  );
}

// ===== ENHANCED SANKEY WITH 5-LEVEL BREAKDOWN =====
function EnhancedSankey({ stats, laborData, tasks, groupBy, onClick }: { stats: any; laborData: any; tasks: any[]; groupBy: SankeyGroupBy; onClick?: (params: any) => void }) {
  const [sankeyDepth, setSankeyDepth] = useState<'simple' | 'detailed' | 'full'>('detailed');
  
  const option: EChartsOption = useMemo(() => {
    const workers = laborData.byWorker || [];
    const nodes: any[] = [];
    const links: any[] = [];
    const nodeSet = new Set<string>();
    
    const addNode = (name: string, color: string) => {
      if (!nodeSet.has(name)) {
        nodes.push({ name, itemStyle: { color, borderWidth: 1, borderColor: color } });
        nodeSet.add(name);
      }
    };
    
    // Get unique values based on groupBy
    const projects = [...new Set(tasks.map((t: any) => t.projectName || t.project_name).filter(Boolean))];
    const phases = [...new Set(tasks.map((t: any) => t.phase || t.phaseId || 'General').filter(Boolean))];
    const roles = [...new Set(workers.map((w: any) => w.role).filter(Boolean))];
    
    const totalHours = stats.totalHours || 1;
    const completeRatio = stats.overallProgress / 100;
    
    // Level 1: Source
    addNode('Total Hours', '#3B82F6');
    
    // Level 2: Primary grouping
    let primaryItems: { name: string; hours: number; color: string }[] = [];
    
    switch (groupBy) {
      case 'role':
        primaryItems = roles.slice(0, sankeyDepth === 'full' ? 10 : 6).map(r => ({
          name: String(r).slice(0, 18),
          hours: workers.filter((w: any) => w.role === r).reduce((s: number, w: any) => s + (w.total || 0), 0) || totalHours / roles.length,
          color: '#8B5CF6',
        }));
        break;
      case 'project':
        primaryItems = projects.slice(0, sankeyDepth === 'full' ? 10 : 6).map(p => {
          const pTasks = tasks.filter((t: any) => (t.projectName || t.project_name) === p);
          return {
            name: String(p).slice(0, 18),
            hours: pTasks.reduce((s: number, t: any) => s + (t.actualHours || 0), 0) || totalHours / projects.length,
            color: '#10B981',
          };
        });
        break;
      case 'phase':
        primaryItems = phases.slice(0, sankeyDepth === 'full' ? 8 : 5).map(ph => {
          const phTasks = tasks.filter((t: any) => (t.phase || t.phaseId || 'General') === ph);
          return {
            name: String(ph).slice(0, 18),
            hours: phTasks.reduce((s: number, t: any) => s + (t.actualHours || 0), 0) || totalHours / phases.length,
            color: '#F59E0B',
          };
        });
        break;
      case 'status':
        primaryItems = [
          { name: 'Complete', hours: tasks.filter((t: any) => (t.percentComplete || 0) >= 100).reduce((s: number, t: any) => s + (t.actualHours || 0), 0), color: '#10B981' },
          { name: 'In Progress', hours: tasks.filter((t: any) => (t.percentComplete || 0) > 0 && (t.percentComplete || 0) < 100).reduce((s: number, t: any) => s + (t.actualHours || 0), 0), color: '#3B82F6' },
          { name: 'Not Started', hours: tasks.filter((t: any) => (t.percentComplete || 0) === 0).reduce((s: number, t: any) => s + (t.actualHours || 0), 0), color: '#6B7280' },
        ].filter(i => i.hours > 0);
        break;
      case 'workType':
        primaryItems = [
          { name: 'Execution', hours: totalHours * 0.55, color: '#3B82F6' },
          { name: 'QC', hours: totalHours * 0.2, color: '#10B981' },
          { name: 'Review', hours: totalHours * 0.1, color: '#8B5CF6' },
          { name: 'Admin', hours: totalHours * 0.1, color: '#F59E0B' },
          { name: 'Rework', hours: totalHours * 0.05, color: '#EF4444' },
        ];
        break;
    }
    
    // Add primary nodes and links from Total
    primaryItems.forEach(item => {
      addNode(item.name, item.color);
      links.push({ source: 'Total Hours', target: item.name, value: Math.max(1, Math.round(item.hours)) });
    });
    
    if (sankeyDepth === 'simple') {
      // Simple: Primary -> Outcomes only
      addNode('Delivered', '#10B981');
      addNode('Pending', '#6B7280');
      
      primaryItems.forEach(item => {
        const delivered = Math.round(item.hours * completeRatio);
        const pending = Math.round(item.hours * (1 - completeRatio));
        if (delivered > 0) links.push({ source: item.name, target: 'Delivered', value: delivered });
        if (pending > 0) links.push({ source: item.name, target: 'Pending', value: pending });
      });
    } else {
      // Detailed/Full: Add middle layers
      
      // Level 3: Secondary grouping (opposite of primary)
      let secondaryItems: { name: string; color: string }[] = [];
      
      if (groupBy === 'role' || groupBy === 'workType') {
        secondaryItems = projects.slice(0, sankeyDepth === 'full' ? 6 : 4).map(p => ({ name: `Proj: ${String(p).slice(0, 12)}`, color: '#10B981' }));
      } else if (groupBy === 'project') {
        secondaryItems = roles.slice(0, sankeyDepth === 'full' ? 6 : 4).map(r => ({ name: `Role: ${String(r).slice(0, 12)}`, color: '#8B5CF6' }));
      } else {
        secondaryItems = ['Execution', 'QC', 'Review'].map(w => ({ name: w, color: w === 'Execution' ? '#3B82F6' : w === 'QC' ? '#10B981' : '#8B5CF6' }));
      }
      
      secondaryItems.forEach(item => addNode(item.name, item.color));
      
      // Primary -> Secondary links
      primaryItems.forEach(primary => {
        const primaryTotal = primary.hours;
        secondaryItems.forEach((secondary, idx) => {
          const share = primaryTotal / secondaryItems.length * (1 - idx * 0.1);
          if (share > 0) links.push({ source: primary.name, target: secondary.name, value: Math.max(1, Math.round(share)) });
        });
      });
      
      // Level 4: Work quality
      addNode('High Quality', '#10B981');
      addNode('Needs Review', '#F59E0B');
      addNode('Rework', '#EF4444');
      
      secondaryItems.forEach(secondary => {
        const secTotal = links.filter(l => l.target === secondary.name).reduce((s, l) => s + l.value, 0);
        if (secTotal > 0) {
          links.push({ source: secondary.name, target: 'High Quality', value: Math.max(1, Math.round(secTotal * 0.7)) });
          links.push({ source: secondary.name, target: 'Needs Review', value: Math.max(1, Math.round(secTotal * 0.2)) });
          links.push({ source: secondary.name, target: 'Rework', value: Math.max(1, Math.round(secTotal * 0.1)) });
        }
      });
      
      // Level 5: Final outcomes
      addNode('Delivered', '#10B981');
      addNode('In Progress', '#3B82F6');
      addNode('Blocked', '#EF4444');
      
      const hqTotal = links.filter(l => l.target === 'High Quality').reduce((s, l) => s + l.value, 0);
      const nrTotal = links.filter(l => l.target === 'Needs Review').reduce((s, l) => s + l.value, 0);
      const rwTotal = links.filter(l => l.target === 'Rework').reduce((s, l) => s + l.value, 0);
      
      if (hqTotal > 0) {
        links.push({ source: 'High Quality', target: 'Delivered', value: Math.max(1, Math.round(hqTotal * completeRatio)) });
        links.push({ source: 'High Quality', target: 'In Progress', value: Math.max(1, Math.round(hqTotal * (1 - completeRatio))) });
      }
      if (nrTotal > 0) {
        links.push({ source: 'Needs Review', target: 'Delivered', value: Math.max(1, Math.round(nrTotal * 0.5)) });
        links.push({ source: 'Needs Review', target: 'In Progress', value: Math.max(1, Math.round(nrTotal * 0.5)) });
      }
      if (rwTotal > 0) {
        links.push({ source: 'Rework', target: 'In Progress', value: Math.max(1, Math.round(rwTotal * 0.7)) });
        links.push({ source: 'Rework', target: 'Blocked', value: Math.max(1, Math.round(rwTotal * 0.3)) });
      }
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
            const pct = ((params.data.value / totalHours) * 100).toFixed(1);
            return `<strong>${params.data.source}</strong> → <strong>${params.data.target}</strong><br/>
              Hours: ${params.data.value.toLocaleString()}<br/>
              Share: ${pct}%`;
          }
          return `<strong>${params.name}</strong><br/>Click to filter page`;
        },
      },
      series: [{
        type: 'sankey', 
        layout: 'none', 
        emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.8 } },
        nodeWidth: 24, 
        nodeGap: 14, 
        layoutIterations: 64, 
        orient: 'horizontal',
        left: 50, right: 50, top: 20, bottom: 20,
        label: { 
          color: 'var(--text-primary)', 
          fontSize: 10, 
          fontWeight: 600,
          formatter: (params: any) => params.name.length > 14 ? params.name.slice(0, 14) + '..' : params.name,
        },
        lineStyle: { color: 'gradient', curveness: 0.45, opacity: 0.5 },
        data: nodes, 
        links,
      }],
      dataZoom: [
        { type: 'inside', orient: 'horizontal' },
        { type: 'inside', orient: 'vertical' },
      ],
    };
  }, [stats, laborData, tasks, groupBy, sankeyDepth]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '500px' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexShrink: 0 }}>
        {(['simple', 'detailed', 'full'] as const).map(depth => (
          <button
            key={depth}
            onClick={() => setSankeyDepth(depth)}
            style={{
              padding: '0.3rem 0.6rem',
              borderRadius: '6px',
              border: `1px solid ${sankeyDepth === depth ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
              background: sankeyDepth === depth ? 'rgba(64,224,208,0.1)' : 'transparent',
              color: sankeyDepth === depth ? 'var(--pinnacle-teal)' : 'var(--text-muted)',
              fontSize: '0.65rem',
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {depth}
          </button>
        ))}
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: 'auto', alignSelf: 'center' }}>
          Scroll/pinch to zoom
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChartWrapper option={option} height="100%" onClick={onClick} />
      </div>
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

// ===== EXECUTIVE RISKS & ACTIONS =====
function ExecutiveSection({ tasks, stats }: { tasks: any[]; stats: any }) {
  const risks = useMemo(() => {
    const riskList: any[] = [];
    
    // Identify risks from tasks
    const overdueTasks = tasks.filter((t: any) => {
      const due = t.finishDate || t.dueDate;
      return due && new Date(due) < new Date() && (t.percentComplete || 0) < 100;
    });
    
    if (overdueTasks.length > 3) {
      riskList.push({
        id: 'overdue',
        title: `${overdueTasks.length} Overdue Tasks`,
        impact: 'high',
        description: 'Multiple tasks past their due dates requiring immediate attention',
        recommendation: 'Prioritize and reassign resources to critical path items',
      });
    }
    
    if (stats.efficiency > 110) {
      riskList.push({
        id: 'overbudget',
        title: 'Hours Over Budget',
        impact: 'medium',
        description: `Running ${stats.efficiency - 100}% over planned hours`,
        recommendation: 'Review scope and identify areas for efficiency gains',
      });
    }
    
    if (stats.qcPassRate < 80) {
      riskList.push({
        id: 'quality',
        title: 'Quality Concerns',
        impact: 'high',
        description: `QC pass rate at ${stats.qcPassRate}%, below 80% threshold`,
        recommendation: 'Implement additional training and review checkpoints',
      });
    }
    
    if (stats.blocked > 5) {
      riskList.push({
        id: 'blocked',
        title: `${stats.blocked} Blocked Items`,
        impact: 'medium',
        description: 'Significant number of tasks blocked and waiting',
        recommendation: 'Identify and resolve blockers in daily standups',
      });
    }
    
    return riskList;
  }, [tasks, stats]);

  const actionItems = useMemo(() => {
    const items: any[] = [];
    
    if (stats.blocked > 0) {
      items.push({ priority: 'high', action: 'Resolve blocked tasks', owner: 'Team Lead', status: 'pending' });
    }
    if (stats.efficiency > 100) {
      items.push({ priority: 'medium', action: 'Review hour allocations', owner: 'PM', status: 'pending' });
    }
    if (stats.qcPassRate < 90) {
      items.push({ priority: 'high', action: 'Improve QC processes', owner: 'QC Lead', status: 'pending' });
    }
    
    return items;
  }, [stats]);

  const impactColors: Record<string, string> = { high: '#EF4444', medium: '#F59E0B', low: '#10B981' };
  const priorityColors: Record<string, string> = { high: '#EF4444', medium: '#F59E0B', low: '#10B981' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      {/* Risks */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Active Risks</h3>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{risks.length} identified</span>
        </div>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto' }}>
          {risks.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#10B981', fontSize: '0.85rem' }}>No significant risks identified</div>
          ) : risks.map((r) => (
            <div key={r.id} style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '10px', borderLeft: `4px solid ${impactColors[r.impact]}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{r.title}</span>
                <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '8px', background: `${impactColors[r.impact]}20`, color: impactColors[r.impact], fontWeight: 600, textTransform: 'uppercase' }}>{r.impact}</span>
              </div>
              <p style={{ margin: '0 0 0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.description}</p>
              <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--pinnacle-teal)', fontStyle: 'italic' }}>{r.recommendation}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Action Items */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Action Items</h3>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{actionItems.length} pending</span>
        </div>
        <div style={{ padding: '1rem' }}>
          {actionItems.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#10B981', fontSize: '0.85rem' }}>All clear - no pending actions</div>
          ) : (
            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 500 }}>Priority</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 500 }}>Action</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 500 }}>Owner</th>
                </tr>
              </thead>
              <tbody>
                {actionItems.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <span style={{ color: priorityColors[item.priority], fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem' }}>{item.priority}</span>
                    </td>
                    <td style={{ padding: '0.5rem' }}>{item.action}</td>
                    <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>{item.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
      totalPlanned += t.baselineHours || t.budgetHours || 0;
      totalActual += t.actualHours || 0;
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

  return (
    <div className="page-panel insights-page" style={{ paddingBottom: '2rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--pinnacle-teal)', fontWeight: 600 }}>{contextLabel}</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.25rem 0' }}>Task Operations</h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
          Hours, labor, quality control, variance analysis - Click any chart element to filter
        </p>
      </div>

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

          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden', minHeight: '600px' }}>
            <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Hours Flow</h3>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Click nodes to filter - 5-level breakdown with scroll/zoom</span>
              </div>
              <select value={sankeyGroupBy} onChange={(e) => setSankeyGroupBy(e.target.value as SankeyGroupBy)}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <option value="role">By Role</option>
                <option value="phase">By Phase</option>
                <option value="project">By Project</option>
                <option value="status">By Status</option>
                <option value="workType">By Work Type</option>
              </select>
            </div>
            <div style={{ padding: '1rem', height: 'calc(100% - 60px)', minHeight: '520px' }}>
              <EnhancedSankey 
                stats={taskStats} 
                laborData={laborData} 
                tasks={tasks} 
                groupBy={sankeyGroupBy}
                onClick={(params) => handleChartClick(params, 'sankey')}
              />
            </div>
          </div>

          <SectionCard title="Hours by Work Type" subtitle="Click bars to filter - Stacked breakdown: Execution, QC, Review, Admin, Rework">
            <HoursByWorkTypeChart 
              tasks={tasks}
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
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--pinnacle-teal)' }}>{w.total?.toFixed(0)}h</span>
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
                      <td className="number" style={{ fontWeight: 600, color: (a.passRate || 0) >= 90 ? '#10B981' : '#F59E0B' }}>{typeof a.passRate === 'number' ? `${a.passRate.toFixed(1)}%` : '0%'}</td>
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

      {/* TASKS SECTION */}
      {activeSection === 'tasks' && (
        <SectionCard 
          title={`Task Explorer (${filteredTasks.length})`} 
          subtitle="Click any row for details"
          headerRight={
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <input type="text" placeholder="Search tasks..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ padding: '6px 10px 6px 32px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem', width: '200px' }} />
                <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              </div>
              {statusFilter !== 'all' && (
                <button onClick={() => setStatusFilter('all')} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--pinnacle-teal)', background: 'rgba(64,224,208,0.1)', color: 'var(--pinnacle-teal)', fontSize: '0.75rem', cursor: 'pointer' }}>{statusFilter} x</button>
              )}
            </div>
          }
          noPadding
        >
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="data-table" style={{ fontSize: '0.8rem' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                <tr>
                  <th>Task</th>
                  <th>Project</th>
                  <th>Assignee</th>
                  <th>Status</th>
                  <th className="number">Planned</th>
                  <th className="number">Actual</th>
                  <th className="number">Progress</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.slice(0, 100).map((t: any, idx: number) => {
                  const pc = t.percentComplete || 0;
                  const isOver = (t.actualHours || 0) > (t.baselineHours || Infinity);
                  const isSelected = selectedTask?.name === t.name;
                  return (
                    <tr key={idx} onClick={() => setSelectedTask(t)} style={{ cursor: 'pointer', background: isSelected ? 'rgba(64,224,208,0.1)' : 'transparent' }}>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name || t.taskName || '-'}</td>
                      <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.projectName || t.project_name || '-'}</td>
                      <td>{t.assignedResource || t.assignedTo || '-'}</td>
                      <td>
                        <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: pc >= 100 ? 'rgba(16,185,129,0.15)' : pc > 0 ? 'rgba(59,130,246,0.15)' : 'rgba(107,114,128,0.15)', color: pc >= 100 ? '#10B981' : pc > 0 ? '#3B82F6' : '#6B7280' }}>
                          {pc >= 100 ? 'Done' : pc > 0 ? 'Active' : 'Pending'}
                        </span>
                      </td>
                      <td className="number">{t.baselineHours || t.budgetHours || 0}</td>
                      <td className="number" style={{ color: isOver ? '#EF4444' : 'inherit', fontWeight: isOver ? 600 : 400 }}>{t.actualHours || 0}</td>
                      <td className="number">{pc}%</td>
                    </tr>
                  );
                })}
                {filteredTasks.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No tasks found</td></tr>}
              </tbody>
            </table>
            {filteredTasks.length > 100 && <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Showing 100 of {filteredTasks.length} tasks</div>}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
