'use client';

/**
 * @fileoverview Reusable commitment card used across commitment workflow pages.
 */

import React from 'react';

export interface CommitmentCardData {
  id: string;
  projectId: string;
  periodKey: string;
  status: string;
  commitmentText: string;
  followthroughText?: string | null;
  updatedAt: string;
  locked?: boolean;
}

export default function CommitmentCard({ item }: { item: CommitmentCardData }) {
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.55rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
        <span>{item.projectId} · {item.periodKey}</span>
        <span>{new Date(item.updatedAt).toLocaleDateString()} · {item.status}{item.locked ? ' (locked)' : ''}</span>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', marginTop: 4 }}>{item.commitmentText}</div>
      {item.followthroughText ? (
        <div style={{ fontSize: '0.69rem', color: 'var(--text-secondary)', marginTop: 4 }}>
          Follow-through: {item.followthroughText}
        </div>
      ) : null}
    </div>
  );
}

