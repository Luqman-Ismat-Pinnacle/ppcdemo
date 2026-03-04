'use client';

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  gradient?: boolean;
  bordered?: boolean;
}

export const Card: React.FC<CardProps> = React.memo(({
  children,
  className = '',
  hover = false,
  gradient = false,
  bordered = true,
}) => {
  return (
    <div
      className={`
        ${gradient ? 'bg-gradient-to-br from-[rgba(26,26,26,0.7)] to-[rgba(20,20,20,0.8)]' : 'bg-[rgba(26,26,26,0.65)]'}
        ${bordered ? 'border border-[var(--border-color)]' : ''}
        ${hover ? 'card-hover hover:border-[rgba(64,224,208,0.5)] hover:shadow-[var(--shadow-lg),var(--glow-teal)]' : ''}
        backdrop-blur-[20px] rounded-[var(--radius-xl)] overflow-hidden
        transition-all duration-[var(--transition-normal)]
        ${className}
      `}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  action,
  className = '',
}) => {
  return (
    <div
      className={`
        flex justify-between items-center px-5 py-4
        border-b border-[var(--border-color)]
        bg-[rgba(255,255,255,0.02)]
        ${className}
      `}
    >
      <div>
        <h3 className="text-base font-bold text-[var(--text-primary)] leading-tight">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-[var(--text-muted)] mt-1 font-medium">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
};

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export const CardBody: React.FC<CardBodyProps> = ({
  children,
  className = '',
  noPadding = false,
}) => {
  return (
    <div className={`${noPadding ? '' : 'p-5'} ${className}`}>
      {children}
    </div>
  );
};
