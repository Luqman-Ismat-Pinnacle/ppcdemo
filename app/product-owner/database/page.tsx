'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type TableInfo = { name: string; rowCount: number; totalSize: string; indexSize: string };
type ColumnInfo = { column_name: string; data_type: string; is_nullable: string; column_default: string | null; character_maximum_length: number | null };

const TABLE_GROUPS: Record<string, string[]> = {
  'Core': ['employees', 'portfolios', 'customers', 'sites', 'projects'],
  'WBS': ['units', 'phases', 'tasks', 'sub_tasks', 'epics', 'features'],
  'Operations': ['hour_entries', 'customer_contracts', 'project_documents', 'workday_phases'],
  'Planning': ['sprints', 'sprint_tasks', 'qc_logs', 'intervention_items'],
  'System': ['notifications', 'variance_notes', 'feedback_items', 'integration_connections'],
};

export default function DatabaseExplorerPage() {
  const [stats, setStats] = useState<{ databaseSize: string; tables: TableInfo[] } | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSchema, setShowSchema] = useState(false);

  const PAGE_SIZE = 50;

  useEffect(() => {
    fetch('/api/product-owner/database?table=__stats', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.success) setStats(d); else setError(d.error); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const loadTable = useCallback(async (table: string, pg: number, srch: string) => {
    setTableLoading(true);
    setError(null);
    try {
      const [dataRes, colRes] = await Promise.all([
        fetch(`/api/product-owner/database?table=${table}&limit=${PAGE_SIZE}&offset=${pg * PAGE_SIZE}${srch ? `&search=${encodeURIComponent(srch)}` : ''}`, { cache: 'no-store' }),
        fetch(`/api/product-owner/database?table=__columns&name=${table}`, { cache: 'no-store' }),
      ]);
      const [data, colData] = await Promise.all([dataRes.json(), colRes.json()]);
      if (data.success) { setRows(data.rows); setTotal(data.total); }
      if (colData.success) setColumns(colData.columns);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load table');
    } finally {
      setTableLoading(false);
    }
  }, []);

  const selectTable = (name: string) => {
    setSelectedTable(name);
    setPage(0);
    setSearch('');
    setSearchInput('');
    setShowSchema(false);
    loadTable(name, 0, '');
  };

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(0);
    if (selectedTable) loadTable(selectedTable, 0, searchInput);
  };

  const goPage = (p: number) => {
    setPage(p);
    if (selectedTable) loadTable(selectedTable, p, search);
  };

  const totalRows = useMemo(() => stats?.tables.reduce((s, t) => s + t.rowCount, 0) ?? 0, [stats]);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const visibleCols = useMemo(() => {
    if (rows.length === 0) return [];
    return Object.keys(rows[0]);
  }, [rows]);

  const formatCell = (val: unknown): string => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'object') return JSON.stringify(val).slice(0, 120);
    const str = String(val);
    return str.length > 100 ? str.slice(0, 100) + '...' : str;
  };

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Database Explorer</h1>
          <p className="page-subtitle">Browse tables, inspect schema, and view data across all {stats?.tables.length ?? 0} tables.</p>
        </div>
        {stats && (
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <KpiPill label="DB Size" value={stats.databaseSize} accent="#8B5CF6" />
            <KpiPill label="Tables" value={String(stats.tables.length)} accent="#3B82F6" />
            <KpiPill label="Total Rows" value={totalRows.toLocaleString()} accent="#10B981" />
          </div>
        )}
      </div>

      {error && (
        <div style={{ border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.74rem' }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#FCA5A5', cursor: 'pointer' }}>&times;</button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '2rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>Loading database stats...</div>
      ) : (
        <div style={{ display: 'flex', gap: '0.7rem', minHeight: 'calc(100vh - 200px)' }}>
          {/* Sidebar: Table list grouped */}
          <div style={{ width: 240, flexShrink: 0, overflow: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
            {Object.entries(TABLE_GROUPS).map(([group, tables]) => (
              <div key={group} style={{ marginBottom: '0.6rem' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.2rem 0.4rem', marginBottom: 2 }}>
                  {group}
                </div>
                {tables.map(t => {
                  const info = stats?.tables.find(x => x.name === t);
                  const active = selectedTable === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => selectTable(t)}
                      style={{
                        display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.3rem 0.5rem', borderRadius: 7, border: 'none', cursor: 'pointer',
                        background: active ? 'rgba(64,224,208,0.12)' : 'transparent',
                        color: active ? 'var(--pinnacle-teal)' : 'var(--text-secondary)',
                        fontSize: '0.7rem', fontWeight: active ? 700 : 500, marginBottom: 1,
                        transition: 'background 0.1s',
                      }}
                    >
                      <span>{t}</span>
                      <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {info ? info.rowCount.toLocaleString() : '?'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Main: table data */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {!selectedTable ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                  {stats?.tables.map(t => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => selectTable(t.name)}
                      className="glass"
                      style={{ padding: '0.6rem 0.7rem', cursor: 'pointer', textAlign: 'left', border: 'none', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 4 }}
                    >
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t.name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                        <span>{t.rowCount.toLocaleString()} rows</span>
                        <span>{t.totalSize}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button onClick={() => setSelectedTable(null)} style={{ ...pillBtn, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                    &larr; All Tables
                  </button>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedTable}</span>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>({total.toLocaleString()} rows)</span>
                  <button onClick={() => setShowSchema(!showSchema)} style={{ ...pillBtn, background: showSchema ? 'rgba(64,224,208,0.15)' : 'var(--bg-secondary)', color: showSchema ? 'var(--pinnacle-teal)' : 'var(--text-secondary)' }}>
                    Schema
                  </button>
                  <div style={{ flex: 1 }} />
                  <input
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="Search text columns..."
                    style={{ border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: 7, padding: '0.25rem 0.5rem', fontSize: '0.68rem', width: 200 }}
                  />
                  <button onClick={handleSearch} style={pillBtn}>Search</button>
                </div>

                {/* Schema panel */}
                {showSchema && columns.length > 0 && (
                  <div className="glass" style={{ padding: '0.6rem', overflow: 'auto', maxHeight: 220 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.65rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(148,163,184,.15)' }}>
                          {['Column', 'Type', 'Nullable', 'Default', 'Max Length'].map(h => (
                            <th key={h} style={{ textAlign: 'left', color: '#94a3b8', fontWeight: 600, padding: '0.3rem 0.4rem' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {columns.map(c => (
                          <tr key={c.column_name} style={{ borderBottom: '1px solid rgba(148,163,184,.06)' }}>
                            <td style={{ padding: '0.25rem 0.4rem', fontWeight: 600, color: 'var(--text-primary)' }}>{c.column_name}</td>
                            <td style={{ padding: '0.25rem 0.4rem', color: '#8B5CF6' }}>{c.data_type}</td>
                            <td style={{ padding: '0.25rem 0.4rem', color: c.is_nullable === 'YES' ? '#F59E0B' : '#10B981' }}>{c.is_nullable}</td>
                            <td style={{ padding: '0.25rem 0.4rem', color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.column_default || '—'}</td>
                            <td style={{ padding: '0.25rem 0.4rem', color: 'var(--text-muted)' }}>{c.character_maximum_length ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Data table */}
                {tableLoading ? (
                  <div style={{ padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.76rem' }}>Loading...</div>
                ) : (
                  <div style={{ overflow: 'auto', flex: 1, maxHeight: 'calc(100vh - 340px)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.64rem', whiteSpace: 'nowrap' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(148,163,184,.15)', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                          {visibleCols.map(col => (
                            <th key={col} style={{ textAlign: 'left', color: '#94a3b8', fontWeight: 600, padding: '0.3rem 0.45rem', maxWidth: 180 }}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr><td colSpan={visibleCols.length} style={{ padding: '1rem', color: 'var(--text-muted)', textAlign: 'center' }}>No rows found.</td></tr>
                        ) : rows.map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(148,163,184,.05)' }}>
                            {visibleCols.map(col => (
                              <td key={col} style={{ padding: '0.25rem 0.45rem', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={String(row[col] ?? '')}>
                                {formatCell(row[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.3rem 0' }}>
                    <button onClick={() => goPage(page - 1)} disabled={page === 0} style={pillBtn}>Prev</button>
                    <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                      Page {page + 1} of {totalPages}
                    </span>
                    <button onClick={() => goPage(page + 1)} disabled={page >= totalPages - 1} style={pillBtn}>Next</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiPill({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.55rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
      <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: accent }}>{value}</span>
    </div>
  );
}

const pillBtn: React.CSSProperties = {
  border: '1px solid var(--border-color)', borderRadius: 7,
  padding: '0.22rem 0.5rem', fontSize: '0.64rem', fontWeight: 600,
  cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
};
