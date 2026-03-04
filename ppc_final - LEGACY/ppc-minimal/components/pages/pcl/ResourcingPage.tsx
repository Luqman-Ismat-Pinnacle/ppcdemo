'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';

interface Employee {
  id: string; name: string; email: string; jobTitle: string; department: string;
  totalHours: number; projectCount: number; daysWorked: number; avgDailyHours: number; utilization: number;
}
interface ProjectAlloc {
  project_id: string; project_name: string; headcount: number; total_hours: number;
  project_actual_hours: number; project_total_hours: number;
}
interface DeptRow { department: string; headcount: number; total_hours: number }
interface RoleTimeHour {
  role: string;
  week_start: string;
  week_label: string;
  month_label: string;
  quarter_label: string;
  hours: number;
  role_headcount: number;
}
interface RoleHeadcount {
  role: string;
  headcount: number;
}
interface ResourcingData {
  kpis: { totalEmployees: number; overUtilized: number; underUtilized: number; balanced: number };
  employees: Employee[];
  overUtilized: Employee[];
  underUtilized: Employee[];
  projectAllocation: ProjectAlloc[];
  departmentSummary: DeptRow[];
  roleTimeHours: RoleTimeHour[];
  roleHeadcounts: RoleHeadcount[];
  scheduleWindow?: { schedule_start: string | null; schedule_end: string | null };
}
interface LevelingSuggestion {
  from: Employee;
  to: Employee;
  shiftHours: number;
  priority: 'high' | 'medium';
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

function UtilBar({ pct }: { pct: number }) {
  const color = pct > 100 ? '#ef4444' : pct >= 60 ? '#10b981' : '#f59e0b';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ width: `${Math.min(150, pct)}%`, maxWidth: '100%', height: '100%', borderRadius: 3, background: color }} />
      </div>
      <span style={{ fontSize: '0.68rem', fontWeight: 600, color, minWidth: 36, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

export default function PclResourcingPage() {
  const [data, setData] = useState<ResourcingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewFilter, setViewFilter] = useState<'all' | 'over' | 'under' | 'balanced'>('all');
  const [heatmapBucket, setHeatmapBucket] = useState<'week' | 'month' | 'quarter'>('week');

  useEffect(() => {
    fetch('/api/pcl/resourcing', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!d.success) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredEmployees = useMemo(() => {
    if (!data) return [];
    const list = data.employees.filter(e => e.totalHours > 0);
    if (viewFilter === 'over') return list.filter(e => e.utilization > 100);
    if (viewFilter === 'under') return list.filter(e => e.utilization > 0 && e.utilization < 60);
    if (viewFilter === 'balanced') return list.filter(e => e.utilization >= 60 && e.utilization <= 100);
    return list;
  }, [data, viewFilter]);

  const roleTimeGrid = useMemo(() => {
    if (!data) return null;
    const roleTimeHours = data.roleTimeHours || [];
    const keyOf = (r: RoleTimeHour) => (
      heatmapBucket === 'week' ? r.week_label : heatmapBucket === 'month' ? r.month_label : r.quarter_label
    );
    const startOfWeek = (dt: Date) => {
      const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
      const day = d.getUTCDay();
      const diff = (day + 6) % 7;
      d.setUTCDate(d.getUTCDate() - diff);
      return d;
    };
    const quarterLabel = (dt: Date) => `${dt.getUTCFullYear()}-Q${Math.floor(dt.getUTCMonth() / 3) + 1}`;
    const monthLabel = (dt: Date) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;

    const parseDateSafe = (v?: string | null) => {
      if (!v) return null;
      const d = new Date(v);
      return Number.isFinite(d.getTime()) ? d : null;
    };

    const now = new Date();
    const scheduleStart = parseDateSafe(data.scheduleWindow?.schedule_start) || now;
    const scheduleEnd = parseDateSafe(data.scheduleWindow?.schedule_end) || now;

    const periods: string[] = [];
    if (heatmapBucket === 'week') {
      const start = startOfWeek(scheduleStart);
      const end = new Date(Math.max(scheduleEnd.getTime(), now.getTime()));
      end.setUTCDate(end.getUTCDate() + 7 * 12);
      const c = new Date(start);
      while (c <= end) {
        periods.push(c.toISOString().slice(0, 10));
        c.setUTCDate(c.getUTCDate() + 7);
      }
    } else if (heatmapBucket === 'month') {
      const c = new Date(Date.UTC(scheduleStart.getUTCFullYear(), scheduleStart.getUTCMonth(), 1));
      const end = new Date(Date.UTC(Math.max(scheduleEnd.getUTCFullYear(), now.getUTCFullYear()), Math.max(scheduleEnd.getUTCMonth(), now.getUTCMonth()), 1));
      end.setUTCMonth(end.getUTCMonth() + 6);
      while (c <= end) {
        periods.push(monthLabel(c));
        c.setUTCMonth(c.getUTCMonth() + 1);
      }
    } else {
      const qStartMonth = Math.floor(scheduleStart.getUTCMonth() / 3) * 3;
      const c = new Date(Date.UTC(scheduleStart.getUTCFullYear(), qStartMonth, 1));
      const maxRef = new Date(Math.max(scheduleEnd.getTime(), now.getTime()));
      const qEndMonth = Math.floor(maxRef.getUTCMonth() / 3) * 3;
      const end = new Date(Date.UTC(maxRef.getUTCFullYear(), qEndMonth, 1));
      end.setUTCMonth(end.getUTCMonth() + 12);
      while (c <= end) {
        periods.push(quarterLabel(c));
        c.setUTCMonth(c.getUTCMonth() + 3);
      }
    }

    const periodHoursByRole = new Map<string, Map<string, number>>();
    const roleHeadcount = new Map<string, number>();
    (data.roleHeadcounts || []).forEach((r) => {
      const role = (r.role || 'Unassigned Role').trim() || 'Unassigned Role';
      roleHeadcount.set(role, Math.max(1, Number(r.headcount || 1)));
    });
    if (!roleHeadcount.has('Unassigned Role')) roleHeadcount.set('Unassigned Role', 1);

    roleTimeHours.forEach((r) => {
      const role = r.role || 'Unassigned Role';
      const period = keyOf(r);
      roleHeadcount.set(role, Math.max(1, Number(r.role_headcount || 1)));
      if (!periodHoursByRole.has(role)) periodHoursByRole.set(role, new Map());
      const m = periodHoursByRole.get(role)!;
      m.set(period, (m.get(period) || 0) + Number(r.hours || 0));
    });

    const roles = [...new Set([
      ...roleHeadcount.keys(),
      ...periodHoursByRole.keys(),
    ])]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .sort((a, b) => {
        if (a === 'Unassigned Role') return 1;
        if (b === 'Unassigned Role') return -1;
        return 0;
      })
      .sort((a, b) => {
        const ta = [...(periodHoursByRole.get(a)?.values() || [])].reduce((s, v) => s + v, 0);
        const tb = [...(periodHoursByRole.get(b)?.values() || [])].reduce((s, v) => s + v, 0);
        return tb - ta;
      });

    const topRoles = roles
      .sort((a, b) => {
        if (a === 'Unassigned Role') return 1;
        if (b === 'Unassigned Role') return -1;
        return 0;
      })
      .slice(0, 20);

    return { periods, roles: topRoles, periodHoursByRole, roleHeadcount };
  }, [data, heatmapBucket]);

  const roleHeatmapHours = useMemo(() => {
    if (!roleTimeGrid) return null;
    const { periods, roles, periodHoursByRole, roleHeadcount } = roleTimeGrid;
    const bucketCapacity = heatmapBucket === 'week' ? 40 : heatmapBucket === 'month' ? 160 : 480;
    const points: [number, number, number][] = [];
    roles.forEach((role, y) => {
      const row = periodHoursByRole.get(role) || new Map();
      periods.forEach((period, x) => {
        points.push([x, y, Math.round(row.get(period) || 0)]);
      });
    });
    const vmax = Math.max(1, ...points.map((p) => p[2]));
    return {
      tooltip: {
        position: 'top' as const,
        formatter: (p: any) => {
          const [x, y, v] = p.data || [0, 0, 0];
          const role = roles[y] || 'Role';
          const period = periods[x] || '';
          const headcount = Math.max(1, roleHeadcount.get(role) || 1);
          const capacity = headcount * bucketCapacity;
          const util = capacity > 0 ? Math.round((v / capacity) * 100) : 0;
          const gap = v - capacity;
          const status = util > 100 ? 'Overloaded' : util > 85 ? 'Busy' : util > 50 ? 'Optimal' : 'Available';
          const statusColor = util > 100 ? '#E91E63' : util > 85 ? '#FF9800' : util > 50 ? '#CDDC39' : '#6366F1';
          return `<div style="padding:10px 12px;min-width:240px;">
            <div style="font-weight:700;color:#6366F1;margin-bottom:4px;font-size:13px;">${role}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.65);margin-bottom:8px;">${period}</div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:11px;">
              <span style="color:#94a3b8;">Demand</span><strong>${v} hrs</strong>
              <span style="color:#94a3b8;">Capacity</span><strong>${capacity} hrs</strong>
              <span style="color:#94a3b8;">Headcount</span><strong>${headcount}</strong>
              <span style="color:#94a3b8;">Utilization</span><strong style="color:${statusColor}">${util}%</strong>
              <span style="color:#94a3b8;">Gap</span><strong style="color:${statusColor}">${gap > 0 ? '+' : ''}${gap} hrs</strong>
              <span style="color:#94a3b8;">Status</span><strong style="color:${statusColor}">${status}</strong>
            </div>
          </div>`;
        },
      },
      grid: { left: 126, right: 24, top: 70, bottom: 72 },
      dataZoom: [{ type: 'slider' as const, xAxisIndex: 0, start: 0, end: 100, bottom: 12, height: 16 }],
      xAxis: { type: 'category' as const, data: periods, axisLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, rotate: 35 } },
      yAxis: { type: 'category' as const, data: roles, axisLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10, width: 112, overflow: 'truncate' as const } },
      visualMap: {
        min: 0,
        max: vmax,
        calculable: true,
        orient: 'horizontal' as const,
        left: 'center' as const,
        top: 18,
        textStyle: { color: '#94a3b8' },
        inRange: { color: ['#1a1a1a', '#4F46E5', '#6366F1', '#CDDC39', '#FF9800', '#E91E63'] },
      },
      series: [{ type: 'heatmap' as const, data: points, label: { show: false }, itemStyle: { borderColor: 'rgba(0,0,0,0.35)', borderWidth: 1 } }],
    };
  }, [roleTimeGrid, heatmapBucket]);

  const roleHeatmapUtil = useMemo(() => {
    if (!roleTimeGrid) return null;
    const { periods, roles, periodHoursByRole, roleHeadcount } = roleTimeGrid;
    const bucketCapacity = heatmapBucket === 'week' ? 40 : heatmapBucket === 'month' ? 160 : 480;
    const points: [number, number, number][] = [];
    roles.forEach((role, y) => {
      const row = periodHoursByRole.get(role) || new Map();
      const headcount = Math.max(1, roleHeadcount.get(role) || 1);
      periods.forEach((period, x) => {
        const hrs = row.get(period) || 0;
        const util = Math.round((hrs / (headcount * bucketCapacity)) * 100);
        points.push([x, y, util]);
      });
    });
    const vmax = Math.max(100, ...points.map((p) => p[2]));
    return {
      tooltip: {
        position: 'top' as const,
        formatter: (p: any) => {
          const [x, y, v] = p.data || [0, 0, 0];
          const role = roles[y] || 'Role';
          const period = periods[x] || '';
          const headcount = Math.max(1, roleHeadcount.get(role) || 1);
          const capacity = headcount * bucketCapacity;
          const demand = Math.round((v / 100) * capacity);
          const fteNeeded = capacity > 0 ? (demand / bucketCapacity) : 0;
          const gap = demand - capacity;
          const status = v > 100 ? 'Overloaded' : v > 85 ? 'Busy' : v > 50 ? 'Optimal' : 'Available';
          const statusColor = v > 100 ? '#E91E63' : v > 85 ? '#FF9800' : v > 50 ? '#CDDC39' : '#6366F1';
          return `<div style="padding:10px 12px;min-width:240px;">
            <div style="font-weight:700;color:#6366F1;margin-bottom:4px;font-size:13px;">${role}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.65);margin-bottom:8px;">${period}</div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:11px;">
              <span style="color:#94a3b8;">Utilization</span><strong style="color:${statusColor}">${v}%</strong>
              <span style="color:#94a3b8;">Demand</span><strong>${demand} hrs</strong>
              <span style="color:#94a3b8;">Capacity</span><strong>${capacity} hrs</strong>
              <span style="color:#94a3b8;">Headcount</span><strong>${headcount}</strong>
              <span style="color:#94a3b8;">FTE Needed</span><strong>${fteNeeded.toFixed(2)}</strong>
              <span style="color:#94a3b8;">Gap</span><strong style="color:${statusColor}">${gap > 0 ? '+' : ''}${gap} hrs</strong>
              <span style="color:#94a3b8;">Status</span><strong style="color:${statusColor}">${status}</strong>
            </div>
          </div>`;
        },
      },
      grid: { left: 126, right: 24, top: 70, bottom: 72 },
      dataZoom: [{ type: 'slider' as const, xAxisIndex: 0, start: 0, end: 100, bottom: 12, height: 16 }],
      xAxis: { type: 'category' as const, data: periods, axisLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, rotate: 35 } },
      yAxis: { type: 'category' as const, data: roles, axisLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10, width: 112, overflow: 'truncate' as const } },
      visualMap: {
        min: 0,
        max: vmax,
        calculable: true,
        orient: 'horizontal' as const,
        left: 'center' as const,
        top: 18,
        textStyle: { color: '#94a3b8' },
        inRange: { color: ['#1a1a1a', '#4F46E5', '#6366F1', '#CDDC39', '#FF9800', '#E91E63'] },
      },
      series: [{ type: 'heatmap' as const, data: points, label: { show: false }, itemStyle: { borderColor: 'rgba(0,0,0,0.35)', borderWidth: 1 } }],
    };
  }, [roleTimeGrid, heatmapBucket]);

  const levelingSuggestions = useMemo<LevelingSuggestion[]>(() => {
    if (!data?.employees?.length) return [];
    const active = data.employees.filter((e) => Number(e.totalHours) > 0);
    const over = [...active].filter((e) => e.utilization > 110).sort((a, b) => b.utilization - a.utilization);
    const under = [...active].filter((e) => e.utilization < 70).sort((a, b) => a.utilization - b.utilization);
    const out: LevelingSuggestion[] = [];
    const count = Math.min(over.length, under.length, 12);
    for (let i = 0; i < count; i += 1) {
      const from = over[i];
      const to = under[i];
      const overHours = Math.max(0, ((from.utilization - 100) / 100) * Number(from.totalHours || 0));
      const availHours = Math.max(0, ((70 - to.utilization) / 100) * Number(to.totalHours || 0));
      const shiftHours = Math.max(4, Math.round(Math.min(overHours, availHours, 24)));
      out.push({
        from,
        to,
        shiftHours,
        priority: from.utilization > 125 || to.utilization < 45 ? 'high' : 'medium',
      });
    }
    return out;
  }, [data]);

  if (loading) return (
    <div>
      <h1 className="page-title">Resourcing</h1>
      <p className="page-subtitle">Portfolio staffing coordination and capacity balancing.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={80} />)}
      </div>
      <Skeleton height={300} />
    </div>
  );

  if (error) return (
    <div>
      <h1 className="page-title">Resourcing</h1>
      <div style={{ color: 'var(--color-error)', fontSize: '0.82rem' }}>{error}</div>
    </div>
  );

  if (!data) return null;
  const { kpis } = data;
  const totalHours = Math.round(data.employees.reduce((sum, e) => sum + Number(e.totalHours || 0), 0));
  const avgUtilization = data.employees.length
    ? Math.round(data.employees.reduce((sum, e) => sum + Number(e.utilization || 0), 0) / data.employees.length)
    : 0;
  const overloadedRoles = roleTimeGrid
    ? roleTimeGrid.roles.filter((role) => {
      const headcount = Math.max(1, roleTimeGrid.roleHeadcount.get(role) || 1);
      const hours = [...(roleTimeGrid.periodHoursByRole.get(role)?.values() || [])].reduce((s, v) => s + v, 0);
      const bucketCapacity = heatmapBucket === 'week' ? 40 : heatmapBucket === 'month' ? 160 : 480;
      return headcount > 0 && (hours / Math.max(1, roleTimeGrid.periods.length)) > (headcount * bucketCapacity);
    }).length
    : 0;

  return (
    <div>
      <h1 className="page-title">Resourcing</h1>
      <p className="page-subtitle">Portfolio staffing coordination and capacity balancing.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total Active" value={kpis.totalEmployees} />
        <KpiCard label="Over-Utilized (>100%)" value={kpis.overUtilized} color={kpis.overUtilized > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Under-Utilized (<60%)" value={kpis.underUtilized} color={kpis.underUtilized > 0 ? '#f59e0b' : '#10b981'} />
        <KpiCard label="Balanced" value={kpis.balanced} color="#10b981" />
        <KpiCard label="Total Assigned Hours" value={totalHours.toLocaleString()} />
        <KpiCard label="Avg Utilization" value={`${avgUtilization}%`} color={avgUtilization > 100 ? '#ef4444' : avgUtilization >= 70 ? '#10b981' : '#f59e0b'} />
        <KpiCard label="Overloaded Roles" value={overloadedRoles} color={overloadedRoles > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Leveling Actions" value={levelingSuggestions.length} color={levelingSuggestions.length > 0 ? '#f59e0b' : '#10b981'} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 2 }}>
          {(['week', 'month', 'quarter'] as const).map((bucket) => (
            <button
              key={bucket}
              className="btn"
              onClick={() => setHeatmapBucket(bucket)}
              style={{
                padding: '0.2rem 0.5rem',
                minHeight: 26,
                fontSize: '0.68rem',
                fontWeight: 600,
                background: heatmapBucket === bucket ? 'var(--accent)' : 'transparent',
                color: heatmapBucket === bucket ? '#06100d' : 'var(--text-secondary)',
                textTransform: 'capitalize',
              }}
            >
              {bucket}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginBottom: 20 }}>
        <div className="glass-raised" style={{ padding: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 8 }}>Role Utilization Heatmap ({heatmapBucket})</div>
          {roleHeatmapUtil ? <ChartWrapper option={roleHeatmapUtil} height={520} /> : <Skeleton height={520} />}
        </div>
        <div className="glass-raised" style={{ padding: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 8 }}>Role Hours Heatmap ({heatmapBucket})</div>
          {roleHeatmapHours ? <ChartWrapper option={roleHeatmapHours} height={520} /> : <Skeleton height={520} />}
        </div>
      </div>

      <div className="glass-raised" style={{ padding: '1rem', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>Resource Leveling Engine</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            Rebalance suggestions from overloaded to available capacity
          </div>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 280, overflowY: 'auto' }}>
          <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Priority</th>
                <th style={{ textAlign: 'left' }}>Move Work From</th>
                <th style={{ textAlign: 'right' }}>Current Util</th>
                <th style={{ textAlign: 'left' }}>To</th>
                <th style={{ textAlign: 'right' }}>Current Util</th>
                <th style={{ textAlign: 'right' }}>Suggested Shift</th>
              </tr>
            </thead>
            <tbody>
              {levelingSuggestions.map((s, i) => (
                <tr key={`${s.from.id}-${s.to.id}-${i}`}>
                  <td style={{ color: s.priority === 'high' ? '#ef4444' : '#f59e0b', fontWeight: 700, textTransform: 'uppercase' }}>{s.priority}</td>
                  <td>{s.from.name}</td>
                  <td style={{ textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{s.from.utilization}%</td>
                  <td>{s.to.name}</td>
                  <td style={{ textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{s.to.utilization}%</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.shiftHours}h</td>
                </tr>
              ))}
              {levelingSuggestions.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No rebalancing actions suggested right now</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass" style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>Utilization Outliers</div>
          <div style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 2 }}>
            {(['all', 'over', 'under', 'balanced'] as const).map(v => (
              <button key={v} className="btn" onClick={() => setViewFilter(v)} style={{
                padding: '0.2rem 0.5rem', minHeight: 26, fontSize: '0.68rem', fontWeight: 600,
                background: viewFilter === v ? 'var(--accent)' : 'transparent',
                color: viewFilter === v ? '#06100d' : 'var(--text-secondary)',
                textTransform: 'capitalize',
              }}>
                {v === 'over' ? '>100%' : v === 'under' ? '<60%' : v === 'balanced' ? '60-100%' : 'All'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
          <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Employee</th>
                <th style={{ textAlign: 'left' }}>Title</th>
                <th style={{ textAlign: 'left' }}>Department</th>
                <th style={{ textAlign: 'right' }}>Hours</th>
                <th style={{ textAlign: 'right' }}>Projects</th>
                <th style={{ textAlign: 'right' }}>Avg Daily</th>
                <th style={{ textAlign: 'right', minWidth: 110 }}>Utilization</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.slice(0, 30).map((e, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{e.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{e.jobTitle || '-'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{e.department || '-'}</td>
                  <td style={{ textAlign: 'right' }}>{Math.round(e.totalHours).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{e.projectCount}</td>
                  <td style={{ textAlign: 'right' }}>{e.avgDailyHours}h</td>
                  <td><UtilBar pct={e.utilization} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
