'use client';

/**
 * Snapshot Comparison Modal – simplified side‑by‑side compare.
 * Uses only visual snapshots for this visual; ECharts in both panels, scaled to fit.
 * Styled to match site chart-card containers.
 */

import React, { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import type { EChartsOption } from 'echarts';
import { useData } from '@/lib/data-context';

interface SnapshotComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  visualId: string;
  visualTitle: string;
  visualType: 'chart' | 'table';
  currentData: any;
  onRenderChart?: (container: HTMLDivElement, option: EChartsOption) => any;
  filters?: any;
}

type SnapshotItem = {
  id: string;
  name: string;
  date: string;
  data: any;
};

const CONTENT_HEIGHT = 'min(65vh, 600px)';

export default function SnapshotComparisonModal({
  isOpen,
  onClose,
  visualId,
  visualTitle,
  visualType,
  currentData,
  onRenderChart,
}: SnapshotComparisonModalProps) {
  const { data, updateData } = useData();
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const currentChartRef = useRef<any>(null);
  const snapshotChartRef = useRef<any>(null);
  const currentContainerRef = useRef<HTMLDivElement | null>(null);
  const snapshotContainerRef = useRef<HTMLDivElement | null>(null);

  // Use full data.visualSnapshots (not filteredData) so list isn't affected by hierarchy filter
  const snapshots = useMemo((): SnapshotItem[] => {
    const raw = (data?.visualSnapshots || []) as any[];
    const list = raw
      .filter((s: any) => (s.visualId || s.visual_id) === visualId)
      .map((s: any) => ({
        id: s.id,
        name: s.snapshotName || s.snapshot_name || s.snapshotDate || s.snapshot_date || 'Snapshot',
        date: s.createdAt || s.created_at || s.snapshotDate || s.snapshot_date || '',
        data: s.data,
      }));
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [visualId, data?.visualSnapshots]);

  const selectedSnapshot = useMemo(
    () => (selectedSnapshotId ? snapshots.find((s) => s.id === selectedSnapshotId) : null),
    [selectedSnapshotId, snapshots]
  );

  // Render current (left) chart – use useLayoutEffect so container ref is set before we init chart
  useLayoutEffect(() => {
    if (!isOpen || visualType !== 'chart' || !onRenderChart || currentData == null) return;
    const container = currentContainerRef.current;
    if (!container) return;
    const chart = onRenderChart(container, currentData as EChartsOption);
    currentChartRef.current = chart;
    const ro = new ResizeObserver(() => chart?.resize?.());
    ro.observe(container);
    return () => {
      ro.disconnect();
      if (chart?.dispose) chart.dispose();
      currentChartRef.current = null;
    };
  }, [isOpen, visualType, currentData, onRenderChart]);

  // Render snapshot (right) chart when one is selected
  useEffect(() => {
    if (!isOpen || visualType !== 'chart' || !onRenderChart || !selectedSnapshot?.data) {
      if (snapshotChartRef.current?.dispose) snapshotChartRef.current.dispose();
      snapshotChartRef.current = null;
      return;
    }
    const container = snapshotContainerRef.current;
    if (!container) return;
    const chart = onRenderChart(container, selectedSnapshot.data as EChartsOption);
    snapshotChartRef.current = chart;
    const ro = new ResizeObserver(() => chart?.resize?.());
    ro.observe(container);
    return () => {
      ro.disconnect();
      if (chart?.dispose) chart.dispose();
      snapshotChartRef.current = null;
    };
  }, [isOpen, visualType, selectedSnapshot, onRenderChart]);

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!confirm('Delete this snapshot?')) return;
    try {
      const res = await fetch('/api/data/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataKey: 'visualSnapshots',
          operation: 'delete',
          records: [snapshotId],
        }),
      });
      const result = await res.json();
      if (result.success) {
        const updated = (data?.visualSnapshots || []).filter((s: any) => s.id !== snapshotId);
        updateData({ visualSnapshots: updated });
        if (selectedSnapshotId === snapshotId) setSelectedSnapshotId(null);
      } else {
        alert(result.error || 'Delete failed');
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!isOpen) return null;

  const cardStyle = {
    background: 'rgba(26, 26, 30, 0.6)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden' as const,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  };

  const headerStyle = {
    padding: '1rem 1.25rem',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    display: 'flex' as const,
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  return (
    <div
      className="snapshot-compare-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px) saturate(120%)',
        WebkitBackdropFilter: 'blur(12px) saturate(120%)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        className="chart-card"
        style={{
          width: '100%',
          maxWidth: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'rgba(20, 20, 24, 0.75)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ ...headerStyle, background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <h2 className="chart-card-title" style={{ margin: 0, fontSize: '1.25rem' }}>
              {visualTitle}
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Compare with snapshot · {snapshots.length} saved
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: 8,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '1.25rem',
              lineHeight: 1,
              width: 36,
              height: 36,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Controls */}
        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Snapshot:
          </label>
          <select
            value={selectedSnapshotId ?? ''}
            onChange={(e) => setSelectedSnapshotId(e.target.value || null)}
            style={{
              padding: '8px 12px',
              minWidth: 260,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            <option value="">Select snapshot…</option>
            {snapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.date ? new Date(s.date).toLocaleDateString() : '—'}
              </option>
            ))}
          </select>
        </div>

        {/* Content – side‑by‑side only; equal height so ECharts scale to fit both */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: '1.25rem',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            alignContent: 'stretch',
          }}
        >
          {/* Left: Current */}
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={headerStyle}>
              <h3 className="chart-card-title" style={{ margin: 0, fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--pinnacle-teal)' }} />
                Current
              </h3>
            </div>
            <div className="chart-card-body" style={{ flex: 1, minHeight: 0, padding: '1rem', display: 'flex', flexDirection: 'column' }}>
              {visualType === 'chart' ? (
                currentData != null ? (
                  <div
                    ref={(el) => { currentContainerRef.current = el; }}
                    style={{ width: '100%', height: CONTENT_HEIGHT, minHeight: 320 }}
                  />
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', minHeight: 320 }}>
                    Current chart not available for compare
                  </div>
                )
              ) : (
                <div style={{ maxHeight: 400, overflow: 'auto' }}>
                  {renderTable(Array.isArray(currentData) ? currentData : [])}
                </div>
              )}
            </div>
          </div>

          {/* Right: Snapshot */}
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={headerStyle}>
              <h3 className="chart-card-title" style={{ margin: 0, fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--pinnacle-orange)' }} />
                {selectedSnapshot ? selectedSnapshot.name : 'Snapshot'}
              </h3>
              {selectedSnapshot && (
                <button
                  type="button"
                  onClick={() => handleDeleteSnapshot(selectedSnapshot.id)}
                  style={{
                    padding: '4px 10px',
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-error)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  Delete
                </button>
              )}
            </div>
            <div className="chart-card-body" style={{ flex: 1, minHeight: 0, padding: '1rem', display: 'flex', flexDirection: 'column' }}>
              {!selectedSnapshot ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Select a snapshot to compare
                </div>
              ) : visualType === 'chart' ? (
                <div
                  ref={(el) => { snapshotContainerRef.current = el; }}
                  style={{ width: '100%', height: CONTENT_HEIGHT, minHeight: 320 }}
                />
              ) : (
                <div style={{ maxHeight: 400, overflow: 'auto' }}>
                  {renderTable(Array.isArray(selectedSnapshot.data) ? selectedSnapshot.data : [])}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderTable(data: any[]) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        No data
      </div>
    );
  }
  const columns = Object.keys(data[0]);
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
          {columns.map((col) => (
            <th
              key={col}
              style={{
                padding: '10px 8px',
                textAlign: 'left',
                fontWeight: 600,
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
              }}
            >
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.slice(0, 100).map((row, idx) => (
          <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
            {columns.map((col) => {
              const val = row[col];
              const str = val == null ? '' : String(val);
              const isPercent = typeof val === 'number' && (col.toLowerCase().includes('percent') || col.toLowerCase().includes('%') || col === 'efficiency' || col === 'metricsRatio' || col === 'passRate');
              const display = isPercent ? `${Number(Number(val).toFixed(2))}%` : str;
              return (
                <td key={col} style={{ padding: '8px', color: 'var(--text-secondary)' }}>
                  {display}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
