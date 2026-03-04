'use client';

/**
 * Modern Dashboard Example
 *
 * This component demonstrates how to use the enhanced UI components
 * and styling system for a professional, modern look.
 */

import React, { useMemo, useState } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  StatusBadge,
  MetricRow,
  Skeleton,
  SkeletonCard,
} from '@/components/ui';
import {
  type SortState,
  formatSortIndicator,
  getNextSortState,
  sortByState,
} from '@/lib/sort-utils';

export default function ModernDashboardExample() {
  const [loading, setLoading] = useState(false);
  const [projectSort, setProjectSort] = useState<SortState | null>(null);

  const metrics = [
    {
      label: 'Total Revenue',
      value: '$124,500',
      change: { value: 12.5, trend: 'up' as const },
      accentColor: 'var(--pinnacle-teal)',
    },
    {
      label: 'Active Projects',
      value: '42',
      change: { value: 8.2, trend: 'up' as const },
      accentColor: 'var(--pinnacle-lime)',
    },
    {
      label: 'Completion Rate',
      value: '94%',
      change: { value: 3.1, trend: 'neutral' as const },
      accentColor: 'var(--pinnacle-pink)',
    },
    {
      label: 'Team Members',
      value: '156',
      change: { value: 2.4, trend: 'down' as const },
      accentColor: 'var(--pinnacle-orange)',
    },
  ];

  const projectRows = useMemo(() => ([
    { name: 'Project Alpha', status: 'active', progress: 75, budget: '$45,000', hours: 320 },
    { name: 'Project Beta', status: 'in-progress', progress: 45, budget: '$32,000', hours: 180 },
    { name: 'Project Gamma', status: 'completed', progress: 100, budget: '$28,000', hours: 240 },
    { name: 'Project Delta', status: 'pending', progress: 15, budget: '$52,000', hours: 80 },
  ]), []);

  const sortedProjects = useMemo(() => {
    return sortByState(projectRows, projectSort, (project, key) => {
      switch (key) {
        case 'name':
          return project.name;
        case 'status':
          return project.status;
        case 'progress':
          return project.progress;
        case 'budget':
          return Number(project.budget.replace(/[^0-9.-]+/g, ''));
        case 'hours':
          return project.hours;
        default:
          return null;
      }
    });
  }, [projectRows, projectSort]);

  return (
    <div className="page-panel">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Modern Dashboard</h1>
          <p className="page-description">
            Example implementation of the enhanced UI/UX design system
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" size="md">
            Export
          </Button>
          <Button variant="primary" size="md" loading={loading}>
            Generate Report
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <MetricRow metrics={metrics} loading={loading} />

      {/* Dashboard Grid */}
      <div className="dashboard-grid">
        {/* Full Width Card */}
        <div className="grid-full">
          <Card hover gradient>
            <CardHeader
              title="Project Overview"
              subtitle="Real-time project analytics and insights"
              action={
                <div className="flex gap-2">
                  <StatusBadge status="active" />
                  <Badge variant="info">Live Data</Badge>
                </div>
              }
            />
            <CardBody>
              {loading ? (
                <SkeletonCard />
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-[var(--text-secondary)]">
                    This card demonstrates the enhanced design with gradient
                    backgrounds, hover effects, and modern spacing.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="success">Completed</Badge>
                    <Badge variant="warning">In Progress</Badge>
                    <Badge variant="danger">Blocked</Badge>
                    <Badge variant="neutral">Pending</Badge>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Two Column Cards */}
        <div className="grid-half">
          <Card hover className="h-full">
            <CardHeader
              title="Team Performance"
              subtitle="Last 30 days"
            />
            <CardBody>
              <div className="space-y-3">
                {[1, 2, 3, 4].map((_, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center p-3 rounded-lg bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)] transition-all"
                  >
                    <span className="text-sm text-[var(--text-secondary)]">
                      Metric {index + 1}
                    </span>
                    <span className="text-sm font-bold text-[var(--pinnacle-teal)]">
                      {85 + index * 3}%
                    </span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="grid-half">
          <Card hover className="h-full">
            <CardHeader
              title="Recent Activity"
              subtitle="Latest updates"
            />
            <CardBody>
              <div className="space-y-3">
                {['Task completed', 'New project added', 'Team member joined', 'Report generated'].map((activity, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 animate-fade-in"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="w-2 h-2 rounded-full bg-[var(--pinnacle-teal)] mt-2 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-[var(--text-primary)]">
                        {activity}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {index + 1} hour ago
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Data Table Example */}
        <div className="grid-full">
          <Card>
            <CardHeader
              title="Project List"
              subtitle="Active projects overview"
            />
            <CardBody noPadding>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      {[
                        { key: 'name', label: 'Project Name' },
                        { key: 'status', label: 'Status' },
                        { key: 'progress', label: 'Progress' },
                        { key: 'budget', label: 'Budget', align: 'number' },
                        { key: 'hours', label: 'Hours', align: 'number' },
                      ].map(({ key, label, align }) => {
                        const indicator = formatSortIndicator(projectSort, key);
                        return (
                          <th key={key} className={align}>
                            <button
                              type="button"
                              onClick={() => setProjectSort(prev => getNextSortState(prev, key))}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                color: 'inherit',
                                cursor: 'pointer',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              {label}
                              {indicator && <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>{indicator}</span>}
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProjects.map((project, index) => (
                      <tr key={index} className="animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
                        <td className="font-semibold">{project.name}</td>
                        <td>
                          <StatusBadge status={project.status as any} showDot />
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-[var(--pinnacle-teal)] to-[var(--pinnacle-lime)] transition-all duration-500"
                                style={{ width: `${project.progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-[var(--text-muted)] min-w-[3rem]">
                              {project.progress}%
                            </span>
                          </div>
                        </td>
                        <td className="number font-mono">{project.budget}</td>
                        <td className="number font-mono">{project.hours}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-center mt-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLoading(!loading)}
        >
          Toggle Loading
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={() => alert('Secondary action')}
        >
          Secondary Action
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={() => alert('Primary action')}
        >
          Primary Action
        </Button>
      </div>
    </div>
  );
}
