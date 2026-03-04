'use client';

/**
 * @fileoverview Compare Button Component
 * 
 * Button component for opening snapshot comparison modal
 */

import React from 'react';

interface CompareButtonProps {
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function CompareButton({
  onClick,
  className = '',
  style,
}: CompareButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        fontSize: '0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'all 0.2s',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-tertiary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--bg-secondary)';
      }}
      title="Compare with snapshots"
      className={className}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      Compare
    </button>
  );
}
