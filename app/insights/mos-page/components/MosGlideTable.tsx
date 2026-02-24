'use client';

import React, { useMemo, useState } from 'react';
import DataEditor, { EditableGridCell, GridCell, GridCellKind, GridColumn, Theme } from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';

type CellValue = string | number | null | undefined;

interface MosGlideTableProps {
  columns: string[];
  rows: CellValue[][];
  height?: number;
  onRowClick?: (row: number) => void;
  minColumnWidth?: number;
  editableColumns?: number[];
  onTextCellEdited?: (row: number, col: number, value: string) => void;
}

const gridTheme: Partial<Theme> = {
  accentColor: '#10B981',
  accentFg: '#00120d',
  textDark: '#f4f4f5',
  textMedium: '#d4d4d8',
  textLight: '#a1a1aa',
  textHeader: '#ffffff',
  textGroupHeader: '#ffffff',
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

export default function MosGlideTable({
  columns,
  rows,
  height = 320,
  onRowClick,
  minColumnWidth = 140,
  editableColumns = [],
  onTextCellEdited,
}: MosGlideTableProps) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const gridColumns = useMemo<GridColumn[]>(() => {
    return columns.map((name) => ({
      id: name,
      title: name,
      width: columnWidths[name] || Math.max(minColumnWidth, Math.min(520, name.length * 12 + 100)),
      grow: 1,
    }));
  }, [columns, columnWidths, minColumnWidth]);

  const getCellContent = React.useCallback(
    ([col, row]: readonly [number, number]): GridCell => {
      const raw = rows[row]?.[col];
      const text = raw == null ? '' : String(raw);
      const editable = editableColumns.includes(col);
      return {
        kind: GridCellKind.Text,
        data: text,
        displayData: text,
        allowOverlay: true,
        readonly: !editable,
      };
    },
    [rows, editableColumns]
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
        overscrollX={120}
        theme={gridTheme}
        onCellClicked={onRowClick ? (cell) => {
          if (editableColumns.includes(cell[0])) return;
          onRowClick(cell[1]);
        } : undefined}
        onCellEdited={onTextCellEdited ? (item, value: EditableGridCell) => {
          if (value.kind !== GridCellKind.Text) return;
          const [col, row] = item;
          onTextCellEdited(row, col, value.data || '');
        } : undefined}
        onColumnResize={(column, newSize) => {
          const key = String(column.id || column.title || '');
          if (!key) return;
          setColumnWidths((prev) => ({ ...prev, [key]: Math.max(minColumnWidth, Math.round(newSize)) }));
        }}
      />
    </div>
  );
}
