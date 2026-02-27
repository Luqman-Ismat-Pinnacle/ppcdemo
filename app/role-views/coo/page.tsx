'use client';

import React, { useEffect, useMemo, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import CommandCenterSection from '@/components/command-center/CommandCenterSection';
import DecisionQueueCard from '@/components/command-center/DecisionQueueCard';
import OffenderList from '@/components/command-center/OffenderList';
import { useData } from '@/lib/data-context';

type CooSummary = {
  success: boolean;
  computedAt: string;
  warnings?: string[];
  sections: {
    topThree: { portfolioHealth: number; periodEfficiency: number; decisionsRequired: number };
    decisionQueue: Array<{ id: string; severity: string; title: string; detail: string; age: string }>;
    periodPerformance: {
      completionRate: number;
      openCommitments: number;
      topMovers: Array<{ name: string; health: number }>;
    };
    bySeniorManager: Array<{ manager: string; projectCount: number; avgHealth: number | null; alertCount: number }>;
    commandCenter: {
      hoursVariance: {
        plan: number;
        actual: number;
        added: number;
        reduced: number;
        deltaHours: number;
        deltaPct: number;
        fteEquivalent: number;
        baselineHours: number;
        remainingHours: number;
      };
      scheduleVariance: {
        actualPercentComplete: number;
        plannedPercentComplete: number;
        deltaPercentPoints: number;
        deltaHours: number;
        evHours: number;
        pvHours: number;
      };
      periodEfficiencySummary: {
        executePct: number;
        qualityPct: number;
        nonExecutePct: number;
        totalHours: number;
      };
      milestoneStatus: {
        completedOnTime: number;
        completedDelayed: number;
        inProgressForecastedOnTime: number;
        inProgressForecastedDelayed: number;
        notStartedForecastedOnTime: number;
        notStartedForecastedDelayed: number;
      };
    };
  };
};

export default function CooRoleViewPage() {
  const [payload, setPayload] = useState<CooSummary | null>(null);
  const { filteredData } = useData();
  const [expandedPeriodRowId, setExpandedPeriodRowId] = useState<string | null>(null);
  const [wbsSortKey, setWbsSortKey] = useState<'project' | 'schedule' | 'baseline' | 'maintenance' | 'docs' | 'overall'>('overall');
  const [wbsSortDir, setWbsSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const response = await fetch('/api/role-views/coo/summary', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!cancelled && response.ok && result.success) setPayload(result as CooSummary);
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const wbsHealthRows = useMemo(() => {
    const projects = (filteredData.projects || []) as any[];
    const tasks = (filteredData.tasks || []) as any[];
    const milestones = (filteredData.milestones || []) as any[];
    const deliverables = (filteredData.deliverables || []) as any[];

    const tasksByProject = new Map<string, any[]>();
    tasks.forEach((t: any) => {
      const pid = String(t.projectId ?? t.project_id ?? '').trim();
      if (!pid) return;
      if (!tasksByProject.has(pid)) tasksByProject.set(pid, []);
      tasksByProject.get(pid)!.push(t);
    });

    const milestonesByProject = new Map<string, any[]>();
    milestones.forEach((m: any) => {
      const pid = String(m.projectId || m.project_id || '').trim();
      if (!pid) return;
      if (!milestonesByProject.has(pid)) milestonesByProject.set(pid, []);
      milestonesByProject.get(pid)!.push(m);
    });

    const deliverablesByProject = new Map<string, any[]>();
    deliverables.forEach((d: any) => {
      const pid = String(d.projectId || d.project_id || '').trim();
      if (!pid) return;
      if (!deliverablesByProject.has(pid)) deliverablesByProject.set(pid, []);
      deliverablesByProject.get(pid)!.push(d);
    });

    type Row = {
      projectId: string;
      name: string;
      schedulePct: number;
      baselineHours: number;
      actualHours: number;
      maintenancePct: number;
      scheduleHealth: 'good' | 'warning' | 'bad';
      costHealth: 'good' | 'warning' | 'bad';
      docsPct: number;
      overallCompliance: number;
    };

    const rows: Row[] = [];

    projects.forEach((project: any) => {
      const projectId = String(project.id || project.projectId || '').trim();
      const name = String(project.name || project.projectName || projectId || 'Unnamed project');
      if (!projectId) return;

      const projectTasks = tasksByProject.get(projectId) || [];
      let baselineHours = Number(project.baselineHours ?? project.baseline_hours ?? 0) || 0;
      let actualHours = Number(project.actualHours ?? project.actual_hours ?? 0) || 0;
      let percentComplete = Number(project.percentComplete ?? project.percent_complete ?? 0) || 0;

      if (baselineHours === 0 && projectTasks.length > 0) {
        baselineHours = projectTasks.reduce((s: number, t: any) => s + (Number(t.baselineHours ?? t.baseline_hours ?? 0) || 0), 0);
      }
      if (actualHours === 0 && projectTasks.length > 0) {
        actualHours = projectTasks.reduce((s: number, t: any) => s + (Number(t.actualHours ?? t.actual_hours ?? 0) || 0), 0);
      }
      if (percentComplete === 0 && projectTasks.length > 0 && baselineHours > 0) {
        const earned = projectTasks.reduce((s: number, t: any) => {
          const bl = Number(t.baselineHours ?? t.baseline_hours ?? 0) || 0;
          const pct = Number(t.percentComplete ?? t.percent_complete ?? 0) || 0;
          return s + bl * (pct / 100);
        }, 0);
        percentComplete = (earned / baselineHours) * 100;
      }

      const projectMilestones = milestonesByProject.get(projectId) || [];
      const lateMilestones = projectMilestones.filter((m) => Number(m.varianceDays ?? m.variance_days ?? 0) > 0);
      const scheduleHealth: Row['scheduleHealth'] =
        lateMilestones.length === 0 ? 'good' : percentComplete >= 80 ? 'warning' : 'bad';

      const cpi = Number(project.cpi ?? 1);
      const costHealth: Row['costHealth'] =
        cpi >= 1 ? 'good' : cpi >= 0.9 ? 'warning' : 'bad';

      const projectDeliverables = deliverablesByProject.get(projectId) || [];
      const approvedDocs = projectDeliverables.filter((d) => {
        const status = String(d.status || d.drdStatus || '').toLowerCase();
        return status.includes('approved') || status.includes('signed') || status.includes('complete');
      }).length;
      const docsPct =
        projectDeliverables.length > 0
          ? (approvedDocs / projectDeliverables.length) * 100
          : 0;

      const maintenanceHours = 0; // placeholder – maintenance tagging not yet wired
      const maintenancePct =
        baselineHours > 0 ? (maintenanceHours / baselineHours) * 100 : 0;

      const scheduleScore = scheduleHealth === 'good' ? 100 : scheduleHealth === 'warning' ? 60 : 30;
      const costScore = costHealth === 'good' ? 100 : costHealth === 'warning' ? 60 : 30;
      const docsScore = docsPct;
      const maintenanceScore = 100 - Math.min(maintenancePct, 100);
      const overallCompliance =
        (scheduleScore + costScore + docsScore + maintenanceScore) / 4;

      rows.push({
        projectId,
        name,
        schedulePct: percentComplete,
        baselineHours,
        actualHours,
        maintenancePct,
        scheduleHealth,
        costHealth,
        docsPct,
        overallCompliance,
      });
    });

    return rows;
  }, [filteredData]);

  const sortedWbsRows = useMemo(() => {
    const rows = [...wbsHealthRows];
    const dir = wbsSortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (wbsSortKey) {
        case 'project':
          return a.name.localeCompare(b.name) * dir;
        case 'schedule':
          return (a.schedulePct - b.schedulePct) * dir;
        case 'baseline':
          return (a.baselineHours - b.baselineHours) * dir;
        case 'maintenance':
          return (a.maintenancePct - b.maintenancePct) * dir;
        case 'docs':
          return (a.docsPct - b.docsPct) * dir;
        case 'overall':
        default:
          return (a.overallCompliance - b.overallCompliance) * dir;
      }
    });
    return rows;
  }, [wbsHealthRows, wbsSortKey, wbsSortDir]);

  const milestoneBuckets = useMemo(() => {
    const rows = [
      ...(filteredData.milestones || []),
      ...(filteredData.milestonesTable || []),
    ] as any[];

    const buckets = {
      completedOnTime: 0,
      completedDelayed: 0,
      inProgressForecastedOnTime: 0,
      inProgressForecastedDelayed: 0,
      notStartedForecastedOnTime: 0,
      notStartedForecastedDelayed: 0,
    };

    rows.forEach((m) => {
      const status = String(m.status || '').toLowerCase();
      const pct = Number(m.percentComplete || m.percent_complete || 0);
      const varianceDays = Number(m.varianceDays || m.variance_days || 0);
      const delayed = varianceDays > 0;
      const isCompleted = status.includes('complete') || pct >= 100;
      const isNotStarted = status.includes('not') || pct === 0;

      if (isCompleted) {
        if (delayed) buckets.completedDelayed += 1;
        else buckets.completedOnTime += 1;
      } else if (isNotStarted) {
        if (delayed) buckets.notStartedForecastedDelayed += 1;
        else buckets.notStartedForecastedOnTime += 1;
      } else {
        if (delayed) buckets.inProgressForecastedDelayed += 1;
        else buckets.inProgressForecastedOnTime += 1;
      }
    });

    return buckets;
  }, [filteredData.milestones, filteredData.milestonesTable]);

  const periodRows = useMemo(() => {
    if (!payload) return [];
    const portfolioHealth = payload.sections.topThree.portfolioHealth ?? 0;
    return (payload.sections.periodPerformance.topMovers || []).map((row, index) => {
      const delta = (row.health ?? 0) - portfolioHealth;
      return {
        id: `${row.name}-${index}`,
        name: row.name,
        health: row.health,
        deltaVsPortfolio: delta,
      };
    });
  }, [payload]);

  return (
    <RoleWorkstationShell role="coo" title="COO Command Center" subtitle="Executive decision surface for portfolio health, commitments, and escalations.">
      {payload?.warnings?.length ? <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{payload.warnings.join(' ')}</div> : null}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <CommandCenterSection title="Portfolio Variance in Three Numbers" freshness={payload?.computedAt || null}>
          {payload?.sections.commandCenter ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '0.55rem' }}>
              {/* Hours Variance */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.6rem' }}>
                <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Hours Variance</div>
                <div style={{ marginTop: 4, fontWeight: 900, fontSize: '1.05rem' }}>
                  {Math.round(payload.sections.commandCenter.hoursVariance.added) >= 0 ? '+' : ''}
                  {Math.round(payload.sections.commandCenter.hoursVariance.added).toLocaleString()} hrs added
                </div>
                <div style={{ marginTop: 3, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  Plan {Math.round(payload.sections.commandCenter.hoursVariance.plan).toLocaleString()}h · Actual {Math.round(payload.sections.commandCenter.hoursVariance.actual).toLocaleString()}h
                </div>
                <div style={{ marginTop: 2, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  ≈ {payload.sections.commandCenter.hoursVariance.fteEquivalent.toFixed(1)} FTE equivalent (approx.)
                </div>
              </div>
              {/* Schedule Variance */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.6rem' }}>
                <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Schedule Variance</div>
                <div style={{ marginTop: 4, fontWeight: 900, fontSize: '1.05rem' }}>
                  Actual {payload.sections.commandCenter.scheduleVariance.actualPercentComplete.toFixed(1)}%{' '}
                  | Plan {payload.sections.commandCenter.scheduleVariance.plannedPercentComplete.toFixed(1)}%
                </div>
                <div style={{ marginTop: 3, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  Δ {payload.sections.commandCenter.scheduleVariance.deltaPercentPoints.toFixed(1)} pts ·{' '}
                  {payload.sections.commandCenter.scheduleVariance.deltaHours >= 0 ? '+' : ''}
                  {Math.round(payload.sections.commandCenter.scheduleVariance.deltaHours).toLocaleString()}h vs plan
                </div>
              </div>
              {/* Items for My Attention */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.6rem' }}>
                <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Items for My Attention</div>
                <div style={{ marginTop: 4, fontWeight: 900, fontSize: '1.05rem' }}>
                  {(payload.sections.decisionQueue || []).length}
                </div>
                <div style={{ marginTop: 3, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  Escalations and executive decisions only.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No variance summary available.</div>
          )}
        </CommandCenterSection>

        <CommandCenterSection title="Decision Queue">
          <div style={{ display: 'grid', gap: '0.45rem' }}>
            {(payload?.sections.decisionQueue || []).map((row) => (
              <DecisionQueueCard
                key={row.id}
                title={row.title}
                detail={row.detail}
                severity={row.severity}
                age={row.age}
                actions={[
                  { label: 'View Project', href: '/project-controls/wbs-gantt-v2' },
                  { label: 'Escalate', href: '/role-views/senior-manager' },
                ]}
              />
            ))}
            {!payload?.sections.decisionQueue?.length ? <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>No decisions pending.</div> : null}
          </div>
        </CommandCenterSection>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
          <CommandCenterSection title="Period Performance">
            {payload ? (
              <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ padding: '0.45rem 0.65rem', borderRadius: 999, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', minWidth: 160 }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Task Completion Rate</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800 }}>
                      {payload.sections.periodPerformance.completionRate.toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ padding: '0.45rem 0.65rem', borderRadius: 999, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', minWidth: 160 }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Open Commitments</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800 }}>
                      {payload.sections.periodPerformance.openCommitments}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Variance in health is calculated as **project health – portfolio health**, highlighting the biggest movers for this period.
                </div>

                <div style={{ borderRadius: 10, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 0.9fr 0.8fr', gap: 4, padding: '0.4rem 0.6rem', fontSize: '0.7rem', background: 'var(--bg-secondary)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    <span>Project / Unit</span>
                    <span style={{ textAlign: 'right' }}>Health</span>
                    <span style={{ textAlign: 'right' }}>Δ vs portfolio</span>
                    <span />
                  </div>
                  {periodRows.length === 0 ? (
                    <div style={{ padding: '0.5rem 0.6rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      No movers for this period.
                    </div>
                  ) : (
                    periodRows.map((row) => {
                      const positive = row.deltaVsPortfolio > 0;
                      const neutral = row.deltaVsPortfolio === 0;
                      const deltaColor = neutral
                        ? 'var(--text-muted)'
                        : positive
                          ? '#22C55E'
                          : '#EF4444';
                      return (
                        <div
                          key={row.id}
                          style={{
                            borderTop: '1px solid rgba(148,163,184,0.25)',
                            background:
                              expandedPeriodRowId === row.id ? 'rgba(15,23,42,0.85)' : 'transparent',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPeriodRowId(
                                expandedPeriodRowId === row.id ? null : row.id,
                              )
                            }
                            style={{
                              width: '100%',
                              padding: '0.4rem 0.6rem',
                              display: 'grid',
                              gridTemplateColumns: '2fr 0.7fr 0.9fr 0.8fr',
                              gap: 4,
                              alignItems: 'center',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '0.76rem',
                              color: 'var(--text-primary)',
                            }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                              {row.name}
                            </span>
                            <span style={{ textAlign: 'right' }}>{row.health.toFixed(1)}</span>
                            <span
                              style={{ textAlign: 'right', color: deltaColor }}
                              title="Project health – portfolio health for this period"
                            >
                              {row.deltaVsPortfolio > 0 ? '+' : ''}
                              {row.deltaVsPortfolio.toFixed(1)} pts
                            </span>
                            <span style={{ textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              {expandedPeriodRowId === row.id ? 'Hide details' : 'Show details'}
                            </span>
                          </button>
                          {expandedPeriodRowId === row.id && (
                            <div
                              style={{
                                padding: '0.35rem 0.8rem 0.65rem',
                                fontSize: '0.72rem',
                                color: 'var(--text-secondary)',
                                background: 'rgba(15,23,42,0.9)',
                              }}
                            >
                              <div style={{ marginBottom: 4 }}>
                                This row is {Math.abs(row.deltaVsPortfolio).toFixed(1)} pts
                                {row.deltaVsPortfolio > 0 ? ' above' : row.deltaVsPortfolio < 0 ? ' below' : ' at'}
                                {' '}portfolio health for this period.
                              </div>
                              <a
                                href="/project-controls/wbs-gantt-v2?lens=coo"
                                style={{
                                  fontSize: '0.7rem',
                                  color: '#38BDF8',
                                  textDecoration: 'underline',
                                }}
                              >
                                Open WBS Gantt for underlying tasks
                              </a>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                No period performance data available.
              </div>
            )}
          </CommandCenterSection>

        </div>

        <CommandCenterSection title="Period Efficiency Summary">
          {payload?.sections.commandCenter ? (
            <div style={{ display: 'grid', gap: '0.45rem', fontSize: '0.78rem' }}>
              {[
                {
                  label: 'Execute (EX)',
                  value: payload.sections.commandCenter.periodEfficiencySummary.executePct,
                  tone: 'var(--pinnacle-teal)',
                  subtitle: 'Share of hours on execute work',
                },
                {
                  label: 'Quality (QC + RW)',
                  value: payload.sections.commandCenter.periodEfficiencySummary.qualityPct,
                  tone: '#F97316',
                  subtitle: 'Quality control and rework share',
                },
                {
                  label: 'Non-Execute',
                  value: payload.sections.commandCenter.periodEfficiencySummary.nonExecutePct,
                  tone: '#F59E0B',
                  subtitle: 'Overhead, training, and other non-execute hours',
                },
              ].map((row) => (
                <div key={row.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                    <span style={{ fontWeight: 700 }}>{row.value.toFixed(1)}%</span>
                  </div>
                  <div style={{ position: 'relative', height: 6, borderRadius: 999, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: `${Math.max(0, Math.min(100, row.value))}%`,
                        background: row.tone,
                      }}
                    />
                  </div>
                  <div style={{ marginTop: 2, fontSize: '0.7rem', color: 'var(--text-muted)' }}>{row.subtitle}</div>
                </div>
              ))}
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                Based on {Math.round(payload.sections.commandCenter.periodEfficiencySummary.totalHours).toLocaleString()} total hours in hour entries.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No efficiency breakdown available.</div>
          )}
        </CommandCenterSection>

        <CommandCenterSection title="Milestone Status (Portfolio-Wide)">
          {Object.values(milestoneBuckets).some((v) => v > 0) ? (
            <div style={{ display: 'grid', gap: '0.45rem', fontSize: '0.78rem' }}>
              {[
                { key: 'completedOnTime', label: 'Completed On Time', color: '#22C55E' },
                { key: 'completedDelayed', label: 'Completed Delayed', color: '#EF4444' },
                { key: 'inProgressForecastedOnTime', label: 'In Progress · Forecasted On Time', color: '#14B8A6' },
                { key: 'inProgressForecastedDelayed', label: 'In Progress · Forecasted Delayed', color: '#F59E0B' },
                { key: 'notStartedForecastedOnTime', label: 'Not Started · Forecasted On Time', color: '#3B82F6' },
                { key: 'notStartedForecastedDelayed', label: 'Not Started · Forecasted Delayed', color: '#A855F7' },
              ].map((bucket) => {
                const value = milestoneBuckets[bucket.key as keyof typeof milestoneBuckets] as number;
                return (
                  <div key={bucket.key} style={{ display: 'grid', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{bucket.label}</span>
                      <span style={{ fontWeight: 700 }}>{value}</span>
                    </div>
                    <div style={{ position: 'relative', height: 6, borderRadius: 999, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: value > 0 ? '100%' : '0%',
                          background: bucket.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No milestone status summary available for the current scope.</div>
          )}
        </CommandCenterSection>

        <CommandCenterSection title="WBS Health by Project">
          {sortedWbsRows.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No WBS / project health data available for the current scope.</div>
          ) : (
            <div style={{ maxHeight: 380, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                    <th
                      style={{ padding: '0.4rem 0.5rem', cursor: 'pointer' }}
                      onClick={() =>
                        setWbsSortKey((prev) => {
                          if (prev === 'project') {
                            setWbsSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                            return prev;
                          }
                          setWbsSortDir('asc');
                          return 'project';
                        })
                      }
                    >
                      Project
                    </th>
                    <th
                      style={{ padding: '0.4rem 0.5rem', textAlign: 'right', cursor: 'pointer' }}
                      title="Project percent complete aggregated from tasks and milestones."
                      onClick={() =>
                        setWbsSortKey((prev) => {
                          if (prev === 'schedule') {
                            setWbsSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                            return prev;
                          }
                          setWbsSortDir('desc');
                          return 'schedule';
                        })
                      }
                    >
                      Schedule
                    </th>
                    <th
                      style={{ padding: '0.4rem 0.5rem', textAlign: 'right', cursor: 'pointer' }}
                      title="Baseline hours (planned effort) at project level."
                      onClick={() =>
                        setWbsSortKey((prev) => {
                          if (prev === 'baseline') {
                            setWbsSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                            return prev;
                          }
                          setWbsSortDir('desc');
                          return 'baseline';
                        })
                      }
                    >
                      Baseline
                    </th>
                    <th
                      style={{ padding: '0.4rem 0.5rem', textAlign: 'right', cursor: 'pointer' }}
                      title="Share of hours tagged as maintenance (placeholder until maintenance tagging is wired)."
                      onClick={() =>
                        setWbsSortKey((prev) => {
                          if (prev === 'maintenance') {
                            setWbsSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                            return prev;
                          }
                          setWbsSortDir('desc');
                          return 'maintenance';
                        })
                      }
                    >
                      Maintenance
                    </th>
                    <th
                      style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}
                      title="Traffic-light classification based on milestone delay and percent complete."
                    >
                      Schedule Health
                    </th>
                    <th
                      style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}
                      title="Traffic-light classification based on CPI (cost performance index)."
                    >
                      Cost Health
                    </th>
                    <th
                      style={{ padding: '0.4rem 0.5rem', textAlign: 'right', cursor: 'pointer' }}
                      title="Percent of deliverables in an approved / signed / complete status."
                      onClick={() =>
                        setWbsSortKey((prev) => {
                          if (prev === 'docs') {
                            setWbsSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                            return prev;
                          }
                          setWbsSortDir('desc');
                          return 'docs';
                        })
                      }
                    >
                      Documents
                    </th>
                    <th
                      style={{ padding: '0.4rem 0.5rem', textAlign: 'right', cursor: 'pointer' }}
                      title="Simple average of schedule, cost, documents, and maintenance sub-scores."
                      onClick={() =>
                        setWbsSortKey((prev) => {
                          if (prev === 'overall') {
                            setWbsSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                            return prev;
                          }
                          setWbsSortDir('desc');
                          return 'overall';
                        })
                      }
                    >
                      Overall Compliance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedWbsRows.map((row) => (
                    <tr
                      key={row.projectId}
                      style={{ borderBottom: '1px solid rgba(148,163,184,0.25)', cursor: 'pointer' }}
                      onClick={() => {
                        window.open(`/project-controls/wbs-gantt-v2?lens=coo&project=${encodeURIComponent(row.projectId)}`, '_blank');
                      }}
                    >
                      <td style={{ padding: '0.35rem 0.5rem' }}>
                        <span>{row.name}</span>
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>
                        <span title="Project percent complete aggregated from tasks and milestones.">
                          {row.schedulePct.toFixed(0)}%
                        </span>
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>
                        <span title="Baseline (planned) hours at project level.">
                          {Math.round(row.baselineHours).toLocaleString()}h
                        </span>
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>
                        <span title="Share of hours tagged as maintenance (placeholder until maintenance tagging is wired).">
                          {row.maintenancePct.toFixed(1)}%
                        </span>
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '0.1rem 0.4rem',
                            borderRadius: 999,
                            background:
                              row.scheduleHealth === 'good'
                                ? 'rgba(34,197,94,0.12)'
                                : row.scheduleHealth === 'warning'
                                  ? 'rgba(234,179,8,0.12)'
                                  : 'rgba(239,68,68,0.12)',
                            color:
                              row.scheduleHealth === 'good'
                                ? '#22C55E'
                                : row.scheduleHealth === 'warning'
                                  ? '#EAB308'
                                  : '#EF4444',
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background:
                                row.scheduleHealth === 'good'
                                  ? '#22C55E'
                                  : row.scheduleHealth === 'warning'
                                    ? '#EAB308'
                                    : '#EF4444',
                            }}
                          />
                          {row.scheduleHealth === 'good'
                            ? 'Good'
                            : row.scheduleHealth === 'warning'
                              ? 'Watch'
                              : 'Bad'}
                        </span>
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '0.1rem 0.4rem',
                            borderRadius: 999,
                            background:
                              row.costHealth === 'good'
                                ? 'rgba(34,197,94,0.12)'
                                : row.costHealth === 'warning'
                                  ? 'rgba(234,179,8,0.12)'
                                  : 'rgba(239,68,68,0.12)',
                            color:
                              row.costHealth === 'good'
                                ? '#22C55E'
                                : row.costHealth === 'warning'
                                  ? '#EAB308'
                                  : '#EF4444',
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background:
                                row.costHealth === 'good'
                                  ? '#22C55E'
                                  : row.costHealth === 'warning'
                                    ? '#EAB308'
                                    : '#EF4444',
                            }}
                          />
                          {row.costHealth === 'good'
                            ? 'Good'
                            : row.costHealth === 'warning'
                              ? 'Watch'
                              : 'Bad'}
                        </span>
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>
                        <span title="Percent of deliverables in an approved / signed / complete status.">
                          {row.docsPct.toFixed(0)}%
                        </span>
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>
                        <span title="Simple average of schedule, cost, documents, and maintenance sub-scores.">
                          {row.overallCompliance.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Hover or tap each metric for its calculation. Click a row to open the project in WBS
                Gantt (COO lens).
              </div>
            </div>
          )}
        </CommandCenterSection>
      </div>
    </RoleWorkstationShell>
  );
}
