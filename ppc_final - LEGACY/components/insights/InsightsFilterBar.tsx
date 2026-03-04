'use client';

/**
 * Filter bar for Insights pages - Power BI style cross-visual filtering.
 * Shows active filters as removable chips and a Clear all button.
 */

import React from 'react';

export interface FilterChip {
  dimension: string;
  value: string;
  label?: string;
}

interface InsightsFilterBarProps {
  filters: FilterChip[];
  onRemove: (dimension: string, value: string) => void;
  onClearAll: () => void;
  emptyMessage?: string;
}

const DIMENSION_LABELS: Record<string, string> = {
  project: 'Project',
  customer: 'Customer',
  status: 'Status',
  gate: 'Gate',
  chargeCode: 'Charge Code',
  role: 'Role',
  employee: 'Employee',
  deliverableType: 'Type',
  chargeType: 'Charge Type',
};

export default function InsightsFilterBar({
  filters,
  onRemove,
  onClearAll,
  emptyMessage = 'Click any chart segment to filter the page',
}: InsightsFilterBarProps) {
  if (filters.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'var(--bg-tertiary)',
          borderRadius: '8px',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          border: '1px dashed var(--border-color)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.7 }}>
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        background: 'var(--bg-tertiary)',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
      }}
    >
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '4px' }}>
        Filters:
      </span>
      {filters.map((f, i) => (
        <span
          key={`${f.dimension}-${f.value}-${i}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            background: 'rgba(64, 224, 208, 0.15)',
            border: '1px solid rgba(64, 224, 208, 0.4)',
            borderRadius: '6px',
            fontSize: '0.8rem',
            color: 'var(--text-primary)',
            fontWeight: 500,
          }}
        >
          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
            {DIMENSION_LABELS[f.dimension] || f.dimension}:
          </span>
          <span>{f.label ?? f.value}</span>
          <button
            type="button"
            onClick={() => onRemove(f.dimension, f.value)}
            aria-label={`Remove filter ${f.value}`}
            style={{
              background: 'none',
              border: 'none',
              padding: '0 2px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '1rem',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        style={{
          marginLeft: '4px',
          padding: '4px 10px',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--pinnacle-teal)',
          background: 'transparent',
          border: '1px solid var(--pinnacle-teal)',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        Clear all
      </button>
    </div>
  );
}
