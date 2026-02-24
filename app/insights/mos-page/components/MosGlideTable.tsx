'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import DataEditor, { EditableGridCell, GridCell, GridCellKind, GridColumn, Item, Theme } from '@glideapps/glide-data-grid';
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
  headerFontStyle: '700 13px var(--font-montserrat, sans-serif)',
  baseFontStyle: '600 13px var(--font-montserrat, sans-serif)',
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
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostWidth, setHostWidth] = useState(0);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [activeEditCell, setActiveEditCell] = useState<Item | null>(null);
  const [savedCell, setSavedCell] = useState<Item | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setHostWidth(Math.max(0, Math.floor(el.getBoundingClientRect().width)));
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const gridColumns = useMemo<GridColumn[]>(() => {
    const usable = Math.max(0, hostWidth - 2);
    const equalWidth = columns.length > 0 ? Math.floor(usable / columns.length) : minColumnWidth;
    return columns.map((name) => ({
      id: name,
      title: name,
      width: columnWidths[name] || Math.max(minColumnWidth, equalWidth || Math.min(520, name.length * 12 + 100)),
      grow: 1,
    }));
  }, [columns, columnWidths, minColumnWidth, hostWidth]);

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

  const drawCell = React.useCallback((args: any, drawContent: () => void) => {
    const { ctx, rect, col, row } = args;
    const isEditable = editableColumns.includes(col);
    const isActiveEdit = isEditable && !!activeEditCell && activeEditCell[0] === col && activeEditCell[1] === row;
    const isSaved = !!savedCell && savedCell[0] === col && savedCell[1] === row;

    if (isSaved) {
      ctx.fillStyle = 'rgba(16,185,129,0.26)';
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    } else if (isActiveEdit) {
      ctx.fillStyle = 'rgba(59,130,246,0.18)';
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    } else if (isEditable) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }

    drawContent();
  }, [editableColumns, activeEditCell, savedCell]);

  return (
    <div ref={hostRef} style={{ width: '100%', height, border: '1px solid #2f2f35', borderRadius: 10, overflow: 'hidden' }}>
      <DataEditor
        columns={gridColumns}
        rows={rows.length}
        getCellContent={getCellContent}
        rowHeight={36}
        headerHeight={38}
        drawCell={drawCell}
        smoothScrollX
        smoothScrollY
        verticalBorder
        overscrollX={0}
        theme={gridTheme}
        onCellActivated={(cell) => {
          if (editableColumns.includes(cell[0])) setActiveEditCell(cell);
          else setActiveEditCell(null);
        }}
        onCellClicked={onRowClick ? (cell) => {
          if (editableColumns.includes(cell[0])) return;
          onRowClick(cell[1]);
        } : undefined}
        onCellEdited={onTextCellEdited ? (item, value: EditableGridCell) => {
          if (value.kind !== GridCellKind.Text) return;
          const [col, row] = item;
          onTextCellEdited(row, col, value.data || '');
          setSavedCell(item);
          setTimeout(() => setSavedCell((prev) => (prev && prev[0] === item[0] && prev[1] === item[1] ? null : prev)), 800);
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
