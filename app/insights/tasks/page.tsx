'use client';

/**
 * @fileoverview Tasks - Comprehensive Operations Dashboard for PPC V3.
 * 
 * Includes ALL data from legacy hours and QC pages:
 * - Command Center with status breakdown
 * - Task Flow Sankey
 * - Task Hours Efficiency (full width, scrollable)
 * - Quality Hours by Charge Code
 * - Labor Distribution with view toggle
 * - Hours Variance Waterfall
 * - QC Transaction by Gate
 * - QC Pass/Fail Distribution
 * - Analyst Performance scatter
 * - Labor Breakdown tables (by Worker, by Role)
 * - Detailed task table with search/filter
 * 
 * All visuals sized for large datasets with scroll/zoom.
 * 
 * @module app/insights/tasks/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import TaskHoursEfficiencyChart from '@/components/charts/TaskHoursEfficiencyChart';
import QualityHoursChart from '@/components/charts/QualityHoursChart';
import LaborBreakdownChart from '@/components/charts/LaborBreakdownChart';
import HoursWaterfallChart from '@/components/charts/HoursWaterfallChart';
import NonExecutePieChart from '@/components/charts/NonExecutePieChart';
import QCTransactionBarChart from '@/components/charts/QCTransactionBarChart';
import QCStackedBarChart from '@/components/charts/QCStackedBarChart';
import QCScatterChart from '@/components/charts/QCScatterChart';
import QCPassRateLineChart from '@/components/charts/QCPassRateLineChart';
import type { EChartsOption } from 'echarts';

// ===== COMMAND CENTER =====
function CommandCenter({ stats, onFilterChange, activeFilter }: { 
  stats: any;
  onFilterChange: (filter: string) => void;
  activeFilter: string;
}) {
  const segments = [
    { key: 'completed', label: 'Complete', value: stats.completed, color: '#10B981' },
    { key: 'inProgress', label: 'Active', value: stats.inProgress, color: '#3B82F6' },
    { key: 'blocked', label: 'Blocked', value: stats.blocked, color: '#EF4444' },
    { key: 'notStarted', label: 'Pending', value: stats.notStarted, color: '#6B7280' },
  ];
  
  const total = stats.total || 1;
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)',
      borderRadius: '20px',
      padding: '1.25rem',
      border: '1px solid var(--border-color)',
      display: 'flex',
      alignItems: 'center',
      gap: '1.5rem',
      flexWrap: 'wrap',
    }}>
      {/* Radial Progress */}
      <div style={{ position: 'relative', width: '140px', height: '140px', flexShrink: 0 }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-tertiary)" strokeWidth="8" />
          {segments.map((seg, idx) => {
            const circumference = 2 * Math.PI * 42;
            const strokeLength = (seg.value / total) * circumference;
            const offset = segments.slice(0, idx).reduce((acc, s) => acc + (s.value / total) * circumference, 0);
            return (
              <circle key={seg.key} cx="50" cy="50" r="42" fill="none" stroke={seg.color}
                strokeWidth={activeFilter === seg.key ? 12 : 8}
                strokeDasharray={`${strokeLength} ${circumference}`}
                strokeDashoffset={-offset}
                style={{ cursor: 'pointer', transition: 'stroke-width 0.2s' }}
                onClick={() => onFilterChange(activeFilter === seg.key ? 'all' : seg.key)}
              />
            );
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--pinnacle-teal)' }}>{stats.overallProgress}%</span>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>COMPLETE</span>
        </div>
      </div>
      
      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', flex: 1, minWidth: '200px' }}>
        {segments.map(seg => (
          <div key={seg.key} onClick={() => onFilterChange(activeFilter === seg.key ? 'all' : seg.key)}
            style={{
              background: activeFilter === seg.key ? `${seg.color}15` : 'rgba(255,255,255,0.03)',
              borderRadius: '10px', padding: '0.6rem 0.8rem',
              border: `1px solid ${activeFilter === seg.key ? seg.color : 'transparent'}`,
              cursor: 'pointer',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: seg.color }} />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{seg.label}</span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: seg.color }}>{seg.value}</div>
          </div>
        ))}
      </div>
      
      {/* Key Metrics */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', minWidth: '90px' }}>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Efficiency</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stats.efficiency <= 100 ? '#10B981' : '#EF4444' }}>{stats.efficiency}%</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', minWidth: '90px' }}>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>QC Pass</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stats.qcPassRate >= 90 ? '#10B981' : '#F59E0B' }}>{stats.qcPassRate}%</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', minWidth: '90px' }}>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Hours</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--pinnacle-teal)' }}>{stats.totalHours.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

// ===== TASK FLOW SANKEY =====
function TaskFlowSankey({ stats }: { stats: any }) {
  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff', fontSize: 11 } },
    series: [{
      type: 'sankey',
      layout: 'none',
      emphasis: { focus: 'adjacency' },
      nodeAlign: 'left',
      nodeWidth: 20,
      nodeGap: 14,
      layoutIterations: 0,
      label: { color: 'var(--text-primary)', fontSize: 11, formatter: (p: any) => `${p.name}\n${p.value || 0}` },
      lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.35 },
      data: [
        { name: 'Backlog', itemStyle: { color: '#6B7280' } },
        { name: 'Active', itemStyle: { color: '#3B82F6' } },
        { name: 'Review', itemStyle: { color: '#8B5CF6' } },
        { name: 'Complete', itemStyle: { color: '#10B981' } },
        { name: 'Blocked', itemStyle: { color: '#EF4444' } },
      ],
      links: [
        { source: 'Backlog', target: 'Active', value: Math.max(1, Math.round(stats.notStarted * 0.6)) },
        { source: 'Active', target: 'Review', value: Math.max(1, Math.round(stats.inProgress * 0.5)) },
        { source: 'Review', target: 'Complete', value: Math.max(1, stats.completed) },
        { source: 'Backlog', target: 'Blocked', value: Math.max(1, Math.round(stats.blocked * 0.3)) },
        { source: 'Active', target: 'Blocked', value: Math.max(1, Math.round(stats.blocked * 0.7)) },
      ],
    }],
  }), [stats]);

  return <ChartWrapper option={option} height="180px" />;
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

export default function TasksPage() {
  const { filteredData, hierarchyFilters } = useData();
  const data = filteredData;
  
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [laborView, setLaborView] = useState<'chargeCode' | 'project' | 'role'>('chargeCode');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [activeSection, setActiveSection] = useState<string>('hours');

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

    const qcByName = data.qcByNameAndRole || [];
    const totalClosed = qcByName.reduce((sum: number, q: any) => sum + (q.closedCount || 0), 0);
    const totalPassed = qcByName.reduce((sum: number, q: any) => sum + (q.passCount || 0), 0);
    const qcPassRate = totalClosed > 0 ? Math.round((totalPassed / totalClosed) * 100) : 0;

    return { 
      total: tasks.length, completed, inProgress, blocked, notStarted, 
      overallProgress: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
      efficiency: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 100,
      totalHours: Math.round(totalActual),
      qcPassRate,
    };
  }, [data.tasks, data.qcByNameAndRole]);

  // Labor breakdown data
  const laborData = useMemo(() => {
    const workers = data.laborBreakdown?.byWorker || [];
    const weeks = data.laborBreakdown?.weeks || [];
    if (!workers.length || !weeks.length) return { months: [], dataByCategory: {} };
    
    const months = weeks.map((w: string) => {
      try { return new Date(w).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return w; }
    });

    const groupBy = laborView === 'chargeCode' ? 'chargeCode' : laborView === 'role' ? 'role' : 'project';
    const categories = [...new Set(workers.map((w: any) => w[groupBy]).filter(Boolean))];
    
    const dataByCategory: Record<string, number[]> = {};
    categories.forEach((cat: string) => {
      dataByCategory[cat] = new Array(months.length).fill(0);
      workers.filter((w: any) => w[groupBy] === cat).forEach((w: any) => {
        (w.data || []).forEach((val: number, idx: number) => {
          if (idx < dataByCategory[cat].length) dataByCategory[cat][idx] += val || 0;
        });
      });
    });
    return { months, dataByCategory };
  }, [data.laborBreakdown, laborView]);

  // Labor by worker for table
  const laborByWorker = useMemo(() => {
    const workers = data.laborBreakdown?.byWorker || [];
    return workers.map((w: any) => ({
      name: w.name,
      role: w.role,
      project: w.project,
      total: w.total || (w.data || []).reduce((a: number, b: number) => a + b, 0),
      data: w.data || [],
    })).sort((a: any, b: any) => b.total - a.total);
  }, [data.laborBreakdown]);

  // Labor weeks for table headers
  const laborWeeks = useMemo(() => data.laborBreakdown?.weeks || [], [data.laborBreakdown]);

  // QC data
  const qcGates = useMemo(() => data.qcTransactionByGate || [], [data.qcTransactionByGate]);
  const qcByGateStatus = useMemo(() => (data.qcByGateStatus || []).map((g: any) => ({
    projectId: g.gate, customer: '', site: '', unprocessed: g.unprocessed || 0, pass: g.pass || 0, fail: g.fail || 0, portfolio: '',
  })), [data.qcByGateStatus]);
  const qcByAnalyst = useMemo(() => data.qcByNameAndRole || [], [data.qcByNameAndRole]);

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
    <div className="page-panel insights-page" style={{ paddingBottom: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--pinnacle-teal)', fontWeight: 600 }}>{contextLabel}</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.25rem 0' }}>Task Operations</h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Hours, labor, quality control, and task management</p>
      </div>

      {/* Command Center */}
      <div style={{ marginBottom: '1.25rem' }}>
        <CommandCenter stats={taskStats} onFilterChange={setStatusFilter} activeFilter={statusFilter} />
      </div>

      {/* Section Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[
          { id: 'hours', label: 'Hours & Labor' },
          { id: 'qc', label: 'Quality Control' },
          { id: 'tasks', label: 'Task Details' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveSection(tab.id)} style={{
            padding: '0.5rem 1rem', borderRadius: '8px', border: `1px solid ${activeSection === tab.id ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
            background: activeSection === tab.id ? 'rgba(64,224,208,0.1)' : 'transparent',
            color: activeSection === tab.id ? 'var(--pinnacle-teal)' : 'var(--text-secondary)',
            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
          }}>{tab.label}</button>
        ))}
      </div>

      {/* Selected Task Detail */}
      {selectedTask && (
        <div style={{ background: 'linear-gradient(135deg, rgba(64,224,208,0.1) 0%, rgba(205,220,57,0.05) 100%)', borderRadius: '12px', padding: '1rem', marginBottom: '1rem', border: '1px solid var(--pinnacle-teal)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>{selectedTask.name || selectedTask.taskName}</h4>
            <button onClick={() => setSelectedTask(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', fontSize: '0.8rem' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Project:</span> <strong>{selectedTask.projectName || '-'}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Assignee:</span> <strong>{selectedTask.assignedResource || selectedTask.assignedTo || '-'}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Status:</span> <strong>{selectedTask.status || '-'}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Planned:</span> <strong>{selectedTask.baselineHours || 0} hrs</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Actual:</span> <strong style={{ color: (selectedTask.actualHours || 0) > (selectedTask.baselineHours || 0) ? '#EF4444' : '#10B981' }}>{selectedTask.actualHours || 0} hrs</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Progress:</span> <strong>{selectedTask.percentComplete || 0}%</strong></div>
          </div>
        </div>
      )}

      {/* HOURS & LABOR SECTION */}
      {activeSection === 'hours' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Task Flow */}
          <SectionCard title="Task Flow" subtitle="Lifecycle progression">
            <TaskFlowSankey stats={taskStats} />
          </SectionCard>

          {/* Task Hours Efficiency - Full Width, Large */}
          <SectionCard title="Task Hours Efficiency" subtitle="Actual vs Estimated hours by task">
            <div style={{ height: '400px', overflowX: 'auto' }}>
              <TaskHoursEfficiencyChart
                data={data.taskHoursEfficiency || { tasks: [], actualWorked: [], estimatedAdded: [], efficiency: [], project: [] }}
                height={380}
                onBarClick={(p: any) => { const t = (data.tasks || []).find((t: any) => t.name === p.name); if (t) setSelectedTask(t); }}
                activeFilters={[]}
              />
            </div>
          </SectionCard>

          {/* Quality Hours - Full Width */}
          <SectionCard title="Quality Hours by Charge Code" subtitle="QC hours breakdown per task">
            <div style={{ height: '350px', overflowX: 'auto' }}>
              <QualityHoursChart
                data={data.qualityHours || { tasks: [], categories: [], data: [], qcPercent: [], poorQualityPercent: [], project: [] }}
                taskOrder={data.taskHoursEfficiency?.tasks}
                height={330}
                onBarClick={() => {}}
                activeFilters={[]}
              />
            </div>
          </SectionCard>

          {/* Labor Distribution - Full Width with View Toggle */}
          <SectionCard 
            title="Labor Hours Distribution" 
            subtitle="Weekly hours breakdown"
            headerRight={
              <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '2px' }}>
                {(['chargeCode', 'project', 'role'] as const).map(v => (
                  <button key={v} onClick={() => setLaborView(v)} style={{
                    padding: '4px 10px', fontSize: '0.7rem', fontWeight: 600,
                    background: laborView === v ? 'var(--pinnacle-teal)' : 'transparent',
                    color: laborView === v ? '#000' : 'var(--text-secondary)',
                    border: 'none', borderRadius: '4px', cursor: 'pointer',
                  }}>{v === 'chargeCode' ? 'Charge Code' : v === 'project' ? 'Project' : 'Role'}</button>
                ))}
              </div>
            }
          >
            <div style={{ height: '350px' }}>
              <LaborBreakdownChart months={laborData.months} dataByCategory={laborData.dataByCategory} height={330} onBarClick={() => {}} activeFilters={[]} />
            </div>
          </SectionCard>

          {/* Hours Waterfall - Full Width */}
          <SectionCard title="Hours Variance Waterfall" subtitle="Cumulative variance analysis">
            <div style={{ height: '400px' }}>
              <HoursWaterfallChart data={data.taskHoursEfficiency || { tasks: [], actualWorked: [], estimatedAdded: [], efficiency: [], project: [] }} height={380} />
            </div>
          </SectionCard>

          {/* Non-Execute Hours */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <SectionCard title="TPW Comparison" subtitle="TPW vs Execute vs Non-Execute">
              <div style={{ height: '280px' }}>
                <NonExecutePieChart data={data.nonExecuteHours?.tpwComparison || []} height={260} showLabels={true} visualId="tpw" enableCompare={false} />
              </div>
            </SectionCard>
            <SectionCard title="TPW by Charge Code" subtitle="Other breakdown">
              <div style={{ height: '280px' }}>
                <NonExecutePieChart data={data.nonExecuteHours?.otherBreakdown || []} height={260} showLabels={true} visualId="other" enableCompare={false} />
              </div>
            </SectionCard>
          </div>

          {/* Labor Breakdown by Worker Table */}
          <SectionCard title="Labor Breakdown by Worker" subtitle={`${laborByWorker.length} workers`} noPadding>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 2 }}>Worker</th>
                    <th>Role</th>
                    <th>Project</th>
                    {laborWeeks.slice(0, 8).map((w: string, i: number) => <th key={i} className="number" style={{ minWidth: '60px' }}>{new Date(w).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</th>)}
                    <th className="number" style={{ fontWeight: 700 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {laborByWorker.slice(0, 50).map((w: any, idx: number) => (
                    <tr key={idx}>
                      <td style={{ position: 'sticky', left: 0, background: 'var(--bg-primary)', fontWeight: 500 }}>{w.name}</td>
                      <td>{w.role}</td>
                      <td>{w.project}</td>
                      {(w.data || []).slice(0, 8).map((h: number, i: number) => <td key={i} className="number" style={{ color: h > 40 ? '#F59E0B' : 'inherit' }}>{h?.toFixed(1) || '0'}</td>)}
                      <td className="number" style={{ fontWeight: 600, color: 'var(--pinnacle-teal)' }}>{w.total?.toFixed(1) || '0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}

      {/* QC SECTION */}
      {activeSection === 'qc' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* QC by Gate and Pass/Fail */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <SectionCard title="QC Transaction by Gate" subtitle={`${qcGates.length} gates`}>
              <div style={{ height: '280px' }}>
                <QCTransactionBarChart data={qcGates} height="260px" showLabels={true} onBarClick={() => {}} activeFilters={[]} />
              </div>
            </SectionCard>
            <SectionCard title="QC Pass/Fail Distribution" subtitle={`${taskStats.qcPassRate}% pass rate`}>
              <div style={{ height: '280px' }}>
                <QCStackedBarChart data={qcByGateStatus} height="260px" onBarClick={() => {}} activeFilters={[]} />
              </div>
            </SectionCard>
          </div>

          {/* Analyst Performance - Full Width */}
          <SectionCard title="Analyst Performance" subtitle="Records vs Pass Rate">
            <div style={{ height: '320px' }}>
              <QCScatterChart data={qcByAnalyst} labelField="name" height="300px" onPointClick={() => {}} activeFilters={[]} />
            </div>
          </SectionCard>

          {/* QC Pass Rate Over Time */}
          <SectionCard title="QC Pass Rate Trend" subtitle="Monthly pass rate">
            <div style={{ height: '280px' }}>
              <QCPassRateLineChart data={data.qcPassRatePerMonth || []} height="260px" onPointClick={() => {}} activeFilters={[]} />
            </div>
          </SectionCard>

          {/* QC by Analyst Table */}
          <SectionCard title="Individual QPCI Measures Performance" subtitle={`${qcByAnalyst.length} analysts`} noPadding>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                  <tr>
                    <th>Employee</th>
                    <th>Role</th>
                    <th className="number">QC Pass Rate</th>
                    <th className="number">Open</th>
                    <th className="number">Closed</th>
                    <th className="number">Passed</th>
                  </tr>
                </thead>
                <tbody>
                  {qcByAnalyst.sort((a: any, b: any) => b.passRate - a.passRate).map((a: any, idx: number) => (
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
        <div>
          <SectionCard 
            title={`All Tasks (${filteredTasks.length})`} 
            subtitle="Click any row for details"
            headerRight={
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ padding: '6px 10px 6px 32px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem', width: '180px' }} />
                  <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                </div>
                {statusFilter !== 'all' && (
                  <button onClick={() => setStatusFilter('all')} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--pinnacle-teal)', background: 'rgba(64,224,208,0.1)', color: 'var(--pinnacle-teal)', fontSize: '0.75rem', cursor: 'pointer' }}>
                    {statusFilter} ×
                  </button>
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
        </div>
      )}
    </div>
  );
}
