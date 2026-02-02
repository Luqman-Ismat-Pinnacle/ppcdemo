'use client';

/**
 * Consolidated Status & Logs Dropdown
 * Combines Database status, Workday sync, and Engine/Change logs in one dropdown.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';

/** Humanize technical log messages into user-friendly English */
function humanizeLogLine(line: string): string {
  const raw = line.replace(/^\[\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?\]\s*/i, '').trim();
  // Workday sync
  if (raw.includes('Step: unified started')) return 'Starting full data sync…';
  if (raw.includes('Step: unified done')) return 'Data sync completed';
  if (raw.includes('Step: employees started')) return 'Fetching employees…';
  if (raw.includes('Step: hierarchy started')) return 'Fetching projects and hierarchy…';
  if (raw.includes('Step: hours started')) return 'Fetching hours and costs…';
  if (raw.includes('Hours chunk ') && raw.includes(' done')) {
    const m = raw.match(/Hours chunk (\d+)\/(\d+)/);
    if (m) return `Finished syncing period ${m[1]} of ${m[2]}`;
  }
  if (raw.includes('Hours chunk ') && raw.includes('–')) {
    const m = raw.match(/Hours chunk (\d+)\/(\d+)\s*\(([^–]+)–([^)]+)\)/);
    if (m) {
      const fmt = (s: string) => { try { const d = new Date(s.trim()); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return s; } };
      return `Syncing hours for ${fmt(m[3])} – ${fmt(m[4])} (${m[1]} of ${m[2]})`;
    }
  }
  if (raw.startsWith('--- Step 1:')) return 'Step 1: Fetching employees and portfolios';
  if (raw.startsWith('--- Step 2:')) return 'Step 2: Fetching projects, customers, and sites';
  if (raw.startsWith('--- Step 3:')) return 'Step 3: Fetching hours and cost data';
  if (raw.startsWith('--- Step 4:')) return 'Step 4: Ledger sync skipped (not required)';
  if (/^Synced \d+ employees?\.?$/i.test(raw)) return raw.replace(/^Synced (\d+) employees?\.?$/i, 'Updated $1 employee records');
  if (/^Synced: .+ Portfolios/.test(raw)) return raw.replace(/Synced:/, 'Updated:').replace(/Portfolios/g, 'portfolios').replace(/Customers/g, 'customers').replace(/Sites/g, 'sites').replace(/Projects/g, 'projects');
  if (/^Synced \d+ hour entries/.test(raw)) return raw.replace(/^Synced (\d+) hour entries/, 'Imported $1 hour entries');
  if (raw.includes('No labor transactions') || raw.includes('No new hour data')) return 'No new hour data in the selected date range';
  if (raw.includes('Error in')) return raw.replace(/Error in (\w+) sync:/, 'Could not sync $1:');
  if (raw.includes('Full Sync Completed Successfully')) return 'Sync completed successfully';
  if (raw.includes('Sync Failed') || raw.includes('Sync Aborted')) return raw;
  if (raw.includes('Requesting Unified Sync')) return 'Connecting to Workday…';
  if (raw.includes('Starting Full Workday Sync')) return raw.replace('Starting Full Workday Sync (', 'Starting sync (').replace(' method)...', ' method)');
  // CPM / Schedule
  if (raw.includes('Engine Initialized')) return 'Schedule analysis started';
  if (raw.includes('> Loading ') && raw.includes(' tasks')) return raw.replace('> Loading ', 'Loaded ').replace('...', '');
  if (raw.includes('tasks have predecessor links')) return raw.replace('> ', '').replace(' have predecessor links', ' have dependency links');
  if (raw.includes('Calculation took ')) return raw.replace('> Calculation took ', 'Analysis completed in ').replace('ms', ' ms');
  if (raw.includes('RESULTS SUMMARY:')) return 'Results';
  if (raw.includes('• Duration:')) return raw.replace('• ', '').replace(' (', ' — ');
  if (raw.includes('• Critical Path:')) return raw.replace('• Critical Path: ', '').replace(' tasks identified', ' tasks on critical path');
  if (raw.includes('• Average Float:')) return raw.replace('• Average Float: ', 'Average float: ').replace(' days', ' days');
  if (raw.includes('dangling logic') || raw.includes('open ends')) return raw.replace('! WARNING: ', 'Note: ').replace(' tasks have open ends (dangling logic)', ' tasks may have missing dependency links');
  if (raw.includes('Unlinked:')) return raw.replace('  - Unlinked:', '  • Missing link:');
  if (raw.includes('NOTE: Using project dates')) return 'Using project dates for duration (no dependency links)';
  if (raw.includes('Ledger sync disabled')) return 'Ledger sync skipped';
  if (raw.includes('Hours sync includes cost data')) return 'Hour entries include cost data for schedules';
  return raw;
}
import { useData } from '@/lib/data-context';
import { useLogs } from '@/lib/logs-context';
import { runWorkdaySyncStream } from '@/lib/workday-sync-stream';
import type { ConnectionCheckResult, ConnectionStatus } from '@/lib/supabase';

const REFRESH_INTERVAL = 30000;

export default function StatusAndLogsDropdown() {
  const { refreshData } = useData();
  const { engineLogs, changeLogs, addEngineLog, clearEngineLogs, clearChangeLogs } = useLogs();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'logs'>('status');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Database status
  const [dbStatus, setDbStatus] = useState<ConnectionCheckResult | null>(null);
  const [dbChecking, setDbChecking] = useState(false);

  // Workday status
  const [workdaySyncing, setWorkdaySyncing] = useState(false);
  const [workdayStatus, setWorkdayStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [workdayMessage, setWorkdayMessage] = useState('');
  const [workdayLogs, setWorkdayLogs] = useState<string[]>([]);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; step: string } | null>(null);

  const checkDbConnection = async () => {
    setDbChecking(true);
    try {
      const res = await fetch('/api/status');
      if (res.ok) setDbStatus(await res.json());
      else throw new Error(`Status ${res.status}`);
    } catch (err) {
      setDbStatus({
        status: 'disconnected',
        latency: null,
        lastChecked: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Check failed',
        details: { supabaseConfigured: false, authStatus: 'error', databaseReachable: false },
      });
    }
    setDbChecking(false);
  };

  useEffect(() => {
    checkDbConnection();
    const interval = setInterval(checkDbConnection, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const runSyncStep = async (type: string, payload: any = {}, onLog?: (msg: string) => void) => {
    const log = onLog ?? ((m: string) => setWorkdayLogs(prev => [`[${new Date().toLocaleTimeString()}] ${m}`, ...prev].slice(0, 50)));
    const res = await fetch('/api/workday', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncType: type, ...payload }),
    });
    const data = await res.json();
    if (data.logs?.length) data.logs.forEach((l: string) => log(l));
    if (res.ok && data.success) {
      log(`Success: ${data.summary?.synced ?? data.summary?.total ?? 0} ${type} synced`);
      return data;
    }
    if (data.error) log(`Error: ${data.error}`);
    throw new Error(data.error || `${type} sync failed`);
  };

  const handleWorkdaySync = async () => {
    if (workdaySyncing) return;
    setWorkdaySyncing(true);
    setWorkdayStatus('idle');
    setWorkdayMessage('');
    setWorkdayLogs([]);

    const logEntries: string[] = [];
    const pushLog = (msg: string) => {
      const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
      logEntries.push(entry);
      setWorkdayLogs(prev => [entry, ...prev].slice(0, 50));
    };
    pushLog('Starting sync (streaming)…');
    setSyncProgress(null);

    try {
      pushLog('Connecting to Workday…');
      const { success } = await runWorkdaySyncStream({
        syncType: 'unified',
        onEvent: (ev) => {
          if (ev.type === 'step') {
            if (ev.status === 'started') {
              pushLog(`Step: ${ev.step} started`);
              setSyncProgress({ current: 0, total: ev.totalChunks || 1, step: ev.step });
            }
            if (ev.status === 'chunk') {
              pushLog(`Hours chunk ${ev.chunk}/${ev.totalChunks} (${ev.startDate}–${ev.endDate})`);
              setSyncProgress({ current: ev.chunk || 0, total: ev.totalChunks || 1, step: 'hours' });
            }
            if (ev.status === 'chunk_done') {
              pushLog(`Hours chunk ${ev.chunk}/${ev.totalChunks} done`);
            }
            if (ev.status === 'done') {
              pushLog(`Step: ${ev.step} done`);
              if (ev.step === 'hours') setSyncProgress(null);
            }
          }
          if (ev.type === 'error') pushLog(`Error: ${ev.error}`);
          if (ev.type === 'done' && ev.logs) ev.logs.forEach((l: string) => pushLog(l));
        },
      });
      setSyncProgress(null);
      setWorkdayStatus(success ? 'success' : 'error');
      setWorkdayMessage(success ? 'Sync Complete' : 'Sync Failed');
      pushLog(success ? 'Sync completed successfully' : 'Sync failed');
      addEngineLog('Workday', logEntries);
      await refreshData();
    } catch (err: any) {
      setWorkdayStatus('error');
      setWorkdayMessage('Sync Failed');
      pushLog(`Sync stopped: ${err.message}`);
      addEngineLog('Workday', logEntries);
    } finally {
      setWorkdaySyncing(false);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && !workdaySyncing) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, workdaySyncing]);

  const getDbColor = (s: ConnectionStatus) => s === 'connected' ? 'var(--pinnacle-teal)' : s === 'degraded' ? 'var(--pinnacle-orange)' : 'var(--color-error)';
  const workdayColor = workdayStatus === 'success' ? 'var(--pinnacle-teal)' : workdayStatus === 'error' ? 'var(--color-error)' : 'var(--text-muted)';
  const engineLogsByEngine = useMemo(() => {
    const order = ['CPM', 'Actuals', 'Workday'];
    const engineLabels: Record<string, string> = { CPM: 'Schedule Analysis', Actuals: 'Actuals', Workday: 'Workday Sync' };
    const map = new Map<string, typeof engineLogs>();
    engineLogs.forEach(entry => {
      const name = entry.engine || 'Other';
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(entry);
    });
    const ordered: { engine: string; label: string; entries: typeof engineLogs }[] = [];
    order.forEach(e => { if (map.has(e)) ordered.push({ engine: e, label: engineLabels[e] || e, entries: map.get(e)! }); });
    map.forEach((entries, e) => { if (!order.includes(e)) ordered.push({ engine: e, label: engineLabels[e] || e, entries }); });
    return ordered;
  }, [engineLogs]);

  const formatLogTime = (v: string | undefined) => v ? new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--';
  const totalLogCount = engineLogs.length + changeLogs.length;

  return (
    <div ref={dropdownRef} className="status-and-logs-dropdown" style={{ position: 'relative' }}>
      <button
        className="nav-dropdown-trigger"
        onClick={() => setIsOpen(!isOpen)}
        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        title="System Health & Logs"
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: dbStatus ? getDbColor(dbStatus.status) : 'var(--text-muted)',
              boxShadow: dbChecking ? '0 0 6px #3B82F6' : undefined,
              animation: dbChecking ? 'pulse 1s infinite' : undefined,
            }}
          />
          <span>System Health</span>
            {totalLogCount > 0 && (
            <span style={{ fontSize: '0.7rem', background: 'var(--pinnacle-teal)', color: '#000', padding: '2px 7px', borderRadius: '10px', fontWeight: 600 }}>
              {totalLogCount}
            </span>
          )}
        </span>
        <svg viewBox="0 0 12 12" width="10" height="10">
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>

      {isOpen && (
        <div className="dropdown-container" style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '8px',
          width: '420px',
          maxWidth: '95vw',
          maxHeight: '75vh',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setActiveTab('status')}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: '0.8rem',
                fontWeight: 600,
                background: activeTab === 'status' ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                color: activeTab === 'status' ? 'var(--text-primary)' : 'var(--text-muted)',
                border: 'none',
                cursor: 'pointer',
                borderBottom: activeTab === 'status' ? '2px solid var(--pinnacle-teal)' : '2px solid transparent',
              }}
            >
              Health
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              style={{
                flex: 1,
                padding: '12px 16px',
                fontSize: '0.85rem',
                fontWeight: 600,
                background: activeTab === 'logs' ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                color: activeTab === 'logs' ? 'var(--pinnacle-teal)' : 'var(--text-muted)',
                border: 'none',
                cursor: 'pointer',
                borderBottom: activeTab === 'logs' ? '2px solid var(--pinnacle-teal)' : '2px solid transparent',
              }}
            >
              Activity Log {totalLogCount > 0 && `(${totalLogCount})`}
            </button>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
            {activeTab === 'status' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Database Status */}
                <section>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--pinnacle-teal)', marginBottom: '8px' }}>Database</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dbStatus ? getDbColor(dbStatus.status) : 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{dbStatus?.status === 'connected' ? 'Connected' : dbStatus?.status === 'degraded' ? 'Degraded' : 'Disconnected'}</span>
                    {dbStatus?.latency != null && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{dbStatus.latency} ms</span>}
                    <button onClick={checkDbConnection} disabled={dbChecking} style={{ fontSize: '0.75rem', padding: '6px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', cursor: dbChecking ? 'wait' : 'pointer' }}>Refresh</button>
                  </div>
                </section>

                {/* Workday Sync */}
                <section>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--pinnacle-teal)', marginBottom: '8px' }}>Workday sync</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: workdaySyncing ? 'var(--pinnacle-teal)' : workdayColor }} />
                    <span style={{ fontSize: '0.8rem' }}>{workdaySyncing ? 'Syncing...' : workdayStatus === 'idle' ? 'Ready' : workdayStatus}</span>
                  </div>
                  {syncProgress && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        <span>Syncing {syncProgress.step} data</span>
                        <span>{syncProgress.current} / {syncProgress.total}</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${(syncProgress.current / syncProgress.total) * 100}%`,
                            height: '100%',
                            background: 'var(--pinnacle-teal)',
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <button
                    onClick={handleWorkdaySync}
                    disabled={workdaySyncing}
                    className="nav-dropdown-trigger"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: workdaySyncing ? 'var(--bg-tertiary)' : 'var(--bg-tertiary)',
                      color: workdaySyncing ? 'var(--text-muted)' : 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: workdaySyncing ? 'wait' : 'pointer',
                    }}
                  >
                    {workdaySyncing ? 'Syncing…' : 'Sync Workday Data'}
                  </button>
                  {workdayMessage && (
                    <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: workdayStatus === 'success' ? 'rgba(64,224,208,0.12)' : 'rgba(239,68,68,0.12)', color: workdayStatus === 'success' ? 'var(--pinnacle-teal)' : 'var(--color-error)', fontSize: '0.8rem', borderLeft: `3px solid ${workdayStatus === 'success' ? 'var(--pinnacle-teal)' : 'var(--color-error)'}` }}>
                      {workdayMessage}
                    </div>
                  )}
                  {workdayLogs.length > 0 && (
                    <div style={{ marginTop: '10px', maxHeight: '140px', overflow: 'auto', fontSize: '0.78rem', lineHeight: 1.5, background: 'var(--bg-tertiary)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      {workdayLogs.slice(0, 10).map((l, i) => (
                        <div key={i} style={{ marginBottom: '4px' }}>{humanizeLogLine(l)}</div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {activeTab === 'logs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                  {engineLogs.length > 0 && (
                    <button
                      onClick={clearEngineLogs}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                      }}
                    >
                      Clear activity
                    </button>
                  )}
                  {changeLogs.length > 0 && (
                    <button
                      onClick={clearChangeLogs}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                      }}
                    >
                      Clear changes
                    </button>
                  )}
                </div>
                {engineLogsByEngine.map(({ engine, label, entries }) => (
                  <section key={engine}>
                    <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--pinnacle-teal)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--pinnacle-teal)' }} />
                      {label}
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {entries.slice(0, 12).map(entry => (
                        <div key={entry.id} style={{
                          padding: '10px 12px',
                          background: 'var(--bg-tertiary)',
                          borderRadius: 'var(--radius-sm)',
                          borderLeft: '3px solid var(--pinnacle-teal)',
                          fontSize: '0.8rem',
                          lineHeight: 1.5,
                          color: 'var(--text-primary)',
                        }}>
                          <div style={{ marginBottom: '6px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {formatLogTime(entry.createdAt)}
                          </div>
                          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>
                            {entry.lines.map((l, i) => humanizeLogLine(l)).join('\n')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
                <section>
                  <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--pinnacle-teal)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--pinnacle-lime)' }} />
                    Data changes
                  </h4>
                  {changeLogs.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                      No recent changes
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {changeLogs.slice(0, 12).map(entry => (
                        <div key={entry.id} style={{
                          padding: '10px 12px',
                          background: 'var(--bg-tertiary)',
                          borderRadius: 'var(--radius-sm)',
                          borderLeft: '3px solid var(--pinnacle-lime)',
                          fontSize: '0.8rem',
                        }}>
                          <div style={{ color: 'var(--text-primary)' }}>{entry.description}</div>
                          <div style={{ marginTop: '4px', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                            {entry.user} · {entry.entityType} · {formatLogTime(entry.timestamp)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}
