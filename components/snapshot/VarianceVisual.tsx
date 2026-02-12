'use client';

/**
 * Intelligent variance visualization: picks the best visual for the data type.
 * Use for any number, row, or breakdown to show "vs snapshot" variance.
 */

import React from 'react';
import type { MetricKey } from '@/lib/use-snapshot-variance';

const fmtHrs = (h: number) => (h >= 1000 ? `${(h / 1000).toFixed(1)}K` : h.toFixed(1));
const fmtCost = (c: number) => (c >= 1000 ? `$${(c / 1000).toFixed(1)}K` : `$${Math.round(c)}`);

type VisualType = 'number' | 'percent' | 'inline-badge' | 'mini-bar' | 'gauge';

export type VarianceVisualProps = {
  /** Current value */
  current: number;
  /** Snapshot (baseline) value */
  snapshot: number | null;
  /** 'hours' | 'cost' - formats and chooses delta display */
  kind?: 'hours' | 'cost' | 'number';
  /** Force visual type; otherwise auto-chosen */
  visual?: VisualType;
  /** Compact inline (e.g. in table cell) */
  inline?: boolean;
  /** Label for accessibility */
  label?: string;
  /** Show as over/under (cost/hours over = bad) */
  overIsBad?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

function formatValue(v: number, kind: 'hours' | 'cost' | 'number') {
  if (kind === 'hours') return fmtHrs(v);
  if (kind === 'cost') return fmtCost(v);
  return v.toLocaleString();
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

  if (effectiveVisual === 'inline-badge') {
    return (
      <span
        className={className}
        style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color,
          marginLeft: 6,
          ...style,
        }}
        title={label ? `${label}: ${formatDelta()} (${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%)` : undefined}
      >
        {delta >= 0 ? '+' : ''}
        {kind === 'hours' ? fmtHrs(delta) : kind === 'cost' ? fmtCost(delta) : `${percent.toFixed(0)}%`}
      </span>
    );
  }

  if (effectiveVisual === 'percent') {
    return (
      <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...style }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatValue(current, kind)}</span>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color,
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
            background: bgColor,
          }}
        >
          {percent >= 0 ? '+' : ''}{percent.toFixed(1)}%
        </span>
      </div>
    );
  }

  if (effectiveVisual === 'mini-bar') {
    const maxVal = Math.max(current, snapshot, 1);
    const wCur = (current / maxVal) * 100;
    const wSnap = (snapshot / maxVal) * 100;
    return (
      <div
        className={className}
        style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 80, ...style }}
        title={`Current: ${formatValue(current, kind)} · Snapshot: ${formatValue(snapshot, kind)}`}
      >
        <div style={{ flex: 1, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${wSnap}%`, background: 'var(--text-muted)', height: '100%' }} />
          <div style={{ width: `${Math.max(0, wCur - wSnap)}%`, background: color, height: '100%' }} />
        </div>
        <span style={{ fontSize: '0.7rem', color, fontWeight: 600 }}>{percent >= 0 ? '+' : ''}{percent.toFixed(0)}%</span>
      </div>
    );
  }

  if (effectiveVisual === 'gauge') {
    const pct = snapshot === 0 ? 0 : Math.min(100, (current / snapshot) * 100);
    return (
      <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: `conic-gradient(${color} 0% ${pct}%, var(--border-color) ${pct}% 100%)`,
          }}
        />
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color }}>{percent >= 0 ? '+' : ''}{percent.toFixed(0)}%</span>
      </div>
    );
  }

  // number (default): show current and delta
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 2, ...style }}>
      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{formatValue(current, kind)}</span>
      <span style={{ fontSize: '0.7rem', color }}>{formatDelta()} vs snapshot</span>
    </div>
  );
}
