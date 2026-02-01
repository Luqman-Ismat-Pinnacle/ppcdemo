'use client';

/**
 * Snapshot Comparison Modal – simplified side‑by‑side compare.
 * Uses only visual snapshots for this visual; ECharts in both panels, scaled to fit.
 * Styled to match site chart-card containers.
 * Full viewport fill, PNG export, Excel export.
 */

import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import type { EChartsOption } from 'echarts';
import { useData } from '@/lib/data-context';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { generateId } from '@/lib/database-schema';

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

export default function SnapshotComparisonModal({
  isOpen,
  onClose,
  visualId,
  visualTitle,
  visualType,
  currentData,
  onRenderChart,
}: SnapshotComparisonModalProps) {
  const { data, updateData, saveVisualSnapshot } = useData();
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const currentChartRef = useRef<any>(null);
  const snapshotChartRef = useRef<any>(null);
  const currentContainerRef = useRef<HTMLDivElement | null>(null);
  const snapshotContainerRef = useRef<HTMLDivElement | null>(null);
  const modalContentRef = useRef<HTMLDivElement | null>(null);

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

  const resizeCharts = useCallback(() => {
    currentChartRef.current?.resize?.();
    snapshotChartRef.current?.resize?.();
  }, []);

  // Render current (left) chart – use useLayoutEffect so container ref is set before we init chart
  useLayoutEffect(() => {
    if (!isOpen || visualType !== 'chart' || !onRenderChart || currentData == null) return;
    const container = currentContainerRef.current;
    if (!container) return;
    const chart = onRenderChart(container, currentData as EChartsOption);
    currentChartRef.current = chart;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => chart?.resize?.());
    });
    ro.observe(container);
    // Initial resize after layout settles (containers may have 0 size on first paint)
    const t1 = requestAnimationFrame(() => chart?.resize?.());
    const t2 = setTimeout(() => chart?.resize?.(), 150);
    return () => {
      cancelAnimationFrame(t1);
      clearTimeout(t2);
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
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => chart?.resize?.());
    });
    ro.observe(container);
    const t1 = requestAnimationFrame(() => {
      chart?.resize?.();
      setTimeout(() => chart?.resize?.(), 100);
    });
    return () => {
      cancelAnimationFrame(t1);
      ro.disconnect();
      if (chart?.dispose) chart.dispose();
      snapshotChartRef.current = null;
    };
  }, [isOpen, visualType, selectedSnapshot, onRenderChart]);

  // Resize charts when modal opens or window resizes
  useEffect(() => {
    if (!isOpen) return;
    resizeCharts();
    window.addEventListener('resize', resizeCharts);
    return () => window.removeEventListener('resize', resizeCharts);
  }, [isOpen, resizeCharts]);

  const handleDownloadPng = useCallback(async () => {
    const el = modalContentRef.current;
    if (!el) return;
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: 'rgba(20, 20, 24, 0.95)',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `compare-${visualId}-${Date.now()}.png`;
      a.click();
    } catch (e) {
      console.error('PNG export failed:', e);
    }
  }, [visualId]);

  const extractChartData = (opt: any): Record<string, unknown>[] => {
    if (!opt || typeof opt !== 'object') return [];
    const xAxis = Array.isArray(opt.xAxis) ? opt.xAxis[0] : opt.xAxis;
    const series = opt.series || [];
    if (xAxis?.data && series.length > 0) {
      const categories = xAxis.data as string[];
      return categories.map((cat, i) => {
        const row: Record<string, unknown> = { category: cat };
        series.forEach((s: any) => {
          const val = s.data?.[i];
          row[s.name || 'value'] = val;
        });
        return row;
      });
    }
    if (series[0]?.data && (series[0].type === 'pie' || !xAxis?.data)) {
      return (series[0].data as { name?: string; value?: unknown }[]).map((d) => ({ name: d.name, value: d.value }));
    }
    return [];
  };

  const handleDownloadExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const safeName = (s: string) => s.replace(/[\\/*?:\[\]]/g, '_').slice(0, 31);
    if (visualType === 'table') {
      const currentArr = Array.isArray(currentData) ? currentData : [];
      if (currentArr.length > 0) {
        const ws = XLSX.utils.json_to_sheet(currentArr);
        XLSX.utils.book_append_sheet(wb, ws, safeName('Current'));
      }
      if (selectedSnapshot?.data && Array.isArray(selectedSnapshot.data)) {
        const ws = XLSX.utils.json_to_sheet(selectedSnapshot.data);
        XLSX.utils.book_append_sheet(wb, ws, safeName(selectedSnapshot.name || 'Snapshot'));
      }
    } else {
      const currentRows = extractChartData(currentData);
      if (currentRows.length > 0) {
        const ws = XLSX.utils.json_to_sheet(currentRows);
        XLSX.utils.book_append_sheet(wb, ws, safeName('Current'));
      }
      if (selectedSnapshot?.data) {
        const snapRows = extractChartData(selectedSnapshot.data);
        if (snapRows.length > 0) {
          const ws = XLSX.utils.json_to_sheet(snapRows);
          XLSX.utils.book_append_sheet(wb, ws, safeName(selectedSnapshot.name || 'Snapshot'));
        }
      }
    }
    if (wb.SheetNames.length === 0) return;
    XLSX.writeFile(wb, `compare-${visualId}-${Date.now()}.xlsx`);
  }, [visualType, currentData, selectedSnapshot, visualId]);

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

  const handleCaptureSnapshot = useCallback(async () => {
    const name = prompt('Snapshot name (e.g., Baseline, Week 1):');
    if (!name?.trim()) return;
    const snapshot = {
      id: generateId('VSN'),
      visualId,
      visualType,
      visualTitle,
      snapshotName: name.trim(),
      snapshotDate: new Date().toISOString().split('T')[0],
      data: visualType === 'chart' ? currentData : (Array.isArray(currentData) ? currentData : []),
      metadata: {},
      createdAt: new Date().toISOString(),
      createdBy: 'User',
    };
    const ok = await saveVisualSnapshot(snapshot);
    if (ok) {
      setSelectedSnapshotId(snapshot.id);
    } else {
      alert('Failed to save snapshot.');
    }
  }, [visualId, visualType, visualTitle, currentData, saveVisualSnapshot]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [isOpen]);

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
        width: '100vw',
        height: '100dvh',
        maxHeight: '100vh',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px) saturate(120%)',
        WebkitBackdropFilter: 'blur(12px) saturate(120%)',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onClick={onClose}
    >
      <div
        ref={(el) => { modalContentRef.current = el; }}
        className="snapshot-compare-modal-inner"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'rgba(20, 20, 24, 0.98)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 0,
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ ...headerStyle, background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <div>
            <h2 className="chart-card-title" style={{ margin: 0, fontSize: '1.25rem' }}>
              {visualTitle}
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Compare with snapshot · {snapshots.length} saved
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={handleDownloadPng}
              style={{
                padding: '8px 14px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.8125rem',
                fontWeight: 500,
              }}
            >
              Download PNG
            </button>
            <button
              type="button"
              onClick={handleDownloadExcel}
              style={{
                padding: '8px 14px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.8125rem',
                fontWeight: 500,
              }}
            >
              Download Excel
            </button>
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
        </div>

        {/* Controls */}
        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)',
            flexShrink: 0,
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
          <button
            type="button"
            onClick={handleCaptureSnapshot}
            style={{
              padding: '8px 14px',
              background: 'var(--pinnacle-teal)',
              color: '#000',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.8125rem',
            }}
          >
            Save current as snapshot
          </button>
        </div>

        {/* Content – side‑by‑side; fills remaining space */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            padding: '1rem',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
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
            <div style={{ flex: 1, minHeight: 0, padding: '1rem', display: 'flex', flexDirection: 'column' }}>
              {visualType === 'chart' ? (
                currentData != null ? (
                  <div
                    ref={(el) => { currentContainerRef.current = el; }}
                    style={{ width: '100%', flex: 1, minHeight: 0 }}
                  />
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    Current chart not available for compare
                  </div>
                )
              ) : (
                <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
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
            <div style={{ flex: 1, minHeight: 0, padding: '1rem', display: 'flex', flexDirection: 'column' }}>
              {!selectedSnapshot ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Select a snapshot to compare
                </div>
              ) : visualType === 'chart' ? (
                <div
                  ref={(el) => { snapshotContainerRef.current = el; }}
                  style={{ width: '100%', flex: 1, minHeight: 0 }}
                />
              ) : (
                <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
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
  const humanize = (s: string) =>
    s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/_/g, ' ').trim();

  return (
    <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
      <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
            {columns.map((col) => (
              <th
                key={col}
                style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: 'var(--pinnacle-teal)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  position: 'sticky',
                  top: 0,
                  background: 'var(--bg-secondary)',
                  zIndex: 5,
                }}
              >
                {humanize(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
              {columns.map((col) => {
                const val = row[col];
                const str = val == null ? '' : String(val);
                const isPercent =
                  typeof val === 'number' &&
                  (col.toLowerCase().includes('percent') ||
                    col.toLowerCase().includes('%') ||
                    col === 'efficiency' ||
                    col === 'metricsRatio' ||
                    col === 'passRate');
                const display = isPercent ? `${Number(Number(val).toFixed(2))}%` : str;
                return (
                  <td key={col} style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
