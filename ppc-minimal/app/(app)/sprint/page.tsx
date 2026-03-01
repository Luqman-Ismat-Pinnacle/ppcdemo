'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import SearchableSelect from '@/components/ui/SearchableSelect';
import type { EChartsOption } from 'echarts';

type Sprint = {
  id: string;
  name: string;
  project_id: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
};

type SprintTask = {
  id: string;
  sprint_id: string;
  task_id: string;
  task_name: string;
  percent_complete: number;
  actual_hours: number;
  total_hours: number;
  baseline_start: string | null;
  baseline_end: string | null;
  resource: string;
  priority_value: number;
  is_critical: boolean;
  phase_id: string | null;
  phase_name: string;
};

type BacklogTask = {
  id: string;
  name: string;
  project_id: string;
  percent_complete: number;
  actual_hours: number;
  total_hours: number;
  resource: string;
  priority_value: number;
  phase_id: string | null;
  phase_name: string;
};

type View = 'board' | 'backlog' | 'analytics';

const STATUSES = ['Planned', 'Active', 'Completed', 'Cancelled'] as const;

function getWorkDays(a: Date, b: Date) {
  let c = 0;
  const d = new Date(a);
  while (d <= b) {
    if (d.getDay() !== 0 && d.getDay() !== 6) c++;
    d.setDate(d.getDate() + 1);
  }
  return c;
}

function pct(n: number) {
  return Number(n).toFixed(0);
}

function hrs(n: number) {
  return Number(n).toFixed(1);
}

function progressColor(p: number): string {
  if (p >= 100) return 'var(--color-success, #10B981)';
  if (p > 0) return 'var(--color-warning, #F59E0B)';
  return 'var(--text-muted)';
}

function groupByPhase(tasks: SprintTask[]): Map<string, SprintTask[]> {
  const map = new Map<string, SprintTask[]>();
  for (const t of tasks) {
    const key = t.phase_name || 'Ungrouped';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return map;
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  padding: '0.35rem 0.5rem',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--glass-border)',
  background: 'var(--glass-bg)',
  color: 'var(--text-primary)',
  fontSize: '0.78rem',
  width: '100%',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  minWidth: 180,
  cursor: 'pointer',
};

function TaskCard({
  task,
  onRemove,
}: {
  task: SprintTask;
  onRemove: (taskId: string) => void;
}) {
  const p = Number(task.percent_complete);
  return (
    <div className="glass" style={{ padding: '0.5rem 0.6rem', marginBottom: '0.4rem', fontSize: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.25rem' }}>
        <div style={{ fontWeight: 600, lineHeight: 1.3, flex: 1 }}>{task.task_name}</div>
        <button
          onClick={() => onRemove(task.task_id)}
          title="Remove from sprint"
          style={{ background: 'none', border: 'none', color: 'var(--color-error, #EF4444)', cursor: 'pointer', fontSize: '0.7rem', padding: '0 2px', flexShrink: 0 }}
        >
          ✕
        </button>
      </div>
      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
          <div style={{ width: `${Math.min(p, 100)}%`, height: '100%', borderRadius: 2, background: progressColor(p), transition: 'width 0.3s' }} />
        </div>
        <span style={{ fontSize: '0.65rem', color: progressColor(p), fontWeight: 600, minWidth: 28, textAlign: 'right' }}>{pct(p)}%</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.67rem', color: 'var(--text-muted)' }}>
        <span>{hrs(task.actual_hours)}h / {hrs(task.total_hours)}h</span>
        <span>{task.resource || '—'}</span>
      </div>
      <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)', marginTop: 2, opacity: 0.7 }}>
        {task.phase_name}
      </div>
    </div>
  );
}

function BoardColumn({
  title,
  tasks,
  onRemove,
  color,
}: {
  title: string;
  tasks: SprintTask[];
  onRemove: (taskId: string) => void;
  color: string;
}) {
  const grouped = groupByPhase(tasks);

  return (
    <div className="glass-raised" style={{ padding: '0.65rem', minHeight: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.6rem', paddingBottom: '0.4rem', borderBottom: `2px solid ${color}` }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{tasks.length}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tasks.length === 0 && (
          <div style={{ padding: '1.5rem 0.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem', opacity: 0.5 }}>
            No tasks
          </div>
        )}
        {Array.from(grouped.entries()).map(([epic, epicTasks]) => (
          <div key={epic}>
            {grouped.size > 1 && (
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0.35rem 0.15rem 0.2rem', marginTop: '0.25rem' }}>
                {epic}
              </div>
            )}
            {epicTasks.map(t => (
              <TaskCard key={t.task_id} task={t} onRemove={onRemove} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SprintPage() {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedSprint, setSelectedSprint] = useState('');
  const [tasks, setTasks] = useState<SprintTask[]>([]);
  const [backlog, setBacklog] = useState<BacklogTask[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [view, setView] = useState<View>('board');

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');

  const [backlogSearch, setBacklogSearch] = useState('');

  const loadData = useCallback(async (preserveSprint?: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/pca/sprint');
      if (!res.ok) throw new Error('Failed to load sprint data');
      const data = await res.json();
      setSprints(data.sprints || []);
      setTasks((data.sprintTasks || []) as SprintTask[]);
      setBacklog((data.unassigned || []) as BacklogTask[]);
      setProjects(data.projects || []);
      const target = preserveSprint || selectedSprint;
      if (target && (data.sprints || []).some((s: Sprint) => s.id === target)) {
        setSelectedSprint(target);
      } else if (data.sprints?.length) {
        setSelectedSprint(data.sprints[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedSprint]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const postAction = async (body: Record<string, unknown>) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/pca/sprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Action failed');
      return await res.json();
    } finally {
      setActionLoading(false);
    }
  };

  const createSprint = async () => {
    if (!newName.trim() || !newProjectId) return;
    const result = await postAction({
      action: 'createSprint',
      name: newName.trim(),
      projectId: newProjectId,
      startDate: newStart || null,
      endDate: newEnd || null,
    });
    setShowCreate(false);
    setNewName('');
    setNewStart('');
    setNewEnd('');
    setNewProjectId('');
    await loadData(result?.id);
  };

  const assignTask = async (taskId: string) => {
    if (!selectedSprint) return;
    await postAction({ action: 'assignTask', sprintId: selectedSprint, taskId });
    await loadData(selectedSprint);
  };

  const removeTask = async (taskId: string) => {
    if (!selectedSprint) return;
    await postAction({ action: 'removeTask', sprintId: selectedSprint, taskId });
    await loadData(selectedSprint);
  };

  const updateStatus = async (status: string) => {
    if (!selectedSprint) return;
    await postAction({ action: 'updateStatus', sprintId: selectedSprint, status });
    await loadData(selectedSprint);
  };

  const sprint = sprints.find(s => s.id === selectedSprint);
  const sprintTasks = useMemo(() => tasks.filter(t => t.sprint_id === selectedSprint), [tasks, selectedSprint]);
  const notStarted = useMemo(() => sprintTasks.filter(t => Number(t.percent_complete) === 0), [sprintTasks]);
  const inProgress = useMemo(() => sprintTasks.filter(t => Number(t.percent_complete) > 0 && Number(t.percent_complete) < 100), [sprintTasks]);
  const done = useMemo(() => sprintTasks.filter(t => Number(t.percent_complete) >= 100), [sprintTasks]);

  const totalHrs = sprintTasks.reduce((s, t) => s + Number(t.total_hours || 0), 0);
  const actualHrs = sprintTasks.reduce((s, t) => s + Number(t.actual_hours || 0), 0);
  const completedCount = done.length;
  const totalCount = sprintTasks.length;
  const capacityPct = totalHrs > 0 ? Math.round((actualHrs / totalHrs) * 100) : 0;

  const filteredBacklog = useMemo(() => {
    if (!backlogSearch.trim()) return backlog;
    const q = backlogSearch.toLowerCase();
    return backlog.filter(
      t =>
        t.name.toLowerCase().includes(q) ||
        t.resource?.toLowerCase().includes(q) ||
        t.phase_name?.toLowerCase().includes(q) ||
        projects.find(p => p.id === t.project_id)?.name.toLowerCase().includes(q),
    );
  }, [backlog, backlogSearch, projects]);

  const burndownOption: EChartsOption = useMemo(() => {
    if (!sprint?.start_date || !sprint?.end_date) return { series: [] };
    const start = new Date(sprint.start_date);
    const end = new Date(sprint.end_date);
    const days = getWorkDays(start, end);
    if (days < 2) return { series: [] };
    const labels: string[] = [];
    const d = new Date(start);
    let count = 0;
    while (count < days) {
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        labels.push(d.toISOString().slice(5, 10));
        count++;
      }
      d.setDate(d.getDate() + 1);
    }
    const ideal = labels.map((_, i) => Math.round(totalHrs * (1 - i / (days - 1))));
    const actual = labels.map((_, i) => Math.round(totalHrs - actualHrs * Math.min(1, (i + 1) / days)));
    return {
      backgroundColor: 'transparent',
      grid: { left: 40, right: 20, top: 30, bottom: 40, containLabel: true },
      tooltip: { trigger: 'axis' },
      legend: { show: true, top: 0, right: 0 },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', name: 'Hours' },
      series: [
        { name: 'Ideal', type: 'line', data: ideal, lineStyle: { type: 'dashed', width: 2 }, symbol: 'none' },
        { name: 'Actual', type: 'line', data: actual, areaStyle: { opacity: 0.08 }, symbol: 'circle', symbolSize: 4 },
      ],
    };
  }, [sprint, totalHrs, actualHrs]);

  const velocityOption: EChartsOption = useMemo(() => {
    const sprintData = sprints.slice(0, 6).reverse().map(s => {
      const sts = tasks.filter(t => t.sprint_id === s.id);
      return {
        name: s.name.length > 14 ? s.name.slice(0, 12) + '…' : s.name,
        planned: sts.reduce((a, t) => a + Number(t.total_hours || 0), 0),
        completed: sts.filter(t => Number(t.percent_complete) >= 100).reduce((a, t) => a + Number(t.total_hours || 0), 0),
      };
    });
    return {
      backgroundColor: 'transparent',
      grid: { left: 40, right: 20, top: 30, bottom: 40, containLabel: true },
      tooltip: { trigger: 'axis' },
      legend: { show: true, top: 0, right: 0 },
      xAxis: { type: 'category', data: sprintData.map(d => d.name), axisLabel: { fontSize: 10, rotate: sprintData.length > 4 ? 15 : 0 } },
      yAxis: { type: 'value', name: 'Hours' },
      series: [
        { name: 'Planned', type: 'bar', data: sprintData.map(d => d.planned), barMaxWidth: 32 },
        { name: 'Completed', type: 'bar', data: sprintData.map(d => d.completed), barMaxWidth: 32 },
      ],
    };
  }, [sprints, tasks]);

  if (loading) {
    return (
      <div>
        <h1 className="page-title">Sprint Planning</h1>
        <p className="page-subtitle">Organize MPP tasks into sprints across all projects.</p>
        <div style={{ display: 'grid', gap: '0.5rem', marginTop: '1rem' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={i === 0 ? 40 : 64} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Sprint Planning</h1>
      <p className="page-subtitle">Organize MPP tasks into sprints across all projects.</p>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {sprints.length > 0 && (
          <select
            value={selectedSprint}
            onChange={e => setSelectedSprint(e.target.value)}
            style={{ ...selectStyle, minWidth: 240 }}
          >
            {sprints.map(s => {
              const projName = projects.find(p => p.id === s.project_id)?.name || s.project_id;
              return (
                <option key={s.id} value={s.id}>
                  {s.name} — {projName} ({s.status})
                </option>
              );
            })}
          </select>
        )}

        {sprint && (
          <select
            value={sprint.status}
            onChange={e => updateStatus(e.target.value)}
            disabled={actionLoading}
            style={{ ...selectStyle, minWidth: 110 }}
          >
            {STATUSES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        <button
          className="btn btn-accent"
          onClick={() => setShowCreate(!showCreate)}
          style={{ fontSize: '0.74rem' }}
        >
          {showCreate ? '✕ Cancel' : '+ New Sprint'}
        </button>

        <div style={{ flex: 1 }} />

        {(['board', 'backlog', 'analytics'] as View[]).map(v => (
          <button
            key={v}
            className={`btn${view === v ? ' btn-accent' : ''}`}
            onClick={() => setView(v)}
            style={{ fontSize: '0.72rem', textTransform: 'capitalize' }}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Create Sprint Form */}
      {showCreate && (
        <div className="glass" style={{ padding: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Project *</label>
              <SearchableSelect
                options={projects.map(p => ({ value: p.id, label: `${p.id} — ${p.name}` }))}
                value={newProjectId}
                onChange={setNewProjectId}
                placeholder="Search projects…"
              />
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Sprint Name *</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Sprint 1"
                style={inputStyle}
                onKeyDown={e => e.key === 'Enter' && createSprint()}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Start Date</label>
              <input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>End Date</label>
              <input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <button
                className="btn btn-accent"
                onClick={createSprint}
                disabled={!newName.trim() || !newProjectId || actionLoading}
                style={{ width: '100%', opacity: !newName.trim() || !newProjectId ? 0.5 : 1 }}
              >
                {actionLoading ? 'Creating…' : 'Create Sprint'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sprint Content */}
      {sprint ? (
        <>
          {/* KPI Strip */}
          <div className="kpi-grid" style={{ marginBottom: '0.75rem' }}>
            <div className="glass kpi-card">
              <div className="kpi-label">Total Tasks</div>
              <div className="kpi-value">{totalCount}</div>
            </div>
            <div className="glass kpi-card">
              <div className="kpi-label">Completed</div>
              <div className="kpi-value" style={{ color: completedCount > 0 ? 'var(--color-success, #10B981)' : undefined }}>
                {completedCount}
                {totalCount > 0 && (
                  <span style={{ fontSize: '0.6em', color: 'var(--text-muted)', marginLeft: 4 }}>
                    / {totalCount}
                  </span>
                )}
              </div>
            </div>
            <div className="glass kpi-card">
              <div className="kpi-label">Hours (Actual / Total)</div>
              <div className="kpi-value">{actualHrs.toFixed(0)} / {totalHrs.toFixed(0)}</div>
            </div>
            <div className="glass kpi-card">
              <div className="kpi-label">Capacity</div>
              <div className="kpi-value">
                {capacityPct}%
                <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', width: '100%' }}>
                  <div style={{ width: `${Math.min(capacityPct, 100)}%`, height: '100%', borderRadius: 2, background: capacityPct > 100 ? 'var(--color-error, #EF4444)' : 'var(--color-accent, #40E0D0)', transition: 'width 0.3s' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Board View */}
          {view === 'board' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.65rem' }}>
              <BoardColumn
                title="To Do"
                tasks={notStarted}
                onRemove={removeTask}
                color="var(--text-muted)"
              />
              <BoardColumn
                title="In Progress"
                tasks={inProgress}
                onRemove={removeTask}
                color="var(--color-warning, #F59E0B)"
              />
              <BoardColumn
                title="Done"
                tasks={done}
                onRemove={removeTask}
                color="var(--color-success, #10B981)"
              />
            </div>
          )}

          {/* Backlog View */}
          {view === 'backlog' && (
            <div>
              <div style={{ marginBottom: '0.5rem' }}>
                <input
                  value={backlogSearch}
                  onChange={e => setBacklogSearch(e.target.value)}
                  placeholder="Search backlog by name, resource, phase, or project…"
                  style={{ ...inputStyle, maxWidth: 400 }}
                />
              </div>
              <div className="glass-solid" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 380px)' }}>
                <table className="dm-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Epic / Phase</th>
                      <th>Project</th>
                      <th>Priority</th>
                      <th>Resource</th>
                      <th>Hours</th>
                      <th>%</th>
                      <th style={{ width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBacklog.map(t => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 500 }}>{t.name}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{t.phase_name || '—'}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                          {projects.find(p => p.id === t.project_id)?.name || t.project_id}
                        </td>
                        <td>{t.priority_value}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{t.resource || '—'}</td>
                        <td>{hrs(t.total_hours)}</td>
                        <td>
                          <span style={{ color: progressColor(Number(t.percent_complete)) }}>
                            {pct(t.percent_complete)}%
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-accent"
                            style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem' }}
                            onClick={() => assignTask(t.id)}
                            disabled={actionLoading}
                          >
                            + Sprint
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredBacklog.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                          {backlogSearch ? 'No matching tasks.' : 'All tasks are assigned to sprints.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {backlog.length > 0 && (
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.35rem', textAlign: 'right' }}>
                  {filteredBacklog.length} of {backlog.length} unassigned tasks
                </div>
              )}
            </div>
          )}

          {/* Analytics View */}
          {view === 'analytics' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="glass-raised" style={{ padding: '0.65rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.5rem' }}>Burndown</div>
                <ChartWrapper
                  option={burndownOption}
                  height={280}
                  isEmpty={!sprint.start_date || !sprint.end_date || totalHrs === 0}
                  visualTitle="Burndown"
                  enableExport
                  exportFilename={`burndown-${sprint.name}`}
                />
                {(!sprint.start_date || !sprint.end_date) && (
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.3rem', textAlign: 'center' }}>
                    Set sprint start and end dates to see burndown chart.
                  </div>
                )}
              </div>
              <div className="glass-raised" style={{ padding: '0.65rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.5rem' }}>Velocity</div>
                <ChartWrapper
                  option={velocityOption}
                  height={280}
                  isEmpty={sprints.length === 0}
                  visualTitle="Velocity"
                  enableExport
                  exportFilename="sprint-velocity"
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="glass-raised" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📋</div>
          No sprints yet. Create one to start planning.
        </div>
      )}

      {actionLoading && (
        <div style={{ position: 'fixed', bottom: 16, right: 16, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.75rem', fontSize: '0.72rem', color: 'var(--text-muted)', backdropFilter: 'blur(12px)', zIndex: 50 }}>
          Saving…
        </div>
      )}
    </div>
  );
}
