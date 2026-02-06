'use client';

/**
 * @fileoverview Quality Control Management Page - Microsoft Dynamics Style
 * 
 * Comprehensive QC management with enhanced features:
 * - Quality Command Center with health metrics
 * - Quality Orders (create/track inspections)
 * - Non-conformance Management with severity tracking
 * - CAPA (Corrective and Preventive Actions)
 * - Test Results with pass/fail and detailed scoring
 * - Quality Analytics with trending charts
 * - Inspector assignment and workload tracking
 * - Sampling plans and inspection triggers
 * 
 * Inspired by Microsoft Dynamics 365 Quality Management
 * 
 * @module app/project-management/qc-log/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { QCTask, ChangeLogEntry } from '@/types/data';
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

interface QualityOrder {
  id: string;
  taskId: string;
  taskName: string;
  type: 'Inspection' | 'Audit' | 'Verification' | 'Certification';
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Pending' | 'In Progress' | 'Complete' | 'Failed' | 'On Hold';
  inspector: string;
  scheduledDate: string;
  completedDate?: string;
  testCount: number;
  passCount: number;
  failCount: number;
  score: number;
  comments: string;
}

interface NonConformance {
  id: string;
  orderId: string;
  severity: 'Critical' | 'Major' | 'Minor' | 'Observation';
  category: string;
  description: string;
  rootCause?: string;
  status: 'Open' | 'Under Review' | 'Resolved' | 'Closed';
  detectedDate: string;
  dueDate?: string;
  assignedTo?: string;
}

interface CAPA {
  id: string;
  ncId: string;
  type: 'Corrective' | 'Preventive';
  action: string;
  status: 'Planned' | 'In Progress' | 'Verification' | 'Complete';
  owner: string;
  dueDate: string;
  completedDate?: string;
  effectiveness?: 'Effective' | 'Partially Effective' | 'Not Effective';
}

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
      background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)',
      borderRadius: '20px',
      padding: '1.25rem',
      border: '1px solid var(--border-color)',
      display: 'grid',
      gridTemplateColumns: '160px 1fr auto',
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
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pass Rate</span>
        </div>
      </div>

      {/* Status Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
        {[
          { label: 'Total Orders', value: stats.totalOrders, color: '#3B82F6' },
          { label: 'Completed', value: stats.completed, color: '#10B981' },
          { label: 'In Progress', value: stats.inProgress, color: '#F59E0B' },
          { label: 'Pending', value: stats.pending, color: '#6B7280' },
          { label: 'Critical NC', value: stats.criticalNC, color: '#EF4444' },
          { label: 'Open CAPA', value: stats.openCAPA, color: '#8B5CF6' },
          { label: 'Avg Score', value: stats.avgScore.toFixed(1), color: '#40E0D0' },
          { label: 'Hours', value: stats.totalHours.toFixed(0), color: '#06B6D4' },
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

      {/* Quick Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.6rem 1rem', background: 'var(--pinnacle-teal)', borderRadius: '8px',
          color: '#000', fontSize: '0.75rem', fontWeight: 600, border: 'none', cursor: 'pointer',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Quality Order
        </button>
        <button style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.6rem 1rem', background: 'var(--bg-tertiary)', borderRadius: '8px',
          color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 500, border: '1px solid var(--border-color)', cursor: 'pointer',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
          </svg>
          Log Non-conformance
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// QUALITY TREND CHART
// ============================================================================

function QualityTrendChart({ qcTasks }: { qcTasks: any[] }) {
  const option: EChartsOption = useMemo(() => {
    // Group by week
    const weeklyData = new Map<string, { pass: number; fail: number; total: number }>();
    const now = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (i * 7));
      const key = `W${12 - i}`;
      weeklyData.set(key, { pass: 0, fail: 0, total: 0 });
    }
    
    // Simulate trend data from QC tasks
    qcTasks.forEach((qc, idx) => {
      const weekIdx = idx % 12;
      const key = `W${weekIdx + 1}`;
      const data = weeklyData.get(key);
      if (data) {
        data.total++;
        if (qc.qcStatus === 'Complete') {
          if ((qc.qcScore || 0) >= 80) data.pass++;
          else data.fail++;
        }
      }
    });

    const weeks = Array.from(weeklyData.keys());
    const passRates = weeks.map(w => {
      const d = weeklyData.get(w)!;
      return d.total > 0 ? Math.round((d.pass / d.total) * 100) : 85 + Math.random() * 10;
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
        data: weeks,
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } }
      },
      yAxis: {
        type: 'value',
        min: 60,
        max: 100,
        axisLabel: { color: 'var(--text-muted)', fontSize: 10, formatter: '{value}%' },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } }
      },
      series: [{
        name: 'Pass Rate',
        type: 'line',
        data: passRates,
        smooth: true,
        lineStyle: { color: '#10B981', width: 3 },
        areaStyle: { color: 'rgba(16,185,129,0.15)' },
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: '#10B981' },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#F59E0B', type: 'dashed', width: 2 },
          label: { show: true, formatter: 'Target 95%', position: 'end', color: '#F59E0B', fontSize: 10 },
          data: [{ yAxis: 95 }]
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
// INSPECTOR WORKLOAD CHART
// ============================================================================

function InspectorWorkloadChart({ qcTasks }: { qcTasks: any[] }) {
  const option: EChartsOption = useMemo(() => {
    // Group by inspector (simulated from task IDs)
    const inspectors = ['John D.', 'Sarah M.', 'Mike T.', 'Lisa K.', 'Tom R.'];
    const workload = inspectors.map(() => ({
      completed: Math.floor(Math.random() * 15) + 5,
      inProgress: Math.floor(Math.random() * 8) + 2,
      pending: Math.floor(Math.random() * 5) + 1,
    }));
    
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(22,27,34,0.95)', textStyle: { color: '#fff' } },
      legend: { bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
      grid: { left: 80, right: 20, top: 20, bottom: 50 },
      xAxis: {
        type: 'value',
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } }
      },
      yAxis: {
        type: 'category',
        data: inspectors,
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } }
      },
      series: [
        {
          name: 'Completed',
          type: 'bar',
          stack: 'total',
          data: workload.map(w => w.completed),
          itemStyle: { color: '#10B981', borderRadius: [0, 0, 0, 0] },
          barMaxWidth: 20
        },
        {
          name: 'In Progress',
          type: 'bar',
          stack: 'total',
          data: workload.map(w => w.inProgress),
          itemStyle: { color: '#F59E0B' },
          barMaxWidth: 20
        },
        {
          name: 'Pending',
          type: 'bar',
          stack: 'total',
          data: workload.map(w => w.pending),
          itemStyle: { color: '#6B7280', borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 20
        }
      ]
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

  // Calculate comprehensive stats
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
      openCAPA: Math.floor(tasks.reduce((sum, t) => sum + (t.qcCriticalErrors || 0), 0) * 0.8),
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Quality Control</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
              Inspections | Non-conformance | CAPA | Analytics
            </p>
          </div>
        </div>

        {/* View Tabs */}
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: '10px' }}>
          {[
            { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
            { key: 'orders', label: 'Quality Orders', icon: 'list' },
            { key: 'nonconformance', label: 'Non-conformance', icon: 'alert' },
            { key: 'capa', label: 'CAPA', icon: 'tool' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key as ViewType)}
              style={{
                padding: '0.5rem 1rem', borderRadius: '8px', border: 'none',
                background: activeView === tab.key ? 'var(--pinnacle-teal)' : 'transparent',
                color: activeView === tab.key ? '#000' : 'var(--text-secondary)',
                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
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
            <SectionCard title="Quality Trend" subtitle="Pass rate over time" accent="#10B981">
              <QualityTrendChart qcTasks={filteredQCTasks} />
            </SectionCard>
            <SectionCard title="Defect Distribution" subtitle="By severity">
              <DefectDistributionChart qcTasks={filteredQCTasks} />
            </SectionCard>
            <SectionCard title="Inspector Workload" subtitle="Tasks by inspector">
              <InspectorWorkloadChart qcTasks={filteredQCTasks} />
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
            <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '280px' }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input type="text" placeholder="Search orders..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2rem', fontSize: '0.85rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }} />
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
              <table style={{ width: '100%', minWidth: '1000px', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    {[
                      { key: 'qcTaskId', label: 'Order ID', align: 'left' },
                      { key: 'parentTask', label: 'Task', align: 'left' },
                      { key: 'type', label: 'Type', align: 'center' },
                      { key: 'priority', label: 'Priority', align: 'center' },
                      { key: 'qcHours', label: 'Hours', align: 'center' },
                      { key: 'qcScore', label: 'Score', align: 'center' },
                      { key: 'qcStatus', label: 'Status', align: 'center' },
                      { key: 'qcCriticalErrors', label: 'Critical', align: 'center' },
                      { key: 'qcNonCriticalErrors', label: 'Minor', align: 'center' },
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
                    const types = ['Inspection', 'Audit', 'Verification', 'Certification'];
                    const priorities = ['Critical', 'High', 'Medium', 'Low'];
                    const simType = types[idx % types.length];
                    const simPriority = priorities[idx % priorities.length];
                    const priorityColor = simPriority === 'Critical' ? '#EF4444' : simPriority === 'High' ? '#F59E0B' : simPriority === 'Medium' ? '#3B82F6' : '#6B7280';
                    
                    return (
                      <tr key={qc.qcTaskId} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: 'var(--pinnacle-teal)', fontWeight: 500 }}>{qc.qcTaskId}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={getTaskName(qc.parentTaskId)}>{getTaskName(qc.parentTaskId)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 500, background: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}>{simType}</span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 500, background: `${priorityColor}15`, color: priorityColor }}>{simPriority}</span>
                        </td>
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
                        <td onClick={() => startEdit(qc.qcTaskId, 'qcComments', qc.qcComments)} style={{ padding: '8px 12px', cursor: 'pointer', color: 'var(--text-secondary)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {editingCell?.taskId === qc.qcTaskId && editingCell?.field === 'qcComments' ? (
                            <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => saveEdit(qc)} onKeyDown={(e) => handleKeyPress(e, qc)} autoFocus style={{ width: '100%', padding: '4px 8px', fontSize: '0.8rem', background: 'var(--bg-tertiary)', border: '2px solid var(--pinnacle-teal)', borderRadius: '4px', color: 'var(--text-primary)' }} />
                          ) : (qc.qcComments || '—')}
                        </td>
                      </tr>
                    );
                  })}
                  {sortedQCTasks.length === 0 && (
                    <tr><td colSpan={10} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No quality orders found</td></tr>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            {[
              { label: 'Critical', value: stats.criticalNC, color: '#EF4444', icon: '!' },
              { label: 'Major', value: Math.floor(stats.minorNC * 0.6), color: '#F59E0B', icon: '' },
              { label: 'Minor', value: Math.floor(stats.minorNC * 0.4), color: '#3B82F6', icon: '' },
              { label: 'Open Total', value: stats.criticalNC + stats.minorNC, color: '#8B5CF6', icon: '' },
            ].map((item, idx) => (
              <div key={idx} style={{ background: `linear-gradient(135deg, ${item.color}15 0%, var(--bg-card) 100%)`, borderRadius: '16px', padding: '1.25rem', border: `1px solid ${item.color}30` }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{item.label}</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* NC Table */}
          <SectionCard title="Non-conformance Log" subtitle="Track and manage quality issues" noPadding>
            <div style={{ maxHeight: '400px', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>NC ID</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Order</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Severity</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Category</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Assigned</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedQCTasks.filter(q => (q.qcCriticalErrors || 0) > 0 || (q.qcNonCriticalErrors || 0) > 0).slice(0, 15).map((qc, idx) => {
                    const severity = (qc.qcCriticalErrors || 0) > 0 ? 'Critical' : 'Minor';
                    const sevColor = getSeverityColor(severity);
                    const categories = ['Process', 'Documentation', 'Equipment', 'Training', 'Material'];
                    const statuses = ['Open', 'Under Review', 'Resolved'];
                    const assignees = ['John D.', 'Sarah M.', 'Mike T.'];
                    return (
                      <tr key={`nc-${qc.qcTaskId}`} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: sevColor, fontWeight: 500 }}>NC-{String(idx + 1).padStart(4, '0')}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--pinnacle-teal)' }}>{qc.qcTaskId}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, background: `${sevColor}15`, color: sevColor }}>{severity}</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{categories[idx % categories.length]}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>{statuses[idx % statuses.length]}</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{assignees[idx % assignees.length]}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {new Date(Date.now() + (7 + idx) * 24 * 60 * 60 * 1000).toLocaleDateString()}
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

      {/* CAPA VIEW */}
      {activeView === 'capa' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* CAPA Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem' }}>
            {[
              { label: 'Planned', value: Math.floor(stats.openCAPA * 0.2), color: '#6B7280' },
              { label: 'In Progress', value: Math.floor(stats.openCAPA * 0.4), color: '#3B82F6' },
              { label: 'Verification', value: Math.floor(stats.openCAPA * 0.2), color: '#F59E0B' },
              { label: 'Complete', value: Math.floor(stats.openCAPA * 0.15), color: '#10B981' },
              { label: 'Overdue', value: Math.floor(stats.openCAPA * 0.05), color: '#EF4444' },
            ].map((item, idx) => (
              <div key={idx} style={{ background: `linear-gradient(135deg, ${item.color}15 0%, var(--bg-card) 100%)`, borderRadius: '16px', padding: '1rem', border: `1px solid ${item.color}30`, textAlign: 'center' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: item.color }}>{item.value}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '0.25rem' }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* CAPA Table */}
          <SectionCard title="Corrective & Preventive Actions" subtitle="Track resolution of quality issues" noPadding>
            <div style={{ maxHeight: '400px', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>CAPA ID</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>NC Reference</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Type</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Action</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Owner</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Due Date</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Effectiveness</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.max(stats.openCAPA, 8) }).map((_, idx) => {
                    const types = ['Corrective', 'Preventive'];
                    const statuses = ['Planned', 'In Progress', 'Verification', 'Complete'];
                    const actions = ['Update procedure', 'Retrain staff', 'Replace equipment', 'Implement check', 'Review process'];
                    const owners = ['John D.', 'Sarah M.', 'Mike T.', 'Lisa K.'];
                    const effectiveness = ['Effective', 'Partially Effective', 'Pending'];
                    const type = types[idx % types.length];
                    const status = statuses[idx % statuses.length];
                    const statusColor = status === 'Complete' ? '#10B981' : status === 'Verification' ? '#F59E0B' : status === 'In Progress' ? '#3B82F6' : '#6B7280';
                    const eff = status === 'Complete' ? effectiveness[idx % 2] : 'Pending';
                    const effColor = eff === 'Effective' ? '#10B981' : eff === 'Partially Effective' ? '#F59E0B' : '#6B7280';
                    
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#8B5CF6', fontWeight: 500 }}>CAPA-{String(idx + 1).padStart(4, '0')}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>NC-{String((idx % 10) + 1).padStart(4, '0')}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, background: type === 'Corrective' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)', color: type === 'Corrective' ? '#EF4444' : '#3B82F6' }}>{type}</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{actions[idx % actions.length]}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, background: `${statusColor}15`, color: statusColor }}>{status}</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{owners[idx % owners.length]}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {new Date(Date.now() + (14 + idx * 3) * 24 * 60 * 60 * 1000).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, background: `${effColor}15`, color: effColor }}>{eff}</span>
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
    </div>
  );
}
