'use client';

/**
 * @fileoverview Labor Breakdown Chart Component.
 * 
 * Displays labor hours distribution over time as stacked bar chart.
 * Shows hours by category (charge code, project, or role) across time periods.
 * 
 * Features:
 * - Interactive bar clicking and filter highlighting
 * - Empty state when no data is available
 * - Theme-consistent Pinnacle brand colors (matching ResourceHeatmap)
 * - Responsive sizing with ResizeObserver
 * - Enhanced tooltip formatting with totals and percentages
 * - Legend with scroll for many categories
 * 
 * @module components/charts/LaborBreakdownChart
 */

import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import * as echarts from 'echarts';

// Pinnacle brand colors - Consistent with ResourceHeatmapChart Assigned view
// These align with the utilization heatmap coloring for visual consistency
const PINNACLE_COLORS = [
  '#40E0D0', // Pinnacle Teal (primary)
  '#CDDC39', // Lime (secondary)
  '#FF9800', // Orange
  '#E91E63', // Pink
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#6366F1', // Indigo
  '#EC4899', // Fuchsia
  '#14B8A6', // Teal variant
  '#84CC16', // Lime variant
  '#F97316', // Orange variant
  '#A855F7', // Violet
  '#06B6D4', // Cyan
];

// Chart type definitions for better type safety
interface LaborBreakdownChartProps {
  /** Array of time period labels (week labels, month names, etc.) */
  months: string[];
  /** Data keyed by category name with array of values per time period */
  dataByCategory: Record<string, number[]>;
  /** Chart height - can be number (px) or string (CSS value) */
  height?: string | number;
  /** Callback when a bar segment is clicked */
  onBarClick?: (params: { name: string; dataIndex: number; value: number }) => void;
  /** Array of category names that are currently selected/highlighted */
  activeFilters?: string[];
  /** Optional chart title (displayed in header) */
  title?: string;
}


/**
 * Validate and check if data has valid content
 */
function hasValidChartData(
  months: string[] | undefined | null,
  dataByCategory: Record<string, number[]> | undefined | null
): boolean {
  if (!months || !Array.isArray(months) || months.length === 0) return false;
  if (!dataByCategory || typeof dataByCategory !== 'object') return false;
  
  const categories = Object.keys(dataByCategory);
  if (categories.length === 0) return false;
  
  // Check if any category has actual non-zero data
  return categories.some(cat => {
    const arr = dataByCategory[cat];
    return Array.isArray(arr) && arr.some(v => typeof v === 'number' && v > 0);
  });
}

/**
 * LaborBreakdownChart - Stacked bar chart for labor hours visualization
 */
export default function LaborBreakdownChart({
  months,
  dataByCategory,
  height = '380px',
  onBarClick,
  activeFilters = [],
  title,
}: LaborBreakdownChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [mounted, setMounted] = useState(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Determine if we have valid data
  const hasValidData = useMemo(() => {
    return hasValidChartData(months, dataByCategory);
  }, [months, dataByCategory]);

  // Use provided data or empty arrays
  const chartMonths = hasValidData ? months : [];
  const chartData = hasValidData ? dataByCategory : {};
  const categories = useMemo(() => Object.keys(chartData).sort(), [chartData]);
  const isFiltered = activeFilters.length > 0;

  // Calculate totals for each time period
  const periodTotals = useMemo(() => {
    return chartMonths.map((_, idx: number) => {
      return categories.reduce((sum: number, cat: string) => {
        const val = chartData[cat]?.[idx] || 0;
        return sum + val;
      }, 0);
    });
  }, [chartMonths, chartData, categories]);

  // Calculate grand total
  const grandTotal = useMemo(() => {
    return periodTotals.reduce((sum: number, val: number) => sum + val, 0);
  }, [periodTotals]);

  // Build ECharts option with enhanced styling
  const option = useMemo(() => {
    const series = categories.map((cat: string, i: number) => {
      const categoryData = chartData[cat] || [];
      const colorIndex = i % PINNACLE_COLORS.length;
      const baseColor = PINNACLE_COLORS[colorIndex];
      
      return {
        name: cat,
        type: 'bar' as const,
        stack: 'total',
        barWidth: '55%',
        barGap: '15%',
        data: chartMonths.map((_, idx) => ({
          value: categoryData[idx] || 0,
          itemStyle: {
            color: isFiltered && !activeFilters.includes(cat)
              ? baseColor + '40' // 25% opacity for non-active
              : baseColor,
            borderColor: activeFilters.includes(cat) ? '#fff' : 'transparent',
            borderWidth: activeFilters.includes(cat) ? 2 : 0,
            borderRadius: [4, 4, 0, 0],
          },
        })),
        emphasis: {
          focus: 'series',
          itemStyle: {
            opacity: 1,
            shadowBlur: 12,
            shadowColor: 'rgba(0,0,0,0.4)',
            borderColor: '#fff',
            borderWidth: 1,
          }
        },
        blur: {
          itemStyle: {
            opacity: 0.3
          }
        },
      };
    });

    return {
      backgroundColor: 'transparent',
      animation: true,
      animationDuration: 600,
      animationEasing: 'cubicOut' as const,
      tooltip: {
        trigger: 'axis',
        confine: true,
        axisPointer: { 
          type: 'shadow',
          shadowStyle: {
            color: 'rgba(64, 224, 208, 0.08)'
          }
        },
        backgroundColor: 'rgba(20, 20, 20, 0.96)',
        borderColor: 'rgba(64, 224, 208, 0.3)',
        borderWidth: 1,
        textStyle: { 
          color: '#fff',
          fontSize: 12
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          
          const periodName = params[0]?.name || '';
          const periodIdx = params[0]?.dataIndex ?? 0;
          const periodTotal = periodTotals[periodIdx] || 0;
          
          let html = `<div style="font-weight:600;margin-bottom:10px;color:#40E0D0;font-size:14px;border-bottom:1px solid rgba(64,224,208,0.3);padding-bottom:8px;">
            ${periodName}
            <span style="float:right;color:#fff;">${periodTotal.toLocaleString()} hrs</span>
          </div>`;
          
          // Sort by value descending for better readability
          const sortedParams = [...params].sort((a: any, b: any) => (b.value || 0) - (a.value || 0));
          
          sortedParams.forEach((p: any) => {
            if (!p || p.value == null || p.value === 0) return;
            const val = typeof p.value === 'number' ? p.value : 0;
            const percent = periodTotal > 0 ? Math.round((val / periodTotal) * 100) : 0;
            
            html += `<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;margin:5px 0;padding:3px 0;">
              <span style="display:flex;align-items:center;gap:8px;flex:1;">
                ${p.marker || ''} 
                <span style="color:#e0e0e0;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">${p.seriesName || ''}</span>
              </span>
              <span style="font-weight:600;color:#fff;white-space:nowrap;">${val.toLocaleString()} hrs</span>
              <span style="color:rgba(255,255,255,0.5);font-size:10px;min-width:32px;text-align:right;">${percent}%</span>
            </div>`;
          });
          
          return html;
        },
        extraCssText: 'box-shadow: 0 6px 24px rgba(0,0,0,0.5); border-radius: 10px; padding: 14px 16px;'
      },
      legend: {
        type: 'scroll',
        bottom: 0,
        left: 'center',
        textStyle: { 
          color: 'rgba(255,255,255,0.85)', 
          fontSize: 11,
          fontWeight: 500
        },
        itemWidth: 14,
        itemHeight: 14,
        itemGap: 18,
        icon: 'roundRect',
        pageTextStyle: {
          color: 'rgba(255,255,255,0.7)'
        },
        pageIconColor: '#40E0D0',
        pageIconInactiveColor: 'rgba(255,255,255,0.3)',
        pageIconSize: 12,
        animationDurationUpdate: 300,
        selectedMode: true,
        selector: false,
      },
      grid: { 
        left: 60, 
        right: 20, 
        top: 35, 
        bottom: 55,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: chartMonths,
        axisLine: { 
          lineStyle: { 
            color: 'rgba(255,255,255,0.2)' 
          } 
        },
        axisLabel: { 
          color: 'rgba(255,255,255,0.75)', 
          fontSize: 11,
          fontWeight: 500,
          margin: 12,
          interval: 0,
          rotate: chartMonths.length > 8 ? 45 : 0
        },
        axisTick: { 
          show: true,
          lineStyle: {
            color: 'rgba(255,255,255,0.1)'
          }
        },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        name: 'Hours',
        nameTextStyle: { 
          color: 'rgba(255,255,255,0.6)', 
          fontSize: 11,
          fontWeight: 600,
          padding: [0, 0, 8, 0]
        },
        nameLocation: 'end',
        axisLine: { show: false },
        axisLabel: { 
          color: 'rgba(255,255,255,0.7)', 
          fontSize: 10,
          formatter: (value: number) => {
            if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
            return value.toString();
          }
        },
        splitLine: { 
          lineStyle: { 
            color: 'rgba(255,255,255,0.06)', 
            type: 'dashed' 
          } 
        },
      },
      series,
    };
  }, [chartMonths, chartData, categories, isFiltered, activeFilters, periodTotals]);

  // Click handler with enhanced data
  const handleClick = useCallback((params: any) => {
    if (onBarClick && params) {
      onBarClick({ 
        name: params.seriesName, 
        dataIndex: params.dataIndex,
        value: params.value || 0
      });
    }
  }, [onBarClick]);

  // Initialize mounted state
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Initialize and manage chart instance
  useEffect(() => {
    if (!mounted || !chartRef.current) return;

    // Initialize chart
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, {
        renderer: 'canvas',
        useDirtyRect: true // Performance optimization
      });
    }

    // Set options
    chartInstance.current.setOption(option, {
      notMerge: true,
      lazyUpdate: true
    });

    // Add click handler
    chartInstance.current.off('click');
    chartInstance.current.on('click', handleClick);

    return () => {
      chartInstance.current?.off('click');
    };
  }, [mounted, option, handleClick]);

  // Handle resize with ResizeObserver for better responsiveness
  useEffect(() => {
    if (!mounted || !chartRef.current) return;

    // Create resize observer for smooth resizing
    resizeObserverRef.current = new ResizeObserver(() => {
      if (chartInstance.current) {
        chartInstance.current.resize();
      }
    });

    resizeObserverRef.current.observe(chartRef.current);

    // Also listen to window resize as fallback
    const handleWindowResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      resizeObserverRef.current?.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [mounted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  // Convert height to string if number
  const containerHeight = typeof height === 'number' ? `${height}px` : height;
  // Calculate chart height (subtract stats bar height when showing data)
  const heightNum = typeof height === 'number' ? height : parseInt(height);
  const chartHeight = grandTotal > 0 ? `${heightNum - 60}px` : containerHeight;

  // Show empty state when no valid data
  if (!hasValidData) {
    return (
      <div style={{ 
        width: '100%',
        height: containerHeight,
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(26, 26, 26, 0.5)',
        borderRadius: '8px',
        border: '1px dashed rgba(255,255,255,0.1)',
        minHeight: '300px'
      }}>
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
          <rect x="3" y="3" width="7" height="18" rx="1"></rect>
          <rect x="14" y="8" width="7" height="13" rx="1"></rect>
        </svg>
        <div style={{ marginTop: '16px', color: 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: 500 }}>
          No Labor Data Available
        </div>
        <div style={{ marginTop: '8px', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
          Upload data via Data Management
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: containerHeight }}>
      {/* Summary Stats Bar */}
      {grandTotal > 0 && (
        <div style={{
          display: 'flex',
          gap: '20px',
          alignItems: 'center',
          padding: '8px 12px',
          background: 'var(--bg-tertiary)',
          borderRadius: '8px',
          marginBottom: '8px',
          border: '1px solid rgba(64, 224, 208, 0.1)'
        }}>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#40E0D0' }}>{grandTotal.toLocaleString()} hrs</div>
          </div>
          <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Categories</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#CDDC39' }}>{categories.length}</div>
          </div>
          <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Periods</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{chartMonths.length}</div>
          </div>
        </div>
      )}
      
      {/* Chart Container */}
      <div 
        ref={chartRef} 
        style={{ 
          width: '100%', 
          height: chartHeight
        }} 
      />
    </div>
  );
}
