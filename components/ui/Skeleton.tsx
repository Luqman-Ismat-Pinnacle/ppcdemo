'use client';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  style?: React.CSSProperties;
}

export default function Skeleton({ width = '100%', height = 20, borderRadius, style }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{
        width,
        height,
        borderRadius: borderRadius || 'var(--radius-sm)',
        ...style,
      }}
    />
  );
}

export function SkeletonCard({ height = 120 }: { height?: number }) {
  return (
    <div className="glass" style={{ padding: '0.75rem' }}>
      <Skeleton height={12} width="40%" style={{ marginBottom: 8 }} />
      <Skeleton height={height - 40} />
    </div>
  );
}
