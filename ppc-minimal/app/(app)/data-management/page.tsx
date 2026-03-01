'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { TABLE_DEFS, type TableDef, type ColumnDef } from '@/lib/table-schema';
import Skeleton from '@/components/ui/Skeleton';

type Row = Record<string, unknown>;
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 100;

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatCell(val: unknown, col: ColumnDef): string {
  if (val === null || val === undefined) return '';
  if (col.type === 'boolean') return val ? 'Yes' : 'No';
  if (col.type === 'date') return String(val).slice(0, 10);
  if (col.type === 'number') {
    const n = Number(val);
    return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(val);
  }
  return String(val);
}

function toDateInputValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  const raw = String(val).trim();
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseCSV(text: string): Row[] {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Row = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
}

function rowsToCSV(rows: Row[], columns: ColumnDef[]): string {
  const keys = columns.map(c => c.key);
  const header = keys.join(',');
  const lines = rows.map(r => keys.map(k => {
    const v = r[k];
    const s = v === null || v === undefined ? '' : String(v);
    return s.includes(',') ? `"${s}"` : s;
  }).join(','));
  return [header, ...lines].join('\n');
}

function compareCellValues(a: unknown, b: unknown, col: ColumnDef): number {
  const aNull = a === null || a === undefined || a === '';
  const bNull = b === null || b === undefined || b === '';
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;

  if (col.type === 'number' || col.type === 'readonly') {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  }
  if (col.type === 'boolean') {
    return (a ? 1 : 0) - (b ? 1 : 0);
  }
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
}

function ColumnFilterDropdown({
  col,
  value,
  onChange,
  onClose,
}: {
  col: ColumnDef;
  value: string;
  onChange: (val: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        zIndex: 100,
        minWidth: 180,
        padding: '0.5rem',
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius-sm)',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      }}
      onClick={e => e.stopPropagation()}
    >
      <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>
        Filter: {col.label}
      </label>
      <input
        ref={inputRef}
        type="text"
        placeholder="Type to filter…"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '0.35rem 0.5rem',
          fontSize: '0.75rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--glass-border)',
          background: 'rgba(255,255,255,0.04)',
          color: 'var(--text-primary)',
          outline: 'none',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          style={{
            marginTop: '0.35rem',
            fontSize: '0.68rem',
            color: 'var(--color-error)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}

export default function DataManagementPage() {
  const [activeTable, setActiveTable] = useState(TABLE_DEFS[0].key);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edits, setEdits] = useState<Map<string, Row>>(new Map());
  const [newRows, setNewRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const tableDef = TABLE_DEFS.find(t => t.key === activeTable) as TableDef;

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tables/${activeTable}?limit=2000`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Fetch failed' });
    } finally {
      setLoading(false);
    }
  }, [activeTable]);

  useEffect(() => {
    setEdits(new Map());
    setNewRows([]);
    setSelected(new Set());
    setSearch('');
    setSortCol(null);
    setSortDir('asc');
    setColumnFilters({});
    setOpenFilter(null);
    setVisibleCount(PAGE_SIZE);
    fetchRows();
  }, [activeTable, fetchRows]);

  const handleEdit = (id: string, key: string, value: unknown) => {
    setEdits(prev => {
      const next = new Map(prev);
      const existing = next.get(id) || {};
      next.set(id, { ...existing, [key]: value });
      return next;
    });
  };

  const handleNewRowEdit = (idx: number, key: string, value: unknown) => {
    setNewRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  };

  const handleAddRow = () => {
    const row: Row = { id: genId() };
    tableDef.columns.forEach(c => {
      if (c.key === 'id') return;
      if (c.type === 'boolean') row[c.key] = true;
      else if (c.type === 'number') row[c.key] = 0;
      else row[c.key] = '';
    });
    setNewRows(prev => [...prev, row]);
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const toSave: Row[] = [];
      edits.forEach((patch, id) => {
        const original = rows.find(r => r.id === id);
        if (original) toSave.push({ ...original, ...patch });
      });
      newRows.forEach(r => { if (r.id) toSave.push(r); });

      if (toSave.length === 0) {
        setMsg({ type: 'ok', text: 'Nothing to save.' });
        setSaving(false);
        return;
      }

      const res = await fetch(`/api/tables/${activeTable}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSave),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setEdits(new Map());
      setNewRows([]);
      setMsg({ type: 'ok', text: `Saved ${data.count} rows.` });
      fetchRows();
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    setMsg(null);
    try {
      const newRowIds = new Set(newRows.map(r => String(r.id)));
      const serverIds = [...selected].filter(id => !newRowIds.has(id));
      setNewRows(prev => prev.filter(r => !selected.has(String(r.id))));

      for (const id of serverIds) {
        await fetch(`/api/tables/${activeTable}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      }
      setSelected(new Set());
      setMsg({ type: 'ok', text: `Deleted ${selected.size} rows.` });
      fetchRows();
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Delete failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const csv = rowsToCSV(rows, tableDef.columns);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${activeTable}.csv`;
    a.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = parseCSV(reader.result as string);
        if (parsed.length === 0) { setMsg({ type: 'err', text: 'Empty CSV.' }); return; }
        const res = await fetch(`/api/tables/${activeTable}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setMsg({ type: 'ok', text: `Imported ${data.count} rows.` });
        fetchRows();
      } catch (err: unknown) {
        setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Import failed' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const getCellValue = useCallback((row: Row, key: string) => {
    const id = String(row.id);
    const isNew = newRows.some(nr => String(nr.id) === id);
    if (isNew) return row[key];
    const patch = edits.get(id);
    return patch && key in patch ? patch[key] : row[key];
  }, [edits, newRows]);

  const handleSort = (colKey: string) => {
    if (sortCol === colKey) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(colKey);
      setSortDir('asc');
    }
    setVisibleCount(PAGE_SIZE);
  };

  const setColumnFilter = useCallback((colKey: string, value: string) => {
    setColumnFilters(prev => {
      const next = { ...prev };
      if (value) next[colKey] = value;
      else delete next[colKey];
      return next;
    });
    setVisibleCount(PAGE_SIZE);
  }, []);

  const activeFilterCount = Object.keys(columnFilters).length;

  const processedRows = useMemo(() => {
    const allRows = [...rows, ...newRows];

    let result = allRows;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))
      );
    }

    const filterEntries = Object.entries(columnFilters);
    if (filterEntries.length > 0) {
      result = result.filter(r =>
        filterEntries.every(([colKey, filterVal]) => {
          const cellVal = getCellValue(r, colKey);
          return String(cellVal ?? '').toLowerCase().includes(filterVal.toLowerCase());
        })
      );
    }

    if (sortCol) {
      const col = tableDef.columns.find(c => c.key === sortCol);
      if (col) {
        result = [...result].sort((a, b) => {
          const av = getCellValue(a, sortCol);
          const bv = getCellValue(b, sortCol);
          const cmp = compareCellValues(av, bv, col);
          return sortDir === 'asc' ? cmp : -cmp;
        });
      }
    }

    return result;
  }, [rows, newRows, search, columnFilters, sortCol, sortDir, tableDef.columns, getCellValue]);

  const visibleRows = useMemo(
    () => processedRows.slice(0, visibleCount),
    [processedRows, visibleCount]
  );

  const hasMore = visibleCount < processedRows.length;

  const handleLoadMore = () => {
    setVisibleCount(prev => Math.min(prev + PAGE_SIZE, processedRows.length));
  };

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const handleScroll = useCallback(() => {
    const el = tableContainerRef.current;
    if (!el || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      setVisibleCount(prev => Math.min(prev + PAGE_SIZE, processedRows.length));
    }
  }, [hasMore, processedRows.length]);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const getNewRowIndex = (row: Row): number => {
    const id = String(row.id);
    return newRows.findIndex(nr => String(nr.id) === id);
  };

  return (
    <div>
      <h1 className="page-title">Data Management</h1>
      <p className="page-subtitle">
        Direct CRUD on all tables. {total} rows in {tableDef.label}.
        {processedRows.length !== (rows.length + newRows.length) && (
          <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
            ({processedRows.length} shown after filters)
          </span>
        )}
      </p>

      {msg && (
        <div style={{
          padding: '0.5rem 0.75rem', marginBottom: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem',
          background: msg.type === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          color: msg.type === 'ok' ? 'var(--color-success)' : 'var(--color-error)',
          border: `1px solid ${msg.type === 'ok' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
        }}>
          {msg.text}
        </div>
      )}

      {/* Table selector */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {TABLE_DEFS.map(t => (
          <button key={t.key} className={`btn${activeTable === t.key ? ' btn-accent' : ''}`}
            onClick={() => setActiveTable(t.key)} style={{ fontSize: '0.72rem', padding: '0.35rem 0.65rem' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <input
          placeholder="Search rows…"
          value={search}
          onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
          style={{
            flex: 1, minWidth: 160, padding: '0.4rem 0.65rem', fontSize: '0.78rem',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)',
            background: 'var(--glass-bg)', color: 'var(--text-primary)',
          }}
        />
        <button className="btn btn-accent" onClick={handleAddRow}>+ Add Row</button>
        <button className="btn" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="btn btn-danger" onClick={handleDelete} disabled={selected.size === 0}>Delete ({selected.size})</button>
        <button className="btn" onClick={handleExport}>Export CSV</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import CSV</button>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
        {activeFilterCount > 0 && (
          <button
            className="btn"
            onClick={() => { setColumnFilters({}); setOpenFilter(null); setVisibleCount(PAGE_SIZE); }}
            style={{ fontSize: '0.7rem', color: 'var(--color-error)' }}
          >
            Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={32} />)}
        </div>
      ) : (
        <>
          <div
            ref={tableContainerRef}
            className="glass-solid"
            style={{ overflow: 'auto', maxHeight: 'calc(100vh - 320px)' }}
          >
            <table className="dm-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox"
                      checked={processedRows.length > 0 && selected.size === processedRows.length}
                      onChange={e => {
                        if (e.target.checked) setSelected(new Set(processedRows.map(r => String(r.id))));
                        else setSelected(new Set());
                      }}
                    />
                  </th>
                  {tableDef.columns.map(col => {
                    const isSorted = sortCol === col.key;
                    const hasFilter = !!columnFilters[col.key];
                    const isFilterOpen = openFilter === col.key;
                    return (
                      <th key={col.key} style={{ position: 'relative', userSelect: 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <span
                            onClick={() => handleSort(col.key)}
                            style={{ cursor: 'pointer', flex: 1, whiteSpace: 'nowrap' }}
                          >
                            {col.label}
                            {isSorted && (
                              <span style={{ marginLeft: '0.25rem', fontSize: '0.65rem', opacity: 0.85 }}>
                                {sortDir === 'asc' ? '▲' : '▼'}
                              </span>
                            )}
                          </span>
                          <span
                            onClick={e => { e.stopPropagation(); setOpenFilter(isFilterOpen ? null : col.key); }}
                            style={{
                              cursor: 'pointer',
                              fontSize: '0.65rem',
                              opacity: hasFilter ? 1 : 0.35,
                              color: hasFilter ? 'var(--color-success)' : 'var(--text-muted)',
                              lineHeight: 1,
                              padding: '2px',
                              flexShrink: 0,
                            }}
                            title={`Filter ${col.label}`}
                          >
                            ⧩
                          </span>
                        </div>
                        {isFilterOpen && (
                          <ColumnFilterDropdown
                            col={col}
                            value={columnFilters[col.key] || ''}
                            onChange={val => setColumnFilter(col.key, val)}
                            onClose={() => setOpenFilter(null)}
                          />
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(row => {
                  const id = String(row.id);
                  const newIdx = getNewRowIndex(row);
                  const isNew = newIdx >= 0;
                  return (
                    <tr key={id} style={isNew ? { background: 'rgba(16,185,129,0.06)' } : undefined}>
                      <td>
                        <input type="checkbox" checked={selected.has(id)} onChange={e => {
                          const next = new Set(selected);
                          e.target.checked ? next.add(id) : next.delete(id);
                          setSelected(next);
                        }} />
                      </td>
                      {tableDef.columns.map(col => {
                        const val = getCellValue(row, col.key);
                        const editable = col.editable !== false && col.type !== 'readonly';
                        if (!editable) return <td key={col.key} style={{ color: 'var(--text-muted)' }}>{formatCell(val, col)}</td>;

                        if (col.type === 'boolean') {
                          return (
                            <td key={col.key}>
                              <input type="checkbox" checked={!!val}
                                onChange={e => isNew ? handleNewRowEdit(newIdx, col.key, e.target.checked) : handleEdit(id, col.key, e.target.checked)} />
                            </td>
                          );
                        }

                        return (
                          <td key={col.key}>
                            <input
                              type={col.type === 'date' ? 'date' : col.type === 'number' ? 'number' : 'text'}
                              value={col.type === 'date' ? toDateInputValue(val) : (val === null || val === undefined ? '' : String(val))}
                              onChange={e => {
                                const v = col.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value;
                                isNew ? handleNewRowEdit(newIdx, col.key, v) : handleEdit(id, col.key, v);
                              }}
                              style={{ minWidth: col.type === 'date' ? 120 : 80 }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {visibleRows.length === 0 && (
                  <tr><td colSpan={tableDef.columns.length + 1} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No rows.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination info + Load more */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)',
          }}>
            <span>
              Showing {visibleRows.length} of {processedRows.length} row{processedRows.length !== 1 ? 's' : ''}
              {activeFilterCount > 0 && ` (${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active)`}
            </span>
            {hasMore && (
              <button className="btn" onClick={handleLoadMore} style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}>
                Load more ({Math.min(PAGE_SIZE, processedRows.length - visibleCount)} rows)
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
