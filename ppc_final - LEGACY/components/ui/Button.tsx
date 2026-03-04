'use client';

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = React.memo(({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = `
    inline-flex items-center justify-center gap-2
    font-semibold rounded-[var(--radius-md)]
    transition-all duration-[var(--transition-normal)]
    relative overflow-hidden
    before:content-[''] before:absolute before:top-1/2 before:left-1/2
    before:w-0 before:h-0 before:rounded-full
    before:bg-[rgba(255,255,255,0.2)]
    before:-translate-x-1/2 before:-translate-y-1/2
    before:transition-all before:duration-600
    active:before:w-[300px] active:before:h-[300px]
    disabled:opacity-50 disabled:cursor-not-allowed
  `;

  const variantStyles = {
    primary: `
      bg-gradient-to-br from-[var(--pinnacle-teal)] to-[#2DBFAF]
      text-black border border-[var(--pinnacle-teal)]
      shadow-[0_4px_12px_rgba(64,224,208,0.3)]
      hover:from-[#2DBFAF] hover:to-[var(--pinnacle-teal-dark)]
      hover:text-white hover:-translate-y-0.5
      hover:shadow-[var(--glow-teal-strong)]
    `,
    secondary: `
      bg-[rgba(255,255,255,0.05)] backdrop-blur-[10px]
      text-[var(--text-secondary)] border border-[var(--border-color)]
      hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]
      hover:border-[var(--pinnacle-teal)] hover:-translate-y-0.5
    `,
    ghost: `
      bg-transparent text-[var(--text-secondary)]
      border border-transparent
      hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]
    `,
    danger: `
      bg-gradient-to-br from-[#EF4444] to-[#DC2626]
      text-white border border-[#EF4444]
      shadow-[0_4px_12px_rgba(239,68,68,0.3)]
      hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(239,68,68,0.5)]
    `,
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={`
        ${baseStyles}
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <div className="w-4 h-4 border-2 border-transparent border-t-current rounded-full animate-spin" />
      )}
      {icon && !loading && icon}
      {children}
    </button>
  );
});

Button.displayName = 'Button';
