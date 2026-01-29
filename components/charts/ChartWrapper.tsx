'use client';

/**
 * @fileoverview Chart Wrapper Component for PPC V3.
 * 
 * Base wrapper for all ECharts components providing:
 * - Consistent theme integration (dark/light mode)
 * - Responsive chart resizing
 * - Proper cleanup on unmount
 * - Common chart styling and configuration
 * 
 * All chart components in the application should use this wrapper
 * to ensure consistent behavior and styling.
 * 
 * @module components/charts/ChartWrapper
 * 
 * @example
 * ```tsx
 * <ChartWrapper
 *   option={chartOption}
 *   height="400px"
 *   onChartReady={(chart) => console.log('Chart ready')}
 * />
 * ```
 */

import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { useTheme } from '@/lib/theme-context';

interface ChartWrapperProps {
  option: EChartsOption;
  style?: React.CSSProperties;
  className?: string;
  height?: string | number;
  onChartReady?: (chart: echarts.ECharts) => void;
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
  visualId,
  visualTitle = 'Chart',
  isLoading = false,
  isEmpty = false,
}: ChartWrapperProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const themeContext = useTheme();
  const theme = themeContext?.theme || 'dark';

  useEffect(() => {
    if (!chartRef.current) return;

    // Initialize chart with current theme
    if (!echarts) return;

    // Dispose previous instance if exists
    if (chartInstanceRef.current) {
      chartInstanceRef.current.dispose();
    }

    const chart = echarts.init(chartRef.current, theme === 'dark' ? 'dark' : undefined, {
      renderer: 'canvas',
    });

    chartInstanceRef.current = chart;

    // Function to resolve CSS variables
    const resolveColor = (color: any): any => {
      if (!color) return color;

      if (typeof color === 'string') {
        // Trim any whitespace
        const trimmed = color.trim();

        // Handle exact variable: var(--name)
        if (trimmed.startsWith('var(--') && trimmed.endsWith(')')) {
          const varName = trimmed.match(/var\((--[^)]+)\)/)?.[1];
          if (varName) {
            const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
            if (val) return val;

            // Fallback for known variables if resolution fails
            if (varName === '--pinnacle-teal') return '#40E0D0';
            if (varName === '--pinnacle-lime') return '#CDDC39';
            if (varName === '--pinnacle-pink') return '#E91E63';
            if (varName === '--pinnacle-orange') return '#FF9800';
            if (varName === '--border-color') return theme === 'dark' ? '#3f3f46' : '#e2e8f0';
            if (varName === '--text-secondary') return theme === 'dark' ? '#f4f4f5' : '#475569';
            if (varName === '--bg-primary') return theme === 'dark' ? '#0a0a0a' : '#f8fafc';

            return theme === 'dark' ? '#ffffff' : '#000000';
          }
        }

        // Handle variable with alpha or within other strings
        if (trimmed.includes('var(--')) {
          const resolved = trimmed.replace(/var\((--[^)]+)\)/g, (match, varName) => {
            const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
            if (val) return val;

            if (varName === '--pinnacle-teal') return '#40E0D0';
            if (varName === '--pinnacle-lime') return '#CDDC39';
            return theme === 'dark' ? '#ffffff' : '#000000';
          });

          return resolved.replace(/\s+/g, '');
        }

        // Ensure we don't return an empty string for addColorStop
        if (trimmed === '') return 'transparent';

        return trimmed;
      }

      // Handle ECharts Gradient objects
      if (typeof color === 'object' && (color.type === 'linear' || color.type === 'radial')) {
        if (color.colorStops && Array.isArray(color.colorStops)) {
          return {
            ...color,
            colorStops: color.colorStops.map((stop: any) => ({
              ...stop,
              color: resolveColor(stop.color)
            }))
          };
        }
      }

      return color;
    };

    // Deep copy and resolve variables in the option object
    const resolveOption = (obj: any): any => {
      if (Array.isArray(obj)) return obj.map(resolveOption);
      if (obj !== null && typeof obj === 'object') {
        const newObj: any = {};
        for (const key in obj) {
          if (key === 'color' || key.endsWith('Color') || key === 'backgroundColor') {
            newObj[key] = resolveColor(obj[key]);
          } else {
            newObj[key] = resolveOption(obj[key]);
          }
        }
        return newObj;
      }
      return typeof obj === 'string' ? resolveColor(obj) : obj;
    };

    const finalOption = resolveOption(option);

    // Inject global text color if not set
    const textColor = theme === 'dark' ? '#ffffff' : '#0f172a';
    if (!finalOption.textStyle) finalOption.textStyle = {};
    if (!finalOption.textStyle.color) finalOption.textStyle.color = textColor;

    // Apply consistency to tooltips with high z-index
    if (finalOption.tooltip && typeof finalOption.tooltip === 'object') {
      finalOption.tooltip.backgroundColor = theme === 'dark' ? 'rgba(20, 20, 20, 0.95)' : 'rgba(255, 255, 255, 0.95)';
      finalOption.tooltip.borderColor = theme === 'dark' ? '#444' : '#eee';
      finalOption.tooltip.borderWidth = 1;
      finalOption.tooltip.shadowBlur = 10;
      finalOption.tooltip.shadowColor = 'rgba(0,0,0,0.3)';
      finalOption.tooltip.padding = [10, 15];
      finalOption.tooltip.confine = false;  // Allow tooltip to go outside chart bounds
      finalOption.tooltip.appendToBody = true;  // Append to body for higher z-index
      if (!finalOption.tooltip.textStyle) finalOption.tooltip.textStyle = {};
      finalOption.tooltip.textStyle.color = theme === 'dark' ? '#fff' : '#000';
      finalOption.tooltip.textStyle.fontSize = 12;
      finalOption.tooltip.textStyle.fontFamily = 'var(--font-primary)';
      // High z-index to ensure tooltip appears above all other elements
      finalOption.tooltip.extraCssText = 'z-index: 99999 !important; backdrop-filter: blur(30px); border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.35);';
    }

    chart.setOption(finalOption);

    if (onChartReady) {
      onChartReady(chart);
    }

    // Handle resize
    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [option, onChartReady, theme]);

  return (
    <div
      className={`chart-container relative rounded-xl overflow-hidden ${className}`}
      style={{ width: '100%', height, ...style }}
    >
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-transparent backdrop-blur-[2px]">
          <div className="skeleton-shimmer absolute inset-0 opacity-50" />
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-pinnacle-teal border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium text-muted animate-pulse">Loading {visualTitle}...</span>
          </div>
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

      <div
        ref={chartRef}
        className={`w-full h-full transition-opacity duration-500 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
      />
    </div>
  );
});

ChartWrapper.displayName = 'ChartWrapper';

export default ChartWrapper;

