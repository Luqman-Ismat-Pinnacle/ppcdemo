'use client';

/**
 * Consolidated Status & Logs Dropdown
 * Combines Database status, Workday sync, and Engine/Change logs in one dropdown.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  const [syncMethod, setSyncMethod] = useState<'current' | 'stream'>('current');
  const [workdayLogs, setWorkdayLogs] = useState<string[]>([]);

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
    pushLog(`Starting Full Workday Sync (${syncMethod === 'stream' ? 'Stream' : 'Current'} method)...`);

    try {
      if (syncMethod === 'stream') {
        pushLog('Requesting Unified Sync (stream)...');
        const { success } = await runWorkdaySyncStream({
          syncType: 'unified',
          onEvent: (ev) => {
            if (ev.type === 'step') {
              if (ev.status === 'started') pushLog(`Step: ${ev.step} started`);
              if (ev.status === 'chunk') pushLog(`Hours chunk ${ev.chunk}/${ev.totalChunks} (${ev.startDate}–${ev.endDate})`);
              if (ev.status === 'chunk_done') pushLog(`Hours chunk ${ev.chunk}/${ev.totalChunks} done`);
              if (ev.status === 'done') pushLog(`Step: ${ev.step} done`);
            }
            if (ev.type === 'error') pushLog(`Error: ${ev.error}`);
            if (ev.type === 'done' && ev.logs) ev.logs.forEach((l: string) => pushLog(l));
          },
        });
        setWorkdayStatus(success ? 'success' : 'error');
        setWorkdayMessage(success ? 'Sync Complete' : 'Sync Failed');
        pushLog(success ? '--- Full Sync Completed Successfully ---' : '--- Sync Failed ---');
      } else {
        pushLog('Requesting Unified Sync (current)...');
        const data = await runSyncStep('unified', {}, pushLog);
        setWorkdayStatus('success');
        setWorkdayMessage(data?.summary?.noNewHours ? 'No new hour data in date range.' : 'Sync Complete');
        pushLog('--- Full Sync Completed Successfully ---');
      }
      addEngineLog('Workday', logEntries);
      await refreshData();
    } catch (err: any) {
      setWorkdayStatus('error');
      setWorkdayMessage('Sync Failed');
      pushLog(`Sync Aborted: ${err.message}`);
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

  const getDbColor = (s: ConnectionStatus) => s === 'connected' ? '#10B981' : s === 'degraded' ? '#F59E0B' : '#EF4444';
  const workdayColor = workdayStatus === 'success' ? '#10B981' : workdayStatus === 'error' ? '#EF4444' : '#6B7280';
  const engineLogsByEngine = useMemo(() => {
    const order = ['CPM', 'Actuals', 'Workday'];
    const map = new Map<string, typeof engineLogs>();
    engineLogs.forEach(entry => {
      const name = entry.engine || 'Other';
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(entry);
    });
    const ordered: { engine: string; entries: typeof engineLogs }[] = [];
    order.forEach(e => { if (map.has(e)) ordered.push({ engine: e, entries: map.get(e)! }); });
    map.forEach((entries, e) => { if (!order.includes(e)) ordered.push({ engine: e, entries }); });
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
              background: dbStatus ? getDbColor(dbStatus.status) : '#6B7280',
              boxShadow: dbChecking ? '0 0 6px #3B82F6' : undefined,
              animation: dbChecking ? 'pulse 1s infinite' : undefined,
            }}
          />
          <span>System Health</span>
          {totalLogCount > 0 && (
            <span style={{ fontSize: '0.7rem', background: 'var(--accent-color)', color: 'white', padding: '2px 6px', borderRadius: '10px' }}>
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
          width: '400px',
          maxWidth: '95vw',
          maxHeight: '75vh',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
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
                padding: '10px 16px',
                fontSize: '0.8rem',
                fontWeight: 600,
                background: activeTab === 'logs' ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                color: activeTab === 'logs' ? 'var(--text-primary)' : 'var(--text-muted)',
                border: 'none',
                cursor: 'pointer',
                borderBottom: activeTab === 'logs' ? '2px solid var(--pinnacle-teal)' : '2px solid transparent',
              }}
            >
              Logs {totalLogCount > 0 && `(${totalLogCount})`}
            </button>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
            {activeTab === 'status' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Database Status */}
                <section>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Database</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dbStatus ? getDbColor(dbStatus.status) : '#6B7280' }} />
                    <span>{dbStatus?.status === 'connected' ? 'Connected' : dbStatus?.status === 'degraded' ? 'Degraded' : 'Disconnected'}</span>
                    {dbStatus?.latency != null && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{dbStatus.latency}ms</span>}
                    <button onClick={checkDbConnection} disabled={dbChecking} style={{ fontSize: '0.7rem', padding: '4px 8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: dbChecking ? 'wait' : 'pointer' }}>Refresh</button>
                  </div>
                </section>

                {/* Workday Sync */}
                <section>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Workday Sync</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: workdaySyncing ? '#3B82F6' : workdayColor }} />
                    <span style={{ fontSize: '0.8rem' }}>{workdaySyncing ? 'Syncing...' : workdayStatus === 'idle' ? 'Ready' : workdayStatus}</span>
                  </div>
                  <select
                    value={syncMethod}
                    onChange={(e) => setSyncMethod(e.target.value as 'current' | 'stream')}
                    disabled={workdaySyncing}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', marginBottom: '8px' }}
                  >
                    <option value="current">Current (sequential)</option>
                    <option value="stream">Stream (chunked, stable)</option>
                  </select>
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
                    <div style={{ marginTop: '8px', padding: '8px', borderRadius: '4px', background: workdayStatus === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: workdayStatus === 'success' ? '#10B981' : '#EF4444', fontSize: '0.75rem' }}>
                      {workdayMessage}
                    </div>
                  )}
                  {workdayLogs.length > 0 && (
                    <div style={{ marginTop: '8px', maxHeight: '120px', overflow: 'auto', fontSize: '0.65rem', fontFamily: 'monospace', background: 'var(--bg-primary)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                      {workdayLogs.slice(0, 10).map((l, i) => <div key={i} style={{ marginBottom: '2px' }}>{l}</div>)}
                    </div>
                  )}
                </section>
              </div>
            )}

            {activeTab === 'logs' && (
              <div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  {engineLogs.length > 0 && <button onClick={clearEngineLogs} className="logs-dropdown-clear">Clear engines</button>}
                  {changeLogs.length > 0 && <button onClick={clearChangeLogs} className="logs-dropdown-clear">Clear changes</button>}
                </div>
                {engineLogsByEngine.map(({ engine, entries }) => (
                  <section key={engine} style={{ marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '6px' }}>{engine} ({entries.length})</h4>
                    {entries.slice(0, 12).map(entry => (
                      <div key={entry.id} style={{ marginBottom: '8px', padding: '6px 8px', background: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '0.7rem' }}>
                        <div style={{ marginBottom: '4px', color: 'var(--text-muted)' }}>{formatLogTime(entry.createdAt)}</div>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.65rem' }}>{entry.lines.join('\n')}</pre>
                      </div>
                    ))}
                  </section>
                ))}
                <section>
                  <h4 style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '6px' }}>Change Logs ({changeLogs.length})</h4>
                  {changeLogs.length === 0 ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No change logs yet.</div>
                  ) : (
                    changeLogs.slice(0, 12).map(entry => (
                      <div key={entry.id} style={{ marginBottom: '6px', padding: '6px 8px', background: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '0.7rem' }}>
                        <div>{entry.description}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{entry.user} · {entry.entityType} · {formatLogTime(entry.timestamp)}</div>
                      </div>
                    ))
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
