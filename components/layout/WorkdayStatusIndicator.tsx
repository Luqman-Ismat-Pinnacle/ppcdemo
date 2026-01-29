'use client';

/**
 * Workday Sync Indicator
 * Simple dropdown to sync data from Workday to Supabase.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useData } from '@/lib/data-context';



// Get Workday API URL from env
const WORKDAY_URL = process.env.NEXT_PUBLIC_WORKDAY_API_URL || 'Not configured';

export default function WorkdayStatusIndicator() {
  const { refreshData } = useData();
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  // Removed unused state vars for individual sync options
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        if (!isSyncing) setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isSyncing]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50)); // Increased log limit
  };

  // Helper to run a single sync step
  const runSyncStep = async (type: string, payload: any = {}) => {
    const response = await fetch('/api/workday', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        syncType: type,
        ...payload
      }),
    });

    const data = await response.json();

    // Append detailed logs from backend if available
    if (data.logs && Array.isArray(data.logs)) {
      data.logs.forEach((l: string) => addLog(l));
    }

    if (response.ok && data.success) {
      const count = data.summary?.synced || data.summary?.total || 0;
      setMessage(`Synced ${count} ${type}`); // Update transient message
      addLog(`Success: ${count} ${type} synced`);
      return data;
    } else {
      if (data.error) addLog(`Error: ${data.error}`);
      throw new Error(data.error || `${type} sync failed`);
    }
  };

  const handleSync = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    setStatus('idle');
    setMessage('');
    setLogs([]); // Clear previous logs

    addLog('Starting Full Workday Sync Sequence...');

    try {
      // Run Unified Sync (handles Employees -> Portfolios -> Projects -> Hours sequence on backend)
      addLog('Requesting Unified Sync...');
      await runSyncStep('unified');

      setStatus('success');
      setMessage('Sync Complete');
      addLog('--- Full Sync Completed Successfully ---');
      await refreshData();

    } catch (error: any) {
      setStatus('error');
      setMessage('Sync Failed');
      addLog(`Sync Aborted: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };


  const statusColor = status === 'success' ? '#10B981' : status === 'error' ? '#EF4444' : '#6B7280';

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Indicator Dot */}
      <div
        onClick={() => !isSyncing && setIsOpen(!isOpen)}
        title={`Workday Sync`}
        style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: isSyncing ? '#3B82F6' : statusColor,
          cursor: isSyncing ? 'wait' : 'pointer',
          boxShadow: `0 0 6px ${isSyncing ? '#3B82F6' : statusColor}`,
          animation: isSyncing ? 'pulse 1s infinite' : 'none',
        }}
      />

      {/* Dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            right: 0,
            width: '350px',
            padding: '12px',
            backgroundColor: 'var(--bg-primary)',
            backdropFilter: 'blur(35px)',
            WebkitBackdropFilter: 'blur(35px)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            zIndex: 1000,
            fontSize: '0.8rem',
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 600 }}>Workday Sync</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{status === 'idle' ? 'Ready' : status}</div>
          </div>

          {/* Sync Button */}
          <button
            onClick={handleSync}
            disabled={isSyncing}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: isSyncing ? 'var(--bg-tertiary)' : 'var(--pinnacle-teal)',
              color: isSyncing ? 'var(--text-muted)' : '#000',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: isSyncing ? 'wait' : 'pointer',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {isSyncing ? (
              <>
                <span className="spinner">⟳</span> Syncing...
              </>
            ) : (
              <>
                <span>⚡</span> Sync Workday Data (Full)
              </>
            )}
          </button>

          {/* Status Message */}
          {message && (
            <div
              style={{
                padding: '8px',
                marginBottom: '12px',
                borderRadius: '4px',
                backgroundColor: status === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                color: status === 'success' ? '#10B981' : '#EF4444',
                fontSize: '0.75rem',
                textAlign: 'center'
              }}
            >
              {status === 'success' ? '✓' : '✗'} {message}
            </div>
          )}

          {/* Logs */}
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Log</span>
              <button
                onClick={() => setLogs([])}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.65rem' }}
              >
                Clear
              </button>
            </div>
            <div
              style={{
                maxHeight: '150px',
                overflowY: 'auto',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '4px',
                padding: '8px',
                fontFamily: 'monospace',
                fontSize: '0.7rem',
              }}
            >
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>No logs yet</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} style={{ color: log.includes('Error') || log.includes('Exception') ? '#EF4444' : log.includes('Success') ? '#10B981' : 'var(--text-secondary)', marginBottom: '2px' }}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
