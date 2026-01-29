'use client';

import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'card' | 'metric' | 'circle' | 'rect';
  width?: string;
  height?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rect',
  width,
  height,
}) => {
  const baseStyles = `
    skeleton-shimmer
    bg-gradient-to-r from-[rgba(255,255,255,0.03)] via-[rgba(255,255,255,0.08)] to-[rgba(255,255,255,0.03)]
    bg-[length:200%_100%]
  `;

  const variantStyles = {
    text: 'h-4 rounded-md mb-2',
    card: 'h-48 rounded-[var(--radius-xl)]',
    metric: 'h-20 rounded-[var(--radius-lg)]',
    circle: 'rounded-full aspect-square',
    rect: 'rounded-md',
  };

  return (
    <div
      className={`
        ${baseStyles}
        ${variantStyles[variant]}
        ${className}
      `}
      style={{
        width: width || (variant === 'text' ? '100%' : undefined),
        height: height,
      }}
    />
  );
};

interface SkeletonGroupProps {
  count?: number;
  variant?: 'text' | 'card' | 'metric';
  className?: string;
}

export const SkeletonGroup: React.FC<SkeletonGroupProps> = ({
  count = 3,
  variant = 'text',
  className = '',
}) => {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} variant={variant} />
      ))}
    </div>
  );
};

export const SkeletonCard: React.FC = () => {
  return (
    <div className="bg-[rgba(26,26,26,0.65)] border border-[var(--border-color)] rounded-[var(--radius-xl)] p-5">
      <Skeleton variant="text" width="60%" className="mb-4" />
      <Skeleton variant="text" width="40%" className="mb-6" />
      <Skeleton variant="rect" height="120px" />
    </div>
  );
};

export const SkeletonMetric: React.FC = () => {
  return (
    <div className="bg-[rgba(26,26,26,0.65)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-5">
      <Skeleton variant="text" width="50%" className="mb-2" />
      <Skeleton variant="text" width="70%" height="32px" />
    </div>
  );
};

export const SkeletonTable: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex gap-4">
          <Skeleton variant="rect" width="30%" height="40px" />
          <Skeleton variant="rect" width="40%" height="40px" />
          <Skeleton variant="rect" width="30%" height="40px" />
        </div>
      ))}
    </div>
  );
};
