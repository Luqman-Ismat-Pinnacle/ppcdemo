'use client';

/**
 * @fileoverview Table with Snapshot Support
 * 
 * Wrapper component for tables that adds snapshot functionality
 */

import React, { useState } from 'react';
import SnapshotComparisonModal from './SnapshotComparisonModal';
import CompareButton from './CompareButton';

interface TableWithSnapshotProps {
  visualId: string;
  visualTitle: string;
  data: any[];
  columns?: string[];
  renderTable: (data: any[]) => React.ReactNode;
  showCompareButton?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export default function TableWithSnapshot({
  visualId,
  visualTitle,
  data,
  columns,
  renderTable,
  showCompareButton = true,
  style,
  className = '',
}: TableWithSnapshotProps) {
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);

  return (
    <div style={{ position: 'relative', ...style }} className={className}>
      {showCompareButton && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            zIndex: 10,
          }}
        >
          <CompareButton
            onClick={() => setIsComparisonOpen(true)}
          />
        </div>
      )}
      <div style={{ paddingTop: showCompareButton ? '40px' : '0' }}>
        {renderTable(data)}
      </div>
      {isComparisonOpen && (
        <SnapshotComparisonModal
          isOpen={isComparisonOpen}
          onClose={() => setIsComparisonOpen(false)}
          visualId={visualId}
          visualTitle={visualTitle}
          visualType="table"
          currentData={data}
        />
      )}
    </div>
  );
}
