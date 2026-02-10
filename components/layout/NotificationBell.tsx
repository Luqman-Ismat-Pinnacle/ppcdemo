'use client';

/**
 * @fileoverview Notification Bell — header dropdown showing role/employee notifications.
 * Polls the /api/notifications endpoint for the logged-in user and renders a badge + dropdown.
 * Supports mark-as-read and mark-all-read.
 *
 * @module components/layout/NotificationBell
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@/lib/user-context';

interface Notification {
  id: number;
  employeeId: string | null;
  role: string | null;
  type: string;
  title: string;
  message: string;
  relatedTaskId: string | null;
  relatedProjectId: string | null;
  isRead: boolean;
  createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  task_assigned: '#40E0D0',
  task_overdue: '#EF4444',
  resource_change: '#8B5CF6',
  system: '#3B82F6',
};

function timeAgo(date: string) {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const params = new URLSearchParams();
    if (user.employeeId) params.set('employeeId', user.employeeId);
    if (user.role) params.set('role', user.role);
    if (!params.toString()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?${params.toString()}`);
      const data = await res.json();
      if (data.success) setNotifications(data.notifications ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Poll every 30s when open, fetch on mount
  useEffect(() => {
    fetchNotifications();
    const iv = setInterval(fetchNotifications, 30000);
    return () => clearInterval(iv);
  }, [fetchNotifications]);

  // Re-fetch on open
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markRead = async (id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    try {
      await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    } catch { /* silent */ }
  };

  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true, employeeId: user?.employeeId, role: user?.role }),
      });
    } catch { /* silent */ }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s',
          color: 'var(--text-secondary)',
        }}
        onMouseOver={e => (e.currentTarget.style.background = 'rgba(64,224,208,0.1)')}
        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 16, height: 16, borderRadius: 10,
            background: '#EF4444', color: '#fff',
            fontSize: '0.6rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px',
            lineHeight: 1,
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          width: 380, maxHeight: 480, borderRadius: 12,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
          zIndex: 1100,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderBottom: '1px solid var(--border-color)',
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Notifications
              {unreadCount > 0 && <span style={{ marginLeft: 8, fontSize: '0.65rem', padding: '2px 7px', borderRadius: 10, background: 'rgba(239,68,68,0.15)', color: '#EF4444', fontWeight: 600 }}>{unreadCount} new</span>}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '0.7rem', color: 'var(--pinnacle-teal)', fontWeight: 600,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {loading && notifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading...</div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="1.5" fill="none" style={{ opacity: 0.4, margin: '0 auto 0.5rem' }}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>No notifications</div>
                <div style={{ fontSize: '0.7rem' }}>You&apos;re all caught up</div>
              </div>
            ) : (
              notifications.map(n => {
                const typeColor = TYPE_COLORS[n.type] || '#9ca3af';
                return (
                  <div
                    key={n.id}
                    onClick={() => !n.isRead && markRead(n.id)}
                    style={{
                      padding: '10px 16px',
                      borderBottom: '1px solid var(--border-color)',
                      cursor: n.isRead ? 'default' : 'pointer',
                      background: n.isRead ? 'transparent' : 'rgba(64,224,208,0.03)',
                      transition: 'background 0.15s',
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                    }}
                    onMouseOver={e => { if (!n.isRead) e.currentTarget.style.background = 'rgba(64,224,208,0.07)'; }}
                    onMouseOut={e => { e.currentTarget.style.background = n.isRead ? 'transparent' : 'rgba(64,224,208,0.03)'; }}
                  >
                    {/* Dot */}
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                      background: n.isRead ? '#3f3f46' : typeColor,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.78rem', color: n.isRead ? 'var(--text-muted)' : 'var(--text-primary)' }}>{n.title}</span>
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>{timeAgo(n.createdAt)}</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{n.message}</div>
                      <div style={{ fontSize: '0.6rem', color: typeColor, fontWeight: 600, marginTop: 3, textTransform: 'capitalize' }}>
                        {n.type.replace(/_/g, ' ')}
                        {n.role && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {n.role}</span>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
