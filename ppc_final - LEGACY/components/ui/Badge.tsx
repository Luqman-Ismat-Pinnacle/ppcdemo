'use client';

import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  className?: string;
  pulse?: boolean;
}

export const Badge: React.FC<BadgeProps> = React.memo(({
  children,
  variant = 'neutral',
  size = 'md',
  icon,
  className = '',
  pulse = false,
}) => {
  const baseStyles = `
    inline-flex items-center gap-1.5
    font-bold uppercase tracking-wider
    rounded-full border transition-all
    duration-[var(--transition-fast)]
  `;

  const variantStyles = {
    success: `
      bg-[rgba(16,185,129,0.15)] text-[#10B981]
      border-[rgba(16,185,129,0.3)]
      hover:bg-[rgba(16,185,129,0.25)]
      hover:shadow-[0_0_12px_rgba(16,185,129,0.3)]
    `,
    warning: `
      bg-[rgba(245,158,11,0.15)] text-[#F59E0B]
      border-[rgba(245,158,11,0.3)]
      hover:bg-[rgba(245,158,11,0.25)]
      hover:shadow-[0_0_12px_rgba(245,158,11,0.3)]
    `,
    danger: `
      bg-[rgba(239,68,68,0.15)] text-[#EF4444]
      border-[rgba(239,68,68,0.3)]
      hover:bg-[rgba(239,68,68,0.25)]
      hover:shadow-[0_0_12px_rgba(239,68,68,0.3)]
    `,
    info: `
      bg-[rgba(64,224,208,0.15)] text-[var(--pinnacle-teal)]
      border-[rgba(64,224,208,0.3)]
      hover:bg-[rgba(64,224,208,0.25)]
      hover:shadow-[0_0_12px_rgba(64,224,208,0.3)]
    `,
    neutral: `
      bg-[rgba(255,255,255,0.05)] text-[var(--text-muted)]
      border-[var(--border-color)]
      hover:bg-[rgba(255,255,255,0.1)]
      hover:text-[var(--text-primary)]
    `,
  };

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[0.6rem]',
    md: 'px-3 py-1 text-[0.7rem]',
    lg: 'px-4 py-1.5 text-xs',
  };

  return (
    <span
      className={`
        ${baseStyles}
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${pulse ? 'animate-pulse' : ''}
        ${className}
      `}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  );
});

Badge.displayName = 'Badge';

interface StatusBadgeProps {
  status: 'active' | 'completed' | 'pending' | 'failed' | 'in-progress';
  showDot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = React.memo(({
  status,
  showDot = true,
}) => {
  const statusConfig = {
    active: { variant: 'success' as const, label: 'Active', pulse: true },
    completed: { variant: 'success' as const, label: 'Completed', pulse: false },
    pending: { variant: 'warning' as const, label: 'Pending', pulse: false },
    failed: { variant: 'danger' as const, label: 'Failed', pulse: false },
    'in-progress': { variant: 'info' as const, label: 'In Progress', pulse: true },
  };

  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} pulse={config.pulse}>
      {showDot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {config.label}
    </Badge>
  );
});

StatusBadge.displayName = 'StatusBadge';
