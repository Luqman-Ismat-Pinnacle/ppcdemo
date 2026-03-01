'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

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
  task_assigned: '#10b981',
  task_overdue: '#ef4444',
  resource_change: '#8b5cf6',
  schedule_slip: '#f59e0b',
  system: '#3b82f6',
};

function timeAgo(date: string) {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?role=PCA');
      const data = await res.json();
      if (data.success) setNotifications(data.notifications ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const iv = setInterval(fetchNotifications, 30000);
    return () => clearInterval(iv);
  }, [fetchNotifications]);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

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
      await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markAllRead: true, role: 'PCA' }) });
    } catch { /* silent */ }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        className="nav-icon-btn"
      >
        <svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" strokeWidth="2" fill="none">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            minWidth: 15, height: 15, borderRadius: 10,
            background: '#ef4444', color: '#fff',
            fontSize: '0.55rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1,
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          width: 360, maxHeight: 440, borderRadius: 'var(--radius-md)',
          background: 'rgba(12,14,18,0.92)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
          zIndex: 1100, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px', borderBottom: '1px solid var(--glass-border)',
          }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Notifications
              {unreadCount > 0 && <span style={{ marginLeft: 8, fontSize: '0.6rem', padding: '2px 6px', borderRadius: 10, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 600 }}>{unreadCount} new</span>}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.68rem', color: 'var(--accent)', fontWeight: 600 }}>
                Mark all read
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="1.5" fill="none" style={{ opacity: 0.35, margin: '0 auto 0.4rem', display: 'block' }}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 2 }}>No notifications</div>
                <div style={{ fontSize: '0.68rem' }}>You&apos;re all caught up</div>
              </div>
            ) : (
              notifications.map(n => {
                const typeColor = TYPE_COLORS[n.type] || '#9ca3af';
                return (
                  <div
                    key={n.id}
                    onClick={() => !n.isRead && markRead(n.id)}
                    style={{
                      padding: '9px 14px', borderBottom: '1px solid var(--glass-border)',
                      cursor: n.isRead ? 'default' : 'pointer',
                      background: n.isRead ? 'transparent' : 'rgba(16,185,129,0.03)',
                      transition: 'background 0.15s', display: 'flex', gap: 9, alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: n.isRead ? '#3f3f46' : typeColor }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.75rem', color: n.isRead ? 'var(--text-muted)' : 'var(--text-primary)' }}>{n.title}</span>
                        <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>{timeAgo(n.createdAt)}</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>{n.message}</div>
                      <div style={{ fontSize: '0.58rem', color: typeColor, fontWeight: 600, marginTop: 2, textTransform: 'capitalize' }}>
                        {n.type.replace(/_/g, ' ')}
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
