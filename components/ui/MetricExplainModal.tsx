'use client';

import React from 'react';

interface MetricExplainModalProps {
  open: boolean;
  onClose: () => void;
  result: string | null;
  loading: boolean;
  error: string | null;
}

export default function MetricExplainModal({
  open,
  onClose,
  result,
  loading,
  error,
}: MetricExplainModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI metric explanation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          padding: 20,
          color: 'var(--text-primary)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ fontSize: '1rem' }}>Explain with AI</strong>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '1.25rem',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        {loading && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Generating explanation…</div>
        )}
        {error && (
          <div style={{ color: 'var(--error)', fontSize: '0.9rem' }}>{error}</div>
        )}
        {!loading && !error && result && (
          <div
            style={{
              fontSize: '0.9rem',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              color: 'var(--text-secondary)',
            }}
          >
            {result}
          </div>
        )}
      </div>
    </div>
  );
}
