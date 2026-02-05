'use client';

/**
 * @fileoverview Executive Briefing - Overview Page for PPC V3.
 * 
 * Redesigned for executive presentations with progressive disclosure:
 * 1. Health at a Glance - Answer "Are we on track?" in 5 seconds
 * 2. Key Performance Metrics - SPI, CPI, % Complete, Forecast
 * 3. What Needs Attention - Schedule risks and budget concerns
 * 4. Milestones & Deliverables - Timeline with status
 * 5. Team Performance Summary - Top performers and areas needing attention
 * 6. Quick Actions - Drill-down buttons
 * 
 * @module app/insights/overview/page
 */

import React, { useMemo, useState } from 'react';
import { useData } from '@/lib/data-context';
import { VarianceTrendsModal } from '@/components/ui/VarianceTrendsModal';
import ExecutiveVarianceDashboard from '@/components/insights/ExecutiveVarianceDashboard';
import { calculateMetricVariance } from '@/lib/variance-engine';

// Helper to generate sparkline SVG path
function generateSparklinePath(data: number[], width: number, height: number): string {
  if (!data.length) return '';
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1 || 1);
  
  return data.map((val, i) => {
    const x = i * step;
    const y = height - ((val - min) / range) * height;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
}

// Traffic light component
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

// KPI Card with sparkline
function KPICard({ 
  title, 
  value, 
  unit = '', 
  trend, 
  trendLabel, 
  sparklineData,
  color = 'var(--pinnacle-teal)',
  status = 'neutral'
}: { 
  title: string; 
  value: string | number; 
  unit?: string;
  trend?: number;
  trendLabel?: string;
  sparklineData?: number[];
  color?: string;
  status?: 'good' | 'warning' | 'bad' | 'neutral';
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
      padding: '1.5rem',
      border: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
    }}>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ 
          fontSize: '2.5rem', 
          fontWeight: 800, 
          color: statusColors[status],
          lineHeight: 1,
        }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: '1.25rem', color: 'var(--text-muted)' }}>{unit}</span>}
      </div>
      
      {/* Trend and Sparkline Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
        {trend !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              {trend >= 0 ? (
                <path d="M8 4L12 8L10.5 8L10.5 12L5.5 12L5.5 8L4 8L8 4Z" fill="#10B981" />
              ) : (
                <path d="M8 12L4 8L5.5 8L5.5 4L10.5 4L10.5 8L12 8L8 12Z" fill="#EF4444" />
              )}
            </svg>
            <span style={{ 
              fontSize: '0.8rem', 
              fontWeight: 600, 
              color: trend >= 0 ? '#10B981' : '#EF4444' 
            }}>
              {trend >= 0 ? '+' : ''}{trend}%
            </span>
            {trendLabel && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{trendLabel}</span>
            )}
          </div>
        )}
        
        {/* Sparkline */}
        {sparklineData && sparklineData.length > 1 && (
          <svg width="60" height="24" viewBox="0 0 60 24" style={{ opacity: 0.7 }}>
            <path
              d={generateSparklinePath(sparklineData, 60, 24)}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
}

// Attention Item Component
function AttentionItem({ 
  title, 
  subtitle, 
  value, 
  valueColor = 'var(--text-primary)',
  icon
}: { 
  title: string; 
  subtitle: string; 
  value: string;
  valueColor?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '1rem',
      background: 'var(--bg-secondary)',
      borderRadius: '10px',
      gap: '1rem',
    }}>
      {icon && (
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: 'var(--bg-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {icon}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{subtitle}</div>
      </div>
      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: valueColor, flexShrink: 0 }}>
        {value}
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const { filteredData, variancePeriod, metricsHistory } = useData();
  const data = filteredData;
  
  const [showVarianceModal, setShowVarianceModal] = useState(false);
  const [showExecutiveModal, setShowExecutiveModal] = useState(false);

  // Calculate overall health score and metrics
  const healthMetrics = useMemo(() => {
    const tasks = data.tasks || [];
    const wbsItems = data.wbsData?.items || [];
    
    // Calculate SPI and CPI
    let totalPV = 0, totalEV = 0, totalAC = 0;
    let totalBaselineHours = 0, totalActualHours = 0;
    let totalPercentComplete = 0, itemCount = 0;

    const sumValues = (items: any[]) => {
      items.forEach(item => {
        if (item.baselineCost || item.actualCost || item.baselineHours) {
          totalEV += (item.baselineCost || 0) * ((item.percentComplete || 0) / 100);
          totalAC += item.actualCost || 0;
          totalPV += item.baselineCost || 0;
          totalBaselineHours += item.baselineHours || 0;
          totalActualHours += item.actualHours || 0;
          totalPercentComplete += item.percentComplete || 0;
          itemCount++;
        }
        if (item.children?.length) sumValues(item.children);
      });
    };
    sumValues(wbsItems);

    // Also from tasks
    if (totalPV === 0) {
      tasks.forEach((task: any) => {
        totalEV += (task.baselineCost || task.budgetCost || 0) * ((task.percentComplete || 0) / 100);
        totalAC += task.actualCost || 0;
        totalPV += task.baselineCost || task.budgetCost || 0;
        totalBaselineHours += task.baselineHours || task.budgetHours || 0;
        totalActualHours += task.actualHours || 0;
        totalPercentComplete += task.percentComplete || 0;
        itemCount++;
      });
    }

    const avgPercentComplete = itemCount > 0 ? Math.round(totalPercentComplete / itemCount) : 0;
    
    // Calculate SPI and CPI
    let spi = 1, cpi = 1;
    if (totalPV > 0 && totalEV > 0) {
      spi = totalEV / totalPV;
      cpi = totalAC > 0 ? totalEV / totalAC : 1;
    } else if (totalBaselineHours > 0) {
      spi = totalActualHours / totalBaselineHours;
      const earnedHours = totalBaselineHours * (avgPercentComplete / 100);
      cpi = totalActualHours > 0 ? earnedHours / totalActualHours : 1;
    }

    // Calculate schedule variance in days
    const today = new Date();
    let scheduleDays = 0;
    let budgetVariance = 0;
    
    // Estimate schedule variance from milestones
    const milestones = data.milestones || [];
    const lateMilestones = milestones.filter((m: any) => 
      m.varianceDays && m.varianceDays > 0 && m.status !== 'Complete'
    );
    if (lateMilestones.length > 0) {
      scheduleDays = Math.max(...lateMilestones.map((m: any) => m.varianceDays || 0));
    }

    // Budget variance
    budgetVariance = totalAC > 0 && totalPV > 0 ? ((totalAC - totalPV) / totalPV) * 100 : 0;

    // Overall health score (0-100)
    let healthScore = 100;
    if (spi < 0.9) healthScore -= 25;
    else if (spi < 1) healthScore -= 10;
    if (cpi < 0.9) healthScore -= 25;
    else if (cpi < 1) healthScore -= 10;
    if (scheduleDays > 30) healthScore -= 20;
    else if (scheduleDays > 7) healthScore -= 10;
    healthScore = Math.max(0, Math.min(100, healthScore));

    // Status determination
    const scheduleStatus: 'green' | 'yellow' | 'red' = spi >= 1 ? 'green' : spi >= 0.9 ? 'yellow' : 'red';
    const budgetStatus: 'green' | 'yellow' | 'red' = cpi >= 1 ? 'green' : cpi >= 0.9 ? 'yellow' : 'red';
    const qualityStatus: 'green' | 'yellow' | 'red' = avgPercentComplete >= 80 ? 'green' : avgPercentComplete >= 50 ? 'yellow' : 'red';

    // Generate summary text
    let summary = '';
    if (spi >= 1 && cpi >= 1) {
      summary = `Project is on track - ${avgPercentComplete}% complete, on schedule and under budget`;
    } else if (spi >= 0.9 && cpi >= 0.9) {
      summary = `Project has minor variances - ${avgPercentComplete}% complete with small schedule/budget concerns`;
    } else {
      const issues = [];
      if (spi < 0.9) issues.push('behind schedule');
      if (cpi < 0.9) issues.push('over budget');
      summary = `Project needs attention - ${issues.join(' and ')}. Currently ${avgPercentComplete}% complete`;
    }

    return {
      healthScore,
      spi: Math.round(spi * 100) / 100,
      cpi: Math.round(cpi * 100) / 100,
      percentComplete: avgPercentComplete,
      scheduleDays,
      budgetVariance: Math.round(budgetVariance * 10) / 10,
      scheduleStatus,
      budgetStatus,
      qualityStatus,
      summary,
      totalHours: totalActualHours,
      baselineHours: totalBaselineHours,
    };
  }, [data]);

  // Calculate variance trends
  const varianceData = useMemo(() => {
    return {
      spi: calculateMetricVariance(metricsHistory, 'spi', variancePeriod),
      cpi: calculateMetricVariance(metricsHistory, 'cpi', variancePeriod),
      hours: calculateMetricVariance(metricsHistory, 'actual_hours', variancePeriod),
    };
  }, [metricsHistory, variancePeriod]);

  // Schedule risks (late milestones and slipping tasks)
  const scheduleRisks = useMemo(() => {
    const milestones = data.milestones || [];
    const risks = milestones
      .filter((m: any) => m.varianceDays && m.varianceDays > 0 && m.status !== 'Complete')
      .sort((a: any, b: any) => (b.varianceDays || 0) - (a.varianceDays || 0))
      .slice(0, 5)
      .map((m: any) => ({
        name: m.name || m.milestone,
        project: m.projectNum || m.project,
        variance: `+${m.varianceDays}d late`,
        status: m.status,
      }));
    return risks;
  }, [data.milestones]);

  // Budget concerns (over budget items)
  const budgetConcerns = useMemo(() => {
    const tasks = data.tasks || [];
    const concerns = tasks
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
          variance: `+${Math.round(variance)}% over`,
          hours: `${actual}/${baseline} hrs`,
        };
      })
      .sort((a: any, b: any) => parseFloat(b.variance) - parseFloat(a.variance))
      .slice(0, 5);
    return concerns;
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
      )
      .slice(0, 6);
  }, [data.milestones]);

  // Team performance
  const teamPerformance = useMemo(() => {
    const tasks = data.tasks || [];
    const resourceStats = new Map<string, { hours: number; baseline: number; tasks: number }>();
    
    tasks.forEach((t: any) => {
      const resource = t.assignedResource || t.employeeName || t.assignedTo || 'Unassigned';
      if (resource === 'Unassigned') return;
      
      const baseline = t.baselineHours || t.budgetHours || 0;
      const actual = t.actualHours || 0;
      
      if (!resourceStats.has(resource)) {
        resourceStats.set(resource, { hours: 0, baseline: 0, tasks: 0 });
      }
      const stats = resourceStats.get(resource)!;
      stats.hours += actual;
      stats.baseline += baseline;
      stats.tasks += 1;
    });

    const performers = Array.from(resourceStats.entries())
      .filter(([_, s]) => s.baseline > 0)
      .map(([name, s]) => ({
        name,
        efficiency: Math.round((s.hours / s.baseline) * 100),
        tasks: s.tasks,
        hours: s.hours,
      }))
      .sort((a, b) => a.efficiency - b.efficiency);

    return {
      top: performers.slice(0, 3),
      needsAttention: performers.filter(p => p.efficiency > 110).slice(0, 3),
    };
  }, [data.tasks]);

  // Health score color
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
          {/* Health Score */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              background: `conic-gradient(${healthColor} ${healthMetrics.healthScore * 3.6}deg, var(--bg-tertiary) 0deg)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}>
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
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, marginBottom: '0.5rem' }}>
                Portfolio Overview
              </h1>
              <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0, maxWidth: '500px' }}>
                {healthMetrics.summary}
              </p>
            </div>
          </div>

          {/* Traffic Lights */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <TrafficLight status={healthMetrics.scheduleStatus} label="Schedule" />
            <TrafficLight status={healthMetrics.budgetStatus} label="Budget" />
            <TrafficLight status={healthMetrics.qualityStatus} label="Quality" />
          </div>
        </div>
      </div>

      {/* SECTION 2: Key Performance Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        <KPICard
          title="Schedule Performance (SPI)"
          value={healthMetrics.spi.toFixed(2)}
          trend={varianceData.spi?.percentChange}
          trendLabel="vs last period"
          status={healthMetrics.spi >= 1 ? 'good' : healthMetrics.spi >= 0.9 ? 'warning' : 'bad'}
          color="#40E0D0"
        />
        <KPICard
          title="Cost Performance (CPI)"
          value={healthMetrics.cpi.toFixed(2)}
          trend={varianceData.cpi?.percentChange}
          trendLabel="vs last period"
          status={healthMetrics.cpi >= 1 ? 'good' : healthMetrics.cpi >= 0.9 ? 'warning' : 'bad'}
          color="#CDDC39"
        />
        <KPICard
          title="Percent Complete"
          value={healthMetrics.percentComplete}
          unit="%"
          status={healthMetrics.percentComplete >= 80 ? 'good' : healthMetrics.percentComplete >= 50 ? 'warning' : 'neutral'}
          color="#3B82F6"
        />
        <KPICard
          title="Forecast Variance"
          value={healthMetrics.budgetVariance > 0 ? `+${healthMetrics.budgetVariance}` : healthMetrics.budgetVariance}
          unit="%"
          status={healthMetrics.budgetVariance <= 0 ? 'good' : healthMetrics.budgetVariance <= 10 ? 'warning' : 'bad'}
          color="#E91E63"
        />
      </div>

      {/* SECTION 3: What Needs Attention */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1.5rem',
        marginBottom: '2rem',
      }}>
        {/* Schedule Risks */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Schedule Risks</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Late or at-risk items</span>
            </div>
          </div>
          <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {scheduleRisks.length > 0 ? scheduleRisks.map((risk, idx) => (
              <AttentionItem
                key={idx}
                title={risk.name}
                subtitle={risk.project}
                value={risk.variance}
                valueColor="#EF4444"
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                }
              />
            )) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No schedule risks identified
              </div>
            )}
          </div>
        </div>

        {/* Budget Concerns */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Budget Concerns</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Over-budget items</span>
            </div>
          </div>
          <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {budgetConcerns.length > 0 ? budgetConcerns.map((concern, idx) => (
              <AttentionItem
                key={idx}
                title={concern.name}
                subtitle={concern.hours}
                value={concern.variance}
                valueColor="#F59E0B"
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                }
              />
            )) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No budget concerns identified
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 4: Milestones Timeline */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        marginBottom: '2rem',
        overflow: 'hidden',
      }}>
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
              background: 'rgba(64, 224, 208, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
                <path d="M5 3v18M5 12h14l-7-7M5 12l7 7" />
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Upcoming Milestones</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Next 30 days</span>
            </div>
          </div>
        </div>
        
        <div style={{ padding: '1.25rem', overflowX: 'auto' }}>
          {upcomingMilestones.length > 0 ? (
            <div style={{ display: 'flex', gap: '1rem', minWidth: 'max-content' }}>
              {upcomingMilestones.map((m: any, idx: number) => {
                const planned = new Date(m.plannedCompletion);
                const isLate = m.varianceDays && m.varianceDays > 0;
                const isAtRisk = m.status === 'At Risk';
                
                return (
                  <div
                    key={idx}
                    style={{
                      minWidth: '180px',
                      padding: '1rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '12px',
                      borderLeft: `4px solid ${isLate ? '#EF4444' : isAtRisk ? '#F59E0B' : '#10B981'}`,
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                      {planned.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                      {m.name || m.milestone}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: isLate ? 'rgba(239, 68, 68, 0.15)' : isAtRisk ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        color: isLate ? '#EF4444' : isAtRisk ? '#F59E0B' : '#10B981',
                        fontWeight: 600,
                      }}>
                        {m.status || 'Pending'}
                      </span>
                      {m.varianceDays != null && m.varianceDays !== 0 && (
                        <span style={{ fontSize: '0.7rem', color: m.varianceDays > 0 ? '#EF4444' : '#10B981' }}>
                          {m.varianceDays > 0 ? '+' : ''}{m.varianceDays}d
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No upcoming milestones in the next 30 days
            </div>
          )}
        </div>
      </div>

      {/* SECTION 5: Team Performance */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1.5rem',
        marginBottom: '2rem',
      }}>
        {/* Top Performers */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          borderTop: '4px solid #10B981',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#10B981' }}>Top Performers</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Best hours efficiency</span>
          </div>
          <div style={{ padding: '0.75rem' }}>
            {teamPerformance.top.length > 0 ? teamPerformance.top.map((p, idx) => (
              <div key={idx} style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.75rem',
                gap: '1rem',
                borderBottom: idx < teamPerformance.top.length - 1 ? '1px solid var(--border-color)' : 'none',
              }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: idx === 0 ? '#10B981' : 'var(--bg-tertiary)',
                  color: idx === 0 ? '#fff' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}>
                  {idx + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.tasks} tasks</div>
                </div>
                <div style={{ fontWeight: 700, color: '#10B981' }}>{p.efficiency}%</div>
              </div>
            )) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No performance data available
              </div>
            )}
          </div>
        </div>

        {/* Needs Attention */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          borderTop: '4px solid #F59E0B',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#F59E0B' }}>Needs Attention</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Over 110% of baseline hours</span>
          </div>
          <div style={{ padding: '0.75rem' }}>
            {teamPerformance.needsAttention.length > 0 ? teamPerformance.needsAttention.map((p, idx) => (
              <div key={idx} style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.75rem',
                gap: '1rem',
                borderBottom: idx < teamPerformance.needsAttention.length - 1 ? '1px solid var(--border-color)' : 'none',
              }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}>
                  {idx + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.tasks} tasks</div>
                </div>
                <div style={{ fontWeight: 700, color: '#F59E0B' }}>{p.efficiency}%</div>
              </div>
            )) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                All resources within budget
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 6: Quick Actions */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'var(--bg-secondary)',
        borderRadius: '16px',
      }}>
        <button
          onClick={() => setShowVarianceModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
            background: 'linear-gradient(135deg, rgba(64, 224, 208, 0.15) 0%, rgba(205, 220, 57, 0.1) 100%)',
            border: '1px solid var(--pinnacle-teal)',
            borderRadius: '10px',
            color: 'var(--pinnacle-teal)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3v18h18" />
            <path d="M7 16l4-4 4 4 6-6" />
          </svg>
          View Variance Analysis
        </button>
        
        <button
          onClick={() => setShowExecutiveModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
            background: 'linear-gradient(135deg, rgba(233, 30, 99, 0.15) 0%, rgba(156, 39, 176, 0.1) 100%)',
            border: '1px solid #E91E63',
            borderRadius: '10px',
            color: '#E91E63',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          Open Executive Dashboard
        </button>
      </div>

      {/* Modals */}
      <VarianceTrendsModal
        isOpen={showVarianceModal}
        onClose={() => setShowVarianceModal(false)}
      />
      
      <ExecutiveVarianceDashboard
        isOpen={showExecutiveModal}
        onClose={() => setShowExecutiveModal(false)}
      />
    </div>
  );
}
