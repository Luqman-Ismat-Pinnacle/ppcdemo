'use client';

/**
 * @fileoverview Variance Trends Modal Component
 * 
 * A comprehensive modal that shows variance trends with visual charts,
 * explanations, and insights. Similar to the old compare feature but
 * focused on trending and variance analysis.
 * 
 * @module components/ui/VarianceTrendsModal
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as echarts from 'echarts';
import { useData } from '@/lib/data-context';
import { useTheme } from '@/lib/theme-context';
import { 
  calculateVariance, 
  formatVariance, 
  getTrendIcon,
  VariancePeriod,
  getPeriodDisplayName 
} from '@/lib/variance-engine';
import { analyzeVariance, VarianceAnalysis } from '@/lib/variance-insights';

// ============================================================================
// Types
// ============================================================================

interface VarianceTrendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMetric?: string;
}

interface MetricTrend {
  name: string;
  current: number;
  previous: number;
  changePercent: number;
  trend: 'up' | 'down' | 'flat';
  history: { date: string; value: number }[];
  format: 'number' | 'percent' | 'currency' | 'hours';
  invertColors?: boolean;
  analysis: VarianceAnalysis;
}

// ============================================================================
// Period Options
// ============================================================================

const PERIOD_OPTIONS: { value: VariancePeriod; label: string }[] = [
  { value: 'day', label: 'Day over Day' },
  { value: 'week', label: 'Week over Week' },
  { value: 'month', label: 'Month over Month' },
  { value: 'quarter', label: 'Quarter over Quarter' },
];

// ============================================================================
// Mock Data Generator (will use real data when available)
// ============================================================================

function generateTrendData(current: number, variance: number = 10, points: number = 8): { date: string; value: number }[] {
  const result = [];
  const today = new Date();
  
  for (let i = points - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i * 7);
    const randomVariance = (Math.random() - 0.5) * variance * 2;
    const value = current * (1 - (i * 0.02) + randomVariance / 100);
    result.push({
      date: date.toISOString().split('T')[0],
      value: Math.round(value * 100) / 100,
    });
  }
  
  return result;
}

// ============================================================================
// Component
// ============================================================================

export function VarianceTrendsModal({ isOpen, onClose, initialMetric }: VarianceTrendsModalProps) {
  const { filteredData, variancePeriod, setVariancePeriod } = useData();
  const themeContext = useTheme();
  const theme = themeContext?.theme || 'dark';
  
  const [selectedPeriod, setSelectedPeriod] = useState<VariancePeriod>(variancePeriod);
  const [selectedMetric, setSelectedMetric] = useState<string>(initialMetric || 'hours');
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  
  // Calculate metrics from current data
  const metrics = useMemo((): MetricTrend[] => {
    const data = filteredData;
    
    // Total Hours
    const totalHours = data?.sCurve?.actual?.reduce((a, b) => a + b, 0) || 0;
    const prevHours = totalHours * 0.92; // Simulate previous period
    
    // Efficiency
    const plannedHours = data?.sCurve?.planned?.[data.sCurve.planned.length - 1] || 0;
    const actualHours = data?.sCurve?.actual?.[data.sCurve.actual.length - 1] || 0;
    const efficiency = plannedHours > 0 ? Math.round((actualHours / plannedHours) * 100 * 10) / 10 : 0;
    const prevEfficiency = efficiency * 0.95;
    
    // Budget
    const budgetForecast = data?.budgetVariance?.reduce((sum, item) => sum + Math.abs(item.value), 0) || 0;
    const prevBudget = budgetForecast * 1.08;
    
    // Tasks
    const totalTasks = data?.tasks?.length || 0;
    const completedTasks = data?.tasks?.filter((t: any) => 
      t.percentComplete === 100 || t.status === 'Complete'
    ).length || 0;
    const taskCompletion = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const prevTaskCompletion = taskCompletion * 0.88;
    
    // QC Pass Rate
    const milestones = data?.milestoneStatus || [];
    const totalMilestones = milestones.reduce((sum: number, m: any) => sum + m.value, 0);
    const completedMilestones = milestones.find((m: any) => m.name === 'Complete')?.value || 0;
    const qcPassRate = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
    const prevQcPassRate = qcPassRate * 0.94;
    
    // SPI and CPI
    const tasks = data?.tasks || [];
    let totalEV = 0, totalPV = 0, totalAC = 0;
    tasks.forEach((task: any) => {
      const baselineCost = task.baselineCost || task.budgetCost || 0;
      const actualCost = task.actualCost || 0;
      const percentComplete = task.percentComplete || 0;
      totalEV += baselineCost * (percentComplete / 100);
      totalAC += actualCost;
      totalPV += baselineCost;
    });
    const spi = totalPV > 0 ? Math.round((totalEV / totalPV) * 100) / 100 : 1;
    const cpi = totalAC > 0 ? Math.round((totalEV / totalAC) * 100) / 100 : 1;
    const prevSpi = spi * 0.97;
    const prevCpi = cpi * 0.96;
    
    return [
      {
        name: 'Total Hours',
        current: totalHours,
        previous: prevHours,
        changePercent: ((totalHours - prevHours) / prevHours) * 100,
        trend: totalHours >= prevHours ? 'up' : 'down',
        history: generateTrendData(totalHours, 15),
        format: 'hours',
        analysis: analyzeVariance('Total Hours', totalHours, prevHours, {}),
      },
      {
        name: 'Efficiency',
        current: efficiency,
        previous: prevEfficiency,
        changePercent: ((efficiency - prevEfficiency) / prevEfficiency) * 100,
        trend: efficiency >= prevEfficiency ? 'up' : 'down',
        history: generateTrendData(efficiency, 8),
        format: 'percent',
        analysis: analyzeVariance('Efficiency', efficiency, prevEfficiency, {}),
      },
      {
        name: 'Budget Variance',
        current: budgetForecast,
        previous: prevBudget,
        changePercent: ((budgetForecast - prevBudget) / prevBudget) * 100,
        trend: budgetForecast <= prevBudget ? 'up' : 'down', // Down is good for budget
        history: generateTrendData(budgetForecast, 12),
        format: 'currency',
        invertColors: true,
        analysis: analyzeVariance('Budget Variance', budgetForecast, prevBudget, {}),
      },
      {
        name: 'Task Completion',
        current: taskCompletion,
        previous: prevTaskCompletion,
        changePercent: ((taskCompletion - prevTaskCompletion) / prevTaskCompletion) * 100,
        trend: taskCompletion >= prevTaskCompletion ? 'up' : 'down',
        history: generateTrendData(taskCompletion, 10),
        format: 'percent',
        analysis: analyzeVariance('Task Completion', taskCompletion, prevTaskCompletion, {}),
      },
      {
        name: 'QC Pass Rate',
        current: qcPassRate,
        previous: prevQcPassRate,
        changePercent: ((qcPassRate - prevQcPassRate) / prevQcPassRate) * 100,
        trend: qcPassRate >= prevQcPassRate ? 'up' : 'down',
        history: generateTrendData(qcPassRate, 6),
        format: 'percent',
        analysis: analyzeVariance('QC Pass Rate', qcPassRate, prevQcPassRate, {}),
      },
      {
        name: 'Schedule Performance (SPI)',
        current: spi,
        previous: prevSpi,
        changePercent: ((spi - prevSpi) / prevSpi) * 100,
        trend: spi >= prevSpi ? 'up' : 'down',
        history: generateTrendData(spi, 5),
        format: 'number',
        analysis: analyzeVariance('SPI', spi, prevSpi, {}),
      },
      {
        name: 'Cost Performance (CPI)',
        current: cpi,
        previous: prevCpi,
        changePercent: ((cpi - prevCpi) / prevCpi) * 100,
        trend: cpi >= prevCpi ? 'up' : 'down',
        history: generateTrendData(cpi, 5),
        format: 'number',
        analysis: analyzeVariance('CPI', cpi, prevCpi, {}),
      },
    ];
  }, [filteredData]);
  
  const selectedMetricData = useMemo(() => {
    return metrics.find(m => m.name.toLowerCase().includes(selectedMetric.toLowerCase())) || metrics[0];
  }, [metrics, selectedMetric]);
  
  // Initialize chart
  useEffect(() => {
    if (!isOpen || !chartRef.current || !selectedMetricData) return;
    
    if (chartInstance.current) {
      chartInstance.current.dispose();
    }
    
    chartInstance.current = echarts.init(chartRef.current, theme === 'dark' ? 'dark' : undefined);
    
    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      grid: {
        left: 60,
        right: 30,
        top: 40,
        bottom: 50,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22, 27, 34, 0.95)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: any) => {
          const p = params[0];
          return `<strong>${p.axisValue}</strong><br/>
                  ${selectedMetricData.name}: <strong>${formatMetricValue(p.value, selectedMetricData.format)}</strong>`;
        },
      },
      xAxis: {
        type: 'category',
        data: selectedMetricData.history.map(h => {
          const date = new Date(h.date);
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }),
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
        axisLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
        axisLabel: { 
          color: 'rgba(255,255,255,0.6)', 
          fontSize: 10,
          formatter: (value: number) => formatMetricValue(value, selectedMetricData.format, true),
        },
      },
      series: [
        {
          type: 'line',
          data: selectedMetricData.history.map(h => h.value),
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: {
            color: selectedMetricData.trend === 'up' && !selectedMetricData.invertColors ? '#10B981' : 
                   selectedMetricData.trend === 'down' && selectedMetricData.invertColors ? '#10B981' : '#EF4444',
            width: 3,
          },
          itemStyle: {
            color: selectedMetricData.trend === 'up' && !selectedMetricData.invertColors ? '#10B981' : 
                   selectedMetricData.trend === 'down' && selectedMetricData.invertColors ? '#10B981' : '#EF4444',
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: selectedMetricData.trend === 'up' && !selectedMetricData.invertColors ? 
                'rgba(16, 185, 129, 0.3)' : selectedMetricData.trend === 'down' && selectedMetricData.invertColors ?
                'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)' },
              { offset: 1, color: 'rgba(0, 0, 0, 0)' },
            ]),
          },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              { 
                yAxis: selectedMetricData.previous, 
                lineStyle: { color: 'rgba(255,255,255,0.3)', type: 'dashed', width: 1 },
                label: { 
                  show: true, 
                  formatter: `Previous: ${formatMetricValue(selectedMetricData.previous, selectedMetricData.format)}`,
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: 10,
                  position: 'end',
                },
              },
            ],
          },
        },
      ],
    };
    
    chartInstance.current.setOption(option);
    
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, [isOpen, selectedMetricData, theme]);
  
  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Update global period when changed
  useEffect(() => {
    if (selectedPeriod !== variancePeriod) {
      setVariancePeriod(selectedPeriod);
    }
  }, [selectedPeriod, variancePeriod, setVariancePeriod]);
  
  if (!isOpen) return null;
  
  const isPositiveChange = selectedMetricData.invertColors 
    ? selectedMetricData.changePercent < 0 
    : selectedMetricData.changePercent > 0;
  
  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '90%',
          maxWidth: '1000px',
          maxHeight: '90vh',
          background: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Variance Trends
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Track changes and identify trends across key metrics
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Period Selector */}
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as VariancePeriod)}
              style={{
                padding: '8px 12px',
                fontSize: '0.8rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              {PERIOD_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            
            {/* Close button */}
            <button
              onClick={onClose}
              style={{
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '1.2rem',
              }}
            >
              ×
            </button>
          </div>
        </div>
        
        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Metrics Sidebar */}
          <div style={{
            width: '280px',
            borderRight: '1px solid var(--border-color)',
            overflowY: 'auto',
            padding: '12px',
          }}>
            <div style={{ 
              fontSize: '0.7rem', 
              fontWeight: 600, 
              color: 'var(--text-muted)', 
              padding: '8px 12px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              Select Metric
            </div>
            {metrics.map((metric) => {
              const isSelected = metric.name === selectedMetricData.name;
              const isPositive = metric.invertColors ? metric.changePercent < 0 : metric.changePercent > 0;
              
              return (
                <button
                  key={metric.name}
                  onClick={() => setSelectedMetric(metric.name)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginBottom: '6px',
                    background: isSelected ? 'rgba(64, 224, 208, 0.1)' : 'transparent',
                    border: `1px solid ${isSelected ? 'var(--pinnacle-teal)' : 'transparent'}`,
                    borderRadius: '10px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ 
                    fontSize: '0.85rem', 
                    fontWeight: 600, 
                    color: isSelected ? 'var(--pinnacle-teal)' : 'var(--text-primary)',
                    marginBottom: '4px',
                  }}>
                    {metric.name}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {formatMetricValue(metric.current, metric.format)}
                    </span>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: isPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: isPositive ? '#10B981' : '#EF4444',
                    }}>
                      {metric.changePercent >= 0 ? '+' : ''}{metric.changePercent.toFixed(1)}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          
          {/* Main Content */}
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
            {/* Selected Metric Header */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                  {selectedMetricData.name}
                </h3>
                <span style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: isPositiveChange ? '#10B981' : '#EF4444',
                }}>
                  {getTrendIcon(isPositiveChange ? 'up' : 'down')} {selectedMetricData.changePercent >= 0 ? '+' : ''}{selectedMetricData.changePercent.toFixed(1)}%
                </span>
              </div>
              <div style={{ display: 'flex', gap: '24px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                <span>
                  Current: <strong style={{ color: 'var(--text-primary)' }}>
                    {formatMetricValue(selectedMetricData.current, selectedMetricData.format)}
                  </strong>
                </span>
                <span>
                  Previous ({getPeriodDisplayName(selectedPeriod)}): <strong style={{ color: 'var(--text-secondary)' }}>
                    {formatMetricValue(selectedMetricData.previous, selectedMetricData.format)}
                  </strong>
                </span>
                <span>
                  Change: <strong style={{ color: isPositiveChange ? '#10B981' : '#EF4444' }}>
                    {selectedMetricData.current - selectedMetricData.previous >= 0 ? '+' : ''}
                    {formatMetricValue(selectedMetricData.current - selectedMetricData.previous, selectedMetricData.format)}
                  </strong>
                </span>
              </div>
            </div>
            
            {/* Chart */}
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              padding: '16px',
              marginBottom: '24px',
            }}>
              <div 
                ref={chartRef} 
                style={{ width: '100%', height: '280px' }}
              />
            </div>
            
            {/* Analysis Section */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Flags */}
              <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                padding: '16px',
              }}>
                <h4 style={{ 
                  margin: '0 0 12px', 
                  fontSize: '0.85rem', 
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  Flags & Alerts
                </h4>
                {selectedMetricData.analysis.flags.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedMetricData.analysis.flags.map((flag, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px 12px',
                          background: flag.severity === 'critical' ? 'rgba(239, 68, 68, 0.1)' :
                                      flag.severity === 'warning' ? 'rgba(245, 158, 11, 0.1)' :
                                      'rgba(59, 130, 246, 0.1)',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                        }}
                      >
                        <span style={{ fontSize: '1rem' }}>{flag.icon}</span>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{flag.label}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{flag.tooltip}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '12px', textAlign: 'center' }}>
                    No alerts at this time
                  </div>
                )}
              </div>
              
              {/* Insights */}
              <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                padding: '16px',
              }}>
                <h4 style={{ 
                  margin: '0 0 12px', 
                  fontSize: '0.85rem', 
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  Insights
                </h4>
                {selectedMetricData.analysis.insights.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {selectedMetricData.analysis.insights.slice(0, 2).map((insight, idx) => (
                      <div key={idx}>
                        <div style={{ 
                          fontSize: '0.8rem', 
                          fontWeight: 600, 
                          color: 'var(--text-primary)',
                          marginBottom: '4px',
                        }}>
                          {insight.title}
                        </div>
                        <p style={{ 
                          margin: 0, 
                          fontSize: '0.75rem', 
                          color: 'var(--text-secondary)',
                          lineHeight: 1.5,
                        }}>
                          {insight.explanation}
                        </p>
                        {insight.likelyReasons.length > 0 && (
                          <ul style={{ 
                            margin: '8px 0 0', 
                            paddingLeft: '16px',
                            fontSize: '0.7rem',
                            color: 'var(--text-muted)',
                          }}>
                            {insight.likelyReasons.slice(0, 2).map((reason, i) => (
                              <li key={i}>{reason}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '12px', textAlign: 'center' }}>
                    No significant insights detected
                  </div>
                )}
              </div>
            </div>
            
            {/* Historical Context */}
            <div style={{
              marginTop: '16px',
              padding: '16px',
              background: 'rgba(64, 224, 208, 0.05)',
              borderRadius: '12px',
              border: '1px solid rgba(64, 224, 208, 0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Trend</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--pinnacle-teal)' }}>
                    Historical Context
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {selectedMetricData.analysis.historicalContext}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Recommendations */}
            {selectedMetricData.analysis.insights.some(i => i.recommendation) && (
              <div style={{
                marginTop: '16px',
                padding: '16px',
                background: 'rgba(59, 130, 246, 0.05)',
                borderRadius: '12px',
                border: '1px solid rgba(59, 130, 246, 0.2)',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Action</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#3B82F6' }}>
                      Recommended Actions
                    </div>
                    <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
                      {selectedMetricData.analysis.insights
                        .filter(i => i.recommendation)
                        .map((insight, idx) => (
                          <li key={idx} style={{ 
                            fontSize: '0.8rem', 
                            color: 'var(--text-secondary)',
                            marginBottom: '4px',
                          }}>
                            {insight.recommendation}
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatMetricValue(value: number, format: string, compact: boolean = false): string {
  switch (format) {
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'currency':
      if (compact && value >= 1000) {
        return `$${(value / 1000).toFixed(0)}K`;
      }
      return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    case 'hours':
      if (compact && value >= 1000) {
        return `${(value / 1000).toFixed(1)}K hrs`;
      }
      return `${value.toLocaleString('en-US', { maximumFractionDigits: 0 })} hrs`;
    case 'number':
    default:
      return value.toFixed(2);
  }
}

export default VarianceTrendsModal;
