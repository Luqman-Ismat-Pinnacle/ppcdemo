'use client';

/**
 * @fileoverview Database Connection Status Indicator Component.
 * 
 * Displays a pulsing light indicator showing database connection status:
 * - Green (pulsing): Connected and healthy
 * - Yellow (pulsing): Degraded connection (partial functionality)
 * - Red (pulsing): Disconnected or error
 * 
 * Hover tooltip shows:
 * - Last check time
 * - Connection status details
 * - Error messages if any
 * 
 * Auto-refreshes every 30 seconds.
 * 
 * @module components/layout/DatabaseStatusIndicator
 */

import React, { useState, useEffect, useRef } from 'react';
import { ConnectionCheckResult, ConnectionStatus } from '@/lib/supabase';

// Refresh interval in ms
const REFRESH_INTERVAL = 30000; // 30 seconds

export default function DatabaseStatusIndicator() {
  const [status, setStatus] = useState<ConnectionCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  // Perform connection check
  const checkConnection = async () => {
    setIsChecking(true);
    try {
      // Call API route instead of direct function (runs on server where env vars are available)
      const response = await fetch('/api/status');
      if (!response.ok) {
        throw new Error(`Status check failed: ${response.statusText}`);
      }
      const result = await response.json();
      setStatus(result);
    } catch (err) {
      setStatus({
        status: 'disconnected',
        latency: null,
        lastChecked: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Check failed',
        details: {
          supabaseConfigured: false,
          authStatus: 'error',
          databaseReachable: false,
        },
      });
    }
    setIsChecking(false);
  };

  // Initial check and periodic refresh
  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Get color based on status
  const getStatusColor = (connectionStatus: ConnectionStatus): string => {
    switch (connectionStatus) {
      case 'connected':
        return '#10B981'; // Green
      case 'degraded':
        return '#F59E0B'; // Yellow/Amber
      case 'disconnected':
      default:
        return '#EF4444'; // Red
    }
  };

  // Get status label
  const getStatusLabel = (connectionStatus: ConnectionStatus): string => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected';
      case 'degraded':
        return 'Degraded';
      case 'disconnected':
      default:
        return 'Disconnected';
    }
  };

  // Format time
  const formatTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const statusColor = status ? getStatusColor(status.status) : '#6B7280';

  return (
    <div 
      ref={indicatorRef}
      style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Pulsing Indicator */}
      <div
        style={{
          position: 'relative',
          width: '12px',
          height: '12px',
          cursor: 'pointer',
        }}
        onClick={checkConnection}
        title="Click to refresh connection status"
      >
        {/* Pulse ring */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: statusColor,
            opacity: 0.3,
            animation: isChecking ? 'none' : 'pulse 2s ease-in-out infinite',
          }}
        />
        {/* Core dot */}
        <div
          style={{
            position: 'absolute',
            top: '25%',
            left: '25%',
            width: '50%',
            height: '50%',
            borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 4px ${statusColor}`,
          }}
        />
      </div>

      {/* Tooltip */}
      {showTooltip && status && (
        <div
          ref={tooltipRef}
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '8px',
            padding: '12px 16px',
            background: 'rgba(20, 20, 20, 0.98)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            minWidth: '240px',
            fontSize: '0.75rem',
          }}
        >
          {/* Header */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            marginBottom: '10px',
            paddingBottom: '8px',
            borderBottom: '1px solid var(--border-color)',
          }}>
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: statusColor,
                boxShadow: `0 0 6px ${statusColor}`,
              }}
            />
            <span style={{ 
              fontWeight: 700, 
              color: statusColor,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {getStatusLabel(status.status)}
            </span>
          </div>

          {/* Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Last Checked:</span>
              <span style={{ color: 'var(--text-secondary)' }}>{formatTime(status.lastChecked)}</span>
            </div>
            
            {status.latency !== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Latency:</span>
                <span style={{ 
                  color: status.latency < 200 ? '#10B981' : status.latency < 500 ? '#F59E0B' : '#EF4444' 
                }}>
                  {status.latency}ms
                </span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Supabase:</span>
              <span style={{ color: status.details.supabaseConfigured ? '#10B981' : '#EF4444' }}>
                {status.details.supabaseConfigured ? 'Configured' : 'Not Configured'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Database:</span>
              <span style={{ color: status.details.databaseReachable ? '#10B981' : '#EF4444' }}>
                {status.details.databaseReachable ? 'Reachable' : 'Unreachable'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Auth:</span>
              <span style={{ 
                color: status.details.authStatus === 'authenticated' ? '#10B981' : 
                       status.details.authStatus === 'anonymous' ? '#F59E0B' : '#EF4444' 
              }}>
                {status.details.authStatus === 'authenticated' ? 'Authenticated' :
                 status.details.authStatus === 'anonymous' ? 'Anonymous' : 'Error'}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {status.error && (
            <div style={{ 
              marginTop: '10px', 
              paddingTop: '8px', 
              borderTop: '1px solid var(--border-color)',
            }}>
              <div style={{ 
                fontSize: '0.65rem', 
                color: 'var(--text-muted)', 
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                Error Details
              </div>
              <div style={{ 
                color: '#EF4444', 
                fontSize: '0.7rem',
                background: 'rgba(239, 68, 68, 0.1)',
                padding: '6px 8px',
                borderRadius: '4px',
                wordBreak: 'break-word',
              }}>
                {status.error}
              </div>
            </div>
          )}

          {/* Refresh hint */}
          <div style={{ 
            marginTop: '10px', 
            fontSize: '0.65rem', 
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}>
            Click indicator to refresh • Auto-refreshes every 30s
          </div>
        </div>
      )}

      {/* CSS Keyframes for pulse animation */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.5);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

