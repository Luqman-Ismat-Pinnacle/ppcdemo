'use client';

import React, { useState } from 'react';
import type { MetricProvenance } from '@/lib/calculations/types';

interface MetricProvenanceChipProps {
  provenance: MetricProvenance;
}

export default function MetricProvenanceChip({ provenance }: MetricProvenanceChipProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Formula ${provenance.id}`}
        style={{
          border: '1px solid var(--border-color)',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-muted)',
          borderRadius: 999,
          fontSize: '0.62rem',
          lineHeight: 1.2,
          padding: '2px 8px',
          cursor: 'pointer',
          marginLeft: 6,
          whiteSpace: 'nowrap',
        }}
      >
        {provenance.id}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong>{provenance.label}</strong>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                Close
              </button>
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
