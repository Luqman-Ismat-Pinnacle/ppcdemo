'use client';

/**
 * @fileoverview Client portal command center.
 */

import React from 'react';
import Link from 'next/link';

export default function ClientPortalCommandCenterPage() {
  const cards = [
    { title: 'WBS Gantt', href: '/role-views/client-portal/wbs', body: 'Client-safe schedule visibility and timeline context.' },
    { title: 'Progress', href: '/role-views/client-portal/progress', body: 'Percent complete and planned-vs-done summary.' },
    { title: 'Updates', href: '/role-views/client-portal/updates', body: 'Latest approved and in-review client-facing documents.' },
    { title: 'Milestones', href: '/role-views/client-portal/milestones', body: 'Client-visible milestone commitments and statuses.' },
  ];

  return (
    <div className="page-panel" style={{ display: 'grid', gap: '0.75rem' }}>
      <div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Client Portal</div>
        <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.42rem' }}>Client Command Center</h1>
        <div style={{ marginTop: '0.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Entry point for client-safe project visibility routes.
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
        {cards.map((card) => (
          <Link key={card.href} href={card.href} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.8rem', textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>{card.title}</div>
            <div style={{ marginTop: 4, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{card.body}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
