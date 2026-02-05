'use client';

/**
 * @fileoverview Tasks - Operations Dashboard for PPC V3.
 * 
 * Working-level dashboard for daily task management:
 * 1. Task Status Overview - 4 status cards with progress bar
 * 2. Task Distribution - By status and priority
 * 3. Hours Analysis - Planned vs actual, efficiency
 * 4. Quality Control - Pass rate, QC by gate
 * 5. Detailed Task Table - Searchable, filterable
 * 
 * @module app/insights/tasks/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

// Status Card Component
function StatusCard({ 
  title, 
  value, 
  subtitle,
  color,
  icon 
}: { 
  title: string; 
  value: number; 
  subtitle?: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '16px',
      padding: '1.5rem',
      border: '1px solid var(--border-color)',
      borderTop: `4px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{title}</div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
          {subtitle && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{subtitle}</div>
          )}
        </div>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: `${color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// Progress Bar Component
function ProgressBar({ value, color = 'var(--pinnacle-teal)' }: { value: number; color?: string }) {
  return (
    <div style={{
      width: '100%',
      height: '8px',
      background: 'var(--bg-tertiary)',
      borderRadius: '4px',
      overflow: 'hidden',
    }}>
      <div style={{
        width: `${Math.min(100, Math.max(0, value))}%`,
        height: '100%',
        background: color,
        borderRadius: '4px',
        transition: 'width 0.3s ease',
      }} />
    </div>
  );
}

// Task Distribution Donut Chart
function TaskDonutChart({ data, title, height = '200px' }: { 
  data: { name: string; value: number; color: string }[]; 
  title: string;
  height?: string;
}) {
  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      bottom: 0,
      left: 'center',
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: 'var(--text-secondary)', fontSize: 11 },
    },
    series: [{
      type: 'pie',
      radius: ['50%', '75%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: 'var(--bg-card)', borderWidth: 2 },
      label: { show: false },
      data: data.map(d => ({ value: d.value, name: d.name, itemStyle: { color: d.color } })),
    }],
  }), [data]);

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '16px',
      padding: '1.25rem',
      border: '1px solid var(--border-color)',
    }}>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0, marginBottom: '1rem' }}>{title}</h3>
      <ChartWrapper option={option} height={height} />
    </div>
  );
}

// Hours Bar Chart
function HoursBarChart({ data, height = '280px' }: { 
  data: { name: string; planned: number; actual: number }[];
  height?: string;
}) {
  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    legend: {
      top: 0,
      right: 0,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: 'var(--text-secondary)', fontSize: 11 },
    },
    grid: { left: 60, right: 20, top: 40, bottom: 40 },
    xAxis: {
      type: 'category',
      data: data.map(d => d.name),
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { color: 'var(--text-muted)', fontSize: 10, rotate: 30 },
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
      {
        name: 'Planned',
        type: 'bar',
        data: data.map(d => d.planned),
        itemStyle: { color: '#40E0D0', borderRadius: [4, 4, 0, 0] },
        barGap: '10%',
      },
      {
        name: 'Actual',
        type: 'bar',
        data: data.map(d => d.actual),
        itemStyle: { color: '#CDDC39', borderRadius: [4, 4, 0, 0] },
      },
    ],
  }), [data]);

  return <ChartWrapper option={option} height={height} />;
}

// QC Gauge
function QCGauge({ value, height = '200px' }: { value: number; height?: string }) {
  const color = value >= 90 ? '#10B981' : value >= 70 ? '#F59E0B' : '#EF4444';
  
  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    series: [{
      type: 'gauge',
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max: 100,
      splitNumber: 5,
      radius: '90%',
      center: ['50%', '60%'],
      axisLine: {
        lineStyle: { width: 12, color: [[value / 100, color], [1, 'var(--bg-tertiary)']] },
      },
      pointer: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: {
        valueAnimation: true,
        formatter: '{value}%',
        color,
        fontSize: 28,
        fontWeight: 700,
        offsetCenter: [0, '10%'],
      },
      data: [{ value }],
    }],
  }), [value, color]);

  return <ChartWrapper option={option} height={height} />;
}

export default function TasksPage() {
  const { filteredData, isLoading } = useData();
  const data = filteredData;
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Task statistics
  const taskStats = useMemo(() => {
    const tasks = data.tasks || [];
    const total = tasks.length;
    
    let completed = 0, inProgress = 0, blocked = 0, notStarted = 0;
    let totalPlanned = 0, totalActual = 0;
    
    tasks.forEach((t: any) => {
      const status = (t.status || t.taskStatus || '').toLowerCase();
      const percentComplete = t.percentComplete || 0;
      
      if (status.includes('complete') || percentComplete >= 100) completed++;
      else if (status.includes('block') || status.includes('hold')) blocked++;
      else if (percentComplete > 0 || status.includes('progress')) inProgress++;
      else notStarted++;
      
      totalPlanned += t.baselineHours || t.budgetHours || 0;
      totalActual += t.actualHours || 0;
    });

    const overallProgress = total > 0 ? Math.round((completed / total) * 100) : 0;
    const hoursEfficiency = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;

    return { total, completed, inProgress, blocked, notStarted, overallProgress, totalPlanned, totalActual, hoursEfficiency };
  }, [data.tasks]);

  // Status distribution for donut
  const statusDistribution = useMemo(() => [
    { name: 'Completed', value: taskStats.completed, color: '#10B981' },
    { name: 'In Progress', value: taskStats.inProgress, color: '#3B82F6' },
    { name: 'Blocked', value: taskStats.blocked, color: '#EF4444' },
    { name: 'Not Started', value: taskStats.notStarted, color: '#6B7280' },
  ].filter(d => d.value > 0), [taskStats]);

  // Priority distribution
  const priorityDistribution = useMemo(() => {
    const tasks = data.tasks || [];
    let high = 0, medium = 0, low = 0;
    
    tasks.forEach((t: any) => {
      const priority = (t.priority || '').toLowerCase();
      if (priority.includes('high') || priority.includes('critical')) high++;
      else if (priority.includes('low')) low++;
      else medium++;
    });

    return [
      { name: 'High', value: high, color: '#EF4444' },
      { name: 'Medium', value: medium, color: '#F59E0B' },
      { name: 'Low', value: low, color: '#10B981' },
    ].filter(d => d.value > 0);
  }, [data.tasks]);

  // Hours by project
  const hoursByProject = useMemo(() => {
    const tasks = data.tasks || [];
    const projectMap = new Map<string, { planned: number; actual: number }>();
    
    tasks.forEach((t: any) => {
      const project = t.projectName || t.project_name || t.projectId || 'Unknown';
      if (!projectMap.has(project)) {
        projectMap.set(project, { planned: 0, actual: 0 });
      }
      const p = projectMap.get(project)!;
      p.planned += t.baselineHours || t.budgetHours || 0;
      p.actual += t.actualHours || 0;
    });

    return Array.from(projectMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .filter(p => p.planned > 0 || p.actual > 0)
      .sort((a, b) => b.planned - a.planned)
      .slice(0, 8);
  }, [data.tasks]);

  // QC Pass Rate
  const qcPassRate = useMemo(() => {
    const qcData = data.qcByNameAndRole || [];
    if (qcData.length === 0) return 0;
    
    const totalClosed = qcData.reduce((sum: number, q: any) => sum + (q.closedCount || 0), 0);
    const totalPassed = qcData.reduce((sum: number, q: any) => sum + (q.passCount || 0), 0);
    
    return totalClosed > 0 ? Math.round((totalPassed / totalClosed) * 100) : 0;
  }, [data.qcByNameAndRole]);

  // QC by Gate data
  const qcByGate = useMemo(() => {
    const gates = data.qcTransactionByGate || [];
    return gates.slice(0, 5).map((g: any) => ({
      name: g.gate,
      value: g.count,
    }));
  }, [data.qcTransactionByGate]);

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
    
    return tasks.slice(0, 50); // Limit for performance
  }, [data.tasks, searchTerm, statusFilter, priorityFilter]);

  // QC by Gate bar chart option
  const qcByGateOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 80, right: 20, top: 20, bottom: 30 },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      data: qcByGate.map((g: any) => g.name),
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { color: 'var(--text-muted)', fontSize: 11 },
    },
    series: [{
      type: 'bar',
      data: qcByGate.map((g: any) => g.value),
      itemStyle: { color: '#40E0D0', borderRadius: [0, 4, 4, 0] },
      barWidth: 16,
    }],
  }), [qcByGate]);

  return (
    <div className="page-panel insights-page">
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Tasks</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          Operations dashboard for daily task management
        </p>
      </div>

      {/* SECTION 1: Task Status Overview */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <StatusCard
          title="Total Tasks"
          value={taskStats.total}
          subtitle={`${taskStats.overallProgress}% complete`}
          color="#3B82F6"
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
        />
        <StatusCard
          title="Completed"
          value={taskStats.completed}
          color="#10B981"
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22,4 12,14.01 9,11.01" /></svg>}
        />
        <StatusCard
          title="In Progress"
          value={taskStats.inProgress}
          color="#F59E0B"
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" /></svg>}
        />
        <StatusCard
          title="Blocked"
          value={taskStats.blocked}
          color="#EF4444"
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>}
        />
      </div>

      {/* Overall Progress Bar */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '12px',
        padding: '1rem 1.5rem',
        border: '1px solid var(--border-color)',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Overall Progress</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--pinnacle-teal)' }}>{taskStats.overallProgress}%</span>
        </div>
        <ProgressBar value={taskStats.overallProgress} />
      </div>

      {/* SECTION 2: Task Distribution */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <TaskDonutChart data={statusDistribution} title="By Status" />
        <TaskDonutChart data={priorityDistribution} title="By Priority" />
      </div>

      {/* SECTION 3: Hours Analysis */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        padding: '1.25rem',
        border: '1px solid var(--border-color)',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Hours Analysis</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Planned vs Actual by Project</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Planned: </span>
              <span style={{ fontWeight: 700 }}>{taskStats.totalPlanned.toLocaleString()} hrs</span>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Actual: </span>
              <span style={{ fontWeight: 700 }}>{taskStats.totalActual.toLocaleString()} hrs</span>
            </div>
            <div style={{
              padding: '4px 12px',
              borderRadius: '16px',
              background: taskStats.hoursEfficiency <= 100 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: taskStats.hoursEfficiency <= 100 ? '#10B981' : '#EF4444',
              fontWeight: 700,
              fontSize: '0.85rem',
            }}>
              {taskStats.hoursEfficiency}% efficiency
            </div>
          </div>
        </div>
        <HoursBarChart data={hoursByProject} height="280px" />
      </div>

      {/* SECTION 4: Quality Control */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '300px 1fr',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        {/* QC Pass Rate Gauge */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          padding: '1.25rem',
          border: '1px solid var(--border-color)',
          textAlign: 'center',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, marginBottom: '0.5rem' }}>QC Pass Rate</h3>
          <QCGauge value={qcPassRate} height="180px" />
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '-1rem' }}>
            {qcPassRate >= 90 ? 'Excellent quality' : qcPassRate >= 70 ? 'Acceptable' : 'Needs improvement'}
          </div>
        </div>

        {/* QC by Gate */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          padding: '1.25rem',
          border: '1px solid var(--border-color)',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, marginBottom: '1rem' }}>QC Transactions by Gate</h3>
          {qcByGate.length > 0 ? (
            <ChartWrapper option={qcByGateOption} height="200px" />
          ) : (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              No QC data available
            </div>
          )}
        </div>
      </div>

      {/* SECTION 5: Detailed Task Table */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
      }}>
        {/* Filters */}
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, marginRight: 'auto' }}>Task Details</h3>
          
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '8px 12px 8px 36px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                width: '200px',
              }}
            />
            <svg
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="inProgress">In Progress</option>
            <option value="blocked">Blocked</option>
            <option value="notStarted">Not Started</option>
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          >
            <option value="all">All Priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th>Task</th>
                <th>Assignee</th>
                <th>Status</th>
                <th className="number">Planned</th>
                <th className="number">Actual</th>
                <th className="number">% Complete</th>
                <th>Due Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length > 0 ? filteredTasks.map((task: any, idx: number) => {
                const status = task.status || task.taskStatus || 'Not Started';
                const pc = task.percentComplete || 0;
                const isOverdue = task.finishDate && new Date(task.finishDate) < new Date() && pc < 100;
                const isOverBudget = (task.actualHours || 0) > (task.baselineHours || task.budgetHours || Infinity);
                
                return (
                  <tr key={idx}>
                    <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {task.name || task.taskName || '-'}
                    </td>
                    <td>{task.assignedResource || task.assignedTo || task.employeeName || '-'}</td>
                    <td>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: pc >= 100 ? 'rgba(16, 185, 129, 0.15)' :
                                   status.toLowerCase().includes('block') ? 'rgba(239, 68, 68, 0.15)' :
                                   pc > 0 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(107, 114, 128, 0.15)',
                        color: pc >= 100 ? '#10B981' :
                               status.toLowerCase().includes('block') ? '#EF4444' :
                               pc > 0 ? '#3B82F6' : '#6B7280',
                      }}>
                        {pc >= 100 ? 'Completed' : status}
                      </span>
                    </td>
                    <td className="number">{task.baselineHours || task.budgetHours || 0}</td>
                    <td className="number" style={{ color: isOverBudget ? '#EF4444' : 'inherit' }}>
                      {task.actualHours || 0}
                    </td>
                    <td className="number">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '60px',
                          height: '6px',
                          background: 'var(--bg-tertiary)',
                          borderRadius: '3px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${pc}%`,
                            height: '100%',
                            background: pc >= 100 ? '#10B981' : pc > 50 ? '#3B82F6' : '#F59E0B',
                            borderRadius: '3px',
                          }} />
                        </div>
                        <span>{pc}%</span>
                      </div>
                    </td>
                    <td style={{ color: isOverdue ? '#EF4444' : 'inherit' }}>
                      {task.finishDate ? new Date(task.finishDate).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    {isLoading ? 'Loading tasks...' : 'No tasks found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {filteredTasks.length >= 50 && (
          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', borderTop: '1px solid var(--border-color)' }}>
            Showing first 50 tasks. Use filters to narrow results.
          </div>
        )}
      </div>
    </div>
  );
}
