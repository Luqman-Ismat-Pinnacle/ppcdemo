'use client';

import React from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  change?: {
    value: number;
    trend: 'up' | 'down' | 'neutral';
  };
  icon?: React.ReactNode;
  accentColor?: string;
  className?: string;
  loading?: boolean;
  style?: React.CSSProperties;
}

export const MetricCard: React.FC<MetricCardProps> = React.memo(({
  label,
  value,
  change,
  icon,
  accentColor = 'var(--pinnacle-teal)',
  className = '',
  loading = false,
  style,
}) => {
  const trendColors = {
    up: '#10B981',
    down: '#EF4444',
    neutral: 'var(--text-muted)',
  };

  if (loading) {
    return (
      <div className={`metric-card ${className}`}>
        <div className="h-4 w-24 bg-gradient-to-r from-[rgba(255,255,255,0.03)] to-[rgba(255,255,255,0.08)] rounded animate-pulse mb-3" />
        <div className="h-8 w-32 bg-gradient-to-r from-[rgba(255,255,255,0.03)] to-[rgba(255,255,255,0.08)] rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div
      className={`
        bg-gradient-to-br from-[rgba(26,26,26,0.7)] to-[rgba(20,20,20,0.8)]
        backdrop-blur-[20px] border border-[var(--border-color)]
        rounded-[var(--radius-lg)] p-5 relative overflow-hidden
        transition-all duration-[var(--transition-normal)]
        hover:-translate-y-0.5
        hover:border-[rgba(64,224,208,0.4)]
        hover:shadow-[var(--shadow-md),0_0_20px_rgba(64,224,208,0.15)]
        ${className}
      `}
      style={style}
    >
      {/* Gradient accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 transition-all duration-[var(--transition-normal)] group-hover:w-1.5"
        style={{
          background: `linear-gradient(180deg, ${accentColor} 0%, var(--pinnacle-lime) 100%)`,
        }}
      />

      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            {label}
          </div>
          <div className="text-3xl font-extrabold text-[var(--text-primary)] font-mono tracking-tight leading-none">
            {value}
          </div>
        </div>
        {icon && (
          <div className="text-2xl opacity-40 ml-3">
            {icon}
          </div>
        )}
      </div>

      {change && (
        <div className="flex items-center gap-2 mt-3">
          <span
            className="text-sm font-bold flex items-center gap-1"
            style={{ color: trendColors[change.trend] }}
          >
            {change.trend === 'up' && '↑'}
            {change.trend === 'down' && '↓'}
            {change.trend === 'neutral' && '→'}
            {Math.abs(change.value)}%
          </span>
          <span className="text-xs text-[var(--text-muted)]">vs last period</span>
        </div>
      )}
    </div>
  );
});

MetricCard.displayName = 'MetricCard';

interface MetricRowProps {
  metrics: Array<{
    label: string;
    value: string | number;
    change?: {
      value: number;
      trend: 'up' | 'down' | 'neutral';
    };
    icon?: React.ReactNode;
    accentColor?: string;
  }>;
  className?: string;
  loading?: boolean;
}

export const MetricRow: React.FC<MetricRowProps> = React.memo(({
  metrics,
  className = '',
  loading = false,
}) => {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      {metrics.map((metric, index) => (
        <MetricCard
          key={index}
          {...metric}
          loading={loading}
          className="animate-fade-in-up"
          style={{ animationDelay: `${index * 100}ms` } as React.CSSProperties}
        />
      ))}
    </div>
  );
});

MetricRow.displayName = 'MetricRow';
