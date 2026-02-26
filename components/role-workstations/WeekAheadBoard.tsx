'use client';

/**
 * @fileoverview Reusable week-ahead execution board for role workstations.
 */

import React from 'react';

export type WeekAheadItem = {
  id: string;
  title: string;
  dueLabel: string;
  detail?: string;
  actionLabel?: string;
  actionHref?: string;
};

interface WeekAheadBoardProps {
  thisWeek: WeekAheadItem[];
  nextWeek: WeekAheadItem[];
  overdue: WeekAheadItem[];
}

function Column({ title, items, accent }: { title: string; items: WeekAheadItem[]; accent: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.7rem' }}>
      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: accent, marginBottom: '0.5rem' }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>No items.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {items.map((item) => (
            <div key={item.id} style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', padding: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{item.dueLabel}</div>
              {item.detail ? <div style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', marginTop: 2 }}>{item.detail}</div> : null}
              {item.actionHref ? (
                <a href={item.actionHref} style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', marginTop: 4, display: 'inline-block' }}>
                  {item.actionLabel || 'Open'}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WeekAheadBoard({ thisWeek, nextWeek, overdue }: WeekAheadBoardProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.7rem' }}>
      <Column title="Overdue" items={overdue} accent="#ef4444" />
      <Column title="Due This Week" items={thisWeek} accent="#f59e0b" />
      <Column title="Upcoming Next Week" items={nextWeek} accent="#2ed3c6" />
    </div>
  );
}
