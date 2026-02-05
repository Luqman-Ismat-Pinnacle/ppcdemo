'use client';

/**
 * @fileoverview Tasks - Operations Dashboard for PPC V3.
 * 
 * Comprehensive task management with all charts from hours and QC pages:
 * - Task status cards with inline expansion
 * - Task Hours Efficiency chart
 * - Quality Hours breakdown
 * - Labor distribution stacked bars
 * - QC Transaction by Gate
 * - QC Pass/Fail distribution
 * - All visuals have click-to-expand inline details
 * 
 * @module app/insights/tasks/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import TaskHoursEfficiencyChart from '@/components/charts/TaskHoursEfficiencyChart';
import QualityHoursChart from '@/components/charts/QualityHoursChart';
import LaborBreakdownChart from '@/components/charts/LaborBreakdownChart';
import QCTransactionBarChart from '@/components/charts/QCTransactionBarChart';
import QCStackedBarChart from '@/components/charts/QCStackedBarChart';
import QCScatterChart from '@/components/charts/QCScatterChart';
import type { EChartsOption } from 'echarts';

// ===== EXPANDABLE SECTION =====
function ExpandableSection({ isExpanded, children }: { isExpanded: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      maxHeight: isExpanded ? '1500px' : '0',
      overflow: 'hidden',
      transition: 'max-height 0.3s ease-in-out',
    }}>
      {children}
    </div>
  );
}

// ===== CLICKABLE CHART CARD =====
function ChartCardExpandable({ 
  title, 
  subtitle,
  isExpanded,
  onToggle,
  children,
  expandedContent,
  rightContent,
}: { 
  title: string; 
  subtitle?: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  expandedContent?: React.ReactNode;
  rightContent?: React.ReactNode;
}) {
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
          padding: '1rem 1.25rem', 
          borderBottom: '1px solid var(--border-color)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          cursor: 'pointer',
        }}
        onClick={onToggle}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>{title}</h3>
          {subtitle && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{subtitle}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {rightContent}
          <svg 
            width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"
            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          >
            <polyline points="6,9 12,15 18,9" />
          </svg>
        </div>
      </div>
      <div style={{ padding: '1rem' }}>
        {children}
      </div>
      <ExpandableSection isExpanded={isExpanded}>
        {expandedContent && (
          <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--border-color)' }}>
            {expandedContent}
          </div>
        )}
      </ExpandableSection>
    </div>
  );
}

// ===== STATUS CARD WITH CLICK =====
function StatusCard({ 
  title, 
  value, 
  subtitle,
  color,
  icon,
  onClick,
  isActive,
}: { 
  title: string; 
  value: number; 
  subtitle?: string;
  color: string;
  icon: React.ReactNode;
  onClick?: () => void;
  isActive?: boolean;
}) {
  return (
    <div 
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        padding: '1.25rem',
        border: `1px solid ${isActive ? color : 'var(--border-color)'}`,
        borderTop: `4px solid ${color}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{title}</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
          {subtitle && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{subtitle}</div>}
        </div>
        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
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
  
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [laborView, setLaborView] = useState<'chargeCode' | 'project' | 'role'>('chargeCode');

  // Context label
  const contextLabel = useMemo(() => {
    if (hierarchyFilters?.project) return `Project: ${hierarchyFilters.project}`;
    if (hierarchyFilters?.seniorManager) return `Portfolio: ${hierarchyFilters.seniorManager}`;
    return 'All Projects';
  }, [hierarchyFilters]);

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

  // Hours by project for breakdown
  const hoursByProject = useMemo(() => {
    const tasks = data.tasks || [];
    const projectMap = new Map<string, { planned: number; actual: number; tasks: number }>();
    
    tasks.forEach((t: any) => {
      const project = t.projectName || t.project_name || t.projectId || 'Unknown';
      if (!projectMap.has(project)) projectMap.set(project, { planned: 0, actual: 0, tasks: 0 });
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
      }))
      .sort((a, b) => b.planned - a.planned);
  }, [data.tasks]);

  // QC data
  const qcData = useMemo(() => {
    const qcByName = data.qcByNameAndRole || [];
    const gates = data.qcTransactionByGate || [];
    
    const totalClosed = qcByName.reduce((sum: number, q: any) => sum + (q.closedCount || 0), 0);
    const totalPassed = qcByName.reduce((sum: number, q: any) => sum + (q.passCount || 0), 0);
    const passRate = totalClosed > 0 ? Math.round((totalPassed / totalClosed) * 100) : 0;

    return { passRate, totalClosed, totalPassed, gates, byAnalyst: qcByName };
  }, [data.qcByNameAndRole, data.qcTransactionByGate]);

  // Labor breakdown data
  const laborData = useMemo(() => {
    const workers = data.laborBreakdown?.byWorker || [];
    const weeks = data.laborBreakdown?.weeks || [];
    
    if (!workers.length || !weeks.length) return { months: [], dataByCategory: {} };
    
    const months = weeks.map((w: string) => {
      try {
        return new Date(w).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } catch { return w; }
    });

    const groupBy = laborView === 'chargeCode' ? 'chargeCode' : laborView === 'role' ? 'role' : 'project';
    const categories = [...new Set(workers.map((w: any) => w[groupBy]).filter(Boolean))];
    
    const dataByCategory: Record<string, number[]> = {};
    categories.forEach((cat: string) => {
      dataByCategory[cat] = new Array(months.length).fill(0);
      workers.filter((w: any) => w[groupBy] === cat).forEach((w: any) => {
        (w.data || []).forEach((val: number, idx: number) => {
          if (idx < dataByCategory[cat].length) {
            dataByCategory[cat][idx] += val || 0;
          }
        });
      });
    });

    return { months, dataByCategory };
  }, [data.laborBreakdown, laborView]);

  // Filtered tasks
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
    
    return tasks;
  }, [data.tasks, searchTerm, statusFilter]);

  // Chart click handlers
  const handleBarClick = useCallback((params: { name: string }) => {
    const task = (data.tasks || []).find((t: any) => 
      (t.name || t.taskName) === params.name || t.projectName === params.name
    );
    if (task) setSelectedTask(task);
  }, [data.tasks]);

  const toggleChart = (chartId: string) => {
    setExpandedChart(expandedChart === chartId ? null : chartId);
  };

  return (
    <div className="page-panel insights-page">
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--pinnacle-teal)', fontWeight: 600, marginBottom: '0.25rem' }}>{contextLabel}</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Tasks</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          {taskStats.total} tasks | {taskStats.hoursEfficiency}% efficiency
        </p>
      </div>

      {/* Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <StatusCard
          title="Total Tasks"
          value={taskStats.total}
          subtitle={`${taskStats.overallProgress}% complete`}
          color="#3B82F6"
          isActive={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
        />
        <StatusCard
          title="Completed"
          value={taskStats.completed}
          color="#10B981"
          isActive={statusFilter === 'completed'}
          onClick={() => setStatusFilter('completed')}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22,4 12,14.01 9,11.01" /></svg>}
        />
        <StatusCard
          title="In Progress"
          value={taskStats.inProgress}
          color="#F59E0B"
          isActive={statusFilter === 'inProgress'}
          onClick={() => setStatusFilter('inProgress')}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" /></svg>}
        />
        <StatusCard
          title="Blocked"
          value={taskStats.blocked}
          color="#EF4444"
          isActive={statusFilter === 'blocked'}
          onClick={() => setStatusFilter('blocked')}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>}
        />
      </div>

      {/* Progress Bar */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '0.75rem 1rem', border: '1px solid var(--border-color)', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Overall Progress</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--pinnacle-teal)' }}>{taskStats.overallProgress}%</span>
        </div>
        <ProgressBar value={taskStats.overallProgress} />
      </div>

      {/* Selected Task Detail (Inline) */}
      {selectedTask && (
        <div style={{ 
          background: 'linear-gradient(135deg, rgba(64, 224, 208, 0.1) 0%, rgba(205, 220, 57, 0.05) 100%)', 
          borderRadius: '12px', 
          padding: '1rem', 
          marginBottom: '1.25rem',
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
            <div><span style={{ color: 'var(--text-muted)' }}>Planned:</span> <strong>{selectedTask.baselineHours || selectedTask.budgetHours || 0} hrs</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Actual:</span> <strong style={{ color: (selectedTask.actualHours || 0) > (selectedTask.baselineHours || 0) ? '#EF4444' : '#10B981' }}>{selectedTask.actualHours || 0} hrs</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Progress:</span> <strong>{selectedTask.percentComplete || 0}%</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Start:</span> <strong>{selectedTask.startDate ? new Date(selectedTask.startDate).toLocaleDateString() : 'N/A'}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Finish:</span> <strong>{selectedTask.finishDate ? new Date(selectedTask.finishDate).toLocaleDateString() : 'N/A'}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Priority:</span> <strong>{selectedTask.priority || 'Medium'}</strong></div>
          </div>
        </div>
      )}

      {/* Task Hours Efficiency */}
      <div style={{ marginBottom: '1.25rem' }}>
        <ChartCardExpandable
          title="Task Hours Efficiency"
          subtitle="Actual vs estimated hours by task"
          isExpanded={expandedChart === 'efficiency'}
          onToggle={() => toggleChart('efficiency')}
          rightContent={
            <span style={{
              padding: '4px 10px',
              borderRadius: '12px',
              background: taskStats.hoursEfficiency <= 100 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: taskStats.hoursEfficiency <= 100 ? '#10B981' : '#EF4444',
              fontWeight: 700,
              fontSize: '0.8rem',
            }}>
              {taskStats.hoursEfficiency}%
            </span>
          }
          expandedContent={
            <div style={{ paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.75rem' }}>By Project Breakdown</div>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead><tr><th>Project</th><th className="number">Tasks</th><th className="number">Planned</th><th className="number">Actual</th><th className="number">Variance</th></tr></thead>
                <tbody>
                  {hoursByProject.slice(0, 6).map((p, idx) => (
                    <tr key={idx}>
                      <td>{p.name}</td>
                      <td className="number">{p.tasks}</td>
                      <td className="number">{p.planned.toLocaleString()}</td>
                      <td className="number">{p.actual.toLocaleString()}</td>
                      <td className="number" style={{ color: p.variance <= 0 ? '#10B981' : '#EF4444', fontWeight: 600 }}>{p.variance > 0 ? '+' : ''}{p.variance}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        >
          <TaskHoursEfficiencyChart
            data={data.taskHoursEfficiency || { tasks: [], actualWorked: [], estimatedAdded: [], efficiency: [], project: [] }}
            height={280}
            onBarClick={handleBarClick}
            activeFilters={[]}
          />
        </ChartCardExpandable>
      </div>

      {/* Quality Hours */}
      <div style={{ marginBottom: '1.25rem' }}>
        <ChartCardExpandable
          title="Quality Hours by Charge Code"
          subtitle="QC hours breakdown per task"
          isExpanded={expandedChart === 'quality'}
          onToggle={() => toggleChart('quality')}
          expandedContent={
            <div style={{ paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.75rem' }}>QC Hours Detail</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Total QC Pass Rate</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: qcData.passRate >= 90 ? '#10B981' : '#F59E0B' }}>{qcData.passRate}%</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>QC Transactions</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{qcData.totalClosed}</div>
                </div>
              </div>
            </div>
          }
        >
          <QualityHoursChart
            data={data.qualityHours || { tasks: [], categories: [], data: [], qcPercent: [], poorQualityPercent: [], project: [] }}
            taskOrder={data.taskHoursEfficiency?.tasks}
            height={280}
            onBarClick={handleBarClick}
            activeFilters={[]}
          />
        </ChartCardExpandable>
      </div>

      {/* Labor Distribution */}
      <div style={{ marginBottom: '1.25rem' }}>
        <ChartCardExpandable
          title="Labor Hours Distribution"
          subtitle="Weekly hours by category"
          isExpanded={expandedChart === 'labor'}
          onToggle={() => toggleChart('labor')}
          rightContent={
            <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '2px' }} onClick={e => e.stopPropagation()}>
              {(['chargeCode', 'project', 'role'] as const).map(view => (
                <button
                  key={view}
                  onClick={() => setLaborView(view)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    background: laborView === view ? 'var(--pinnacle-teal)' : 'transparent',
                    color: laborView === view ? '#000' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  {view === 'chargeCode' ? 'Charge Code' : view === 'project' ? 'Project' : 'Role'}
                </button>
              ))}
            </div>
          }
          expandedContent={
            <div style={{ paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.75rem' }}>Category Totals</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {Object.entries(laborData.dataByCategory).slice(0, 8).map(([cat, values]) => {
                  const total = (values as number[]).reduce((a, b) => a + b, 0);
                  return (
                    <div key={cat} style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{cat}</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{Math.round(total).toLocaleString()} hrs</div>
                    </div>
                  );
                })}
              </div>
            </div>
          }
        >
          <LaborBreakdownChart
            months={laborData.months}
            dataByCategory={laborData.dataByCategory}
            height={280}
            onBarClick={handleBarClick}
            activeFilters={[]}
          />
        </ChartCardExpandable>
      </div>

      {/* QC Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
        <ChartCardExpandable
          title="QC Transaction by Gate"
          subtitle={`${qcData.gates.length} gates`}
          isExpanded={expandedChart === 'qcGate'}
          onToggle={() => toggleChart('qcGate')}
          expandedContent={
            <div style={{ paddingTop: '1rem' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead><tr><th>Gate</th><th className="number">Count</th></tr></thead>
                <tbody>
                  {(qcData.gates || []).map((g: any, idx: number) => (
                    <tr key={idx}><td>{g.gate}</td><td className="number">{g.count}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        >
          <QCTransactionBarChart
            data={qcData.gates || []}
            height="200px"
            showLabels={true}
            onBarClick={handleBarClick}
            activeFilters={[]}
          />
        </ChartCardExpandable>

        <ChartCardExpandable
          title="QC Pass/Fail Distribution"
          subtitle={`${qcData.passRate}% pass rate`}
          isExpanded={expandedChart === 'qcStatus'}
          onToggle={() => toggleChart('qcStatus')}
          rightContent={
            <span style={{
              padding: '4px 10px',
              borderRadius: '12px',
              background: qcData.passRate >= 90 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: qcData.passRate >= 90 ? '#10B981' : '#F59E0B',
              fontWeight: 700,
              fontSize: '0.8rem',
            }}>
              {qcData.passRate}%
            </span>
          }
          expandedContent={
            <div style={{ paddingTop: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', color: '#10B981' }}>Passed</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10B981' }}>{qcData.totalPassed}</div>
                </div>
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', color: '#EF4444' }}>Failed</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#EF4444' }}>{qcData.totalClosed - qcData.totalPassed}</div>
                </div>
              </div>
            </div>
          }
        >
          <QCStackedBarChart
            data={(data.qcByGateStatus || []).map((g: any) => ({
              projectId: g.gate,
              customer: '',
              site: '',
              unprocessed: g.unprocessed || 0,
              pass: g.pass || 0,
              fail: g.fail || 0,
              portfolio: '',
            }))}
            height="200px"
            onBarClick={handleBarClick}
            activeFilters={[]}
          />
        </ChartCardExpandable>
      </div>

      {/* Analyst Performance */}
      <div style={{ marginBottom: '1.25rem' }}>
        <ChartCardExpandable
          title="Analyst Performance"
          subtitle="Records vs Pass Rate"
          isExpanded={expandedChart === 'analyst'}
          onToggle={() => toggleChart('analyst')}
          expandedContent={
            <div style={{ paddingTop: '1rem' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead><tr><th>Analyst</th><th>Role</th><th className="number">Closed</th><th className="number">Passed</th><th className="number">Pass Rate</th></tr></thead>
                <tbody>
                  {(qcData.byAnalyst || []).slice(0, 8).map((a: any, idx: number) => (
                    <tr key={idx}>
                      <td>{a.name}</td>
                      <td>{a.role || '-'}</td>
                      <td className="number">{a.closedCount || 0}</td>
                      <td className="number">{a.passCount || 0}</td>
                      <td className="number" style={{ fontWeight: 600, color: (a.passRate || 0) >= 90 ? '#10B981' : '#F59E0B' }}>
                        {typeof a.passRate === 'number' ? `${a.passRate.toFixed(1)}%` : '0%'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        >
          <QCScatterChart
            data={qcData.byAnalyst || []}
            labelField="name"
            height="220px"
            onPointClick={handleBarClick}
            activeFilters={[]}
          />
        </ChartCardExpandable>
      </div>

      {/* Task Table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0, marginRight: 'auto' }}>Task Details ({filteredTasks.length})</h3>
          
          <div style={{ position: 'relative' }}>
            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '6px 10px 6px 32px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem', width: '160px' }} />
            <svg style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </div>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="inProgress">In Progress</option>
            <option value="blocked">Blocked</option>
            <option value="notStarted">Not Started</option>
          </select>
        </div>

        <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
          <table className="data-table" style={{ fontSize: '0.8rem' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)' }}>
              <tr>
                <th>Task</th>
                <th>Project</th>
                <th>Assignee</th>
                <th>Status</th>
                <th className="number">Planned</th>
                <th className="number">Actual</th>
                <th className="number">% Complete</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.slice(0, 50).map((task: any, idx: number) => {
                const pc = task.percentComplete || 0;
                const isOverBudget = (task.actualHours || 0) > (task.baselineHours || task.budgetHours || Infinity);
                const isSelected = selectedTask?.id === task.id || selectedTask?.name === task.name;
                
                return (
                  <tr 
                    key={idx} 
                    onClick={() => setSelectedTask(task)}
                    style={{ cursor: 'pointer', background: isSelected ? 'rgba(64, 224, 208, 0.1)' : 'transparent' }}
                  >
                    <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name || task.taskName || '-'}</td>
                    <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.projectName || task.project_name || '-'}</td>
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
                    <td className="number">{task.baselineHours || task.budgetHours || 0}</td>
                    <td className="number" style={{ color: isOverBudget ? '#EF4444' : 'inherit' }}>{task.actualHours || 0}</td>
                    <td className="number">{pc}%</td>
                  </tr>
                );
              })}
              {filteredTasks.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No tasks found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
