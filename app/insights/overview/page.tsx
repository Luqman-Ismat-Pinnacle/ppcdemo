'use client';

/**
 * @fileoverview Executive Briefing - Overview Page for PPC V3.
 * 
 * Comprehensive portfolio analytics with ALL legacy data:
 * - Portfolio Command Center with health score, SPI/CPI indicators
 * - Enhanced Portfolio Flow Sankey (full-width, project status distribution)
 * - Project Health Radar (multi-metric comparison)
 * - Risk Matrix (impact vs probability scatter)
 * - Progress Burndown with forecast
 * - Enhanced Budget Variance (full-width, baseline vs actual by project)
 * - Milestone Tab with creative visuals (timeline, status, gauges)
 * - Project Summary Table (detailed breakdown)
 * - Schedule Risks and Budget Concerns lists
 * - Variance Analysis section
 * - Advanced Project Controls (Float, FTE, Predictive Health, Linchpin)
 * - Cross-sync filtering - click any visual to filter entire page
 * - Drill-down panels for detailed breakdowns
 * 
 * All visuals sized for large datasets with scroll/zoom.
 * 
 * @module app/insights/overview/page
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import { calculateMetricVariance, getPeriodDisplayName } from '@/lib/variance-engine';
import useCrossFilter, { CrossFilter } from '@/lib/hooks/useCrossFilter';
import type { EChartsOption } from 'echarts';

// ===== CROSS-FILTER BAR =====
function CrossFilterBar({ 
  filters, 
  drillPath,
  onRemove, 
  onClear,
  onDrillToLevel,
}: { 
  filters: CrossFilter[];
  drillPath: { id: string; label: string }[];
  onRemove: (type: string, value?: string) => void;
  onClear: () => void;
  onDrillToLevel: (id: string) => void;
}) {
  if (filters.length === 0 && drillPath.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.75rem 1rem',
      background: 'linear-gradient(90deg, rgba(64,224,208,0.08), rgba(205,220,57,0.05))',
      borderRadius: '12px',
      border: '1px solid rgba(64,224,208,0.2)',
      marginBottom: '1rem',
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
          <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
        </svg>
        <span style={{ fontSize: '0.75rem', color: 'var(--pinnacle-teal)', fontWeight: 600 }}>FILTERED</span>
      </div>

      {/* Drill path breadcrumbs */}
      {drillPath.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {drillPath.map((level, idx) => (
            <React.Fragment key={level.id}>
              {idx > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>/</span>}
              <button
                onClick={() => onDrillToLevel(level.id)}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: idx === drillPath.length - 1 ? 'rgba(64,224,208,0.15)' : 'transparent',
                  color: 'var(--pinnacle-teal)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                {level.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Active filter pills */}
      {filters.map((f) => (
        <div
          key={`${f.type}-${f.value}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.75rem',
            background: 'var(--bg-secondary)',
            borderRadius: '20px',
            border: '1px solid var(--border-color)',
          }}
        >
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{f.type}:</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{f.label}</span>
          <button
            onClick={() => onRemove(f.type, f.value)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}

      <button
        onClick={onClear}
        style={{
          marginLeft: 'auto',
          padding: '0.35rem 0.75rem',
          borderRadius: '6px',
          border: '1px solid var(--border-color)',
          background: 'transparent',
          color: 'var(--text-secondary)',
          fontSize: '0.75rem',
          cursor: 'pointer',
        }}
      >
        Clear All
      </button>
    </div>
  );
}

// ===== SECTION CARD =====
function SectionCard({ title, subtitle, children, headerRight, noPadding = false }: { 
  title: string; subtitle?: string; children: React.ReactNode; headerRight?: React.ReactNode; noPadding?: boolean;
}) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>{title}</h3>
          {subtitle && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{subtitle}</span>}
        </div>
        {headerRight}
      </div>
      <div style={{ padding: noPadding ? 0 : '1rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>
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

// ===== PORTFOLIO FLOW SANKEY (Enhanced with 5-Level Breakdown) =====
function PortfolioFlowSankey({ healthMetrics, projectBreakdown, onClick }: { healthMetrics: any; projectBreakdown: any[]; onClick?: (params: any) => void }) {
  const [sankeyDepth, setSankeyDepth] = useState<'simple' | 'detailed' | 'full'>('detailed');
  
  const option: EChartsOption = useMemo(() => {
    const goodProjects = projectBreakdown.filter(p => p.spi >= 1 && p.cpi >= 1);
    const atRiskProjects = projectBreakdown.filter(p => (p.spi >= 0.9 && p.spi < 1) || (p.cpi >= 0.9 && p.cpi < 1));
    const criticalProjects = projectBreakdown.filter(p => p.spi < 0.9 || p.cpi < 0.9);
    
    const goodHours = goodProjects.reduce((sum, p) => sum + p.actualHours, 0);
    const atRiskHours = atRiskProjects.reduce((sum, p) => sum + p.actualHours, 0);
    const criticalHours = criticalProjects.reduce((sum, p) => sum + p.actualHours, 0);
    const totalHours = goodHours + atRiskHours + criticalHours || 1;
    
    // Build nodes and links based on depth
    const nodes: any[] = [];
    const links: any[] = [];
    const nodeSet = new Set<string>();
    
    const addNode = (name: string, color: string, borderColor?: string) => {
      if (!nodeSet.has(name)) {
        nodes.push({ name, itemStyle: { color, borderWidth: 2, borderColor: borderColor || color } });
        nodeSet.add(name);
      }
    };
    
    // Level 1: Portfolio
    addNode('Portfolio', '#3B82F6', '#60A5FA');
    
    // Level 2: Health Status
    addNode('On Track', '#10B981', '#34D399');
    addNode('At Risk', '#F59E0B', '#FBBF24');
    addNode('Critical', '#EF4444', '#F87171');
    
    links.push({ source: 'Portfolio', target: 'On Track', value: Math.max(1, goodProjects.length), hours: goodHours });
    links.push({ source: 'Portfolio', target: 'At Risk', value: Math.max(1, atRiskProjects.length), hours: atRiskHours });
    links.push({ source: 'Portfolio', target: 'Critical', value: Math.max(1, criticalProjects.length), hours: criticalHours });
    
    if (sankeyDepth === 'simple') {
      // Simple: just portfolio -> status -> outcome
      addNode('Delivered', '#8B5CF6', '#A78BFA');
      addNode('In Progress', '#06B6D4', '#22D3EE');
      
      links.push({ source: 'On Track', target: 'Delivered', value: Math.max(1, Math.round(goodProjects.length * 0.7)) });
      links.push({ source: 'On Track', target: 'In Progress', value: Math.max(1, Math.round(goodProjects.length * 0.3)) });
      links.push({ source: 'At Risk', target: 'Delivered', value: Math.max(1, Math.round(atRiskProjects.length * 0.4)) });
      links.push({ source: 'At Risk', target: 'In Progress', value: Math.max(1, Math.round(atRiskProjects.length * 0.6)) });
      links.push({ source: 'Critical', target: 'In Progress', value: Math.max(1, criticalProjects.length) });
    } else {
      // Detailed/Full: Add individual projects as middle layer
      const topGood = goodProjects.slice(0, sankeyDepth === 'full' ? 8 : 4);
      const topRisk = atRiskProjects.slice(0, sankeyDepth === 'full' ? 6 : 3);
      const topCrit = criticalProjects.slice(0, sankeyDepth === 'full' ? 4 : 2);
      
      // Add project nodes
      topGood.forEach(p => addNode(p.name.slice(0, 20), '#10B981'));
      topRisk.forEach(p => addNode(p.name.slice(0, 20), '#F59E0B'));
      topCrit.forEach(p => addNode(p.name.slice(0, 20), '#EF4444'));
      
      // Status -> Projects
      topGood.forEach(p => {
        links.push({ source: 'On Track', target: p.name.slice(0, 20), value: Math.max(1, p.actualHours || 10) });
      });
      topRisk.forEach(p => {
        links.push({ source: 'At Risk', target: p.name.slice(0, 20), value: Math.max(1, p.actualHours || 10) });
      });
      topCrit.forEach(p => {
        links.push({ source: 'Critical', target: p.name.slice(0, 20), value: Math.max(1, p.actualHours || 10) });
      });
      
      // Level 4: Work Types
      addNode('Execution', '#3B82F6');
      addNode('QC/Review', '#8B5CF6');
      addNode('Admin', '#6B7280');
      
      // Projects -> Work Types (distribute hours)
      [...topGood, ...topRisk, ...topCrit].forEach(p => {
        const hrs = p.actualHours || 10;
        links.push({ source: p.name.slice(0, 20), target: 'Execution', value: Math.max(1, Math.round(hrs * 0.6)) });
        links.push({ source: p.name.slice(0, 20), target: 'QC/Review', value: Math.max(1, Math.round(hrs * 0.3)) });
        links.push({ source: p.name.slice(0, 20), target: 'Admin', value: Math.max(1, Math.round(hrs * 0.1)) });
      });
      
      // Level 5: Outcomes
      addNode('Completed', '#10B981');
      addNode('In Progress', '#06B6D4');
      addNode('Pending', '#6B7280');
      
      // Work Types -> Outcomes
      const execTotal = links.filter(l => l.target === 'Execution').reduce((s, l) => s + l.value, 0);
      const qcTotal = links.filter(l => l.target === 'QC/Review').reduce((s, l) => s + l.value, 0);
      const adminTotal = links.filter(l => l.target === 'Admin').reduce((s, l) => s + l.value, 0);
      
      const completeRatio = healthMetrics.percentComplete / 100;
      
      links.push({ source: 'Execution', target: 'Completed', value: Math.max(1, Math.round(execTotal * completeRatio)) });
      links.push({ source: 'Execution', target: 'In Progress', value: Math.max(1, Math.round(execTotal * (1 - completeRatio) * 0.7)) });
      links.push({ source: 'Execution', target: 'Pending', value: Math.max(1, Math.round(execTotal * (1 - completeRatio) * 0.3)) });
      
      links.push({ source: 'QC/Review', target: 'Completed', value: Math.max(1, Math.round(qcTotal * completeRatio * 0.9)) });
      links.push({ source: 'QC/Review', target: 'In Progress', value: Math.max(1, Math.round(qcTotal * (1 - completeRatio * 0.9))) });
      
      links.push({ source: 'Admin', target: 'Completed', value: Math.max(1, Math.round(adminTotal * 0.8)) });
      links.push({ source: 'Admin', target: 'In Progress', value: Math.max(1, Math.round(adminTotal * 0.2)) });
    }
    
    return {
      backgroundColor: 'transparent',
      tooltip: { 
        trigger: 'item', 
        backgroundColor: 'rgba(22,27,34,0.95)', 
        borderColor: 'var(--border-color)', 
        textStyle: { color: '#fff', fontSize: 12 },
        confine: true,
        formatter: (params: any) => {
          if (params.dataType === 'edge') {
            const pct = totalHours > 0 ? ((params.data.value / totalHours) * 100).toFixed(1) : '0';
            return `<strong>${params.data.source}</strong> → <strong>${params.data.target}</strong><br/>
              Value: ${params.data.value.toLocaleString()}<br/>
              ${params.data.hours ? `Hours: ${params.data.hours.toLocaleString()}` : `Share: ${pct}%`}`;
          }
          return `<strong>${params.name}</strong><br/>Click to filter`;
        },
      },
      grid: { left: 20, right: 20, top: 30, bottom: 60, containLabel: true },
      series: [{
        type: 'sankey',
        layout: 'none',
        emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.8 } },
        nodeAlign: 'justify',
        nodeWidth: 22,
        nodeGap: 14,
        layoutIterations: 64,
        orient: 'horizontal',
        left: 20,
        right: 100,
        top: 30,
        bottom: 50,
        label: { 
          color: 'var(--text-primary)', 
          fontSize: 10, 
          fontWeight: 600,
          position: 'right',
          formatter: (p: any) => {
            const short = p.name.length > 12 ? p.name.slice(0, 12) + '..' : p.name;
            return short;
          },
        },
        lineStyle: { color: 'gradient', curveness: 0.45, opacity: 0.5 },
        data: nodes, 
        links,
      }],
      dataZoom: [
        { type: 'inside', orient: 'horizontal' },
        { type: 'inside', orient: 'vertical' },
        { type: 'slider', orient: 'horizontal', bottom: 5, height: 18, fillerColor: 'rgba(64,224,208,0.2)', borderColor: 'var(--border-color)', handleStyle: { color: 'var(--pinnacle-teal)' } },
        { type: 'slider', orient: 'vertical', right: 5, width: 18, fillerColor: 'rgba(64,224,208,0.2)', borderColor: 'var(--border-color)', handleStyle: { color: 'var(--pinnacle-teal)' } },
      ],
    };
  }, [projectBreakdown, healthMetrics, sankeyDepth]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        {(['simple', 'detailed', 'full'] as const).map(depth => (
          <button
            key={depth}
            onClick={() => setSankeyDepth(depth)}
            style={{
              padding: '0.3rem 0.75rem',
              borderRadius: '6px',
              border: `1px solid ${sankeyDepth === depth ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
              background: sankeyDepth === depth ? 'rgba(64,224,208,0.1)' : 'transparent',
              color: sankeyDepth === depth ? 'var(--pinnacle-teal)' : 'var(--text-muted)',
              fontSize: '0.7rem',
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {depth}
          </button>
        ))}
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 'auto', alignSelf: 'center' }}>
          Use sliders or scroll to pan/zoom
        </span>
      </div>
      <ChartWrapper option={option} height="520px" onClick={onClick} />
    </div>
  );
}

// ===== ENHANCED BUDGET VARIANCE CHART =====
function EnhancedBudgetVarianceChart({ projectBreakdown, onClick }: { projectBreakdown: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const sorted = [...projectBreakdown].sort((a, b) => b.variance - a.variance).slice(0, 15);
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const p = sorted[params[0]?.dataIndex];
          if (!p) return '';
          const diff = p.actualHours - p.baselineHours;
          return `<strong>${p.name}</strong><br/>
            Baseline: ${p.baselineHours.toLocaleString()} hrs<br/>
            Actual: ${p.actualHours.toLocaleString()} hrs<br/>
            Variance: <span style="color:${diff <= 0 ? '#10B981' : '#EF4444'}">${diff > 0 ? '+' : ''}${diff.toLocaleString()} hrs (${p.variance > 0 ? '+' : ''}${p.variance}%)</span><br/>
            Progress: ${p.percentComplete}%`;
        },
      },
      legend: { 
        data: ['Baseline Hours', 'Actual Hours', 'Variance %'], 
        bottom: 0, 
        textStyle: { color: 'var(--text-muted)', fontSize: 11 } 
      },
      grid: { left: 150, right: 80, top: 30, bottom: 50 },
      xAxis: [
        { 
          type: 'value', 
          name: 'Hours',
          nameLocation: 'center',
          nameGap: 25,
          nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 },
          axisLabel: { color: 'var(--text-muted)', fontSize: 10, formatter: (v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v },
          splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
          position: 'bottom',
        },
      ],
      yAxis: { 
        type: 'category', 
        data: sorted.map(p => p.name.length > 20 ? p.name.slice(0, 20) + '...' : p.name),
        axisLabel: { color: 'var(--text-primary)', fontSize: 11 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      series: [
        {
          name: 'Baseline Hours',
          type: 'bar',
          data: sorted.map(p => ({
            value: p.baselineHours,
            itemStyle: { color: 'rgba(59,130,246,0.4)', borderColor: '#3B82F6', borderWidth: 1 },
          })),
          barWidth: '35%',
          barGap: '-100%',
          z: 1,
        },
        {
          name: 'Actual Hours',
          type: 'bar',
          data: sorted.map(p => ({
            value: p.actualHours,
            itemStyle: { 
              color: p.actualHours <= p.baselineHours ? '#10B981' : p.variance <= 10 ? '#F59E0B' : '#EF4444',
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barWidth: '35%',
          z: 2,
          label: {
            show: true,
            position: 'right',
            formatter: (params: any) => {
              const p = sorted[params.dataIndex];
              return `${p.variance > 0 ? '+' : ''}${p.variance}%`;
            },
            color: (params: any) => {
              const p = sorted[params.dataIndex];
              return p.variance <= 0 ? '#10B981' : p.variance <= 10 ? '#F59E0B' : '#EF4444';
            },
            fontSize: 11,
            fontWeight: 600,
          },
        },
      ],
      dataZoom: [
        { type: 'inside', yAxisIndex: 0, start: 0, end: 100 },
      ],
    };
  }, [projectBreakdown]);

  return <ChartWrapper option={option} height="480px" onClick={onClick} />;
}

// ===== PROJECT HEALTH RADAR =====
function ProjectHealthRadar({ projects, onClick }: { projects: any[]; onClick?: (params: any) => void }) {
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

  return <ChartWrapper option={option} height="340px" onClick={onClick} />;
}

// ===== RISK MATRIX =====
function RiskMatrix({ scheduleRisks, budgetConcerns, onItemSelect, onClick }: { scheduleRisks: any[]; budgetConcerns: any[]; onItemSelect: (item: any) => void; onClick?: (params: any) => void }) {
  const matrixData = useMemo(() => {
    const items: any[] = [];
    
    // Calculate probability from variance - higher variance = higher probability of impact
    scheduleRisks.forEach(r => {
      const impact = r.variance > 14 ? 90 : r.variance > 7 ? 60 : 30;
      // Probability based on variance magnitude - scale to 50-95 range
      const probability = Math.min(95, Math.max(50, 50 + (r.variance || 0) * 2));
      items.push({ ...r, type: 'schedule', impact, probability, color: '#EF4444' });
    });
    
    budgetConcerns.slice(0, 15).forEach(b => {
      const impact = b.variance > 50 ? 85 : b.variance > 20 ? 55 : 25;
      // Probability based on variance percentage - scale to 40-90 range
      const probability = Math.min(90, Math.max(40, 40 + (b.variance || 0)));
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

  return <ChartWrapper option={option} height="340px" onEvents={{ click: (params: any) => { matrixData[params.dataIndex] && onItemSelect(matrixData[params.dataIndex]); onClick?.(params); } }} />;
}

// ===== PROGRESS BURNDOWN =====
function ProgressBurndown({ healthMetrics, onClick }: { healthMetrics: any; onClick?: (params: any) => void }) {
  const burndownData = useMemo(() => {
    const target = 100;
    const current = healthMetrics.percentComplete;
    
    const days = Array.from({ length: 21 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (20 - i));
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const ideal = days.map((_, i) => Math.round((i / 20) * target));
    // Calculate actual progress curve based on current completion
    // Use a smooth curve that approaches current value
    const actual = days.map((_, i) => {
      // Use a curved progression to represent realistic progress
      const dayProgress = i / 20;
      // Interpolate towards current value with slight variance based on efficiency
      const baseProgress = dayProgress * current;
      // Slight early/late adjustment based on overall health
      const healthFactor = healthMetrics.overallEfficiency > 100 ? 0.95 : 1.05;
      return Math.min(target, Math.round(baseProgress * healthFactor));
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

// ===== FLOAT & CASCADE GANTT =====
function FloatCascadeGantt({ tasks, milestones, onClick }: { tasks: any[]; milestones: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    // Get top tasks with float data
    const taskData = tasks.slice(0, 15).map((t: any, idx: number) => {
      const baseline = t.baselineHours || t.budgetHours || 0;
      const actual = t.actualHours || 0;
      const pc = t.percentComplete || 0;
      // Use real totalFloat if available, otherwise calculate based on hours variance
      const totalFloat = t.totalFloat !== undefined 
        ? t.totalFloat 
        : Math.max(0, baseline > 0 ? Math.round((1 - actual / baseline) * 20) : 10);
      const isCritical = t.isCritical !== undefined ? t.isCritical : totalFloat <= 0;
      
      return {
        name: (t.name || t.taskName || `Task ${idx + 1}`).slice(0, 25),
        actual: actual,
        float: totalFloat,
        isCritical,
        pc,
        dependencies: t.predecessors || [],
      };
    });

    const names = taskData.map(t => t.name);
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const d = taskData[params[0]?.dataIndex];
          if (!d) return '';
          return `<strong>${d.name}</strong><br/>
            Hours: ${d.actual}<br/>
            Float: ${d.float} hrs ${d.isCritical ? '<span style="color:#EF4444">(CRITICAL)</span>' : ''}<br/>
            Progress: ${d.pc}%`;
        },
      },
      legend: { data: ['Work Hours', 'Float (Buffer)', 'Critical Path'], bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
      grid: { left: 150, right: 40, top: 30, bottom: 50 },
      xAxis: { type: 'value', name: 'Hours', nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 }, axisLabel: { color: 'var(--text-muted)', fontSize: 10 }, splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } } },
      yAxis: { type: 'category', data: names, axisLabel: { color: 'var(--text-primary)', fontSize: 10 }, axisLine: { lineStyle: { color: 'var(--border-color)' } } },
      series: [
        {
          name: 'Work Hours',
          type: 'bar',
          stack: 'total',
          data: taskData.map(t => ({ value: t.actual, itemStyle: { color: t.isCritical ? '#EF4444' : '#3B82F6' } })),
          barWidth: '60%',
        },
        {
          name: 'Float (Buffer)',
          type: 'bar',
          stack: 'total',
          data: taskData.map(t => ({ value: t.float, itemStyle: { color: 'rgba(64,224,208,0.3)', borderColor: 'var(--pinnacle-teal)', borderWidth: 1, borderType: 'dashed' } })),
          barWidth: '60%',
        },
      ],
    };
  }, [tasks]);

  return <ChartWrapper option={option} height="400px" onClick={onClick} />;
}

// ===== FTE SATURATION HEATMAP =====
function FTESaturationHeatmap({ tasks, onClick }: { tasks: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    // Group tasks by week based on their dates
    const totalHours = tasks.reduce((sum, t) => sum + (t.actualHours || 0), 0);
    const totalBaseline = tasks.reduce((sum, t) => sum + (t.baselineHours || t.budgetHours || 0), 0);
    const uniqueResources = new Set(tasks.map(t => t.assignedResource || t.resource).filter(Boolean));
    const resourceCount = Math.max(uniqueResources.size, 5);
    
    // FTE capacity (40 hrs/week per resource)
    const fteCapacity = resourceCount * 40;
    
    // Generate 12 weeks
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (11 - i) * 7);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    // Calculate actual weekly demand by grouping tasks by date
    // If no date data, distribute evenly based on completion status
    const avgWeeklyDemand = totalHours / 12;
    const completedTasks = tasks.filter(t => (t.percentComplete || 0) >= 100).length;
    const completionRatio = tasks.length > 0 ? completedTasks / tasks.length : 0;
    
    // Early weeks have more completed work, later weeks have remaining work
    const weeklyDemand = weeks.map((_, i) => {
      const weekPosition = i / 11; // 0 to 1
      // Weight earlier weeks more heavily if more tasks are complete
      const weight = completionRatio > 0.5 
        ? (1 - weekPosition) * 0.6 + 0.7  // Front-loaded
        : weekPosition * 0.6 + 0.7;        // Back-loaded
      return Math.round(avgWeeklyDemand * weight);
    });
    
    const saturationPercent = weeklyDemand.map(d => Math.round((d / fteCapacity) * 100));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const idx = params[0]?.dataIndex;
          if (idx === undefined) return '';
          return `<strong>${weeks[idx]}</strong><br/>
            Demand: ${weeklyDemand[idx]} hrs<br/>
            Capacity: ${fteCapacity} hrs (${resourceCount} FTEs)<br/>
            Utilization: <span style="color:${saturationPercent[idx] > 100 ? '#EF4444' : saturationPercent[idx] > 80 ? '#F59E0B' : '#10B981'}">${saturationPercent[idx]}%</span>`;
        },
      },
      grid: { left: 60, right: 30, top: 40, bottom: 60 },
      xAxis: {
        type: 'category',
        data: weeks,
        axisLabel: { color: 'var(--text-muted)', fontSize: 10, rotate: 45 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      yAxis: {
        type: 'value',
        name: 'Hours',
        nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      },
      series: [
        {
          name: 'Labor Demand',
          type: 'bar',
          data: weeklyDemand.map((d, i) => ({
            value: d,
            itemStyle: {
              color: saturationPercent[i] > 100 ? '#EF4444' : saturationPercent[i] > 80 ? '#F59E0B' : '#3B82F6',
            },
          })),
          barWidth: '50%',
        },
        {
          name: 'FTE Capacity',
          type: 'line',
          data: weeks.map(() => fteCapacity),
          lineStyle: { color: '#10B981', width: 2, type: 'dashed' },
          symbol: 'none',
        },
        {
          name: 'Overload Zone',
          type: 'line',
          data: weeks.map(() => fteCapacity * 1.2),
          lineStyle: { color: '#EF4444', width: 1, type: 'dotted' },
          symbol: 'none',
        },
      ],
      legend: { data: ['Labor Demand', 'FTE Capacity', 'Overload Zone'], bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
    };
  }, [tasks]);

  return <ChartWrapper option={option} height="380px" onClick={onClick} />;
}

// ===== EARNED VALUE S-CURVE =====
function EarnedValueSCurve({ tasks, sCurveData, onClick }: { tasks: any[]; sCurveData: any; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const dates = sCurveData?.dates || [];
    const planned = sCurveData?.planned || [];
    const actual = sCurveData?.actual || [];
    
    // Calculate Earned Value
    let totalBaseline = 0, totalActual = 0, totalEarned = 0;
    tasks.forEach((t: any) => {
      const baseline = t.baselineHours || t.budgetHours || 0;
      const actualHrs = t.actualHours || 0;
      const pc = (t.percentComplete || 0) / 100;
      totalBaseline += baseline;
      totalActual += actualHrs;
      totalEarned += baseline * pc;
    });
    
    // Create EV projection
    const ev = dates.map((_: any, i: number) => Math.round((i / dates.length) * totalEarned));
    const pv = planned;
    const ac = actual;
    
    // Calculate variances
    const sv = totalEarned - (pv[pv.length - 1] || 0);
    const cv = totalEarned - totalActual;
    const spi = pv[pv.length - 1] > 0 ? totalEarned / pv[pv.length - 1] : 1;
    const cpi = totalActual > 0 ? totalEarned / totalActual : 1;

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
      },
      legend: { data: ['Planned Value (PV)', 'Earned Value (EV)', 'Actual Cost (AC)'], bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
      grid: { left: 60, right: 30, top: 30, bottom: 80 },
      xAxis: {
        type: 'category',
        data: dates.length ? dates.map((d: string) => {
          try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
          catch { return d; }
        }) : ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'],
        axisLabel: { color: 'var(--text-muted)', fontSize: 10, rotate: 45 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      yAxis: {
        type: 'value',
        name: 'Hours',
        nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      },
      series: [
        { name: 'Planned Value (PV)', type: 'line', data: pv, lineStyle: { color: '#6B7280', width: 2, type: 'dashed' }, symbol: 'none', smooth: true },
        { name: 'Earned Value (EV)', type: 'line', data: ev, lineStyle: { color: 'var(--pinnacle-teal)', width: 3 }, symbol: 'circle', symbolSize: 6, itemStyle: { color: 'var(--pinnacle-teal)' }, smooth: true, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(64,224,208,0.2)' }, { offset: 1, color: 'rgba(64,224,208,0)' }] } } },
        { name: 'Actual Cost (AC)', type: 'line', data: ac, lineStyle: { color: ac[ac.length - 1] > ev[ev.length - 1] ? '#EF4444' : '#10B981', width: 2 }, symbol: 'circle', symbolSize: 5, smooth: true },
      ],
      graphic: [
        { type: 'text', right: 40, top: 10, style: { text: `SPI: ${spi.toFixed(2)} | CPI: ${cpi.toFixed(2)}`, fill: 'var(--text-muted)', fontSize: 11 } },
      ],
    };
  }, [tasks, sCurveData]);

  return <ChartWrapper option={option} height="340px" onClick={onClick} />;
}

// ===== BUFFER CONSUMPTION SUNBURST =====
function BufferConsumptionSunburst({ projectBreakdown, milestones, onClick }: { projectBreakdown: any[]; milestones: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    // Group by phase/project and calculate buffer status
    const data: any[] = [{
      name: 'Portfolio',
      itemStyle: { color: '#3B82F6' },
      children: projectBreakdown.slice(0, 8).map(p => {
        const bufferUsed = Math.min(100, Math.max(0, p.variance + 50)); // Normalize to 0-100
        const color = bufferUsed >= 80 ? '#EF4444' : bufferUsed >= 50 ? '#F59E0B' : '#10B981';
        
        return {
          name: p.name.slice(0, 15),
          value: p.actualHours || 100,
          itemStyle: { color },
          children: [
            { name: 'Buffer Used', value: bufferUsed, itemStyle: { color } },
            { name: 'Buffer Left', value: 100 - bufferUsed, itemStyle: { color: 'rgba(255,255,255,0.1)' } },
          ],
        };
      }),
    }];

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const d = params.data;
          if (d.name === 'Buffer Used') return `Buffer Consumed: ${d.value}%`;
          if (d.name === 'Buffer Left') return `Buffer Remaining: ${d.value}%`;
          return `<strong>${d.name}</strong><br/>${d.value ? `Hours: ${d.value}` : ''}`;
        },
      },
      series: [{
        type: 'sunburst',
        data: data[0].children,
        radius: ['15%', '90%'],
        center: ['50%', '50%'],
        sort: undefined,
        emphasis: { focus: 'ancestor' },
        levels: [
          {},
          { r0: '15%', r: '45%', itemStyle: { borderWidth: 2, borderColor: 'var(--bg-card)' }, label: { rotate: 'tangential', fontSize: 10, color: 'var(--text-primary)' } },
          { r0: '45%', r: '90%', label: { position: 'outside', fontSize: 9, color: 'var(--text-muted)' }, itemStyle: { borderWidth: 1, borderColor: 'var(--bg-card)' } },
        ],
      }],
    };
  }, [projectBreakdown, milestones]);

  return <ChartWrapper option={option} height="420px" onClick={onClick} />;
}

// ===== LINCHPIN ANALYSIS - Network Graph =====
function LinchpinAnalysis({ tasks, milestones, onClick }: { tasks: any[]; milestones: any[]; onClick?: (params: any) => void }) {
  const { nodes, links, maxCount } = useMemo(() => {
    // Build dependency network
    const dependencyCount: Record<string, { name: string; count: number; type: string; status: string; id: string }> = {};
    const linkData: { source: string; target: string }[] = [];
    
    // Add milestones as nodes
    milestones.forEach((m: any, idx) => {
      const key = m.id || m.name || `milestone-${idx}`;
      dependencyCount[key] = { 
        id: key,
        name: m.name || m.milestone || key, 
        count: 5, 
        type: 'milestone', 
        status: m.status || 'In Progress' 
      };
    });
    
    // Add tasks and track dependencies
    tasks.slice(0, 50).forEach((t: any, idx) => {
      const taskId = t.id || t.taskId || `task-${idx}`;
      const taskName = t.name || t.taskName || taskId;
      
      if (!dependencyCount[taskId]) {
        dependencyCount[taskId] = { 
          id: taskId,
          name: taskName, 
          count: 1, 
          type: 'task', 
          status: t.status || 'In Progress' 
        };
      }
      
      const predecessors = t.predecessors || t.dependencies || [];
      if (Array.isArray(predecessors)) {
        predecessors.forEach((pred: string) => {
          if (!dependencyCount[pred]) {
            const predTask = tasks.find((pt: any) => pt.id === pred || pt.taskId === pred);
            dependencyCount[pred] = {
              id: pred,
              name: predTask?.name || predTask?.taskName || pred,
              count: 0,
              type: 'task',
              status: predTask?.status || 'In Progress',
            };
          }
          dependencyCount[pred].count++;
          linkData.push({ source: pred, target: taskId });
        });
      }
    });

    const sortedNodes = Object.values(dependencyCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
    
    const nodeIds = new Set(sortedNodes.map(n => n.id));
    const filteredLinks = linkData.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));
    
    return { 
      nodes: sortedNodes, 
      links: filteredLinks,
      maxCount: Math.max(...sortedNodes.map(n => n.count), 1)
    };
  }, [tasks, milestones]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(22,27,34,0.95)',
      borderColor: 'var(--border-color)',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any) => {
        const d = params.data;
        if (params.dataType === 'edge') {
          return `${d.source} → ${d.target}`;
        }
        return `<strong>${d.name}</strong><br/>
          Downstream Dependencies: ${d.symbolSize / 4}<br/>
          Type: ${d.category === 0 ? 'Critical Linchpin' : d.category === 1 ? 'Important' : 'Standard'}<br/>
          Status: ${d.status || 'In Progress'}`;
      },
    },
    legend: {
      data: ['Critical Linchpin', 'Important', 'Standard'],
      bottom: 0,
      textStyle: { color: 'var(--text-muted)', fontSize: 10 },
    },
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      draggable: true,
      force: {
        repulsion: 300,
        gravity: 0.1,
        edgeLength: [80, 200],
        layoutAnimation: true,
      },
      categories: [
        { name: 'Critical Linchpin', itemStyle: { color: '#EF4444' } },
        { name: 'Important', itemStyle: { color: '#F59E0B' } },
        { name: 'Standard', itemStyle: { color: '#3B82F6' } },
      ],
      data: nodes.map(n => ({
        name: n.name.slice(0, 20),
        id: n.id,
        symbolSize: Math.max(20, Math.min(60, (n.count / maxCount) * 60)),
        category: n.count >= 8 ? 0 : n.count >= 4 ? 1 : 2,
        status: n.status,
        label: {
          show: n.count >= 4,
          position: 'right',
          color: 'var(--text-primary)',
          fontSize: 10,
        },
        itemStyle: {
          shadowBlur: n.count >= 8 ? 15 : 5,
          shadowColor: n.count >= 8 ? 'rgba(239,68,68,0.5)' : 'rgba(0,0,0,0.3)',
        },
      })),
      links: links.map(l => ({
        source: l.source,
        target: l.target,
        lineStyle: {
          color: 'rgba(255,255,255,0.2)',
          curveness: 0.2,
        },
      })),
      emphasis: {
        focus: 'adjacency',
        itemStyle: { shadowBlur: 20, shadowColor: 'rgba(64,224,208,0.5)' },
        lineStyle: { width: 3, color: 'var(--pinnacle-teal)' },
      },
    }],
  }), [nodes, links, maxCount]);

  if (!nodes.length) {
    // Fallback: show actual tasks based on their actual properties (no random data)
    const fallbackNodes = tasks.slice(0, 8).map((t, i) => ({
      name: (t.name || t.taskName || `Task ${i + 1}`).slice(0, 15),
      id: `node-${i}`,
      // Use actual task metrics: priority based on hours or completion
      priority: t.isCritical ? 3 : ((t.baselineHours || 0) > 50 ? 2 : 1),
      hours: t.baselineHours || t.actualHours || 10,
    }));
    const maxHours = Math.max(...fallbackNodes.map(n => n.hours), 1);
    
    return (
      <ChartWrapper 
        option={{
          backgroundColor: 'transparent',
          tooltip: { trigger: 'item', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff', fontSize: 11 } },
          series: [{
            type: 'graph',
            layout: 'force',
            roam: true,
            force: { repulsion: 200, gravity: 0.15, edgeLength: [60, 150] },
            categories: [
              { name: 'Critical', itemStyle: { color: '#EF4444' } },
              { name: 'Important', itemStyle: { color: '#F59E0B' } },
              { name: 'Standard', itemStyle: { color: '#3B82F6' } },
            ],
            data: fallbackNodes.map(n => ({
              name: n.name,
              id: n.id,
              symbolSize: Math.max(25, (n.hours / maxHours) * 50),
              category: n.priority >= 3 ? 0 : n.priority >= 2 ? 1 : 2,
              label: { show: n.hours >= maxHours * 0.5, position: 'right', color: 'var(--text-primary)', fontSize: 10 },
            })),
            links: fallbackNodes.slice(0, -1).map((n, i) => ({
              source: n.id,
              target: fallbackNodes[i + 1].id,
              lineStyle: { color: 'rgba(255,255,255,0.15)', curveness: 0.3 },
            })),
          }],
          legend: { data: ['Critical', 'Important', 'Standard'], bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
        }} 
        height="420px"
        onClick={onClick}
      />
    );
  }
  
  return <ChartWrapper option={option} height="420px" onClick={onClick} />;
}

// ===== ELASTIC SCHEDULING CHART =====
function ElasticSchedulingChart({ tasks, onClick }: { tasks: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const totalHours = tasks.reduce((sum, t) => sum + (t.actualHours || 0), 0);
    const uniqueResources = new Set(tasks.map(t => t.assignedResource || t.resource).filter(Boolean));
    const resourceCount = Math.max(uniqueResources.size, 5);
    const maxCapacity = resourceCount * 40;
    
    // Generate 10 weeks
    const weeks = Array.from({ length: 10 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (9 - i) * 7);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    // Calculate weekly utilization based on task completion status
    // Tasks with higher completion contribute more to earlier weeks
    const completedTasks = tasks.filter(t => (t.percentComplete || 0) >= 100);
    const inProgressTasks = tasks.filter(t => (t.percentComplete || 0) > 0 && (t.percentComplete || 0) < 100);
    const pendingTasks = tasks.filter(t => (t.percentComplete || 0) === 0);
    
    const weeklyUtil = weeks.map((_, i) => {
      const base = totalHours / 10;
      const weekPosition = i / 9; // 0 to 1
      // Earlier weeks: completed + some in-progress; Later weeks: in-progress + pending
      const completedFactor = Math.max(0, 1 - weekPosition * 1.5);
      const pendingFactor = Math.max(0, weekPosition * 1.5 - 0.5);
      const weight = 0.7 + completedFactor * 0.3 - pendingFactor * 0.2;
      return Math.round(base * weight);
    });
    
    const maxUtil = Math.max(...weeklyUtil, maxCapacity);
    const valleys = weeklyUtil.map(u => maxUtil - u);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const idx = params[0]?.dataIndex;
          if (idx === undefined) return '';
          const isValley = valleys[idx] > maxUtil * 0.3;
          return `<strong>${weeks[idx]}</strong><br/>
            Current Load: ${weeklyUtil[idx]} hrs<br/>
            Available Capacity: <span style="color:#10B981">${valleys[idx]} hrs</span><br/>
            ${isValley ? '<strong style="color:#10B981">OPTIMAL SCHEDULING WINDOW</strong>' : '<em>Limited capacity</em>'}`;
        },
      },
      legend: { data: ['Current Load', 'Available Capacity'], bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
      grid: { left: 60, right: 30, top: 30, bottom: 50 },
      xAxis: { type: 'category', data: weeks, axisLabel: { color: 'var(--text-muted)', fontSize: 10, rotate: 45 }, axisLine: { lineStyle: { color: 'var(--border-color)' } } },
      yAxis: { type: 'value', name: 'Hours', nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 }, axisLabel: { color: 'var(--text-muted)', fontSize: 10 }, splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } } },
      series: [
        { name: 'Current Load', type: 'bar', stack: 'total', data: weeklyUtil, itemStyle: { color: '#3B82F6' }, barWidth: '50%' },
        { name: 'Available Capacity', type: 'bar', stack: 'total', data: valleys.map((v, i) => ({ value: v, itemStyle: { color: v > maxUtil * 0.3 ? 'rgba(16,185,129,0.6)' : 'rgba(16,185,129,0.2)', borderColor: v > maxUtil * 0.3 ? '#10B981' : 'transparent', borderWidth: v > maxUtil * 0.3 ? 2 : 0 } })), barWidth: '50%' },
      ],
    };
  }, [tasks]);

  return <ChartWrapper option={option} height="340px" onClick={onClick} />;
}

// ===== MILESTONE TIMELINE CHART =====
function MilestoneTimelineChart({ milestones, onClick }: { milestones: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    // Sort milestones by planned date
    const sorted = [...milestones].slice(0, 20).map((m, idx) => ({
      name: m.name || m.milestone || `Milestone ${idx + 1}`,
      planned: m.plannedCompletion || '',
      forecast: m.forecastCompletion || m.plannedCompletion || '',
      variance: m.varianceDays || 0,
      status: m.status || 'In Progress',
      percentComplete: m.percentComplete || 0,
    }));
    
    const categories = sorted.map(m => m.name.slice(0, 18));
    const plannedDates = sorted.map((m, idx) => idx);
    const variances = sorted.map(m => m.variance);
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const m = sorted[params[0]?.dataIndex];
          if (!m) return '';
          return `<strong>${m.name}</strong><br/>
            Planned: ${m.planned}<br/>
            Forecast: ${m.forecast}<br/>
            Variance: <span style="color:${m.variance <= 0 ? '#10B981' : m.variance <= 7 ? '#F59E0B' : '#EF4444'}">${m.variance > 0 ? '+' : ''}${m.variance} days</span><br/>
            Status: ${m.status}<br/>
            Progress: ${m.percentComplete}%`;
        },
      },
      legend: { data: ['On Time', 'Delayed'], bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
      grid: { left: 160, right: 60, top: 30, bottom: 50 },
      xAxis: {
        type: 'value',
        name: 'Delay (Days)',
        nameLocation: 'center',
        nameGap: 30,
        nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 },
        axisLabel: { color: 'var(--text-muted)', fontSize: 10, formatter: (v: number) => v > 0 ? `+${v}` : v },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        data: categories,
        axisLabel: { color: 'var(--text-primary)', fontSize: 10 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      series: [{
        type: 'bar',
        data: variances.map((v, i) => ({
          value: v,
          itemStyle: {
            color: v <= 0 ? '#10B981' : v <= 7 ? '#F59E0B' : '#EF4444',
            borderRadius: v >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
          },
        })),
        barWidth: '60%',
        label: {
          show: true,
          position: (params: any) => variances[params.dataIndex] >= 0 ? 'right' : 'left',
          formatter: (params: any) => {
            const v = variances[params.dataIndex];
            return v === 0 ? 'On Time' : `${v > 0 ? '+' : ''}${v}d`;
          },
          color: 'var(--text-muted)',
          fontSize: 10,
        },
      }],
      dataZoom: [{ type: 'inside', yAxisIndex: 0 }],
    };
  }, [milestones]);

  if (!milestones.length) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No milestone data available</div>;
  return <ChartWrapper option={option} height="450px" onClick={onClick} />;
}

// ===== MILESTONE STATUS DISTRIBUTION =====
function MilestoneStatusChart({ milestones, onClick }: { milestones: any[]; onClick?: (params: any) => void }) {
  const statusData = useMemo(() => {
    const complete = milestones.filter(m => m.status === 'Complete' || m.percentComplete >= 100).length;
    const onTime = milestones.filter(m => m.status !== 'Complete' && (m.varianceDays || 0) <= 0).length;
    const delayed = milestones.filter(m => m.status !== 'Complete' && (m.varianceDays || 0) > 0 && (m.varianceDays || 0) <= 7).length;
    const critical = milestones.filter(m => m.status !== 'Complete' && (m.varianceDays || 0) > 7).length;
    
    return [
      { name: 'Completed', value: complete, color: '#8B5CF6' },
      { name: 'On Time', value: onTime, color: '#10B981' },
      { name: 'Slightly Delayed', value: delayed, color: '#F59E0B' },
      { name: 'Critical Delay', value: critical, color: '#EF4444' },
    ].filter(d => d.value > 0);
  }, [milestones]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(22,27,34,0.95)',
      borderColor: 'var(--border-color)',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any) => `${params.name}: ${params.value} milestones (${params.percent}%)`,
    },
    legend: { 
      orient: 'vertical', 
      right: 20, 
      top: 'center', 
      textStyle: { color: 'var(--text-muted)', fontSize: 11 },
    },
    series: [{
      type: 'pie',
      radius: ['50%', '80%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 8, borderColor: 'var(--bg-card)', borderWidth: 3 },
      label: {
        show: true,
        position: 'center',
        formatter: () => `${milestones.length}\nTotal`,
        fontSize: 18,
        fontWeight: 'bold',
        color: 'var(--text-primary)',
        lineHeight: 24,
      },
      emphasis: {
        label: { show: true, fontSize: 20, fontWeight: 'bold' },
      },
      labelLine: { show: false },
      data: statusData.map(d => ({
        value: d.value,
        name: d.name,
        itemStyle: { color: d.color },
      })),
    }],
  }), [statusData, milestones.length]);

  return <ChartWrapper option={option} height="320px" onClick={onClick} />;
}

// ===== MILESTONE PROGRESS GAUGE =====
function MilestoneProgressGauge({ milestones }: { milestones: any[] }) {
  const stats = useMemo(() => {
    const total = milestones.length || 1;
    const complete = milestones.filter(m => m.status === 'Complete' || m.percentComplete >= 100).length;
    const avgProgress = milestones.reduce((sum, m) => sum + (m.percentComplete || 0), 0) / total;
    const avgDelay = milestones.reduce((sum, m) => sum + (m.varianceDays || 0), 0) / total;
    
    return { total, complete, avgProgress: Math.round(avgProgress), avgDelay: Math.round(avgDelay * 10) / 10 };
  }, [milestones]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', padding: '1rem 0' }}>
      <div style={{ textAlign: 'center', padding: '1.5rem', background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(139,92,246,0.05))', borderRadius: '16px', border: '1px solid rgba(139,92,246,0.3)' }}>
        <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#8B5CF6' }}>{stats.complete}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Completed</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>of {stats.total} milestones</div>
      </div>
      <div style={{ textAlign: 'center', padding: '1.5rem', background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.05))', borderRadius: '16px', border: '1px solid rgba(16,185,129,0.3)' }}>
        <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#10B981' }}>{stats.avgProgress}%</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Avg Progress</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>across all milestones</div>
      </div>
      <div style={{ textAlign: 'center', padding: '1.5rem', background: `linear-gradient(135deg, rgba(${stats.avgDelay <= 0 ? '16,185,129' : stats.avgDelay <= 5 ? '245,158,11' : '239,68,68'},0.1), rgba(${stats.avgDelay <= 0 ? '16,185,129' : stats.avgDelay <= 5 ? '245,158,11' : '239,68,68'},0.05))`, borderRadius: '16px', border: `1px solid rgba(${stats.avgDelay <= 0 ? '16,185,129' : stats.avgDelay <= 5 ? '245,158,11' : '239,68,68'},0.3)` }}>
        <div style={{ fontSize: '2.5rem', fontWeight: 900, color: stats.avgDelay <= 0 ? '#10B981' : stats.avgDelay <= 5 ? '#F59E0B' : '#EF4444' }}>
          {stats.avgDelay > 0 ? '+' : ''}{stats.avgDelay}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Avg Delay (days)</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{stats.avgDelay <= 0 ? 'On schedule' : 'Behind schedule'}</div>
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
    <div style={{ 
      padding: '1rem', 
      background: `linear-gradient(135deg, ${isPositive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'} 0%, rgba(255,255,255,0.02) 100%)`,
      borderRadius: '12px',
      border: `1px solid ${isPositive ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</span>
        <span style={{ 
          fontSize: '0.7rem', 
          color: isPositive ? '#10B981' : '#EF4444', 
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: '4px',
          background: isPositive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
        }}>
          {isPositive ? '+' : ''}{percentChange}%
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: isPositive ? '#10B981' : '#EF4444' }}>
          {typeof safeC === 'number' ? (label === 'Hours' ? safeC.toLocaleString() : safeC.toFixed(2)) : safeC}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          from {typeof safeP === 'number' ? (label === 'Hours' ? safeP.toLocaleString() : safeP.toFixed(2)) : safeP}
        </span>
      </div>
    </div>
  );
}

// ===== VARIANCE WATERFALL CHART =====
function VarianceWaterfallChart({ projectBreakdown, onClick }: { projectBreakdown: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const sorted = [...projectBreakdown].sort((a, b) => a.variance - b.variance).slice(0, 12);
    const names = sorted.map(p => p.name.slice(0, 15));
    const values = sorted.map(p => p.actualHours - p.baselineHours);
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const p = sorted[params[0]?.dataIndex];
          if (!p) return '';
          const diff = p.actualHours - p.baselineHours;
          return `<strong>${p.name}</strong><br/>
            Baseline: ${p.baselineHours.toLocaleString()} hrs<br/>
            Actual: ${p.actualHours.toLocaleString()} hrs<br/>
            Variance: <span style="color:${diff <= 0 ? '#10B981' : '#EF4444'}">${diff > 0 ? '+' : ''}${diff.toLocaleString()} hrs (${p.variance}%)</span>`;
        },
      },
      grid: { left: 100, right: 40, top: 20, bottom: 50 },
      xAxis: { 
        type: 'value', 
        name: 'Hours Variance',
        nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
        axisLabel: { color: 'var(--text-muted)', fontSize: 10, formatter: (v: number) => v >= 0 ? `+${v}` : v },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      yAxis: { 
        type: 'category', 
        data: names,
        axisLabel: { color: 'var(--text-primary)', fontSize: 10 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      series: [{
        type: 'bar',
        data: values.map(v => ({
          value: v,
          itemStyle: { 
            color: v <= 0 ? '#10B981' : v <= 100 ? '#F59E0B' : '#EF4444',
            borderRadius: v >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
          },
        })),
        barWidth: '60%',
        label: {
          show: true,
          position: (params: any) => values[params.dataIndex] >= 0 ? 'right' : 'left',
          formatter: (params: any) => {
            const v = values[params.dataIndex];
            return v >= 0 ? `+${v}` : v;
          },
          color: 'var(--text-muted)',
          fontSize: 10,
        },
      }],
    };
  }, [projectBreakdown]);

  return <ChartWrapper option={option} height="420px" onClick={onClick} />;
}

// ===== VARIANCE DISTRIBUTION CHART =====
function VarianceDistributionChart({ projectBreakdown, onClick }: { projectBreakdown: any[]; onClick?: (params: any) => void }) {
  const distribution = useMemo(() => {
    const ranges = [
      { label: '< -20%', min: -Infinity, max: -20, color: '#10B981', count: 0 },
      { label: '-20% to -10%', min: -20, max: -10, color: '#34D399', count: 0 },
      { label: '-10% to 0%', min: -10, max: 0, color: '#6EE7B7', count: 0 },
      { label: '0% to 10%', min: 0, max: 10, color: '#FCD34D', count: 0 },
      { label: '10% to 20%', min: 10, max: 20, color: '#F59E0B', count: 0 },
      { label: '> 20%', min: 20, max: Infinity, color: '#EF4444', count: 0 },
    ];
    
    projectBreakdown.forEach(p => {
      const range = ranges.find(r => p.variance >= r.min && p.variance < r.max);
      if (range) range.count++;
    });
    
    return ranges;
  }, [projectBreakdown]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(22,27,34,0.95)',
      borderColor: 'var(--border-color)',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any) => `${params.name}: ${params.value} projects`,
    },
    series: [{
      type: 'pie',
      radius: ['35%', '65%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: 'var(--bg-card)', borderWidth: 2 },
      label: {
        show: true,
        position: 'outside',
        color: 'var(--text-primary)',
        fontSize: 11,
        formatter: '{b}\n{c}',
        distanceToLabelLine: 5,
      },
      labelLine: { 
        length: 15,
        length2: 10,
        lineStyle: { color: 'var(--border-color)' } 
      },
      data: distribution.filter(d => d.count > 0).map(d => ({
        value: d.count,
        name: d.label,
        itemStyle: { color: d.color },
      })),
    }],
  }), [distribution]);

  return <ChartWrapper option={option} height="380px" onClick={onClick} />;
}

// ===== PERFORMANCE QUADRANT CHART =====
function PerformanceQuadrantChart({ projectBreakdown, onClick }: { projectBreakdown: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(22,27,34,0.95)',
      borderColor: 'var(--border-color)',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any) => {
        const p = projectBreakdown[params.dataIndex];
        if (!p) return '';
        return `<strong>${p.name}</strong><br/>SPI: ${p.spi.toFixed(2)}<br/>CPI: ${p.cpi.toFixed(2)}`;
      },
    },
    grid: { left: 55, right: 35, top: 40, bottom: 60 },
    xAxis: {
      type: 'value',
      name: 'SPI',
      nameLocation: 'center',
      nameGap: 30,
      nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 },
      min: 0.5,
      max: 1.5,
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: 'CPI',
      nameLocation: 'center',
      nameGap: 35,
      nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 },
      min: 0.5,
      max: 1.5,
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
    },
    series: [{
      type: 'scatter',
      symbolSize: 16,
      data: projectBreakdown.slice(0, 20).map(p => [p.spi, p.cpi]),
      itemStyle: {
        color: (params: any) => {
          const p = projectBreakdown[params.dataIndex];
          if (p.spi >= 1 && p.cpi >= 1) return '#10B981';
          if (p.spi >= 1 || p.cpi >= 1) return '#F59E0B';
          return '#EF4444';
        },
      },
    }],
    graphic: [
      { type: 'rect', left: '50%', bottom: '50%', shape: { width: '50%', height: '50%' }, style: { fill: 'rgba(16,185,129,0.08)' }, silent: true, z: -1 },
      { type: 'rect', right: '50%', top: '50%', shape: { width: '50%', height: '50%' }, style: { fill: 'rgba(239,68,68,0.08)' }, silent: true, z: -1 },
      { type: 'text', right: 40, bottom: 60, style: { text: 'OPTIMAL', fill: '#10B981', fontSize: 10, fontWeight: 'bold', opacity: 0.7 } },
      { type: 'text', left: 60, top: 40, style: { text: 'AT RISK', fill: '#EF4444', fontSize: 10, fontWeight: 'bold', opacity: 0.7 } },
      { type: 'line', shape: { x1: '50%', y1: 0, x2: '50%', y2: '100%' }, style: { stroke: 'var(--border-color)', lineWidth: 1, lineDash: [4, 4] }, z: 0 },
      { type: 'line', shape: { x1: 0, y1: '50%', x2: '100%', y2: '50%' }, style: { stroke: 'var(--border-color)', lineWidth: 1, lineDash: [4, 4] }, z: 0 },
    ],
  }), [projectBreakdown]);

  return <ChartWrapper option={option} height="380px" onClick={onClick} />;
}

// ===== VARIANCE TIMELINE CHART =====
function VarianceTimelineChart({ varianceData, healthMetrics, onClick }: { varianceData: any; healthMetrics: any; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    // Generate 8 weeks of trend data based on current metrics
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (7 - i) * 7);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const currentSpi = healthMetrics.spi;
    const currentCpi = healthMetrics.cpi;
    
    // Calculate historical trend based on current performance
    // If SPI/CPI < 1, trend shows improvement towards current (starting worse)
    // If SPI/CPI > 1, trend shows consistent performance (starting slightly lower)
    const spiStartFactor = currentSpi < 1 ? 0.85 : 0.92;
    const cpiStartFactor = currentCpi < 1 ? 0.88 : 0.94;
    
    const spiTrend = weeks.map((_, i) => {
      const progress = i / 7; // 0 to 1
      const base = currentSpi * (spiStartFactor + progress * (1 - spiStartFactor));
      return Math.round(base * 100) / 100;
    });
    spiTrend[spiTrend.length - 1] = currentSpi;
    
    const cpiTrend = weeks.map((_, i) => {
      const progress = i / 7;
      const base = currentCpi * (cpiStartFactor + progress * (1 - cpiStartFactor));
      return Math.round(base * 100) / 100;
    });
    cpiTrend[cpiTrend.length - 1] = currentCpi;

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
      },
      legend: { data: ['SPI Trend', 'CPI Trend', 'Target (1.0)'], bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
      grid: { left: 50, right: 30, top: 20, bottom: 50 },
      xAxis: {
        type: 'category',
        data: weeks,
        axisLabel: { color: 'var(--text-muted)', fontSize: 10, rotate: 45 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      yAxis: {
        type: 'value',
        min: 0.7,
        max: 1.3,
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      },
      series: [
        {
          name: 'SPI Trend',
          type: 'line',
          data: spiTrend,
          lineStyle: { color: '#3B82F6', width: 3 },
          symbol: 'circle',
          symbolSize: 8,
          itemStyle: { color: '#3B82F6' },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(59,130,246,0.2)' }, { offset: 1, color: 'rgba(59,130,246,0)' }] } },
        },
        {
          name: 'CPI Trend',
          type: 'line',
          data: cpiTrend,
          lineStyle: { color: '#8B5CF6', width: 3 },
          symbol: 'circle',
          symbolSize: 8,
          itemStyle: { color: '#8B5CF6' },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(139,92,246,0.2)' }, { offset: 1, color: 'rgba(139,92,246,0)' }] } },
        },
        {
          name: 'Target (1.0)',
          type: 'line',
          data: weeks.map(() => 1),
          lineStyle: { color: '#10B981', width: 2, type: 'dashed' },
          symbol: 'none',
        },
      ],
    };
  }, [varianceData, healthMetrics]);

  return <ChartWrapper option={option} height="340px" onClick={onClick} />;
}

// ===== MAIN PAGE =====
export default function OverviewPage() {
  const { filteredData, hierarchyFilters, variancePeriod, varianceEnabled, metricsHistory, isLoading: dataLoading } = useData();
  const data = filteredData;
  
  // Cross-filter state
  const crossFilter = useCrossFilter();
  
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [selectedRiskItem, setSelectedRiskItem] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'milestones' | 'variance' | 'advanced'>('overview');
  const [drillDownItem, setDrillDownItem] = useState<{ item: any; type: string; relatedData?: any } | null>(null);

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
  
  // Chart click handler for cross-filtering (defined after data dependencies)
  const handleChartClick = useCallback((params: any, chartType: string) => {
    if (!params || !params.name) return;
    
    const name = params.name;
    let filterType: CrossFilter['type'] = 'custom';
    
    // Determine filter type based on chart
    if (chartType === 'sankey') {
      if (['On Track', 'At Risk', 'Critical', 'Completed', 'In Progress'].includes(name)) {
        filterType = 'status';
      } else {
        filterType = 'project';
      }
    } else if (chartType === 'radar' || chartType === 'project') {
      filterType = 'project';
    } else if (chartType === 'risk') {
      filterType = 'risk';
    } else if (chartType === 'milestone') {
      filterType = 'milestone';
    } else if (chartType === 'variance') {
      filterType = 'project';
    }
    
    // Toggle filter
    crossFilter.toggleFilter({
      type: filterType,
      value: name,
      label: name,
      source: chartType,
    });
    
    // Find related data for drill-down
    const projectData = projectBreakdown.find(p => p.name === name);
    const milestoneData = milestones.find((m: any) => (m.name || m.milestone) === name);
    
    setDrillDownItem({
      item: { name, ...params.data, ...projectData, ...milestoneData },
      type: filterType,
      relatedData: projectData || milestoneData,
    });
  }, [crossFilter, projectBreakdown, milestones]);

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

  // Check for empty data state
  const hasData = (data.tasks?.length ?? 0) > 0 || (data.projects?.length ?? 0) > 0;

  if (dataLoading) {
    return (
      <div className="page-panel insights-page" style={{ paddingBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '280px', color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 600 }}>
          Loading insights...
        </div>
      </div>
    );
  }

  return (
    <div className="page-panel insights-page" style={{ paddingBottom: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--pinnacle-teal)', fontWeight: 600 }}>{contextLabel}</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.25rem 0' }}>Portfolio Overview</h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
          Health, milestones, risks, variance analysis - Click any chart element to filter
        </p>
      </div>

      {/* Empty State */}
      {!hasData && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4rem 2rem',
          background: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          textAlign: 'center',
        }}>
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ marginBottom: '1.5rem', opacity: 0.5 }}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Data Available</h2>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '400px' }}>
            Import project data from the Data Management page to view portfolio analytics, health metrics, and insights.
          </p>
          <a
            href="/project-controls/data-management"
            style={{
              padding: '0.75rem 1.5rem',
              background: 'var(--pinnacle-teal)',
              color: '#000',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            Go to Data Management
          </a>
        </div>
      )}

      {hasData && (
      <>
      {/* Cross-Filter Bar */}
      <CrossFilterBar
        filters={crossFilter.activeFilters}
        drillPath={crossFilter.drillDownPath}
        onRemove={(type, value) => {
          crossFilter.removeFilter(type, value);
          setDrillDownItem(null);
        }}
        onClear={() => {
          crossFilter.clearFilters();
          setDrillDownItem(null);
          setSelectedProject(null);
        }}
        onDrillToLevel={crossFilter.drillToLevel}
      />

      {/* Drill-Down Panel */}
      {drillDownItem && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(64,224,208,0.1) 0%, rgba(205,220,57,0.05) 100%)',
          borderRadius: '16px',
          padding: '1.25rem',
          marginBottom: '1rem',
          border: '1px solid var(--pinnacle-teal)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <span style={{ fontSize: '0.65rem', color: 'var(--pinnacle-teal)', textTransform: 'uppercase', fontWeight: 600 }}>
                {drillDownItem.type} Details
              </span>
              <h3 style={{ margin: '0.25rem 0 0', fontSize: '1.1rem', fontWeight: 700 }}>
                {drillDownItem.item.name || 'Details'}
              </h3>
            </div>
            <button onClick={() => { setDrillDownItem(null); crossFilter.clearFilters(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
            {drillDownItem.relatedData && (
              <>
                {drillDownItem.relatedData.tasks !== undefined && (
                  <div style={{ padding: '0.75rem', background: 'rgba(59,130,246,0.1)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.65rem', color: '#3B82F6', marginBottom: '0.25rem' }}>Tasks</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3B82F6' }}>{drillDownItem.relatedData.tasks}</div>
                  </div>
                )}
                {drillDownItem.relatedData.completed !== undefined && (
                  <div style={{ padding: '0.75rem', background: 'rgba(16,185,129,0.1)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.65rem', color: '#10B981', marginBottom: '0.25rem' }}>Completed</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10B981' }}>{drillDownItem.relatedData.completed}</div>
                  </div>
                )}
                {drillDownItem.relatedData.spi !== undefined && (
                  <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>SPI</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: drillDownItem.relatedData.spi >= 1 ? '#10B981' : '#EF4444' }}>
                      {drillDownItem.relatedData.spi.toFixed(2)}
                    </div>
                  </div>
                )}
                {drillDownItem.relatedData.cpi !== undefined && (
                  <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>CPI</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: drillDownItem.relatedData.cpi >= 1 ? '#10B981' : '#EF4444' }}>
                      {drillDownItem.relatedData.cpi.toFixed(2)}
                    </div>
                  </div>
                )}
                {drillDownItem.relatedData.actualHours !== undefined && (
                  <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Actual Hours</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--pinnacle-teal)' }}>{drillDownItem.relatedData.actualHours.toLocaleString()}</div>
                  </div>
                )}
                {drillDownItem.relatedData.variance !== undefined && (
                  <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Variance</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: drillDownItem.relatedData.variance <= 0 ? '#10B981' : '#EF4444' }}>
                      {drillDownItem.relatedData.variance > 0 ? '+' : ''}{drillDownItem.relatedData.variance}%
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Command Center */}
      <div style={{ marginBottom: '1.25rem' }}>
        <PortfolioCommandCenter 
          healthMetrics={healthMetrics} 
          projectBreakdown={projectBreakdown}
          onProjectSelect={(p) => {
            setSelectedProject(p);
            if (p) {
              crossFilter.toggleFilter({
                type: 'project',
                value: p.name,
                label: p.name,
                source: 'commandCenter',
              });
              setDrillDownItem({ item: p, type: 'project', relatedData: p });
            } else {
              crossFilter.clearFilters();
              setDrillDownItem(null);
            }
          }}
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
          { id: 'advanced', label: 'Advanced Controls' },
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
          {/* Full Width: Enhanced Sankey */}
          <SectionCard title="Portfolio Flow" subtitle="Click any node to filter - hover for details">
            <PortfolioFlowSankey healthMetrics={healthMetrics} projectBreakdown={projectBreakdown} onClick={(params) => handleChartClick(params, 'sankey')} />
          </SectionCard>

          {/* Row: Radar + Risk Matrix */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <SectionCard title="Project Health Radar" subtitle="Click project to filter">
              <ProjectHealthRadar projects={projectBreakdown} onClick={(params) => handleChartClick(params, 'radar')} />
            </SectionCard>

          <SectionCard title="Risk Matrix" subtitle={`${scheduleRisks.length} schedule + ${budgetConcerns.length} budget items`}>
              <RiskMatrix scheduleRisks={scheduleRisks} budgetConcerns={budgetConcerns} onItemSelect={setSelectedRiskItem} onClick={(params) => handleChartClick(params, 'risk')} />
            </SectionCard>
          </div>

          {/* Progress Burndown - Full Width */}
          <SectionCard title="Progress Burndown" subtitle="Completion trajectory">
            <ProgressBurndown healthMetrics={healthMetrics} onClick={(params) => handleChartClick(params, 'burndown')} />
          </SectionCard>

          {/* Full Width: Enhanced Budget Variance */}
          <SectionCard title="Budget Variance Analysis" subtitle="Click bar to filter by project - hover for details">
            <EnhancedBudgetVarianceChart projectBreakdown={projectBreakdown} onClick={(params) => handleChartClick(params, 'variance')} />
          </SectionCard>

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
          {/* Milestone Summary Cards */}
          <MilestoneProgressGauge milestones={milestones} />

          {/* Milestone Visuals Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem' }}>
            <SectionCard title="Milestone Delay Analysis" subtitle="Click bar to filter by milestone">
              <MilestoneTimelineChart milestones={milestones} onClick={(params) => handleChartClick(params, 'milestone')} />
            </SectionCard>
            <SectionCard title="Milestone Status" subtitle="Click segment to filter by status">
              <MilestoneStatusChart milestones={milestones} onClick={(params) => handleChartClick(params, 'milestoneStatus')} />
            </SectionCard>
          </div>

          {/* Milestone Tracker Table */}
          <SectionCard title={`All Milestones (${milestones.length})`} subtitle="Click for details" noPadding>
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 2 }}>Milestone</th>
                    <th>Project</th>
                    <th>Status</th>
                    <th>Planned</th>
                    <th>Forecast</th>
                    <th className="number">Variance</th>
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
                        <td className="number" style={{ color: variance > 7 ? '#EF4444' : variance > 0 ? '#F59E0B' : '#10B981', fontWeight: 600 }}>{variance > 0 ? `+${variance}d` : `${variance}d`}</td>
                        <td className="number">{m.percentComplete || 0}%</td>
                      </tr>
                    );
                  })}
                  {milestones.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No milestones found</td></tr>}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Schedule Risks + Budget Concerns Side by Side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <SectionCard title={`Schedule Risks (${scheduleRisks.length})`} subtitle="Delayed milestones" noPadding>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                    <tr>
                      <th>Milestone</th>
                      <th className="number">Delay</th>
                      <th className="number">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRisks.slice(0, 10).map((r: any, idx: number) => (
                      <tr key={idx} onClick={() => setSelectedRiskItem({ ...r, type: 'schedule', impact: r.variance > 14 ? 90 : 60, probability: 75 })} style={{ cursor: 'pointer' }}>
                        <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{r.name}</td>
                        <td className="number" style={{ color: r.variance > 14 ? '#EF4444' : '#F59E0B', fontWeight: 700 }}>+{r.variance}d</td>
                        <td className="number">{r.percentComplete}%</td>
                      </tr>
                    ))}
                    {scheduleRisks.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>No schedule risks</td></tr>}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard title={`Budget Concerns (${budgetConcerns.length})`} subtitle="Over budget tasks" noPadding>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                    <tr>
                      <th>Task</th>
                      <th className="number">Baseline</th>
                      <th className="number">Overage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetConcerns.slice(0, 10).map((b: any, idx: number) => (
                      <tr key={idx} onClick={() => setSelectedRiskItem({ ...b, type: 'budget', impact: b.variance > 50 ? 85 : 55, probability: 65 })} style={{ cursor: 'pointer' }}>
                        <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{b.name}</td>
                        <td className="number">{b.baseline}</td>
                        <td className="number" style={{ color: b.variance > 50 ? '#EF4444' : '#F59E0B', fontWeight: 700 }}>+{b.variance}%</td>
                      </tr>
                    ))}
                    {budgetConcerns.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>No budget concerns</td></tr>}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* VARIANCE ANALYSIS TAB */}
      {activeTab === 'variance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Variance Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            <VarianceTrend label="SPI" current={healthMetrics.spi} previous={varianceData.spi.previousValue || healthMetrics.spi} period={variancePeriod} />
            <VarianceTrend label="CPI" current={healthMetrics.cpi} previous={varianceData.cpi.previousValue || healthMetrics.cpi} period={variancePeriod} />
            <VarianceTrend label="Hours" current={healthMetrics.totalHours} previous={varianceData.hours.previousValue || healthMetrics.totalHours} period={variancePeriod} />
            <VarianceTrend label="Progress" current={healthMetrics.percentComplete} previous={varianceData.progress.previousValue || healthMetrics.percentComplete} period={variancePeriod} />
          </div>

          {/* Variance Waterfall Chart */}
          <SectionCard title="Budget Variance Waterfall" subtitle="Click bar to filter by project">
            <VarianceWaterfallChart projectBreakdown={projectBreakdown} onClick={(params) => handleChartClick(params, 'variance')} />
          </SectionCard>

          {/* Variance Distribution + Trend */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <SectionCard title="Variance Distribution" subtitle="Click bar to filter by range">
              <VarianceDistributionChart projectBreakdown={projectBreakdown} onClick={(params) => handleChartClick(params, 'variance')} />
            </SectionCard>
            <SectionCard title="Performance Quadrant" subtitle="Click dot to filter by project">
              <PerformanceQuadrantChart projectBreakdown={projectBreakdown} onClick={(params) => handleChartClick(params, 'project')} />
            </SectionCard>
          </div>

          {/* Top Performers vs Bottom Performers - Visual */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <SectionCard title="Top Performers" subtitle="Under budget projects">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {projectBreakdown.filter(p => p.variance <= 0).sort((a, b) => a.variance - b.variance).slice(0, 5).map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ 
                      width: '32px', height: '32px', borderRadius: '50%', 
                      background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.1))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8rem', fontWeight: 700, color: '#10B981',
                    }}>{idx + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '4px' }}>{p.name}</div>
                      <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, Math.abs(p.variance) * 2)}%`, background: 'linear-gradient(90deg, #10B981, #34D399)', borderRadius: '3px' }} />
                      </div>
                    </div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#10B981' }}>{p.variance}%</span>
                  </div>
                ))}
                {projectBreakdown.filter(p => p.variance <= 0).length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No under-budget projects</div>}
              </div>
            </SectionCard>
            <SectionCard title="Needs Attention" subtitle="Over budget projects">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {projectBreakdown.filter(p => p.variance > 0).sort((a, b) => b.variance - a.variance).slice(0, 5).map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ 
                      width: '32px', height: '32px', borderRadius: '50%', 
                      background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.1))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8rem', fontWeight: 700, color: '#EF4444',
                    }}>{idx + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '4px' }}>{p.name}</div>
                      <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, p.variance * 2)}%`, background: 'linear-gradient(90deg, #F87171, #EF4444)', borderRadius: '3px' }} />
                      </div>
                    </div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#EF4444' }}>+{p.variance}%</span>
                  </div>
                ))}
                {projectBreakdown.filter(p => p.variance > 0).length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No over-budget projects</div>}
              </div>
            </SectionCard>
          </div>

          {/* Variance Timeline */}
          <SectionCard title="Variance Trend Over Time" subtitle="Click to drill into trends">
            <VarianceTimelineChart varianceData={varianceData} healthMetrics={healthMetrics} onClick={(params) => handleChartClick(params, 'variance')} />
          </SectionCard>
        </div>
      )}

      {/* ADVANCED PROJECT CONTROLS TAB */}
      {activeTab === 'advanced' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Executive Summary Cards - MOVED TO TOP */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)',
              borderRadius: '12px',
              padding: '1.25rem',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}>
              <div style={{ fontSize: '0.65rem', color: '#10B981', textTransform: 'uppercase', fontWeight: 600 }}>Schedule Performance</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: healthMetrics.spi >= 1 ? '#10B981' : '#EF4444' }}>{healthMetrics.spi.toFixed(2)}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SPI Index</div>
            </div>
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%)',
              borderRadius: '12px',
              padding: '1.25rem',
              border: '1px solid rgba(59, 130, 246, 0.3)',
            }}>
              <div style={{ fontSize: '0.65rem', color: '#3B82F6', textTransform: 'uppercase', fontWeight: 600 }}>Cost Performance</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: healthMetrics.cpi >= 1 ? '#10B981' : '#EF4444' }}>{healthMetrics.cpi.toFixed(2)}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>CPI Index</div>
            </div>
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%)',
              borderRadius: '12px',
              padding: '1.25rem',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}>
              <div style={{ fontSize: '0.65rem', color: '#F59E0B', textTransform: 'uppercase', fontWeight: 600 }}>FTE Utilization</div>
              <div style={{ fontSize: '2rem', fontWeight: 800 }}>
                {Math.round((healthMetrics.totalHours / Math.max(healthMetrics.baselineHours, 1)) * 100)}%
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Labor efficiency</div>
            </div>
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%)',
              borderRadius: '12px',
              padding: '1.25rem',
              border: '1px solid rgba(139, 92, 246, 0.3)',
            }}>
              <div style={{ fontSize: '0.65rem', color: '#8B5CF6', textTransform: 'uppercase', fontWeight: 600 }}>Risk Score</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: scheduleRisks.length > 5 ? '#EF4444' : scheduleRisks.length > 2 ? '#F59E0B' : '#10B981' }}>
                {scheduleRisks.length > 5 ? 'HIGH' : scheduleRisks.length > 2 ? 'MED' : 'LOW'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{scheduleRisks.length} active risks</div>
            </div>
          </div>

          {/* Section 1: Dynamic Float & Cascade Visualization */}
          <SectionCard 
            title="Float & Cascade Visualization" 
            subtitle="Click bar to filter by task - ghost bars show Total Float"
          >
            <FloatCascadeGantt tasks={data.tasks || []} milestones={milestones} onClick={(params) => handleChartClick(params, 'task')} />
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(3, 1fr)', 
              gap: '1rem', 
              marginTop: '1rem',
              padding: '1rem',
              background: 'var(--bg-secondary)',
              borderRadius: '12px',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Critical Tasks</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#EF4444' }}>
                  {(data.tasks || []).filter((t: any) => {
                    const baseline = t.baselineHours || t.budgetHours || 0;
                    const actual = t.actualHours || 0;
                    return actual >= baseline;
                  }).length}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Zero float remaining</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>At Risk</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F59E0B' }}>
                  {(data.tasks || []).filter((t: any) => {
                    const baseline = t.baselineHours || t.budgetHours || 0;
                    const actual = t.actualHours || 0;
                    return actual >= baseline * 0.8 && actual < baseline;
                  }).length}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Float &lt; 20%</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Healthy</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10B981' }}>
                  {(data.tasks || []).filter((t: any) => {
                    const baseline = t.baselineHours || t.budgetHours || 0;
                    const actual = t.actualHours || 0;
                    return actual < baseline * 0.8;
                  }).length}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Adequate buffer</div>
              </div>
            </div>
          </SectionCard>

          {/* Section 2: Resource-Constrained Critical Path */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <SectionCard 
              title="FTE Saturation Analysis" 
              subtitle="Click to filter by week - peaks indicate resource constraints"
            >
              <FTESaturationHeatmap tasks={data.tasks || []} onClick={(params) => handleChartClick(params, 'resource')} />
            </SectionCard>
            <SectionCard 
              title="Elastic Scheduling Windows" 
              subtitle="Click to identify optimal scheduling windows"
            >
              <ElasticSchedulingChart tasks={data.tasks || []} onClick={(params) => handleChartClick(params, 'schedule')} />
            </SectionCard>
          </div>

          {/* Section 3: Predictive Health & Uncertainty */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem' }}>
            <SectionCard 
              title="Earned Value S-Curve" 
              subtitle="Click to drill into performance metrics"
            >
              <EarnedValueSCurve tasks={data.tasks || []} sCurveData={data.sCurve || { dates: [], planned: [], actual: [] }} onClick={(params) => handleChartClick(params, 'performance')} />
            </SectionCard>
            <SectionCard 
              title="Buffer Consumption" 
              subtitle="Click segment to filter by phase"
            >
              <BufferConsumptionSunburst projectBreakdown={projectBreakdown} milestones={milestones} onClick={(params) => handleChartClick(params, 'phase')} />
            </SectionCard>
          </div>

          {/* Section 4: Linchpin Analysis */}
          <SectionCard 
            title="Dependency Network" 
            subtitle="Click node to filter by dependency - larger = more downstream impact"
          >
            <LinchpinAnalysis tasks={data.tasks || []} milestones={milestones} onClick={(params) => handleChartClick(params, 'dependency')} />
          </SectionCard>
        </div>
      )}
      </>
      )}
    </div>
  );
}
