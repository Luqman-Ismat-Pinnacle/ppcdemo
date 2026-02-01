'use client';

/**
 * TableCompareExport – Puts Compare and Export Excel in chart header when inside ChartCard,
 * or in top-right when not. Opens SnapshotComparisonModal on Compare and downloads Excel on Export.
 */

import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import SnapshotComparisonModal from './SnapshotComparisonModal';
import { useChartHeaderActions } from '@/components/charts/ChartCard';

interface TableCompareExportProps {
  visualId: string;
  visualTitle: string;
  /** Row data for compare modal and Excel export (array of plain objects) */
  data: Record<string, unknown>[] | any[];
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const buttonBaseStyle: React.CSSProperties = {
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
};

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
          style={buttonBaseStyle}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Compare
        </button>
        <button
          type="button"
          className="chart-action-btn"
          onClick={(e) => { e.stopPropagation(); handleExportExcel(); }}
          title="Export to Excel"
          style={buttonBaseStyle}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export
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
        style={buttonBaseStyle}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Compare
      </button>
      <button
        type="button"
        className="chart-action-btn"
        onClick={(e) => { e.stopPropagation(); handleExportExcel(); }}
        title="Export to Excel"
        style={buttonBaseStyle}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export
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
      {isCompareOpen && (
        <SnapshotComparisonModal
          isOpen={isCompareOpen}
          onClose={() => setIsCompareOpen(false)}
          visualId={visualId}
          visualTitle={visualTitle}
          visualType="table"
          currentData={dataArray}
        />
      )}
    </div>
  );
}
