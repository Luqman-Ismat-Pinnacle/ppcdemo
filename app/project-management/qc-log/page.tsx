'use client';

/**
 * @fileoverview Quality Control Management Page
 * 
 * QC management with:
 * - Quality Command Center with health metrics
 * - Quality Orders tracking
 * - Non-conformance Management
 * - CAPA (Corrective and Preventive Actions)
 * - Quality Analytics with trending charts
 * 
 * @module app/project-management/qc-log/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { QCTask } from '@/types/data';
import {
  type SortState,
  formatSortIndicator,
  getNextSortState,
  sortByState,
} from '@/lib/sort-utils';
import type { EChartsOption } from 'echarts';

// ============================================================================
// TYPES
// ============================================================================

type ViewType = 'dashboard' | 'orders' | 'nonconformance' | 'capa';

// ============================================================================
// SECTION CARD COMPONENT
// ============================================================================

function SectionCard({ title, subtitle, children, headerRight, noPadding = false, accent }: { 
  title: string; subtitle?: string; children: React.ReactNode; headerRight?: React.ReactNode; noPadding?: boolean; accent?: string;
}) {
  return (
    <div style={{ 
      background: 'var(--bg-card)', 
      borderRadius: '16px', 
      border: `1px solid ${accent ? accent + '40' : 'var(--border-color)'}`, 
      overflow: 'hidden', 
      display: 'flex', 
      flexDirection: 'column',
    }}>
      <div style={{ 
        padding: '0.75rem 1rem', 
        borderBottom: '1px solid var(--border-color)', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexShrink: 0,
        background: accent ? `${accent}08` : undefined,
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: accent || 'var(--text-primary)' }}>{title}</h3>
          {subtitle && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{subtitle}</span>}
        </div>
        {headerRight}
      </div>
      <div style={{ padding: noPadding ? 0 : '1rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>
    </div>
  );
}

// ============================================================================
// QUALITY COMMAND CENTER
// ============================================================================

function QualityCommandCenter({ stats }: { stats: any }) {
  const healthColor = stats.passRate >= 95 ? '#10B981' : stats.passRate >= 85 ? '#F59E0B' : '#EF4444';
  
  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '16px',
      padding: '1.25rem',
      border: '1px solid var(--border-color)',
      display: 'grid',
      gridTemplateColumns: '140px 1fr',
      alignItems: 'center',
      gap: '1.5rem',
    }}>
      {/* Quality Score Ring */}
      <div style={{ position: 'relative', width: '140px', height: '140px' }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-tertiary)" strokeWidth="8" />
          <circle cx="50" cy="50" r="42" fill="none" stroke={healthColor} strokeWidth="8"
            strokeDasharray={`${stats.passRate * 2.64} 264`} strokeLinecap="round"
            transform="rotate(-90 50 50)" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, color: healthColor }}>{stats.passRate.toFixed(0)}%</span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pass Rate</span>
        </div>
      </div>

      {/* Status Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
        {[
          { label: 'Total Orders', value: stats.totalOrders, color: '#3B82F6' },
          { label: 'Completed', value: stats.completed, color: '#10B981' },
          { label: 'In Progress', value: stats.inProgress, color: '#F59E0B' },
          { label: 'Pending', value: stats.pending, color: '#6B7280' },
          { label: 'Critical Errors', value: stats.criticalNC, color: '#EF4444' },
          { label: 'Non-Critical', value: stats.minorNC, color: '#F59E0B' },
          { label: 'Avg Score', value: stats.avgScore.toFixed(1), color: '#40E0D0' },
          { label: 'Total Hours', value: stats.totalHours.toFixed(0), color: '#06B6D4' },
        ].map((item, idx) => (
          <div key={idx} style={{
            background: `${item.color}10`,
            borderRadius: '10px',
            padding: '0.6rem 0.75rem',
            border: `1px solid ${item.color}25`,
          }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{item.label}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// QUALITY TREND CHART
// ============================================================================

function QualityTrendChart({ qcTasks }: { qcTasks: any[] }) {
  const option: EChartsOption = useMemo(() => {
    // Group tasks by status for a simple breakdown
    const statusCounts = new Map<string, number>();
    qcTasks.forEach(qc => {
      const status = qc.qcStatus || 'Unknown';
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    });
    
    // Calculate pass rate from completed tasks
    const completedTasks = qcTasks.filter(t => t.qcStatus === 'Complete');
    const passedTasks = completedTasks.filter(t => (t.qcScore || 0) >= 80);
    const passRate = completedTasks.length > 0 ? Math.round((passedTasks.length / completedTasks.length) * 100) : 0;
    
    // Group by score ranges
    const scoreRanges = [
      { range: '0-59', count: 0, color: '#EF4444' },
      { range: '60-79', count: 0, color: '#F59E0B' },
      { range: '80-89', count: 0, color: '#3B82F6' },
      { range: '90-100', count: 0, color: '#10B981' },
    ];
    
    qcTasks.forEach(qc => {
      const score = qc.qcScore || 0;
      if (score < 60) scoreRanges[0].count++;
      else if (score < 80) scoreRanges[1].count++;
      else if (score < 90) scoreRanges[2].count++;
      else scoreRanges[3].count++;
    });
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
      },
      grid: { left: 50, right: 20, top: 30, bottom: 30 },
      xAxis: {
        type: 'category',
        data: scoreRanges.map(r => r.range),
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } }
      },
      series: [{
        name: 'Tasks',
        type: 'bar',
        data: scoreRanges.map(r => ({
          value: r.count,
          itemStyle: { color: r.color }
        })),
        barWidth: '60%',
        label: {
          show: true,
          position: 'top',
          formatter: '{c}',
          color: 'var(--text-muted)',
          fontSize: 10
        }
      }]
    };
  }, [qcTasks]);

  return <ChartWrapper option={option} height="240px" />;
}

// ============================================================================
// DEFECT DISTRIBUTION CHART
// ============================================================================

function DefectDistributionChart({ qcTasks }: { qcTasks: any[] }) {
  const option: EChartsOption = useMemo(() => {
    const critical = qcTasks.reduce((sum, t) => sum + (t.qcCriticalErrors || 0), 0);
    const major = Math.floor(qcTasks.reduce((sum, t) => sum + (t.qcNonCriticalErrors || 0), 0) * 0.6);
    const minor = qcTasks.reduce((sum, t) => sum + (t.qcNonCriticalErrors || 0), 0) - major;
    const observation = Math.floor(minor * 0.3);
    
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', backgroundColor: 'rgba(22,27,34,0.95)', textStyle: { color: '#fff' } },
      legend: { bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
      series: [{
        type: 'pie',
        radius: ['45%', '75%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        label: { show: false },
        data: [
          { value: critical || 1, name: 'Critical', itemStyle: { color: '#EF4444' } },
          { value: major || 2, name: 'Major', itemStyle: { color: '#F59E0B' } },
          { value: minor || 3, name: 'Minor', itemStyle: { color: '#3B82F6' } },
          { value: observation || 1, name: 'Observation', itemStyle: { color: '#6B7280' } },
        ]
      }]
    };
  }, [qcTasks]);

  return <ChartWrapper option={option} height="200px" />;
}

// ============================================================================
// STATUS BREAKDOWN CHART
// ============================================================================

function StatusBreakdownChart({ qcTasks }: { qcTasks: any[] }) {
  const option: EChartsOption = useMemo(() => {
    // Group by status
    const statusCounts = new Map<string, number>();
    qcTasks.forEach(qc => {
      const status = qc.qcStatus || 'Unknown';
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    });
    
    const statuses = Array.from(statusCounts.entries()).sort((a, b) => b[1] - a[1]);
    const statusColors: Record<string, string> = {
      'Complete': '#10B981',
      'In Progress': '#F59E0B',
      'Not Started': '#6B7280',
      'On Hold': '#EF4444',
      'Failed': '#EF4444',
    };
    
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(22,27,34,0.95)', textStyle: { color: '#fff' } },
      grid: { left: 100, right: 30, top: 20, bottom: 30 },
      xAxis: {
        type: 'value',
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } }
      },
      yAxis: {
        type: 'category',
        data: statuses.map(s => s[0]),
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } }
      },
      series: [{
        name: 'Tasks',
        type: 'bar',
        data: statuses.map(s => ({
          value: s[1],
          itemStyle: { color: statusColors[s[0]] || '#6B7280' }
        })),
        barMaxWidth: 24,
        label: {
          show: true,
          position: 'right',
          formatter: '{c}',
          color: 'var(--text-muted)',
          fontSize: 10
        }
      }]
    };
  }, [qcTasks]);

  return <ChartWrapper option={option} height="200px" />;
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function QCLogPage() {
  const { filteredData, data, updateData } = useData();
  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [qcSort, setQcSort] = useState<SortState | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);

  // Get task name helper
  const getTaskName = useCallback((taskId: string): string => {
    const task = data.tasks?.find((t) => t.taskId === taskId);
    return task?.taskName || taskId;
  }, [data.tasks]);

  // Filter and sort QC tasks
  const filteredQCTasks = useMemo(() => {
    return (filteredData.qctasks || []).filter((qc) => {
      if (statusFilter !== 'all' && qc.qcStatus !== statusFilter) return false;
      const taskName = getTaskName(qc.parentTaskId);
      if (searchTerm && !qc.qcTaskId.toLowerCase().includes(searchTerm.toLowerCase()) && 
          !taskName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [filteredData.qctasks, statusFilter, searchTerm, getTaskName]);

  const sortedQCTasks = useMemo(() => {
    return sortByState(filteredQCTasks, qcSort, (qc, key) => {
      switch (key) {
        case 'qcTaskId': return qc.qcTaskId;
        case 'parentTask': return getTaskName(qc.parentTaskId);
        case 'qcHours': return qc.qcHours ?? 0;
        case 'qcScore': return qc.qcScore ?? 0;
        case 'qcStatus': return qc.qcStatus;
        case 'qcCriticalErrors': return qc.qcCriticalErrors ?? 0;
        default: return null;
      }
    });
  }, [filteredQCTasks, qcSort, getTaskName]);

  const statuses = useMemo(() => {
    return [...new Set((data.qctasks || []).map((qc) => qc.qcStatus))];
  }, [data.qctasks]);

  // Calculate comprehensive stats from real data
  const stats = useMemo(() => {
    const tasks = filteredQCTasks;
    const completedTasks = tasks.filter(t => t.qcStatus === 'Complete');
    const passedTasks = completedTasks.filter(t => (t.qcScore || 0) >= 80);
    
    return {
      totalOrders: tasks.length,
      completed: completedTasks.length,
      inProgress: tasks.filter(t => t.qcStatus === 'In Progress').length,
      pending: tasks.filter(t => t.qcStatus === 'Not Started').length,
      passRate: completedTasks.length > 0 ? (passedTasks.length / completedTasks.length) * 100 : 100,
      avgScore: tasks.length > 0 ? tasks.reduce((sum, t) => sum + (t.qcScore || 0), 0) / tasks.length : 0,
      totalHours: tasks.reduce((sum, t) => sum + (t.qcHours || 0), 0),
      criticalNC: tasks.reduce((sum, t) => sum + (t.qcCriticalErrors || 0), 0),
      minorNC: tasks.reduce((sum, t) => sum + (t.qcNonCriticalErrors || 0), 0),
    };
  }, [filteredQCTasks]);

  // Status color helper
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Complete': return { bg: 'rgba(16, 185, 129, 0.15)', color: '#10B981', border: '#10B981' };
      case 'In Progress': return { bg: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', border: '#F59E0B' };
      case 'Not Started': return { bg: 'rgba(107, 114, 128, 0.15)', color: '#9CA3AF', border: '#6B7280' };
      case 'On Hold': return { bg: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', border: '#EF4444' };
      case 'Failed': return { bg: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', border: '#EF4444' };
      default: return { bg: 'rgba(107, 114, 128, 0.15)', color: '#9CA3AF', border: '#6B7280' };
    }
  };

  // Severity color helper
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Critical': return '#EF4444';
      case 'Major': return '#F59E0B';
      case 'Minor': return '#3B82F6';
      default: return '#6B7280';
    }
  };

  // Edit handlers
  const startEdit = (taskId: string, field: string, currentValue: any) => {
    setEditingCell({ taskId, field });
    setEditValue(String(currentValue ?? ''));
  };

  const saveEdit = (qcTask: QCTask) => {
    if (!editingCell) return;
    const { field } = editingCell;
    const oldValue = String((qcTask as any)[field] ?? '');
    if (oldValue === editValue) {
      setEditingCell(null);
      return;
    }
    let newValue: any = editValue;
    if (['qcHours', 'qcScore', 'qcCount', 'qcCriticalErrors', 'qcNonCriticalErrors'].includes(field)) {
      newValue = parseFloat(editValue) || 0;
    }
    const updatedQCTasks = (data.qctasks || []).map(task => {
      if (task.qcTaskId === qcTask.qcTaskId) return { ...task, [field]: newValue };
      return task;
    });
    updateData({ qctasks: updatedQCTasks });
    setEditingCell(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent, qcTask: QCTask) => {
    if (e.key === 'Enter') saveEdit(qcTask);
    else if (e.key === 'Escape') setEditingCell(null);
  };

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', overflow: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Quality Control</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
            Track inspections, manage non-conformance, and corrective actions
          </p>
        </div>

        {/* View Tabs */}
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: '10px' }}>
          {[
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'orders', label: 'Quality Orders' },
            { key: 'nonconformance', label: 'Non-conformance' },
            { key: 'capa', label: 'CAPA' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key as ViewType)}
              style={{
                padding: '0.5rem 1rem', borderRadius: '8px', border: 'none',
                background: activeView === tab.key ? 'var(--pinnacle-teal)' : 'transparent',
                color: activeView === tab.key ? '#000' : 'var(--text-secondary)',
                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Command Center */}
      <QualityCommandCenter stats={stats} />

      {/* DASHBOARD VIEW */}
      {activeView === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
            <SectionCard title="Score Distribution" subtitle="Tasks by QC score range">
              <QualityTrendChart qcTasks={filteredQCTasks} />
            </SectionCard>
            <SectionCard title="Defect Distribution" subtitle="By severity">
              <DefectDistributionChart qcTasks={filteredQCTasks} />
            </SectionCard>
            <SectionCard title="Status Breakdown" subtitle="Tasks by status">
              <StatusBreakdownChart qcTasks={filteredQCTasks} />
            </SectionCard>
          </div>

          {/* Recent Activity */}
          <SectionCard title="Recent Quality Orders" subtitle="Latest inspection results" noPadding>
            <div style={{ maxHeight: '300px', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Order ID</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Task</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Score</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Critical</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Minor</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedQCTasks.slice(0, 10).map((qc, idx) => {
                    const colors = getStatusColor(qc.qcStatus);
                    const score = qc.qcScore || 0;
                    const scoreColor = score >= 90 ? '#10B981' : score >= 80 ? '#F59E0B' : '#EF4444';
                    return (
                      <tr key={qc.qcTaskId} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: 'var(--pinnacle-teal)', fontWeight: 500 }}>{qc.qcTaskId}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getTaskName(qc.parentTaskId)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '12px', background: `${scoreColor}20`, color: scoreColor, fontWeight: 600 }}>{score}</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, background: colors.bg, color: colors.color, border: `1px solid ${colors.border}` }}>{qc.qcStatus}</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: (qc.qcCriticalErrors || 0) > 0 ? '#EF4444' : 'var(--text-muted)' }}>
                          {(qc.qcCriticalErrors || 0) > 0 && <span style={{ background: 'rgba(239,68,68,0.15)', padding: '2px 8px', borderRadius: '8px' }}>{qc.qcCriticalErrors}</span>}
                          {(qc.qcCriticalErrors || 0) === 0 && '0'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: (qc.qcNonCriticalErrors || 0) > 0 ? '#F59E0B' : 'var(--text-muted)' }}>
                          {(qc.qcNonCriticalErrors || 0) > 0 && <span style={{ background: 'rgba(245,158,11,0.15)', padding: '2px 8px', borderRadius: '8px' }}>{qc.qcNonCriticalErrors}</span>}
                          {(qc.qcNonCriticalErrors || 0) === 0 && '0'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}

      {/* QUALITY ORDERS VIEW */}
      {activeView === 'orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ flex: '1 1 200px', maxWidth: '280px' }}>
              <input type="text" placeholder="Search orders..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }} />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer', minWidth: '140px' }}>
              <option value="all">All Status</option>
              {statuses.map((status) => (<option key={status} value={status}>{status}</option>))}
            </select>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
              {filteredQCTasks.length} of {(data.qctasks || []).length} orders
            </span>
          </div>

          {/* Orders Table */}
          <div style={{ flex: 1, background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ borderBottom: '1px solid var(--border-color)', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Quality Orders</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px' }}>Click cells to edit</span>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    {[
                      { key: 'qcTaskId', label: 'Order ID', align: 'left' },
                      { key: 'parentTask', label: 'Task', align: 'left' },
                      { key: 'qcHours', label: 'Hours', align: 'center' },
                      { key: 'qcScore', label: 'Score', align: 'center' },
                      { key: 'qcStatus', label: 'Status', align: 'center' },
                      { key: 'qcCriticalErrors', label: 'Critical', align: 'center' },
                      { key: 'qcNonCriticalErrors', label: 'Non-Critical', align: 'center' },
                      { key: 'qcComments', label: 'Comments', align: 'left' },
                    ].map((col) => (
                      <th key={col.key} style={{ padding: '10px 12px', textAlign: col.align as any, fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                        <button type="button" onClick={() => setQcSort(prev => getNextSortState(prev, col.key))} style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: 'inherit', textTransform: 'inherit' }}>
                          {col.label}
                          {formatSortIndicator(qcSort, col.key) && <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>{formatSortIndicator(qcSort, col.key)}</span>}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedQCTasks.map((qc, idx) => {
                    const colors = getStatusColor(qc.qcStatus);
                    const score = qc.qcScore || 0;
                    const scoreColor = score >= 90 ? '#10B981' : score >= 80 ? '#F59E0B' : '#EF4444';
                    
                    return (
                      <tr key={qc.qcTaskId} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: 'var(--pinnacle-teal)', fontWeight: 500 }}>{qc.qcTaskId}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={getTaskName(qc.parentTaskId)}>{getTaskName(qc.parentTaskId)}</td>
                        <td onClick={() => startEdit(qc.qcTaskId, 'qcHours', qc.qcHours)} style={{ padding: '8px 12px', textAlign: 'center', cursor: 'pointer' }}>
                          {editingCell?.taskId === qc.qcTaskId && editingCell?.field === 'qcHours' ? (
                            <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => saveEdit(qc)} onKeyDown={(e) => handleKeyPress(e, qc)} autoFocus style={{ width: '50px', padding: '4px', fontSize: '0.8rem', background: 'var(--bg-tertiary)', border: '2px solid var(--pinnacle-teal)', borderRadius: '4px', color: 'var(--text-primary)', textAlign: 'center' }} />
                          ) : (qc.qcHours ?? 0)}
                        </td>
                        <td onClick={() => startEdit(qc.qcTaskId, 'qcScore', qc.qcScore)} style={{ padding: '8px 12px', textAlign: 'center', cursor: 'pointer' }}>
                          {editingCell?.taskId === qc.qcTaskId && editingCell?.field === 'qcScore' ? (
                            <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => saveEdit(qc)} onKeyDown={(e) => handleKeyPress(e, qc)} autoFocus style={{ width: '50px', padding: '4px', fontSize: '0.8rem', background: 'var(--bg-tertiary)', border: '2px solid var(--pinnacle-teal)', borderRadius: '4px', color: 'var(--text-primary)', textAlign: 'center' }} />
                          ) : <span style={{ padding: '2px 8px', borderRadius: '12px', background: `${scoreColor}20`, color: scoreColor, fontWeight: 600 }}>{score}</span>}
                        </td>
                        <td onClick={() => startEdit(qc.qcTaskId, 'qcStatus', qc.qcStatus)} style={{ padding: '8px 12px', textAlign: 'center', cursor: 'pointer' }}>
                          {editingCell?.taskId === qc.qcTaskId && editingCell?.field === 'qcStatus' ? (
                            <select value={editValue} onChange={(e) => { setEditValue(e.target.value); }} onBlur={() => saveEdit(qc)} autoFocus style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'var(--bg-tertiary)', border: '2px solid var(--pinnacle-teal)', borderRadius: '4px', color: 'var(--text-primary)' }}>
                              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, background: colors.bg, color: colors.color, border: `1px solid ${colors.border}` }}>{qc.qcStatus}</span>}
                        </td>
                        <td onClick={() => startEdit(qc.qcTaskId, 'qcCriticalErrors', qc.qcCriticalErrors)} style={{ padding: '8px 12px', textAlign: 'center', cursor: 'pointer', color: (qc.qcCriticalErrors || 0) > 0 ? '#EF4444' : 'var(--text-muted)', fontWeight: 600 }}>
                          {editingCell?.taskId === qc.qcTaskId && editingCell?.field === 'qcCriticalErrors' ? (
                            <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => saveEdit(qc)} onKeyDown={(e) => handleKeyPress(e, qc)} autoFocus style={{ width: '50px', padding: '4px', fontSize: '0.8rem', background: 'var(--bg-tertiary)', border: '2px solid var(--pinnacle-teal)', borderRadius: '4px', color: 'var(--text-primary)', textAlign: 'center' }} />
                          ) : <span style={{ background: (qc.qcCriticalErrors || 0) > 0 ? 'rgba(239,68,68,0.15)' : 'transparent', padding: '2px 8px', borderRadius: '8px' }}>{qc.qcCriticalErrors ?? 0}</span>}
                        </td>
                        <td onClick={() => startEdit(qc.qcTaskId, 'qcNonCriticalErrors', qc.qcNonCriticalErrors)} style={{ padding: '8px 12px', textAlign: 'center', cursor: 'pointer', color: (qc.qcNonCriticalErrors || 0) > 0 ? '#F59E0B' : 'var(--text-muted)', fontWeight: 600 }}>
                          {editingCell?.taskId === qc.qcTaskId && editingCell?.field === 'qcNonCriticalErrors' ? (
                            <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => saveEdit(qc)} onKeyDown={(e) => handleKeyPress(e, qc)} autoFocus style={{ width: '50px', padding: '4px', fontSize: '0.8rem', background: 'var(--bg-tertiary)', border: '2px solid var(--pinnacle-teal)', borderRadius: '4px', color: 'var(--text-primary)', textAlign: 'center' }} />
                          ) : <span style={{ background: (qc.qcNonCriticalErrors || 0) > 0 ? 'rgba(245,158,11,0.15)' : 'transparent', padding: '2px 8px', borderRadius: '8px' }}>{qc.qcNonCriticalErrors ?? 0}</span>}
                        </td>
                        <td onClick={() => startEdit(qc.qcTaskId, 'qcComments', qc.qcComments)} style={{ padding: '8px 12px', cursor: 'pointer', color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {editingCell?.taskId === qc.qcTaskId && editingCell?.field === 'qcComments' ? (
                            <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => saveEdit(qc)} onKeyDown={(e) => handleKeyPress(e, qc)} autoFocus style={{ width: '100%', padding: '4px 8px', fontSize: '0.8rem', background: 'var(--bg-tertiary)', border: '2px solid var(--pinnacle-teal)', borderRadius: '4px', color: 'var(--text-primary)' }} />
                          ) : (qc.qcComments || '—')}
                        </td>
                      </tr>
                    );
                  })}
                  {sortedQCTasks.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No quality orders found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* NON-CONFORMANCE VIEW */}
      {activeView === 'nonconformance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* NC Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            {[
              { label: 'Critical Errors', value: stats.criticalNC, color: '#EF4444' },
              { label: 'Non-Critical Errors', value: stats.minorNC, color: '#F59E0B' },
              { label: 'Total Issues', value: stats.criticalNC + stats.minorNC, color: '#8B5CF6' },
            ].map((item, idx) => (
              <div key={idx} style={{ background: `${item.color}10`, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${item.color}30` }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{item.label}</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* NC Table - Tasks with errors */}
          <SectionCard title="Tasks with Errors" subtitle="Quality issues by task" noPadding>
            <div style={{ maxHeight: '400px', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>QC Task ID</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Parent Task</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Critical</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Non-Critical</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Score</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedQCTasks.filter(q => (q.qcCriticalErrors || 0) > 0 || (q.qcNonCriticalErrors || 0) > 0).map((qc, idx) => {
                    const hasCritical = (qc.qcCriticalErrors || 0) > 0;
                    const colors = getStatusColor(qc.qcStatus);
                    const score = qc.qcScore || 0;
                    const scoreColor = score >= 90 ? '#10B981' : score >= 80 ? '#F59E0B' : '#EF4444';
                    return (
                      <tr key={`nc-${qc.qcTaskId}`} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: hasCritical ? '#EF4444' : '#F59E0B', fontWeight: 500 }}>{qc.qcTaskId}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getTaskName(qc.parentTaskId)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: hasCritical ? '#EF4444' : 'var(--text-muted)' }}>
                          {qc.qcCriticalErrors ?? 0}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: (qc.qcNonCriticalErrors || 0) > 0 ? '#F59E0B' : 'var(--text-muted)' }}>
                          {qc.qcNonCriticalErrors ?? 0}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '12px', background: `${scoreColor}20`, color: scoreColor, fontWeight: 600 }}>{score}</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, background: colors.bg, color: colors.color }}>{qc.qcStatus}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedQCTasks.filter(q => (q.qcCriticalErrors || 0) > 0 || (q.qcNonCriticalErrors || 0) > 0).length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No tasks with errors</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}

      {/* CAPA VIEW */}
      {activeView === 'capa' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* CAPA Summary - based on real data */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            {[
              { label: 'Tasks Needing Action', value: sortedQCTasks.filter(q => (q.qcCriticalErrors || 0) > 0 || (q.qcScore || 0) < 80).length, color: '#EF4444' },
              { label: 'Tasks with Low Score', value: sortedQCTasks.filter(q => (q.qcScore || 0) < 80 && (q.qcScore || 0) > 0).length, color: '#F59E0B' },
              { label: 'Pending QC', value: sortedQCTasks.filter(q => q.qcStatus === 'Not Started').length, color: '#6B7280' },
            ].map((item, idx) => (
              <div key={idx} style={{ background: `${item.color}10`, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${item.color}30` }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{item.label}</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Tasks requiring corrective action */}
          <SectionCard title="Tasks Requiring Corrective Action" subtitle="Tasks with critical errors or low scores" noPadding>
            <div style={{ maxHeight: '400px', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>QC Task ID</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Parent Task</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Score</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Critical Errors</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedQCTasks.filter(q => (q.qcCriticalErrors || 0) > 0 || ((q.qcScore || 0) < 80 && (q.qcScore || 0) > 0)).map((qc, idx) => {
                    const colors = getStatusColor(qc.qcStatus);
                    const score = qc.qcScore || 0;
                    const scoreColor = score >= 90 ? '#10B981' : score >= 80 ? '#F59E0B' : '#EF4444';
                    const hasCritical = (qc.qcCriticalErrors || 0) > 0;
                    const issue = hasCritical ? 'Critical errors found' : 'Score below 80%';
                    
                    return (
                      <tr key={qc.qcTaskId} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#8B5CF6', fontWeight: 500 }}>{qc.qcTaskId}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getTaskName(qc.parentTaskId)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '12px', background: `${scoreColor}20`, color: scoreColor, fontWeight: 600 }}>{score}</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: hasCritical ? '#EF4444' : 'var(--text-muted)' }}>
                          {qc.qcCriticalErrors ?? 0}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, background: colors.bg, color: colors.color }}>{qc.qcStatus}</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: hasCritical ? '#EF4444' : '#F59E0B', fontSize: '0.75rem' }}>{issue}</td>
                      </tr>
                    );
                  })}
                  {sortedQCTasks.filter(q => (q.qcCriticalErrors || 0) > 0 || ((q.qcScore || 0) < 80 && (q.qcScore || 0) > 0)).length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No tasks requiring corrective action</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
