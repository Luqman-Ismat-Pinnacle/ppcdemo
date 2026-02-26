'use client';

/**
 * @fileoverview COO + AI Q&A view (Phase 7.5).
 *
 * Executive KPI panel plus lightweight AI-style narrative responses generated
 * from the current filtered dataset and shared metrics.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/data-context';
import { buildPortfolioAggregate, buildProjectBreakdown } from '@/lib/calculations/selectors';
import MetricProvenanceChip from '@/components/ui/MetricProvenanceChip';

function answerForQuery(query: string, snapshot: {
  projects: number;
  health: number;
  spi: number;
  cpi: number;
  variance: number;
  atRisk: number;
  completed: number;
  totalTasks: number;
}): string {
  const q = query.toLowerCase();
  if (q.includes('schedule') || q.includes('spi')) {
    return `Schedule posture: SPI ${snapshot.spi.toFixed(2)} with ${snapshot.atRisk} at-risk projects out of ${snapshot.projects}.`;
  }
  if (q.includes('cost') || q.includes('cpi') || q.includes('budget')) {
    return `Cost posture: CPI ${snapshot.cpi.toFixed(2)} and hours variance ${snapshot.variance}% across current scope.`;
  }
  if (q.includes('risk') || q.includes('alert')) {
    return `${snapshot.atRisk} projects are in the risk queue; focus escalation on SPI/CPI < 0.90 cohorts first.`;
  }
  if (q.includes('delivery') || q.includes('complete')) {
    const pct = snapshot.totalTasks > 0 ? Math.round((snapshot.completed / snapshot.totalTasks) * 100) : 0;
    return `Delivery progress: ${snapshot.completed}/${snapshot.totalTasks} tasks complete (${pct}%).`;
  }
  return `Executive snapshot: health ${snapshot.health}%, SPI ${snapshot.spi.toFixed(2)}, CPI ${snapshot.cpi.toFixed(2)}, at-risk projects ${snapshot.atRisk}/${snapshot.projects}.`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export default function CooRoleViewPage() {
  const { filteredData, data: fullData } = useData();
  const [question, setQuestion] = useState('What is the biggest execution risk right now?');

  const data = useMemo(() => ({
    tasks: (filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || [],
    projects: (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [],
    hours: (filteredData?.hours?.length ? filteredData.hours : fullData?.hours) || [],
    sites: (filteredData?.sites?.length ? filteredData.sites : fullData?.sites) || [],
  }), [filteredData, fullData]);

  const projectBreakdown = useMemo(
    () => buildProjectBreakdown(data.tasks, data.projects, data.hours, data.sites, 'project'),
    [data.tasks, data.projects, data.hours, data.sites]
  );

  const aggregate = useMemo(
    () => buildPortfolioAggregate(projectBreakdown, 'project'),
    [projectBreakdown]
  );

  const tasks = ((data.tasks || []) as unknown[]).map(asRecord);
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => Number(task.percentComplete || 0) >= 100).length;
  const atRisk = projectBreakdown.filter((project) => project.spi < 0.9 || project.cpi < 0.9 || project.variance > 20).length;

  const response = useMemo(
    () => answerForQuery(question, {
      projects: aggregate.projectCount,
      health: aggregate.healthScore,
      spi: aggregate.spi,
      cpi: aggregate.cpi,
      variance: aggregate.hrsVariance,
      atRisk,
      completed: completedTasks,
      totalTasks,
    }),
    [question, aggregate.projectCount, aggregate.healthScore, aggregate.spi, aggregate.cpi, aggregate.hrsVariance, atRisk, completedTasks, totalTasks]
  );

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Role View</div>
          <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.5rem' }}>COO + AI Q&amp;A</h1>
          <div style={{ marginTop: '0.3rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Executive operating picture with narrative Q&amp;A grounded in live metrics.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href="/role-views/coo/period-review" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Period Review</Link>
          <Link href="/role-views/coo/commitments" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Commitments</Link>
          <Link href="/role-views/coo/ai" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>AI</Link>
          <Link href="/role-views/coo/wbs" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>WBS</Link>
          <Link href="/role-views" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Hub</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
        {[
          { label: 'Portfolio Health', value: `${aggregate.healthScore}%`, provenance: aggregate.provenance.health },
          { label: 'SPI', value: aggregate.spi.toFixed(2), provenance: aggregate.provenance.spi },
          { label: 'CPI', value: aggregate.cpi.toFixed(2), provenance: aggregate.provenance.cpi },
          { label: 'Hours Variance', value: `${aggregate.hrsVariance}%`, provenance: aggregate.provenance.hoursVariance },
          { label: 'Projects At Risk', value: `${atRisk}/${aggregate.projectCount}` },
          { label: 'Task Completion', value: `${completedTasks}/${totalTasks}` },
        ].map((item) => (
          <div key={item.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.75rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              {item.label}
              {'provenance' in item && item.provenance ? <MetricProvenanceChip provenance={item.provenance} /> : null}
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '0.35rem', color: 'var(--text-primary)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.9rem' }}>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '0.6rem' }}>Ask the Operating Data</div>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={4}
            style={{ width: '100%', resize: 'vertical', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', padding: '0.6rem', fontSize: '0.8rem' }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.55rem' }}>
            {[
              'How is schedule performance trending?',
              'What is the biggest execution risk right now?',
              'Do we have cost pressure?',
              'How much work is completed?',
            ].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setQuestion(preset)}
                style={{ borderRadius: 999, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '0.68rem', padding: '0.25rem 0.55rem' }}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.9rem' }}>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '0.6rem' }}>AI Response</div>
          <div style={{ fontSize: '0.82rem', lineHeight: 1.55, color: 'var(--text-primary)' }}>{response}</div>
          <div style={{ marginTop: '0.7rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            Responses are generated from current filtered metrics, not static text.
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.9rem', maxHeight: 290, overflowY: 'auto' }}>
        <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '0.55rem' }}>Top Project Movers</div>
        {projectBreakdown.length === 0 ? (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No project data in active scope.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 80px', gap: '0.35rem 0.6rem', fontSize: '0.73rem' }}>
            <div style={{ color: 'var(--text-muted)' }}>Project</div>
            <div style={{ color: 'var(--text-muted)' }}>SPI</div>
            <div style={{ color: 'var(--text-muted)' }}>CPI</div>
            <div style={{ color: 'var(--text-muted)' }}>Variance</div>
            {[...projectBreakdown].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 12).map((project) => (
              <React.Fragment key={project.id}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</div>
                <div style={{ color: project.spi < 0.9 ? '#EF4444' : 'var(--text-secondary)' }}>{project.spi.toFixed(2)}</div>
                <div style={{ color: project.cpi < 0.9 ? '#EF4444' : 'var(--text-secondary)' }}>{project.cpi.toFixed(2)}</div>
                <div style={{ color: Math.abs(project.variance) > 20 ? '#EF4444' : 'var(--text-secondary)' }}>{project.variance}%</div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
