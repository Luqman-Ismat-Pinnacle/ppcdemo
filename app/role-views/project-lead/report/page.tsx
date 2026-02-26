'use client';

/**
 * @fileoverview Project Lead commitments/report workflow page.
 *
 * This route supports period commitment authoring with lock-window enforcement.
 * Submitted entries become read-only after the configured edit window unless a
 * Product Owner override is explicitly applied.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '@/lib/data-context';
import { useUser } from '@/lib/user-context';
import { useRoleView } from '@/lib/role-view-context';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import MetricProvenanceOverlay from '@/components/role-workstations/MetricProvenanceOverlay';

interface CommitmentRecord {
  id: string;
  projectId: string;
  periodKey: string;
  ownerRole: string;
  authorEmployeeId: string | null;
  authorEmail: string | null;
  commitmentText: string;
  followthroughText: string | null;
  status: string;
  updatedAt: string;
  locked?: boolean;
}

function currentPeriodKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function ProjectLeadReportPage() {
  const { filteredData, data: fullData } = useData();
  const { user } = useUser();
  const { activeRole } = useRoleView();

  const projects = useMemo(() => {
    const rows = (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [];
    return rows.map((project) => {
      const p = project as unknown as Record<string, unknown>;
      return {
        id: String(p.id || p.projectId || ''),
        name: String(p.name || p.projectName || p.id || 'Unnamed Project'),
      };
    }).filter((project) => project.id);
  }, [filteredData?.projects, fullData?.projects]);

  const [projectId, setProjectId] = useState<string>('');
  const [periodKey, setPeriodKey] = useState(currentPeriodKey());
  const [commitmentText, setCommitmentText] = useState('');
  const [followthroughText, setFollowthroughText] = useState('');
  const [status, setStatus] = useState<'draft' | 'submitted'>('draft');
  const [history, setHistory] = useState<CommitmentRecord[]>([]);
  const [editableWindowDays, setEditableWindowDays] = useState(3);
  const [locked, setLocked] = useState(false);
  const [overrideLock, setOverrideLock] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(projects[0].id);
    }
  }, [projectId, projects]);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    const load = async () => {
      const params = new URLSearchParams({
        projectId,
        periodKey,
        ownerRole: 'project_lead',
        authorEmail: user?.email || '',
        limit: '20',
      });

      const res = await fetch(`/api/commitments?${params.toString()}`, {
        cache: 'no-store',
        headers: {
          'x-role-view': activeRole.key,
          'x-actor-email': user?.email || '',
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (cancelled || !res.ok || !payload.success) return;

      const rows = Array.isArray(payload.rows) ? payload.rows as CommitmentRecord[] : [];
      setHistory(rows);
      if (rows.length > 0) {
        const current = rows[0];
        setCommitmentText(current.commitmentText || '');
        setFollowthroughText(current.followthroughText || '');
        setStatus((current.status === 'submitted' ? 'submitted' : 'draft') as 'draft' | 'submitted');
        setLocked(Boolean(current.locked));
      } else {
        setCommitmentText('');
        setFollowthroughText('');
        setStatus('draft');
        setLocked(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [periodKey, projectId, user?.email]);

  const submit = async () => {
    setMessage('');
    const res = await fetch('/api/commitments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-role-view': activeRole.key,
        'x-actor-email': user?.email || '',
      },
      body: JSON.stringify({
        projectId,
        periodKey,
        ownerRole: 'project_lead',
        authorEmployeeId: user?.employeeId || null,
        authorEmail: user?.email || null,
        commitmentText,
        followthroughText,
        status,
        overrideLock: overrideLock && Boolean(user?.canViewAll),
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (payload?.editableWindowDays) {
      setEditableWindowDays(Number(payload.editableWindowDays));
    }

    if (!res.ok || !payload.success) {
      setMessage(String(payload.error || 'Save failed'));
      if (payload.code === 'COMMITMENT_LOCKED') {
        setLocked(true);
      }
      return;
    }

    setMessage('Commitment saved.');
    setLocked(Boolean(payload.row?.status === 'submitted' && payload.row?.locked));

    const refreshParams = new URLSearchParams({
      projectId,
      periodKey,
      ownerRole: 'project_lead',
      authorEmail: user?.email || '',
      limit: '20',
    });
    const refresh = await fetch(`/api/commitments?${refreshParams.toString()}`, {
      cache: 'no-store',
      headers: {
        'x-role-view': activeRole.key,
        'x-actor-email': user?.email || '',
      },
    });
    const refreshPayload = await refresh.json().catch(() => ({}));
    if (refresh.ok && refreshPayload.success) {
      setHistory(Array.isArray(refreshPayload.rows) ? refreshPayload.rows : []);
      if (Array.isArray(refreshPayload.rows) && refreshPayload.rows[0]) {
        setLocked(Boolean(refreshPayload.rows[0].locked));
      }
    }
  };

  const canEdit = !locked || (overrideLock && Boolean(user?.canViewAll));

  return (
    <RoleWorkstationShell role="project_lead" title="Report + Commitments" subtitle="Submit period narrative and commitments with lock-window workflow controls.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.6rem', maxWidth: 980 }}>
        <MetricProvenanceOverlay
          entries={[
            {
              metric: 'Commitment Lock State',
              formulaId: 'PL_COMMIT_LOCK_V1',
              formula: "locked = (status='submitted' and updated_at older than editable window)",
              sources: ['commitments'],
              scope: 'selected project + period + author',
              window: `${editableWindowDays}-day edit window`,
            },
            {
              metric: 'Submission Status',
              formulaId: 'PL_COMMIT_STATUS_V1',
              formula: 'Latest commitment status in selected scope',
              sources: ['commitments'],
              scope: 'selected project + period + author',
              window: 'latest row',
            },
          ]}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '0.6rem' }}>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Project</label>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)} style={{ width: '100%', padding: '0.48rem 0.56rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Period</label>
            <input value={periodKey} onChange={(event) => setPeriodKey(event.target.value)} placeholder="YYYY-MM" style={{ width: '100%', padding: '0.48rem 0.56rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }} />
          </div>
        </div>

        <div style={{ fontSize: '0.74rem', color: locked ? '#F59E0B' : 'var(--text-muted)' }}>
          {locked
            ? `This commitment is locked (submitted older than ${editableWindowDays} days).`
            : `Submitted commitments remain editable for ${editableWindowDays} days.`}
        </div>

        {Boolean(user?.canViewAll) && locked ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={overrideLock} onChange={(event) => setOverrideLock(event.target.checked)} />
            Product Owner override (unlock for this save)
          </label>
        ) : null}

        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>This Period Commitments</label>
        <textarea rows={5} value={commitmentText} onChange={(event) => setCommitmentText(event.target.value)} disabled={!canEdit} style={{ padding: '0.6rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', opacity: canEdit ? 1 : 0.65 }} />

        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Follow-through Notes</label>
        <textarea rows={4} value={followthroughText} onChange={(event) => setFollowthroughText(event.target.value)} disabled={!canEdit} style={{ padding: '0.6rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', opacity: canEdit ? 1 : 0.65 }} />

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Status</label>
          <select value={status} onChange={(event) => setStatus(event.target.value as 'draft' | 'submitted')} disabled={!canEdit} style={{ padding: '0.42rem 0.52rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', opacity: canEdit ? 1 : 0.65 }}>
            <option value="draft">Draft</option>
            <option value="submitted">Submit</option>
          </select>
          <button type="button" onClick={() => void submit()} disabled={!canEdit || !projectId} style={{ padding: '0.42rem 0.7rem', borderRadius: 8, border: 'none', background: canEdit ? 'var(--pinnacle-teal)' : 'var(--bg-tertiary)', color: canEdit ? '#06241f' : 'var(--text-muted)', fontWeight: 700, cursor: canEdit ? 'pointer' : 'not-allowed' }}>Save</button>
          {message ? <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{message}</span> : null}
        </div>

        <div style={{ marginTop: '0.4rem', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 120px 90px 1fr', gap: '0.5rem', padding: '0.45rem 0.6rem', fontSize: '0.67rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
            <span>Period</span>
            <span>Updated</span>
            <span>Status</span>
            <span>Commitment</span>
          </div>
          {history.length === 0 ? (
            <div style={{ padding: '0.6rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>No history for this project/period scope.</div>
          ) : history.map((item) => (
            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '120px 120px 90px 1fr', gap: '0.5rem', padding: '0.5rem 0.6rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.73rem' }}>
              <span>{item.periodKey}</span>
              <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
              <span>{item.status}{item.locked ? ' (locked)' : ''}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{item.commitmentText}</span>
            </div>
          ))}
        </div>
      </div>
    </RoleWorkstationShell>
  );
}
