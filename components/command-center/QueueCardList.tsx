'use client';

import React from 'react';

export type QueueCard = {
  id: string | number;
  severity?: 'info' | 'warning' | 'critical' | string;
  title: string;
  detail?: string;
  ageLabel?: string;
  actions?: Array<{ label: string; onClick?: () => void; href?: string }>;
};

function colorForSeverity(severity?: string): string {
  if (severity === 'critical') return '#EF4444';
  if (severity === 'warning') return '#F59E0B';
  return 'var(--text-primary)';
}

export default function QueueCardList({
  cards,
  empty,
}: {
  cards: QueueCard[];
  empty: string;
}) {
  if (!cards.length) {
    return <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{empty}</div>;
  }
  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      {cards.map((card) => (
        <div key={String(card.id)} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.55rem', display: 'grid', gap: '0.3rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: colorForSeverity(card.severity) }}>{card.title}</div>
          {card.detail ? <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{card.detail}</div> : null}
          {card.ageLabel ? <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{card.ageLabel}</div> : null}
          {card.actions?.length ? (
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {card.actions.map((action, index) => (
                action.href ? (
                  <a key={`${card.id}-${index}`} href={action.href} style={{ fontSize: '0.67rem', color: 'var(--text-secondary)' }}>{action.label}</a>
                ) : (
                  <button key={`${card.id}-${index}`} type="button" onClick={action.onClick} style={{ fontSize: '0.66rem' }}>{action.label}</button>
                )
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
