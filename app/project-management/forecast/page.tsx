'use client';

/**
 * @fileoverview Advanced Forecasting & Scenario Analysis Page for PPC V3
 * 
 * Comprehensive executive forecasting with:
 * - PO vs Actual Cost Analysis with burn-rate tracking
 * - FTE Constraint Visualization (capacity vs demand)
 * - Float Analysis & Cascade Impact (milestone delay propagation)
 * - Monte Carlo Scenarios (P10/P50/P90)
 * - Resource-Constrained Schedule Forecasting
 * - What-If Scenario Modeling
 * 
 * Designed for senior manager presentations focusing on:
 * - Will we hit the deadline with current FTE?
 * - How does a delayed milestone cascade?
 * - What's our budget burn rate vs PO?
 * 
 * @module app/project-management/forecast/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import {
  EngineParams,
  DEFAULT_ENGINE_PARAMS,
  runForecastSimulation,
  ProjectState,
  ForecastResult,
} from '@/lib/forecasting-engine';
import { CPMEngine } from '@/lib/cpm-engine';
import type { EChartsOption } from 'echarts';

// ===== SECTION CARD =====
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
      boxShadow: accent ? `0 0 20px ${accent}15` : undefined,
    }}>
      <div style={{ 
        padding: '0.875rem 1rem', 
        borderBottom: '1px solid var(--border-color)', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexShrink: 0,
        background: accent ? `${accent}08` : undefined,
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: accent || 'var(--text-primary)' }}>{title}</h3>
          {subtitle && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{subtitle}</span>}
        </div>
        {headerRight}
      </div>
      <div style={{ padding: noPadding ? 0 : '1rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>
    </div>
  );
}

// ===== KPI CARD =====
function KPICard({ label, value, subValue, color, icon, trend }: {
  label: string; value: string | number; subValue?: string; color: string; icon?: string; trend?: 'up' | 'down' | 'flat';
}) {
  const trendColor = trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#6B7280';
  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}15 0%, var(--bg-card) 100%)`,
      borderRadius: '16px',
      padding: '1.25rem',
      border: `1px solid ${color}30`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>{label}</div>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {value}
        {trend && (
          <svg viewBox="0 0 24 24" width="16" height="16" fill={trendColor}>
            {trend === 'up' && <path d="M7 14l5-5 5 5z" />}
            {trend === 'down' && <path d="M7 10l5 5 5-5z" />}
            {trend === 'flat' && <path d="M4 12h16" stroke={trendColor} strokeWidth="2" fill="none" />}
          </svg>
        )}
      </div>
      {subValue && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{subValue}</div>}
      <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', fontSize: '4rem', opacity: 0.05, fontWeight: 900 }}>{icon || '$'}</div>
    </div>
  );
}

// ===== PO VS COST GAUGE =====
function POCostGauge({ po, actualCost, forecastCost }: { po: number; actualCost: number; forecastCost: number }) {
  const burnRate = po > 0 ? (actualCost / po) * 100 : 0;
  const forecastRate = po > 0 ? (forecastCost / po) * 100 : 0;
  const remaining = Math.max(0, po - actualCost);
  const overBudget = forecastCost > po;
  
  const gaugeColor = burnRate < 70 ? '#10B981' : burnRate < 90 ? '#F59E0B' : '#EF4444';
  
  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { show: false },
    series: [
      // Outer ring - Forecast
      {
        type: 'gauge',
        center: ['50%', '60%'],
        radius: '95%',
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        splitNumber: 10,
        pointer: { show: false },
        progress: {
          show: true,
          width: 12,
          itemStyle: { color: overBudget ? '#EF4444' : '#8B5CF6' }
        },
        axisLine: { lineStyle: { width: 12, color: [[1, 'rgba(255,255,255,0.1)']] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: { show: false },
        data: [{ value: Math.min(forecastRate, 120) }]
      },
      // Inner ring - Actual
      {
        type: 'gauge',
        center: ['50%', '60%'],
        radius: '78%',
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        pointer: {
          show: true,
          length: '60%',
          width: 4,
          itemStyle: { color: gaugeColor }
        },
        progress: {
          show: true,
          width: 18,
          itemStyle: { color: gaugeColor }
        },
        axisLine: { lineStyle: { width: 18, color: [[1, 'rgba(255,255,255,0.08)']] } },
        axisTick: { show: false },
        splitLine: { length: 8, lineStyle: { color: 'var(--text-muted)', width: 1 } },
        axisLabel: { 
          distance: 25,
          fontSize: 10,
          color: 'var(--text-muted)',
          formatter: (v: number) => v % 25 === 0 ? `${v}%` : ''
        },
        detail: {
          offsetCenter: [0, '25%'],
          fontSize: 28,
          fontWeight: 'bold',
          color: gaugeColor,
          formatter: () => `${burnRate.toFixed(0)}%`
        },
        data: [{ value: burnRate }]
      }
    ]
  }), [burnRate, forecastRate, gaugeColor, overBudget]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: '280px' }}>
        <ChartWrapper option={option} height="100%" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(16,185,129,0.1)', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>PO Amount</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#10B981' }}>${(po / 1000).toFixed(0)}K</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: `rgba(${overBudget ? '239,68,68' : '64,224,208'},0.1)`, borderRadius: '10px' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Spent</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: gaugeColor }}>${(actualCost / 1000).toFixed(0)}K</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(139,92,246,0.1)', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Remaining</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: remaining > 0 ? '#8B5CF6' : '#EF4444' }}>${(remaining / 1000).toFixed(0)}K</div>
        </div>
      </div>
    </div>
  );
}

// ===== FTE CAPACITY VS DEMAND =====
function FTECapacityChart({ tasks, fteLimit }: { tasks: any[]; fteLimit: number }) {
  const option: EChartsOption = useMemo(() => {
    // Simulate weekly demand based on tasks
    const weeks: string[] = [];
    const demand: number[] = [];
    const capacity: number[] = [];
    
    const today = new Date();
    for (let i = 0; i < 12; i++) {
      const weekDate = new Date(today);
      weekDate.setDate(today.getDate() + (i * 7));
      weeks.push(`W${i + 1}`);
      
      // Calculate demand based on active tasks in this week
      const weekStart = new Date(weekDate);
      const weekEnd = new Date(weekDate);
      weekEnd.setDate(weekEnd.getDate() + 7);
      
      let weeklyDemand = 0;
      tasks.forEach(task => {
        if (!task.startDate || !task.endDate) return;
        const start = new Date(task.startDate);
        const end = new Date(task.endDate);
        if (start <= weekEnd && end >= weekStart) {
          weeklyDemand += (task.baselineHours || 8) / 40; // Convert hours to FTE
        }
      });
      
      demand.push(Math.round(weeklyDemand * 10) / 10);
      capacity.push(fteLimit);
    }
    
    const maxDemand = Math.max(...demand);
    const overloadWeeks = demand.filter((d, i) => d > capacity[i]).length;
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
      },
      legend: {
        data: ['Demand (FTE)', 'Capacity'],
        bottom: 0,
        textStyle: { color: 'var(--text-muted)', fontSize: 10 }
      },
      grid: { left: 50, right: 20, top: 30, bottom: 40 },
      xAxis: {
        type: 'category',
        data: weeks,
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } }
      },
      yAxis: {
        type: 'value',
        name: 'FTE',
        nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } }
      },
      series: [
        {
          name: 'Demand (FTE)',
          type: 'bar',
          data: demand.map((d, i) => ({
            value: d,
            itemStyle: { 
              color: d > capacity[i] ? '#EF4444' : d > capacity[i] * 0.9 ? '#F59E0B' : '#3B82F6',
              borderRadius: [4, 4, 0, 0]
            }
          })),
          barMaxWidth: 30,
        },
        {
          name: 'Capacity',
          type: 'line',
          data: capacity,
          lineStyle: { color: '#10B981', width: 2, type: 'dashed' },
          symbol: 'none',
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#EF4444', type: 'solid', width: 2 },
            label: { show: true, formatter: 'MAX FTE', position: 'end', color: '#EF4444', fontSize: 10 },
            data: [{ yAxis: fteLimit }]
          }
        }
      ]
    };
  }, [tasks, fteLimit]);

  return <ChartWrapper option={option} height="320px" />;
}

// ===== CASCADE IMPACT ANALYZER =====
function CascadeImpactChart({ milestones, tasks }: { milestones: any[]; tasks: any[] }) {
  const [selectedMilestone, setSelectedMilestone] = useState<any>(null);
  const [delayDays, setDelayDays] = useState(5);

  const cascadeAnalysis = useMemo(() => {
    if (!selectedMilestone) return null;
    
    // Find all tasks that depend on this milestone (direct and indirect)
    const affectedTasks: any[] = [];
    const visited = new Set<string>();
    
    const findDependents = (taskId: string, depth: number) => {
      tasks.forEach(t => {
        if (visited.has(t.id)) return;
        const hasDep = t.predecessors?.some((p: any) => p.taskId === taskId);
        if (hasDep) {
          visited.add(t.id);
          affectedTasks.push({ ...t, cascadeDepth: depth, delayImpact: delayDays * (1 + depth * 0.1) });
          findDependents(t.id, depth + 1);
        }
      });
    };
    
    findDependents(selectedMilestone.id, 0);
    
    // Calculate total impact
    const totalDelay = affectedTasks.reduce((sum, t) => sum + (t.delayImpact || 0), 0);
    const criticalAffected = affectedTasks.filter(t => t.isCritical || t.is_critical);
    const projectDelayRisk = criticalAffected.length > 0 ? delayDays : 0;
    
    return {
      affectedTasks,
      totalTasks: affectedTasks.length,
      criticalAffected: criticalAffected.length,
      projectDelayRisk,
      maxDepth: Math.max(0, ...affectedTasks.map(t => t.cascadeDepth))
    };
  }, [selectedMilestone, tasks, delayDays]);

  const option: EChartsOption = useMemo(() => {
    if (!cascadeAnalysis || cascadeAnalysis.affectedTasks.length === 0) {
      return {
        title: { text: 'Select a milestone to analyze', left: 'center', top: 'center', textStyle: { color: 'var(--text-muted)', fontSize: 12 } },
        series: []
      };
    }
    
    // Build tree data for sunburst
    const buildTree = (depth: number): any[] => {
      return cascadeAnalysis.affectedTasks
        .filter(t => t.cascadeDepth === depth)
        .map(t => ({
          name: t.name?.slice(0, 20) || 'Task',
          value: t.delayImpact || delayDays,
          itemStyle: { 
            color: t.isCritical || t.is_critical ? '#EF4444' : 
                   t.cascadeDepth === 0 ? '#F59E0B' : 
                   t.cascadeDepth === 1 ? '#3B82F6' : '#8B5CF6'
          },
          children: buildTree(depth + 1)
        }));
    };
    
    const treeData = [{
      name: selectedMilestone?.name?.slice(0, 15) || 'Milestone',
      value: delayDays,
      itemStyle: { color: '#EF4444' },
      children: buildTree(0)
    }];

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => `<b>${params.name}</b><br/>Delay Impact: ${params.value?.toFixed(1)} days`
      },
      series: [{
        type: 'sunburst',
        data: treeData,
        radius: ['15%', '90%'],
        sort: undefined,
        emphasis: { focus: 'ancestor' },
        levels: [
          {},
          { r0: '15%', r: '35%', itemStyle: { borderWidth: 2 }, label: { rotate: 'tangential', fontSize: 9 } },
          { r0: '35%', r: '60%', label: { rotate: 'tangential', fontSize: 8 } },
          { r0: '60%', r: '80%', label: { rotate: 'tangential', fontSize: 7 } },
          { r0: '80%', r: '90%', label: { show: false } }
        ]
      }]
    };
  }, [cascadeAnalysis, selectedMilestone, delayDays]);

  const upcomingMilestones = milestones.filter(m => {
    const d = new Date(m.date || m.dueDate);
    return d >= new Date();
  }).slice(0, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem' }}>
      {/* Milestone Selector + Delay Slider */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {upcomingMilestones.map((m, i) => (
            <button
              key={i}
              onClick={() => setSelectedMilestone(selectedMilestone?.id === m.id ? null : m)}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '20px',
                border: `1px solid ${selectedMilestone?.id === m.id ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
                background: selectedMilestone?.id === m.id ? 'rgba(64,224,208,0.15)' : 'var(--bg-tertiary)',
                color: selectedMilestone?.id === m.id ? 'var(--pinnacle-teal)' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {m.name?.slice(0, 15) || 'Milestone'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-tertiary)', padding: '0.5rem 1rem', borderRadius: '10px' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Delay:</span>
          <input
            type="range"
            min="1"
            max="30"
            value={delayDays}
            onChange={(e) => setDelayDays(parseInt(e.target.value))}
            style={{ width: '80px', accentColor: '#EF4444' }}
          />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#EF4444', minWidth: '50px' }}>{delayDays} days</span>
        </div>
      </div>
      
      {/* Sunburst Chart */}
      <div style={{ flex: 1, minHeight: '300px' }}>
        <ChartWrapper option={option} height="100%" />
      </div>
      
      {/* Impact Summary */}
      {cascadeAnalysis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
          <div style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(239,68,68,0.1)', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Affected Tasks</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#EF4444' }}>{cascadeAnalysis.totalTasks}</div>
          </div>
          <div style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(249,115,22,0.1)', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Critical Path</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#F97316' }}>{cascadeAnalysis.criticalAffected}</div>
          </div>
          <div style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(139,92,246,0.1)', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cascade Depth</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#8B5CF6' }}>{cascadeAnalysis.maxDepth}</div>
          </div>
          <div style={{ textAlign: 'center', padding: '0.75rem', background: cascadeAnalysis.projectDelayRisk > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.1)', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Project Delay</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: cascadeAnalysis.projectDelayRisk > 0 ? '#EF4444' : '#10B981' }}>
              {cascadeAnalysis.projectDelayRisk > 0 ? `+${cascadeAnalysis.projectDelayRisk}d` : 'None'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== SCENARIO COMPARISON WATERFALL =====
function ScenarioWaterfall({ forecastResult, bac }: { forecastResult: ForecastResult | null; bac: number }) {
  const option: EChartsOption = useMemo(() => {
    if (!forecastResult) return { series: [] };
    
    const { monteCarloCost } = forecastResult;
    const variance10 = monteCarloCost.p10 - bac;
    const variance50 = monteCarloCost.p50 - bac;
    const variance90 = monteCarloCost.p90 - bac;
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const d = params[0];
          return `<b>${d.name}</b><br/>Value: $${(d.value / 1000).toFixed(0)}K`;
        }
      },
      grid: { left: 80, right: 40, top: 40, bottom: 60 },
      xAxis: {
        type: 'category',
        data: ['Baseline (BAC)', 'P10 Best', 'P50 Likely', 'P90 Worst'],
        axisLabel: { color: 'var(--text-muted)', fontSize: 10, rotate: 15 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } }
      },
      yAxis: {
        type: 'value',
        axisLabel: { 
          color: 'var(--text-muted)', 
          fontSize: 10,
          formatter: (v: number) => `$${(v / 1000).toFixed(0)}K`
        },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } }
      },
      series: [{
        type: 'bar',
        data: [
          { value: bac, itemStyle: { color: '#6B7280', borderRadius: [6, 6, 0, 0] } },
          { value: monteCarloCost.p10, itemStyle: { color: '#10B981', borderRadius: [6, 6, 0, 0] } },
          { value: monteCarloCost.p50, itemStyle: { color: '#3B82F6', borderRadius: [6, 6, 0, 0] } },
          { value: monteCarloCost.p90, itemStyle: { color: '#EF4444', borderRadius: [6, 6, 0, 0] } },
        ],
        barMaxWidth: 60,
        label: {
          show: true,
          position: 'top',
          color: 'var(--text-secondary)',
          fontSize: 11,
          fontWeight: 600,
          formatter: (params: any) => `$${(params.value / 1000).toFixed(0)}K`
        }
      }]
    };
  }, [forecastResult, bac]);

  return <ChartWrapper option={option} height="300px" />;
}

// ===== FLOAT CONSUMPTION GAUGE =====
function FloatConsumptionGauge({ cpmResult }: { cpmResult: any }) {
  const floatData = useMemo(() => {
    if (!cpmResult?.tasks?.length) return { consumed: 0, remaining: 100, critical: 0 };
    
    const totalFloat = cpmResult.tasks.reduce((sum: number, t: any) => sum + (t.totalFloat || 0), 0);
    const avgFloat = totalFloat / cpmResult.tasks.length;
    const criticalCount = cpmResult.tasks.filter((t: any) => t.isCritical).length;
    const criticalPct = (criticalCount / cpmResult.tasks.length) * 100;
    
    // Estimate consumed float (simplified)
    const maxPossibleFloat = cpmResult.projectDuration * 0.3; // 30% of project duration
    const consumed = Math.max(0, 100 - (avgFloat / maxPossibleFloat) * 100);
    
    return {
      consumed: Math.min(100, consumed),
      remaining: Math.max(0, 100 - consumed),
      critical: criticalPct,
      avgFloat,
      criticalCount
    };
  }, [cpmResult]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { show: false },
    series: [{
      type: 'pie',
      radius: ['65%', '85%'],
      center: ['50%', '50%'],
      startAngle: 90,
      data: [
        { value: floatData.consumed, name: 'Consumed', itemStyle: { color: '#EF4444' } },
        { value: floatData.remaining, name: 'Remaining', itemStyle: { color: '#10B981' } },
      ],
      label: { show: false },
      emphasis: { scale: false }
    }],
    graphic: [{
      type: 'text',
      left: 'center',
      top: '42%',
      style: {
        text: `${(floatData?.remaining || 0).toFixed(0)}%`,
        fontSize: 28,
        fontWeight: 'bold',
        fill: floatData.remaining > 30 ? '#10B981' : floatData.remaining > 10 ? '#F59E0B' : '#EF4444'
      }
    }, {
      type: 'text',
      left: 'center',
      top: '55%',
      style: {
        text: 'Float Left',
        fontSize: 11,
        fill: 'var(--text-muted)'
      }
    }]
  }), [floatData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: '180px' }}>
        <ChartWrapper option={option} height="100%" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Critical Tasks</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#EF4444' }}>{floatData.criticalCount}</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(64,224,208,0.1)', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg Float</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--pinnacle-teal)' }}>{(floatData?.avgFloat || 0).toFixed(1)}d</div>
        </div>
      </div>
    </div>
  );
}

// ===== BURN RATE TREND =====
function BurnRateTrend({ hours, projects }: { hours: any[]; projects: any[] }) {
  const option: EChartsOption = useMemo(() => {
    // Group by month
    const monthlyData = new Map<string, { actual: number; baseline: number }>();
    
    hours.forEach(h => {
      const d = new Date(h.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const curr = monthlyData.get(key) || { actual: 0, baseline: 0 };
      curr.actual += (h.hours || 0) * 75; // Avg rate
      monthlyData.set(key, curr);
    });
    
    // Add baseline from projects
    const totalBaseline = projects.reduce((sum, p) => sum + (p.baselineCost || 0), 0);
    const months = Array.from(monthlyData.keys()).sort();
    if (months.length > 0) {
      const baselinePerMonth = totalBaseline / months.length;
      months.forEach(m => {
        const curr = monthlyData.get(m)!;
        curr.baseline = baselinePerMonth;
      });
    }
    
    // Calculate cumulative
    let cumActual = 0;
    let cumBaseline = 0;
    const cumActualData: number[] = [];
    const cumBaselineData: number[] = [];
    
    months.forEach(m => {
      const d = monthlyData.get(m)!;
      cumActual += d.actual;
      cumBaseline += d.baseline;
      cumActualData.push(cumActual);
      cumBaselineData.push(cumBaseline);
    });
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
      },
      legend: {
        data: ['Actual Spend', 'Baseline'],
        bottom: 0,
        textStyle: { color: 'var(--text-muted)', fontSize: 10 }
      },
      grid: { left: 60, right: 20, top: 20, bottom: 40 },
      xAxis: {
        type: 'category',
        data: months.map(m => {
          const [y, mo] = m.split('-');
          return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(mo) - 1]} '${y.slice(2)}`;
        }),
        axisLabel: { color: 'var(--text-muted)', fontSize: 9 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } }
      },
      yAxis: {
        type: 'value',
        axisLabel: { 
          color: 'var(--text-muted)', 
          fontSize: 9,
          formatter: (v: number) => `$${(v / 1000).toFixed(0)}K`
        },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } }
      },
      series: [
        {
          name: 'Actual Spend',
          type: 'line',
          data: cumActualData,
          smooth: true,
          lineStyle: { color: '#3B82F6', width: 3 },
          areaStyle: { color: 'rgba(59,130,246,0.15)' },
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: { color: '#3B82F6' }
        },
        {
          name: 'Baseline',
          type: 'line',
          data: cumBaselineData,
          lineStyle: { color: '#6B7280', width: 2, type: 'dashed' },
          symbol: 'none',
        }
      ]
    };
  }, [hours, projects]);

  return <ChartWrapper option={option} height="280px" />;
}

// ===== MAIN PAGE =====
export default function ForecastPage() {
  const { filteredData, data: fullData } = useData();
  const data = filteredData;
  const [fteLimit, setFteLimit] = useState(10);
  const [engineParams, setEngineParams] = useState<EngineParams>(DEFAULT_ENGINE_PARAMS);
  const [activeTab, setActiveTab] = useState<'overview' | 'cascade' | 'scenarios'>('overview');

  // Derive project state
  const projectState: ProjectState = useMemo(() => {
    const projects = data.projects || [];
    const hours = data.hours || [];
    const milestoneStatus = data.milestoneStatus || [];
    
    const totalBudget = projects.reduce((sum, p) => sum + (p.baselineCost || 0), 0) || 100000;
    const totalActual = hours.reduce((sum, h) => sum + (h.hours || 0), 0) * 75 || 50000;
    const percentComplete = milestoneStatus.find(m => m.name === 'Completed')?.value || 50;
    const earnedValue = totalBudget > 0 ? totalBudget * (percentComplete / 100) : 50000;
    const plannedValue = totalBudget > 0 ? totalBudget * 0.5 : 50000;
    const cpi = totalActual > 0 ? earnedValue / totalActual : 1.0;
    const spi = plannedValue > 0 ? earnedValue / plannedValue : 1.0;

    return {
      bac: totalBudget,
      ac: totalActual,
      ev: earnedValue,
      pv: plannedValue,
      cpi: Math.max(0.5, Math.min(2.0, cpi)),
      spi: Math.max(0.5, Math.min(2.0, spi)),
      remainingDuration: 45
    };
  }, [data]);

  // Run forecast
  const forecastResult = useMemo(() => {
    try {
      return runForecastSimulation(projectState, engineParams);
    } catch {
      return null;
    }
  }, [projectState, engineParams]);

  // Run CPM
  const cpmResult = useMemo(() => {
    const engine = new CPMEngine();
    const tasks = data.wbsData?.items ? 
      data.wbsData.items.flatMap((item: any) => {
        const collect = (i: any): any[] => {
          const result: any[] = [];
          if (!i.children?.length) {
            result.push({
              id: i.id,
              name: i.name,
              wbsCode: i.wbsCode,
              daysRequired: i.daysRequired || 1,
              predecessors: i.predecessors || []
            });
          } else {
            i.children.forEach((c: any) => result.push(...collect(c)));
          }
          return result;
        };
        return collect(item);
      }) : [];
    
    if (tasks.length > 0) {
      engine.loadTasks(tasks);
      return engine.calculate();
    }
    return null;
  }, [data.wbsData]);

  // Milestones
  const milestones = useMemo(() => {
    return (data.milestoneStatus || []).map((m: any, i: number) => ({
      id: `m-${i}`,
      name: m.name,
      date: new Date(Date.now() + i * 7 * 24 * 60 * 60 * 1000).toISOString(),
      value: m.value
    }));
  }, [data.milestoneStatus]);

  // PO Amount (simulated from total budget + 10% contingency)
  const poAmount = projectState.bac * 1.1;

  // Format currency
  const formatCurrency = (v: number) => {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem', overflow: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Forecasting & Scenario Analysis</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
            PO vs Costs | FTE Constraints | Cascade Impact | Monte Carlo Scenarios
          </p>
        </div>
        
        {/* Tab Selector */}
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: '12px' }}>
          {[
            { key: 'overview', label: 'Financial Overview' },
            { key: 'cascade', label: 'Cascade Analysis' },
            { key: 'scenarios', label: 'Scenarios' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === tab.key ? 'var(--pinnacle-teal)' : 'transparent',
                color: activeTab === tab.key ? '#000' : 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
        <KPICard 
          label="Purchase Order" 
          value={formatCurrency(poAmount || 0)} 
          subValue="Total Budget + Contingency"
          color="#10B981" 
          icon="$"
        />
        <KPICard 
          label="Spent to Date" 
          value={formatCurrency(projectState?.ac || 0)} 
          subValue={`${poAmount > 0 ? (((projectState?.ac || 0) / poAmount) * 100).toFixed(0) : 0}% of PO`}
          color="#3B82F6" 
          trend={(projectState?.cpi || 1) >= 1 ? 'up' : 'down'}
        />
        <KPICard 
          label="P50 Forecast" 
          value={formatCurrency(forecastResult?.monteCarloCost?.p50 || 0)} 
          subValue="Most Likely Outcome"
          color="#8B5CF6"
        />
        <KPICard 
          label="Variance to PO" 
          value={formatCurrency((forecastResult?.monteCarloCost?.p50 || 0) - (poAmount || 0))} 
          subValue={(forecastResult?.monteCarloCost?.p50 || 0) > (poAmount || 0) ? 'Over Budget Risk' : 'Under Budget'}
          color={(forecastResult?.monteCarloCost?.p50 || 0) > (poAmount || 0) ? '#EF4444' : '#10B981'}
          trend={(forecastResult?.monteCarloCost?.p50 || 0) > (poAmount || 0) ? 'down' : 'up'}
        />
        <KPICard 
          label="CPI" 
          value={(projectState?.cpi || 1).toFixed(2)} 
          subValue={(projectState?.cpi || 1) >= 1 ? 'On Track' : 'Over Spending'}
          color={(projectState?.cpi || 1) >= 1 ? '#10B981' : '#EF4444'}
        />
        <KPICard 
          label="Critical Tasks" 
          value={cpmResult?.stats?.criticalTasksCount || 0} 
          subValue={`of ${cpmResult?.stats?.totalTasks || 0} total`}
          color="#EF4444"
          icon="!"
        />
      </div>

      {/* FINANCIAL OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Top Row: PO Gauge + FTE Capacity */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem' }}>
            <SectionCard title="PO Budget Consumption" subtitle="Actual spend vs Purchase Order" accent="#10B981">
              <POCostGauge po={poAmount} actualCost={projectState.ac} forecastCost={forecastResult?.monteCarloCost.p50 || 0} />
            </SectionCard>
            
            <SectionCard 
              title="FTE Capacity vs Demand" 
              subtitle="Resource-constrained scheduling"
              accent="#3B82F6"
              headerRight={
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>FTE Limit:</span>
                  <input
                    type="number"
                    value={fteLimit}
                    onChange={(e) => setFteLimit(parseInt(e.target.value) || 10)}
                    min={1}
                    max={50}
                    style={{
                      width: '50px',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.8rem',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              }
            >
              <FTECapacityChart tasks={data.tasks || []} fteLimit={fteLimit} />
            </SectionCard>
          </div>

          {/* Middle Row: Float + Burn Rate */}
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem' }}>
            <SectionCard title="Float Consumption" subtitle="Schedule buffer remaining" accent="#F59E0B">
              <FloatConsumptionGauge cpmResult={cpmResult} />
            </SectionCard>
            
            <SectionCard title="Burn Rate Trend" subtitle="Cumulative spend vs baseline">
              <BurnRateTrend hours={data.hours || []} projects={data.projects || []} />
            </SectionCard>
          </div>

          {/* Bottom: Scenario Comparison */}
          <SectionCard title="Scenario Cost Comparison" subtitle="Baseline vs Monte Carlo forecasts" accent="#8B5CF6">
            <ScenarioWaterfall forecastResult={forecastResult} bac={projectState.bac} />
          </SectionCard>
        </div>
      )}

      {/* CASCADE ANALYSIS TAB */}
      {activeTab === 'cascade' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <SectionCard 
            title="Milestone Cascade Impact Analyzer" 
            subtitle="Select a milestone and adjust delay to see downstream effects"
            accent="#EF4444"
          >
            <CascadeImpactChart milestones={milestones} tasks={data.tasks || []} />
          </SectionCard>
          
          {/* CPM Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '1.25rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Project Duration</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--pinnacle-teal)' }}>{cpmResult?.projectDuration || 0}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>working days</div>
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '1.25rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Critical Tasks</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#EF4444' }}>{cpmResult?.stats.criticalTasksCount || 0}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>zero float</div>
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '1.25rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Average Float</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10B981' }}>{(cpmResult?.stats?.averageFloat || 0).toFixed(1)}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>days buffer</div>
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '1.25rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Dangling Logic</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: (cpmResult?.stats.danglingTasks?.length || 0) > 0 ? '#F59E0B' : '#10B981' }}>
                {cpmResult?.stats.danglingTasks?.length || 0}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>open ends</div>
            </div>
          </div>
        </div>
      )}

      {/* SCENARIOS TAB */}
      {activeTab === 'scenarios' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Scenario Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
            <SectionCard title="P10 Best Case" subtitle="10% probability" accent="#10B981">
              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#10B981' }}>
                  {formatCurrency(forecastResult?.monteCarloCost.p10 || 0)}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  {Math.round(forecastResult?.monteCarloDuration.p10 || 0)} days
                </div>
                <div style={{ 
                  marginTop: '1rem', 
                  padding: '0.75rem', 
                  background: 'rgba(16,185,129,0.1)', 
                  borderRadius: '10px',
                  fontSize: '0.75rem',
                  color: '#10B981'
                }}>
                  {formatCurrency((forecastResult?.monteCarloCost.p10 || 0) - projectState.bac)} vs BAC
                </div>
              </div>
            </SectionCard>
            
            <SectionCard title="P50 Most Likely" subtitle="50% probability" accent="#3B82F6">
              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#3B82F6' }}>
                  {formatCurrency(forecastResult?.monteCarloCost.p50 || 0)}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  {Math.round(forecastResult?.monteCarloDuration.p50 || 0)} days
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Est. Completion: {forecastResult?.completionDateEstimate || '-'}
                </div>
                <div style={{ 
                  marginTop: '1rem', 
                  padding: '0.75rem', 
                  background: 'rgba(59,130,246,0.1)', 
                  borderRadius: '10px',
                  fontSize: '0.75rem',
                  color: '#3B82F6'
                }}>
                  TCPI to BAC: {forecastResult?.tcpi?.toBac?.toFixed(2) || '-'}
                </div>
              </div>
            </SectionCard>
            
            <SectionCard title="P90 Worst Case" subtitle="90% probability" accent="#EF4444">
              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#EF4444' }}>
                  {formatCurrency(forecastResult?.monteCarloCost.p90 || 0)}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  {Math.round(forecastResult?.monteCarloDuration.p90 || 0)} days
                </div>
                <div style={{ 
                  marginTop: '1rem', 
                  padding: '0.75rem', 
                  background: 'rgba(239,68,68,0.1)', 
                  borderRadius: '10px',
                  fontSize: '0.75rem',
                  color: '#EF4444'
                }}>
                  +{formatCurrency((forecastResult?.monteCarloCost.p90 || 0) - projectState.bac)} overrun risk
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Engine Parameters */}
          <SectionCard title="Simulation Parameters" subtitle="Adjust to model different scenarios">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {[
                { key: 'optimismFactor', label: 'Optimism Bias', min: 0.5, max: 2, step: 0.1 },
                { key: 'riskBuffer', label: 'Risk Buffer %', min: 0, max: 0.5, step: 0.05, isPct: true },
                { key: 'resourceEfficiency', label: 'Resource Efficiency', min: 0.5, max: 1, step: 0.05, isPct: true },
                { key: 'scopeContingency', label: 'Scope Growth %', min: 0, max: 0.3, step: 0.05, isPct: true },
                { key: 'laborCostMultiplier', label: 'Labor Rate Multi', min: 0.8, max: 1.5, step: 0.05 },
              ].map(param => (
                <div key={param.key} style={{ 
                  padding: '1rem', 
                  background: 'var(--bg-tertiary)', 
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                    {param.label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <input
                      type="range"
                      min={param.min}
                      max={param.max}
                      step={param.step}
                      value={(engineParams as any)[param.key]}
                      onChange={(e) => setEngineParams({ ...engineParams, [param.key]: parseFloat(e.target.value) })}
                      style={{ flex: 1, accentColor: 'var(--pinnacle-teal)' }}
                    />
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--pinnacle-teal)', minWidth: '50px', textAlign: 'right' }}>
                      {param.isPct 
                        ? `${(((engineParams as any)[param.key] || 0) * 100).toFixed(0)}%`
                        : ((engineParams as any)[param.key] || 0).toFixed(2)
                      }
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* IEAC Comparison */}
          <SectionCard title="IEAC Methods Comparison" subtitle="Different forecasting approaches">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div style={{ 
                padding: '1.25rem', 
                background: 'rgba(16,185,129,0.1)', 
                borderRadius: '12px',
                borderLeft: '4px solid #10B981'
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Budget Rate (Optimistic)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10B981' }}>
                  {formatCurrency(forecastResult?.ieac.budgetRate || 0)}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Assumes remaining work at budget rate
                </div>
              </div>
              <div style={{ 
                padding: '1.25rem', 
                background: 'rgba(64,224,208,0.1)', 
                borderRadius: '12px',
                borderLeft: '4px solid var(--pinnacle-teal)'
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>CPI Method (Status Quo)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--pinnacle-teal)' }}>
                  {formatCurrency(forecastResult?.ieac.cpi || 0)}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Assumes current CPI continues
                </div>
              </div>
              <div style={{ 
                padding: '1.25rem', 
                background: 'rgba(139,92,246,0.1)', 
                borderRadius: '12px',
                borderLeft: '4px solid #8B5CF6'
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Monte Carlo P50</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#8B5CF6' }}>
                  {formatCurrency(forecastResult?.monteCarloCost.p50 || 0)}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Probabilistic simulation result
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
