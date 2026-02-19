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
      borderRadius: '12px', 
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
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: accent || 'var(--text-primary)' }}>{title}</h3>
          {subtitle && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{subtitle}</span>}
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
      background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)',
      borderRadius: '20px',
      padding: '1.25rem',
      border: '1px solid var(--border-color)',
      display: 'grid',
      gridTemplateColumns: '160px 1fr',
      alignItems: 'center',
      gap: '1.5rem',
    }}>
      {/* Quality Score Ring */}
      <div style={{ position: 'relative', width: '160px', height: '160px' }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-tertiary)" strokeWidth="8" />
          <circle cx="50" cy="50" r="42" fill="none" stroke={healthColor} strokeWidth="8"
            strokeDasharray={`${stats.passRate * 2.64} 264`} strokeLinecap="round"
            transform="rotate(-90 50 50)" style={{ filter: `drop-shadow(0 0 8px ${healthColor})` }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '2rem', fontWeight: 900, color: healthColor }}>{stats.passRate.toFixed(0)}%</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pass Rate</span>
        </div>
      </div>

      {/* Status Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
        {[
          { label: 'Total Orders', value: stats.totalOrders, color: 'var(--pinnacle-lime)' },
          { label: 'Completed', value: stats.completed, color: '#10B981' },
          { label: 'In Progress', value: stats.inProgress, color: '#F59E0B' },
          { label: 'Pending', value: stats.pending, color: '#6B7280' },
          { label: 'Critical Errors', value: stats.criticalNC, color: '#EF4444' },
          { label: 'Non-Critical', value: stats.minorNC, color: '#F59E0B' },
          { label: 'Avg Score', value: stats.avgScore.toFixed(1), color: 'var(--pinnacle-teal)' },
          { label: 'Total Hours', value: (Number(stats.totalHours) || 0).toFixed(0), color: 'var(--pinnacle-lime)' },
        ].map((item, idx) => (
          <div key={idx} style={{
            background: `${item.color}10`,
            borderRadius: '12px',
            padding: '0.75rem 1rem',
            border: `1px solid ${item.color}30`,
          }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{item.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: item.color }}>{item.value}</div>
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
      { range: '80-89', count: 0, color: 'var(--pinnacle-lime)' },
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
        axisLabel: { color: 'var(--text-muted)', fontSize: 11 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: 'var(--text-muted)', fontSize: 11 },
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
          fontSize: 11
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
      legend: { bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 11 } },
      series: [{
        type: 'pie',
        radius: ['45%', '75%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        label: { show: false },
        data: [
          { value: critical || 1, name: 'Critical', itemStyle: { color: '#EF4444' } },
          { value: major || 2, name: 'Major', itemStyle: { color: '#F59E0B' } },
          { value: minor || 3, name: 'Minor', itemStyle: { color: 'var(--pinnacle-lime)' } },
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
        axisLabel: { color: 'var(--text-muted)', fontSize: 11 },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } }
      },
      yAxis: {
        type: 'category',
        data: statuses.map(s => s[0]),
        axisLabel: { color: 'var(--text-muted)', fontSize: 11 },
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
          fontSize: 11
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

  const getTaskName = useCallback((taskId: string): string => {
    const task = data.tasks?.find((t) => t.taskId === taskId);
    return task?.taskName || taskId;
  }, [data.tasks]);

  const qcTasksSource = useMemo(() => filteredData.qctasks || [], [filteredData.qctasks]);

  // Filter and sort QC tasks
  const filteredQCTasks = useMemo(() => {
    return qcTasksSource.filter((qc) => {
      if (statusFilter !== 'all' && qc.qcStatus !== statusFilter) return false;
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const taskName = getTaskName(qc.parentTaskId);
      const title = (qc.title || '').toLowerCase();
      const taskWorker = (qc.taskWorker || '').toLowerCase();
      const qcResource = (qc.qcResource || '').toLowerCase();
      const chargeCode = (qc.chargeCodeV2 || '').toLowerCase();
      return qc.qcTaskId.toLowerCase().includes(term) || taskName.toLowerCase().includes(term) ||
        title.includes(term) || taskWorker.includes(term) || qcResource.includes(term) || chargeCode.includes(term);
    });
  }, [qcTasksSource, statusFilter, searchTerm, getTaskName]);

  const sortedQCTasks = useMemo(() => {
    return sortByState(filteredQCTasks, qcSort, (qc, key) => {
      switch (key) {
        case 'qcTaskId': return qc.qcTaskId;
        case 'parentTask': return getTaskName(qc.parentTaskId);
        case 'title': return qc.title || getTaskName(qc.parentTaskId) || '';
        case 'chargeCodeV2': return qc.chargeCodeV2 || '';
        case 'taskWorker': return qc.taskWorker || '';
        case 'qcResource': return qc.qcResource || '';
        case 'clientReady': return qc.clientReady || '';
        case 'pctItemsCorrect': return qc.pctItemsCorrect ?? qc.qcScore ?? 0;
        case 'itemsSubmitted': return qc.itemsSubmitted ?? qc.qcCount ?? 0;
        case 'itemsCorrect': return qc.itemsCorrect ?? 0;
        case 'qcUom': return qc.qcUOM || '';
        case 'qcHours': return qc.qcHours ?? 0;
        case 'qcScore': return qc.qcScore ?? 0;
        case 'qcCount': return qc.qcCount ?? 0;
        case 'qcStatus': return qc.qcStatus;
        case 'notes': return qc.notes || qc.qcComments || '';
        case 'qcGate': return qc.qcGate || '';
        case 'qcRequestedDate': return qc.qcRequestedDate || qc.qcStartDate || '';
        case 'qcCompleteDate': return qc.qcCompleteDate || qc.qcEndDate || '';
        case 'createdBy': return qc.createdBy || '';
        case 'modifiedBy': return qc.modifiedBy || '';
        case 'qcCriticalErrors': return qc.qcCriticalErrors ?? 0;
        case 'qcNonCriticalErrors': return qc.qcNonCriticalErrors ?? 0;
        default: return null;
      }
    });
  }, [filteredQCTasks, qcSort, getTaskName]);

  const statuses = useMemo(() => {
    return [...new Set(qcTasksSource.map((qc) => qc.qcStatus))];
  }, [qcTasksSource]);

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
      case 'Minor': return 'var(--pinnacle-lime)';
      default: return '#6B7280';
    }
  };

  // Edit handlers
  const startEdit = (taskId: string, field: string, currentValue: any) => {
    setEditingCell({ taskId, field });
    setEditValue(String(currentValue ?? ''));
  };

  const saveEdit = async (qcTask: QCTask) => {
    if (!editingCell) return;
    const { field } = editingCell;
    const oldValue = String((qcTask as any)[field] ?? '');
    if (oldValue === editValue) {
      setEditingCell(null);
      return;
    }
    let newValue: any = editValue;
    if (['qcHours', 'qcScore', 'qcCount', 'qcCriticalErrors', 'qcNonCriticalErrors', 'itemsSubmitted', 'itemsCorrect', 'pctItemsCorrect'].includes(field)) {
      newValue = (field === 'qcScore' || field === 'pctItemsCorrect' || field === 'qcHours') ? (parseFloat(editValue) || 0) : (parseInt(editValue, 10) || 0);
    }
    const updatedQCTasks = (data.qctasks || []).map(task => {
      if (task.qcTaskId !== qcTask.qcTaskId) return task;
      const updated = { ...task, [field]: newValue };
      if (field === 'qcComments') (updated as any).notes = newValue;
      return updated;
    });
    updateData({ qctasks: updatedQCTasks });
    setEditingCell(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent, qcTask: QCTask) => {
    if (e.key === 'Enter') saveEdit(qcTask);
    else if (e.key === 'Escape') setEditingCell(null);
  };

  const viewTabs: { key: ViewType; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'orders', label: 'Quality Orders' },
    { key: 'nonconformance', label: 'Non-conformance' },
    { key: 'capa', label: 'CAPA' },
  ];

  return (
    <div className="page-panel full-height-page" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header - Sprint-style */}
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>QC Log</h1>
        </div>
      </div>

      {/* Command Center */}
      <div style={{ padding: '1rem 1.5rem', flexShrink: 0 }}>
        <QualityCommandCenter stats={stats} />
      </div>

      {/* View Toolbar - Sprint-style */}
      <div style={{ display: 'flex', gap: '4px', padding: '0.5rem 1.5rem', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        {viewTabs.map(tab => {
          const isActive = activeView === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                background: isActive ? 'var(--pinnacle-teal)' : 'transparent', border: 'none', borderRadius: '6px',
                color: isActive ? '#041717' : 'var(--text-primary)', fontSize: '0.85rem', fontWeight: isActive ? 600 : 500, cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content - ensure readable text on dark background */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', color: 'var(--text-primary)' }}>

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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>QC Transaction</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Title</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Score</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Status</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Critical</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Minor</th>
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
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{qc.title || getTaskName(qc.parentTaskId)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '12px', background: `${scoreColor}20`, color: scoreColor, fontWeight: 600 }}>{score}</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 600, background: colors.bg, color: colors.color, border: `1px solid ${colors.border}` }}>{qc.qcStatus}</span>
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
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <div style={{ flex: '1 1 200px', maxWidth: '280px' }}>
              <input type="text" placeholder="Search QC Transaction, Title, Task Worker..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.9rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }} />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.9rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer', minWidth: '140px' }}>
              <option value="all">All Status</option>
              {statuses.map((status) => (<option key={status} value={status}>{status}</option>))}
            </select>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
              {filteredQCTasks.length} of {qcTasksSource.length} orders
            </span>
          </div>

          {/* Orders Table - Excel columns + UOM, QC Score, Count */}
          <div style={{ flex: 1, background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ borderBottom: '1px solid var(--border-color)', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Quality Orders (QC Log)</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Click cells to edit</span>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', minWidth: '1600px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    {[
                      { key: 'qcTaskId', label: 'QC Transaction', align: 'left' as const },
                      { key: 'title', label: 'Title', align: 'left' as const },
                      { key: 'chargeCodeV2', label: 'Charge Code V2', align: 'left' as const },
                      { key: 'taskWorker', label: 'Task Worker', align: 'left' as const },
                      { key: 'qcResource', label: 'QC Resource', align: 'left' as const },
                      { key: 'qcStatus', label: 'QC Status', align: 'center' as const },
                      { key: 'clientReady', label: 'Client Ready?', align: 'center' as const },
                      { key: 'pctItemsCorrect', label: 'Pct Items Correct', align: 'center' as const },
                      { key: 'itemsSubmitted', label: 'Items Submitted', align: 'center' as const },
                      { key: 'itemsCorrect', label: 'Items Correct', align: 'center' as const },
                      { key: 'qcUom', label: 'UOM', align: 'center' as const },
                      { key: 'qcScore', label: 'QC Score', align: 'center' as const },
                      { key: 'qcCount', label: 'Count', align: 'center' as const },
                      { key: 'notes', label: 'Notes', align: 'left' as const },
                      { key: 'qcGate', label: 'QC Gate', align: 'left' as const },
                      { key: 'qcRequestedDate', label: 'QC Requested Date', align: 'left' as const },
                      { key: 'qcCompleteDate', label: 'QC Complete Date', align: 'left' as const },
                      { key: 'createdBy', label: 'Created By', align: 'left' as const },
                      { key: 'modifiedBy', label: 'Modified By', align: 'left' as const },
                      { key: 'qcCriticalErrors', label: 'Critical', align: 'center' as const },
                      { key: 'qcNonCriticalErrors', label: 'Non-Critical', align: 'center' as const },
                    ].map((col) => (
                      <th key={col.key} style={{ padding: '10px 8px', textAlign: col.align, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem', position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1, whiteSpace: 'nowrap' }}>
                        <button type="button" onClick={() => setQcSort(prev => getNextSortState(prev, col.key))} style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: 'inherit' }}>
                          {col.label}
                          {formatSortIndicator(qcSort, col.key) && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{formatSortIndicator(qcSort, col.key)}</span>}
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
                    const fmtDate = (s: string | null | undefined) => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
                    return (
                      <tr key={qc.qcTaskId} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '8px', fontFamily: 'monospace', color: 'var(--pinnacle-teal)', fontWeight: 500 }}>{qc.qcTaskId}</td>
                        <td style={{ padding: '8px', color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={qc.title || ''}>{qc.title || getTaskName(qc.parentTaskId) || '—'}</td>
                        <td style={{ padding: '8px', color: 'var(--text-secondary)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{qc.chargeCodeV2 || '—'}</td>
                        <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{qc.taskWorker || '—'}</td>
                        <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{qc.qcResource || '—'}</td>
                        <td onClick={() => startEdit(qc.qcTaskId, 'qcStatus', qc.qcStatus)} style={{ padding: '8px', textAlign: 'center', cursor: 'pointer' }}>
                          {editingCell?.taskId === qc.qcTaskId && editingCell?.field === 'qcStatus' ? (
                            <select value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => saveEdit(qc)} autoFocus style={{ padding: '4px 8px', fontSize: '0.85rem', background: 'var(--bg-tertiary)', border: '2px solid var(--pinnacle-teal)', borderRadius: '4px', color: 'var(--text-primary)' }}>
                              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 600, background: colors.bg, color: colors.color, border: `1px solid ${colors.border}` }}>{qc.qcStatus}</span>}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-secondary)' }}>{qc.clientReady ?? '—'}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-secondary)' }}>{qc.pctItemsCorrect != null ? qc.pctItemsCorrect : '—'}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-secondary)' }}>{qc.itemsSubmitted ?? qc.qcCount ?? '—'}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-secondary)' }}>{qc.itemsCorrect ?? '—'}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-secondary)' }}>{qc.qcUOM || 'Item'}</td>
                        <td onClick={() => startEdit(qc.qcTaskId, 'qcScore', qc.qcScore)} style={{ padding: '8px', textAlign: 'center', cursor: 'pointer' }}>
                          {editingCell?.taskId === qc.qcTaskId && editingCell?.field === 'qcScore' ? (
                            <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => saveEdit(qc)} onKeyDown={(e) => handleKeyPress(e, qc)} autoFocus style={{ width: '52px', padding: '4px', fontSize: '0.85rem', background: 'var(--bg-tertiary)', border: '2px solid var(--pinnacle-teal)', borderRadius: '4px', color: 'var(--text-primary)', textAlign: 'center' }} />
                          ) : <span style={{ padding: '2px 8px', borderRadius: '12px', background: `${scoreColor}20`, color: scoreColor, fontWeight: 600 }}>{score}</span>}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-secondary)' }}>{qc.qcCount ?? '—'}</td>
                        <td onClick={() => startEdit(qc.qcTaskId, 'qcComments', qc.notes ?? qc.qcComments)} style={{ padding: '8px', cursor: 'pointer', color: 'var(--text-secondary)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={qc.notes || qc.qcComments || ''}>
                          {editingCell?.taskId === qc.qcTaskId && editingCell?.field === 'qcComments' ? (
                            <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => saveEdit(qc)} onKeyDown={(e) => handleKeyPress(e, qc)} autoFocus style={{ width: '100%', padding: '4px 8px', fontSize: '0.85rem', background: 'var(--bg-tertiary)', border: '2px solid var(--pinnacle-teal)', borderRadius: '4px', color: 'var(--text-primary)' }} />
                          ) : (qc.notes || qc.qcComments || '—')}
                        </td>
                        <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{qc.qcGate || '—'}</td>
                        <td style={{ padding: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{fmtDate(qc.qcRequestedDate ?? null)}</td>
                        <td style={{ padding: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{fmtDate(qc.qcCompleteDate ?? qc.qcEndDate ?? null)}</td>
                        <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{qc.createdBy || '—'}</td>
                        <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{qc.modifiedBy || '—'}</td>
                        <td onClick={() => startEdit(qc.qcTaskId, 'qcCriticalErrors', qc.qcCriticalErrors)} style={{ padding: '8px', textAlign: 'center', cursor: 'pointer', color: (qc.qcCriticalErrors || 0) > 0 ? '#EF4444' : 'var(--text-muted)', fontWeight: 600 }}>
                          {editingCell?.taskId === qc.qcTaskId && editingCell?.field === 'qcCriticalErrors' ? (
                            <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => saveEdit(qc)} onKeyDown={(e) => handleKeyPress(e, qc)} autoFocus style={{ width: '44px', padding: '4px', fontSize: '0.85rem', background: 'var(--bg-tertiary)', border: '2px solid var(--pinnacle-teal)', borderRadius: '4px', color: 'var(--text-primary)', textAlign: 'center' }} />
                          ) : <span style={{ background: (qc.qcCriticalErrors || 0) > 0 ? 'rgba(239,68,68,0.15)' : 'transparent', padding: '2px 8px', borderRadius: '8px' }}>{qc.qcCriticalErrors ?? 0}</span>}
                        </td>
                        <td onClick={() => startEdit(qc.qcTaskId, 'qcNonCriticalErrors', qc.qcNonCriticalErrors)} style={{ padding: '8px', textAlign: 'center', cursor: 'pointer', color: (qc.qcNonCriticalErrors || 0) > 0 ? '#F59E0B' : 'var(--text-muted)', fontWeight: 600 }}>
                          {editingCell?.taskId === qc.qcTaskId && editingCell?.field === 'qcNonCriticalErrors' ? (
                            <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => saveEdit(qc)} onKeyDown={(e) => handleKeyPress(e, qc)} autoFocus style={{ width: '44px', padding: '4px', fontSize: '0.85rem', background: 'var(--bg-tertiary)', border: '2px solid var(--pinnacle-teal)', borderRadius: '4px', color: 'var(--text-primary)', textAlign: 'center' }} />
                          ) : <span style={{ background: (qc.qcNonCriticalErrors || 0) > 0 ? 'rgba(245,158,11,0.15)' : 'transparent', padding: '2px 8px', borderRadius: '8px' }}>{qc.qcNonCriticalErrors ?? 0}</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {sortedQCTasks.length === 0 && (
                    <tr><td colSpan={20} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>No quality orders found. Data is loaded from the backend.</td></tr>
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
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{item.label}</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* NC Table - Tasks with errors */}
          <SectionCard title="Tasks with Errors" subtitle="Quality issues by task" noPadding>
            <div style={{ maxHeight: '400px', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>QC Transaction</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Title</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Critical</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Non-Critical</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Score</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Status</th>
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
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{qc.title || getTaskName(qc.parentTaskId)}</td>
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
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 600, background: colors.bg, color: colors.color }}>{qc.qcStatus}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedQCTasks.filter(q => (q.qcCriticalErrors || 0) > 0 || (q.qcNonCriticalErrors || 0) > 0).length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>No tasks with errors</td></tr>
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
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{item.label}</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Tasks requiring corrective action */}
          <SectionCard title="Tasks Requiring Corrective Action" subtitle="Tasks with critical errors or low scores" noPadding>
            <div style={{ maxHeight: '400px', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>QC Transaction</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Title</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Score</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Critical Errors</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Status</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Issue</th>
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
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{qc.title || getTaskName(qc.parentTaskId)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '12px', background: `${scoreColor}20`, color: scoreColor, fontWeight: 600 }}>{score}</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: hasCritical ? '#EF4444' : 'var(--text-muted)' }}>
                          {qc.qcCriticalErrors ?? 0}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 600, background: colors.bg, color: colors.color }}>{qc.qcStatus}</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: hasCritical ? '#EF4444' : '#F59E0B', fontSize: '0.85rem' }}>{issue}</td>
                      </tr>
                    );
                  })}
                  {sortedQCTasks.filter(q => (q.qcCriticalErrors || 0) > 0 || ((q.qcScore || 0) < 80 && (q.qcScore || 0) > 0)).length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>No tasks requiring corrective action</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}
      </div>
    </div>
  );
}
