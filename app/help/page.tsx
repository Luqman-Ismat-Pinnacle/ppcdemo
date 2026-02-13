'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type GuideSection = {
  heading: string;
  details: string;
  bullets: string[];
};

type Guide = {
  id: string;
  title: string;
  route: string;
  owner: string;
  status: 'current' | 'in-progress';
  summary: string;
  sections: GuideSection[];
};

const guides: Guide[] = [
  {
    id: 'wbs-gantt',
    title: 'WBS Gantt',
    route: '/project-controls/wbs-gantt',
    owner: 'Project Controls',
    status: 'current',
    summary: 'Master schedule management with hierarchy navigation, CPM analysis, dependency mapping, baseline ghosting, and variance views.',
    sections: [
      {
        heading: 'What This Page Is For',
        details: 'WBS Gantt is the primary scheduling surface. It is used to analyze project timing, critical path behavior, resource assignment, and variance against snapshots.',
        bullets: [
          'Use this page to monitor schedule health from portfolio down to task.',
          'Use CPM to identify critical path tasks and total float risk.',
          'Use variance mode to compare current values to selected snapshots.',
        ],
      },
      {
        heading: 'Core Controls',
        details: 'The top controls let you adjust zoom, row density, expansion level, and project selection before running CPM.',
        bullets: [
          'Timeline zoom and density controls affect readability for large schedules.',
          'Level controls (`L0`, `L2`, `L3`, `All`) quickly collapse/expand hierarchy depth.',
          'Project selector + Run CPM narrows analysis to one scheduled project.',
        ],
      },
      {
        heading: 'Variance Mode (Snapshot Comparison)',
        details: 'Variance mode replaces main metrics with delta values, allowing fast budget and schedule drift review.',
        bullets: [
          'Delta columns include hours, cost, remaining, and efficiency changes.',
          'Hover variance values for themed tooltips with current, snapshot, and delta.',
          'When no snapshot row exists, values are treated as zero to keep deltas visible.',
        ],
      },
      {
        heading: 'Troubleshooting',
        details: 'When numbers or bars look wrong, validate source data and hierarchy filters first.',
        bullets: [
          'Confirm the hierarchy filter is not excluding required branches.',
          'Check task start/end dates and predecessor links in data management.',
          'If uploads recently changed structure, re-run CPM and refresh data.',
        ],
      },
    ],
  },
  {
    id: 'resourcing',
    title: 'Resourcing',
    route: '/project-controls/resourcing',
    owner: 'Project Controls',
    status: 'current',
    summary: 'Organization and utilization intelligence: manager tree, employee load distribution, capacity analytics, and heatmaps.',
    sections: [
      {
        heading: 'What This Page Is For',
        details: 'Resourcing combines organizational hierarchy and workload analytics to identify overload, underutilization, and role mismatch.',
        bullets: [
          'Use Organization tab for manager/employee relationship structure.',
          'Use Analytics tab for utilization distribution and bottlenecks.',
          'Use Heatmap tab for role or employee demand over time.',
        ],
      },
      {
        heading: 'Organization Tree Behavior',
        details: 'Tree node spacing adapts to zoom and collapse/expand state to reduce overlap and improve readability.',
        bullets: [
          'Roam (zoom/pan) changes spacing and label width in real time.',
          'Collapsed branches free layout space and prevent sibling overlap.',
          'Hover a node for employee metrics and assignment context.',
        ],
      },
      {
        heading: 'Capacity Analysis',
        details: 'Capacity views separate available, optimal, busy, and overloaded bands using utilization thresholds.',
        bullets: [
          'Available: < 50%, Optimal: 50-85%, Busy: 85-100%, Overloaded: > 100%.',
          'Use this segmentation for staffing and leveling decisions.',
          'Inspect per-employee bars to prioritize rebalance actions.',
        ],
      },
    ],
  },
  {
    id: 'project-plan',
    title: 'Project Plans',
    route: '/project-controls/folders',
    owner: 'Project Controls',
    status: 'current',
    summary: 'Plan upload and processing pipeline with parser fallback, health checks, and project synchronization.',
    sections: [
      {
        heading: 'Upload Workflow',
        details: 'Upload and process project files through the plan controls page. The page tracks upload state, parse status, and health checks.',
        bullets: [
          'Choose file and submit once; watch processing status and logs.',
          'If parser fallback is used, health checks still run on resulting task data.',
          'Processed plans should appear in project inventory after completion.',
        ],
      },
      {
        heading: 'Health and Validation',
        details: 'Each processed file can include score, passed/failed checks, and issue details.',
        bullets: [
          'Review flagged logic/resource/structure checks before scheduling decisions.',
          'Open detailed check content when score drops unexpectedly.',
          'Log persistent parser or mapping defects into Issues & Features.',
        ],
      },
    ],
  },
  {
    id: 'tasks',
    title: 'Production Floor (Tasks)',
    route: '/insights/tasks',
    owner: 'Insights',
    status: 'current',
    summary: 'Task execution cockpit with sprint-focused matrix, lifecycle diagnostics, priority-demand analysis, and sprint queueing.',
    sections: [
      {
        heading: 'Current View Model',
        details: 'The page now uses Sprint view only. Site view has been removed to avoid redundant behavior.',
        bullets: [
          'Deliverable Matrix is sorted by deadline date.',
          'Deadline column shows dates instead of days-left strings.',
          'Cards and charts are scaled for full-screen task operations.',
        ],
      },
      {
        heading: 'Decision Surfaces',
        details: 'The page combines matrix review, risk scatter, efficiency anatomy, contributor swimlanes, and sprint queueing.',
        bullets: [
          'Use Priority Demand to identify high-impact downstream risk.',
          'Use Efficiency Anatomy to inspect execute vs non-execute distribution.',
          'Use Sprint Planner queue to prepare handoff to sprint execution.',
        ],
      },
    ],
  },
  {
    id: 'overview',
    title: 'Executive Overview',
    route: '/insights/overview-v2',
    owner: 'Insights',
    status: 'current',
    summary: 'Portfolio-level decision dashboard with KPI rollups, predictive views, and dependency impact bump chart.',
    sections: [
      {
        heading: 'Dependency Impact Bump Chart',
        details: 'Dependency analysis now uses bump chart ranking over time windows instead of graph layout. This improves trend readability and scenario comparison.',
        bullets: [
          'Each line is a task track with rank movement across time buckets.',
          'Critical, blocked, risk, and scenario-impacted tracks are color-coded.',
          'Use scenario controls to project downstream impact from a delayed task.',
        ],
      },
      {
        heading: 'Executive KPI Interpretation',
        details: 'Health score, completion, and variance should be interpreted together rather than independently.',
        bullets: [
          'High completion with high variance indicates execution speed with budget/cost trade-off.',
          'Low completion with blocked dependencies indicates sequencing bottleneck.',
          'Use dependency rank movement to prioritize intervention targets.',
        ],
      },
    ],
  },
  {
    id: 'sprint',
    title: 'Sprint Planning',
    route: '/project-management/sprint',
    owner: 'Project Management',
    status: 'current',
    summary: 'Planning and execution workspace across boards, backlog, tasks, and analytics.',
    sections: [
      {
        heading: 'Board and Backlog UX',
        details: 'Cards use themed icon actions and title-first presentation to improve scanning clarity.',
        bullets: [
          'Card headers emphasize work-item names over numeric IDs.',
          'Edit/delete controls use SVG icons for consistent design language.',
          'Backlog hierarchy supports rapid expand/collapse control.',
        ],
      },
      {
        heading: 'Operational Usage',
        details: 'Use backlog for decomposition and assignment readiness, then move to board for execution-state flow.',
        bullets: [
          'Create/update epics, features, stories, and tasks from one workspace.',
          'Assign sprint membership before moving to task-level execution.',
          'Keep item status transitions synchronized with actual task work.',
        ],
      },
    ],
  },
  {
    id: 'feedback',
    title: 'Issues & Features',
    route: '/feedback',
    owner: 'Operations',
    status: 'current',
    summary: 'Central intake and tracking for defects and feature requests, including status, progress, and implementation notes.',
    sections: [
      {
        heading: 'Issue Intake Standard',
        details: 'Issue logging enforces structured prompts to improve triage quality and reproducibility.',
        bullets: [
          'Capture page route, triggering action, expected result, actual result, and exact error text.',
          'Set severity for prioritization and SLA handling.',
          'Use detailed description for steps-to-reproduce.',
        ],
      },
      {
        heading: 'Feature Lifecycle Tracking',
        details: 'Feature requests move through planned/in-progress/released states with explicit progress percentage and notes.',
        bullets: [
          'Progress % communicates implementation maturity.',
          'Notes should include release details, dependencies, and rollout considerations.',
          'Use this page as the source of truth for user-requested enhancements.',
        ],
      },
      {
        heading: 'Runtime Error Capture',
        details: 'Unhandled runtime failures can be logged directly from ErrorBoundary fallback.',
        bullets: [
          'Use `Add to Issues Log` immediately after a crash.',
          'Runtime logs include page path, message, and stack metadata.',
          'Follow up in Issues view to set status and triage notes.',
        ],
      },
    ],
  },
];

const searchTextForGuide = (guide: Guide): string => [
  guide.title,
  guide.route,
  guide.owner,
  guide.summary,
  ...guide.sections.map(s => `${s.heading} ${s.details} ${s.bullets.join(' ')}`),
].join(' ').toLowerCase();

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const searchParams = useSearchParams();
  const context = (searchParams.get('context') || '').toLowerCase();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guides;
    return guides.filter(g => searchTextForGuide(g).includes(q));
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
            Detailed operational documentation for current production behavior, workflows, and troubleshooting.
          </p>
        </div>
        <Link href="/" className="btn btn-secondary btn-sm">Back to App</Link>
      </div>

      {contextGuide && (
        <div style={{ border: '1px solid rgba(64,224,208,0.4)', borderRadius: 12, background: 'rgba(64,224,208,0.08)', padding: '0.75rem 0.9rem' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--pinnacle-teal)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current Page Context</div>
          <div style={{ marginTop: 6, fontSize: '0.94rem', fontWeight: 700, color: 'var(--text-primary)' }}>{contextGuide.title}</div>
          <div style={{ marginTop: 4, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{contextGuide.summary}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: '0.5rem' }}>
            <Link href={contextGuide.route} className="btn btn-primary btn-sm">Open {contextGuide.title}</Link>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExpanded(prev => ({ ...prev, [contextGuide.id]: true }))}>
              Expand Documentation
            </button>
          </div>
        </div>
      )}

      <div className="chart-card" style={{ padding: '0.85rem' }}>
        <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 6 }}>
          Search across module names, route paths, section headings, operational details, and troubleshooting guidance
        </label>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search all help content..."
          style={{
            width: '100%',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            padding: '0.62rem 0.78rem',
            fontSize: '0.82rem',
          }}
        />
      </div>

      <section className="chart-card" style={{ padding: '0.95rem' }}>
        <h3 style={{ margin: 0, marginBottom: '0.8rem', fontSize: '0.98rem' }}>Detailed Module Documentation</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {filtered.map(guide => {
            const isOpen = !!expanded[guide.id] || !!query.trim();
            return (
              <article key={guide.id} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                <div style={{ padding: '0.8rem 0.9rem', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: 5 }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{guide.title}</span>
                    <span style={{
                      fontSize: '0.62rem',
                      padding: '0.1rem 0.42rem',
                      borderRadius: 999,
                      background: guide.status === 'current' ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.18)',
                      color: guide.status === 'current' ? '#34D399' : '#FBBF24',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                    }}>
                      {guide.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 5 }}>
                    Owner: {guide.owner} | Route: <code>{guide.route}</code>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: 8 }}>{guide.summary}</div>
                  <div style={{ display: 'flex', gap: '0.45rem' }}>
                    <Link href={guide.route} className="btn btn-primary btn-sm">Open Page</Link>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setExpanded(prev => ({ ...prev, [guide.id]: !isOpen }))}
                    >
                      {isOpen ? 'Hide Details' : 'Show Details'}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ padding: '0.85rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {guide.sections.map(section => (
                      <div key={`${guide.id}-${section.heading}`} style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-card)', padding: '0.7rem' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{section.heading}</div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 6 }}>{section.details}</div>
                        <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {section.bullets.map(b => <li key={b}>{b}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: '0.9rem', color: 'var(--text-muted)', fontSize: '0.74rem' }}>
              No documentation sections match your search query.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
