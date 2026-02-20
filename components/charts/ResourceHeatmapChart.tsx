'use client';

/**
 * Resource Heatmap – clean rewrite.
 * Shows utilization % by resource (rows) and week (columns). Color scale: 0% → 120%.
 */

import React, { useMemo, useState } from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';
import type { ResourceHeatmap, Employee } from '@/types/data';

const TEAL = '#40E0D0';
const SCALE = ['#1a1a1a', '#1A9B8F', TEAL, '#CDDC39', '#FF9800', '#E91E63'];

interface Props {
  data?: ResourceHeatmap | null;
  employees?: Employee[];
  height?: string | number;
  showControls?: boolean;
}

export default function ResourceHeatmapChart({ data, height = '100%', showControls = true }: Props) {
  const [zoomEnd, setZoomEnd] = useState(100);

  const { resources, weeks, values } = useMemo(() => {
    if (!data?.resources?.length || !data?.weeks?.length || !data?.data?.length) {
      return { resources: [] as string[], weeks: [] as string[], values: [] as number[][] };
    }
    return {
      resources: data.resources,
      weeks: data.weeks,
      values: data.data,
    };
  }, [data]);

  const option = useMemo((): EChartsOption => {
    if (resources.length === 0 || weeks.length === 0) {
      return { title: { text: 'No data', left: 'center', top: 'middle', textStyle: { color: 'var(--text-muted)' } } };
    }

    const heatmapData: [number, number, number][] = [];
    values.forEach((row, y) => {
      row.forEach((val, x) => {
        heatmapData.push([x, y, val]);
      });
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const [x, y, v] = p.data || [];
          const res = resources[y];
          const week = weeks[x];
          const status = v > 100 ? 'Over' : v >= 80 ? 'Optimal' : v >= 50 ? 'Below target' : 'Under';
          return `<div style="padding:8px 12px;min-width:160px;">
            <div style="font-weight:600;color:${TEAL};margin-bottom:6px;">${res ?? ''}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:4px;">${week ?? ''}</div>
            <div style="display:flex;justify-content:space-between;"><span>Utilization</span><strong>${v}%</strong></div>
            <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px;">${status}</div>
          </div>`;
        },
        backgroundColor: 'rgba(20,20,20,0.95)',
        borderColor: 'rgba(64,224,208,0.3)',
        textStyle: { color: '#fff' },
      },
      grid: { left: 160, right: 24, top: 16, bottom: 52, containLabel: false },
      dataZoom: [
        {
          type: 'slider',
          xAxisIndex: 0,
          start: 0,
          end: zoomEnd,
          bottom: 8,
          height: 18,
          borderColor: 'rgba(64,224,208,0.3)',
          fillerColor: 'rgba(64,224,208,0.15)',
          handleStyle: { color: TEAL },
        },
        {
          type: 'slider',
          yAxisIndex: 0,
          right: 4,
          width: 14,
          start: 0,
          end: resources.length > 20 ? (20 / resources.length) * 100 : 100,
          borderColor: 'rgba(64,224,208,0.3)',
          fillerColor: 'rgba(64,224,208,0.15)',
          handleStyle: { color: TEAL },
        },
      ],
      xAxis: {
        type: 'category',
        data: weeks,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        axisLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, rotate: 45, margin: 12 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'category',
        data: resources,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        axisLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10, width: 140, overflow: 'truncate' },
        axisTick: { show: false },
      },
      visualMap: {
        show: false,
        min: 0,
        max: 120,
        inRange: { color: SCALE },
      },
      series: [{
        type: 'heatmap',
        data: heatmapData,
        label: {
          show: true,
          formatter: (p: any) => (p.data[2] === 0 ? '' : `${p.data[2]}%`),
          fontSize: 9,
          color: '#fff',
        },
        itemStyle: {
          borderColor: 'rgba(0,0,0,0.4)',
          borderWidth: 1,
          borderRadius: 2,
        },
        emphasis: { itemStyle: { borderColor: TEAL, shadowBlur: 8 } },
      }],
    };
  }, [resources, weeks, values, zoomEnd]);

  const stats = useMemo(() => {
    const flat = values.flat().filter(v => v > 0);
    if (flat.length === 0) return { avg: 0, over: 0, under: 0 };
    const sum = flat.reduce((a, b) => a + b, 0);
    return {
      avg: Math.round(sum / flat.length),
      over: flat.filter(v => v > 100).length,
      under: flat.filter(v => v < 50).length,
    };
  }, [values]);

  const isEmpty = resources.length === 0 || weeks.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      {showControls && !isEmpty && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 12px',
          background: 'var(--bg-tertiary)',
          borderRadius: 8,
          border: '1px solid var(--border-color)',
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>0%</span>
            <div style={{
              width: 80,
              height: 10,
              borderRadius: 4,
              background: `linear-gradient(to right, ${SCALE.join(', ')})`,
            }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>120%</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Avg <strong style={{ color: TEAL }}>{stats.avg}%</strong>
            {stats.over > 0 && <span style={{ marginLeft: 8 }}>Over: {stats.over}</span>}
            {stats.under > 0 && <span style={{ marginLeft: 4 }}>Under: {stats.under}</span>}
          </div>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 280 }}>
        {isEmpty ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-muted)',
            fontSize: 14,
          }}>
            No resource heatmap data. Sync project plans and assign resources to tasks.
          </div>
        ) : (
          <ChartWrapper
            option={option}
            height={height}
            enableCompare
            enableExport
            enableFullscreen
            visualId="resource-heatmap"
            visualTitle="Resource Heatmap"
          />
        )}
      </div>
    </div>
  );
}
