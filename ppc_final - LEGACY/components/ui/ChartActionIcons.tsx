'use client';

/**
 * Shared action button icons for charts/tables – matches reference: square, icon-only, light border.
 * Compare (two bars), Fullscreen (expand corners), Download (arrow).
 */

import React from 'react';

const btnBase = {
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  background: 'var(--bg-tertiary)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 8,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
};

export const chartActionBtnStyle: React.CSSProperties = {
  ...btnBase,
};

export function CompareIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="6" height="16" rx="1" />
      <rect x="14" y="4" width="6" height="16" rx="1" />
    </svg>
  );
}

export function FullscreenIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

export function DownloadIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
