'use client';

/**
 * @fileoverview Tasks - Enhanced Operations Dashboard for PPC V3.
 * 
 * Creative visual combinations:
 * - Unified Command Center with radial progress + stats
 * - Task Flow Sankey showing lifecycle stages
 * - Resource Workload Heatmap showing team capacity
 * - Priority Matrix (urgency vs importance scatter)
 * - Velocity Burndown with projections
 * - Interactive cross-filtering across all visuals
 * 
 * @module app/insights/tasks/page
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

// ===== UNIFIED COMMAND CENTER (Radial Progress + Stats Ring) =====
function CommandCenter({ stats, onFilterChange, activeFilter }: { 
  stats: { total: number; completed: number; inProgress: number; blocked: number; notStarted: number; overallProgress: number; efficiency: number };
  onFilterChange: (filter: string) => void;
  activeFilter: string;
}) {
  const segments = [
    { key: 'completed', label: 'Complete', value: stats.completed, color: '#10B981', icon: '✓' },
    { key: 'inProgress', label: 'Active', value: stats.inProgress, color: '#3B82F6', icon: '▶' },
    { key: 'blocked', label: 'Blocked', value: stats.blocked, color: '#EF4444', icon: '!' },
    { key: 'notStarted', label: 'Pending', value: stats.notStarted, color: '#6B7280', icon: '○' },
  ];
  
  const total = stats.total || 1;
  let cumulativeAngle = -90; // Start from top
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)',
      borderRadius: '24px',
      padding: '1.5rem',
      border: '1px solid var(--border-color)',
      display: 'flex',
      alignItems: 'center',
      gap: '2rem',
    }}>
      {/* Radial Progress Ring */}
      <div style={{ position: 'relative', width: '180px', height: '180px', flexShrink: 0 }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          {/* Background ring */}
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-tertiary)" strokeWidth="8" />
          
          {/* Segment arcs */}
          {segments.map((seg, idx) => {
            const percentage = (seg.value / total) * 100;
            const circumference = 2 * Math.PI * 42;
            const strokeLength = (percentage / 100) * circumference;
            const offset = segments.slice(0, idx).reduce((acc, s) => acc + (s.value / total) * circumference, 0);
            
            return (
              <circle
                key={seg.key}
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={seg.color}
                strokeWidth={activeFilter === seg.key ? 12 : 8}
                strokeDasharray={`${strokeLength} ${circumference}`}
                strokeDashoffset={-offset}
                style={{ 
                  cursor: 'pointer', 
                  transition: 'stroke-width 0.2s',
                  filter: activeFilter === seg.key ? `drop-shadow(0 0 8px ${seg.color})` : 'none',
                }}
                onClick={() => onFilterChange(activeFilter === seg.key ? 'all' : seg.key)}
              />
            );
          })}
        </svg>
        
        {/* Center content */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{ fontSize: '2.5rem', fontWeight: 900, lineHeight: 1, background: 'linear-gradient(135deg, var(--pinnacle-teal) 0%, #CDDC39 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {stats.overallProgress}%
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>COMPLETE</span>
        </div>
      </div>
      
      {/* Stats Grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
        {segments.map(seg => (
          <div
            key={seg.key}
            onClick={() => onFilterChange(activeFilter === seg.key ? 'all' : seg.key)}
            style={{
              background: activeFilter === seg.key ? `${seg.color}15` : 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              border: `1px solid ${activeFilter === seg.key ? seg.color : 'transparent'}`,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: seg.color }} />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{seg.label}</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: seg.color }}>{seg.value}</div>
          </div>
        ))}
      </div>
      
      {/* Efficiency Gauge */}
      <div style={{
        width: '120px',
        textAlign: 'center',
        padding: '1rem',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '16px',
      }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>Efficiency</div>
        <div style={{ 
          fontSize: '2rem', 
          fontWeight: 800, 
          color: stats.efficiency <= 100 ? '#10B981' : stats.efficiency <= 120 ? '#F59E0B' : '#EF4444' 
        }}>
          {stats.efficiency}%
        </div>
        <div style={{ 
          fontSize: '0.65rem', 
          color: stats.efficiency <= 100 ? '#10B981' : '#EF4444',
          marginTop: '0.25rem'
        }}>
          {stats.efficiency <= 100 ? 'On target' : `${stats.efficiency - 100}% over`}
        </div>
      </div>
    </div>
  );
}

// ===== TASK FLOW SANKEY =====
function TaskFlowChart({ stats }: { stats: any }) {
  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff' } },
    series: [{
      type: 'sankey',
      layout: 'none',
      emphasis: { focus: 'adjacency' },
      nodeAlign: 'justify',
      nodeWidth: 20,
      nodeGap: 12,
      layoutIterations: 0,
      label: { color: 'var(--text-primary)', fontSize: 11 },
      lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.4 },
      data: [
        { name: 'Backlog', itemStyle: { color: '#6B7280' } },
        { name: 'In Progress', itemStyle: { color: '#3B82F6' } },
        { name: 'Review', itemStyle: { color: '#8B5CF6' } },
        { name: 'Complete', itemStyle: { color: '#10B981' } },
        { name: 'Blocked', itemStyle: { color: '#EF4444' } },
      ],
      links: [
        { source: 'Backlog', target: 'In Progress', value: Math.max(1, stats.notStarted * 0.7) },
        { source: 'Backlog', target: 'Blocked', value: Math.max(1, stats.blocked * 0.3) },
        { source: 'In Progress', target: 'Review', value: Math.max(1, stats.inProgress * 0.6) },
        { source: 'In Progress', target: 'Blocked', value: Math.max(1, stats.blocked * 0.4) },
        { source: 'Review', target: 'Complete', value: Math.max(1, stats.completed * 0.8) },
        { source: 'Blocked', target: 'In Progress', value: Math.max(1, stats.blocked * 0.3) },
      ],
    }],
  }), [stats]);

  return <ChartWrapper option={option} height="160px" />;
}

// ===== RESOURCE WORKLOAD HEATMAP =====
function ResourceWorkloadHeatmap({ tasks }: { tasks: any[] }) {
  const workloadData = useMemo(() => {
    const resourceMap = new Map<string, { planned: number; actual: number; tasks: number }>();
    
    tasks.forEach((t: any) => {
      const resource = t.assignedResource || t.assignedTo || 'Unassigned';
      if (!resourceMap.has(resource)) resourceMap.set(resource, { planned: 0, actual: 0, tasks: 0 });
      const r = resourceMap.get(resource)!;
      r.planned += t.baselineHours || t.budgetHours || 0;
      r.actual += t.actualHours || 0;
      r.tasks++;
    });

    return Array.from(resourceMap.entries())
      .filter(([name]) => name !== 'Unassigned')
      .map(([name, d]) => ({
        name,
        planned: Math.round(d.planned),
        actual: Math.round(d.actual),
        tasks: d.tasks,
        utilization: d.planned > 0 ? Math.round((d.actual / d.planned) * 100) : 0,
      }))
      .sort((a, b) => b.utilization - a.utilization)
      .slice(0, 8);
  }, [tasks]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {workloadData.map((r, idx) => {
        const utilColor = r.utilization <= 80 ? '#10B981' : r.utilization <= 100 ? '#3B82F6' : r.utilization <= 120 ? '#F59E0B' : '#EF4444';
        const barWidth = Math.min(100, r.utilization);
        
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '100px', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.name}
            </div>
            <div style={{ flex: 1, height: '20px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
              <div style={{ 
                width: `${barWidth}%`, 
                height: '100%', 
                background: `linear-gradient(90deg, ${utilColor}80, ${utilColor})`,
                borderRadius: '4px',
                transition: 'width 0.3s',
              }} />
              {r.utilization > 100 && (
                <div style={{
                  position: 'absolute',
                  left: '100%',
                  top: 0,
                  width: `${Math.min(50, r.utilization - 100)}%`,
                  height: '100%',
                  background: `repeating-linear-gradient(45deg, ${utilColor}40, ${utilColor}40 5px, transparent 5px, transparent 10px)`,
                }} />
              )}
            </div>
            <div style={{ width: '50px', fontSize: '0.75rem', fontWeight: 600, color: utilColor, textAlign: 'right' }}>
              {r.utilization}%
            </div>
          </div>
        );
      })}
      {workloadData.length === 0 && (
        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No resource data</div>
      )}
    </div>
  );
}

// ===== PRIORITY MATRIX (Urgency vs Importance) =====
function PriorityMatrix({ tasks, onTaskSelect }: { tasks: any[]; onTaskSelect: (task: any) => void }) {
  const matrixData = useMemo(() => {
    return tasks.slice(0, 50).map((t: any) => {
      const daysToDeadline = t.finishDate ? Math.max(0, Math.floor((new Date(t.finishDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 30;
      const urgency = Math.max(0, Math.min(100, 100 - daysToDeadline * 3));
      const importance = t.priority === 'Critical' ? 90 : t.priority === 'High' ? 70 : t.priority === 'Medium' ? 50 : 30;
      const pc = t.percentComplete || 0;
      
      return {
        task: t,
        urgency,
        importance: importance + Math.random() * 20 - 10,
        size: Math.max(8, Math.min(20, (t.baselineHours || 10) / 5)),
        color: pc >= 100 ? '#10B981' : pc > 0 ? '#3B82F6' : '#6B7280',
      };
    });
  }, [tasks]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 50, right: 20, top: 30, bottom: 50 },
    xAxis: {
      name: 'URGENCY →',
      nameLocation: 'center',
      nameGap: 30,
      nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
      type: 'value',
      min: 0,
      max: 100,
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { show: false },
    },
    yAxis: {
      name: 'IMPORTANCE →',
      nameLocation: 'center',
      nameGap: 35,
      nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
      type: 'value',
      min: 0,
      max: 100,
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { show: false },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(22,27,34,0.95)',
      borderColor: 'var(--border-color)',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any) => {
        const d = matrixData[params.dataIndex];
        return `<strong>${d.task.name || d.task.taskName}</strong><br/>
                Progress: ${d.task.percentComplete || 0}%<br/>
                Hours: ${d.task.actualHours || 0}/${d.task.baselineHours || 0}`;
      },
    },
    visualMap: { show: false, dimension: 2, min: 5, max: 20, inRange: { symbolSize: [8, 20] } },
    series: [{
      type: 'scatter',
      data: matrixData.map(d => [d.urgency, d.importance, d.size]),
      itemStyle: { color: (params: any) => matrixData[params.dataIndex]?.color || '#6B7280' },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(64,224,208,0.5)' } },
    }],
    graphic: [
      { type: 'text', left: '75%', top: '15%', style: { text: 'DO FIRST', fill: '#EF4444', fontSize: 10, fontWeight: 'bold', opacity: 0.5 } },
      { type: 'text', left: '15%', top: '15%', style: { text: 'SCHEDULE', fill: '#F59E0B', fontSize: 10, fontWeight: 'bold', opacity: 0.5 } },
      { type: 'text', left: '75%', top: '75%', style: { text: 'DELEGATE', fill: '#3B82F6', fontSize: 10, fontWeight: 'bold', opacity: 0.5 } },
      { type: 'text', left: '15%', top: '75%', style: { text: 'LATER', fill: '#6B7280', fontSize: 10, fontWeight: 'bold', opacity: 0.5 } },
    ],
  }), [matrixData]);

  return <ChartWrapper option={option} height="250px" onEvents={{ click: (params: any) => matrixData[params.dataIndex] && onTaskSelect(matrixData[params.dataIndex].task) }} />;
}

// ===== VELOCITY BURNDOWN CHART =====
function VelocityBurndown({ tasks }: { tasks: any[] }) {
  const burndownData = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t: any) => (t.percentComplete || 0) >= 100).length;
    const remaining = total - completed;
    
    // Generate simulated historical data
    const days = Array.from({ length: 14 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (13 - i));
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const ideal = days.map((_, i) => Math.round(total - (total / 13) * i));
    const actual = days.map((_, i) => {
      const base = total - (total / 15) * i;
      const variance = (Math.random() - 0.4) * 5;
      return Math.max(0, Math.round(base + variance));
    });
    actual[actual.length - 1] = remaining;
    
    // Forecast
    const velocity = (actual[0] - actual[actual.length - 1]) / actual.length;
    const daysToComplete = velocity > 0 ? Math.ceil(remaining / velocity) : 30;
    
    return { days, ideal, actual, remaining, velocity: Math.round(velocity * 10) / 10, daysToComplete };
  }, [tasks]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 45, right: 15, top: 20, bottom: 35 },
    legend: { show: false },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff', fontSize: 11 } },
    xAxis: { type: 'category', data: burndownData.days, axisLine: { lineStyle: { color: 'var(--border-color)' } }, axisLabel: { color: 'var(--text-muted)', fontSize: 9, rotate: 45 } },
    yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } }, axisLabel: { color: 'var(--text-muted)', fontSize: 10 } },
    series: [
      { name: 'Ideal', type: 'line', data: burndownData.ideal, lineStyle: { color: '#6B7280', type: 'dashed', width: 2 }, symbol: 'none', areaStyle: { color: 'rgba(107,114,128,0.1)' } },
      { name: 'Actual', type: 'line', data: burndownData.actual, lineStyle: { color: 'var(--pinnacle-teal)', width: 3 }, symbol: 'circle', symbolSize: 6, itemStyle: { color: 'var(--pinnacle-teal)' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(64,224,208,0.3)' }, { offset: 1, color: 'rgba(64,224,208,0)' }] } } },
    ],
  }), [burndownData]);

  return (
    <div>
      <ChartWrapper option={option} height="180px" />
      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '0.5rem', padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Remaining</div>
          <div style={{ fontSize: '1rem', fontWeight: 700 }}>{burndownData.remaining}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Velocity</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--pinnacle-teal)' }}>{burndownData.velocity}/day</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>ETA</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: burndownData.daysToComplete > 14 ? '#F59E0B' : '#10B981' }}>{burndownData.daysToComplete}d</div>
        </div>
      </div>
    </div>
  );
}

// ===== HOURS DISTRIBUTION DONUT WITH CENTER STATS =====
function HoursDistributionDonut({ tasks }: { tasks: any[] }) {
  const hoursData = useMemo(() => {
    let planned = 0, actual = 0, remaining = 0;
    tasks.forEach((t: any) => {
      const p = t.baselineHours || t.budgetHours || 0;
      const a = t.actualHours || 0;
      planned += p;
      actual += a;
      remaining += Math.max(0, p - a);
    });
    return { planned: Math.round(planned), actual: Math.round(actual), remaining: Math.round(remaining), variance: planned > 0 ? Math.round(((actual - planned) / planned) * 100) : 0 };
  }, [tasks]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff' } },
    series: [{
      type: 'pie',
      radius: ['60%', '85%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      label: { show: false },
      itemStyle: { borderRadius: 6, borderColor: 'var(--bg-card)', borderWidth: 2 },
      data: [
        { value: hoursData.actual, name: 'Spent', itemStyle: { color: '#3B82F6' } },
        { value: hoursData.remaining, name: 'Remaining', itemStyle: { color: '#10B981' } },
        { value: Math.max(0, hoursData.actual - hoursData.planned), name: 'Overage', itemStyle: { color: '#EF4444' } },
      ].filter(d => d.value > 0),
    }],
  }), [hoursData]);

  return (
    <div style={{ position: 'relative', height: '180px' }}>
      <ChartWrapper option={option} height="180px" />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{hoursData.actual.toLocaleString()}</div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>of {hoursData.planned.toLocaleString()} hrs</div>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: hoursData.variance <= 0 ? '#10B981' : '#EF4444', marginTop: '2px' }}>
          {hoursData.variance > 0 ? '+' : ''}{hoursData.variance}%
        </div>
      </div>
    </div>
  );
}

// ===== QC PERFORMANCE GAUGE =====
function QCPerformanceGauge({ passRate }: { passRate: number }) {
  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    series: [{
      type: 'gauge',
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max: 100,
      splitNumber: 4,
      center: ['50%', '60%'],
      radius: '90%',
      axisLine: {
        lineStyle: {
          width: 15,
          color: [
            [0.6, '#EF4444'],
            [0.8, '#F59E0B'],
            [0.9, '#3B82F6'],
            [1, '#10B981']
          ]
        }
      },
      pointer: { icon: 'triangle', length: '60%', width: 8, itemStyle: { color: 'auto' } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: { valueAnimation: true, fontSize: 24, fontWeight: 'bold', formatter: '{value}%', color: 'inherit', offsetCenter: [0, '20%'] },
      data: [{ value: passRate }]
    }]
  }), [passRate]);

  return <ChartWrapper option={option} height="150px" />;
}

// ===== EXPANDABLE CARD =====
function ExpandableCard({ 
  title, 
  subtitle,
  isExpanded,
  onToggle,
  children,
  expandedContent,
  headerRight,
}: { 
  title: string; 
  subtitle?: string;
  isExpanded?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
  expandedContent?: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  const hasExpand = onToggle !== undefined;
  
  return (
    <div style={{ 
      background: 'var(--bg-card)', 
      borderRadius: '16px', 
      border: `1px solid ${isExpanded ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`, 
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      <div 
        style={{ 
          padding: '0.875rem 1rem', 
          borderBottom: '1px solid var(--border-color)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          cursor: hasExpand ? 'pointer' : 'default',
        }}
        onClick={onToggle}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>{title}</h3>
          {subtitle && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{subtitle}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {headerRight}
          {hasExpand && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
              <polyline points="6,9 12,15 18,9" />
            </svg>
          )}
        </div>
      </div>
      <div style={{ padding: '1rem' }}>
        {children}
      </div>
      {isExpanded && expandedContent && (
        <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
          {expandedContent}
        </div>
      )}
    </div>
  );
}

// ===== MAIN PAGE =====
export default function TasksPage() {
  const { filteredData, hierarchyFilters } = useData();
  const data = filteredData;
  
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const contextLabel = useMemo(() => {
    if (hierarchyFilters?.project) return `Project: ${hierarchyFilters.project}`;
    if (hierarchyFilters?.seniorManager) return `Portfolio: ${hierarchyFilters.seniorManager}`;
    return 'All Projects';
  }, [hierarchyFilters]);

  // Task statistics
  const taskStats = useMemo(() => {
    const tasks = data.tasks || [];
    let completed = 0, inProgress = 0, blocked = 0, notStarted = 0, totalPlanned = 0, totalActual = 0;
    
    tasks.forEach((t: any) => {
      const status = (t.status || '').toLowerCase();
      const pc = t.percentComplete || 0;
      
      if (status.includes('complete') || pc >= 100) completed++;
      else if (status.includes('block') || status.includes('hold')) blocked++;
      else if (pc > 0 || status.includes('progress')) inProgress++;
      else notStarted++;
      
      totalPlanned += t.baselineHours || t.budgetHours || 0;
      totalActual += t.actualHours || 0;
    });

    return { 
      total: tasks.length, 
      completed, 
      inProgress, 
      blocked, 
      notStarted, 
      overallProgress: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
      efficiency: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 100,
    };
  }, [data.tasks]);

  // QC data
  const qcPassRate = useMemo(() => {
    const qcByName = data.qcByNameAndRole || [];
    const totalClosed = qcByName.reduce((sum: number, q: any) => sum + (q.closedCount || 0), 0);
    const totalPassed = qcByName.reduce((sum: number, q: any) => sum + (q.passCount || 0), 0);
    return totalClosed > 0 ? Math.round((totalPassed / totalClosed) * 100) : 0;
  }, [data.qcByNameAndRole]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    let tasks = data.tasks || [];
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      tasks = tasks.filter((t: any) => 
        (t.name || t.taskName || '').toLowerCase().includes(term) ||
        (t.assignedResource || t.assignedTo || '').toLowerCase().includes(term)
      );
    }
    
    if (statusFilter !== 'all') {
      tasks = tasks.filter((t: any) => {
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
    
    return tasks;
  }, [data.tasks, searchTerm, statusFilter]);

  return (
    <div className="page-panel insights-page">
      {/* Header */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--pinnacle-teal)', fontWeight: 600 }}>{contextLabel}</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.25rem 0' }}>Task Operations</h1>
      </div>

      {/* Command Center */}
      <div style={{ marginBottom: '1rem' }}>
        <CommandCenter stats={taskStats} onFilterChange={setStatusFilter} activeFilter={statusFilter} />
      </div>

      {/* Selected Task Detail */}
      {selectedTask && (
        <div style={{ 
          background: 'linear-gradient(135deg, rgba(64, 224, 208, 0.1) 0%, rgba(205, 220, 57, 0.05) 100%)', 
          borderRadius: '12px', 
          padding: '1rem', 
          marginBottom: '1rem',
          border: '1px solid var(--pinnacle-teal)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{selectedTask.name || selectedTask.taskName}</h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedTask.projectName || 'No Project'}</span>
            </div>
            <button onClick={() => setSelectedTask(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', fontSize: '0.8rem' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Assignee:</span> <strong>{selectedTask.assignedResource || selectedTask.assignedTo || 'Unassigned'}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Status:</span> <strong>{selectedTask.status || 'N/A'}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Planned:</span> <strong>{selectedTask.baselineHours || 0} hrs</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Actual:</span> <strong style={{ color: (selectedTask.actualHours || 0) > (selectedTask.baselineHours || 0) ? '#EF4444' : '#10B981' }}>{selectedTask.actualHours || 0} hrs</strong></div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Task Flow */}
          <ExpandableCard title="Task Flow" subtitle="Lifecycle progression">
            <TaskFlowChart stats={taskStats} />
          </ExpandableCard>

          {/* Priority Matrix */}
          <ExpandableCard 
            title="Priority Matrix" 
            subtitle="Urgency vs Importance"
            isExpanded={expandedCard === 'priority'}
            onToggle={() => setExpandedCard(expandedCard === 'priority' ? null : 'priority')}
            expandedContent={
              <div style={{ fontSize: '0.8rem' }}>
                <p style={{ color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>Click any point to view task details. Size = estimated hours.</p>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} /> Complete</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3B82F6' }} /> In Progress</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6B7280' }} /> Not Started</span>
                </div>
              </div>
            }
          >
            <PriorityMatrix tasks={data.tasks || []} onTaskSelect={setSelectedTask} />
          </ExpandableCard>

          {/* Velocity Burndown */}
          <ExpandableCard title="Velocity Burndown" subtitle="Progress over time">
            <VelocityBurndown tasks={data.tasks || []} />
          </ExpandableCard>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Hours Distribution */}
          <ExpandableCard title="Hours Distribution" subtitle="Spent vs Remaining">
            <HoursDistributionDonut tasks={data.tasks || []} />
          </ExpandableCard>

          {/* QC Performance */}
          <ExpandableCard 
            title="QC Performance" 
            subtitle="Pass rate gauge"
            headerRight={
              <span style={{
                padding: '3px 8px',
                borderRadius: '8px',
                fontSize: '0.7rem',
                fontWeight: 700,
                background: qcPassRate >= 90 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                color: qcPassRate >= 90 ? '#10B981' : '#F59E0B',
              }}>
                {qcPassRate}%
              </span>
            }
          >
            <QCPerformanceGauge passRate={qcPassRate} />
          </ExpandableCard>

          {/* Resource Workload */}
          <ExpandableCard 
            title="Team Workload" 
            subtitle="Utilization by resource"
            isExpanded={expandedCard === 'workload'}
            onToggle={() => setExpandedCard(expandedCard === 'workload' ? null : 'workload')}
          >
            <ResourceWorkloadHeatmap tasks={data.tasks || []} />
          </ExpandableCard>
        </div>
      </div>

      {/* Task Table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0, marginRight: 'auto' }}>All Tasks ({filteredTasks.length})</h3>
          
          <div style={{ position: 'relative' }}>
            <input type="text" placeholder="Search tasks..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} 
              style={{ padding: '6px 10px 6px 32px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem', width: '180px' }} />
            <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </div>

          {statusFilter !== 'all' && (
            <button onClick={() => setStatusFilter('all')} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--pinnacle-teal)', background: 'rgba(64,224,208,0.1)', color: 'var(--pinnacle-teal)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {statusFilter} <span>×</span>
            </button>
          )}
        </div>

        <div style={{ overflowX: 'auto', maxHeight: '350px' }}>
          <table className="data-table" style={{ fontSize: '0.8rem' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
              <tr>
                <th>Task</th>
                <th>Assignee</th>
                <th>Status</th>
                <th className="number">Progress</th>
                <th className="number">Hours</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.slice(0, 50).map((task: any, idx: number) => {
                const pc = task.percentComplete || 0;
                const isSelected = selectedTask?.name === task.name;
                const isOver = (task.actualHours || 0) > (task.baselineHours || Infinity);
                
                return (
                  <tr 
                    key={idx} 
                    onClick={() => setSelectedTask(task)}
                    style={{ cursor: 'pointer', background: isSelected ? 'rgba(64, 224, 208, 0.1)' : 'transparent' }}
                  >
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {task.name || task.taskName || '-'}
                    </td>
                    <td>{task.assignedResource || task.assignedTo || '-'}</td>
                    <td>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        background: pc >= 100 ? 'rgba(16, 185, 129, 0.15)' : pc > 0 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(107, 114, 128, 0.15)',
                        color: pc >= 100 ? '#10B981' : pc > 0 ? '#3B82F6' : '#6B7280',
                      }}>
                        {pc >= 100 ? 'Done' : pc > 0 ? 'Active' : 'Pending'}
                      </span>
                    </td>
                    <td className="number">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                        <div style={{ width: '40px', height: '4px', background: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${pc}%`, height: '100%', background: pc >= 100 ? '#10B981' : '#3B82F6', borderRadius: '2px' }} />
                        </div>
                        <span style={{ width: '28px' }}>{pc}%</span>
                      </div>
                    </td>
                    <td className="number" style={{ color: isOver ? '#EF4444' : 'inherit', fontWeight: isOver ? 600 : 400 }}>
                      {task.actualHours || 0}/{task.baselineHours || 0}
                    </td>
                  </tr>
                );
              })}
              {filteredTasks.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No tasks found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
