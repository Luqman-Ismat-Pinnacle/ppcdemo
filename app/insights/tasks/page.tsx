'use client';

/**
 * @fileoverview Tasks - Operations Dashboard for PPC V3.
 * 
 * Project-based operations dashboard with drill-down capabilities:
 * - All metrics aggregate based on hierarchy filter
 * - Click any section to see detailed breakdown
 * - Searchable, filterable task management
 * 
 * @module app/insights/tasks/page
 */

import React, { useState, useMemo } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import { createPortal } from 'react-dom';
import type { EChartsOption } from 'echarts';

// ===== DETAIL MODAL =====
function DetailModal({ 
  isOpen, 
  onClose, 
  title, 
  children 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  title: string; 
  children: React.ReactNode;
}) {
  if (!isOpen || typeof document === 'undefined') return null;
  
  return createPortal(
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          maxWidth: '1000px',
          width: '100%',
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px', color: 'var(--text-muted)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ===== CLICKABLE STATUS CARD =====
function StatusCard({ 
  title, 
  value, 
  subtitle,
  color,
  icon,
  onClick,
}: { 
  title: string; 
  value: number; 
  subtitle?: string;
  color: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div 
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        padding: '1.5rem',
        border: '1px solid var(--border-color)',
        borderTop: `4px solid ${color}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s',
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = color)}
      onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = 'var(--border-color)')}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{title}</div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
          {subtitle && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{subtitle}</div>}
        </div>
        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
      </div>
      {onClick && <div style={{ fontSize: '0.7rem', color: 'var(--pinnacle-teal)', marginTop: '0.75rem' }}>Click for details</div>}
    </div>
  );
}

// ===== CLICKABLE CHART CARD =====
function ChartCard({ 
  title, 
  subtitle,
  children, 
  onViewDetails,
  rightContent,
}: { 
  title: string; 
  subtitle?: string;
  children: React.ReactNode;
  onViewDetails?: () => void;
  rightContent?: React.ReactNode;
}) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
          {subtitle && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{subtitle}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {rightContent}
          {onViewDetails && (
            <button onClick={onViewDetails} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem', color: 'var(--pinnacle-teal)', cursor: 'pointer', fontWeight: 500 }}>
              View Details
            </button>
          )}
        </div>
      </div>
      <div style={{ padding: '1.25rem' }}>
        {children}
      </div>
    </div>
  );
}

// ===== PROGRESS BAR =====
function ProgressBar({ value, color = 'var(--pinnacle-teal)' }: { value: number; color?: string }) {
  return (
    <div style={{ width: '100%', height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.3s ease' }} />
    </div>
  );
}

export default function TasksPage() {
  const { filteredData, isLoading, hierarchyFilters } = useData();
  const data = filteredData;
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [activeDetail, setActiveDetail] = useState<string | null>(null);

  // Context label
  const contextLabel = useMemo(() => {
    if (hierarchyFilters?.project) return `Project: ${hierarchyFilters.project}`;
    if (hierarchyFilters?.seniorManager) return `Portfolio: ${hierarchyFilters.seniorManager}`;
    if (hierarchyFilters?.department) return `Department: ${hierarchyFilters.department}`;
    return 'All Projects';
  }, [hierarchyFilters]);

  // Task statistics with project breakdown
  const taskStats = useMemo(() => {
    const tasks = data.tasks || [];
    const total = tasks.length;
    
    let completed = 0, inProgress = 0, blocked = 0, notStarted = 0;
    let totalPlanned = 0, totalActual = 0;
    const byProject = new Map<string, { total: number; completed: number; inProgress: number; blocked: number; planned: number; actual: number }>();
    
    tasks.forEach((t: any) => {
      const status = (t.status || t.taskStatus || '').toLowerCase();
      const percentComplete = t.percentComplete || 0;
      const projectName = t.projectName || t.project_name || t.projectId || 'Unknown';
      
      if (!byProject.has(projectName)) {
        byProject.set(projectName, { total: 0, completed: 0, inProgress: 0, blocked: 0, planned: 0, actual: 0 });
      }
      const proj = byProject.get(projectName)!;
      proj.total++;
      proj.planned += t.baselineHours || t.budgetHours || 0;
      proj.actual += t.actualHours || 0;
      
      if (status.includes('complete') || percentComplete >= 100) {
        completed++;
        proj.completed++;
      } else if (status.includes('block') || status.includes('hold')) {
        blocked++;
        proj.blocked++;
      } else if (percentComplete > 0 || status.includes('progress')) {
        inProgress++;
        proj.inProgress++;
      } else {
        notStarted++;
      }
      
      totalPlanned += t.baselineHours || t.budgetHours || 0;
      totalActual += t.actualHours || 0;
    });

    const overallProgress = total > 0 ? Math.round((completed / total) * 100) : 0;
    const hoursEfficiency = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;

    const projectBreakdown = Array.from(byProject.entries())
      .filter(([name]) => name !== 'Unknown')
      .map(([name, stats]) => ({
        name,
        ...stats,
        efficiency: stats.planned > 0 ? Math.round((stats.actual / stats.planned) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return { total, completed, inProgress, blocked, notStarted, overallProgress, totalPlanned, totalActual, hoursEfficiency, projectBreakdown };
  }, [data.tasks]);

  // Status distribution for donut
  const statusDistribution = useMemo(() => [
    { name: 'Completed', value: taskStats.completed, color: '#10B981' },
    { name: 'In Progress', value: taskStats.inProgress, color: '#3B82F6' },
    { name: 'Blocked', value: taskStats.blocked, color: '#EF4444' },
    { name: 'Not Started', value: taskStats.notStarted, color: '#6B7280' },
  ].filter(d => d.value > 0), [taskStats]);

  // Priority distribution with breakdown
  const priorityData = useMemo(() => {
    const tasks = data.tasks || [];
    let high = 0, medium = 0, low = 0;
    const byProject = new Map<string, { high: number; medium: number; low: number }>();
    
    tasks.forEach((t: any) => {
      const priority = (t.priority || '').toLowerCase();
      const projectName = t.projectName || t.project_name || 'Unknown';
      
      if (!byProject.has(projectName)) {
        byProject.set(projectName, { high: 0, medium: 0, low: 0 });
      }
      const proj = byProject.get(projectName)!;
      
      if (priority.includes('high') || priority.includes('critical')) {
        high++;
        proj.high++;
      } else if (priority.includes('low')) {
        low++;
        proj.low++;
      } else {
        medium++;
        proj.medium++;
      }
    });

    const distribution = [
      { name: 'High', value: high, color: '#EF4444' },
      { name: 'Medium', value: medium, color: '#F59E0B' },
      { name: 'Low', value: low, color: '#10B981' },
    ].filter(d => d.value > 0);

    const projectBreakdown = Array.from(byProject.entries())
      .filter(([name]) => name !== 'Unknown')
      .map(([name, p]) => ({ name, ...p, total: p.high + p.medium + p.low }))
      .sort((a, b) => b.high - a.high);

    return { distribution, projectBreakdown, high, medium, low };
  }, [data.tasks]);

  // Hours by project
  const hoursByProject = useMemo(() => {
    const tasks = data.tasks || [];
    const projectMap = new Map<string, { planned: number; actual: number; tasks: number }>();
    
    tasks.forEach((t: any) => {
      const project = t.projectName || t.project_name || t.projectId || 'Unknown';
      if (!projectMap.has(project)) {
        projectMap.set(project, { planned: 0, actual: 0, tasks: 0 });
      }
      const p = projectMap.get(project)!;
      p.planned += t.baselineHours || t.budgetHours || 0;
      p.actual += t.actualHours || 0;
      p.tasks++;
    });

    return Array.from(projectMap.entries())
      .filter(([name]) => name !== 'Unknown')
      .map(([name, d]) => ({ 
        name, 
        planned: Math.round(d.planned), 
        actual: Math.round(d.actual), 
        tasks: d.tasks,
        variance: d.planned > 0 ? Math.round(((d.actual - d.planned) / d.planned) * 100) : 0,
        efficiency: d.planned > 0 ? Math.round((d.actual / d.planned) * 100) : 0,
      }))
      .filter(p => p.planned > 0 || p.actual > 0)
      .sort((a, b) => b.planned - a.planned);
  }, [data.tasks]);

  // QC data with breakdown
  const qcData = useMemo(() => {
    const qcByName = data.qcByNameAndRole || [];
    const gates = data.qcTransactionByGate || [];
    
    const totalClosed = qcByName.reduce((sum: number, q: any) => sum + (q.closedCount || 0), 0);
    const totalPassed = qcByName.reduce((sum: number, q: any) => sum + (q.passCount || 0), 0);
    const passRate = totalClosed > 0 ? Math.round((totalPassed / totalClosed) * 100) : 0;

    const byGate = gates.slice(0, 8).map((g: any) => ({
      name: g.gate,
      value: g.count,
      passed: g.passCount || 0,
      failed: g.failCount || 0,
    }));

    const byAnalyst = qcByName.map((q: any) => ({
      name: q.name || q.analyst,
      role: q.role,
      closed: q.closedCount || 0,
      passed: q.passCount || 0,
      passRate: q.closedCount > 0 ? Math.round((q.passCount / q.closedCount) * 100) : 0,
    })).sort((a: any, b: any) => b.closed - a.closed);

    return { passRate, totalClosed, totalPassed, byGate, byAnalyst };
  }, [data.qcByNameAndRole, data.qcTransactionByGate]);

  // Filtered tasks for table
  const filteredTasks = useMemo(() => {
    let tasks = data.tasks || [];
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      tasks = tasks.filter((t: any) => 
        (t.name || t.taskName || '').toLowerCase().includes(term) ||
        (t.assignedResource || t.assignedTo || '').toLowerCase().includes(term) ||
        (t.projectName || '').toLowerCase().includes(term)
      );
    }
    
    if (statusFilter !== 'all') {
      tasks = tasks.filter((t: any) => {
        const status = (t.status || t.taskStatus || '').toLowerCase();
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
    
    if (priorityFilter !== 'all') {
      tasks = tasks.filter((t: any) => {
        const priority = (t.priority || '').toLowerCase();
        switch (priorityFilter) {
          case 'high': return priority.includes('high') || priority.includes('critical');
          case 'medium': return !priority.includes('high') && !priority.includes('low');
          case 'low': return priority.includes('low');
          default: return true;
        }
      });
    }
    
    return tasks;
  }, [data.tasks, searchTerm, statusFilter, priorityFilter]);

  // Chart options
  const statusChartOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, left: 'center', itemWidth: 12, itemHeight: 12, textStyle: { color: 'var(--text-secondary)', fontSize: 11 } },
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['50%', '42%'],
      itemStyle: { borderRadius: 4, borderColor: 'var(--bg-card)', borderWidth: 2 },
      label: { show: false },
      data: statusDistribution.map(d => ({ value: d.value, name: d.name, itemStyle: { color: d.color } })),
    }],
  }), [statusDistribution]);

  const priorityChartOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, left: 'center', itemWidth: 12, itemHeight: 12, textStyle: { color: 'var(--text-secondary)', fontSize: 11 } },
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['50%', '42%'],
      itemStyle: { borderRadius: 4, borderColor: 'var(--bg-card)', borderWidth: 2 },
      label: { show: false },
      data: priorityData.distribution.map(d => ({ value: d.value, name: d.name, itemStyle: { color: d.color } })),
    }],
  }), [priorityData.distribution]);

  const hoursChartOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 12, textStyle: { color: 'var(--text-secondary)', fontSize: 11 } },
    grid: { left: 60, right: 20, top: 40, bottom: 40 },
    xAxis: {
      type: 'category',
      data: hoursByProject.slice(0, 8).map(d => d.name),
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { color: 'var(--text-muted)', fontSize: 10, rotate: 25 },
    },
    yAxis: {
      type: 'value',
      name: 'Hours',
      nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
    },
    series: [
      { name: 'Planned', type: 'bar', data: hoursByProject.slice(0, 8).map(d => d.planned), itemStyle: { color: '#40E0D0', borderRadius: [4, 4, 0, 0] }, barGap: '10%' },
      { name: 'Actual', type: 'bar', data: hoursByProject.slice(0, 8).map(d => d.actual), itemStyle: { color: '#CDDC39', borderRadius: [4, 4, 0, 0] } },
    ],
  }), [hoursByProject]);

  const qcGaugeOption: EChartsOption = useMemo(() => {
    const color = qcData.passRate >= 90 ? '#10B981' : qcData.passRate >= 70 ? '#F59E0B' : '#EF4444';
    return {
      backgroundColor: 'transparent',
      series: [{
        type: 'gauge',
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        radius: '90%',
        center: ['50%', '60%'],
        axisLine: { lineStyle: { width: 12, color: [[qcData.passRate / 100, color], [1, 'var(--bg-tertiary)']] } },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: { valueAnimation: true, formatter: '{value}%', color, fontSize: 28, fontWeight: 700, offsetCenter: [0, '10%'] },
        data: [{ value: qcData.passRate }],
      }],
    };
  }, [qcData.passRate]);

  const qcByGateOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 80, right: 20, top: 10, bottom: 20 },
    xAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } }, axisLabel: { color: 'var(--text-muted)', fontSize: 10 } },
    yAxis: { type: 'category', data: qcData.byGate.map(g => g.name), axisLine: { lineStyle: { color: 'var(--border-color)' } }, axisLabel: { color: 'var(--text-muted)', fontSize: 11 } },
    series: [{ type: 'bar', data: qcData.byGate.map(g => g.value), itemStyle: { color: '#40E0D0', borderRadius: [0, 4, 4, 0] }, barWidth: 16 }],
  }), [qcData.byGate]);

  return (
    <div className="page-panel insights-page">
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--pinnacle-teal)', fontWeight: 600, marginBottom: '0.25rem' }}>{contextLabel}</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Tasks</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          Operations dashboard - {taskStats.total} tasks across {taskStats.projectBreakdown.length} projects
        </p>
      </div>

      {/* Status Cards - Clickable */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatusCard
          title="Total Tasks"
          value={taskStats.total}
          subtitle={`${taskStats.overallProgress}% complete`}
          color="#3B82F6"
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
          onClick={() => setActiveDetail('tasksByProject')}
        />
        <StatusCard
          title="Completed"
          value={taskStats.completed}
          color="#10B981"
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22,4 12,14.01 9,11.01" /></svg>}
          onClick={() => { setStatusFilter('completed'); setActiveDetail(null); }}
        />
        <StatusCard
          title="In Progress"
          value={taskStats.inProgress}
          color="#F59E0B"
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" /></svg>}
          onClick={() => { setStatusFilter('inProgress'); setActiveDetail(null); }}
        />
        <StatusCard
          title="Blocked"
          value={taskStats.blocked}
          color="#EF4444"
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>}
          onClick={() => { setStatusFilter('blocked'); setActiveDetail(null); }}
        />
      </div>

      {/* Progress Bar */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1rem 1.5rem', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Overall Progress</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--pinnacle-teal)' }}>{taskStats.overallProgress}%</span>
        </div>
        <ProgressBar value={taskStats.overallProgress} />
      </div>

      {/* Distribution Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <ChartCard title="By Status" onViewDetails={() => setActiveDetail('statusBreakdown')}>
          <ChartWrapper option={statusChartOption} height="200px" />
        </ChartCard>
        <ChartCard title="By Priority" onViewDetails={() => setActiveDetail('priorityBreakdown')}>
          <ChartWrapper option={priorityChartOption} height="200px" />
        </ChartCard>
      </div>

      {/* Hours Analysis */}
      <div style={{ marginBottom: '1.5rem' }}>
        <ChartCard 
          title="Hours Analysis" 
          subtitle="Planned vs Actual by Project"
          onViewDetails={() => setActiveDetail('hoursBreakdown')}
          rightContent={
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Planned: </span><span style={{ fontWeight: 700 }}>{taskStats.totalPlanned.toLocaleString()} hrs</span></div>
              <div><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Actual: </span><span style={{ fontWeight: 700 }}>{taskStats.totalActual.toLocaleString()} hrs</span></div>
              <div style={{ padding: '4px 12px', borderRadius: '16px', background: taskStats.hoursEfficiency <= 100 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: taskStats.hoursEfficiency <= 100 ? '#10B981' : '#EF4444', fontWeight: 700, fontSize: '0.85rem' }}>
                {taskStats.hoursEfficiency}%
              </div>
            </div>
          }
        >
          <ChartWrapper option={hoursChartOption} height="280px" />
        </ChartCard>
      </div>

      {/* Quality Control */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <ChartCard title="QC Pass Rate" onViewDetails={() => setActiveDetail('qcAnalysts')}>
          <ChartWrapper option={qcGaugeOption} height="160px" />
          <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '-0.5rem' }}>
            {qcData.passRate >= 90 ? 'Excellent' : qcData.passRate >= 70 ? 'Acceptable' : 'Needs improvement'}
          </div>
        </ChartCard>
        <ChartCard title="QC by Gate" onViewDetails={() => setActiveDetail('qcGates')}>
          {qcData.byGate.length > 0 ? <ChartWrapper option={qcByGateOption} height="180px" /> : <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>No QC data</div>}
        </ChartCard>
      </div>

      {/* Task Table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, marginRight: 'auto' }}>Task Details ({filteredTasks.length})</h3>
          
          <div style={{ position: 'relative' }}>
            <input type="text" placeholder="Search tasks..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '8px 12px 8px 36px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem', width: '200px' }} />
            <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </div>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="inProgress">In Progress</option>
            <option value="blocked">Blocked</option>
            <option value="notStarted">Not Started</option>
          </select>

          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
            <option value="all">All Priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
          <table className="data-table" style={{ fontSize: '0.85rem' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)' }}>
              <tr>
                <th>Task</th>
                <th>Project</th>
                <th>Assignee</th>
                <th>Status</th>
                <th className="number">Planned</th>
                <th className="number">Actual</th>
                <th className="number">% Complete</th>
                <th>Due Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.slice(0, 100).map((task: any, idx: number) => {
                const status = task.status || task.taskStatus || 'Not Started';
                const pc = task.percentComplete || 0;
                const isOverdue = task.finishDate && new Date(task.finishDate) < new Date() && pc < 100;
                const isOverBudget = (task.actualHours || 0) > (task.baselineHours || task.budgetHours || Infinity);
                
                return (
                  <tr key={idx}>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name || task.taskName || '-'}</td>
                    <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.projectName || task.project_name || '-'}</td>
                    <td>{task.assignedResource || task.assignedTo || task.employeeName || '-'}</td>
                    <td>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, background: pc >= 100 ? 'rgba(16, 185, 129, 0.15)' : status.toLowerCase().includes('block') ? 'rgba(239, 68, 68, 0.15)' : pc > 0 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(107, 114, 128, 0.15)', color: pc >= 100 ? '#10B981' : status.toLowerCase().includes('block') ? '#EF4444' : pc > 0 ? '#3B82F6' : '#6B7280' }}>
                        {pc >= 100 ? 'Completed' : status}
                      </span>
                    </td>
                    <td className="number">{task.baselineHours || task.budgetHours || 0}</td>
                    <td className="number" style={{ color: isOverBudget ? '#EF4444' : 'inherit' }}>{task.actualHours || 0}</td>
                    <td className="number">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '50px', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${pc}%`, height: '100%', background: pc >= 100 ? '#10B981' : pc > 50 ? '#3B82F6' : '#F59E0B', borderRadius: '3px' }} />
                        </div>
                        <span>{pc}%</span>
                      </div>
                    </td>
                    <td style={{ color: isOverdue ? '#EF4444' : 'inherit' }}>{task.finishDate ? new Date(task.finishDate).toLocaleDateString() : '-'}</td>
                  </tr>
                );
              })}
              {filteredTasks.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>{isLoading ? 'Loading...' : 'No tasks found'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        
        {filteredTasks.length > 100 && (
          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', borderTop: '1px solid var(--border-color)' }}>
            Showing 100 of {filteredTasks.length} tasks. Use filters to narrow results.
          </div>
        )}
      </div>

      {/* ===== DETAIL MODALS ===== */}

      {/* Tasks by Project */}
      <DetailModal isOpen={activeDetail === 'tasksByProject'} onClose={() => setActiveDetail(null)} title="Tasks by Project">
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Project</th><th className="number">Total</th><th className="number">Completed</th><th className="number">In Progress</th><th className="number">Blocked</th><th className="number">Completion</th></tr></thead>
          <tbody>
            {taskStats.projectBreakdown.map((p, idx) => (
              <tr key={idx}>
                <td>{p.name}</td>
                <td className="number">{p.total}</td>
                <td className="number" style={{ color: '#10B981' }}>{p.completed}</td>
                <td className="number" style={{ color: '#3B82F6' }}>{p.inProgress}</td>
                <td className="number" style={{ color: '#EF4444' }}>{p.blocked}</td>
                <td className="number">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '60px', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0}%`, height: '100%', background: '#10B981', borderRadius: '3px' }} />
                    </div>
                    <span>{p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DetailModal>

      {/* Status Breakdown */}
      <DetailModal isOpen={activeDetail === 'statusBreakdown'} onClose={() => setActiveDetail(null)} title="Task Status by Project">
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Project</th><th className="number">Total</th><th className="number">Completed</th><th className="number">In Progress</th><th className="number">Blocked</th><th className="number">Not Started</th></tr></thead>
          <tbody>
            {taskStats.projectBreakdown.map((p, idx) => {
              const notStarted = p.total - p.completed - p.inProgress - p.blocked;
              return (
                <tr key={idx}>
                  <td>{p.name}</td>
                  <td className="number">{p.total}</td>
                  <td className="number"><span style={{ color: '#10B981', fontWeight: 600 }}>{p.completed}</span></td>
                  <td className="number"><span style={{ color: '#3B82F6', fontWeight: 600 }}>{p.inProgress}</span></td>
                  <td className="number"><span style={{ color: '#EF4444', fontWeight: 600 }}>{p.blocked}</span></td>
                  <td className="number"><span style={{ color: '#6B7280', fontWeight: 600 }}>{notStarted}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DetailModal>

      {/* Priority Breakdown */}
      <DetailModal isOpen={activeDetail === 'priorityBreakdown'} onClose={() => setActiveDetail(null)} title="Task Priority by Project">
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Project</th><th className="number">Total</th><th className="number">High</th><th className="number">Medium</th><th className="number">Low</th></tr></thead>
          <tbody>
            {priorityData.projectBreakdown.map((p, idx) => (
              <tr key={idx}>
                <td>{p.name}</td>
                <td className="number">{p.total}</td>
                <td className="number"><span style={{ color: '#EF4444', fontWeight: 600 }}>{p.high}</span></td>
                <td className="number"><span style={{ color: '#F59E0B', fontWeight: 600 }}>{p.medium}</span></td>
                <td className="number"><span style={{ color: '#10B981', fontWeight: 600 }}>{p.low}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </DetailModal>

      {/* Hours Breakdown */}
      <DetailModal isOpen={activeDetail === 'hoursBreakdown'} onClose={() => setActiveDetail(null)} title="Hours Analysis by Project">
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Project</th><th className="number">Tasks</th><th className="number">Planned</th><th className="number">Actual</th><th className="number">Variance</th><th className="number">Efficiency</th><th>Status</th></tr></thead>
          <tbody>
            {hoursByProject.map((p, idx) => (
              <tr key={idx}>
                <td>{p.name}</td>
                <td className="number">{p.tasks}</td>
                <td className="number">{p.planned.toLocaleString()}</td>
                <td className="number">{p.actual.toLocaleString()}</td>
                <td className="number" style={{ color: p.variance > 0 ? '#EF4444' : '#10B981', fontWeight: 600 }}>{p.variance > 0 ? '+' : ''}{p.variance}%</td>
                <td className="number" style={{ fontWeight: 700 }}>{p.efficiency}%</td>
                <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: p.efficiency <= 100 ? 'rgba(16,185,129,0.15)' : p.efficiency <= 110 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)', color: p.efficiency <= 100 ? '#10B981' : p.efficiency <= 110 ? '#F59E0B' : '#EF4444' }}>{p.efficiency <= 100 ? 'Under' : p.efficiency <= 110 ? 'Watch' : 'Over'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </DetailModal>

      {/* QC by Analyst */}
      <DetailModal isOpen={activeDetail === 'qcAnalysts'} onClose={() => setActiveDetail(null)} title="QC Performance by Analyst">
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Analyst</th><th>Role</th><th className="number">Closed</th><th className="number">Passed</th><th className="number">Pass Rate</th></tr></thead>
          <tbody>
            {qcData.byAnalyst.map((a: any, idx: number) => (
              <tr key={idx}>
                <td>{a.name}</td>
                <td>{a.role || '-'}</td>
                <td className="number">{a.closed}</td>
                <td className="number">{a.passed}</td>
                <td className="number" style={{ fontWeight: 700, color: a.passRate >= 90 ? '#10B981' : a.passRate >= 70 ? '#F59E0B' : '#EF4444' }}>{a.passRate}%</td>
              </tr>
            ))}
            {qcData.byAnalyst.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No QC data</td></tr>}
          </tbody>
        </table>
      </DetailModal>

      {/* QC by Gate */}
      <DetailModal isOpen={activeDetail === 'qcGates'} onClose={() => setActiveDetail(null)} title="QC Transactions by Gate">
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Gate</th><th className="number">Total</th><th className="number">Passed</th><th className="number">Failed</th><th className="number">Pass Rate</th></tr></thead>
          <tbody>
            {qcData.byGate.map((g: any, idx: number) => {
              const passRate = g.value > 0 ? Math.round((g.passed / g.value) * 100) : 0;
              return (
                <tr key={idx}>
                  <td>{g.name}</td>
                  <td className="number">{g.value}</td>
                  <td className="number" style={{ color: '#10B981' }}>{g.passed}</td>
                  <td className="number" style={{ color: '#EF4444' }}>{g.failed}</td>
                  <td className="number" style={{ fontWeight: 700, color: passRate >= 90 ? '#10B981' : passRate >= 70 ? '#F59E0B' : '#EF4444' }}>{passRate}%</td>
                </tr>
              );
            })}
            {qcData.byGate.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No QC data</td></tr>}
          </tbody>
        </table>
      </DetailModal>
    </div>
  );
}
