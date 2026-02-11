'use client';

/**
 * Print-friendly Project Health Report view.
 * Opened from the Project Plans page using a storagePath query param.
 * Users can then use the browser's "Save as PDF" from the print dialog.
 *
 * NOTE: This page is client-only and not pre-rendered; it uses
 * `typeof window !== 'undefined'` to safely read search params.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '@/lib/data-context';

export default function ProjectHealthReportPage() {
  const { data } = useData();

  const [storagePath, setStoragePath] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      setStoragePath(sp.get('storagePath'));
    }
  }, []);

  const report = useMemo(() => {
    if (!storagePath) return null;
    const doc = (data.projectDocuments || []).find((d: any) =>
      (d.storagePath === storagePath || d.storage_path === storagePath)
    );
    if (!doc) return null;
    const health = doc.healthCheckJson || doc.health_check_json;
    if (!health) return null;
    return {
      fileName: doc.fileName || doc.name || storagePath,
      score: health.score ?? 0,
      passed: health.passed ?? 0,
      totalChecks: health.totalChecks ?? 0,
      results: health.results || [],
      issues: health.issues || [],
    };
  }, [storagePath, data.projectDocuments]);

  if (!storagePath) {
    return <div style={{ padding: '2rem', color: 'var(--text-primary)' }}>No storagePath specified.</div>;
  }
  if (!report) {
    return <div style={{ padding: '2rem', color: 'var(--text-primary)' }}>No health report found for this file.</div>;
  }

  const failedChecks = report.results.filter((r: any) => !r.passed);

  return (
    <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto', color: 'var(--text-primary)', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 600 }}>Project Health Report</h1>
        <button
          onClick={() => window.print()}
          style={{
            padding: '0.4rem 0.9rem',
            borderRadius: 4,
            border: '1px solid var(--border-color)',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >
          Print / Save as PDF
        </button>
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>File</div>
        <div style={{ fontWeight: 500 }}>{report.fileName}</div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          padding: '1rem',
          background:
            report.score >= 80 ? 'rgba(16,185,129,0.1)' : report.score >= 50 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
          borderRadius: 6,
          marginBottom: '1.5rem',
          border: `1px solid ${
            report.score >= 80 ? 'rgba(16,185,129,0.3)' : report.score >= 50 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'
          }`,
        }}
      >
        <div
          style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            color: report.score >= 80 ? '#10B981' : report.score >= 50 ? '#F59E0B' : '#EF4444',
          }}
        >
          {report.score}%
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
            {report.score >= 80 ? 'Good Health' : report.score >= 50 ? 'Needs Improvement' : 'Critical Issues'}
          </div>
          <div style={{ fontSize: '0.85rem', marginTop: 2, color: 'var(--text-secondary)' }}>
            {report.passed} of {report.totalChecks} checks passed
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>All Checks</h2>
      <div style={{ display: 'grid', gap: 6, marginBottom: '1.5rem' }}>
        {report.results.map((r: any, idx: number) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '8px 12px',
              background: r.passed ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
              borderRadius: 4,
              borderLeft: `3px solid ${r.passed ? '#10B981' : '#EF4444'}`,
            }}
          >
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>{r.passed ? '✓' : '✗'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{r.checkName}</div>
              {r.message && (
                <div style={{ fontSize: '0.8rem', color: r.passed ? 'var(--text-muted)' : '#F59E0B', marginTop: 2 }}>{r.message}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {failedChecks.length === 0 && (
        <div
          style={{
            padding: '1rem',
            background: 'rgba(16,185,129,0.08)',
            borderRadius: 6,
            border: '1px solid rgba(16,185,129,0.2)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '0.9rem', marginBottom: 6, fontWeight: 600, color: '#10B981' }}>All health checks passed</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            This project plan follows best practices and is ready for execution tracking.
          </div>
        </div>
      )}
    </div>
  );
}

