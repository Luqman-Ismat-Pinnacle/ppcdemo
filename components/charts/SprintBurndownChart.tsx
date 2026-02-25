'use client';

/**
 * @fileoverview Sprint Burndown Chart Component (ADO-style)
 * 
 * Visualizes sprint progress with:
 * - Remaining work vs ideal trend line
 * - Scope change indicators
 * - Daily progress tracking
 * - Work remaining by work item type
 * 
 * @module components/charts/SprintBurndownChart
 */

import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import ChartWrapper from './ChartWrapper';

interface BurndownData {
  /** Sprint name */
  sprintName: string;
  /** Sprint start date */
  startDate: string;
  /** Sprint end date */
  endDate: string;
  /** Total planned hours/points at sprint start */
  totalPlanned: number;
  /** Daily remaining work data */
  daily: {
    date: string;
    remaining: number;
    ideal: number;
    scopeChange?: number;
  }[];
}

interface SprintBurndownChartProps {
  data?: BurndownData | null;
  /** Unit label: 'hours' or 'points' */
  unit?: 'hours' | 'points';
  /** Chart height */
  height?: string | number;
}

// Generate mock data if none provided
function generateMockData(): BurndownData {
  const startDate = new Date('2026-01-20');
  const endDate = new Date('2026-02-02');
  const totalPlanned = 200;
  const workDays = 10;
  
  const daily: BurndownData['daily'] = [];
  let remaining = totalPlanned;
  const idealDecrement = totalPlanned / workDays;
  
  for (let i = 0; i <= workDays; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    
    const ideal = Math.max(0, totalPlanned - (idealDecrement * i));
    
    // Simulate realistic burndown with some variance
    if (i > 0) {
      const variance = (Math.random() - 0.4) * 15; // Slightly behind ideal
      remaining = Math.max(0, remaining - idealDecrement + variance);
      
      // Add scope change on day 5
      if (i === 5) {
        remaining += 20;
        daily.push({
          date: date.toISOString().split('T')[0],
          remaining: Math.round(remaining),
          ideal: Math.round(ideal),
          scopeChange: 20
        });
        continue;
      }
    }
    
    daily.push({
      date: date.toISOString().split('T')[0],
      remaining: Math.round(remaining),
      ideal: Math.round(ideal)
    });
  }
  
  return {
    sprintName: 'Sprint 2',
    startDate: '2026-01-20',
    endDate: '2026-02-02',
    totalPlanned,
    daily
  };
}

export default function SprintBurndownChart({
  data,
  unit = 'hours',
  height = 400
}: SprintBurndownChartProps) {
  const chartData = data || generateMockData();
  
  const option: EChartsOption = useMemo(() => {
    const dates = chartData.daily.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const remaining = chartData.daily.map(d => d.remaining);
    const ideal = chartData.daily.map(d => d.ideal);
    const scopeChanges = chartData.daily.map(d => d.scopeChange || null);
    const scopeMarkers = chartData.daily
      .map((d, idx) => d.scopeChange ? {
        coord: [idx, d.remaining] as [number, number],
        value: `+${d.scopeChange}`,
        symbol: 'triangle',
        symbolSize: 14,
        itemStyle: { color: '#FF9800' },
        label: {
          show: true,
          formatter: `+${d.scopeChange}`,
          position: 'top',
          color: '#FF9800',
          fontSize: 10,
          fontWeight: 'bold'
        }
      } : null)
      .filter((point): point is NonNullable<typeof point> => point !== null);
    
    // Find today's index
    const today = new Date().toISOString().split('T')[0];
    const todayIndex = chartData.daily.findIndex(d => d.date === today);
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: 'rgba(20,20,20,0.96)',
        borderColor: 'rgba(64,224,208,0.3)',
        borderWidth: 1,
        textStyle: { color: '#fff' },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          
          const dateLabel = params[0].axisValue;
          let html = `<div style="font-weight:600;color:#40E0D0;margin-bottom:8px;border-bottom:1px solid rgba(64,224,208,0.3);padding-bottom:6px;">${dateLabel}</div>`;
          
          params.forEach((p: any) => {
            if (p.value != null) {
              html += `<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;margin:4px 0;">
                <span style="display:flex;align-items:center;gap:6px;">
                  ${p.marker}
                  <span style="color:#e0e0e0;">${p.seriesName}</span>
                </span>
                <span style="font-weight:600;color:#fff;">${p.value} ${unit}</span>
              </div>`;
            }
          });
          
          // Check for scope change
          const idx = dates.indexOf(dateLabel);
          if (idx >= 0 && scopeChanges[idx]) {
            html += `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.2);color:#FF9800;">
              <span style="font-weight:600;">⚠ Scope Change:</span> +${scopeChanges[idx]} ${unit}
            </div>`;
          }
          
          return html;
        },
        extraCssText: 'box-shadow:0 6px 24px rgba(0,0,0,0.5);border-radius:10px;padding:12px;'
      },
      legend: {
        data: ['Remaining Work', 'Ideal Trend'],
        bottom: 0,
        textStyle: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
        icon: 'roundRect',
        itemWidth: 16,
        itemHeight: 3
      },
      grid: {
        left: 60,
        right: 30,
        top: 40,
        bottom: 50,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        axisLabel: { 
          color: 'rgba(255,255,255,0.7)', 
          fontSize: 10,
          rotate: 45,
          margin: 12
        },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        name: `Remaining (${unit})`,
        nameTextStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
        axisLine: { show: false },
        axisLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)', type: 'dashed' } }
      },
      series: [
        {
          name: 'Ideal Trend',
          type: 'line',
          data: ideal,
          lineStyle: { 
            color: '#6B7280', 
            width: 2, 
            type: 'dashed' 
          },
          symbol: 'none',
          smooth: false
        },
        {
          name: 'Remaining Work',
          type: 'line',
          data: remaining,
          lineStyle: { 
            color: '#40E0D0', 
            width: 3 
          },
          itemStyle: { color: '#40E0D0' },
          symbol: 'circle',
          symbolSize: 8,
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(64,224,208,0.25)' },
                { offset: 1, color: 'rgba(64,224,208,0.02)' }
              ]
            }
          },
          smooth: 0.3,
          markPoint: {
            data: scopeMarkers
          },
          markLine: todayIndex >= 0 ? {
            silent: true,
            symbol: ['none', 'none'],
            data: [{
              xAxis: todayIndex,
              lineStyle: { color: '#CDDC39', width: 2, type: 'solid' },
              label: {
                formatter: 'Today',
                color: '#CDDC39',
                fontSize: 10,
                fontWeight: 'bold',
                position: 'end'
              }
            }]
          } : undefined
        }
      ]
    } as EChartsOption;
  }, [chartData, unit]);
  
  // Calculate stats
  const stats = useMemo(() => {
    const current = chartData.daily[chartData.daily.length - 1];
    const ideal = current?.ideal || 0;
    const actual = current?.remaining || 0;
    const variance = actual - ideal;
    const progress = chartData.totalPlanned > 0 
      ? Math.round(((chartData.totalPlanned - actual) / chartData.totalPlanned) * 100)
      : 0;
    
    return {
      remaining: actual,
      ideal,
      variance,
      progress,
      onTrack: variance <= 0
    };
  }, [chartData]);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      {/* Stats Bar */}
      <div style={{
        display: 'flex',
        gap: '24px',
        padding: '12px 16px',
        background: 'var(--bg-tertiary)',
        borderRadius: '10px',
        border: '1px solid rgba(64,224,208,0.1)'
      }}>
        <div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
            {chartData.sprintName}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
            {chartData.startDate} → {chartData.endDate}
          </div>
        </div>
        <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
        <div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
            Remaining
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#40E0D0', marginTop: '2px' }}>
            {stats.remaining} {unit}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
            Progress
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#CDDC39', marginTop: '2px' }}>
            {stats.progress}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
            Status
          </div>
          <div style={{ 
            fontSize: '14px', 
            fontWeight: 600, 
            color: stats.onTrack ? '#40E0D0' : '#FF9800',
            marginTop: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            {stats.onTrack ? '✓ On Track' : `⚠ Behind by ${Math.abs(stats.variance)} ${unit}`}
          </div>
        </div>
      </div>
      
      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChartWrapper
          option={option}
          height={height}
          enableExport
          enableFullscreen
          enableCompare
          visualId="sprint-burndown"
          visualTitle="Sprint Burndown"
        />
      </div>
    </div>
  );
}
