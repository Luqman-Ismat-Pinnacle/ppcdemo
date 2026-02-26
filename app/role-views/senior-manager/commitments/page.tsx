'use client';

import React, { useCallback, useEffect, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';

type CommitmentRecord = {
  id: string;
  projectId: string;
  periodKey: string;
  ownerRole: string;
  commitmentText: string;
  followthroughText: string | null;
  status: string;
  reviewNote?: string | null;
  updatedAt: string;
};

export default function SeniorManagerCommitmentsPage() {
  const [rows, setRows] = useState<CommitmentRecord[]>([]);
  const [message, setMessage] = useState('');
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const { activeRole } = useRoleView();
  const { user } = useUser();

  const headers = {
    'Content-Type': 'application/json',
    'x-role-view': activeRole.key,
    'x-actor-email': user?.email || '',
  };

  const load = useCallback(async () => {
    const res = await fetch('/api/commitments?limit=300', {
      cache: 'no-store',
      headers: {
        'x-role-view': activeRole.key,
        'x-actor-email': user?.email || '',
      },
    });
    const payload = await res.json().catch(() => ({}));
    if (res.ok && payload.success) {
      setRows(Array.isArray(payload.rows) ? payload.rows : []);
    }
  }, [activeRole.key, user?.email]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (id: string, status: 'reviewed' | 'escalated' | 'approved') => {
    const res = await fetch('/api/commitments', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        id,
        status,
        reviewNote: reviewNote[id] || null,
        reviewerEmail: user?.email || null,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    setMessage(payload.success ? `Updated ${id} to ${status}.` : String(payload.error || 'Update failed'));
    if (payload.success) await load();
  };

  return (
    <RoleWorkstationShell role="senior_manager" title="Commitments" subtitle="Cross-project commitment review with escalation/approval workflow.">
      {message ? <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{message}</div> : null}
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 110px 90px 1fr 120px 180px 240px', padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Project</span><span>Period</span><span>Role</span><span>Commitment</span><span>Status</span><span>Review Note</span><span>Actions</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '0.7rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No commitments found.</div>
        ) : rows.map((row) => (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '110px 110px 90px 1fr 120px 180px 240px', gap: '0.5rem', padding: '0.55rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem', alignItems: 'center' }}>
            <span>{row.projectId}</span>
            <span>{row.periodKey}</span>
            <span>{row.ownerRole}</span>
            <span>{row.commitmentText}</span>
            <span>{row.status}</span>
            <input
              value={reviewNote[row.id] ?? row.reviewNote ?? ''}
              onChange={(event) => setReviewNote((prev) => ({ ...prev, [row.id]: event.target.value }))}
              placeholder="Optional note"
              style={{ padding: '0.32rem 0.42rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '0.72rem' }}
            />
            <div style={{ display: 'flex', gap: '0.28rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => void updateStatus(row.id, 'reviewed')} style={{ padding: '0.24rem 0.42rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>Review</button>
              <button type="button" onClick={() => void updateStatus(row.id, 'escalated')} style={{ padding: '0.24rem 0.42rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'rgba(245,158,11,0.12)', color: 'var(--text-primary)' }}>Escalate</button>
              <button type="button" onClick={() => void updateStatus(row.id, 'approved')} style={{ padding: '0.24rem 0.42rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'rgba(16,185,129,0.14)', color: 'var(--text-primary)' }}>Approve</button>
            </div>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
