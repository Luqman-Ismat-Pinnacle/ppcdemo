'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  calculateVariance, 
  formatVariance, 
  getTrendIcon, 
  getTrendColor,
  VarianceResult,
  VariancePeriod
} from '@/lib/variance-engine';
import {
  analyzeVariance,
  VarianceAnalysis,
  VarianceFlag,
  VarianceInsight,
  AnalysisContext
} from '@/lib/variance-insights';

// ============================================================================
// Types
// ============================================================================

export interface VarianceIndicatorProps {
  /** Metric name for display and analysis */
  metricName: string;
  /** Current period value */
  current: number;
  /** Previous period value */
  previous: number;
  /** Historical values for trend analysis (optional) */
  history?: number[];
  /** Display format */
  format?: 'percent' | 'number' | 'currency' | 'hours';
  /** Invert colors (for metrics where down is good, like costs) */
  invertColors?: boolean;
  /** Period label (e.g., "vs last week") */
  period?: string;
  /** Component size */
  size?: 'sm' | 'md' | 'lg';
  /** Show warning/critical flags */
  showFlags?: boolean;
  /** Allow click to expand details */
  expandable?: boolean;
  /** Context for correlation analysis */
  context?: AnalysisContext;
  /** Callback when "View Full Analysis" is clicked */
  onViewDetails?: (analysis: VarianceAnalysis) => void;
  /** Custom className */
  className?: string;
}

// ============================================================================
// Styles
// ============================================================================

const sizeStyles = {
  sm: {
    fontSize: '0.7rem',
    padding: '2px 6px',
    iconSize: '0.6rem',
    flagSize: '0.65rem',
  },
  md: {
    fontSize: '0.8rem',
    padding: '4px 8px',
    iconSize: '0.7rem',
    flagSize: '0.75rem',
  },
  lg: {
    fontSize: '0.9rem',
    padding: '6px 10px',
    iconSize: '0.8rem',
    flagSize: '0.85rem',
  },
};

const colorStyles = {
  positive: {
    text: '#10B981',
    bg: 'rgba(16, 185, 129, 0.1)',
    border: 'rgba(16, 185, 129, 0.3)',
  },
  negative: {
    text: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.1)',
    border: 'rgba(239, 68, 68, 0.3)',
  },
  neutral: {
    text: 'var(--text-muted)',
    bg: 'rgba(107, 114, 128, 0.1)',
    border: 'rgba(107, 114, 128, 0.3)',
  },
};

const severityColors = {
  info: { bg: 'rgba(59, 130, 246, 0.1)', border: '#3B82F6', text: '#3B82F6' },
  warning: { bg: 'rgba(245, 158, 11, 0.1)', border: '#F59E0B', text: '#F59E0B' },
  critical: { bg: 'rgba(239, 68, 68, 0.1)', border: '#EF4444', text: '#EF4444' },
};

// ============================================================================
// Component
// ============================================================================

export function VarianceIndicator({
  metricName,
  current,
  previous,
  history,
  format = 'percent',
  invertColors = false,
  period,
  size = 'md',
  showFlags = true,
  expandable = true,
  context,
  onViewDetails,
  className = '',
}: VarianceIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  
  // Calculate variance
  const variance = useMemo(() => {
    return calculateVariance(current, previous, period || 'vs previous period');
  }, [current, previous, period]);
  
  // Analyze variance for insights
  const analysis = useMemo(() => {
    return analyzeVariance(metricName, current, previous, {
      ...context,
      historicalValues: history,
    });
  }, [metricName, current, previous, context, history]);
  
  // Get styling
  const styles = sizeStyles[size];
  const trendColorType = getTrendColor(variance.trend, invertColors);
  const colors = colorStyles[trendColorType];
  
  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsExpanded(false);
      }
    }
    
    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isExpanded]);
  
  // Get flags to display
  const flagsToShow = showFlags ? analysis.flags.slice(0, 2) : [];
  
  const handleClick = () => {
    if (expandable) {
      setIsExpanded(!isExpanded);
    }
  };
  
  const handleViewDetails = () => {
    if (onViewDetails) {
      onViewDetails(analysis);
    }
    setIsExpanded(false);
  };
  
  return (
    <div className={`variance-indicator-wrapper ${className}`} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Collapsed indicator */}
      <button
        ref={triggerRef}
        onClick={handleClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: styles.padding,
          fontSize: styles.fontSize,
          fontWeight: 600,
          color: colors.text,
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: '6px',
          cursor: expandable ? 'pointer' : 'default',
          transition: 'all 0.15s ease',
          whiteSpace: 'nowrap',
        }}
        title={expandable ? 'Click for details' : undefined}
      >
        <span style={{ fontSize: styles.iconSize }}>{getTrendIcon(variance.trend)}</span>
        <span>{formatVariance(variance, format)}</span>
        
        {/* Flags */}
        {flagsToShow.map((flag, idx) => (
          <span
            key={idx}
            style={{ fontSize: styles.flagSize, marginLeft: '2px' }}
            title={flag.tooltip}
          >
            {flag.icon}
          </span>
        ))}
      </button>
      
      {/* Expanded popover */}
      {isExpanded && expandable && (
        <div
          ref={popoverRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: '8px',
            width: '320px',
            maxWidth: '90vw',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-color)',
            background: 'rgba(255,255,255,0.02)',
          }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>
              {metricName}
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              fontSize: '0.8rem',
              color: 'var(--text-muted)'
            }}>
              <span>Current: <strong style={{ color: 'var(--text-primary)' }}>{formatValue(current, format)}</strong></span>
              <span>Previous: <strong style={{ color: 'var(--text-secondary)' }}>{formatValue(previous, format)}</strong></span>
            </div>
            <div style={{ 
              marginTop: '8px',
              padding: '6px 10px',
              background: colors.bg,
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: colors.text,
              fontWeight: 600,
              fontSize: '0.85rem',
            }}>
              <span>{getTrendIcon(variance.trend)}</span>
              <span>{formatVariance(variance, format)} ({variance.periodLabel})</span>
            </div>
          </div>
          
          {/* Flags section */}
          {analysis.flags.length > 0 && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ 
                fontSize: '0.7rem', 
                fontWeight: 600, 
                color: 'var(--text-muted)', 
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Flags
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {analysis.flags.map((flag, idx) => (
                  <FlagItem key={idx} flag={flag} />
                ))}
              </div>
            </div>
          )}
          
          {/* Insights section */}
          {analysis.insights.length > 0 && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ 
                fontSize: '0.7rem', 
                fontWeight: 600, 
                color: 'var(--text-muted)', 
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Insights
              </div>
              {analysis.insights.slice(0, 2).map((insight, idx) => (
                <InsightItem key={idx} insight={insight} />
              ))}
            </div>
          )}
          
          {/* Historical context */}
          <div style={{ 
            padding: '10px 16px', 
            fontSize: '0.75rem', 
            color: 'var(--text-muted)',
            background: 'rgba(255,255,255,0.01)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>📊</span>
            <span>{analysis.historicalContext}</span>
          </div>
          
          {/* Footer actions */}
          {onViewDetails && (
            <div style={{ 
              padding: '10px 16px', 
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={handleViewDetails}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: 'var(--pinnacle-teal)',
                  background: 'transparent',
                  border: '1px solid var(--pinnacle-teal)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                View Full Analysis
                <span>→</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function FlagItem({ flag }: { flag: VarianceFlag }) {
  const colors = severityColors[flag.severity];
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 10px',
      background: colors.bg,
      borderRadius: '6px',
      fontSize: '0.75rem',
    }}>
      <span>{flag.icon}</span>
      <span style={{ color: colors.text, fontWeight: 500 }}>{flag.label}</span>
      <span style={{ color: 'var(--text-muted)', flex: 1 }}>{flag.tooltip}</span>
    </div>
  );
}

function InsightItem({ insight }: { insight: VarianceInsight }) {
  const colors = severityColors[insight.severity];
  
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px',
        marginBottom: '4px'
      }}>
        <span style={{ 
          fontSize: '0.65rem',
          padding: '2px 6px',
          background: colors.bg,
          color: colors.text,
          borderRadius: '4px',
          fontWeight: 500,
          textTransform: 'uppercase',
        }}>
          {insight.type}
        </span>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {insight.title}
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
          ({insight.confidence}% confidence)
        </span>
      </div>
      <p style={{ 
        fontSize: '0.75rem', 
        color: 'var(--text-secondary)', 
        margin: '0 0 6px 0',
        lineHeight: 1.4
      }}>
        {insight.explanation}
      </p>
      {insight.likelyReasons.length > 0 && (
        <div style={{ marginLeft: '8px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Likely reasons:
          </div>
          <ul style={{ 
            margin: 0, 
            paddingLeft: '16px',
            fontSize: '0.7rem',
            color: 'var(--text-secondary)'
          }}>
            {insight.likelyReasons.slice(0, 3).map((reason, idx) => (
              <li key={idx} style={{ marginBottom: '2px' }}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {insight.recommendation && (
        <div style={{
          marginTop: '6px',
          padding: '6px 8px',
          background: 'rgba(59, 130, 246, 0.1)',
          borderRadius: '4px',
          fontSize: '0.7rem',
          color: '#3B82F6',
        }}>
          💡 {insight.recommendation}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatValue(value: number, format: 'percent' | 'number' | 'currency' | 'hours'): string {
  switch (format) {
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'number':
      return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
    case 'currency':
      return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    case 'hours':
      return `${value.toFixed(1)} hrs`;
    default:
      return value.toString();
  }
}

// ============================================================================
// Exports
// ============================================================================

export default VarianceIndicator;
