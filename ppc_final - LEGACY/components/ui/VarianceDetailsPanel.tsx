'use client';

import React, { useMemo } from 'react';
import { VarianceAnalysis, VarianceFlag, VarianceInsight } from '@/lib/variance-insights';
import { formatVariance, getTrendIcon, MetricsHistory } from '@/lib/variance-engine';

// ============================================================================
// Types
// ============================================================================

export interface VarianceDetailsPanelProps {
  /** Metric name */
  metricName: string;
  /** Full variance analysis */
  analysis: VarianceAnalysis;
  /** Historical data points for mini chart */
  historicalData?: MetricsHistory[];
  /** Display format */
  format?: 'percent' | 'number' | 'currency' | 'hours';
  /** Whether to invert colors */
  invertColors?: boolean;
  /** Close handler */
  onClose?: () => void;
  /** Export handler */
  onExport?: () => void;
}

// ============================================================================
// Severity Styling
// ============================================================================

const severityColors = {
  info: { bg: 'rgba(59, 130, 246, 0.1)', border: '#3B82F6', text: '#3B82F6', icon: 'i' },
  warning: { bg: 'rgba(245, 158, 11, 0.1)', border: '#F59E0B', text: '#F59E0B', icon: '!' },
  critical: { bg: 'rgba(239, 68, 68, 0.1)', border: '#EF4444', text: '#EF4444', icon: '!!' },
};

const trendColors = {
  improving: { text: '#10B981', label: 'Improving' },
  declining: { text: '#EF4444', label: 'Declining' },
  stable: { text: 'var(--text-muted)', label: 'Stable' },
  volatile: { text: '#F59E0B', label: 'Volatile' },
};

// ============================================================================
// Component
// ============================================================================

export function VarianceDetailsPanel({
  metricName,
  analysis,
  historicalData,
  format = 'number',
  invertColors = false,
  onClose,
  onExport,
}: VarianceDetailsPanelProps) {
  const { variance, insights, flags, trendDirection, historicalContext, summary } = analysis;
  
  // Get trend styling
  const trendStyle = trendColors[trendDirection];
  
  // Group flags by severity
  const criticalFlags = flags.filter(f => f.severity === 'critical');
  const warningFlags = flags.filter(f => f.severity === 'warning');
  const infoFlags = flags.filter(f => f.severity === 'info');
  
  // Calculate mini chart data from historical if available
  const chartData = useMemo(() => {
    if (!historicalData || historicalData.length === 0) return [];
    return historicalData.slice(-8).map(h => ({
      date: h.recordedDate,
      value: (h as any)[metricName.toLowerCase().replace(/\s+/g, '')] || 0
    }));
  }, [historicalData, metricName]);
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: '480px',
      maxWidth: '100vw',
      background: 'var(--bg-card)',
      borderLeft: '1px solid var(--border-color)',
      boxShadow: '-10px 0 40px rgba(0,0,0,0.3)',
      zIndex: 1001,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border-color)',
        background: 'rgba(255,255,255,0.02)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
            {metricName} Analysis
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Variance trending and insights
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
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
        )}
      </div>
      
      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {/* Current Period Summary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          marginBottom: '24px',
        }}>
          {/* Current Value Card */}
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--border-color)',
          }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
              Current Period
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {formatValue(variance.current, format)}
            </div>
            <div style={{
              marginTop: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: variance.trend === 'up' 
                ? (invertColors ? '#EF4444' : '#10B981')
                : variance.trend === 'down'
                ? (invertColors ? '#10B981' : '#EF4444')
                : 'var(--text-muted)'
            }}>
              <span>{getTrendIcon(variance.trend)}</span>
              <span>{formatVariance(variance, 'percent')}</span>
            </div>
          </div>
          
          {/* Trend Direction Card */}
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--border-color)',
          }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
              Trend Direction
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: trendStyle.text }}>
              {trendStyle.label}
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {historicalContext}
            </div>
          </div>
        </div>
        
        {/* Mini Trend Chart Placeholder */}
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid var(--border-color)',
          marginBottom: '24px',
          height: '120px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {chartData.length > 0 ? (
            <MiniTrendChart data={chartData} invertColors={invertColors} />
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <div style={{ fontSize: '0.9rem', marginBottom: '8px', opacity: 0.6 }}>No data</div>
              Trend chart will appear when historical data is available
            </div>
          )}
        </div>
        
        {/* Flags Section */}
        {flags.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ 
              margin: '0 0 12px', 
              fontSize: '0.8rem', 
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              Flags ({flags.length})
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {criticalFlags.map((flag, idx) => (
                <FlagCard key={`critical-${idx}`} flag={flag} />
              ))}
              {warningFlags.map((flag, idx) => (
                <FlagCard key={`warning-${idx}`} flag={flag} />
              ))}
              {infoFlags.map((flag, idx) => (
                <FlagCard key={`info-${idx}`} flag={flag} />
              ))}
            </div>
          </div>
        )}
        
        {/* Insights Section */}
        {insights.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ 
              margin: '0 0 12px', 
              fontSize: '0.8rem', 
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              Insights ({insights.length})
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {insights.map((insight, idx) => (
                <InsightCard key={idx} insight={insight} />
              ))}
            </div>
          </div>
        )}
        
        {/* Related Metrics Section */}
        {insights.some(i => i.relatedMetrics && i.relatedMetrics.length > 0) && (
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ 
              margin: '0 0 12px', 
              fontSize: '0.8rem', 
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              Related Metrics
            </h3>
            
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '10px',
              padding: '12px',
              border: '1px solid var(--border-color)',
            }}>
              {insights
                .flatMap(i => i.relatedMetrics || [])
                .filter((v, i, a) => a.indexOf(v) === i)
                .map((metric, idx) => (
                  <div key={idx} style={{
                    padding: '8px 0',
                    borderBottom: idx < insights.length - 1 ? '1px solid var(--border-color)' : 'none',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                  }}>
                    {metric}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Footer Actions */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid var(--border-color)',
        background: 'rgba(255,255,255,0.02)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {summary}
        </div>
        {onExport && (
          <button
            onClick={onExport}
            style={{
              padding: '8px 16px',
              fontSize: '0.8rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Export Analysis
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function FlagCard({ flag }: { flag: VarianceFlag }) {
  const colors = severityColors[flag.severity];
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 14px',
      background: colors.bg,
      borderRadius: '10px',
      borderLeft: `3px solid ${colors.border}`,
    }}>
      <span style={{ fontSize: '1.1rem' }}>{flag.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ 
          fontSize: '0.8rem', 
          fontWeight: 600, 
          color: colors.text,
          marginBottom: '2px'
        }}>
          {flag.severity.toUpperCase()}: {flag.label}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {flag.tooltip}
        </div>
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: VarianceInsight }) {
  const colors = severityColors[insight.severity];
  
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: '12px',
      padding: '16px',
      border: '1px solid var(--border-color)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <span style={{
          padding: '3px 8px',
          fontSize: '0.65rem',
          fontWeight: 600,
          background: colors.bg,
          color: colors.text,
          borderRadius: '4px',
          textTransform: 'uppercase',
        }}>
          {insight.type}
        </span>
        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {insight.title}
        </span>
      </div>
      
      {/* Confidence */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '10px',
      }}>
        <div style={{
          flex: 1,
          height: '4px',
          background: 'var(--bg-tertiary)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${insight.confidence}%`,
            height: '100%',
            background: colors.border,
            borderRadius: '2px',
          }} />
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {insight.confidence}% confidence
        </span>
      </div>
      
      {/* Explanation */}
      <p style={{ 
        margin: '0 0 12px', 
        fontSize: '0.8rem', 
        color: 'var(--text-secondary)',
        lineHeight: 1.5
      }}>
        {insight.explanation}
      </p>
      
      {/* Likely Reasons */}
      {insight.likelyReasons.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ 
            fontSize: '0.7rem', 
            fontWeight: 600, 
            color: 'var(--text-muted)', 
            marginBottom: '6px' 
          }}>
            Likely Reasons:
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            {insight.likelyReasons.map((reason, idx) => (
              <li key={idx} style={{ 
                fontSize: '0.75rem', 
                color: 'var(--text-secondary)',
                marginBottom: '4px'
              }}>
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Recommendation */}
      {insight.recommendation && (
        <div style={{
          padding: '10px 12px',
          background: 'rgba(59, 130, 246, 0.1)',
          borderRadius: '8px',
          fontSize: '0.75rem',
          color: '#3B82F6',
          display: 'flex',
          gap: '8px',
        }}>
          <span>{insight.recommendation}</span>
        </div>
      )}
    </div>
  );
}

function MiniTrendChart({ 
  data, 
  invertColors 
}: { 
  data: Array<{ date: string; value: number }>; 
  invertColors: boolean;
}) {
  if (data.length < 2) return null;
  
  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  
  const width = 100;
  const height = 60;
  const padding = 4;
  
  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((d.value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');
  
  const trend = values[values.length - 1] > values[0] ? 'up' : 'down';
  const color = trend === 'up' 
    ? (invertColors ? '#EF4444' : '#10B981')
    : (invertColors ? '#10B981' : '#EF4444');
  
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <svg 
        viewBox={`0 0 ${width} ${height}`} 
        style={{ flex: 1, width: '100%' }}
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((d, i) => {
          const x = padding + (i / (data.length - 1)) * (width - padding * 2);
          const y = height - padding - ((d.value - min) / range) * (height - padding * 2);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="3"
              fill={color}
            />
          );
        })}
      </svg>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        fontSize: '0.65rem',
        color: 'var(--text-muted)',
        marginTop: '4px'
      }}>
        {data.length > 0 && (
          <>
            <span>{data[0].date}</span>
            <span>{data[data.length - 1].date}</span>
          </>
        )}
      </div>
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

export default VarianceDetailsPanel;
