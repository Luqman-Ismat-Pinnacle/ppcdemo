'use client';

/**
 * @fileoverview Reusable mapping suggestions panel for PCA/PCL mapping workflows.
 */

import React from 'react';

export type MappingSuggestionItem = {
  id: number;
  hourEntryId: string;
  taskId: string;
  confidence: number;
  status: 'pending' | 'applied' | 'dismissed';
  hoursDate: string | null;
  hoursQuantity: number | null;
  taskName: string | null;
  reasoning: string | null;
};

interface MappingSuggestionPanelProps {
  loading: boolean;
  suggestions: MappingSuggestionItem[];
  onApply: (id: number) => void;
  onDismiss: (id: number) => void;
}

export default function MappingSuggestionPanel({
  loading,
  suggestions,
  onApply,
  onDismiss,
}: MappingSuggestionPanelProps) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 90px 120px 180px 150px', gap: '0.5rem', padding: '0.55rem 0.7rem', fontSize: '0.68rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
        <span>Hour Entry</span>
        <span>Task</span>
        <span>Confidence</span>
        <span>Status</span>
        <span>Reasoning</span>
        <span>Actions</span>
      </div>
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading suggestions...</div>
        ) : suggestions.length === 0 ? (
          <div style={{ padding: '0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No suggestions for current filter.</div>
        ) : suggestions.map((row) => (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 90px 120px 180px 150px', gap: '0.5rem', padding: '0.6rem 0.7rem', borderBottom: '1px solid var(--border-color)', alignItems: 'center', fontSize: '0.76rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{row.hourEntryId}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.taskName || row.taskId}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.66rem' }}>{row.hoursDate || 'n/a'} · {row.hoursQuantity ?? 0}h</div>
            </div>
            <span>{Number(row.confidence || 0).toFixed(2)}</span>
            <span>{row.status}</span>
            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.reasoning || 'n/a'}</span>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              <button type="button" disabled={row.status !== 'pending'} onClick={() => onApply(row.id)} style={{ padding: '0.26rem 0.46rem', borderRadius: 6, border: '1px solid var(--border-color)', background: row.status === 'pending' ? 'var(--bg-secondary)' : 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: row.status === 'pending' ? 'pointer' : 'not-allowed' }}>Apply</button>
              <button type="button" disabled={row.status !== 'pending'} onClick={() => onDismiss(row.id)} style={{ padding: '0.26rem 0.46rem', borderRadius: 6, border: '1px solid var(--border-color)', background: row.status === 'pending' ? 'var(--bg-secondary)' : 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: row.status === 'pending' ? 'pointer' : 'not-allowed' }}>Dismiss</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

