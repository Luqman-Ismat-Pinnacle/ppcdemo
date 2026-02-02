'use client';

/**
 * @fileoverview Velocity Chart Component (ADO-style)
 * 
 * Tracks team velocity over sprints:
 * - Planned vs Completed story points/hours
 * - Historical velocity trend
 * - Sprint-over-sprint comparison
 * - Average velocity calculation
 * 
 * @module components/charts/VelocityChart
 */

import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import ChartWrapper from './ChartWrapper';

interface SprintVelocity {
  sprintId: string;
  sprintName: string;
  planned: number;
  completed: number;
  carryOver: number;
}

interface VelocityChartProps {
  data?: SprintVelocity[] | null;
  /** Unit label: 'hours' or 'points' */
  unit?: 'hours' | 'points';
  /** Chart height */
  height?: string | number;
}

// Generate mock data if none provided
function generateMockData(): SprintVelocity[] {
  return [
    { sprintId: '1', sprintName: 'Sprint 1', planned: 40, completed: 35, carryOver: 5 },
    { sprintId: '2', sprintName: 'Sprint 2', planned: 42, completed: 40, carryOver: 2 },
    { sprintId: '3', sprintName: 'Sprint 3', planned: 45, completed: 38, carryOver: 7 },
    { sprintId: '4', sprintName: 'Sprint 4', planned: 40, completed: 42, carryOver: 0 },
    { sprintId: '5', sprintName: 'Sprint 5', planned: 44, completed: 44, carryOver: 0 },
    { sprintId: '6', sprintName: 'Sprint 6', planned: 45, completed: 41, carryOver: 4 },
  ];
}

export default function VelocityChart({
  data,
  unit = 'points',
  height = 380
}: VelocityChartProps) {
  const velocityData = data?.length ? data : generateMockData();
  
  // Calculate statistics
  const stats = useMemo(() => {
    const completed = velocityData.map(v => v.completed);
    const planned = velocityData.map(v => v.planned);
    
    const avgVelocity = Math.round(completed.reduce((a, b) => a + b, 0) / completed.length);
    const maxVelocity = Math.max(...completed);
    const minVelocity = Math.min(...completed);
    const avgAccuracy = Math.round(
      (velocityData.reduce((acc, v) => acc + (v.completed / v.planned), 0) / velocityData.length) * 100
    );
    
    // Trend: compare last 3 sprints average to previous 3
    const recent = completed.slice(-3);
    const previous = completed.slice(-6, -3);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const previousAvg = previous.length ? previous.reduce((a, b) => a + b, 0) / previous.length : recentAvg;
    const trend = previousAvg > 0 ? Math.round(((recentAvg - previousAvg) / previousAvg) * 100) : 0;
    
    return { avgVelocity, maxVelocity, minVelocity, avgAccuracy, trend };
  }, [velocityData]);
  
  const option: EChartsOption = useMemo(() => {
    const sprintNames = velocityData.map(v => v.sprintName);
    const planned = velocityData.map(v => v.planned);
    const completed = velocityData.map(v => v.completed);
    const carryOver = velocityData.map(v => v.carryOver);
    
    // Calculate average line
    const avgLine = velocityData.map(() => stats.avgVelocity);
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(20,20,20,0.96)',
        borderColor: 'rgba(64,224,208,0.3)',
        borderWidth: 1,
        textStyle: { color: '#fff' },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          
          const sprintName = params[0].axisValue;
          const idx = sprintNames.indexOf(sprintName);
          const sprintData = velocityData[idx];
          if (!sprintData) return '';
          
          const accuracy = Math.round((sprintData.completed / sprintData.planned) * 100);
          
          return `
            <div style="padding:4px 0;">
              <div style="font-weight:600;color:#40E0D0;margin-bottom:8px;border-bottom:1px solid rgba(64,224,208,0.3);padding-bottom:6px;">
                ${sprintName}
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div>
                  <div style="font-size:10px;color:rgba(255,255,255,0.5);">Planned</div>
                  <div style="font-weight:600;color:#6B7280;">${sprintData.planned} ${unit}</div>
                </div>
                <div>
                  <div style="font-size:10px;color:rgba(255,255,255,0.5);">Completed</div>
                  <div style="font-weight:600;color:#40E0D0;">${sprintData.completed} ${unit}</div>
                </div>
                <div>
                  <div style="font-size:10px;color:rgba(255,255,255,0.5);">Carry Over</div>
                  <div style="font-weight:600;color:#FF9800;">${sprintData.carryOver} ${unit}</div>
                </div>
                <div>
                  <div style="font-size:10px;color:rgba(255,255,255,0.5);">Accuracy</div>
                  <div style="font-weight:600;color:${accuracy >= 90 ? '#CDDC39' : accuracy >= 80 ? '#FF9800' : '#ef4444'};">${accuracy}%</div>
                </div>
              </div>
            </div>
          `;
        },
        extraCssText: 'box-shadow:0 6px 24px rgba(0,0,0,0.5);border-radius:10px;padding:12px;'
      },
      legend: {
        data: ['Planned', 'Completed', 'Avg Velocity'],
        bottom: 0,
        textStyle: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
        icon: 'roundRect',
        itemWidth: 16,
        itemHeight: 4
      },
      grid: {
        left: 60,
        right: 30,
        top: 30,
        bottom: 50,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: sprintNames,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        axisLabel: { 
          color: 'rgba(255,255,255,0.7)', 
          fontSize: 11,
          fontWeight: 500
        },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        name: `Velocity (${unit})`,
        nameTextStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
        axisLine: { show: false },
        axisLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)', type: 'dashed' } }
      },
      series: [
        {
          name: 'Planned',
          type: 'bar',
          data: planned,
          barWidth: '35%',
          barGap: '-100%',
          itemStyle: { 
            color: 'rgba(107,114,128,0.3)',
            borderColor: '#6B7280',
            borderWidth: 1,
            borderRadius: [4, 4, 0, 0]
          },
          z: 1
        },
        {
          name: 'Completed',
          type: 'bar',
          data: completed,
          barWidth: '35%',
          itemStyle: { 
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: '#40E0D0' },
                { offset: 1, color: '#1A9B8F' }
              ]
            },
            borderRadius: [4, 4, 0, 0]
          },
          label: {
            show: true,
            position: 'top',
            formatter: '{c}',
            color: '#40E0D0',
            fontSize: 11,
            fontWeight: 600
          },
          z: 2
        },
        {
          name: 'Avg Velocity',
          type: 'line',
          data: avgLine,
          symbol: 'none',
          lineStyle: {
            color: '#CDDC39',
            width: 2,
            type: 'dashed'
          },
          z: 3
        }
      ]
    };
  }, [velocityData, unit, stats]);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      {/* Stats Bar */}
      <div style={{
        display: 'flex',
        gap: '16px',
        padding: '12px 16px',
        background: 'var(--bg-tertiary)',
        borderRadius: '10px',
        border: '1px solid rgba(64,224,208,0.1)',
        flexWrap: 'wrap'
      }}>
        <div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
            Avg Velocity
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#40E0D0', marginTop: '2px' }}>
            {stats.avgVelocity} {unit}
          </div>
        </div>
        <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
        <div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
            Range
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
            {stats.minVelocity} - {stats.maxVelocity}
          </div>
        </div>
        <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
        <div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
            Accuracy
          </div>
          <div style={{ 
            fontSize: '14px', 
            fontWeight: 600, 
            color: stats.avgAccuracy >= 90 ? '#CDDC39' : stats.avgAccuracy >= 80 ? '#FF9800' : '#ef4444',
            marginTop: '2px'
          }}>
            {stats.avgAccuracy}%
          </div>
        </div>
        <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
        <div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
            Trend
          </div>
          <div style={{ 
            fontSize: '14px', 
            fontWeight: 600, 
            color: stats.trend >= 0 ? '#CDDC39' : '#FF9800',
            marginTop: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {stats.trend >= 0 ? '↑' : '↓'} {Math.abs(stats.trend)}%
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
          visualId="velocity-chart"
          visualTitle="Team Velocity"
        />
      </div>
    </div>
  );
}
