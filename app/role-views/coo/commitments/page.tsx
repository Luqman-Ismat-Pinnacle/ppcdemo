'use client';

import React, { useCallback, useEffect, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';
import MetricProvenanceOverlay from '@/components/role-workstations/MetricProvenanceOverlay';

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

export default function CooCommitmentsPage() {
  const [rows, setRows] = useState<CommitmentRecord[]>([]);
  const [message, setMessage] = useState('');
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const { activeRole } = useRoleView();
  const { user } = useUser();

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
      const allRows = Array.isArray(payload.rows) ? payload.rows : [];
      setRows(allRows.filter((row: CommitmentRecord) => row.status !== 'draft'));
    }
  }, [activeRole.key, user?.email]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (id: string, status: 'escalated' | 'approved' | 'rejected') => {
    const res = await fetch('/api/commitments', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-role-view': activeRole.key,
        'x-actor-email': user?.email || '',
      },
      body: JSON.stringify({
        id,
        status,
        reviewNote: reviewNote[id] || null,
        reviewerEmail: user?.email || null,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    setMessage(payload.success ? `COO ${status} action completed.` : String(payload.error || 'Update failed'));
    if (payload.success) await load();
  };

  return (
    <RoleWorkstationShell role="coo" title="Commitments" subtitle="Executive commitment decisions and escalation outcomes.">
      <MetricProvenanceOverlay
        entries={[
          {
            metric: 'Executive Decision State',
            formulaId: 'COO_COMMIT_DECISION_V1',
            formula: "Status transition: submitted -> escalated/approved/rejected",
            sources: ['commitments', 'workflow_audit_log'],
            scope: 'non-draft commitments',
            window: 'current snapshot',
          },
          {
            metric: 'Executive Notes',
            formulaId: 'COO_EXEC_NOTE_V1',
            formula: 'Stored review_note per commitment',
            sources: ['commitments'],
            scope: 'selected commitment row',
            window: 'latest review event',
          },
        ]}
      />
      {message ? <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{message}</div> : null}
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '100px 100px 90px 1fr 110px 180px 240px', padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Project</span><span>Period</span><span>Role</span><span>Commitment</span><span>Status</span><span>Exec Note</span><span>Actions</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '0.7rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No submitted commitments.</div>
        ) : rows.map((row) => (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '100px 100px 90px 1fr 110px 180px 240px', gap: '0.5rem', padding: '0.55rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem', alignItems: 'center' }}>
            <span>{row.projectId}</span>
            <span>{row.periodKey}</span>
            <span>{row.ownerRole}</span>
            <span>{row.commitmentText}</span>
            <span>{row.status}</span>
            <input
              value={reviewNote[row.id] ?? row.reviewNote ?? ''}
              onChange={(event) => setReviewNote((prev) => ({ ...prev, [row.id]: event.target.value }))}
              placeholder="Executive note"
              style={{ padding: '0.32rem 0.42rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '0.72rem' }}
            />
            <div style={{ display: 'flex', gap: '0.28rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => void updateStatus(row.id, 'escalated')} style={{ padding: '0.24rem 0.42rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'rgba(245,158,11,0.12)', color: 'var(--text-primary)' }}>Escalate</button>
              <button type="button" onClick={() => void updateStatus(row.id, 'approved')} style={{ padding: '0.24rem 0.42rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'rgba(16,185,129,0.14)', color: 'var(--text-primary)' }}>Approve</button>
              <button type="button" onClick={() => void updateStatus(row.id, 'rejected')} style={{ padding: '0.24rem 0.42rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'rgba(239,68,68,0.12)', color: 'var(--text-primary)' }}>Reject</button>
            </div>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
