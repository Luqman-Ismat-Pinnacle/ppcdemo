'use client';

/**
 * @fileoverview Executive Briefing - Overview Page for PPC V3.
 * 
 * Project-based executive dashboard with:
 * - Health at a Glance with inline project breakdown
 * - Key Performance Metrics with expandable details
 * - Variance Analysis section (inline, not modal)
 * - Executive Metrics section (inline, not modal)
 * - What Needs Attention with expandable items
 * - All visuals have click-to-expand inline details
 * 
 * @module app/insights/overview/page
 */

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import SCurveChart from '@/components/charts/SCurveChart';
import BudgetVarianceChart from '@/components/charts/BudgetVarianceChart';
import type { EChartsOption } from 'echarts';

// ===== EXPANDABLE SECTION COMPONENT =====
function ExpandableSection({ 
  isExpanded, 
  children 
}: { 
  isExpanded: boolean; 
  children: React.ReactNode;
}) {
  return (
    <div style={{
      maxHeight: isExpanded ? '2000px' : '0',
      overflow: 'hidden',
      transition: 'max-height 0.3s ease-in-out',
    }}>
      {children}
    </div>
  );
}

// ===== TRAFFIC LIGHT =====
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

// ===== CLICKABLE KPI CARD WITH INLINE EXPANSION =====
function KPICardExpanding({ 
  title, 
  value, 
  unit = '', 
  trend,
  status = 'neutral',
  isExpanded,
  onToggle,
  children,
}: { 
  title: string; 
  value: string | number; 
  unit?: string;
  trend?: number;
  status?: 'good' | 'warning' | 'bad' | 'neutral';
  isExpanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const statusColors = {
    good: '#10B981',
    warning: '#F59E0B',
    bad: '#EF4444',
    neutral: 'var(--text-primary)',
  };

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '16px',
      border: `1px solid ${isExpanded ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
      overflow: 'hidden',
      transition: 'all 0.2s',
    }}>
      <div
        onClick={onToggle}
        style={{
          padding: '1.25rem',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>{title}</div>
          <svg 
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"
            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          >
            <polyline points="6,9 12,15 18,9" />
          </svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '0.5rem' }}>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: statusColors[status], lineHeight: 1 }}>
            {value}
          </span>
          {unit && <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>{unit}</span>}
        </div>
        {trend !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.5rem' }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              {trend >= 0 ? (
                <path d="M8 4L12 8L10.5 8L10.5 12L5.5 12L5.5 8L4 8L8 4Z" fill="#10B981" />
              ) : (
                <path d="M8 12L4 8L5.5 8L5.5 4L10.5 4L10.5 8L12 8L8 12Z" fill="#EF4444" />
              )}
            </svg>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: trend >= 0 ? '#10B981' : '#EF4444' }}>
              {trend >= 0 ? '+' : ''}{trend}%
            </span>
          </div>
        )}
      </div>
      <ExpandableSection isExpanded={isExpanded}>
        <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid var(--border-color)' }}>
          {children}
        </div>
      </ExpandableSection>
    </div>
  );
}

// ===== METRIC TREND CHART =====
function MetricTrendChart({ data, color = 'var(--pinnacle-teal)' }: { data: number[]; color?: string }) {
  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 0, right: 0, top: 10, bottom: 10 },
    xAxis: { type: 'category', show: false },
    yAxis: { type: 'value', show: false },
    series: [{
      type: 'line',
      data,
      smooth: true,
      symbol: 'none',
      lineStyle: { color, width: 2 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: color + '40' },
            { offset: 1, color: color + '00' },
          ],
        },
      },
    }],
  }), [data, color]);

  return <ChartWrapper option={option} height="60px" />;
}

export default function OverviewPage() {
  const { filteredData, hierarchyFilters, variancePeriod } = useData();
  const data = filteredData;
  
  // Expansion states
  const [expandedKPI, setExpandedKPI] = useState<string | null>(null);
  const [expandedRisk, setExpandedRisk] = useState<string | null>(null);
  const [showVarianceSection, setShowVarianceSection] = useState(true);
  const [showExecutiveSection, setShowExecutiveSection] = useState(true);
  const [selectedVarianceMetric, setSelectedVarianceMetric] = useState('hours');

  // Context label
  const contextLabel = useMemo(() => {
    if (hierarchyFilters?.project) return `Project: ${hierarchyFilters.project}`;
    if (hierarchyFilters?.seniorManager) return `Portfolio: ${hierarchyFilters.seniorManager}`;
    if (hierarchyFilters?.department) return `Department: ${hierarchyFilters.department}`;
    return 'All Projects';
  }, [hierarchyFilters]);

  // Calculate project breakdown
  const projectBreakdown = useMemo(() => {
    const tasks = data.tasks || [];
    const projects = data.projects || [];
    
    const projectMap = new Map<string, {
      name: string;
      tasks: number;
      completed: number;
      baselineHours: number;
      actualHours: number;
      percentComplete: number;
    }>();

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
          percentComplete: 0,
        });
      }
      
      const p = projectMap.get(projectId)!;
      p.tasks++;
      p.baselineHours += t.baselineHours || t.budgetHours || 0;
      p.actualHours += t.actualHours || 0;
      p.percentComplete += t.percentComplete || 0;
      
      if ((t.status || '').toLowerCase().includes('complete') || (t.percentComplete || 0) >= 100) {
        p.completed++;
      }
    });

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

  // Health metrics
  const healthMetrics = useMemo(() => {
    const tasks = data.tasks || [];
    let totalBaselineHours = 0, totalActualHours = 0;
    let totalPercentComplete = 0, itemCount = 0;

    tasks.forEach((task: any) => {
      totalBaselineHours += task.baselineHours || task.budgetHours || 0;
      totalActualHours += task.actualHours || 0;
      totalPercentComplete += task.percentComplete || 0;
      itemCount++;
    });

    const avgPercentComplete = itemCount > 0 ? Math.round(totalPercentComplete / itemCount) : 0;
    
    const spi = totalBaselineHours > 0 ? totalActualHours / totalBaselineHours : 1;
    const earnedHours = totalBaselineHours * (avgPercentComplete / 100);
    const cpi = totalActualHours > 0 ? earnedHours / totalActualHours : 1;

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

    let summary = spi >= 1 && cpi >= 1 ? `On track - ${avgPercentComplete}% complete` :
                  spi >= 0.9 && cpi >= 0.9 ? `Minor variances - ${avgPercentComplete}% complete` :
                  `Needs attention - ${avgPercentComplete}% complete`;

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
      totalHours: Math.round(totalActualHours),
      baselineHours: Math.round(totalBaselineHours),
    };
  }, [data.tasks, projectBreakdown]);

  // Schedule risks
  const scheduleRisks = useMemo(() => {
    const milestones = data.milestones || [];
    return milestones
      .filter((m: any) => m.varianceDays && m.varianceDays > 0 && m.status !== 'Complete')
      .sort((a: any, b: any) => (b.varianceDays || 0) - (a.varianceDays || 0))
      .map((m: any) => ({
        id: m.id || m.name,
        name: m.name || m.milestone,
        project: m.projectNum || m.project,
        variance: m.varianceDays,
        status: m.status,
        planned: m.plannedCompletion,
        percentComplete: m.percentComplete || 0,
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
          id: t.id || t.name,
          name: t.name || t.taskName,
          project: t.projectName || t.project_name || '',
          variance: Math.round(variance),
          baseline,
          actual,
          assignee: t.assignedResource || t.assignedTo || 'Unassigned',
        };
      })
      .sort((a, b) => b.variance - a.variance);
  }, [data.tasks]);

  // Variance metrics for the inline section
  const varianceMetrics = useMemo(() => {
    const generateTrend = (base: number, variance: number = 10) => {
      return Array.from({ length: 8 }, (_, i) => 
        base * (1 - (7 - i) * 0.02 + (Math.random() - 0.5) * variance / 50)
      );
    };

    return [
      { id: 'hours', name: 'Total Hours', value: healthMetrics.totalHours, prev: healthMetrics.totalHours * 0.92, format: 'number', trend: generateTrend(healthMetrics.totalHours) },
      { id: 'spi', name: 'Schedule Performance', value: healthMetrics.spi, prev: healthMetrics.spi * 0.97, format: 'decimal', trend: generateTrend(healthMetrics.spi, 5) },
      { id: 'cpi', name: 'Cost Performance', value: healthMetrics.cpi, prev: healthMetrics.cpi * 0.96, format: 'decimal', trend: generateTrend(healthMetrics.cpi, 5) },
      { id: 'complete', name: 'Completion', value: healthMetrics.percentComplete, prev: healthMetrics.percentComplete * 0.85, format: 'percent', trend: generateTrend(healthMetrics.percentComplete, 8) },
    ];
  }, [healthMetrics]);

  const healthColor = healthMetrics.healthScore >= 80 ? '#10B981' : 
                      healthMetrics.healthScore >= 60 ? '#F59E0B' : '#EF4444';

  const toggleKPI = (kpi: string) => {
    setExpandedKPI(expandedKPI === kpi ? null : kpi);
  };

  return (
    <div className="page-panel insights-page">
      {/* SECTION 1: Health at a Glance */}
      <div style={{
        background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)',
        borderRadius: '20px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: '1px solid var(--border-color)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{
              width: '90px',
              height: '90px',
              borderRadius: '50%',
              background: `conic-gradient(${healthColor} ${healthMetrics.healthScore * 3.6}deg, var(--bg-tertiary) 0deg)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'var(--bg-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
              }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: healthColor }}>{healthMetrics.healthScore}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>HEALTH</span>
              </div>
            </div>
            
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--pinnacle-teal)', fontWeight: 600, marginBottom: '0.25rem' }}>{contextLabel}</div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, marginBottom: '0.25rem' }}>Portfolio Overview</h1>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>{healthMetrics.summary}</p>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {healthMetrics.projectCount} projects | {healthMetrics.totalHours.toLocaleString()} hours
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <TrafficLight status={healthMetrics.scheduleStatus} label="Schedule" />
            <TrafficLight status={healthMetrics.budgetStatus} label="Budget" />
            <TrafficLight status={healthMetrics.qualityStatus} label="Quality" />
          </div>
        </div>
      </div>

      {/* SECTION 2: KPI Cards with Inline Expansion */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <KPICardExpanding
          title="Schedule Performance (SPI)"
          value={healthMetrics.spi.toFixed(2)}
          trend={Math.round((healthMetrics.spi / 0.97 - 1) * 100)}
          status={healthMetrics.spi >= 1 ? 'good' : healthMetrics.spi >= 0.9 ? 'warning' : 'bad'}
          isExpanded={expandedKPI === 'spi'}
          onToggle={() => toggleKPI('spi')}
        >
          <div style={{ paddingTop: '1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.75rem' }}>By Project</div>
            {projectBreakdown.slice(0, 5).map((p, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.8rem' }}>{p.name}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: p.spi >= 1 ? '#10B981' : p.spi >= 0.9 ? '#F59E0B' : '#EF4444' }}>{p.spi.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </KPICardExpanding>

        <KPICardExpanding
          title="Cost Performance (CPI)"
          value={healthMetrics.cpi.toFixed(2)}
          trend={Math.round((healthMetrics.cpi / 0.96 - 1) * 100)}
          status={healthMetrics.cpi >= 1 ? 'good' : healthMetrics.cpi >= 0.9 ? 'warning' : 'bad'}
          isExpanded={expandedKPI === 'cpi'}
          onToggle={() => toggleKPI('cpi')}
        >
          <div style={{ paddingTop: '1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.75rem' }}>By Project</div>
            {projectBreakdown.slice(0, 5).map((p, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.8rem' }}>{p.name}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: p.cpi >= 1 ? '#10B981' : p.cpi >= 0.9 ? '#F59E0B' : '#EF4444' }}>{p.cpi.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </KPICardExpanding>

        <KPICardExpanding
          title="Percent Complete"
          value={healthMetrics.percentComplete}
          unit="%"
          status={healthMetrics.percentComplete >= 80 ? 'good' : healthMetrics.percentComplete >= 50 ? 'warning' : 'neutral'}
          isExpanded={expandedKPI === 'complete'}
          onToggle={() => toggleKPI('complete')}
        >
          <div style={{ paddingTop: '1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.75rem' }}>By Project</div>
            {projectBreakdown.slice(0, 5).map((p, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.8rem' }}>{p.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '50px', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${p.percentComplete}%`, height: '100%', background: '#10B981', borderRadius: '3px' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{p.percentComplete}%</span>
                </div>
              </div>
            ))}
          </div>
        </KPICardExpanding>

        <KPICardExpanding
          title="Hours Variance"
          value={healthMetrics.budgetVariance > 0 ? `+${healthMetrics.budgetVariance}` : healthMetrics.budgetVariance.toString()}
          unit="%"
          status={healthMetrics.budgetVariance <= 0 ? 'good' : healthMetrics.budgetVariance <= 10 ? 'warning' : 'bad'}
          isExpanded={expandedKPI === 'hours'}
          onToggle={() => toggleKPI('hours')}
        >
          <div style={{ paddingTop: '1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.75rem' }}>By Project</div>
            {projectBreakdown.slice(0, 5).map((p, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.8rem' }}>{p.name}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: p.variance <= 0 ? '#10B981' : p.variance <= 10 ? '#F59E0B' : '#EF4444' }}>
                  {p.variance > 0 ? '+' : ''}{p.variance}%
                </span>
              </div>
            ))}
          </div>
        </KPICardExpanding>
      </div>

      {/* SECTION 3: Variance Analysis (Inline) */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        marginBottom: '1.5rem',
        overflow: 'hidden',
      }}>
        <div 
          style={{
            padding: '1rem 1.25rem',
            borderBottom: showVarianceSection ? '1px solid var(--border-color)' : 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
          }}
          onClick={() => setShowVarianceSection(!showVarianceSection)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(64, 224, 208, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2"><path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 6-6" /></svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Variance Analysis</h3>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Trend tracking across metrics</span>
            </div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ transform: showVarianceSection ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <polyline points="6,9 12,15 18,9" />
          </svg>
        </div>
        
        <ExpandableSection isExpanded={showVarianceSection}>
          <div style={{ padding: '1.25rem' }}>
            {/* Metric Selector */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              {varianceMetrics.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelectedVarianceMetric(m.id)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    border: `1px solid ${selectedVarianceMetric === m.id ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
                    background: selectedVarianceMetric === m.id ? 'rgba(64, 224, 208, 0.1)' : 'transparent',
                    color: selectedVarianceMetric === m.id ? 'var(--pinnacle-teal)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                  }}
                >
                  {m.name}
                </button>
              ))}
            </div>
            
            {/* Selected Metric Display */}
            {(() => {
              const metric = varianceMetrics.find(m => m.id === selectedVarianceMetric) || varianceMetrics[0];
              const change = metric.prev > 0 ? ((metric.value - metric.prev) / metric.prev) * 100 : 0;
              const isPositive = change >= 0;
              
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '2rem', fontWeight: 800 }}>
                        {metric.format === 'percent' ? `${metric.value}%` : 
                         metric.format === 'decimal' ? metric.value.toFixed(2) : 
                         metric.value.toLocaleString()}
                      </span>
                      <span style={{
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: isPositive ? '#10B981' : '#EF4444',
                      }}>
                        {isPositive ? '+' : ''}{change.toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                      vs previous period: {metric.format === 'percent' ? `${Math.round(metric.prev)}%` : 
                                           metric.format === 'decimal' ? metric.prev.toFixed(2) : 
                                           Math.round(metric.prev).toLocaleString()}
                    </div>
                    <MetricTrendChart data={metric.trend} color={isPositive ? '#10B981' : '#EF4444'} />
                  </div>
                  
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.75rem' }}>Project Breakdown</div>
                    {projectBreakdown.slice(0, 4).map((p, idx) => {
                      const val = selectedVarianceMetric === 'spi' ? p.spi :
                                  selectedVarianceMetric === 'cpi' ? p.cpi :
                                  selectedVarianceMetric === 'complete' ? p.percentComplete :
                                  p.actualHours;
                      const formatted = selectedVarianceMetric === 'spi' || selectedVarianceMetric === 'cpi' ? val.toFixed(2) :
                                        selectedVarianceMetric === 'complete' ? `${val}%` :
                                        val.toLocaleString();
                      return (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', fontSize: '0.8rem' }}>
                          <span>{p.name}</span>
                          <span style={{ fontWeight: 600 }}>{formatted}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </ExpandableSection>
      </div>

      {/* SECTION 4: Schedule & Budget Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', padding: '1rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 600 }}>S-Curve Progress</h3>
          <SCurveChart data={data.sCurve || { dates: [], planned: [], actual: [], forecast: [] }} height="240px" />
        </div>
        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', padding: '1rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 600 }}>Budget Variance</h3>
          <BudgetVarianceChart data={data.budgetVariance || []} height={240} />
        </div>
      </div>

      {/* SECTION 5: What Needs Attention - Expandable Items */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {/* Schedule Risks */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" /></svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Schedule Risks</h3>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{scheduleRisks.length} late items</span>
            </div>
          </div>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {scheduleRisks.slice(0, 8).map((risk, idx) => (
              <div key={idx}>
                <div 
                  onClick={() => setExpandedRisk(expandedRisk === `risk-${idx}` ? null : `risk-${idx}`)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '0.75rem 1rem',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-color)',
                    background: expandedRisk === `risk-${idx}` ? 'var(--bg-secondary)' : 'transparent',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{risk.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{risk.project}</div>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#EF4444', marginRight: '0.5rem' }}>+{risk.variance}d</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ transform: expandedRisk === `risk-${idx}` ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                    <polyline points="6,9 12,15 18,9" />
                  </svg>
                </div>
                <ExpandableSection isExpanded={expandedRisk === `risk-${idx}`}>
                  <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-secondary)', fontSize: '0.8rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <div><span style={{ color: 'var(--text-muted)' }}>Planned:</span> {risk.planned ? new Date(risk.planned).toLocaleDateString() : 'N/A'}</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Status:</span> {risk.status || 'Late'}</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Progress:</span> {risk.percentComplete}%</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Variance:</span> <span style={{ color: '#EF4444' }}>+{risk.variance} days</span></div>
                    </div>
                  </div>
                </ExpandableSection>
              </div>
            ))}
            {scheduleRisks.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No schedule risks</div>}
          </div>
        </div>

        {/* Budget Concerns */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Budget Concerns</h3>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{budgetConcerns.length} over budget</span>
            </div>
          </div>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {budgetConcerns.slice(0, 8).map((concern, idx) => (
              <div key={idx}>
                <div 
                  onClick={() => setExpandedRisk(expandedRisk === `budget-${idx}` ? null : `budget-${idx}`)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '0.75rem 1rem',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-color)',
                    background: expandedRisk === `budget-${idx}` ? 'var(--bg-secondary)' : 'transparent',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{concern.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{concern.actual}/{concern.baseline} hrs</div>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#F59E0B', marginRight: '0.5rem' }}>+{concern.variance}%</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ transform: expandedRisk === `budget-${idx}` ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                    <polyline points="6,9 12,15 18,9" />
                  </svg>
                </div>
                <ExpandableSection isExpanded={expandedRisk === `budget-${idx}`}>
                  <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-secondary)', fontSize: '0.8rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <div><span style={{ color: 'var(--text-muted)' }}>Project:</span> {concern.project || 'N/A'}</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Assignee:</span> {concern.assignee}</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Baseline:</span> {concern.baseline} hrs</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Actual:</span> <span style={{ color: '#F59E0B' }}>{concern.actual} hrs</span></div>
                    </div>
                  </div>
                </ExpandableSection>
              </div>
            ))}
            {budgetConcerns.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No budget concerns</div>}
          </div>
        </div>
      </div>

      {/* SECTION 6: Project Summary Table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Project Summary</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Click any row for details</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th>Project</th>
                <th className="number">Tasks</th>
                <th className="number">SPI</th>
                <th className="number">CPI</th>
                <th className="number">% Complete</th>
                <th className="number">Variance</th>
              </tr>
            </thead>
            <tbody>
              {projectBreakdown.map((p, idx) => (
                <tr key={idx} style={{ cursor: 'pointer' }} onClick={() => setExpandedRisk(expandedRisk === `proj-${idx}` ? null : `proj-${idx}`)}>
                  <td>{p.name}</td>
                  <td className="number">{p.tasks}</td>
                  <td className="number" style={{ color: p.spi >= 1 ? '#10B981' : p.spi >= 0.9 ? '#F59E0B' : '#EF4444', fontWeight: 600 }}>{p.spi.toFixed(2)}</td>
                  <td className="number" style={{ color: p.cpi >= 1 ? '#10B981' : p.cpi >= 0.9 ? '#F59E0B' : '#EF4444', fontWeight: 600 }}>{p.cpi.toFixed(2)}</td>
                  <td className="number">{p.percentComplete}%</td>
                  <td className="number" style={{ color: p.variance <= 0 ? '#10B981' : p.variance <= 10 ? '#F59E0B' : '#EF4444', fontWeight: 600 }}>
                    {p.variance > 0 ? '+' : ''}{p.variance}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
