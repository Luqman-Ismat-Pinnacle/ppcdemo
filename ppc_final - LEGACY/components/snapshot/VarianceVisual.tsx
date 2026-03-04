'use client';

/**
 * Enhanced variance visualization with animated SVG gauges, trend arrows,
 * tooltips, and smooth transitions. Picks the best visual for each context.
 */

import React from 'react';
import type { MetricKey } from '@/lib/use-snapshot-variance';

const fmtHrs = (h: number) => (h >= 1000 ? `${(h / 1000).toFixed(1)}K` : h.toFixed(1));
const fmtCost = (c: number) => (c >= 1000 ? `$${(c / 1000).toFixed(1)}K` : `$${Math.round(c)}`);

type VisualType = 'number' | 'percent' | 'inline-badge' | 'mini-bar' | 'gauge';

export type VarianceVisualProps = {
  current: number;
  snapshot: number | null;
  kind?: 'hours' | 'cost' | 'number';
  visual?: VisualType;
  inline?: boolean;
  label?: string;
  overIsBad?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

function formatValue(v: number, kind: 'hours' | 'cost' | 'number') {
  if (kind === 'hours') return fmtHrs(v);
  if (kind === 'cost') return fmtCost(v);
  return v.toLocaleString();
}

function TrendArrow({ up, bad }: { up: boolean; bad: boolean }) {
  const color = bad ? 'var(--color-error)' : 'var(--color-success)';
  return (
    <span style={{ color, fontSize: '0.7rem', fontWeight: 800, marginLeft: 2 }}>
      {up ? '▲' : '▼'}
    </span>
  );
}

export function VarianceVisual({
  current,
  snapshot,
  kind = 'number',
  visual,
  inline = false,
  label,
  overIsBad = true,
  className = '',
  style = {},
}: VarianceVisualProps) {
  const hasSnapshot = snapshot != null && snapshot !== undefined;
  const delta = hasSnapshot ? current - snapshot : 0;
  const percent = hasSnapshot && snapshot !== 0 ? (delta / snapshot) * 100 : 0;
  const isOver = delta > 0;
  const isBad = overIsBad ? isOver : !isOver;

  if (!hasSnapshot) return null;

  const formatDelta = () => {
    if (kind === 'hours') return `${delta >= 0 ? '+' : ''}${fmtHrs(delta)}`;
    if (kind === 'cost') return `${delta >= 0 ? '+' : ''}${fmtCost(delta)}`;
    return `${delta >= 0 ? '+' : ''}${delta.toLocaleString()}`;
  };

  const effectiveVisual: VisualType =
    visual ||
    (inline ? 'inline-badge' : percent !== 0 && Math.abs(percent) <= 100 ? 'percent' : 'number');

  const color = isBad ? 'var(--color-error)' : 'var(--color-success)';
  const bgColor = isBad ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)';

  const tooltipText = label
    ? `${label}: ${formatValue(current, kind)} now · ${formatValue(snapshot, kind)} snapshot · ${formatDelta()} (${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%)`
    : `Current: ${formatValue(current, kind)} · Snapshot: ${formatValue(snapshot, kind)} · Δ ${formatDelta()} (${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%)`;

  if (effectiveVisual === 'inline-badge') {
    return (
      <span
        className={className}
        style={{ fontSize: '0.75rem', fontWeight: 600, color, marginLeft: 6, transition: 'color 0.3s', ...style }}
        title={tooltipText}
      >
        {kind === 'hours' ? fmtHrs(delta) : kind === 'cost' ? fmtCost(delta) : `${percent.toFixed(0)}%`}
        <TrendArrow up={isOver} bad={isBad} />
      </span>
    );
  }

  if (effectiveVisual === 'percent') {
    return (
      <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...style }} title={tooltipText}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'color 0.3s' }}>{formatValue(current, kind)}</span>
        <span style={{
          fontSize: '0.75rem', fontWeight: 600, color,
          padding: '2px 8px', borderRadius: 'var(--radius-sm)',
          background: bgColor, transition: 'all 0.3s',
        }}>
          {percent >= 0 ? '+' : ''}{percent.toFixed(1)}%
          <TrendArrow up={isOver} bad={isBad} />
        </span>
      </div>
    );
  }

  if (effectiveVisual === 'mini-bar') {
    const maxVal = Math.max(current, snapshot, 1);
    const wCur = (current / maxVal) * 100;
    const wSnap = (snapshot / maxVal) * 100;
    return (
      <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 80, ...style }} title={tooltipText}>
        <div style={{ flex: 1, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${wSnap}%`, background: 'var(--text-muted)', height: '100%', transition: 'width 0.5s ease' }} />
          <div style={{ width: `${Math.max(0, wCur - wSnap)}%`, background: color, height: '100%', transition: 'width 0.5s ease' }} />
        </div>
        <span style={{ fontSize: '0.7rem', color, fontWeight: 600 }}>
          {percent >= 0 ? '+' : ''}{percent.toFixed(0)}%
        </span>
      </div>
    );
  }

  if (effectiveVisual === 'gauge') {
    // SVG animated ring gauge
    const pct = snapshot === 0 ? 0 : Math.min(150, (current / snapshot) * 100);
    const radius = 22;
    const circumference = 2 * Math.PI * radius;
    const strokeDash = (Math.min(pct, 100) / 100) * circumference;
    return (
      <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, ...style }} title={tooltipText}>
        <svg width={56} height={56} viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={28} cy={28} r={radius} fill="none" stroke="var(--border-color)" strokeWidth={4} opacity={0.3} />
          <circle
            cx={28} cy={28} r={radius} fill="none"
            stroke={isBad ? '#EF4444' : '#10B981'}
            strokeWidth={4} strokeLinecap="round"
            strokeDasharray={`${strokeDash} ${circumference}`}
            style={{ transition: 'stroke-dasharray 0.8s ease, stroke 0.3s' }}
          />
          <text
            x={28} y={28}
            textAnchor="middle" dominantBaseline="central"
            style={{ transform: 'rotate(90deg)', transformOrigin: '28px 28px', fontSize: '10px', fontWeight: 700, fill: isBad ? '#EF4444' : '#10B981' }}
          >
            {pct.toFixed(0)}%
          </text>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color }}>
            {percent >= 0 ? '+' : ''}{percent.toFixed(0)}%
            <TrendArrow up={isOver} bad={isBad} />
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            {formatDelta()} vs snapshot
          </span>
        </div>
      </div>
    );
  }

  // number (default)
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 2, ...style }} title={tooltipText}>
      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{formatValue(current, kind)}</span>
      <span style={{ fontSize: '0.7rem', color }}>
        {formatDelta()} vs snapshot <TrendArrow up={isOver} bad={isBad} />
      </span>
    </div>
  );
}
