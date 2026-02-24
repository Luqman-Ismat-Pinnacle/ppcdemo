'use client';

import React, { useMemo } from 'react';
import DataEditor, { GridCell, GridCellKind, GridColumn, Theme } from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';

type CellValue = string | number | null | undefined;

interface MosGlideTableProps {
  columns: string[];
  rows: CellValue[][];
  height?: number;
  onRowClick?: (row: number) => void;
}

const gridTheme: Partial<Theme> = {
  accentColor: '#10B981',
  accentFg: '#00120d',
  textDark: '#f4f4f5',
  textMedium: '#d4d4d8',
  textLight: '#a1a1aa',
  bgIconHeader: '#10B981',
  bgCell: '#111113',
  bgCellMedium: '#16161a',
  bgHeader: '#16161a',
  bgHeaderHasFocus: '#1c1c21',
  bgHeaderHovered: '#1f1f24',
  bgBubble: '#202028',
  bgBubbleSelected: '#10B981',
  borderColor: '#2f2f35',
  horizontalBorderColor: '#24242a',
  drilldownBorder: '#10B981',
  linkColor: '#10B981',
  cellHorizontalPadding: 10,
  cellVerticalPadding: 6,
};

export default function MosGlideTable({ columns, rows, height = 320, onRowClick }: MosGlideTableProps) {
  const gridColumns = useMemo<GridColumn[]>(() => {
    return columns.map((name) => ({
      id: name,
      title: name,
      width: Math.max(120, Math.min(420, name.length * 12 + 90)),
    }));
  }, [columns]);

  const getCellContent = React.useCallback(
    ([col, row]: readonly [number, number]): GridCell => {
      const raw = rows[row]?.[col];
      const text = raw == null ? '' : String(raw);
      return {
        kind: GridCellKind.Text,
        data: text,
        displayData: text,
        allowOverlay: false,
      };
    },
    [rows]
  );

  return (
    <div style={{ width: '100%', height, border: '1px solid #2f2f35', borderRadius: 10, overflow: 'hidden' }}>
      <DataEditor
        columns={gridColumns}
        rows={rows.length}
        getCellContent={getCellContent}
        rowHeight={36}
        headerHeight={38}
        smoothScrollX
        smoothScrollY
        verticalBorder
        theme={gridTheme}
        onCellClicked={onRowClick ? (cell) => onRowClick(cell[1]) : undefined}
      />
    </div>
  );
}
