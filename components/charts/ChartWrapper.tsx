'use client';

/**
 * ChartWrapper — ECharts 6 wrapper with a pre-registered Pinnacle dark theme.
 *
 * All colors are baked into the theme — NO CSS variable resolution at render time.
 * This eliminates the resolveOption/resolveColor deep-walk that caused
 * Sankey/Parallel/Graph charts to silently fail in ECharts 6.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { useTheme } from '@/lib/theme-context';
import { SkeletonChart } from '@/components/ui/Skeleton';
import { FullscreenIcon, DownloadIcon } from '@/components/ui/ChartActionIcons';
import { useChartHeaderActions } from './ChartCard';
import { useData } from '@/lib/data-context';
import { VarianceIndicator } from '@/components/ui/VarianceIndicator';

/* ------------------------------------------------------------------ */
/*  Pinnacle Dark Theme — registered once, used everywhere             */
/* ------------------------------------------------------------------ */

const PINNACLE_THEME = {
  color: [
    '#40E0D0', '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981',
    '#EF4444', '#EC4899', '#06B6D4', '#CDDC39', '#FF9800',
    '#6366F1', '#14B8A6', '#F97316', '#A855F7', '#22D3EE',
  ],
  backgroundColor: 'transparent',
  textStyle: { color: '#e4e4e7' },
  title: {
    textStyle: { color: '#f4f4f5' },
    subtextStyle: { color: '#a1a1aa' },
  },
  line: {
    itemStyle: { borderWidth: 2 },
    lineStyle: { width: 2.5 },
    symbolSize: 6,
    symbol: 'circle',
    smooth: false,
  },
  radar: { axisName: { color: '#a1a1aa' } },
  bar: { itemStyle: { barBorderWidth: 0 } },
  pie: { itemStyle: { borderWidth: 0 } },
  scatter: { itemStyle: { borderWidth: 0 } },
  graph: {
    itemStyle: { borderWidth: 0 },
    lineStyle: { width: 1.5, color: 'rgba(255,255,255,0.2)' },
    label: { color: '#e4e4e7' },
  },
  gauge: {
    axisLine: { lineStyle: { color: [[1, 'rgba(255,255,255,0.08)']] } },
    axisTick: { lineStyle: { color: '#52525b' } },
    axisLabel: { color: '#a1a1aa' },
    title: { color: '#a1a1aa' },
    detail: { color: '#f4f4f5' },
  },
  categoryAxis: {
    axisLine: { show: true, lineStyle: { color: '#3f3f46' } },
    axisTick: { show: false },
    axisLabel: { color: '#a1a1aa', fontSize: 11 },
    splitLine: { show: false },
    splitArea: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#a1a1aa', fontSize: 11 },
    splitLine: { show: true, lineStyle: { color: '#27272a', type: 'dashed' } },
    splitArea: { show: false },
  },
  logAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#a1a1aa' },
    splitLine: { lineStyle: { color: '#27272a' } },
  },
  timeAxis: {
    axisLine: { show: true, lineStyle: { color: '#3f3f46' } },
    axisTick: { lineStyle: { color: '#3f3f46' } },
    axisLabel: { color: '#a1a1aa' },
    splitLine: { lineStyle: { color: '#27272a' } },
  },
  legend: {
    textStyle: { color: '#a1a1aa', fontSize: 11 },
    pageTextStyle: { color: '#a1a1aa' },
  },
  tooltip: {
    backgroundColor: 'rgba(15,15,18,0.96)',
    borderColor: '#3f3f46',
    borderWidth: 1,
    textStyle: { color: '#f4f4f5', fontSize: 12 },
    extraCssText:
      'z-index:99999!important;backdrop-filter:blur(20px);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.45);',
    appendToBody: true,
    confine: false,
  },
  dataZoom: {
    backgroundColor: 'transparent',
    dataBackgroundColor: 'rgba(64,224,208,0.15)',
    fillerColor: 'rgba(64,224,208,0.12)',
    handleColor: '#40E0D0',
    handleSize: '100%',
    textStyle: { color: '#a1a1aa' },
  },
  visualMap: { color: ['#EF4444', '#F59E0B', '#10B981'] },
};

let themeRegistered = false;
function ensureTheme() {
  if (!themeRegistered) {
    echarts.registerTheme('pinnacle-dark', PINNACLE_THEME);
    themeRegistered = true;
  }
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Variance icon                                                      */
/* ------------------------------------------------------------------ */

function VarianceIcon({ size = 14, enabled = false }: { size?: number; enabled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={enabled ? '#40E0D0' : 'currentColor'} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 16l4-4 4 4 6-6" />
      {enabled && <circle cx="21" cy="10" r="3" fill="#40E0D0" stroke="none" />}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const ChartWrapper = React.memo(function ChartWrapper({
  option,
  style,
  className = '',
  height = '300px',
  onChartReady,
  onClick,
  enableExport = false,
  enableFullscreen = false,
  enableCompare = false,
  enableVariance = false,
  varianceData,
  exportFilename = 'chart',
  visualId,
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
  const [showVariance, setShowVariance] = useState(false);
  const themeCtx = useTheme();
  const theme = themeCtx?.theme || 'dark';
  const setHeaderActions = useChartHeaderActions();
  const { varianceEnabled } = useData();
  void enableCompare;

  /* ---- main chart ---- */
  useEffect(() => {
    if (!chartRef.current) return;
    ensureTheme();

    if (chartInstanceRef.current) chartInstanceRef.current.dispose();

    const themeName = theme === 'dark' ? 'pinnacle-dark' : undefined;
    const chart = echarts.init(chartRef.current, themeName, { renderer: 'canvas' });
    chartInstanceRef.current = chart;

    // Merge a few global defaults then set the user option directly — no deep walk
    const merged: EChartsOption = {
      animation: true,
      animationDuration: 600,
      animationEasing: 'cubicOut',
      ...option,
    };

    // Ensure grid has containLabel where applicable
    if (merged.grid && typeof merged.grid === 'object' && !Array.isArray(merged.grid)) {
      if ((merged.grid as any).containLabel === undefined) (merged.grid as any).containLabel = true;
    }

    try {
      chart.setOption(merged);
    } catch (err) {
      console.error('[ChartWrapper] setOption error:', err, 'option:', JSON.stringify(merged).slice(0, 500));
    }
    optionRef.current = merged;

    // Resize on next frame to fix 0-height init
    const resize = () => chartInstanceRef.current?.resize();
    const rafId = requestAnimationFrame(() => { resize(); requestAnimationFrame(resize); });

    const ro = new ResizeObserver(resize);
    if (chartRef.current) ro.observe(chartRef.current);

    if (onChartReady) onChartReady(chart);

    if (onClick) {
      chart.off('click');
      chart.on('click', (params: any) => {
        onClick({ name: params.name, value: params.value, dataIndex: params.dataIndex, seriesName: params.seriesName, data: params.data, ...params });
      });
    }

    const onWinResize = () => chart.resize();
    window.addEventListener('resize', onWinResize);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('resize', onWinResize);
      chart.dispose();
    };
  }, [option, onChartReady, onClick, theme]);

  /* ---- fullscreen overlay ---- */
  useEffect(() => {
    if (isFullscreen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen || !fullscreenChartRef.current || !optionRef.current) return;
    ensureTheme();
    const themeName = theme === 'dark' ? 'pinnacle-dark' : undefined;
    const chart = echarts.init(fullscreenChartRef.current, themeName, { renderer: 'canvas' });
    fullscreenInstanceRef.current = chart;
    chart.setOption(optionRef.current);
    const resize = () => chart.resize();
    const rafId = requestAnimationFrame(() => { resize(); requestAnimationFrame(resize); });
    const ro = new ResizeObserver(resize);
    ro.observe(fullscreenChartRef.current);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('resize', resize);
      chart.dispose();
      fullscreenInstanceRef.current = null;
    };
  }, [isFullscreen, theme]);

  /* ---- export ---- */
  const handleExport = () => {
    const chart = chartInstanceRef.current;
    if (chart) {
      const url = chart.getDataURL({ type: 'png', pixelRatio: 2 });
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportFilename}-${Date.now()}.png`;
      a.click();
    }
  };

  /* ---- sizing ---- */
  const inChartCard = !!setHeaderActions;
  const hasExplicit = typeof height === 'number' || (typeof height === 'string' && /^\d+px$/.test(height));
  const containerHeight = hasExplicit ? (typeof height === 'number' ? `${height}px` : height) : (inChartCard ? '100%' : height);

  /* ---- action buttons ---- */
  const actionButtons = (
    <>
      {enableVariance && varianceEnabled && !isLoading && !isEmpty && (
        <button type="button" className="chart-action-btn"
          onClick={(e) => { e.stopPropagation(); setShowVariance(!showVariance); }}
          title={showVariance ? 'Hide variance' : 'Show variance'}
          style={{ ...(inChartCard ? {} : { top: 8, right: `${(enableExport ? 44 : 0) + (enableFullscreen ? 44 : 0) + 8}px` }), background: showVariance ? 'rgba(64,224,208,0.2)' : undefined, borderColor: showVariance ? '#40E0D0' : undefined }}>
          <VarianceIcon size={14} enabled={showVariance} />
        </button>
      )}
      {enableFullscreen && !isLoading && !isEmpty && (
        <button type="button" className="chart-action-btn"
          onClick={(e) => { e.stopPropagation(); setIsFullscreen(true); }} title="Fullscreen"
          style={!inChartCard ? { top: 8, right: enableExport ? 44 : 8 } : undefined}>
          <FullscreenIcon size={14} />
        </button>
      )}
      {enableExport && !isLoading && !isEmpty && (
        <button type="button" className="chart-action-btn"
          onClick={(e) => { e.stopPropagation(); handleExport(); }} title="Export as PNG"
          style={!inChartCard ? { top: 8, right: 8 } : undefined}>
          <DownloadIcon size={14} />
        </button>
      )}
    </>
  );

  useEffect(() => {
    if (!setHeaderActions) return;
    if (!isLoading && !isEmpty) setHeaderActions(actionButtons);
    else setHeaderActions(null);
    return () => setHeaderActions(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderActions, isLoading, isEmpty, visualId, enableFullscreen, enableExport, enableVariance, varianceEnabled, showVariance]);

  /* ---- render ---- */
  return (
    <div className={`chart-container relative rounded-xl overflow-hidden ${className}`}
      style={{ width: '100%', height: containerHeight, minHeight: inChartCard ? 200 : undefined, cursor: onClick ? 'pointer' : undefined, ...style }}>

      {!setHeaderActions && actionButtons}

      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col bg-[var(--bg-primary)]/80">
          <SkeletonChart height={typeof height === 'number' ? `${height}px` : height} className="flex-1 min-h-0" />
        </div>
      )}

      {!isLoading && isEmpty && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-transparent backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="1.5" fill="none" className="text-muted opacity-40">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-xs font-medium text-muted">No data available for {visualTitle}</span>
          </div>
        </div>
      )}

      <div ref={chartRef} className={`w-full h-full transition-opacity duration-500 ${isLoading ? 'opacity-0' : 'opacity-100'}`} />

      {showVariance && varianceData && varianceEnabled && !isLoading && !isEmpty && (
        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 20 }}>
          <VarianceIndicator metricName={varianceData.metricName || visualTitle} current={varianceData.current} previous={varianceData.previous} format="number" size="sm" expandable />
        </div>
      )}

      {isFullscreen && typeof document !== 'undefined' && createPortal(
        <div role="dialog" aria-label={`${visualTitle} fullscreen`}
          style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', cursor: 'pointer' }} onClick={() => setIsFullscreen(false)} aria-hidden />
          <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '95vw', height: '85vh', background: '#0a0a0a', borderRadius: 12, border: '1px solid #3f3f46', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, minHeight: 0 }} ref={fullscreenChartRef} />
            <div style={{ padding: '12px 16px', borderTop: '1px solid #3f3f46', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setIsFullscreen(false)}
                style={{ padding: '8px 16px', background: '#3f3f46', border: 'none', borderRadius: 8, color: '#e4e4e7', cursor: 'pointer', fontWeight: 500 }}>
                Close
              </button>
              {enableExport && (
                <button type="button" onClick={() => {
                  const c = fullscreenInstanceRef.current;
                  if (c) { const u = c.getDataURL({ type: 'png', pixelRatio: 2 }); const a = document.createElement('a'); a.href = u; a.download = `${exportFilename}-${Date.now()}.png`; a.click(); }
                }} style={{ padding: '8px 16px', background: '#40E0D0', border: 'none', borderRadius: 8, color: '#0a0a0a', cursor: 'pointer', fontWeight: 500 }}>
                  Export PNG
                </button>
              )}
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
