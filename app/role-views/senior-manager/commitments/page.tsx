'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

type StatusFilter = 'all' | 'draft' | 'submitted' | 'reviewed' | 'approved' | 'escalated' | 'rejected';

export default function SeniorManagerCommitmentsPage() {
  const [rows, setRows] = useState<CommitmentRecord[]>([]);
  const [message, setMessage] = useState('');
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
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

  const filteredRows = useMemo(
    () => (statusFilter === 'all' ? rows : rows.filter((row) => row.status === statusFilter)),
    [rows, statusFilter],
  );

  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.status, (counts.get(row.status) || 0) + 1);
    return {
      total: rows.length,
      submitted: counts.get('submitted') || 0,
      reviewed: counts.get('reviewed') || 0,
      escalated: counts.get('escalated') || 0,
    };
  }, [rows]);

  return (
    <RoleWorkstationShell role="senior_manager" requiredTier="tier2" title="Commitments" subtitle="Cross-project commitment review with escalation/approval workflow.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.65rem' }}>
        {[
          { label: 'Total', value: summary.total },
          { label: 'Submitted', value: summary.submitted },
          { label: 'Reviewed', value: summary.reviewed },
          { label: 'Escalated', value: summary.escalated, danger: summary.escalated > 0 },
        ].map((card) => (
          <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{card.label}</div>
            <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: card.danger ? '#EF4444' : 'var(--text-primary)' }}>{card.value}</div>
          </div>
        ))}
      </div>

      <MetricProvenanceOverlay
        entries={[
          {
            metric: 'Commitment Status',
            formulaId: 'SM_COMMIT_STATUS_V1',
            formula: 'Persisted status field per commitment row',
            sources: ['commitments'],
            scope: 'portfolio commitments in role lens',
            window: 'current snapshot',
          },
          {
            metric: 'Review Notes',
            formulaId: 'SM_REVIEW_NOTE_V1',
            formula: 'Latest review_note attached by reviewer action',
            sources: ['commitments', 'workflow_audit_log'],
            scope: 'selected commitment row',
            window: 'latest review event',
          },
        ]}
      />
      {message ? <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{message}</div> : null}

      <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Status</span>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          style={{ padding: '0.38rem 0.52rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '0.72rem' }}
        >
          <option value="all">All</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="reviewed">Reviewed</option>
          <option value="approved">Approved</option>
          <option value="escalated">Escalated</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 110px 90px 1fr 120px 180px 240px', padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Project</span><span>Period</span><span>Role</span><span>Commitment</span><span>Status</span><span>Review Note</span><span>Actions</span>
        </div>
        {filteredRows.length === 0 ? (
          <div style={{ padding: '0.7rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No commitments found for selected filter.</div>
        ) : filteredRows.map((row) => (
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
