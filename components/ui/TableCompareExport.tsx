'use client';

/**
 * TableCompareExport – Compare, Fullscreen, Export in chart header.
 * Icon-only buttons matching chart visuals. Opens SnapshotComparisonModal on Compare.
 * Portals modal to document.body (like ChartWrapper) so it renders above all content.
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import SnapshotComparisonModal from './SnapshotComparisonModal';
import { useChartHeaderActions } from '@/components/charts/ChartCard';
import { CompareIcon, FullscreenIcon, DownloadIcon } from './ChartActionIcons';

interface TableCompareExportProps {
  visualId: string;
  visualTitle: string;
  /** Row data for compare modal and Excel export (array of plain objects) */
  data: Record<string, unknown>[] | any[];
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function TableCompareExport({
  visualId,
  visualTitle,
  data,
  children,
  className = '',
  style,
}: TableCompareExportProps) {
  const setHeaderActions = useChartHeaderActions();
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const dataArray = Array.isArray(data) ? data : [];
  const dataRef = useRef(dataArray);
  dataRef.current = dataArray;

  const handleExportExcel = () => {
    const arr = dataRef.current;
    if (arr.length === 0) return;
    const wb = XLSX.utils.book_new();
    const safeName = (s: string) => s.replace(/[\\/*?:\[\]]/g, '_').slice(0, 31);
    const ws = XLSX.utils.json_to_sheet(arr);
    XLSX.utils.book_append_sheet(wb, ws, safeName(visualTitle));
    XLSX.writeFile(wb, `${visualId}-${Date.now()}.xlsx`);
  };

  useEffect(() => {
    if (!setHeaderActions) return;
    const buttons = (
      <>
        <button
          type="button"
          className="chart-action-btn"
          onClick={(e) => { e.stopPropagation(); setIsCompareOpen(true); }}
          title="Compare with snapshots"
        >
          <CompareIcon size={14} />
        </button>
        <button
          type="button"
          className="chart-action-btn"
          onClick={(e) => { e.stopPropagation(); setIsFullscreenOpen(true); }}
          title="Fullscreen"
        >
          <FullscreenIcon size={14} />
        </button>
        <button
          type="button"
          className="chart-action-btn"
          onClick={(e) => { e.stopPropagation(); handleExportExcel(); }}
          title="Export to Excel"
        >
          <DownloadIcon size={14} />
        </button>
      </>
    );
    setHeaderActions(buttons);
    return () => setHeaderActions(null);
  }, [setHeaderActions, visualId, visualTitle]);

  const buttonsEl = (
    <>
      <button
        type="button"
        className="chart-action-btn"
        onClick={(e) => { e.stopPropagation(); setIsCompareOpen(true); }}
        title="Compare with snapshots"
      >
        <CompareIcon size={14} />
      </button>
      <button
        type="button"
        className="chart-action-btn"
        onClick={(e) => { e.stopPropagation(); setIsFullscreenOpen(true); }}
        title="Fullscreen"
      >
        <FullscreenIcon size={14} />
      </button>
      <button
        type="button"
        className="chart-action-btn"
        onClick={(e) => { e.stopPropagation(); handleExportExcel(); }}
        title="Export to Excel"
      >
        <DownloadIcon size={14} />
      </button>
    </>
  );

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', ...style }} className={className}>
      {!setHeaderActions && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 10,
            display: 'flex',
            gap: 8,
          }}
        >
          {buttonsEl}
        </div>
      )}
      <div style={{ 
        paddingTop: !setHeaderActions ? 48 : 0,
        flex: 1,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {children}
      </div>
      {isCompareOpen && typeof document !== 'undefined' && createPortal(
        <SnapshotComparisonModal
          isOpen={isCompareOpen}
          onClose={() => setIsCompareOpen(false)}
          visualId={visualId}
          visualTitle={visualTitle}
          visualType="table"
          currentData={dataArray}
        />,
        document.body
      )}
      {isFullscreenOpen && (
        <div
          role="dialog"
          aria-label={`${visualTitle} fullscreen`}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(0,0,0,0.9)',
          }}
          onClick={() => setIsFullscreenOpen(false)}
        >
          <div style={{ flex: 1, overflow: 'auto', padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-color)', overflow: 'auto' }}>
              {children}
            </div>
          </div>
          <div style={{ padding: 12, borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="chart-action-btn"
              onClick={() => setIsFullscreenOpen(false)}
              title="Close"
            >
              <span style={{ fontSize: 18 }}>×</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
