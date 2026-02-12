'use client';

/**
 * @fileoverview Enhanced page loader with animated skeletons, branded rings, and
 * contextual messages. Provides a premium loading experience across all pages.
 *
 * Variants:
 *  - 'dashboard': scorecard grid + chart placeholder + table rows
 *  - 'chart': chart-centric skeleton
 *  - 'table': header + row skeletons
 *  - 'tree': tree/org-chart skeleton
 *  - 'default': generic card grid
 */

import React, { useEffect, useState } from 'react';

export type LoaderVariant = 'dashboard' | 'chart' | 'table' | 'tree' | 'default';

interface EnhancedPageLoaderProps {
  variant?: LoaderVariant;
  message?: string;
}

const MESSAGES = [
  'Preparing your dashboard…',
  'Loading project data…',
  'Fetching latest metrics…',
  'Assembling visualizations…',
  'Syncing resources…',
];

/* ── Skeleton primitives ─────────────────────────────────────────── */

function SkeletonBox({ width = '100%', height = 16, radius = 6, style = {} }: {
  width?: string | number; height?: number; radius?: number; style?: React.CSSProperties;
}) {
  return (
    <div
      className="skeleton-shimmer"
      style={{
        width, height, borderRadius: radius,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
        backgroundSize: '400% 100%',
        ...style,
      }}
    />
  );
}

function SkeletonCard({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.06)',
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      ...style,
    }}>
      <SkeletonBox width="40%" height={10} />
      <SkeletonBox width="60%" height={24} />
    </div>
  );
}

/* ── Variant layouts ─────────────────────────────────────────────── */

function DashboardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: 1100 }}>
      {/* Scorecards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
        {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
      </div>
      {/* Chart area */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.06)', padding: '1.25rem',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <SkeletonBox width="25%" height={14} />
        <SkeletonBox width="100%" height={180} radius={10} />
      </div>
      {/* Table rows */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.06)', padding: '1rem',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {[1, 2, 3, 4].map(i => (
          <SkeletonBox key={i} width="100%" height={18} radius={4} />
        ))}
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: 1100 }}>
      <div style={{
        background: 'rgba(255,255,255,0.03)', borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.06)', padding: '1.5rem',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <SkeletonBox width="30%" height={16} />
        <SkeletonBox width="100%" height={320} radius={12} />
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: 1100 }}>
      <div style={{
        background: 'rgba(255,255,255,0.03)', borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.06)', padding: '1rem',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <SkeletonBox width="100%" height={30} radius={6} />
        {[1, 2, 3, 4, 5, 6].map(i => (
          <SkeletonBox key={i} width="100%" height={20} radius={4} />
        ))}
      </div>
    </div>
  );
}

function TreeSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: 1100 }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.65rem' }}>
        {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
      </div>
      {/* Tree placeholder */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.06)', padding: '1.5rem',
        display: 'flex', flexDirection: 'column', gap: 12, minHeight: 400,
      }}>
        <SkeletonBox width="20%" height={14} />
        <div style={{ display: 'flex', gap: 24, paddingLeft: 20 }}>
          <SkeletonBox width={3} height={260} radius={2} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <SkeletonBox width={14} height={14} radius={7} />
                <SkeletonBox width={`${60 - i * 6}%`} height={14} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%', maxWidth: 1100 }}>
      {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} style={{ minHeight: 100 }} />)}
    </div>
  );
}

const VARIANT_MAP: Record<LoaderVariant, React.FC> = {
  dashboard: DashboardSkeleton,
  chart: ChartSkeleton,
  table: TableSkeleton,
  tree: TreeSkeleton,
  default: DefaultSkeleton,
};

/* ── Main component ──────────────────────────────────────────────── */

export default function EnhancedPageLoader({ variant = 'default', message }: EnhancedPageLoaderProps) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setMsgIdx(i => (i + 1) % MESSAGES.length), 2800);
    return () => clearInterval(interval);
  }, []);

  const SkeletonVariant = VARIANT_MAP[variant] || VARIANT_MAP.default;
  const displayMessage = message || MESSAGES[msgIdx];

  return (
    <div
      className="page-panel enhanced-page-loader"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '70vh',
        gap: '2rem',
        padding: '2rem',
      }}
    >
      {/* ── Animated rings ── */}
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        {/* Outer ring */}
        <div
          className="loader-ring-outer"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '3px solid rgba(64, 224, 208, 0.08)',
            borderTopColor: 'rgba(64, 224, 208, 0.9)',
            animation: 'spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite',
          }}
        />
        {/* Inner ring */}
        <div
          className="loader-ring-inner"
          style={{
            position: 'absolute',
            inset: 10,
            borderRadius: '50%',
            border: '2.5px solid rgba(64, 224, 208, 0.05)',
            borderBottomColor: 'rgba(64, 224, 208, 0.6)',
            animation: 'spin 0.9s cubic-bezier(0.5, 0, 0.5, 1) infinite reverse',
          }}
        />
        {/* Center pulse */}
        <div
          style={{
            position: 'absolute',
            inset: 22,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(64,224,208,0.25), transparent 70%)',
            animation: 'pulse-glow 2s ease-in-out infinite',
          }}
        />
      </div>

      {/* ── Message ── */}
      <div
        key={msgIdx}
        style={{
          color: 'var(--text-muted, #888)',
          fontSize: '0.9rem',
          fontWeight: 500,
          letterSpacing: '0.01em',
          animation: 'loader-fade-in 0.5s ease',
        }}
      >
        {displayMessage}
      </div>

      {/* ── Skeleton preview ── */}
      <div style={{ width: '100%', maxWidth: 1100, opacity: 0.5, animation: 'loader-fade-in 0.8s ease' }}>
        <SkeletonVariant />
      </div>
    </div>
  );
}
