'use client';

/**
 * @fileoverview Executive Variance Dashboard
 * 
 * Full-screen modal designed for COO-level meetings.
 * Presents project performance in business-friendly language
 * with dollar amounts, days impact, and clear action items.
 * 
 * Features:
 * - Health Score Gauge
 * - Budget & Schedule Status (dollar/day amounts)
 * - Risk Heat Map
 * - Top Risks with Business Impact
 * - Action Items Table
 * - Forecast Projections (Best/Expected/Worst)
 * 
 * @module components/insights/ExecutiveVarianceDashboard
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as echarts from 'echarts';
import { useData } from '@/lib/data-context';
import { useTheme } from '@/lib/theme-context';
import {
  generateExecutiveSummary,
  calculateProjectMetrics,
  formatCurrency,
  formatDate,
  formatCompactNumber,
  ExecutiveSummary,
  ExecutiveRisk,
  ActionItem,
  ForecastScenario
} from '@/lib/executive-metrics';

// ============================================================================
// TYPES
// ============================================================================

interface ExecutiveVarianceDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function HealthGauge({ score, status, color }: { score: number; status: string; color: string }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  
  useEffect(() => {
    if (!chartRef.current) return;
    
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }
    
    const option: echarts.EChartsOption = {
      series: [
        {
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          min: 0,
          max: 100,
          splitNumber: 4,
          axisLine: {
            lineStyle: {
              width: 20,
              color: [
                [0.25, '#ef4444'],
                [0.5, '#f97316'],
                [0.75, '#40E0D0'],
                [1, '#22c55e']
              ]
            }
          },
          pointer: {
            icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
            length: '70%',
            width: 12,
            offsetCenter: [0, '-10%'],
            itemStyle: { color: 'auto' }
          },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          title: {
            show: true,
            offsetCenter: [0, '40%'],
            color: '#fff',
            fontSize: 14,
            fontWeight: 'bold'
          },
          detail: {
            fontSize: 42,
            fontWeight: 'bold',
            offsetCenter: [0, '0%'],
            valueAnimation: true,
            formatter: '{value}',
            color
          },
          data: [{ value: score, name: status.toUpperCase() }]
        }
      ]
    };
    
    chartInstance.current.setOption(option);
    
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, [score, status, color]);
  
  return <div ref={chartRef} style={{ width: '200px', height: '150px' }} />;
}

function StatusCard({ 
  label, 
  value, 
  subValue, 
  trend, 
  color 
}: { 
  label: string; 
  value: string; 
  subValue?: string; 
  trend?: 'up' | 'down' | 'neutral'; 
  color: string;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid rgba(255,255,255,0.08)',
      flex: 1,
      minWidth: '200px'
    }}>
      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.8rem', fontWeight: 700, color, display: 'flex', alignItems: 'center', gap: '8px' }}>
        {value}
        {trend && (
          <span style={{ fontSize: '1rem' }}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </span>
        )}
      </div>
      {subValue && (
        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
          {subValue}
        </div>
      )}
    </div>
  );
}

function RiskHeatMap({ risks }: { risks: ExecutiveRisk[] }) {
  // Count risks in each cell
  const getCount = (impact: string, probability: string) => 
    risks.filter(r => r.impact === impact && r.probability === probability).length;
  
  const cells = [
    { impact: 'low', probability: 'high', color: 'rgba(234, 179, 8, 0.3)', icon: '!', label: 'Watch' },
    { impact: 'high', probability: 'high', color: 'rgba(239, 68, 68, 0.4)', icon: '!!', label: 'Act Now' },
    { impact: 'low', probability: 'medium', color: 'rgba(34, 197, 94, 0.2)', icon: '', label: 'Monitor' },
    { impact: 'high', probability: 'medium', color: 'rgba(234, 179, 8, 0.3)', icon: '!', label: 'Watch' },
    { impact: 'low', probability: 'low', color: 'rgba(34, 197, 94, 0.15)', icon: '', label: 'OK' },
    { impact: 'high', probability: 'low', color: 'rgba(34, 197, 94, 0.2)', icon: '', label: 'Monitor' },
  ];
  
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr', gridTemplateRows: 'auto 1fr 1fr 1fr', gap: '4px' }}>
      {/* Headers */}
      <div></div>
      <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', padding: '4px' }}>LOW IMPACT</div>
      <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', padding: '4px' }}>HIGH IMPACT</div>
      
      {/* High probability row */}
      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '8px' }}>HIGH</div>
      {cells.slice(0, 2).map((cell, i) => (
        <div key={i} style={{
          background: cell.color,
          borderRadius: '8px',
          padding: '12px',
          textAlign: 'center',
          minHeight: '60px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ fontSize: '1.2rem' }}>{cell.icon}</div>
          <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>{cell.label}</div>
          {getCount(cell.impact, cell.probability) > 0 && (
            <div style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: '4px' }}>{getCount(cell.impact, cell.probability)}</div>
          )}
        </div>
      ))}
      
      {/* Medium probability row */}
      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '8px' }}>MED</div>
      {cells.slice(2, 4).map((cell, i) => (
        <div key={i} style={{
          background: cell.color,
          borderRadius: '8px',
          padding: '12px',
          textAlign: 'center',
          minHeight: '60px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ fontSize: '1.2rem' }}>{cell.icon}</div>
          <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>{cell.label}</div>
          {getCount(cell.impact, cell.probability) > 0 && (
            <div style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: '4px' }}>{getCount(cell.impact, cell.probability)}</div>
          )}
        </div>
      ))}
      
      {/* Low probability row */}
      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '8px' }}>LOW</div>
      {cells.slice(4, 6).map((cell, i) => (
        <div key={i} style={{
          background: cell.color,
          borderRadius: '8px',
          padding: '12px',
          textAlign: 'center',
          minHeight: '60px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ fontSize: '1.2rem' }}>{cell.icon}</div>
          <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>{cell.label}</div>
          {getCount(cell.impact, cell.probability) > 0 && (
            <div style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: '4px' }}>{getCount(cell.impact, cell.probability)}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function RiskCard({ risk }: { risk: ExecutiveRisk }) {
  const impactColor = risk.impact === 'high' ? '#ef4444' : risk.impact === 'medium' ? '#f97316' : '#eab308';
  
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '10px',
      padding: '16px',
      border: `1px solid ${impactColor}40`,
      borderLeft: `4px solid ${impactColor}`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{risk.title}</div>
        <span style={{
          background: impactColor + '20',
          color: impactColor,
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '0.65rem',
          fontWeight: 600,
          textTransform: 'uppercase'
        }}>
          {risk.impact}
        </span>
      </div>
      <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', marginBottom: '10px' }}>
        {risk.description}
      </div>
      {(risk.dollarImpact || risk.daysImpact) && (
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: impactColor, marginBottom: '8px' }}>
          {risk.dollarImpact && `$${formatCompactNumber(risk.dollarImpact)} potential overrun`}
          {risk.daysImpact && `${risk.daysImpact}-day delay risk`}
        </div>
      )}
      <div style={{ fontSize: '0.8rem', color: '#40E0D0', fontStyle: 'italic' }}>
        Recommendation: {risk.recommendation}
      </div>
    </div>
  );
}

function ActionItemsTable({ items }: { items: ActionItem[] }) {
  const statusColors = {
    approve: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', label: 'Approve' },
    escalate: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', label: 'Escalate' },
    monitor: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', label: 'Monitor' }
  };
  
  const priorityColors = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#22c55e'
  };
  
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <th style={{ textAlign: 'left', padding: '12px 8px', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Priority</th>
          <th style={{ textAlign: 'left', padding: '12px 8px', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Action</th>
          <th style={{ textAlign: 'left', padding: '12px 8px', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Owner</th>
          <th style={{ textAlign: 'left', padding: '12px 8px', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Impact</th>
          <th style={{ textAlign: 'left', padding: '12px 8px', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Due</th>
          <th style={{ textAlign: 'left', padding: '12px 8px', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Status</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <td style={{ padding: '12px 8px' }}>
              <span style={{
                color: priorityColors[item.priority],
                fontWeight: 600,
                textTransform: 'uppercase',
                fontSize: '0.75rem'
              }}>
                {item.priority}
              </span>
            </td>
            <td style={{ padding: '12px 8px', maxWidth: '300px' }}>{item.action}</td>
            <td style={{ padding: '12px 8px' }}>{item.owner}</td>
            <td style={{ padding: '12px 8px', color: '#40E0D0' }}>{item.impact}</td>
            <td style={{ padding: '12px 8px' }}>{item.dueDate}</td>
            <td style={{ padding: '12px 8px' }}>
              <span style={{
                background: statusColors[item.status].bg,
                color: statusColors[item.status].text,
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 600
              }}>
                {statusColors[item.status].label}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ForecastChart({ forecasts }: { forecasts: ForecastScenario[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  
  useEffect(() => {
    if (!chartRef.current || forecasts.length === 0) return;
    
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }
    
    const now = new Date();
    const best = forecasts.find(f => f.name === 'best');
    const expected = forecasts.find(f => f.name === 'expected');
    const worst = forecasts.find(f => f.name === 'worst');
    
    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(20,20,20,0.95)',
        borderColor: 'rgba(64,224,208,0.3)',
        textStyle: { color: '#fff' }
      },
      legend: {
        data: ['Best Case', 'Expected', 'Worst Case'],
        textStyle: { color: 'rgba(255,255,255,0.7)' },
        top: 10
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        axisLabel: { color: 'rgba(255,255,255,0.6)' }
      },
      yAxis: {
        type: 'value',
        name: 'Cost ($)',
        nameTextStyle: { color: 'rgba(255,255,255,0.5)' },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        axisLabel: {
          color: 'rgba(255,255,255,0.6)',
          formatter: (value: number) => '$' + formatCompactNumber(value)
        },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
      },
      series: [
        {
          name: 'Best Case',
          type: 'line',
          data: best ? [[now.getTime(), 0], [best.completionDate.getTime(), best.finalCost]] : [],
          lineStyle: { color: '#22c55e', type: 'dashed' },
          itemStyle: { color: '#22c55e' },
          symbol: 'circle',
          symbolSize: 8
        },
        {
          name: 'Expected',
          type: 'line',
          data: expected ? [[now.getTime(), 0], [expected.completionDate.getTime(), expected.finalCost]] : [],
          lineStyle: { color: '#40E0D0', width: 3 },
          itemStyle: { color: '#40E0D0' },
          symbol: 'circle',
          symbolSize: 10
        },
        {
          name: 'Worst Case',
          type: 'line',
          data: worst ? [[now.getTime(), 0], [worst.completionDate.getTime(), worst.finalCost]] : [],
          lineStyle: { color: '#ef4444', type: 'dashed' },
          itemStyle: { color: '#ef4444' },
          symbol: 'circle',
          symbolSize: 8
        }
      ]
    };
    
    chartInstance.current.setOption(option);
    
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [forecasts]);
  
  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);
  
  return <div ref={chartRef} style={{ width: '100%', height: '250px' }} />;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ExecutiveVarianceDashboard({ isOpen, onClose }: ExecutiveVarianceDashboardProps) {
  const { data } = useData();
  const { theme } = useTheme();
  
  // Calculate executive summary
  const executiveSummary = useMemo((): ExecutiveSummary | null => {
    if (!data) return null;
    
    // Flatten WBS items to tasks
    const flattenTasks = (items: any[]): any[] => {
      return items.flatMap(item => {
        if (item.children && item.children.length > 0) {
          return flattenTasks(item.children);
        }
        return [item];
      });
    };
    
    const tasks = data.wbsData?.items ? flattenTasks(data.wbsData.items) : [];
    const employees = data.employees || [];
    const hours = data.hours || [];
    const projects = data.projects || [];
    
    if (tasks.length === 0) return null;
    
    const metrics = calculateProjectMetrics({ tasks, employees, hours, projects });
    
    // Get project start date from earliest task
    const dates = tasks
      .map(t => t.startDate)
      .filter(Boolean)
      .map(d => new Date(d));
    const projectStartDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : new Date();
    
    return generateExecutiveSummary(metrics, projectStartDate);
  }, [data]);
  
  if (!isOpen) return null;
  
  const modalContent = (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.9)',
      backdropFilter: 'blur(8px)',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 32px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0
      }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#fff' }}>
            Executive Dashboard
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' }}>
            Project Performance Summary • {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => window.print()}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.85rem'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9V2h12v7" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print / Export
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {!executiveSummary ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'rgba(255,255,255,0.5)'
          }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.5, marginBottom: '16px' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p style={{ fontSize: '1.1rem', margin: 0 }}>Load project data to view executive summary</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Row 1: Health Score + Key Metrics */}
            <div style={{ display: 'flex', gap: '24px', alignItems: 'stretch' }}>
              {/* Health Score Card */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '16px',
                padding: '24px',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: '220px'
              }}>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                  Project Health
                </div>
                <HealthGauge score={executiveSummary.healthScore} status={executiveSummary.healthStatus} color={executiveSummary.healthColor} />
              </div>
              
              {/* Key Metrics */}
              <div style={{ flex: 1, display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <StatusCard
                  label="Budget Status"
                  value={executiveSummary.budgetStatus}
                  subValue={`EAC: ${formatCurrency(executiveSummary.estimateAtCompletion)}`}
                  trend={executiveSummary.budgetVariance >= 0 ? 'up' : 'down'}
                  color={executiveSummary.budgetVariance >= 0 ? '#22c55e' : '#ef4444'}
                />
                <StatusCard
                  label="Schedule Status"
                  value={executiveSummary.scheduleStatus}
                  subValue={executiveSummary.projectedEndDate ? `Projected: ${formatDate(executiveSummary.projectedEndDate)}` : undefined}
                  trend={executiveSummary.scheduleVariance >= 0 ? 'up' : executiveSummary.scheduleVariance < 0 ? 'down' : 'neutral'}
                  color={executiveSummary.scheduleVariance >= 0 ? '#22c55e' : executiveSummary.scheduleVariance < -7 ? '#ef4444' : '#f97316'}
                />
                <StatusCard
                  label="Burn Rate"
                  value={executiveSummary.burnRateStatus}
                  subValue={`$${formatCompactNumber(executiveSummary.actualBurnRate)}/day vs $${formatCompactNumber(executiveSummary.plannedBurnRate)}/day`}
                  color={executiveSummary.burnRateStatus === 'On track' ? '#40E0D0' : executiveSummary.actualBurnRate > executiveSummary.plannedBurnRate ? '#f97316' : '#22c55e'}
                />
              </div>
            </div>
            
            {/* Wins Section */}
            {executiveSummary.wins.length > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(64, 224, 208, 0.1) 100%)',
                borderRadius: '12px',
                padding: '16px 20px',
                border: '1px solid rgba(34, 197, 94, 0.2)'
              }}>
                <div style={{ fontSize: '0.75rem', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', fontWeight: 600 }}>
                  Key Wins
                </div>
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                  {executiveSummary.wins.map(win => (
                    <div key={win.id} style={{ flex: '1', minWidth: '200px' }}>
                      <div style={{ fontWeight: 600, color: '#fff', marginBottom: '4px' }}>{win.title}</div>
                      <div style={{ fontSize: '0.9rem', color: '#22c55e', fontWeight: 600 }}>{win.impact}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Row 2: Risks */}
            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px' }}>
              {/* Risk Heat Map */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '16px',
                padding: '20px',
                border: '1px solid rgba(255,255,255,0.08)'
              }}>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
                  Risk Assessment
                </div>
                <RiskHeatMap risks={executiveSummary.risks} />
              </div>
              
              {/* Top Risks */}
              <div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                  Top Risks with Business Impact
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {executiveSummary.risks.slice(0, 3).map(risk => (
                    <RiskCard key={risk.id} risk={risk} />
                  ))}
                  {executiveSummary.risks.length === 0 && (
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', padding: '20px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '10px' }}>
                      No significant risks identified
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Row 3: Action Items */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '16px',
              padding: '20px',
              border: '1px solid rgba(255,255,255,0.08)'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
                Action Items
              </div>
              {executiveSummary.actionItems.length > 0 ? (
                <ActionItemsTable items={executiveSummary.actionItems} />
              ) : (
                <div style={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', padding: '20px', textAlign: 'center' }}>
                  No action items required at this time
                </div>
              )}
            </div>
            
            {/* Row 4: Forecasts */}
            {executiveSummary.forecasts.length > 0 && (
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '16px',
                padding: '20px',
                border: '1px solid rgba(255,255,255,0.08)'
              }}>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
                  Forecast Projections
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                  <ForecastChart forecasts={executiveSummary.forecasts} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {executiveSummary.forecasts.map(forecast => (
                      <div key={forecast.name} style={{
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: '10px',
                        padding: '14px 16px',
                        border: `1px solid ${forecast.name === 'best' ? 'rgba(34, 197, 94, 0.3)' : forecast.name === 'worst' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(64, 224, 208, 0.3)'}`
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{
                            fontWeight: 600,
                            color: forecast.name === 'best' ? '#22c55e' : forecast.name === 'worst' ? '#ef4444' : '#40E0D0',
                            textTransform: 'capitalize'
                          }}>
                            {forecast.name} Case
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                            {forecast.probability}% probability
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '24px', fontSize: '0.9rem' }}>
                          <div>
                            <span style={{ color: 'rgba(255,255,255,0.5)' }}>Completion: </span>
                            <span style={{ fontWeight: 600 }}>{formatDate(forecast.completionDate)}</span>
                          </div>
                          <div>
                            <span style={{ color: 'rgba(255,255,255,0.5)' }}>Cost: </span>
                            <span style={{ fontWeight: 600 }}>{formatCurrency(forecast.finalCost)}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '6px', fontStyle: 'italic' }}>
                          {forecast.assumptions}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
  
  return createPortal(modalContent, document.body);
}
