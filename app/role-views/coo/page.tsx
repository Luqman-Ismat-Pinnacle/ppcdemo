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
    const items = (filteredData.wbsData?.items || []) as any[];
    const projects = (filteredData.projects || []) as any[];
    const milestones = (filteredData.milestones || []) as any[];
    const deliverables = (filteredData.deliverables || []) as any[];

    const projectById = new Map<string, any>();
    projects.forEach((p: any) => {
      const id = String(p.id || p.projectId || '');
      if (id) projectById.set(id, p);
    });

    const milestonesByProject = new Map<string, any[]>();
    milestones.forEach((m: any) => {
      const pid = String(m.projectId || m.project_id || '');
      if (!pid) return;
      if (!milestonesByProject.has(pid)) milestonesByProject.set(pid, []);
      milestonesByProject.get(pid)!.push(m);
    });

    const deliverablesByProject = new Map<string, any[]>();
    deliverables.forEach((d: any) => {
      const pid = String(d.projectId || d.project_id || '');
      if (!pid) return;
      if (!deliverablesByProject.has(pid)) deliverablesByProject.set(pid, []);
      deliverablesByProject.get(pid)!.push(d);
    });

    type Row = {
      id: string;
      name: string;
      level: number;
      schedulePct: number;
      baselineHours: number;
      maintenancePct: number;
      scheduleHealth: 'good' | 'warning' | 'bad';
      costHealth: 'good' | 'warning' | 'bad';
      docsPct: number;
      overallCompliance: number;
    };

    const rows: Row[] = [];

    const walk = (list: any[], level: number) => {
      list.forEach((node: any) => {
        const type = String(node.type || node.itemType || '').toLowerCase();
        const id = String(node.id || '');
        const name = String(node.name || '');

        if (type === 'project' && id.startsWith('wbs-project-')) {
          const projectId = id.replace(/^wbs-project-/i, '');
          const project = projectById.get(projectId);
          if (project) {
            const baselineHours = Number(project.baselineHours ?? project.baseline_hours ?? 0) || 0;
            const actualHours = Number(project.actualHours ?? project.actual_hours ?? 0) || 0;
            const percentComplete = Number(project.percentComplete ?? project.percent_complete ?? 0) || 0;

            const projectMilestones = milestonesByProject.get(projectId) || [];
            const lateMilestones = projectMilestones.filter((m) => Number(m.varianceDays || 0) > 0);
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
              id,
              name,
              level,
              schedulePct: percentComplete,
              baselineHours,
              maintenancePct,
              scheduleHealth,
              costHealth,
              docsPct,
              overallCompliance,
            });
          }
        }

        if (Array.isArray(node.children) && node.children.length) {
          walk(node.children, level + 1);
        }
      });
    };

    walk(items, 0);
    return rows;
  }, [filteredData]);

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
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              <div style={{ fontSize: '0.74rem' }}>Task completion rate: {payload?.sections.periodPerformance.completionRate || 0}%</div>
              <div style={{ fontSize: '0.74rem' }}>Open commitments: {payload?.sections.periodPerformance.openCommitments || 0}</div>
              <OffenderList
                rows={(payload?.sections.periodPerformance.topMovers || []).map((row, index) => ({
                  id: `${row.name}-${index}`,
                  label: row.name,
                  value: `Health ${row.health}`,
                }))}
                empty="No project movers."
              />
            </div>
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
          {payload?.sections.commandCenter ? (
            <div style={{ display: 'grid', gap: '0.45rem', fontSize: '0.78rem' }}>
              {[
                { key: 'completedOnTime', label: 'Completed On Time', color: '#22C55E' },
                { key: 'completedDelayed', label: 'Completed Delayed', color: '#EF4444' },
                { key: 'inProgressForecastedOnTime', label: 'In Progress · Forecasted On Time', color: '#14B8A6' },
                { key: 'inProgressForecastedDelayed', label: 'In Progress · Forecasted Delayed', color: '#F59E0B' },
                { key: 'notStartedForecastedOnTime', label: 'Not Started · Forecasted On Time', color: '#3B82F6' },
                { key: 'notStartedForecastedDelayed', label: 'Not Started · Forecasted Delayed', color: '#A855F7' },
              ].map((bucket) => {
                const value = payload.sections.commandCenter.milestoneStatus[bucket.key as keyof typeof payload.sections.commandCenter.milestoneStatus] as number;
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
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No milestone status summary available.</div>
          )}
        </CommandCenterSection>

        <CommandCenterSection title="WBS Health by Project">
          {wbsHealthRows.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No WBS / project health data available.</div>
          ) : (
            <div style={{ maxHeight: 380, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '0.4rem 0.5rem' }}>Project</th>
                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Schedule</th>
                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Baseline</th>
                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Maintenance</th>
                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>Schedule Health</th>
                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>Cost Health</th>
                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Documents</th>
                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Overall Compliance</th>
                  </tr>
                </thead>
                <tbody>
                  {wbsHealthRows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.25)' }}>
                      <td style={{ padding: '0.35rem 0.5rem' }}>
                        <span style={{ paddingLeft: `${row.level * 12}px` }}>{row.name}</span>
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>{row.schedulePct.toFixed(0)}%</td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>
                        {Math.round(row.baselineHours).toLocaleString()}h
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>
                        {row.maintenancePct.toFixed(1)}%
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
                        {row.docsPct.toFixed(0)}%
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>
                        {row.overallCompliance.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Schedule = project percent complete; Baseline = planned hours; Maintenance = share of
                hours tagged as maintenance (placeholder); Schedule &amp; Cost Health are traffic‑light
                categories; Documents = % of deliverables approved/signed; Overall Compliance is the
                simple average of these sub‑scores.
              </div>
            </div>
          )}
        </CommandCenterSection>
      </div>
    </RoleWorkstationShell>
  );
}
