'use client';

/**
 * @fileoverview Project Lead documents workstation page.
 *
 * Operational document workflow surface for status and signoff updates.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';

type DocumentRow = {
  id: string;
  name: string;
  status: string;
  version: string;
  projectId: string;
  updatedAt: string;
  clientSignoffRequired: boolean;
  clientSignoffComplete: boolean;
};

const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Pending Client', 'Complete'];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toBool(value: unknown): boolean {
  if (value === true) return true;
  if (value === false) return false;
  const text = String(value ?? '').trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

export default function ProjectLeadDocumentsPage() {
  const { filteredData, data: fullData, refreshData } = useData();
  const { activeRole } = useRoleView();
  const { user } = useUser();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const rows = useMemo<DocumentRow[]>(() => {
    const records = (((filteredData?.projectDocumentRecords?.length ? filteredData.projectDocumentRecords : fullData?.projectDocumentRecords)
      || (filteredData?.projectDocuments?.length ? filteredData.projectDocuments : fullData?.projectDocuments)
      || []) as unknown[]).map(asRecord);

    return records.map((row, idx) => ({
      id: String(row.id || row.documentId || idx),
      name: String(row.name || row.documentName || row.fileName || row.file_name || 'Document'),
      status: String(row.status || 'Not Started'),
      version: String(row.version || row.revision || '-'),
      projectId: String(row.projectId || row.project_id || '-'),
      updatedAt: String(row.updatedAt || row.updated_at || row.createdAt || row.created_at || ''),
      clientSignoffRequired: toBool(row.clientSignoffRequired ?? row.client_signoff_required),
      clientSignoffComplete: toBool(row.clientSignoffComplete ?? row.client_signoff_complete),
    })).slice(0, 150);
  }, [filteredData?.projectDocumentRecords, filteredData?.projectDocuments, fullData?.projectDocumentRecords, fullData?.projectDocuments]);

  const summary = useMemo(() => {
    const byStatus = new Map<string, number>();
    for (const row of rows) byStatus.set(row.status, (byStatus.get(row.status) || 0) + 1);
    return {
      total: rows.length,
      notStarted: byStatus.get('Not Started') || 0,
      inProgress: byStatus.get('In Progress') || 0,
      pendingClient: byStatus.get('Pending Client') || 0,
      complete: byStatus.get('Complete') || 0,
    };
  }, [rows]);

  async function updateRow(
    row: DocumentRow,
    updates: Partial<Pick<DocumentRow, 'status' | 'clientSignoffRequired' | 'clientSignoffComplete'>>,
  ): Promise<void> {
    setSavingId(row.id);
    setMessage('');
    try {
      const response = await fetch('/api/project-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role-view': activeRole.key,
          'x-actor-email': user?.email || '',
        },
        body: JSON.stringify({
          action: 'updateDocumentRecordMetadata',
          recordId: row.id,
          status: updates.status ?? row.status,
          clientSignoffRequired: updates.clientSignoffRequired ?? row.clientSignoffRequired,
          clientSignoffComplete: updates.clientSignoffComplete ?? row.clientSignoffComplete,
          updatedBy: user?.email || null,
          actorEmail: user?.email || null,
          actorName: user?.name || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(String(payload.error || 'Update failed'));
      }
      setMessage(`Updated ${row.name}.`);
      await refreshData();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <RoleWorkstationShell
      role="project_lead"
      requiredTier="tier2"
      title="Documents Workspace"
      subtitle="Role-scoped project documentation workflow and signoff readiness."
      actions={(
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href="/project-management/documentation" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Open Documentation</Link>
          <Link href="/insights/documents" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Document Insights</Link>
        </div>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '0.65rem' }}>
        {[
          { label: 'Total Docs', value: summary.total },
          { label: 'Not Started', value: summary.notStarted },
          { label: 'In Progress', value: summary.inProgress },
          { label: 'Pending Client', value: summary.pendingClient },
          { label: 'Complete', value: summary.complete },
        ].map((card) => (
          <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{card.label}</div>
            <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {message ? <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{message}</div> : null}

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1.4fr 130px 110px 110px 90px 120px', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Project</span><span>Document</span><span>Status</span><span>Signoff Req.</span><span>Signoff Done</span><span>Version</span><span>Updated</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No document records in scope.</div>
        ) : rows.map((row) => (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '100px 1.4fr 130px 110px 110px 90px 120px', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem', alignItems: 'center', gap: '0.4rem' }}>
            <span>{row.projectId}</span>
            <span>{row.name}</span>
            <select
              value={row.status}
              onChange={(event) => void updateRow(row, { status: event.target.value })}
              disabled={savingId === row.id}
              style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: '0.26rem 0.35rem', fontSize: '0.7rem' }}
            >
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={row.clientSignoffRequired}
                disabled={savingId === row.id}
                onChange={(event) => void updateRow(row, { clientSignoffRequired: event.target.checked })}
              />
              Req
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={row.clientSignoffComplete}
                disabled={savingId === row.id}
                onChange={(event) => void updateRow(row, { clientSignoffComplete: event.target.checked })}
              />
              Done
            </label>
            <span>{row.version}</span>
            <span>{row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : '-'}</span>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
