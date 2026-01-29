'use client';

/**
 * @fileoverview Snapshot Button Component
 * 
 * Button component for capturing snapshots of visuals (charts/tables)
 */

import React, { useState } from 'react';

interface SnapshotButtonProps {
  visualId: string;
  visualTitle: string;
  visualType: 'chart' | 'table';
  onCapture?: (snapshotName: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function SnapshotButton({
  visualId,
  visualTitle,
  visualType,
  onCapture,
  className = '',
  style,
}: SnapshotButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');

  const handleCapture = () => {
    if (!snapshotName.trim()) {
      alert('Please enter a snapshot name');
      return;
    }

    if (onCapture) {
      onCapture(snapshotName.trim());
    }
    
    setSnapshotName('');
    setIsOpen(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }} className={className}>
      <button
        onClick={() => setIsOpen(!isOpen)}
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
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-tertiary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--bg-secondary)';
        }}
        title="Capture snapshot"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v6m6-6v6M3 9h6m-6 6h6" />
        </svg>
        Snapshot
      </button>

      {isOpen && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 9998,
            }}
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              padding: '16px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
              zIndex: 9999,
              minWidth: '300px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.875rem', fontWeight: 600 }}>
              Capture Snapshot
            </h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {visualTitle}
            </p>
            <input
              type="text"
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              placeholder="Snapshot name (e.g., 'Baseline', 'Week 1')"
              style={{
                width: '100%',
                padding: '8px',
                marginBottom: '12px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCapture();
                } else if (e.key === 'Escape') {
                  setIsOpen(false);
                }
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  padding: '6px 12px',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCapture}
                style={{
                  padding: '6px 12px',
                  background: 'var(--pinnacle-teal)',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#000',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                Capture
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
