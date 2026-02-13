'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Guide = {
  id: string;
  title: string;
  route: string;
  owner: string;
  summary: string;
  focus: string[];
  status: 'current' | 'in-progress';
};

const guides: Guide[] = [
  {
    id: 'wbs-gantt',
    title: 'WBS Gantt',
    route: '/project-controls/wbs-gantt',
    owner: 'Project Controls',
    summary: 'Schedule management, dependency analysis, critical path, and variance mode.',
    focus: ['Timeline zoom/density', 'CPM run', 'Variance toggle with snapshot comparison', 'Task-level hours drill-down'],
    status: 'current',
  },
  {
    id: 'resourcing',
    title: 'Resourcing',
    route: '/project-controls/resourcing',
    owner: 'Project Controls',
    summary: 'Organization tree, utilization analytics, and role/employee heatmaps.',
    focus: ['Zoom-aware org tree layout', 'Employee utilization and load balancing', 'Role-based workload patterns'],
    status: 'current',
  },
  {
    id: 'project-plan',
    title: 'Project Plans',
    route: '/project-controls/folders',
    owner: 'Project Controls',
    summary: 'Upload and process project plan files, track parser and health signals.',
    focus: ['Plan upload and processing', 'Health checks and exceptions', 'Folder-level plan inventory'],
    status: 'current',
  },
  {
    id: 'tasks',
    title: 'Production Floor (Tasks)',
    route: '/insights/tasks',
    owner: 'Insights',
    summary: 'Task-level delivery operations with sprint-focused deliverable matrix and risk signals.',
    focus: ['Sprint-only view', 'Deadline-aware deliverable matrix', 'Priority demand and efficiency anatomy'],
    status: 'current',
  },
  {
    id: 'overview',
    title: 'Executive Overview',
    route: '/insights/overview-v2',
    owner: 'Insights',
    summary: 'Portfolio health, dependency impact bump chart, and executive performance trends.',
    focus: ['Portfolio KPIs', 'Dependency impact bump chart', 'Scenario impact simulation'],
    status: 'current',
  },
  {
    id: 'sprint',
    title: 'Sprint Planning',
    route: '/project-management/sprint',
    owner: 'Project Management',
    summary: 'Board, backlog, and sprint execution workflows for agile delivery.',
    focus: ['Kanban/board operations', 'Backlog hierarchy management', 'Task assignment and progress tracking'],
    status: 'current',
  },
  {
    id: 'feedback',
    title: 'Issues & Features',
    route: '/feedback',
    owner: 'Operations',
    summary: 'Central intake and progress tracking for user-reported issues and requested features.',
    focus: ['Structured issue logging prompts', 'Feature request intake', 'Status/progress/notes tracking'],
    status: 'current',
  },
];

const workflows = [
  {
    title: 'Upload and Validate a New Project Plan',
    steps: [
      'Open Project Controls → Project Plans.',
      'Upload the source plan file and wait for parsing/health checks.',
      'Confirm file appears in plan inventory and review health findings.',
      'Verify generated tasks in WBS Gantt and Production Floor views.',
    ],
  },
  {
    title: 'Investigate a Schedule Variance',
    steps: [
      'Open WBS Gantt and enable Variance mode.',
      'Select snapshot baseline and review delta columns.',
      'Drill into task hours/cost and dependency context.',
      'Log resulting issue or feature request in Issues & Features.',
    ],
  },
  {
    title: 'Capture and Track Product Feedback',
    steps: [
      'Open Issues & Features (floating button or /feedback).',
      'Use Issue form for defects: page, action, expected vs actual, error text.',
      'Use Feature form for enhancements and business context.',
      'Update status/progress/notes as work moves from planned to released.',
    ],
  },
];

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const searchParams = useSearchParams();
  const context = (searchParams.get('context') || '').toLowerCase();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guides;
    return guides.filter(g =>
      g.title.toLowerCase().includes(q)
      || g.owner.toLowerCase().includes(q)
      || g.summary.toLowerCase().includes(q)
      || g.focus.some(f => f.toLowerCase().includes(q))
      || g.route.toLowerCase().includes(q));
  }, [query]);

  const contextGuide = useMemo(() => {
    if (!context) return null;
    return guides.find(g => g.id === context) || null;
  }, [context]);

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pinnacle Help Center</h1>
          <p className="page-subtitle">
            Operational documentation for the current production workflow, including planning, controls, execution, and feedback channels.
          </p>
        </div>
        <Link href="/" className="btn btn-secondary btn-sm">Back to App</Link>
      </div>

      {contextGuide && (
        <div style={{ border: '1px solid rgba(64,224,208,0.4)', borderRadius: 12, background: 'rgba(64,224,208,0.08)', padding: '0.7rem 0.85rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--pinnacle-teal)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Context Guide
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 700, marginTop: 4 }}>{contextGuide.title}</div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 4 }}>{contextGuide.summary}</div>
          <div style={{ marginTop: 8 }}>
            <Link href={contextGuide.route} className="btn btn-primary btn-sm">Open {contextGuide.title}</Link>
          </div>
        </div>
      )}

      <div className="chart-card" style={{ padding: '0.85rem' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search guides, pages, workflows, or routes"
          style={{
            width: '100%',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            padding: '0.6rem 0.75rem',
            fontSize: '0.8rem',
          }}
        />
      </div>

      <section className="chart-card" style={{ padding: '0.9rem' }}>
        <h3 style={{ margin: 0, marginBottom: '0.7rem', fontSize: '0.95rem' }}>Core Workflows</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.7rem' }}>
          {workflows.map(w => (
            <div key={w.title} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.75rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{w.title}</div>
              <ol style={{ margin: 0, paddingLeft: '1rem', color: 'var(--text-secondary)', fontSize: '0.72rem', lineHeight: 1.5 }}>
                {w.steps.map(step => <li key={step}>{step}</li>)}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="chart-card" style={{ padding: '0.9rem' }}>
        <h3 style={{ margin: 0, marginBottom: '0.7rem', fontSize: '0.95rem' }}>Module Guides</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.7rem' }}>
          {filtered.map(g => (
            <div key={g.id} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.45rem' }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{g.title}</span>
                <span style={{
                  fontSize: '0.62rem',
                  padding: '0.12rem 0.42rem',
                  borderRadius: 999,
                  background: g.status === 'current' ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.18)',
                  color: g.status === 'current' ? '#34D399' : '#FBBF24',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}>
                  {g.status}
                </span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Owner: {g.owner}</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', lineHeight: 1.45 }}>{g.summary}</div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                {g.focus.map(f => (
                  <span key={f} style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 999, padding: '0.12rem 0.4rem' }}>
                    {f}
                  </span>
                ))}
              </div>
              <Link href={g.route} className="btn btn-secondary btn-sm">Open Page</Link>
            </div>
          ))}
        </div>
        {filtered.length === 0 && (
          <div style={{ marginTop: '0.8rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            No guides match your search.
          </div>
        )}
      </section>

      <section className="chart-card" style={{ padding: '0.9rem' }}>
        <h3 style={{ margin: 0, marginBottom: '0.7rem', fontSize: '0.95rem' }}>Operational Standards</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.45rem' }}>Issue Logging Requirements</div>
            <ul style={{ margin: 0, paddingLeft: '1rem', color: 'var(--text-secondary)', fontSize: '0.72rem', lineHeight: 1.45 }}>
              <li>Always include route/path and user action.</li>
              <li>Capture expected result and actual result.</li>
              <li>Copy exact error text and severity.</li>
              <li>Add reproducible steps in description.</li>
            </ul>
          </div>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.45rem' }}>Feature Delivery Tracking</div>
            <ul style={{ margin: 0, paddingLeft: '1rem', color: 'var(--text-secondary)', fontSize: '0.72rem', lineHeight: 1.45 }}>
              <li>Use status transitions: planned → in progress → released.</li>
              <li>Keep progress % updated with each implementation milestone.</li>
              <li>Add release notes and acceptance detail in notes field.</li>
              <li>Route all product change requests through Issues & Features page.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
