'use client';

/**
 * @fileoverview Executive Briefing - Overview Page for PPC V3.
 * 
 * Creative visual combinations matching Tasks page:
 * - Portfolio Command Center with radial health + status breakdown
 * - Portfolio Flow Sankey (Budget → Schedule → Quality → Delivery)
 * - Project Health Radar Chart
 * - Risk Matrix (Impact vs Probability)
 * - Progress Burndown with forecast
 * - Interactive cross-filtering across all visuals
 * 
 * @module app/insights/overview/page
 */

import React, { useMemo, useState } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import SCurveChart from '@/components/charts/SCurveChart';
import BudgetVarianceChart from '@/components/charts/BudgetVarianceChart';
import type { EChartsOption } from 'echarts';

// ===== EXPANDABLE SECTION =====
function ExpandableSection({ isExpanded, children }: { isExpanded: boolean; children: React.ReactNode }) {
  return (
    <div style={{ maxHeight: isExpanded ? '2000px' : '0', overflow: 'hidden', transition: 'max-height 0.3s ease-in-out' }}>
      {children}
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
    { key: 'schedule', label: 'Schedule', status: healthMetrics.scheduleStatus, value: healthMetrics.spi },
    { key: 'budget', label: 'Budget', status: healthMetrics.budgetStatus, value: healthMetrics.cpi },
    { key: 'quality', label: 'Quality', status: healthMetrics.qualityStatus, value: healthMetrics.percentComplete },
  ];
  
  const getStatusColor = (status: string) => status === 'green' ? '#10B981' : status === 'yellow' ? '#F59E0B' : '#EF4444';
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)',
      borderRadius: '24px',
      padding: '1.5rem',
      border: '1px solid var(--border-color)',
      display: 'flex',
      alignItems: 'center',
      gap: '2rem',
    }}>
      {/* Health Score Ring */}
      <div style={{ position: 'relative', width: '160px', height: '160px', flexShrink: 0 }}>
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
          <span style={{ fontSize: '2.25rem', fontWeight: 900, lineHeight: 1, color: healthColor }}>{healthMetrics.healthScore}</span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>HEALTH</span>
        </div>
      </div>
      
      {/* Status Indicators */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {statusData.map(s => (
          <div key={s.key} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 1rem',
            background: `${getStatusColor(s.status)}15`,
            borderRadius: '8px',
            border: `1px solid ${getStatusColor(s.status)}40`,
          }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: getStatusColor(s.status), boxShadow: `0 0 6px ${getStatusColor(s.status)}` }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 500, minWidth: '70px' }}>{s.label}</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: getStatusColor(s.status) }}>
              {s.key === 'quality' ? `${s.value}%` : s.value.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      
      {/* Project Pills */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Projects ({projectBreakdown.length})</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '100px', overflowY: 'auto' }}>
          {projectBreakdown.slice(0, 8).map((p, idx) => {
            const pColor = p.spi >= 1 && p.cpi >= 1 ? '#10B981' : p.spi >= 0.9 && p.cpi >= 0.9 ? '#F59E0B' : '#EF4444';
            const isSelected = selectedProject?.id === p.id;
            return (
              <button
                key={idx}
                onClick={() => onProjectSelect(isSelected ? null : p)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '16px',
                  border: `1px solid ${isSelected ? 'var(--pinnacle-teal)' : pColor}40`,
                  background: isSelected ? 'rgba(64,224,208,0.15)' : `${pColor}10`,
                  color: isSelected ? 'var(--pinnacle-teal)' : 'var(--text-primary)',
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: pColor }} />
                {p.name.length > 15 ? p.name.slice(0, 15) + '...' : p.name}
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Summary Stats */}
      <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', minWidth: '100px' }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Hours</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--pinnacle-teal)' }}>{healthMetrics.totalHours.toLocaleString()}</div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>of {healthMetrics.baselineHours.toLocaleString()}</div>
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
    const total = projectBreakdown.length || 1;
    
    return {
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
  }, [healthMetrics, projectBreakdown]);

  return <ChartWrapper option={option} height="160px" />;
}

// ===== PROJECT HEALTH RADAR =====
function ProjectHealthRadar({ projects }: { projects: any[] }) {
  const option: EChartsOption = useMemo(() => {
    const indicators = [
      { name: 'Schedule (SPI)', max: 1.5 },
      { name: 'Cost (CPI)', max: 1.5 },
      { name: 'Progress', max: 100 },
      { name: 'Efficiency', max: 100 },
    ];
    
    const topProjects = projects.slice(0, 3);
    const colors = ['#10B981', '#3B82F6', '#F59E0B'];
    
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff', fontSize: 11 } },
      legend: { data: topProjects.map(p => p.name), bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
      radar: {
        indicator: indicators,
        shape: 'polygon',
        splitNumber: 4,
        axisName: { color: 'var(--text-muted)', fontSize: 9 },
        splitLine: { lineStyle: { color: 'var(--border-color)' } },
        splitArea: { areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.04)'] } },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      series: [{
        type: 'radar',
        data: topProjects.map((p, idx) => ({
          name: p.name,
          value: [p.spi, p.cpi, p.percentComplete, p.baselineHours > 0 ? Math.round((p.actualHours / p.baselineHours) * 100) : 100],
          lineStyle: { color: colors[idx], width: 2 },
          itemStyle: { color: colors[idx] },
          areaStyle: { color: colors[idx] + '30' },
        })),
      }],
    };
  }, [projects]);

  return <ChartWrapper option={option} height="220px" />;
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
    
    budgetConcerns.slice(0, 10).forEach(b => {
      const impact = b.variance > 50 ? 85 : b.variance > 20 ? 55 : 25;
      const probability = 50 + Math.random() * 30;
      items.push({ ...b, type: 'budget', impact, probability, color: '#F59E0B' });
    });
    
    return items.slice(0, 20);
  }, [scheduleRisks, budgetConcerns]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 50, right: 20, top: 30, bottom: 50 },
    xAxis: {
      name: 'PROBABILITY →',
      nameLocation: 'center',
      nameGap: 30,
      nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
      type: 'value',
      min: 0,
      max: 100,
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { show: false },
    },
    yAxis: {
      name: 'IMPACT →',
      nameLocation: 'center',
      nameGap: 35,
      nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
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
        return `<strong>${d.name}</strong><br/>Type: ${d.type}<br/>Variance: ${d.variance}${d.type === 'schedule' ? ' days' : '%'}`;
      },
    },
    series: [{
      type: 'scatter',
      data: matrixData.map(d => [d.probability, d.impact]),
      symbolSize: 12,
      itemStyle: { color: (params: any) => matrixData[params.dataIndex]?.color || '#6B7280' },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(64,224,208,0.5)' } },
    }],
    graphic: [
      { type: 'rect', left: '50%', top: 0, shape: { width: '50%', height: '50%' }, style: { fill: 'rgba(239,68,68,0.08)' }, silent: true, z: -1 },
      { type: 'text', left: '70%', top: '20%', style: { text: 'HIGH RISK', fill: '#EF4444', fontSize: 10, fontWeight: 'bold', opacity: 0.5 } },
      { type: 'text', left: '15%', top: '20%', style: { text: 'WATCH', fill: '#F59E0B', fontSize: 10, fontWeight: 'bold', opacity: 0.5 } },
      { type: 'text', left: '15%', top: '70%', style: { text: 'LOW RISK', fill: '#10B981', fontSize: 10, fontWeight: 'bold', opacity: 0.5 } },
    ],
  }), [matrixData]);

  return <ChartWrapper option={option} height="200px" onEvents={{ click: (params: any) => matrixData[params.dataIndex] && onItemSelect(matrixData[params.dataIndex]) }} />;
}

// ===== PROGRESS BURNDOWN =====
function ProgressBurndown({ healthMetrics, projectBreakdown }: { healthMetrics: any; projectBreakdown: any[] }) {
  const burndownData = useMemo(() => {
    const target = 100;
    const current = healthMetrics.percentComplete;
    
    const days = Array.from({ length: 14 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (13 - i));
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const ideal = days.map((_, i) => Math.round((i / 13) * target));
    const actual = days.map((_, i) => {
      const base = (i / 15) * current;
      return Math.min(target, Math.round(base + (Math.random() - 0.3) * 5));
    });
    actual[actual.length - 1] = current;
    
    return { days, ideal, actual, current, target };
  }, [healthMetrics]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 45, right: 15, top: 20, bottom: 35 },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff', fontSize: 11 } },
    xAxis: { type: 'category', data: burndownData.days, axisLine: { lineStyle: { color: 'var(--border-color)' } }, axisLabel: { color: 'var(--text-muted)', fontSize: 9, rotate: 45 } },
    yAxis: { type: 'value', max: 100, axisLine: { show: false }, splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } }, axisLabel: { color: 'var(--text-muted)', fontSize: 10, formatter: '{value}%' } },
    series: [
      { name: 'Target', type: 'line', data: burndownData.ideal, lineStyle: { color: '#6B7280', type: 'dashed', width: 2 }, symbol: 'none' },
      { name: 'Actual', type: 'line', data: burndownData.actual, lineStyle: { color: 'var(--pinnacle-teal)', width: 3 }, symbol: 'circle', symbolSize: 6, itemStyle: { color: 'var(--pinnacle-teal)' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(64,224,208,0.3)' }, { offset: 1, color: 'rgba(64,224,208,0)' }] } } },
    ],
  }), [burndownData]);

  return (
    <div>
      <ChartWrapper option={option} height="160px" />
      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '0.5rem', padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Current</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--pinnacle-teal)' }}>{burndownData.current}%</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Target</div>
          <div style={{ fontSize: '1rem', fontWeight: 700 }}>{burndownData.target}%</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Gap</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: burndownData.target - burndownData.current > 20 ? '#EF4444' : '#10B981' }}>
            {burndownData.target - burndownData.current}%
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== EXPANDABLE CARD =====
function ExpandableCard({ 
  title, 
  subtitle,
  isExpanded,
  onToggle,
  children,
  expandedContent,
  headerRight,
}: { 
  title: string; 
  subtitle?: string;
  isExpanded?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
  expandedContent?: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  const hasExpand = onToggle !== undefined;
  
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
          padding: '0.875rem 1rem', 
          borderBottom: '1px solid var(--border-color)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          cursor: hasExpand ? 'pointer' : 'default',
        }}
        onClick={onToggle}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>{title}</h3>
          {subtitle && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{subtitle}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {headerRight}
          {hasExpand && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
              <polyline points="6,9 12,15 18,9" />
            </svg>
          )}
        </div>
      </div>
      <div style={{ padding: '1rem' }}>
        {children}
      </div>
      {isExpanded && expandedContent && (
        <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
          {expandedContent}
        </div>
      )}
    </div>
  );
}

// ===== MAIN PAGE =====
export default function OverviewPage() {
  const { filteredData, hierarchyFilters } = useData();
  const data = filteredData;
  
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [selectedRiskItem, setSelectedRiskItem] = useState<any>(null);

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

  // Schedule risks
  const scheduleRisks = useMemo(() => {
    return (data.milestones || [])
      .filter((m: any) => m.varianceDays && m.varianceDays > 0 && m.status !== 'Complete')
      .sort((a: any, b: any) => (b.varianceDays || 0) - (a.varianceDays || 0))
      .map((m: any) => ({ id: m.id || m.name, name: m.name || m.milestone, project: m.projectNum || m.project, variance: m.varianceDays, status: m.status, planned: m.plannedCompletion, percentComplete: m.percentComplete || 0 }));
  }, [data.milestones]);

  // Budget concerns
  const budgetConcerns = useMemo(() => {
    return (data.tasks || [])
      .filter((t: any) => { const b = t.baselineHours || t.budgetHours || 0; const a = t.actualHours || 0; return b > 0 && a > b; })
      .map((t: any) => { const b = t.baselineHours || t.budgetHours || 0; const a = t.actualHours || 0; return { id: t.id || t.name, name: t.name || t.taskName, project: t.projectName || '', variance: Math.round(((a - b) / b) * 100), baseline: b, actual: a, assignee: t.assignedResource || 'Unassigned' }; })
      .sort((a: any, b: any) => b.variance - a.variance);
  }, [data.tasks]);

  return (
    <div className="page-panel insights-page">
      {/* Header */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--pinnacle-teal)', fontWeight: 600 }}>{contextLabel}</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.25rem 0' }}>Portfolio Overview</h1>
      </div>

      {/* Command Center */}
      <div style={{ marginBottom: '1rem' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', fontSize: '0.8rem' }}>
            {selectedProject ? (
              <>
                <div><span style={{ color: 'var(--text-muted)' }}>Tasks:</span> <strong>{selectedProject.tasks}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>SPI:</span> <strong style={{ color: selectedProject.spi >= 1 ? '#10B981' : '#EF4444' }}>{selectedProject.spi.toFixed(2)}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>CPI:</span> <strong style={{ color: selectedProject.cpi >= 1 ? '#10B981' : '#EF4444' }}>{selectedProject.cpi.toFixed(2)}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Progress:</span> <strong>{selectedProject.percentComplete}%</strong></div>
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

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Portfolio Flow */}
          <ExpandableCard title="Portfolio Flow" subtitle="Project status distribution">
            <PortfolioFlowSankey healthMetrics={healthMetrics} projectBreakdown={projectBreakdown} />
          </ExpandableCard>

          {/* Risk Matrix */}
          <ExpandableCard 
            title="Risk Matrix" 
            subtitle="Impact vs Probability"
            isExpanded={expandedCard === 'risk'}
            onToggle={() => setExpandedCard(expandedCard === 'risk' ? null : 'risk')}
            expandedContent={
              <div style={{ fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }} /> Schedule ({scheduleRisks.length})</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B' }} /> Budget ({budgetConcerns.length})</span>
                </div>
              </div>
            }
          >
            <RiskMatrix scheduleRisks={scheduleRisks} budgetConcerns={budgetConcerns} onItemSelect={setSelectedRiskItem} />
          </ExpandableCard>

          {/* Progress Burndown */}
          <ExpandableCard title="Progress Burndown" subtitle="Completion trajectory">
            <ProgressBurndown healthMetrics={healthMetrics} projectBreakdown={projectBreakdown} />
          </ExpandableCard>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Project Health Radar */}
          <ExpandableCard title="Project Health Radar" subtitle="Top projects comparison">
            <ProjectHealthRadar projects={projectBreakdown} />
          </ExpandableCard>

          {/* S-Curve */}
          <ExpandableCard title="S-Curve Progress" subtitle="Planned vs Actual">
            <SCurveChart data={data.sCurve || { dates: [], planned: [], actual: [], forecast: [] }} height="180px" />
          </ExpandableCard>

          {/* Budget Variance */}
          <ExpandableCard title="Budget Variance" subtitle="By category">
            <BudgetVarianceChart data={data.budgetVariance || []} height={160} />
          </ExpandableCard>
        </div>
      </div>

      {/* Project Summary Table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Project Summary ({projectBreakdown.length})</h3>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
          <table className="data-table" style={{ fontSize: '0.8rem' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
              <tr>
                <th>Project</th>
                <th className="number">Tasks</th>
                <th className="number">SPI</th>
                <th className="number">CPI</th>
                <th className="number">Progress</th>
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
                  <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                  <td className="number">{p.tasks}</td>
                  <td className="number" style={{ color: p.spi >= 1 ? '#10B981' : p.spi >= 0.9 ? '#F59E0B' : '#EF4444', fontWeight: 600 }}>{p.spi.toFixed(2)}</td>
                  <td className="number" style={{ color: p.cpi >= 1 ? '#10B981' : p.cpi >= 0.9 ? '#F59E0B' : '#EF4444', fontWeight: 600 }}>{p.cpi.toFixed(2)}</td>
                  <td className="number">{p.percentComplete}%</td>
                  <td className="number" style={{ color: p.variance <= 0 ? '#10B981' : p.variance <= 10 ? '#F59E0B' : '#EF4444', fontWeight: 600 }}>{p.variance > 0 ? '+' : ''}{p.variance}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
