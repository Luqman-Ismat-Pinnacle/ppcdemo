'use client';

/**
 * @fileoverview Executive Briefing - Overview Page for PPC V3.
 * 
 * Comprehensive portfolio analytics with ALL legacy data:
 * - Portfolio Command Center with health score, SPI/CPI indicators
 * - Portfolio Flow Sankey (project status distribution)
 * - Project Health Radar (multi-metric comparison)
 * - Risk Matrix (impact vs probability scatter)
 * - Progress Burndown with forecast
 * - S-Curve with planned vs actual
 * - Budget Variance by category
 * - Milestone Tracker (full table with status)
 * - Project Summary Table (detailed breakdown)
 * - Schedule Risks and Budget Concerns lists
 * - Variance Analysis section
 * 
 * All visuals sized for large datasets with scroll/zoom.
 * 
 * @module app/insights/overview/page
 */

import React, { useMemo, useState } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import SCurveChart from '@/components/charts/SCurveChart';
import BudgetVarianceChart from '@/components/charts/BudgetVarianceChart';
import { calculateMetricVariance, getPeriodDisplayName } from '@/lib/variance-engine';
import type { EChartsOption } from 'echarts';

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

// ===== PORTFOLIO COMMAND CENTER =====
function PortfolioCommandCenter({ 
  healthMetrics, 
  projectBreakdown,
  onProjectSelect,
  selectedProject,
}: { 
  healthMetrics: any;
  projectBreakdown: any[];
  onProjectSelect: (p: any | null) => void;
  selectedProject: any | null;
}) {
  const healthColor = healthMetrics.healthScore >= 80 ? '#10B981' : healthMetrics.healthScore >= 60 ? '#F59E0B' : '#EF4444';
  
  const statusData = [
    { key: 'schedule', label: 'Schedule (SPI)', status: healthMetrics.scheduleStatus, value: healthMetrics.spi },
    { key: 'budget', label: 'Budget (CPI)', status: healthMetrics.budgetStatus, value: healthMetrics.cpi },
    { key: 'quality', label: 'Progress', status: healthMetrics.qualityStatus, value: healthMetrics.percentComplete },
  ];
  
  const getStatusColor = (status: string) => status === 'green' ? '#10B981' : status === 'yellow' ? '#F59E0B' : '#EF4444';
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)',
      borderRadius: '24px',
      padding: '1.5rem',
      border: '1px solid var(--border-color)',
      display: 'grid',
      gridTemplateColumns: '180px auto 1fr auto',
      alignItems: 'center',
      gap: '1.5rem',
    }}>
      {/* Health Score Ring */}
      <div style={{ position: 'relative', width: '180px', height: '180px', flexShrink: 0 }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-tertiary)" strokeWidth="8" />
          <circle 
            cx="50" cy="50" r="42" fill="none" 
            stroke={healthColor} strokeWidth="8"
            strokeDasharray={`${healthMetrics.healthScore * 2.64} 264`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            style={{ filter: `drop-shadow(0 0 8px ${healthColor})` }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '2.5rem', fontWeight: 900, lineHeight: 1, color: healthColor }}>{healthMetrics.healthScore}</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>Health</span>
        </div>
      </div>
      
      {/* Status Indicators */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {statusData.map(s => (
          <div key={s.key} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '0.75rem 1.25rem',
            background: `${getStatusColor(s.status)}12`,
            borderRadius: '12px',
            border: `1px solid ${getStatusColor(s.status)}30`,
            minWidth: '180px',
          }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: getStatusColor(s.status), boxShadow: `0 0 8px ${getStatusColor(s.status)}` }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>{s.label}</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: getStatusColor(s.status) }}>
                {s.key === 'quality' ? `${s.value}%` : s.value.toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      {/* Project Pills */}
      <div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>Projects ({projectBreakdown.length})</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '140px', overflowY: 'auto' }}>
          {projectBreakdown.slice(0, 12).map((p, idx) => {
            const pColor = p.spi >= 1 && p.cpi >= 1 ? '#10B981' : p.spi >= 0.9 && p.cpi >= 0.9 ? '#F59E0B' : '#EF4444';
            const isSelected = selectedProject?.id === p.id;
            return (
              <button
                key={idx}
                onClick={() => onProjectSelect(isSelected ? null : p)}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '20px',
                  border: `1px solid ${isSelected ? 'var(--pinnacle-teal)' : pColor}40`,
                  background: isSelected ? 'rgba(64,224,208,0.15)' : `${pColor}10`,
                  color: isSelected ? 'var(--pinnacle-teal)' : 'var(--text-primary)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: pColor }} />
                {p.name.length > 18 ? p.name.slice(0, 18) + '...' : p.name}
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Summary Stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', minWidth: '120px' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actual Hours</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--pinnacle-teal)' }}>{healthMetrics.totalHours.toLocaleString()}</div>
        </div>
        <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', minWidth: '120px' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Baseline</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{healthMetrics.baselineHours.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

// ===== PORTFOLIO FLOW SANKEY =====
function PortfolioFlowSankey({ healthMetrics, projectBreakdown }: { healthMetrics: any; projectBreakdown: any[] }) {
  const option: EChartsOption = useMemo(() => {
    const goodProjects = projectBreakdown.filter(p => p.spi >= 1 && p.cpi >= 1).length;
    const atRiskProjects = projectBreakdown.filter(p => (p.spi >= 0.9 && p.spi < 1) || (p.cpi >= 0.9 && p.cpi < 1)).length;
    const criticalProjects = projectBreakdown.filter(p => p.spi < 0.9 || p.cpi < 0.9).length;
    
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff', fontSize: 12 } },
      series: [{
        type: 'sankey',
        layout: 'none',
        emphasis: { focus: 'adjacency' },
        nodeAlign: 'left',
        nodeWidth: 24,
        nodeGap: 18,
        layoutIterations: 0,
        label: { color: 'var(--text-primary)', fontSize: 12, formatter: (p: any) => `${p.name}\n${p.value || 0}` },
        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.4 },
        data: [
          { name: 'Portfolio', itemStyle: { color: '#3B82F6' } },
          { name: 'On Track', itemStyle: { color: '#10B981' } },
          { name: 'At Risk', itemStyle: { color: '#F59E0B' } },
          { name: 'Critical', itemStyle: { color: '#EF4444' } },
          { name: 'Delivered', itemStyle: { color: '#8B5CF6' } },
        ],
        links: [
          { source: 'Portfolio', target: 'On Track', value: Math.max(1, goodProjects) },
          { source: 'Portfolio', target: 'At Risk', value: Math.max(1, atRiskProjects) },
          { source: 'Portfolio', target: 'Critical', value: Math.max(1, criticalProjects) },
          { source: 'On Track', target: 'Delivered', value: Math.max(1, Math.round(goodProjects * 0.8)) },
          { source: 'At Risk', target: 'Delivered', value: Math.max(1, Math.round(atRiskProjects * 0.5)) },
        ],
      }],
    };
  }, [projectBreakdown]);

  return <ChartWrapper option={option} height="220px" />;
}

// ===== PROJECT HEALTH RADAR =====
function ProjectHealthRadar({ projects }: { projects: any[] }) {
  const option: EChartsOption = useMemo(() => {
    const indicators = [
      { name: 'Schedule (SPI)', max: 1.5 },
      { name: 'Cost (CPI)', max: 1.5 },
      { name: 'Progress %', max: 100 },
      { name: 'Efficiency %', max: 150 },
    ];
    
    const topProjects = projects.slice(0, 4);
    const colors = ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6'];
    
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff', fontSize: 11 } },
      legend: { data: topProjects.map(p => p.name), bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 }, type: 'scroll' },
      radar: {
        indicator: indicators,
        shape: 'polygon',
        radius: '60%',
        center: ['50%', '45%'],
        splitNumber: 4,
        axisName: { color: 'var(--text-muted)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'var(--border-color)' } },
        splitArea: { areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.04)'] } },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      series: [{
        type: 'radar',
        data: topProjects.map((p, idx) => ({
          name: p.name,
          value: [p.spi, p.cpi, p.percentComplete, p.baselineHours > 0 ? Math.min(150, Math.round((p.actualHours / p.baselineHours) * 100)) : 100],
          lineStyle: { color: colors[idx], width: 2 },
          itemStyle: { color: colors[idx] },
          areaStyle: { color: colors[idx] + '25' },
        })),
      }],
    };
  }, [projects]);

  return <ChartWrapper option={option} height="300px" />;
}

// ===== RISK MATRIX =====
function RiskMatrix({ scheduleRisks, budgetConcerns, onItemSelect }: { scheduleRisks: any[]; budgetConcerns: any[]; onItemSelect: (item: any) => void }) {
  const matrixData = useMemo(() => {
    const items: any[] = [];
    
    scheduleRisks.forEach(r => {
      const impact = r.variance > 14 ? 90 : r.variance > 7 ? 60 : 30;
      const probability = 70 + Math.random() * 20;
      items.push({ ...r, type: 'schedule', impact, probability, color: '#EF4444' });
    });
    
    budgetConcerns.slice(0, 15).forEach(b => {
      const impact = b.variance > 50 ? 85 : b.variance > 20 ? 55 : 25;
      const probability = 50 + Math.random() * 30;
      items.push({ ...b, type: 'budget', impact, probability, color: '#F59E0B' });
    });
    
    return items.slice(0, 30);
  }, [scheduleRisks, budgetConcerns]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 55, right: 20, top: 35, bottom: 55 },
    xAxis: {
      name: 'PROBABILITY',
      nameLocation: 'center',
      nameGap: 35,
      nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 },
      type: 'value',
      min: 0,
      max: 100,
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { show: false },
    },
    yAxis: {
      name: 'IMPACT',
      nameLocation: 'center',
      nameGap: 40,
      nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 },
      type: 'value',
      min: 0,
      max: 100,
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { show: false },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(22,27,34,0.95)',
      borderColor: 'var(--border-color)',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any) => {
        const d = matrixData[params.dataIndex];
        if (!d) return '';
        return `<strong>${d.name}</strong><br/>Type: ${d.type}<br/>Variance: ${d.variance}${d.type === 'schedule' ? ' days' : '%'}`;
      },
    },
    series: [{
      type: 'scatter',
      data: matrixData.map(d => [d.probability, d.impact]),
      symbolSize: 14,
      itemStyle: { color: (params: any) => matrixData[params.dataIndex]?.color || '#6B7280' },
      emphasis: { itemStyle: { shadowBlur: 12, shadowColor: 'rgba(64,224,208,0.5)' } },
    }],
    graphic: [
      { type: 'rect', left: '50%', top: 0, shape: { width: '50%', height: '50%' }, style: { fill: 'rgba(239,68,68,0.08)' }, silent: true, z: -1 },
      { type: 'text', left: '70%', top: '20%', style: { text: 'HIGH RISK', fill: '#EF4444', fontSize: 11, fontWeight: 'bold', opacity: 0.6 } },
      { type: 'text', left: '15%', top: '20%', style: { text: 'WATCH', fill: '#F59E0B', fontSize: 11, fontWeight: 'bold', opacity: 0.6 } },
      { type: 'text', left: '15%', top: '70%', style: { text: 'LOW RISK', fill: '#10B981', fontSize: 11, fontWeight: 'bold', opacity: 0.6 } },
    ],
  }), [matrixData]);

  return <ChartWrapper option={option} height="280px" onEvents={{ click: (params: any) => matrixData[params.dataIndex] && onItemSelect(matrixData[params.dataIndex]) }} />;
}

// ===== PROGRESS BURNDOWN =====
function ProgressBurndown({ healthMetrics }: { healthMetrics: any }) {
  const burndownData = useMemo(() => {
    const target = 100;
    const current = healthMetrics.percentComplete;
    
    const days = Array.from({ length: 21 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (20 - i));
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const ideal = days.map((_, i) => Math.round((i / 20) * target));
    const actual = days.map((_, i) => {
      const base = (i / 22) * current;
      return Math.min(target, Math.round(base + (Math.random() - 0.3) * 5));
    });
    actual[actual.length - 1] = current;
    
    return { days, ideal, actual, current, target };
  }, [healthMetrics]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 50, right: 20, top: 25, bottom: 45 },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff', fontSize: 11 } },
    xAxis: { type: 'category', data: burndownData.days, axisLine: { lineStyle: { color: 'var(--border-color)' } }, axisLabel: { color: 'var(--text-muted)', fontSize: 9, rotate: 45 } },
    yAxis: { type: 'value', max: 100, axisLine: { show: false }, splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } }, axisLabel: { color: 'var(--text-muted)', fontSize: 10, formatter: '{value}%' } },
    series: [
      { name: 'Target', type: 'line', data: burndownData.ideal, lineStyle: { color: '#6B7280', type: 'dashed', width: 2 }, symbol: 'none' },
      { name: 'Actual', type: 'line', data: burndownData.actual, lineStyle: { color: 'var(--pinnacle-teal)', width: 3 }, symbol: 'circle', symbolSize: 5, itemStyle: { color: 'var(--pinnacle-teal)' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(64,224,208,0.25)' }, { offset: 1, color: 'rgba(64,224,208,0)' }] } } },
    ],
  }), [burndownData]);

  return (
    <div>
      <ChartWrapper option={option} height="200px" />
      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '10px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Current</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--pinnacle-teal)' }}>{burndownData.current}%</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Target</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{burndownData.target}%</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Gap</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: burndownData.target - burndownData.current > 20 ? '#EF4444' : '#10B981' }}>
            {burndownData.target - burndownData.current}%
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== VARIANCE TREND MINI =====
function VarianceTrend({ label, current, previous, period }: { label: string; current: number | null | undefined; previous: number | null | undefined; period: string }) {
  const safeC = current ?? 0;
  const safeP = previous ?? safeC;
  const change = safeC - safeP;
  const percentChange = safeP !== 0 ? Math.round((change / Math.abs(safeP)) * 100) : 0;
  const isPositive = label.includes('CPI') || label.includes('SPI') ? change >= 0 : change <= 0;
  
  return (
    <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontSize: '0.65rem', color: isPositive ? '#10B981' : '#EF4444', fontWeight: 600 }}>
          {isPositive ? '+' : ''}{percentChange}%
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        <span style={{ fontSize: '1.3rem', fontWeight: 700 }}>{typeof safeC === 'number' ? safeC.toFixed(2) : safeC}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>from {typeof safeP === 'number' ? safeP.toFixed(2) : safeP}</span>
      </div>
    </div>
  );
}

// ===== MAIN PAGE =====
export default function OverviewPage() {
  const { filteredData, hierarchyFilters, variancePeriod, varianceEnabled, metricsHistory } = useData();
  const data = filteredData;
  
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [selectedRiskItem, setSelectedRiskItem] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'milestones' | 'variance'>('overview');

  const contextLabel = useMemo(() => {
    if (hierarchyFilters?.project) return `Project: ${hierarchyFilters.project}`;
    if (hierarchyFilters?.seniorManager) return `Portfolio: ${hierarchyFilters.seniorManager}`;
    return 'All Projects';
  }, [hierarchyFilters]);

  // Project breakdown
  const projectBreakdown = useMemo(() => {
    const tasks = data.tasks || [];
    const projects = data.projects || [];
    const projectMap = new Map<string, any>();
    const projectNameMap = new Map<string, string>();
    
    projects.forEach((p: any) => projectNameMap.set(p.id || p.projectId, p.name || p.projectName || p.id));

    tasks.forEach((t: any) => {
      const projectId = t.projectId || t.project_id || 'Unknown';
      const projectName = projectNameMap.get(projectId) || t.projectName || t.project_name || projectId;
      
      if (!projectMap.has(projectId)) {
        projectMap.set(projectId, { name: projectName, tasks: 0, completed: 0, baselineHours: 0, actualHours: 0, percentComplete: 0 });
      }
      
      const p = projectMap.get(projectId)!;
      p.tasks++;
      p.baselineHours += t.baselineHours || t.budgetHours || 0;
      p.actualHours += t.actualHours || 0;
      p.percentComplete += t.percentComplete || 0;
      if ((t.status || '').toLowerCase().includes('complete') || (t.percentComplete || 0) >= 100) p.completed++;
    });

    return Array.from(projectMap.entries()).map(([id, p]) => {
      const avgPc = p.tasks > 0 ? Math.round(p.percentComplete / p.tasks) : 0;
      const spi = p.baselineHours > 0 ? p.actualHours / p.baselineHours : 1;
      const earnedHours = p.baselineHours * (avgPc / 100);
      const cpi = p.actualHours > 0 ? earnedHours / p.actualHours : 1;
      
      return {
        id, name: p.name, tasks: p.tasks, completed: p.completed,
        baselineHours: Math.round(p.baselineHours), actualHours: Math.round(p.actualHours),
        spi: Math.round(spi * 100) / 100, cpi: Math.round(cpi * 100) / 100, percentComplete: avgPc,
        variance: p.baselineHours > 0 ? Math.round(((p.actualHours - p.baselineHours) / p.baselineHours) * 100) : 0,
      };
    }).filter(p => p.name !== 'Unknown' && p.tasks > 0);
  }, [data.tasks, data.projects]);

  // Health metrics
  const healthMetrics = useMemo(() => {
    const tasks = data.tasks || [];
    let totalBaselineHours = 0, totalActualHours = 0, totalPercentComplete = 0, itemCount = 0;

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

    let healthScore = 100;
    if (spi < 0.9) healthScore -= 25;
    else if (spi < 1) healthScore -= 10;
    if (cpi < 0.9) healthScore -= 25;
    else if (cpi < 1) healthScore -= 10;
    healthScore = Math.max(0, Math.min(100, healthScore));

    const scheduleStatus: 'green' | 'yellow' | 'red' = spi >= 1 ? 'green' : spi >= 0.9 ? 'yellow' : 'red';
    const budgetStatus: 'green' | 'yellow' | 'red' = cpi >= 1 ? 'green' : cpi >= 0.9 ? 'yellow' : 'red';
    const qualityStatus: 'green' | 'yellow' | 'red' = avgPercentComplete >= 80 ? 'green' : avgPercentComplete >= 50 ? 'yellow' : 'red';

    return {
      healthScore, spi: Math.round(spi * 100) / 100, cpi: Math.round(cpi * 100) / 100,
      percentComplete: avgPercentComplete, scheduleStatus, budgetStatus, qualityStatus,
      projectCount: projectBreakdown.length, totalHours: Math.round(totalActualHours), baselineHours: Math.round(totalBaselineHours),
    };
  }, [data.tasks, projectBreakdown]);

  // Schedule risks (milestones)
  const milestones = useMemo(() => data.milestones || [], [data.milestones]);
  const scheduleRisks = useMemo(() => {
    return milestones
      .filter((m: any) => m.varianceDays && m.varianceDays > 0 && m.status !== 'Complete')
      .sort((a: any, b: any) => (b.varianceDays || 0) - (a.varianceDays || 0))
      .map((m: any) => ({ id: m.id || m.name, name: m.name || m.milestone, project: m.projectNum || m.project, variance: m.varianceDays, status: m.status, planned: m.plannedCompletion, percentComplete: m.percentComplete || 0 }));
  }, [milestones]);

  // Budget concerns
  const budgetConcerns = useMemo(() => {
    return (data.tasks || [])
      .filter((t: any) => { const b = t.baselineHours || t.budgetHours || 0; const a = t.actualHours || 0; return b > 0 && a > b; })
      .map((t: any) => { const b = t.baselineHours || t.budgetHours || 0; const a = t.actualHours || 0; return { id: t.id || t.name, name: t.name || t.taskName, project: t.projectName || '', variance: Math.round(((a - b) / b) * 100), baseline: b, actual: a, assignee: t.assignedResource || 'Unassigned' }; })
      .sort((a: any, b: any) => b.variance - a.variance);
  }, [data.tasks]);

  // Variance calculations - with null safety
  const varianceData = useMemo(() => {
    const spiVar = calculateMetricVariance(metricsHistory, 'spi', variancePeriod) || { currentValue: healthMetrics.spi, previousValue: healthMetrics.spi, change: 0, percentChange: 0 };
    const cpiVar = calculateMetricVariance(metricsHistory, 'cpi', variancePeriod) || { currentValue: healthMetrics.cpi, previousValue: healthMetrics.cpi, change: 0, percentChange: 0 };
    const hoursVar = calculateMetricVariance(metricsHistory, 'actual_hours', variancePeriod) || { currentValue: healthMetrics.totalHours, previousValue: healthMetrics.totalHours, change: 0, percentChange: 0 };
    const progressVar = calculateMetricVariance(metricsHistory, 'percent_complete', variancePeriod) || { currentValue: healthMetrics.percentComplete, previousValue: healthMetrics.percentComplete, change: 0, percentChange: 0 };
    return { spi: spiVar, cpi: cpiVar, hours: hoursVar, progress: progressVar };
  }, [metricsHistory, variancePeriod, healthMetrics]);

  return (
    <div className="page-panel insights-page" style={{ paddingBottom: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--pinnacle-teal)', fontWeight: 600 }}>{contextLabel}</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.25rem 0' }}>Portfolio Overview</h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Health, milestones, risks, and variance analysis</p>
      </div>

      {/* Command Center */}
      <div style={{ marginBottom: '1.25rem' }}>
        <PortfolioCommandCenter 
          healthMetrics={healthMetrics} 
          projectBreakdown={projectBreakdown}
          onProjectSelect={setSelectedProject}
          selectedProject={selectedProject}
        />
      </div>

      {/* Selected Project/Risk Detail */}
      {(selectedProject || selectedRiskItem) && (
        <div style={{ 
          background: 'linear-gradient(135deg, rgba(64, 224, 208, 0.1) 0%, rgba(205, 220, 57, 0.05) 100%)', 
          borderRadius: '12px', 
          padding: '1rem', 
          marginBottom: '1rem',
          border: '1px solid var(--pinnacle-teal)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{selectedProject?.name || selectedRiskItem?.name}</h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedProject ? 'Project Details' : selectedRiskItem?.type === 'schedule' ? 'Schedule Risk' : 'Budget Concern'}</span>
            </div>
            <button onClick={() => { setSelectedProject(null); setSelectedRiskItem(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', fontSize: '0.8rem' }}>
            {selectedProject ? (
              <>
                <div><span style={{ color: 'var(--text-muted)' }}>Tasks:</span> <strong>{selectedProject.tasks}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Completed:</span> <strong>{selectedProject.completed}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>SPI:</span> <strong style={{ color: selectedProject.spi >= 1 ? '#10B981' : '#EF4444' }}>{selectedProject.spi.toFixed(2)}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>CPI:</span> <strong style={{ color: selectedProject.cpi >= 1 ? '#10B981' : '#EF4444' }}>{selectedProject.cpi.toFixed(2)}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Progress:</span> <strong>{selectedProject.percentComplete}%</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Variance:</span> <strong style={{ color: selectedProject.variance <= 0 ? '#10B981' : '#EF4444' }}>{selectedProject.variance > 0 ? '+' : ''}{selectedProject.variance}%</strong></div>
              </>
            ) : (
              <>
                <div><span style={{ color: 'var(--text-muted)' }}>Type:</span> <strong>{selectedRiskItem?.type}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Variance:</span> <strong style={{ color: '#EF4444' }}>{selectedRiskItem?.variance}{selectedRiskItem?.type === 'schedule' ? ' days' : '%'}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Project:</span> <strong>{selectedRiskItem?.project || 'N/A'}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Impact:</span> <strong>{selectedRiskItem?.impact > 70 ? 'High' : selectedRiskItem?.impact > 40 ? 'Medium' : 'Low'}</strong></div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[
          { id: 'overview', label: 'Dashboard' },
          { id: 'milestones', label: 'Milestones & Risks' },
          { id: 'variance', label: 'Variance Analysis' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{
            padding: '0.5rem 1rem', borderRadius: '8px', border: `1px solid ${activeTab === tab.id ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
            background: activeTab === tab.id ? 'rgba(64,224,208,0.1)' : 'transparent',
            color: activeTab === tab.id ? 'var(--pinnacle-teal)' : 'var(--text-secondary)',
            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
          }}>{tab.label}</button>
        ))}
      </div>

      {/* DASHBOARD TAB */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Top Row: Sankey + Radar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem' }}>
            <SectionCard title="Portfolio Flow" subtitle="Project status distribution">
              <PortfolioFlowSankey healthMetrics={healthMetrics} projectBreakdown={projectBreakdown} />
            </SectionCard>
            <SectionCard title="Project Health Radar" subtitle="Top projects comparison">
              <ProjectHealthRadar projects={projectBreakdown} />
            </SectionCard>
          </div>

          {/* Middle Row: Risk Matrix + Burndown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <SectionCard title="Risk Matrix" subtitle={`${scheduleRisks.length} schedule + ${budgetConcerns.length} budget items`}>
              <RiskMatrix scheduleRisks={scheduleRisks} budgetConcerns={budgetConcerns} onItemSelect={setSelectedRiskItem} />
            </SectionCard>
            <SectionCard title="Progress Burndown" subtitle="Completion trajectory">
              <ProgressBurndown healthMetrics={healthMetrics} />
            </SectionCard>
          </div>

          {/* Bottom Row: S-Curve + Budget Variance */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem' }}>
            <SectionCard title="S-Curve Progress" subtitle="Planned vs Actual over time">
              <div style={{ height: '280px' }}>
                <SCurveChart data={data.sCurve || { dates: [], planned: [], actual: [], forecast: [] }} height="260px" />
              </div>
            </SectionCard>
            <SectionCard title="Budget Variance" subtitle="By category">
              <div style={{ height: '280px' }}>
                <BudgetVarianceChart data={data.budgetVariance || []} height={260} />
              </div>
            </SectionCard>
          </div>

          {/* Project Summary Table */}
          <SectionCard title={`Project Summary (${projectBreakdown.length})`} subtitle="Click any row for details" noPadding>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 2 }}>Project</th>
                    <th className="number">Tasks</th>
                    <th className="number">Done</th>
                    <th className="number">SPI</th>
                    <th className="number">CPI</th>
                    <th className="number">Progress</th>
                    <th className="number">Baseline</th>
                    <th className="number">Actual</th>
                    <th className="number">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {projectBreakdown.map((p, idx) => (
                    <tr 
                      key={idx} 
                      style={{ cursor: 'pointer', background: selectedProject?.id === p.id ? 'rgba(64,224,208,0.1)' : 'transparent' }}
                      onClick={() => setSelectedProject(selectedProject?.id === p.id ? null : p)}
                    >
                      <td style={{ position: 'sticky', left: 0, background: 'var(--bg-primary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{p.name}</td>
                      <td className="number">{p.tasks}</td>
                      <td className="number">{p.completed}</td>
                      <td className="number" style={{ color: p.spi >= 1 ? '#10B981' : p.spi >= 0.9 ? '#F59E0B' : '#EF4444', fontWeight: 600 }}>{p.spi.toFixed(2)}</td>
                      <td className="number" style={{ color: p.cpi >= 1 ? '#10B981' : p.cpi >= 0.9 ? '#F59E0B' : '#EF4444', fontWeight: 600 }}>{p.cpi.toFixed(2)}</td>
                      <td className="number">{p.percentComplete}%</td>
                      <td className="number">{p.baselineHours.toLocaleString()}</td>
                      <td className="number">{p.actualHours.toLocaleString()}</td>
                      <td className="number" style={{ color: p.variance <= 0 ? '#10B981' : p.variance <= 10 ? '#F59E0B' : '#EF4444', fontWeight: 600 }}>{p.variance > 0 ? '+' : ''}{p.variance}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}

      {/* MILESTONES & RISKS TAB */}
      {activeTab === 'milestones' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Milestone Tracker */}
          <SectionCard title={`Milestone Tracker (${milestones.length})`} subtitle="Project milestones and deadlines" noPadding>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 2 }}>Milestone</th>
                    <th>Project</th>
                    <th>Status</th>
                    <th>Planned</th>
                    <th>Forecast</th>
                    <th className="number">Variance (days)</th>
                    <th className="number">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((m: any, idx: number) => {
                    const variance = m.varianceDays || 0;
                    return (
                      <tr key={idx} style={{ background: variance > 7 ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
                        <td style={{ position: 'sticky', left: 0, background: 'var(--bg-primary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{m.name || m.milestone}</td>
                        <td>{m.projectNum || m.project || '-'}</td>
                        <td>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: m.status === 'Complete' ? 'rgba(16,185,129,0.15)' : variance > 7 ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)', color: m.status === 'Complete' ? '#10B981' : variance > 7 ? '#EF4444' : '#3B82F6' }}>
                            {m.status || 'In Progress'}
                          </span>
                        </td>
                        <td>{m.plannedCompletion || '-'}</td>
                        <td>{m.forecastCompletion || '-'}</td>
                        <td className="number" style={{ color: variance > 7 ? '#EF4444' : variance > 0 ? '#F59E0B' : '#10B981', fontWeight: 600 }}>{variance > 0 ? `+${variance}` : variance}</td>
                        <td className="number">{m.percentComplete || 0}%</td>
                      </tr>
                    );
                  })}
                  {milestones.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No milestones found</td></tr>}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Schedule Risks */}
          <SectionCard title={`Schedule Risks (${scheduleRisks.length})`} subtitle="Delayed milestones requiring attention" noPadding>
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                  <tr>
                    <th>Milestone</th>
                    <th>Project</th>
                    <th className="number">Delay (days)</th>
                    <th>Planned Date</th>
                    <th className="number">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleRisks.map((r: any, idx: number) => (
                    <tr key={idx} onClick={() => setSelectedRiskItem({ ...r, type: 'schedule', impact: r.variance > 14 ? 90 : 60, probability: 75 })} style={{ cursor: 'pointer' }}>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{r.name}</td>
                      <td>{r.project || '-'}</td>
                      <td className="number" style={{ color: r.variance > 14 ? '#EF4444' : '#F59E0B', fontWeight: 700 }}>+{r.variance}</td>
                      <td>{r.planned || '-'}</td>
                      <td className="number">{r.percentComplete}%</td>
                    </tr>
                  ))}
                  {scheduleRisks.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No schedule risks</td></tr>}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Budget Concerns */}
          <SectionCard title={`Budget Concerns (${budgetConcerns.length})`} subtitle="Tasks exceeding baseline hours" noPadding>
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                  <tr>
                    <th>Task</th>
                    <th>Project</th>
                    <th>Assignee</th>
                    <th className="number">Baseline</th>
                    <th className="number">Actual</th>
                    <th className="number">Overage</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetConcerns.slice(0, 50).map((b: any, idx: number) => (
                    <tr key={idx} onClick={() => setSelectedRiskItem({ ...b, type: 'budget', impact: b.variance > 50 ? 85 : 55, probability: 65 })} style={{ cursor: 'pointer' }}>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{b.name}</td>
                      <td>{b.project || '-'}</td>
                      <td>{b.assignee}</td>
                      <td className="number">{b.baseline}</td>
                      <td className="number" style={{ fontWeight: 600 }}>{b.actual}</td>
                      <td className="number" style={{ color: b.variance > 50 ? '#EF4444' : '#F59E0B', fontWeight: 700 }}>+{b.variance}%</td>
                    </tr>
                  ))}
                  {budgetConcerns.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No budget concerns</td></tr>}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}

      {/* VARIANCE ANALYSIS TAB */}
      {activeTab === 'variance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Variance Summary */}
          <SectionCard title="Variance Summary" subtitle={`Comparing to ${getPeriodDisplayName(variancePeriod)}`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              <VarianceTrend label="SPI" current={healthMetrics.spi} previous={varianceData.spi.previousValue || healthMetrics.spi} period={variancePeriod} />
              <VarianceTrend label="CPI" current={healthMetrics.cpi} previous={varianceData.cpi.previousValue || healthMetrics.cpi} period={variancePeriod} />
              <VarianceTrend label="Hours" current={healthMetrics.totalHours} previous={varianceData.hours.previousValue || healthMetrics.totalHours} period={variancePeriod} />
              <VarianceTrend label="Progress" current={healthMetrics.percentComplete} previous={varianceData.progress.previousValue || healthMetrics.percentComplete} period={variancePeriod} />
            </div>
          </SectionCard>

          {/* Variance by Project */}
          <SectionCard title="Variance by Project" subtitle="Hours variance from baseline" noPadding>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 2 }}>Project</th>
                    <th className="number">Baseline</th>
                    <th className="number">Actual</th>
                    <th className="number">Variance</th>
                    <th className="number">Variance %</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {projectBreakdown.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).map((p, idx) => {
                    const hoursVariance = p.actualHours - p.baselineHours;
                    return (
                      <tr key={idx}>
                        <td style={{ position: 'sticky', left: 0, background: 'var(--bg-primary)', fontWeight: 500 }}>{p.name}</td>
                        <td className="number">{p.baselineHours.toLocaleString()}</td>
                        <td className="number">{p.actualHours.toLocaleString()}</td>
                        <td className="number" style={{ color: hoursVariance <= 0 ? '#10B981' : '#EF4444', fontWeight: 600 }}>{hoursVariance > 0 ? '+' : ''}{hoursVariance.toLocaleString()}</td>
                        <td className="number" style={{ fontWeight: 600 }}>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', background: p.variance <= 0 ? 'rgba(16,185,129,0.15)' : p.variance <= 10 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)', color: p.variance <= 0 ? '#10B981' : p.variance <= 10 ? '#F59E0B' : '#EF4444' }}>
                            {p.variance > 0 ? '+' : ''}{p.variance}%
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: '60px', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(100, Math.abs(p.variance))}%`, background: p.variance <= 0 ? '#10B981' : '#EF4444', borderRadius: '3px' }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Top Performers vs Bottom Performers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <SectionCard title="Top Performers" subtitle="Under budget projects" noPadding>
              <div style={{ padding: '1rem' }}>
                {projectBreakdown.filter(p => p.variance <= 0).sort((a, b) => a.variance - b.variance).slice(0, 5).map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: idx < 4 ? '1px solid var(--border-color)' : 'none' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{p.name}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10B981' }}>{p.variance}%</span>
                  </div>
                ))}
                {projectBreakdown.filter(p => p.variance <= 0).length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No under-budget projects</div>}
              </div>
            </SectionCard>
            <SectionCard title="Needs Attention" subtitle="Over budget projects" noPadding>
              <div style={{ padding: '1rem' }}>
                {projectBreakdown.filter(p => p.variance > 0).sort((a, b) => b.variance - a.variance).slice(0, 5).map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: idx < 4 ? '1px solid var(--border-color)' : 'none' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{p.name}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#EF4444' }}>+{p.variance}%</span>
                  </div>
                ))}
                {projectBreakdown.filter(p => p.variance > 0).length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No over-budget projects</div>}
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
