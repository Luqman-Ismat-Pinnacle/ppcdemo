'use client';

/**
 * @fileoverview Executive Briefing - Overview Page for PPC V3.
 * 
 * Project-based executive dashboard with drill-down capabilities:
 * - All metrics aggregate based on hierarchy filter (company -> portfolio -> project)
 * - Click any section to see detailed project-level breakdown
 * - Progressive disclosure from summary to details
 * 
 * @module app/insights/overview/page
 */

import React, { useMemo, useState } from 'react';
import { useData } from '@/lib/data-context';
import { VarianceTrendsModal } from '@/components/ui/VarianceTrendsModal';
import ExecutiveVarianceDashboard from '@/components/insights/ExecutiveVarianceDashboard';
import { calculateMetricVariance } from '@/lib/variance-engine';
import { createPortal } from 'react-dom';

// ===== DETAIL MODAL COMPONENT =====
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
          maxWidth: '900px',
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
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '8px',
              color: 'var(--text-muted)',
            }}
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

// ===== TRAFFIC LIGHT COMPONENT =====
function TrafficLight({ status, label }: { status: 'green' | 'yellow' | 'red'; label: string }) {
  const colors = {
    green: { bg: 'rgba(16, 185, 129, 0.15)', border: '#10B981', text: '#10B981' },
    yellow: { bg: 'rgba(245, 158, 11, 0.15)', border: '#F59E0B', text: '#F59E0B' },
    red: { bg: 'rgba(239, 68, 68, 0.15)', border: '#EF4444', text: '#EF4444' },
  };
  const c = colors[status];
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: '8px',
    }}>
      <div style={{
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        background: c.border,
        boxShadow: `0 0 8px ${c.border}`,
      }} />
      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: c.text }}>{label}</span>
    </div>
  );
}

// ===== CLICKABLE KPI CARD =====
function KPICard({ 
  title, 
  value, 
  unit = '', 
  trend, 
  status = 'neutral',
  onClick,
  clickable = true,
}: { 
  title: string; 
  value: string | number; 
  unit?: string;
  trend?: number;
  status?: 'good' | 'warning' | 'bad' | 'neutral';
  onClick?: () => void;
  clickable?: boolean;
}) {
  const statusColors = {
    good: '#10B981',
    warning: '#F59E0B',
    bad: '#EF4444',
    neutral: 'var(--text-primary)',
  };

  return (
    <div 
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        padding: '1.5rem',
        border: '1px solid var(--border-color)',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'all 0.2s',
      }}
      onMouseEnter={e => clickable && (e.currentTarget.style.borderColor = 'var(--pinnacle-teal)')}
      onMouseLeave={e => clickable && (e.currentTarget.style.borderColor = 'var(--border-color)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>{title}</div>
        {clickable && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
          </svg>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '0.5rem' }}>
        <span style={{ fontSize: '2.25rem', fontWeight: 800, color: statusColors[status], lineHeight: 1 }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: '1.25rem', color: 'var(--text-muted)' }}>{unit}</span>}
      </div>
      {trend !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.75rem' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            {trend >= 0 ? (
              <path d="M8 4L12 8L10.5 8L10.5 12L5.5 12L5.5 8L4 8L8 4Z" fill="#10B981" />
            ) : (
              <path d="M8 12L4 8L5.5 8L5.5 4L10.5 4L10.5 8L12 8L8 12Z" fill="#EF4444" />
            )}
          </svg>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: trend >= 0 ? '#10B981' : '#EF4444' }}>
            {trend >= 0 ? '+' : ''}{trend}% vs last period
          </span>
        </div>
      )}
      {clickable && (
        <div style={{ fontSize: '0.7rem', color: 'var(--pinnacle-teal)', marginTop: '0.5rem' }}>
          Click for breakdown
        </div>
      )}
    </div>
  );
}

// ===== CLICKABLE SECTION HEADER =====
function SectionHeader({ 
  icon, 
  iconBg, 
  title, 
  subtitle, 
  onViewAll 
}: { 
  icon: React.ReactNode; 
  iconBg: string; 
  title: string; 
  subtitle: string;
  onViewAll?: () => void;
}) {
  return (
    <div style={{
      padding: '1rem 1.25rem',
      borderBottom: '1px solid var(--border-color)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {icon}
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{subtitle}</span>
        </div>
      </div>
      {onViewAll && (
        <button
          onClick={onViewAll}
          style={{
            background: 'none',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '0.75rem',
            color: 'var(--pinnacle-teal)',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          View All
        </button>
      )}
    </div>
  );
}

export default function OverviewPage() {
  const { filteredData, variancePeriod, metricsHistory, hierarchyFilters } = useData();
  const data = filteredData;
  
  // Modal states
  const [showVarianceModal, setShowVarianceModal] = useState(false);
  const [showExecutiveModal, setShowExecutiveModal] = useState(false);
  const [activeDetail, setActiveDetail] = useState<string | null>(null);

  // Determine context label based on hierarchy filter
  const contextLabel = useMemo(() => {
    if (hierarchyFilters?.project) return `Project: ${hierarchyFilters.project}`;
    if (hierarchyFilters?.seniorManager) return `Portfolio: ${hierarchyFilters.seniorManager}`;
    if (hierarchyFilters?.department) return `Department: ${hierarchyFilters.department}`;
    return 'All Projects';
  }, [hierarchyFilters]);

  // Calculate project-level breakdown
  const projectBreakdown = useMemo(() => {
    const tasks = data.tasks || [];
    const projects = data.projects || [];
    
    const projectMap = new Map<string, {
      name: string;
      tasks: number;
      completed: number;
      baselineHours: number;
      actualHours: number;
      spi: number;
      cpi: number;
      percentComplete: number;
    }>();

    // Build project name map
    const projectNameMap = new Map<string, string>();
    projects.forEach((p: any) => {
      projectNameMap.set(p.id || p.projectId, p.name || p.projectName || p.id);
    });

    tasks.forEach((t: any) => {
      const projectId = t.projectId || t.project_id || 'Unknown';
      const projectName = projectNameMap.get(projectId) || t.projectName || t.project_name || projectId;
      
      if (!projectMap.has(projectId)) {
        projectMap.set(projectId, {
          name: projectName,
          tasks: 0,
          completed: 0,
          baselineHours: 0,
          actualHours: 0,
          spi: 1,
          cpi: 1,
          percentComplete: 0,
        });
      }
      
      const p = projectMap.get(projectId)!;
      p.tasks++;
      p.baselineHours += t.baselineHours || t.budgetHours || 0;
      p.actualHours += t.actualHours || 0;
      p.percentComplete += t.percentComplete || 0;
      
      const status = (t.status || '').toLowerCase();
      if (status.includes('complete') || (t.percentComplete || 0) >= 100) {
        p.completed++;
      }
    });

    // Calculate averages and indices
    return Array.from(projectMap.entries()).map(([id, p]) => {
      const avgPc = p.tasks > 0 ? Math.round(p.percentComplete / p.tasks) : 0;
      const spi = p.baselineHours > 0 ? p.actualHours / p.baselineHours : 1;
      const earnedHours = p.baselineHours * (avgPc / 100);
      const cpi = p.actualHours > 0 ? earnedHours / p.actualHours : 1;
      
      return {
        id,
        name: p.name,
        tasks: p.tasks,
        completed: p.completed,
        baselineHours: Math.round(p.baselineHours),
        actualHours: Math.round(p.actualHours),
        spi: Math.round(spi * 100) / 100,
        cpi: Math.round(cpi * 100) / 100,
        percentComplete: avgPc,
        variance: p.baselineHours > 0 ? Math.round(((p.actualHours - p.baselineHours) / p.baselineHours) * 100) : 0,
      };
    }).filter(p => p.name !== 'Unknown' && p.tasks > 0);
  }, [data.tasks, data.projects]);

  // Aggregate health metrics
  const healthMetrics = useMemo(() => {
    const tasks = data.tasks || [];
    let totalPV = 0, totalEV = 0, totalAC = 0;
    let totalBaselineHours = 0, totalActualHours = 0;
    let totalPercentComplete = 0, itemCount = 0;

    tasks.forEach((task: any) => {
      totalEV += (task.baselineCost || task.budgetCost || 0) * ((task.percentComplete || 0) / 100);
      totalAC += task.actualCost || 0;
      totalPV += task.baselineCost || task.budgetCost || 0;
      totalBaselineHours += task.baselineHours || task.budgetHours || 0;
      totalActualHours += task.actualHours || 0;
      totalPercentComplete += task.percentComplete || 0;
      itemCount++;
    });

    const avgPercentComplete = itemCount > 0 ? Math.round(totalPercentComplete / itemCount) : 0;
    
    let spi = 1, cpi = 1;
    if (totalPV > 0 && totalEV > 0) {
      spi = totalEV / totalPV;
      cpi = totalAC > 0 ? totalEV / totalAC : 1;
    } else if (totalBaselineHours > 0) {
      spi = totalActualHours / totalBaselineHours;
      const earnedHours = totalBaselineHours * (avgPercentComplete / 100);
      cpi = totalActualHours > 0 ? earnedHours / totalActualHours : 1;
    }

    const budgetVariance = totalBaselineHours > 0 ? ((totalActualHours - totalBaselineHours) / totalBaselineHours) * 100 : 0;

    let healthScore = 100;
    if (spi < 0.9) healthScore -= 25;
    else if (spi < 1) healthScore -= 10;
    if (cpi < 0.9) healthScore -= 25;
    else if (cpi < 1) healthScore -= 10;
    healthScore = Math.max(0, Math.min(100, healthScore));

    const scheduleStatus: 'green' | 'yellow' | 'red' = spi >= 1 ? 'green' : spi >= 0.9 ? 'yellow' : 'red';
    const budgetStatus: 'green' | 'yellow' | 'red' = cpi >= 1 ? 'green' : cpi >= 0.9 ? 'yellow' : 'red';
    const qualityStatus: 'green' | 'yellow' | 'red' = avgPercentComplete >= 80 ? 'green' : avgPercentComplete >= 50 ? 'yellow' : 'red';

    let summary = '';
    if (spi >= 1 && cpi >= 1) {
      summary = `On track - ${avgPercentComplete}% complete, on schedule and under budget`;
    } else if (spi >= 0.9 && cpi >= 0.9) {
      summary = `Minor variances - ${avgPercentComplete}% complete with small concerns`;
    } else {
      const issues = [];
      if (spi < 0.9) issues.push('behind schedule');
      if (cpi < 0.9) issues.push('over budget');
      summary = `Needs attention - ${issues.join(' and ')}. ${avgPercentComplete}% complete`;
    }

    return {
      healthScore,
      spi: Math.round(spi * 100) / 100,
      cpi: Math.round(cpi * 100) / 100,
      percentComplete: avgPercentComplete,
      budgetVariance: Math.round(budgetVariance * 10) / 10,
      scheduleStatus,
      budgetStatus,
      qualityStatus,
      summary,
      projectCount: projectBreakdown.length,
      totalHours: totalActualHours,
      baselineHours: totalBaselineHours,
    };
  }, [data.tasks, projectBreakdown]);

  // Variance calculations
  const varianceData = useMemo(() => ({
    spi: calculateMetricVariance(metricsHistory, 'spi', variancePeriod),
    cpi: calculateMetricVariance(metricsHistory, 'cpi', variancePeriod),
  }), [metricsHistory, variancePeriod]);

  // Schedule risks
  const scheduleRisks = useMemo(() => {
    const milestones = data.milestones || [];
    return milestones
      .filter((m: any) => m.varianceDays && m.varianceDays > 0 && m.status !== 'Complete')
      .sort((a: any, b: any) => (b.varianceDays || 0) - (a.varianceDays || 0))
      .map((m: any) => ({
        name: m.name || m.milestone,
        project: m.projectNum || m.project,
        variance: m.varianceDays,
        status: m.status,
        planned: m.plannedCompletion,
      }));
  }, [data.milestones]);

  // Budget concerns
  const budgetConcerns = useMemo(() => {
    const tasks = data.tasks || [];
    return tasks
      .filter((t: any) => {
        const baseline = t.baselineHours || t.budgetHours || 0;
        const actual = t.actualHours || 0;
        return baseline > 0 && actual > baseline;
      })
      .map((t: any) => {
        const baseline = t.baselineHours || t.budgetHours || 0;
        const actual = t.actualHours || 0;
        const variance = ((actual - baseline) / baseline) * 100;
        return {
          name: t.name || t.taskName,
          project: t.projectName || t.project_name || '',
          variance: Math.round(variance),
          baseline,
          actual,
        };
      })
      .sort((a, b) => b.variance - a.variance);
  }, [data.tasks]);

  // Upcoming milestones
  const upcomingMilestones = useMemo(() => {
    const milestones = data.milestones || [];
    const today = new Date();
    const thirtyDaysOut = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    return milestones
      .filter((m: any) => {
        const planned = m.plannedCompletion ? new Date(m.plannedCompletion) : null;
        return planned && planned >= today && planned <= thirtyDaysOut && m.status !== 'Complete';
      })
      .sort((a: any, b: any) => 
        new Date(a.plannedCompletion).getTime() - new Date(b.plannedCompletion).getTime()
      );
  }, [data.milestones]);

  // Team performance
  const teamPerformance = useMemo(() => {
    const tasks = data.tasks || [];
    const resourceStats = new Map<string, { hours: number; baseline: number; tasks: number; projects: Set<string> }>();
    
    tasks.forEach((t: any) => {
      const resource = t.assignedResource || t.employeeName || t.assignedTo || 'Unassigned';
      if (resource === 'Unassigned') return;
      
      const baseline = t.baselineHours || t.budgetHours || 0;
      const actual = t.actualHours || 0;
      const project = t.projectName || t.project_name || '';
      
      if (!resourceStats.has(resource)) {
        resourceStats.set(resource, { hours: 0, baseline: 0, tasks: 0, projects: new Set() });
      }
      const stats = resourceStats.get(resource)!;
      stats.hours += actual;
      stats.baseline += baseline;
      stats.tasks += 1;
      if (project) stats.projects.add(project);
    });

    const performers = Array.from(resourceStats.entries())
      .filter(([_, s]) => s.baseline > 0)
      .map(([name, s]) => ({
        name,
        efficiency: Math.round((s.hours / s.baseline) * 100),
        tasks: s.tasks,
        hours: Math.round(s.hours),
        baseline: Math.round(s.baseline),
        projects: s.projects.size,
      }))
      .sort((a, b) => a.efficiency - b.efficiency);

    return {
      all: performers,
      top: performers.slice(0, 5),
      needsAttention: performers.filter(p => p.efficiency > 110).slice(0, 5),
    };
  }, [data.tasks]);

  const healthColor = healthMetrics.healthScore >= 80 ? '#10B981' : 
                      healthMetrics.healthScore >= 60 ? '#F59E0B' : '#EF4444';

  return (
    <div className="page-panel insights-page">
      {/* SECTION 1: Health at a Glance */}
      <div style={{
        background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)',
        borderRadius: '20px',
        padding: '2rem',
        marginBottom: '2rem',
        border: '1px solid var(--border-color)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            {/* Health Score Ring */}
            <div 
              style={{
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                background: `conic-gradient(${healthColor} ${healthMetrics.healthScore * 3.6}deg, var(--bg-tertiary) 0deg)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              onClick={() => setActiveDetail('health')}
            >
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'var(--bg-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
              }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: healthColor }}>
                  {healthMetrics.healthScore}
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>HEALTH</span>
              </div>
            </div>
            
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--pinnacle-teal)', fontWeight: 600, marginBottom: '0.25rem' }}>
                {contextLabel}
              </div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, marginBottom: '0.5rem' }}>
                Portfolio Overview
              </h1>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0, maxWidth: '500px' }}>
                {healthMetrics.summary}
              </p>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                {healthMetrics.projectCount} projects | {healthMetrics.totalHours.toLocaleString()} hours logged
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <TrafficLight status={healthMetrics.scheduleStatus} label="Schedule" />
            <TrafficLight status={healthMetrics.budgetStatus} label="Budget" />
            <TrafficLight status={healthMetrics.qualityStatus} label="Quality" />
          </div>
        </div>
      </div>

      {/* SECTION 2: Key Performance Metrics - Clickable */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <KPICard
          title="Schedule Performance (SPI)"
          value={healthMetrics.spi.toFixed(2)}
          trend={varianceData.spi?.percentChange}
          status={healthMetrics.spi >= 1 ? 'good' : healthMetrics.spi >= 0.9 ? 'warning' : 'bad'}
          onClick={() => setActiveDetail('spi')}
        />
        <KPICard
          title="Cost Performance (CPI)"
          value={healthMetrics.cpi.toFixed(2)}
          trend={varianceData.cpi?.percentChange}
          status={healthMetrics.cpi >= 1 ? 'good' : healthMetrics.cpi >= 0.9 ? 'warning' : 'bad'}
          onClick={() => setActiveDetail('cpi')}
        />
        <KPICard
          title="Percent Complete"
          value={healthMetrics.percentComplete}
          unit="%"
          status={healthMetrics.percentComplete >= 80 ? 'good' : healthMetrics.percentComplete >= 50 ? 'warning' : 'neutral'}
          onClick={() => setActiveDetail('progress')}
        />
        <KPICard
          title="Hours Variance"
          value={healthMetrics.budgetVariance > 0 ? `+${healthMetrics.budgetVariance}` : healthMetrics.budgetVariance.toString()}
          unit="%"
          status={healthMetrics.budgetVariance <= 0 ? 'good' : healthMetrics.budgetVariance <= 10 ? 'warning' : 'bad'}
          onClick={() => setActiveDetail('hours')}
        />
      </div>

      {/* SECTION 3: What Needs Attention */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Schedule Risks */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <SectionHeader
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" /></svg>}
            iconBg="rgba(239, 68, 68, 0.15)"
            title="Schedule Risks"
            subtitle={`${scheduleRisks.length} late items`}
            onViewAll={() => setActiveDetail('scheduleRisks')}
          />
          <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {scheduleRisks.slice(0, 4).map((risk, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '10px', gap: '1rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{risk.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{risk.project}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#EF4444', flexShrink: 0 }}>+{risk.variance}d</div>
              </div>
            ))}
            {scheduleRisks.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No schedule risks</div>
            )}
          </div>
        </div>

        {/* Budget Concerns */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <SectionHeader
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>}
            iconBg="rgba(245, 158, 11, 0.15)"
            title="Budget Concerns"
            subtitle={`${budgetConcerns.length} over budget`}
            onViewAll={() => setActiveDetail('budgetConcerns')}
          />
          <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {budgetConcerns.slice(0, 4).map((concern, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '10px', gap: '1rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{concern.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{concern.actual}/{concern.baseline} hrs</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#F59E0B', flexShrink: 0 }}>+{concern.variance}%</div>
              </div>
            ))}
            {budgetConcerns.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No budget concerns</div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 4: Milestones */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', marginBottom: '2rem', overflow: 'hidden' }}>
        <SectionHeader
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2"><path d="M5 3v18M5 12h14l-7-7M5 12l7 7" /></svg>}
          iconBg="rgba(64, 224, 208, 0.15)"
          title="Upcoming Milestones"
          subtitle={`${upcomingMilestones.length} in next 30 days`}
          onViewAll={() => setActiveDetail('milestones')}
        />
        <div style={{ padding: '1.25rem', overflowX: 'auto' }}>
          {upcomingMilestones.length > 0 ? (
            <div style={{ display: 'flex', gap: '1rem', minWidth: 'max-content' }}>
              {upcomingMilestones.slice(0, 6).map((m: any, idx: number) => {
                const planned = new Date(m.plannedCompletion);
                const isLate = m.varianceDays && m.varianceDays > 0;
                return (
                  <div key={idx} style={{
                    minWidth: '160px',
                    padding: '1rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: '12px',
                    borderLeft: `4px solid ${isLate ? '#EF4444' : '#10B981'}`,
                  }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{planned.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', margin: '0.25rem 0' }}>{m.name || m.milestone}</div>
                    <div style={{ fontSize: '0.7rem', color: isLate ? '#EF4444' : '#10B981' }}>
                      {isLate ? `+${m.varianceDays}d late` : 'On track'}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No upcoming milestones</div>
          )}
        </div>
      </div>

      {/* SECTION 5: Team Performance */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', borderTop: '4px solid #10B981', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#10B981' }}>Top Performers</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Best hours efficiency</span>
            </div>
            <button onClick={() => setActiveDetail('teamPerformance')} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 10px', fontSize: '0.7rem', color: 'var(--pinnacle-teal)', cursor: 'pointer' }}>View All</button>
          </div>
          <div style={{ padding: '0.5rem' }}>
            {teamPerformance.top.slice(0, 3).map((p, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '0.75rem', gap: '0.75rem', borderBottom: idx < 2 ? '1px solid var(--border-color)' : 'none' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: idx === 0 ? '#10B981' : 'var(--bg-tertiary)', color: idx === 0 ? '#fff' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>{idx + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.tasks} tasks</div>
                </div>
                <div style={{ fontWeight: 700, color: '#10B981', fontSize: '0.85rem' }}>{p.efficiency}%</div>
              </div>
            ))}
            {teamPerformance.top.length === 0 && <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>No data</div>}
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', borderTop: '4px solid #F59E0B', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#F59E0B' }}>Needs Attention</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Over 110% baseline</span>
            </div>
            <button onClick={() => setActiveDetail('teamPerformance')} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 10px', fontSize: '0.7rem', color: 'var(--pinnacle-teal)', cursor: 'pointer' }}>View All</button>
          </div>
          <div style={{ padding: '0.5rem' }}>
            {teamPerformance.needsAttention.slice(0, 3).map((p, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '0.75rem', gap: '0.75rem', borderBottom: idx < 2 ? '1px solid var(--border-color)' : 'none' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>{idx + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.tasks} tasks</div>
                </div>
                <div style={{ fontWeight: 700, color: '#F59E0B', fontSize: '0.85rem' }}>{p.efficiency}%</div>
              </div>
            ))}
            {teamPerformance.needsAttention.length === 0 && <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>All within budget</div>}
          </div>
        </div>
      </div>

      {/* SECTION 6: Quick Actions */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: '16px' }}>
        <button onClick={() => setShowVarianceModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: 'linear-gradient(135deg, rgba(64, 224, 208, 0.15) 0%, rgba(205, 220, 57, 0.1) 100%)', border: '1px solid var(--pinnacle-teal)', borderRadius: '10px', color: 'var(--pinnacle-teal)', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 6-6" /></svg>
          Variance Analysis
        </button>
        <button onClick={() => setShowExecutiveModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: 'linear-gradient(135deg, rgba(233, 30, 99, 0.15) 0%, rgba(156, 39, 176, 0.1) 100%)', border: '1px solid #E91E63', borderRadius: '10px', color: '#E91E63', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
          Executive Dashboard
        </button>
      </div>

      {/* ===== DETAIL MODALS ===== */}
      
      {/* Health Score Breakdown */}
      <DetailModal isOpen={activeDetail === 'health'} onClose={() => setActiveDetail(null)} title="Health Score Breakdown by Project">
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Project</th><th className="number">SPI</th><th className="number">CPI</th><th className="number">% Complete</th><th className="number">Health</th></tr></thead>
          <tbody>
            {projectBreakdown.map((p, idx) => {
              const health = Math.max(0, 100 - (p.spi < 0.9 ? 25 : p.spi < 1 ? 10 : 0) - (p.cpi < 0.9 ? 25 : p.cpi < 1 ? 10 : 0));
              return (
                <tr key={idx}>
                  <td>{p.name}</td>
                  <td className="number" style={{ color: p.spi >= 1 ? '#10B981' : p.spi >= 0.9 ? '#F59E0B' : '#EF4444' }}>{p.spi.toFixed(2)}</td>
                  <td className="number" style={{ color: p.cpi >= 1 ? '#10B981' : p.cpi >= 0.9 ? '#F59E0B' : '#EF4444' }}>{p.cpi.toFixed(2)}</td>
                  <td className="number">{p.percentComplete}%</td>
                  <td className="number" style={{ fontWeight: 700, color: health >= 80 ? '#10B981' : health >= 60 ? '#F59E0B' : '#EF4444' }}>{health}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DetailModal>

      {/* SPI Breakdown */}
      <DetailModal isOpen={activeDetail === 'spi'} onClose={() => setActiveDetail(null)} title="Schedule Performance by Project">
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Project</th><th className="number">Tasks</th><th className="number">Baseline Hrs</th><th className="number">Actual Hrs</th><th className="number">SPI</th><th>Status</th></tr></thead>
          <tbody>
            {projectBreakdown.sort((a, b) => a.spi - b.spi).map((p, idx) => (
              <tr key={idx}>
                <td>{p.name}</td>
                <td className="number">{p.tasks}</td>
                <td className="number">{p.baselineHours.toLocaleString()}</td>
                <td className="number">{p.actualHours.toLocaleString()}</td>
                <td className="number" style={{ fontWeight: 700, color: p.spi >= 1 ? '#10B981' : p.spi >= 0.9 ? '#F59E0B' : '#EF4444' }}>{p.spi.toFixed(2)}</td>
                <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: p.spi >= 1 ? 'rgba(16,185,129,0.15)' : p.spi >= 0.9 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)', color: p.spi >= 1 ? '#10B981' : p.spi >= 0.9 ? '#F59E0B' : '#EF4444' }}>{p.spi >= 1 ? 'On Track' : p.spi >= 0.9 ? 'Watch' : 'Behind'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </DetailModal>

      {/* CPI Breakdown */}
      <DetailModal isOpen={activeDetail === 'cpi'} onClose={() => setActiveDetail(null)} title="Cost Performance by Project">
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Project</th><th className="number">Baseline Hrs</th><th className="number">Actual Hrs</th><th className="number">Variance</th><th className="number">CPI</th><th>Status</th></tr></thead>
          <tbody>
            {projectBreakdown.sort((a, b) => a.cpi - b.cpi).map((p, idx) => (
              <tr key={idx}>
                <td>{p.name}</td>
                <td className="number">{p.baselineHours.toLocaleString()}</td>
                <td className="number">{p.actualHours.toLocaleString()}</td>
                <td className="number" style={{ color: p.variance > 0 ? '#EF4444' : '#10B981' }}>{p.variance > 0 ? '+' : ''}{p.variance}%</td>
                <td className="number" style={{ fontWeight: 700, color: p.cpi >= 1 ? '#10B981' : p.cpi >= 0.9 ? '#F59E0B' : '#EF4444' }}>{p.cpi.toFixed(2)}</td>
                <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: p.cpi >= 1 ? 'rgba(16,185,129,0.15)' : p.cpi >= 0.9 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)', color: p.cpi >= 1 ? '#10B981' : p.cpi >= 0.9 ? '#F59E0B' : '#EF4444' }}>{p.cpi >= 1 ? 'Under Budget' : p.cpi >= 0.9 ? 'Watch' : 'Over Budget'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </DetailModal>

      {/* Progress Breakdown */}
      <DetailModal isOpen={activeDetail === 'progress'} onClose={() => setActiveDetail(null)} title="Progress by Project">
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Project</th><th className="number">Tasks</th><th className="number">Completed</th><th className="number">% Complete</th><th style={{ width: '150px' }}>Progress</th></tr></thead>
          <tbody>
            {projectBreakdown.sort((a, b) => b.percentComplete - a.percentComplete).map((p, idx) => (
              <tr key={idx}>
                <td>{p.name}</td>
                <td className="number">{p.tasks}</td>
                <td className="number">{p.completed}</td>
                <td className="number" style={{ fontWeight: 700 }}>{p.percentComplete}%</td>
                <td>
                  <div style={{ width: '100%', height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${p.percentComplete}%`, height: '100%', background: p.percentComplete >= 80 ? '#10B981' : p.percentComplete >= 50 ? '#F59E0B' : '#3B82F6', borderRadius: '4px' }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DetailModal>

      {/* Hours Breakdown */}
      <DetailModal isOpen={activeDetail === 'hours'} onClose={() => setActiveDetail(null)} title="Hours Analysis by Project">
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Project</th><th className="number">Baseline</th><th className="number">Actual</th><th className="number">Remaining</th><th className="number">Variance</th><th>Status</th></tr></thead>
          <tbody>
            {projectBreakdown.sort((a, b) => b.variance - a.variance).map((p, idx) => {
              const remaining = Math.max(0, p.baselineHours - p.actualHours);
              return (
                <tr key={idx}>
                  <td>{p.name}</td>
                  <td className="number">{p.baselineHours.toLocaleString()}</td>
                  <td className="number">{p.actualHours.toLocaleString()}</td>
                  <td className="number">{remaining.toLocaleString()}</td>
                  <td className="number" style={{ fontWeight: 700, color: p.variance > 0 ? '#EF4444' : '#10B981' }}>{p.variance > 0 ? '+' : ''}{p.variance}%</td>
                  <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: p.variance <= 0 ? 'rgba(16,185,129,0.15)' : p.variance <= 10 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)', color: p.variance <= 0 ? '#10B981' : p.variance <= 10 ? '#F59E0B' : '#EF4444' }}>{p.variance <= 0 ? 'Under' : p.variance <= 10 ? 'Watch' : 'Over'}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DetailModal>

      {/* Schedule Risks Full List */}
      <DetailModal isOpen={activeDetail === 'scheduleRisks'} onClose={() => setActiveDetail(null)} title="All Schedule Risks">
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Milestone</th><th>Project</th><th>Planned Date</th><th className="number">Days Late</th><th>Status</th></tr></thead>
          <tbody>
            {scheduleRisks.map((r, idx) => (
              <tr key={idx}>
                <td>{r.name}</td>
                <td>{r.project}</td>
                <td>{r.planned ? new Date(r.planned).toLocaleDateString() : '-'}</td>
                <td className="number" style={{ color: '#EF4444', fontWeight: 700 }}>+{r.variance}d</td>
                <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>{r.status || 'Late'}</span></td>
              </tr>
            ))}
            {scheduleRisks.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No schedule risks</td></tr>}
          </tbody>
        </table>
      </DetailModal>

      {/* Budget Concerns Full List */}
      <DetailModal isOpen={activeDetail === 'budgetConcerns'} onClose={() => setActiveDetail(null)} title="All Budget Concerns">
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Task</th><th>Project</th><th className="number">Baseline</th><th className="number">Actual</th><th className="number">Variance</th></tr></thead>
          <tbody>
            {budgetConcerns.map((c, idx) => (
              <tr key={idx}>
                <td>{c.name}</td>
                <td>{c.project}</td>
                <td className="number">{c.baseline}</td>
                <td className="number">{c.actual}</td>
                <td className="number" style={{ color: '#F59E0B', fontWeight: 700 }}>+{c.variance}%</td>
              </tr>
            ))}
            {budgetConcerns.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No budget concerns</td></tr>}
          </tbody>
        </table>
      </DetailModal>

      {/* Milestones Full List */}
      <DetailModal isOpen={activeDetail === 'milestones'} onClose={() => setActiveDetail(null)} title="All Upcoming Milestones">
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Milestone</th><th>Project</th><th>Planned Date</th><th className="number">Variance</th><th>Status</th></tr></thead>
          <tbody>
            {upcomingMilestones.map((m: any, idx) => (
              <tr key={idx}>
                <td>{m.name || m.milestone}</td>
                <td>{m.projectNum || m.project}</td>
                <td>{m.plannedCompletion ? new Date(m.plannedCompletion).toLocaleDateString() : '-'}</td>
                <td className="number" style={{ color: (m.varianceDays || 0) > 0 ? '#EF4444' : '#10B981' }}>{m.varianceDays ? `${m.varianceDays > 0 ? '+' : ''}${m.varianceDays}d` : 'On time'}</td>
                <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: (m.varianceDays || 0) > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)', color: (m.varianceDays || 0) > 0 ? '#EF4444' : '#10B981' }}>{m.status || 'Pending'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </DetailModal>

      {/* Team Performance Full List */}
      <DetailModal isOpen={activeDetail === 'teamPerformance'} onClose={() => setActiveDetail(null)} title="Team Performance Details">
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Resource</th><th className="number">Tasks</th><th className="number">Projects</th><th className="number">Baseline Hrs</th><th className="number">Actual Hrs</th><th className="number">Efficiency</th><th>Status</th></tr></thead>
          <tbody>
            {teamPerformance.all.map((p, idx) => (
              <tr key={idx}>
                <td>{p.name}</td>
                <td className="number">{p.tasks}</td>
                <td className="number">{p.projects}</td>
                <td className="number">{p.baseline.toLocaleString()}</td>
                <td className="number">{p.hours.toLocaleString()}</td>
                <td className="number" style={{ fontWeight: 700, color: p.efficiency <= 100 ? '#10B981' : p.efficiency <= 110 ? '#F59E0B' : '#EF4444' }}>{p.efficiency}%</td>
                <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: p.efficiency <= 100 ? 'rgba(16,185,129,0.15)' : p.efficiency <= 110 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)', color: p.efficiency <= 100 ? '#10B981' : p.efficiency <= 110 ? '#F59E0B' : '#EF4444' }}>{p.efficiency <= 100 ? 'Efficient' : p.efficiency <= 110 ? 'Watch' : 'Over'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </DetailModal>

      {/* Global Modals */}
      <VarianceTrendsModal isOpen={showVarianceModal} onClose={() => setShowVarianceModal(false)} />
      <ExecutiveVarianceDashboard isOpen={showExecutiveModal} onClose={() => setShowExecutiveModal(false)} />
    </div>
  );
}
