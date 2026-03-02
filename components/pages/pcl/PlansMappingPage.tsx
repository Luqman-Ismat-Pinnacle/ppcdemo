'use client';

import React, { useEffect, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';

interface CoverageRow {
  project_id: string; project_name: string; pca_name: string;
  total_hours: number; mapped_hours: number; unmapped_hours: number; coverage_pct: number;
}
interface FreshnessRow {
  project_id: string; project_name: string; pca_name: string;
  last_upload: string | null; days_since_upload: number | null;
}
interface ProjectFileRow {
  project_id: string;
  project_name: string;
  file_count: number;
  last_upload: string | null;
  latest_file_name: string | null;
  latest_file_id?: string | null;
}
interface PlansData {
  kpis: { totalProjects: number; withPlans: number; coveragePct: number; totalHours: number; mappedHours: number; unmappedHours: number };
  projectCoverage: CoverageRow[];
  planFreshness: FreshnessRow[];
  projectFiles: ProjectFileRow[];
}

function KpiCard({ label, value, detail, color }: { label: string; value: string | number; detail?: string; color?: string }) {
  return (
    <div className="glass kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={color ? { color } : {}}>{value}</div>
      {detail && <div className="kpi-detail">{detail}</div>}
    </div>
  );
}

function CoverageBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', borderRadius: 3, background: color }} />
      </div>
      <span style={{ fontSize: '0.68rem', fontWeight: 600, color, minWidth: 36, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

export default function PclPlansMappingPage() {
  const [data, setData] = useState<PlansData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noticeProjectId, setNoticeProjectId] = useState('');
  const [noticePriority, setNoticePriority] = useState<'info' | 'warning' | 'critical'>('warning');
  const [noticeText, setNoticeText] = useState('');
  const [uploadingProjectId, setUploadingProjectId] = useState<string | null>(null);
  const [uploadProjectId, setUploadProjectId] = useState<string>('');
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch('/api/pcl/plans-mapping', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!d.success) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div>
      <h1 className="page-title">Plans & Mapping</h1>
      <p className="page-subtitle">Granular plan file, mapping quality, and PCA notice/flag management.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={80} />)}
      </div>
      <Skeleton height={300} />
    </div>
  );

  if (error) return (
    <div>
      <h1 className="page-title">Plans & Mapping</h1>
      <div style={{ color: 'var(--color-error)', fontSize: '0.82rem' }}>{error}</div>
    </div>
  );

  if (!data) return null;
  const { kpis, projectCoverage, planFreshness, projectFiles } = data;
  const noticeProjects = Array.from(new Map([...projectCoverage.map((r) => [r.project_id, r.project_name] as [string, string]), ...projectFiles.map((r) => [r.project_id, r.project_name] as [string, string])]).entries())
    .map(([project_id, project_name]) => ({ project_id, project_name }));
  const plansMissing = Math.max(0, kpis.totalProjects - kpis.withPlans);
  const stalePlans = planFreshness.filter((r) => (r.days_since_upload ?? 9999) > 60).length;
  const mappingExceptionsCount = projectCoverage.filter((r) => Number(r.unmapped_hours || 0) > 0).length;
  const exceptionRows = projectCoverage
    .filter((r) => Number(r.unmapped_hours || 0) > 0)
    .slice(0, 30);
  const fallbackRows = projectCoverage
    .slice()
    .sort((a, b) => Number(a.coverage_pct || 0) - Number(b.coverage_pct || 0))
    .slice(0, 30);

  const pickFileForProject = (projectId: string) => {
    setUploadProjectId(projectId);
    fileInputRef.current?.click();
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const projectId = uploadProjectId;
    if (!file || !projectId) return;
    setUploadingProjectId(projectId);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('projectId', projectId);
      const res = await fetch('/api/documents/upload', { method: 'POST', body: form });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.error) throw new Error(payload?.error || 'Upload failed');
      const refreshed = await fetch('/api/pcl/plans-mapping', { cache: 'no-store' }).then((r) => r.json());
      if (refreshed?.success) setData(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingProjectId(null);
      setUploadProjectId('');
      e.target.value = '';
    }
  };

  return (
    <div>
      <h1 className="page-title">Plans & Mapping</h1>
      <p className="page-subtitle">Cross-project plan freshness and hours mapping oversight.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total Projects" value={kpis.totalProjects} />
        <KpiCard label="With Plans" value={kpis.withPlans} detail={`${kpis.totalProjects > 0 ? Math.round(kpis.withPlans / kpis.totalProjects * 100) : 0}% of total`} />
        <KpiCard label="Mapping Coverage" value={`${kpis.coveragePct}%`} color={kpis.coveragePct >= 80 ? '#10b981' : kpis.coveragePct >= 60 ? '#f59e0b' : '#ef4444'} />
        <KpiCard label="Unmapped Hours" value={Math.round(kpis.unmappedHours).toLocaleString()} color={kpis.unmappedHours > 0 ? '#f59e0b' : '#10b981'} />
        <KpiCard label="Plans Missing Files" value={plansMissing} color={plansMissing > 0 ? '#f59e0b' : '#10b981'} />
        <KpiCard label="Stale Plans (>60d)" value={stalePlans} color={stalePlans > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Mapping Exceptions" value={mappingExceptionsCount} detail="projects with unmapped hours" color={mappingExceptionsCount > 0 ? '#f59e0b' : '#10b981'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 10 }}>Project Mapping Coverage</div>
          <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
            <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Project</th>
                  <th style={{ textAlign: 'left' }}>Uploaded By</th>
                  <th style={{ textAlign: 'right' }}>Total Hrs</th>
                  <th style={{ textAlign: 'right' }}>Mapped</th>
                  <th style={{ textAlign: 'right' }}>Unmapped</th>
                  <th style={{ textAlign: 'right', minWidth: 110 }}>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {projectCoverage.map((r, i) => (
                  <tr key={i}>
                    <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.project_name}</td>
                    <td>{r.pca_name || ''}</td>
                    <td style={{ textAlign: 'right' }}>{Math.round(Number(r.total_hours)).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{Math.round(Number(r.mapped_hours)).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: Number(r.unmapped_hours) > 0 ? '#f59e0b' : 'var(--text-muted)' }}>{Math.round(Number(r.unmapped_hours)).toLocaleString()}</td>
                    <td><CoverageBar pct={Number(r.coverage_pct)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 10 }}>Plan Freshness</div>
          <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
            <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Project</th>
                  <th style={{ textAlign: 'left' }}>Uploaded By</th>
                  <th style={{ textAlign: 'left' }}>Last Upload</th>
                  <th style={{ textAlign: 'right' }}>Days Since</th>
                </tr>
              </thead>
              <tbody>
                {planFreshness.map((r, i) => {
                  const days = r.days_since_upload;
                  const color = days == null ? '#ef4444' : days < 30 ? '#10b981' : days < 60 ? '#f59e0b' : '#ef4444';
                  return (
                    <tr key={i}>
                      <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.project_name}</td>
                      <td>{r.pca_name || ''}</td>
                      <td>{r.last_upload ? new Date(r.last_upload).toLocaleDateString() : 'Never'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color }}>{days != null ? `${days}d` : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 10 }}>Project Files</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mpp,.xml,.mpx"
          style={{ display: 'none' }}
          onChange={onFileChosen}
        />
        <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
          <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Project</th>
                <th style={{ textAlign: 'left' }}>Latest File</th>
                <th style={{ textAlign: 'right' }}>File Count</th>
                <th style={{ textAlign: 'right' }}>Last Upload</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projectFiles.map((r, i) => (
                <tr key={`${r.project_id}-${i}`}>
                  <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.project_name}</td>
                  <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.latest_file_name || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{Number(r.file_count || 0)}</td>
                  <td style={{ textAlign: 'right' }}>{r.last_upload ? new Date(r.last_upload).toLocaleDateString() : 'Never'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="btn"
                      type="button"
                      style={{ fontSize: '0.66rem', minHeight: 24, padding: '0.16rem 0.42rem', marginRight: 6 }}
                      onClick={() => pickFileForProject(r.project_id)}
                    >
                      {uploadingProjectId === r.project_id ? 'Uploading...' : 'Upload'}
                    </button>
                    <button
                      className="btn"
                      type="button"
                      style={{ fontSize: '0.66rem', minHeight: 24, padding: '0.16rem 0.42rem' }}
                      disabled={!r.latest_file_id}
                      onClick={() => {
                        if (!r.latest_file_id) return;
                        window.open(`/api/documents/${encodeURIComponent(r.latest_file_id)}`, '_blank');
                      }}
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass" style={{ padding: '1rem', overflow: 'hidden', marginTop: 14 }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 4 }}>Mapping Exceptions + PCL Notices</div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 10 }}>
          One queue for mapping gaps and notices to PCA. If there are no unmapped hours, lowest coverage projects are shown.
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 280, overflowY: 'auto', marginBottom: 10 }}>
          <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Project</th>
                <th style={{ textAlign: 'left' }}>Uploaded By</th>
                <th style={{ textAlign: 'right' }}>Unmapped Hrs</th>
                <th style={{ textAlign: 'right' }}>Coverage</th>
              </tr>
            </thead>
            <tbody>
              {(exceptionRows.length > 0 ? exceptionRows : fallbackRows).map((r, i) => (
                <tr key={`exc-${i}`}>
                  <td>{r.project_name}</td>
                  <td>{r.pca_name || ''}</td>
                  <td style={{ textAlign: 'right', color: Number(r.unmapped_hours || 0) > 0 ? '#f59e0b' : 'var(--text-muted)', fontWeight: 600 }}>
                    {Math.round(Number(r.unmapped_hours || 0)).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right' }}>{Number(r.coverage_pct || 0).toFixed(1)}%</td>
                </tr>
              ))}
              {(exceptionRows.length === 0 && fallbackRows.length > 0) && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No unmapped-hour exceptions right now. Showing lowest coverage projects instead.
                  </td>
                </tr>
              )}
              {fallbackRows.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No mapping data found yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-primary)', marginBottom: 8 }}>Queue Notice / Flag</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8, marginBottom: 8 }}>
            <select
              value={noticeProjectId}
              onChange={(e) => setNoticeProjectId(e.target.value)}
              style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '0.35rem 0.5rem', fontSize: '0.72rem' }}
            >
              <option value="">Select project…</option>
              {noticeProjects.map((r) => (
                <option key={r.project_id} value={r.project_id}>{r.project_name}</option>
              ))}
            </select>
            <select
              value={noticePriority}
              onChange={(e) => setNoticePriority(e.target.value as 'info' | 'warning' | 'critical')}
              style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '0.35rem 0.5rem', fontSize: '0.72rem' }}
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <textarea
            value={noticeText}
            onChange={(e) => setNoticeText(e.target.value)}
            placeholder="Enter notice / flag message to PCA..."
            rows={4}
            style={{ width: '100%', resize: 'vertical', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '0.45rem 0.55rem', fontSize: '0.72rem', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Submit disabled until notification backend is wired.</span>
            <button className="btn btn-accent" disabled style={{ fontSize: '0.72rem' }}>Queue Notice</button>
          </div>
        </div>
      </div>
    </div>
  );
}
