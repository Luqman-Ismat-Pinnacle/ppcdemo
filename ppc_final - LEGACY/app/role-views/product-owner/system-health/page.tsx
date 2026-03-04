'use client';

/**
 * @fileoverview Product Owner system health console.
 *
 * Consolidates what used to live in the header System Health dropdown into a
 * dedicated operational page: DB connectivity, Workday sync/schedule, alerts,
 * and local run logs.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { runWorkdaySyncStream, type WorkdayStreamEvent } from '@/lib/workday-sync-stream';
import { useData } from '@/lib/data-context';
import { useLogs } from '@/lib/logs-context';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';
import SectionHeader from '@/components/ui/SectionHeader';

type AlertRow = {
  id: number;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  source: string;
  createdAt: string;
};

type DbStatus = {
  status: 'connected' | 'disconnected' | string;
  latency: number | null;
  lastChecked: string;
  error?: string;
};

function lineFromWorkdayEvent(event: WorkdayStreamEvent): string {
  if (event.type === 'step') {
    if (event.status === 'started') return `Starting: ${event.step}`;
    if (event.status === 'done') return `Done: ${event.step}`;
    if (event.status === 'chunk') return `Chunk ${event.chunk || 0}/${event.totalChunks || 0}: ${event.startDate || '?'} to ${event.endDate || '?'}`;
    if (event.status === 'chunk_done') return `Chunk complete ${event.chunk || 0}/${event.totalChunks || 0}`;
  }
  if (event.type === 'error') return `Error: ${event.error}`;
  if (event.type === 'done') return event.success ? 'Sync complete' : 'Sync completed with errors';
  return 'Sync event';
}

export default function ProductOwnerSystemHealthPage() {
  const { activeRole } = useRoleView();
  const { user } = useUser();
  const { refreshData } = useData();
  const { engineLogs, addEngineLog } = useLogs();
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [dbChecking, setDbChecking] = useState(false);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [scanRunning, setScanRunning] = useState(false);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncDaysBack, setSyncDaysBack] = useState(7);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [scheduleHour, setScheduleHour] = useState(2);
  const [scheduleMinute, setScheduleMinute] = useState(0);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleLastRun, setScheduleLastRun] = useState<string | null>(null);
  const [computedAt, setComputedAt] = useState<string | null>(null);

  const checkDb = useCallback(async () => {
    setDbChecking(true);
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.error || `Status ${response.status}`));
      setDbStatus(payload);
    } catch (error) {
      setDbStatus({
        status: 'disconnected',
        latency: null,
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Failed to check DB',
      });
    } finally {
      setDbChecking(false);
      setComputedAt(new Date().toISOString());
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const response = await fetch('/api/alerts?status=open&limit=100', {
        cache: 'no-store',
        headers: {
          'x-role-view': activeRole.key,
          'x-actor-email': user?.email || '',
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || 'Failed to load alerts'));
      setAlerts(Array.isArray(payload.alerts) ? payload.alerts : []);
    } catch {
      setAlerts([]);
    } finally {
      setAlertsLoading(false);
      setComputedAt(new Date().toISOString());
    }
  }, [activeRole.key, user?.email]);

  const loadSchedule = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/workday-schedule', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (typeof payload.hour === 'number') setScheduleHour(payload.hour);
      if (typeof payload.minute === 'number') setScheduleMinute(payload.minute);
      setScheduleLastRun(payload.lastRunAt ? String(payload.lastRunAt) : null);
    } catch {
      // ignore schedule load errors; keep current values
    }
  }, []);

  useEffect(() => {
    if (!user?.canViewAll) return;
    void checkDb();
    void loadAlerts();
    void loadSchedule();
  }, [checkDb, loadAlerts, loadSchedule, user?.canViewAll]);

  const runWorkdaySync = async () => {
    if (syncRunning) return;
    setSyncRunning(true);
    setSyncLogs([]);
    setSyncMessage('');
    addEngineLog('workday', [`Starting Workday sync (${syncDaysBack}d window)`]);
    const result = await runWorkdaySyncStream({
      syncType: 'unified',
      hoursDaysBack: syncDaysBack,
      onEvent: (event) => {
        const line = lineFromWorkdayEvent(event);
        setSyncLogs((prev) => [...prev, line].slice(-500));
        addEngineLog('workday', [line]);
      },
    });
    if (result.success) {
      setSyncMessage('Workday sync completed successfully.');
      await refreshData();
      await loadAlerts();
      await checkDb();
    } else {
      setSyncMessage('Workday sync completed with errors.');
    }
    setSyncRunning(false);
  };

  const runAlertScan = async () => {
    if (scanRunning) return;
    setScanRunning(true);
    try {
      await fetch('/api/alerts/scan', { method: 'POST' });
      await loadAlerts();
    } finally {
      setScanRunning(false);
    }
  };

  const acknowledgeAlert = async (id: number) => {
    await fetch('/api/alerts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'acknowledged' }),
    });
    await loadAlerts();
  };

  const saveSchedule = async () => {
    setScheduleSaving(true);
    try {
      await fetch('/api/settings/workday-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hour: scheduleHour, minute: scheduleMinute }),
      });
      await loadSchedule();
    } finally {
      setScheduleSaving(false);
    }
  };

  const criticalCount = useMemo(() => alerts.filter((alert) => alert.severity === 'critical').length, [alerts]);
  const warningCount = useMemo(() => alerts.filter((alert) => alert.severity === 'warning').length, [alerts]);

  if (!user?.canViewAll) {
    return <div className="page-panel">System Health is restricted to Product Owner access.</div>;
  }

  return (
    <div className="page-panel" style={{ display: 'grid', gap: '0.8rem' }}>
      <SectionHeader title="System Health Command Console" timestamp={computedAt} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Database</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: dbStatus?.status === 'connected' ? '#10B981' : '#EF4444' }}>
            {dbStatus?.status || (dbChecking ? 'Checking...' : 'Unknown')}
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
            {dbStatus?.latency != null ? `Latency ${dbStatus.latency}ms` : (dbStatus?.error || 'No latency data')}
          </div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Open Alerts</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{alerts.length}</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Critical {criticalCount} · Warning {warningCount}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Workday Schedule (UTC)</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{String(scheduleHour).padStart(2, '0')}:{String(scheduleMinute).padStart(2, '0')}</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
            {scheduleLastRun ? `Last run ${new Date(scheduleLastRun).toLocaleString()}` : 'No run history'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.1fr)', gap: '0.75rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem', display: 'grid', gap: '0.6rem' }}>
          <SectionHeader title="Workday Sync" />
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Hours days back:
              <input
                type="number"
                min={1}
                max={365}
                value={syncDaysBack}
                onChange={(event) => setSyncDaysBack(Math.max(1, Number(event.target.value) || 7))}
                style={{ marginLeft: 8, width: 90 }}
              />
            </label>
            <button type="button" disabled={syncRunning} onClick={() => { void runWorkdaySync(); }} className="btn btn-primary">
              {syncRunning ? 'Syncing...' : 'Run Sync'}
            </button>
            <button type="button" onClick={() => { void checkDb(); }} className="btn btn-secondary">Check DB</button>
          </div>
          {syncMessage ? <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{syncMessage}</div> : null}
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 10, padding: '0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>
            {(syncLogs.length ? syncLogs : ['No sync run yet.']).map((line, index) => (
              <div key={`${line}-${index}`} style={{ marginBottom: 2 }}>{line}</div>
            ))}
          </div>
        </div>

        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem', display: 'grid', gap: '0.6rem' }}>
          <SectionHeader title="Sync Schedule (UTC)" />
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Hour
              <input type="number" min={0} max={23} value={scheduleHour} onChange={(event) => setScheduleHour(Math.max(0, Math.min(23, Number(event.target.value) || 0)))} style={{ marginLeft: 8, width: 72 }} />
            </label>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Minute
              <input type="number" min={0} max={59} value={scheduleMinute} onChange={(event) => setScheduleMinute(Math.max(0, Math.min(59, Number(event.target.value) || 0)))} style={{ marginLeft: 8, width: 72 }} />
            </label>
            <button type="button" disabled={scheduleSaving} onClick={() => { void saveSchedule(); }} className="btn btn-secondary">
              {scheduleSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
          <SectionHeader title="Alerts Queue" />
          <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" disabled={alertsLoading} onClick={() => { void loadAlerts(); }}>
              {alertsLoading ? 'Refreshing...' : 'Refresh Alerts'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={scanRunning} onClick={() => { void runAlertScan(); }}>
              {scanRunning ? 'Scanning...' : 'Run Alert Scan'}
            </button>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 10 }}>
            {alerts.length === 0 ? (
              <div style={{ padding: '0.7rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>No open alerts.</div>
            ) : alerts.map((alert) => (
              <div key={alert.id} style={{ padding: '0.55rem 0.65rem', borderBottom: '1px solid var(--border-color)', display: 'grid', gap: '0.2rem' }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: alert.severity === 'critical' ? '#EF4444' : alert.severity === 'warning' ? '#F59E0B' : 'var(--text-primary)' }}>
                  {alert.title}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{alert.message}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{new Date(alert.createdAt).toLocaleString()}</span>
                  <button type="button" onClick={() => { void acknowledgeAlert(alert.id); }} style={{ fontSize: '0.66rem' }}>Acknowledge</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem', display: 'grid', gap: '0.55rem' }}>
        <SectionHeader title="Engine + Sync Logs" />
        <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.5rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
          {engineLogs.length === 0 ? (
            <div>No engine logs captured yet.</div>
          ) : (
            engineLogs.slice(0, 250).map((log) => (
              <div key={log.id} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                  [{new Date(log.createdAt).toLocaleTimeString()}] {log.engine}
                </div>
                {log.lines.map((line, index) => (
                  <div key={`${log.id}-${index}`}>{line}</div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
