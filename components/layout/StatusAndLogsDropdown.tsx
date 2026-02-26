'use client';

/**
 * Consolidated Status & Logs Dropdown
 * Combines Database status, Workday sync, and Engine/Change logs in one dropdown.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';

/** Humanize technical log messages into user-friendly English */
function humanizeLogLine(line: string): string {
  // Remove timestamp and emoji prefixes
  const raw = line
    .replace(/^\[\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?\]\s*/i, '')
    .replace(/^(ERROR:|WARNING:|OK:)\s*/, '')
    .trim();
  
  // Already humanized messages (from the new format) - return as-is
  if (raw.startsWith('Starting Workday sync')) return raw;
  if (raw.startsWith('Connecting to Workday')) return raw;
  if (raw.startsWith('Syncing employees')) return 'Fetching employees…';
  if (raw.startsWith('Syncing hierarchy')) return 'Fetching projects and hierarchy…';
  if (raw.startsWith('Syncing hours')) return 'Fetching hours data…';
  if (raw.startsWith('Processing hours:')) {
    const m = raw.match(/Processing hours: ([^ ]+) to ([^ ]+) \((\d+)\/(\d+)\)/);
    if (m) {
      const fmt = (s: string) => { try { const d = new Date(s.trim()); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return s; } };
      return `Syncing ${fmt(m[1])} – ${fmt(m[2])} (${m[3]}/${m[4]})`;
    }
    return raw;
  }
  if (raw.startsWith('Processed ') && raw.includes('hour entries')) return raw;
  if (raw.startsWith('Hours chunk failed')) return raw.replace('Hours chunk failed:', 'Period failed:');
  if (raw.startsWith('Employees sync complete')) return 'Employees updated';
  if (raw.startsWith('Hierarchy sync complete')) return 'Hierarchy updated';
  if (raw.startsWith('Hours:') && raw.includes('total entries')) return raw;
  if (raw.startsWith('All data synced')) return 'All data synced successfully';
  if (raw.startsWith('Sync completed with issues')) return raw;
  if (raw.startsWith('Sync failed')) return raw;
  if (raw.startsWith('Summary:')) return raw.replace('Summary:', 'Final:');
  
  // Legacy format handling
  if (raw.includes('Step: unified started')) return 'Starting full data sync…';
  if (raw.includes('Step: unified done')) return 'Data sync completed';
  if (raw.includes('Step: employees started')) return 'Fetching employees…';
  if (raw.includes('Step: employees done')) return 'Employees updated';
  if (raw.includes('Step: projects started')) return 'Fetching hierarchy…';
  if (raw.includes('Step: projects done')) return 'Hierarchy updated';
  if (raw.includes('Step: hours started')) return 'Fetching hours…';
  if (raw.includes('Step: hours done')) return 'Hours sync complete';
  if (raw.includes('Hours chunk ') && raw.includes(' done')) {
    const m = raw.match(/Hours chunk (\d+)\/(\d+)/);
    if (m) return `Finished period ${m[1]} of ${m[2]}`;
  }
  if (raw.includes('Hours chunk ') && raw.includes('–')) {
    const m = raw.match(/Hours chunk (\d+)\/(\d+)\s*\(([^–]+)–([^)]+)\)/);
    if (m) {
      const fmt = (s: string) => { try { const d = new Date(s.trim()); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return s; } };
      return `Syncing ${fmt(m[3])} – ${fmt(m[4])} (${m[1]}/${m[2]})`;
    }
  }
  if (/^Synced \d+ employees?\.?$/i.test(raw)) return raw.replace(/^Synced (\d+) employees?\.?$/i, 'Updated $1 employees');
  if (/^Synced: .+ Portfolios/.test(raw)) return raw.replace(/Synced:/, 'Updated:').replace(/Portfolios/g, 'portfolios').replace(/Customers/g, 'customers').replace(/Sites/g, 'sites').replace(/Projects/g, 'projects');
  if (/^Synced \d+ hour entries/.test(raw)) return raw.replace(/^Synced (\d+) hour entries/, 'Imported $1 hours');
  if (/employees successfully/i.test(raw)) return raw;
  if (/hierarchy:/i.test(raw)) return raw;
  if (raw.includes('No labor transactions') || raw.includes('No new hour data')) return 'No new hour data found';
  if (raw.includes('Error in')) return raw.replace(/Error in (\w+) sync:/, 'Could not sync $1:');
  if (raw.includes('sync failed:') || raw.includes('sync exception:')) return raw;
  if (raw.includes('Full Sync Completed Successfully')) return 'Sync complete';
  if (raw.includes('Sync Failed') || raw.includes('Sync Aborted')) return raw;
  if (raw.includes('Requesting Unified Sync')) return 'Connecting…';
  if (raw.includes('Starting Full Workday Sync')) return 'Starting sync…';
  
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
  if (raw.includes('NOTE: Using project dates')) return 'Using project dates for duration';
  if (raw.includes('Ledger sync disabled')) return 'Ledger sync skipped';
  if (raw.includes('Hours sync includes cost data')) return 'Hours include cost data';
  
  return raw;
}
import { useData } from '@/lib/data-context';
import { useLogs } from '@/lib/logs-context';
import { runWorkdaySyncStream } from '@/lib/workday-sync-stream';
import type { ConnectionCheckResult, ConnectionStatus } from '@/lib/supabase';

const REFRESH_INTERVAL = 30000;

type AlertStatus = 'open' | 'acknowledged' | 'resolved';

type AlertEvent = {
  id: number;
  severity: 'info' | 'warning' | 'critical';
  eventType: string;
  title: string | null;
  message: string;
  source: string | null;
  status: AlertStatus;
  createdAt: string;
};

function formatRelativeTime(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  if (elapsed < 0) return 'just now';
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

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

  // Hours range for Workday sync (days to pull)
  const [hoursDaysBack, setHoursDaysBack] = useState(7);

  // Scheduled sync (cron) – hour/minute in UTC, saved to app_settings
  const [scheduleHour, setScheduleHour] = useState(2);
  const [scheduleMinute, setScheduleMinute] = useState(0);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [scheduleLastRun, setScheduleLastRun] = useState<string | null>(null);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState('');
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [scanRunning, setScanRunning] = useState(false);
  const [alertActioningId, setAlertActioningId] = useState<number | null>(null);

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

  const loadSchedule = async () => {
    try {
      const res = await fetch('/api/settings/workday-schedule');
      const data = await res.json();
      if (typeof data.hour === 'number') setScheduleHour(data.hour);
      if (typeof data.minute === 'number') setScheduleMinute(data.minute);
      if (data.lastRunAt) setScheduleLastRun(data.lastRunAt);
    } catch (_) { /* ignore */ }
    setScheduleLoaded(true);
  };

  useEffect(() => {
    if (!isOpen) setScheduleLoaded(false);
    else if (isOpen && activeTab === 'status' && !scheduleLoaded) loadSchedule();
  }, [isOpen, activeTab, scheduleLoaded]);

  const saveSchedule = async () => {
    setScheduleSaving(true);
    try {
      const res = await fetch('/api/settings/workday-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hour: scheduleHour, minute: scheduleMinute }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
    } catch (e: any) {
      setWorkdayMessage(e?.message || 'Could not save schedule');
    } finally {
      setScheduleSaving(false);
    }
  };

  const loadAlerts = async (showLoading = false) => {
    if (showLoading) setAlertsLoading(true);
    setAlertsError('');
    try {
      const res = await fetch('/api/alerts?status=open&limit=8', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to load alerts');
      }
      setAlerts(Array.isArray(data.alerts) ? data.alerts as AlertEvent[] : []);
    } catch (err) {
      setAlertsError(err instanceof Error ? err.message : 'Failed to load alerts');
    } finally {
      setAlertsLoaded(true);
      if (showLoading) setAlertsLoading(false);
    }
  };

  const updateAlertStatus = async (id: number, status: AlertStatus) => {
    setAlertActioningId(id);
    try {
      const res = await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Could not update alert');
      }
      await loadAlerts();
    } catch (err) {
      setAlertsError(err instanceof Error ? err.message : 'Could not update alert');
    } finally {
      setAlertActioningId(null);
    }
  };

  const runAlertScan = async () => {
    if (scanRunning) return;
    setScanRunning(true);
    setAlertsError('');
    try {
      const res = await fetch('/api/alerts/scan', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to run scan');
      }
      await loadAlerts();
    } catch (err) {
      setAlertsError(err instanceof Error ? err.message : 'Failed to run scan');
    } finally {
      setScanRunning(false);
    }
  };

  useEffect(() => {
    if (!isOpen || activeTab !== 'status') return;
    if (!alertsLoaded) {
      loadAlerts(true);
      return;
    }
    const interval = setInterval(() => {
      loadAlerts();
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [isOpen, activeTab, alertsLoaded]);

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
    const errorCount = { employees: false, hierarchy: false, hours: 0, hoursTotal: 0 };
    
    const pushLog = (msg: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
      const time = new Date().toLocaleTimeString();
      const prefix = type === 'error' ? 'ERROR:' : type === 'warning' ? 'WARNING:' : type === 'success' ? 'OK:' : '';
      const entry = `[${time}] ${prefix} ${msg}`.trim();
      logEntries.push(entry);
      setWorkdayLogs(prev => [entry, ...prev].slice(0, 100)); // Increased log limit
    };
    
    pushLog('Starting Workday sync…', 'info');
    setSyncProgress(null);

    try {
      pushLog('Connecting to Workday API…', 'info');
      const { success, summary } = await runWorkdaySyncStream({
        syncType: 'unified',
        hoursDaysBack,
        timeoutMs: 600000, // 10 minute timeout
        onEvent: (ev) => {
          if (ev.type === 'step') {
            if (ev.status === 'started') {
              const stepLabels: Record<string, string> = { employees: 'employees', projects: 'hierarchy', hierarchy: 'hierarchy', hours: 'hours', matching: 'matching', customerContracts: 'customer contracts', workdayPhases: 'workday phases' };
              const stepLabel = stepLabels[ev.step as string] || ev.step;
              pushLog(`Syncing ${stepLabel}…`, 'info');
              if (ev.step === 'hours' && ev.totalChunks) {
                errorCount.hoursTotal = ev.totalChunks;
                setSyncProgress({ current: 0, total: ev.totalChunks, step: ev.step });
              }
            }
            if (ev.status === 'chunk' && ev.chunk && ev.totalChunks) {
              pushLog(`Processing hours: ${ev.startDate} to ${ev.endDate} (${ev.chunk}/${ev.totalChunks})`, 'info');
              setSyncProgress({ current: ev.chunk, total: ev.totalChunks, step: 'hours' });
            }
            if (ev.status === 'chunk_done') {
              if (ev.success === false && ev.error) {
                errorCount.hours++;
                pushLog(`Hours chunk failed: ${ev.error}`, 'error');
              } else if (ev.stats?.hours != null) {
                pushLog(`Processed ${ev.stats.hours} hour entries`, 'success');
              }
            }
            if (ev.status === 'done') {
              const stepLabels: Record<string, string> = { employees: 'Employees', projects: 'Hierarchy', hierarchy: 'Hierarchy', hours: 'Hours', matching: 'Matching', customerContracts: 'Customer contracts', workdayPhases: 'Workday phases' };
              const stepLabel = stepLabels[ev.step as string] || ev.step;
              if (ev.step === 'hours') {
                setSyncProgress(null);
                if (ev.error) pushLog(`Hours: ${ev.error}`, 'error');
                if (ev.totalHours != null) {
                  pushLog(`${stepLabel}: ${ev.totalHours} total entries synced`, 'success');
                }
              } else if (ev.step === 'customerContracts') {
                pushLog(`${stepLabel} sync complete`, 'success');
              } else {
                pushLog(`${stepLabel} sync complete`, 'success');
              }
            }
          }
          if (ev.type === 'error') {
            pushLog(ev.error, 'error');
            // Track which step had the error
            if (ev.error.toLowerCase().includes('employee')) errorCount.employees = true;
            if (ev.error.toLowerCase().includes('hierarch') || ev.error.toLowerCase().includes('project')) errorCount.hierarchy = true;
          }
          if (ev.type === 'done') {
            if (ev.logs) {
              ev.logs.forEach((l: string) => {
                if (l.toLowerCase().includes('error') || l.toLowerCase().includes('fail')) {
                  pushLog(l, 'error');
                } else if (l.toLowerCase().includes('success') || l.toLowerCase().includes('synced')) {
                  pushLog(l, 'success');
                } else {
                  pushLog(l, 'info');
                }
              });
            }
            if (ev.summary) {
              pushLog(`Summary: ${JSON.stringify(ev.summary)}`, 'info');
            }
          }
        },
      });
      
      setSyncProgress(null);
      
      // Determine final status based on what succeeded/failed
      const hasPartialSuccess = errorCount.hours > 0 && errorCount.hours < errorCount.hoursTotal;
      const hasFullSuccess = success && !errorCount.employees && !errorCount.hierarchy && errorCount.hours === 0;
      
      if (hasFullSuccess) {
        setWorkdayStatus('success');
        setWorkdayMessage('Sync Complete');
        pushLog('All data synced successfully', 'success');
      } else if (hasPartialSuccess || success) {
        setWorkdayStatus('success'); // Still show success if partial
        const issues: string[] = [];
        if (errorCount.employees) issues.push('employees');
        if (errorCount.hierarchy) issues.push('hierarchy');
        if (errorCount.hours > 0) issues.push(`${errorCount.hours}/${errorCount.hoursTotal} hour chunks`);
        setWorkdayMessage(`Partial sync (${issues.join(', ')} had issues)`);
        pushLog(`Sync completed with issues: ${issues.join(', ')}`, 'warning');
      } else {
        setWorkdayStatus('error');
        setWorkdayMessage('Sync Failed');
        pushLog('Sync failed - check errors above', 'error');
      }

      // Extra clarity for hours/tasks not returning
      const hoursStepsSeen = errorCount.hoursTotal > 0;
      if (!hoursStepsSeen) {
        pushLog('No hours chunks were processed. Azure Function may not be returning hours events.', 'warning');
      }
      if (!summary || typeof summary !== 'object') {
        pushLog('No summary payload was returned from Workday sync.', 'info');
      } else {
        const sumStr = JSON.stringify(summary);
        pushLog(`Summary: ${sumStr}`, 'info');
      }
      
      addEngineLog('Workday', logEntries);
      await refreshData();
    } catch (err: any) {
      setSyncProgress(null);
      setWorkdayStatus('error');
      const errorMsg = err?.message || 'Unknown error';
      setWorkdayMessage(`Sync Failed: ${errorMsg.substring(0, 50)}`);
      pushLog(`Sync stopped unexpectedly: ${errorMsg}`, 'error');
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
  // Collapse/expand state for each log section
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const engineLogsByEngine = useMemo(() => {
    const order = ['CPM', 'Actuals', 'Workday', 'ProjectPlan'];
    const engineLabels: Record<string, string> = { 
      CPM: 'Schedule Analysis', 
      Actuals: 'Actuals', 
      Workday: 'Workday Sync',
      ProjectPlan: 'Project Plan Import',
    };
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
  const openAlertCount = alerts.length;
  const alertColor = alerts.some((a) => a.severity === 'critical')
    ? 'var(--color-error)'
    : openAlertCount > 0
      ? 'var(--pinnacle-orange)'
      : 'var(--pinnacle-teal)';

  return (
    <div ref={dropdownRef} className="status-and-logs-dropdown" style={{ position: 'relative' }}>
      <button
        className="nav-dropdown-trigger"
        onClick={() => setIsOpen(!isOpen)}
        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        title="System Health, Alerts & Logs"
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
          {(totalLogCount > 0 || openAlertCount > 0) && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {openAlertCount > 0 && (
                <span style={{ fontSize: '0.7rem', background: alertColor, color: '#000', padding: '2px 7px', borderRadius: '10px', fontWeight: 600 }}>
                  {openAlertCount} alert{openAlertCount === 1 ? '' : 's'}
                </span>
              )}
              {totalLogCount > 0 && (
                <span style={{ fontSize: '0.7rem', background: 'var(--pinnacle-teal)', color: '#000', padding: '2px 7px', borderRadius: '10px', fontWeight: 600 }}>
                  {totalLogCount} logs
                </span>
              )}
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
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Hours to pull</label>
                    <select
                      value={hoursDaysBack}
                      onChange={(e) => setHoursDaysBack(Number(e.target.value))}
                      disabled={workdaySyncing}
                      style={{ width: '100%', fontSize: '0.8rem', padding: '8px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
                    >
                      <option value={7}>Last 7 days</option>
                      <option value={14}>Last 2 weeks</option>
                      <option value={30}>Last 30 days</option>
                      <option value={90}>Last 90 days</option>
                      <option value={180}>Last 6 months</option>
                      <option value={365}>Last 12 months</option>
                    </select>
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

                {/* Alerts */}
                <section>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--pinnacle-teal)' }}>
                      Alerts {openAlertCount > 0 ? `(${openAlertCount})` : ''}
                    </div>
                    <button
                      onClick={runAlertScan}
                      disabled={scanRunning}
                      style={{
                        padding: '6px 10px',
                        fontSize: '0.72rem',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        cursor: scanRunning ? 'wait' : 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {scanRunning ? 'Scanning…' : 'Run scan'}
                    </button>
                  </div>
                  {alertsError && (
                    <div style={{ marginBottom: '8px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: 'var(--color-error)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                      {alertsError}
                    </div>
                  )}
                  {alertsLoading ? (
                    <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Loading alerts…
                    </div>
                  ) : openAlertCount === 0 ? (
                    <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      No open alerts.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflow: 'auto', paddingRight: '2px' }}>
                      {alerts.map((alert) => {
                        const severityColor = alert.severity === 'critical'
                          ? '#EF4444'
                          : alert.severity === 'warning'
                            ? '#F59E0B'
                            : '#60A5FA';
                        const displayTitle = alert.title || alert.eventType.replace(/\./g, ' ');
                        return (
                          <div
                            key={alert.id}
                            style={{
                              padding: '10px 12px',
                              background: 'var(--bg-tertiary)',
                              border: `1px solid ${severityColor}40`,
                              borderLeft: `3px solid ${severityColor}`,
                              borderRadius: 'var(--radius-sm)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {displayTitle}
                              </div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {formatRelativeTime(alert.createdAt)}
                              </div>
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '8px' }}>
                              {alert.message}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <div style={{ fontSize: '0.65rem', color: severityColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                {alert.severity}
                              </div>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  onClick={() => updateAlertStatus(alert.id, 'acknowledged')}
                                  disabled={alertActioningId === alert.id}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '0.68rem',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    cursor: alertActioningId === alert.id ? 'wait' : 'pointer',
                                  }}
                                >
                                  Acknowledge
                                </button>
                                <button
                                  onClick={() => updateAlertStatus(alert.id, 'resolved')}
                                  disabled={alertActioningId === alert.id}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '0.68rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: 'var(--pinnacle-teal)',
                                    color: '#000',
                                    fontWeight: 600,
                                    cursor: alertActioningId === alert.id ? 'wait' : 'pointer',
                                  }}
                                >
                                  Resolve
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Scheduled sync (Azure timer reads this from app_settings) */}
                <section>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--pinnacle-teal)', marginBottom: '8px' }}>Scheduled sync</div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Set when the daily Workday sync runs (Azure timer). Times are in UTC.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <select
                      value={scheduleHour}
                      onChange={(e) => setScheduleHour(Number(e.target.value))}
                      style={{ fontSize: '0.8rem', padding: '6px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>:</span>
                    <select
                      value={scheduleMinute}
                      onChange={(e) => setScheduleMinute(Number(e.target.value))}
                      style={{ fontSize: '0.8rem', padding: '6px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
                    >
                      {[0, 15, 30, 45].map((m) => (
                        <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                      ))}
                    </select>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>UTC</span>
                  </div>
                  {scheduleLastRun && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      Last run: {new Date(scheduleLastRun).toLocaleString()}
                    </div>
                  )}
                  <button
                    onClick={saveSchedule}
                    disabled={scheduleSaving}
                    style={{
                      padding: '8px 14px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      background: 'var(--pinnacle-teal)',
                      color: '#000',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      cursor: scheduleSaving ? 'wait' : 'pointer',
                    }}
                  >
                    {scheduleSaving ? 'Saving…' : 'Save schedule'}
                  </button>
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
                {engineLogsByEngine.map(({ engine, label, entries }) => {
                  const isCollapsed = collapsedSections[engine] ?? false;
                  return (
                    <section key={engine}>
                      <button
                        onClick={() => toggleSection(engine)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          width: '100%',
                          background: 'none',
                          border: 'none',
                          padding: '4px 0',
                          marginBottom: '8px',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <svg
                          viewBox="0 0 12 12"
                          width="10"
                          height="10"
                          style={{
                            transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.15s ease',
                            flexShrink: 0,
                          }}
                        >
                          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="var(--pinnacle-teal)" strokeWidth="1.5" fill="none" />
                        </svg>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--pinnacle-teal)', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--pinnacle-teal)' }}>
                          {label}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                        </span>
                      </button>
                      {!isCollapsed && (
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
                      )}
                    </section>
                  );
                })}
                <section>
                  <button
                    onClick={() => toggleSection('dataChanges')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      padding: '4px 0',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <svg
                      viewBox="0 0 12 12"
                      width="10"
                      height="10"
                      style={{
                        transform: collapsedSections['dataChanges'] ? 'rotate(-90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.15s ease',
                        flexShrink: 0,
                      }}
                    >
                      <path d="M2.5 4.5L6 8L9.5 4.5" stroke="var(--pinnacle-lime)" strokeWidth="1.5" fill="none" />
                    </svg>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--pinnacle-lime)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--pinnacle-lime)' }}>
                      Data changes
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {changeLogs.length} {changeLogs.length === 1 ? 'entry' : 'entries'}
                    </span>
                  </button>
                  {!collapsedSections['dataChanges'] && (
                    changeLogs.length === 0 ? (
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
                    )
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
