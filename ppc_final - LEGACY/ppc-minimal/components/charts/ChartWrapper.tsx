'use client';

/**
 * ChartWrapper — Self-contained ECharts wrapper for the minimal app.
 * Registers a Pinnacle dark theme and exposes the same props surface
 * as the main app's ChartWrapper so WBSGanttChart works unchanged.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

const PINNACLE_THEME = {
  color: [
    '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444',
    '#EC4899', '#6366F1', '#FF9800', '#A855F7', '#CDDC39',
    '#F97316', '#EAB308', '#4F46E5', '#F43F5E', '#7C3AED',
  ],
  backgroundColor: 'transparent',
  textStyle: { color: '#e4e4e7' },
  title: { textStyle: { color: '#f4f4f5' }, subtextStyle: { color: '#a1a1aa' } },
  line: { itemStyle: { borderWidth: 2 }, lineStyle: { width: 2.5 }, symbolSize: 6, symbol: 'circle', smooth: false },
  radar: { axisName: { color: '#a1a1aa' } },
  bar: { itemStyle: { barBorderWidth: 0 } },
  pie: { itemStyle: { borderWidth: 0 } },
  scatter: { itemStyle: { borderWidth: 0 } },
  categoryAxis: {
    axisLine: { show: true, lineStyle: { color: '#3f3f46' } },
    axisTick: { show: false },
    axisLabel: { color: '#a1a1aa', fontSize: 11 },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#a1a1aa', fontSize: 11 },
    splitLine: { show: true, lineStyle: { color: '#27272a', type: 'dashed' } },
  },
  timeAxis: {
    axisLine: { show: true, lineStyle: { color: '#3f3f46' } },
    axisTick: { lineStyle: { color: '#3f3f46' } },
    axisLabel: { color: '#a1a1aa' },
    splitLine: { lineStyle: { color: '#27272a' } },
  },
  legend: { textStyle: { color: '#a1a1aa', fontSize: 11 } },
  tooltip: {
    backgroundColor: 'rgba(15,15,18,0.96)',
    borderColor: '#3f3f46',
    borderWidth: 1,
    textStyle: { color: '#f4f4f5', fontSize: 12 },
    extraCssText: 'z-index:99999!important;backdrop-filter:blur(20px);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.45);',
    appendToBody: true,
    confine: false,
  },
  dataZoom: {
    backgroundColor: 'transparent',
    dataBackgroundColor: 'rgba(99,102,241,0.15)',
    fillerColor: 'rgba(99,102,241,0.12)',
    handleColor: '#6366F1',
    handleSize: '100%',
    textStyle: { color: '#a1a1aa' },
  },
};

let themeRegistered = false;
function ensureTheme() {
  if (!themeRegistered) {
    echarts.registerTheme('pinnacle-dark', PINNACLE_THEME);
    themeRegistered = true;
  }
}

interface ChartWrapperProps {
  option: EChartsOption;
  style?: React.CSSProperties;
  className?: string;
  height?: string | number;
  onChartReady?: (chart: echarts.ECharts) => void;
  onClick?: (params: { name?: string; value?: unknown; dataIndex?: number; seriesName?: string; [key: string]: unknown }) => void;
  enableExport?: boolean;
  enableFullscreen?: boolean;
  enableCompare?: boolean;
  enableVariance?: boolean;
  varianceData?: { current: number; previous: number; metricName?: string };
  exportFilename?: string;
  visualId?: string;
  visualTitle?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
}

const ChartWrapper = React.memo(function ChartWrapper({
  option,
  style,
  className = '',
  height = '300px',
  onChartReady,
  onClick,
  enableExport = false,
  enableFullscreen = false,
  exportFilename = 'chart',
  visualTitle = 'Chart',
  isLoading = false,
  isEmpty = false,
}: ChartWrapperProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const optionRef = useRef<EChartsOption | null>(null);
  const fullscreenChartRef = useRef<HTMLDivElement>(null);
  const fullscreenInstanceRef = useRef<echarts.ECharts | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!chartRef.current) return;
    ensureTheme();
    if (chartInstanceRef.current) chartInstanceRef.current.dispose();

    const chart = echarts.init(chartRef.current, 'pinnacle-dark', { renderer: 'canvas' });
    chartInstanceRef.current = chart;

    const merged: EChartsOption = { animation: true, animationDuration: 600, animationEasing: 'cubicOut', ...option };
    const hasBottomLegend = (() => {
      const lg = merged.legend;
      if (!lg || Array.isArray(lg)) return false;
      return Object.prototype.hasOwnProperty.call(lg, 'bottom');
    })();
    const minGrid = { top: 30, right: 20, left: 24, bottom: hasBottomLegend ? 70 : 34 };
    const patchGrid = (grid: Record<string, unknown>) => {
      const next = { ...grid };
      if (next.containLabel === undefined) next.containLabel = true;
      const top = Number(next.top);
      const right = Number(next.right);
      const left = Number(next.left);
      const bottom = Number(next.bottom);
      if (!Number.isFinite(top) || top < minGrid.top) next.top = minGrid.top;
      if (!Number.isFinite(right) || right < minGrid.right) next.right = minGrid.right;
      if (!Number.isFinite(left) || left < minGrid.left) next.left = minGrid.left;
      if (!Number.isFinite(bottom) || bottom < minGrid.bottom) next.bottom = minGrid.bottom;
      return next;
    };
    if (merged.grid && typeof merged.grid === 'object') {
      if (Array.isArray(merged.grid)) {
        merged.grid = merged.grid.map((g) => (g && typeof g === 'object' ? patchGrid(g as Record<string, unknown>) : g));
      } else {
        merged.grid = patchGrid(merged.grid as Record<string, unknown>);
      }
    }

    try { chart.setOption(merged); } catch (err) { console.error('[ChartWrapper]', err); }
    optionRef.current = merged;

    const resize = () => chartInstanceRef.current?.resize();
    const raf = requestAnimationFrame(() => { resize(); requestAnimationFrame(resize); });
    const t1 = setTimeout(resize, 100);
    const t2 = setTimeout(resize, 400);
    const ro = new ResizeObserver(resize);
    if (chartRef.current) ro.observe(chartRef.current);
    if (onChartReady) onChartReady(chart);
    if (onClick) { chart.off('click'); chart.on('click', (p: Record<string, unknown>) => onClick(p as never)); }
    window.addEventListener('resize', resize);

    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); ro.disconnect(); window.removeEventListener('resize', resize); chart.dispose(); };
  }, [option, onChartReady, onClick]);

  useEffect(() => {
    if (!isFullscreen || !fullscreenChartRef.current || !optionRef.current) return;
    ensureTheme();
    const chart = echarts.init(fullscreenChartRef.current, 'pinnacle-dark', { renderer: 'canvas' });
    fullscreenInstanceRef.current = chart;
    chart.setOption(optionRef.current);
    const resize = () => chart.resize();
    const raf = requestAnimationFrame(() => { resize(); requestAnimationFrame(resize); });
    const ro = new ResizeObserver(resize);
    ro.observe(fullscreenChartRef.current);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('resize', resize); chart.dispose(); };
  }, [isFullscreen]);

  const handleExport = () => {
    const chart = chartInstanceRef.current;
    if (chart) { const u = chart.getDataURL({ type: 'png', pixelRatio: 2 }); const a = document.createElement('a'); a.href = u; a.download = `${exportFilename}-${Date.now()}.png`; a.click(); }
  };

  const h = typeof height === 'number' ? `${height}px` : height;

  return (
    <div className={className} style={{ width: '100%', height: h, position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md)', cursor: onClick ? 'pointer' : undefined, ...style }}>
      {(enableFullscreen || enableExport) && !isLoading && !isEmpty && (
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 4 }}>
          {enableFullscreen && (
            <button onClick={() => setIsFullscreen(true)} style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', borderRadius: 6, color: '#a1a1aa', padding: '4px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>⛶</button>
          )}
          {enableExport && (
            <button onClick={handleExport} style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', borderRadius: 6, color: '#a1a1aa', padding: '4px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>↓</button>
          )}
        </div>
      )}

      {isLoading && <div className="skeleton" style={{ position: 'absolute', inset: 0, zIndex: 5 }} />}

      {!isLoading && isEmpty && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
          No data for {visualTitle}
        </div>
      )}

      <div ref={chartRef} style={{ width: '100%', height: '100%', opacity: isLoading ? 0 : 1, transition: 'opacity 0.4s' }} />

      {isFullscreen && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', cursor: 'pointer' }} onClick={() => setIsFullscreen(false)} />
          <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '95vw', height: '85vh', background: '#0a0a0a', borderRadius: 12, border: '1px solid #3f3f46', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, minHeight: 0 }} ref={fullscreenChartRef} />
            <div style={{ padding: '12px 16px', borderTop: '1px solid #3f3f46', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setIsFullscreen(false)} style={{ padding: '8px 16px', background: '#3f3f46', border: 'none', borderRadius: 8, color: '#e4e4e7', cursor: 'pointer', fontWeight: 500 }}>Close</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});

ChartWrapper.displayName = 'ChartWrapper';
export default ChartWrapper;
