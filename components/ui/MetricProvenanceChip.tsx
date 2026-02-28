'use client';

import React, { useState } from 'react';
import type { MetricProvenance } from '@/lib/calculations/types';

interface MetricProvenanceChipProps {
  provenance: MetricProvenance;
  /** Optional: current value for "Explain" context (e.g. for AI) */
  value?: string | number | null;
  /** Optional: called when user clicks "Explain" – for AI-assisted explanation */
  onExplain?: (provenance: MetricProvenance, value?: string | number | null) => void;
}

export default function MetricProvenanceChip({ provenance, value, onExplain }: MetricProvenanceChipProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Formula ${provenance.id}`}
        className="metric-provenance-chip"
      >
        <span className="metric-provenance-chip-text">{provenance.id}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
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
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(680px, 100%)',
              maxHeight: '80vh',
              overflowY: 'auto',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 12,
              padding: 16,
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <strong>{provenance.label}</strong>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {onExplain && (
                  <button
                    type="button"
                    onClick={() => { onExplain(provenance, value); setOpen(false); }}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.75rem',
                      background: 'var(--pinnacle-teal)',
                      color: '#000',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Explain with AI
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  Close
                </button>
              </div>
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              Formula: <code>{provenance.trace.formula}</code>
            </div>
            <div style={{ fontSize: '0.8rem', marginBottom: 8 }}>
              Source: {provenance.dataSources.join(', ')} | Scope: {provenance.scope} | Window: {provenance.timeWindow}
            </div>
            <div style={{ fontSize: '0.8rem', marginBottom: 8 }}>
              Computed at: {new Date(provenance.trace.computedAt).toLocaleString()}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong style={{ fontSize: '0.82rem' }}>Inputs</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.8rem' }}>
                {provenance.inputs.map(input => (
                  <li key={input.key}>
                    {input.label}: <code>{String(input.value)}</code>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <strong style={{ fontSize: '0.82rem' }}>Computation Steps</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.8rem' }}>
                {provenance.trace.steps.map(step => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
