'use client';

import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import ChartWrapper from '@/components/charts/ChartWrapper';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

function asNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asText(value: unknown): string {
  return String(value || '').trim();
}

export default function RdaHoursPage() {
  const { filteredData, data: fullData } = useData();
  const rows = useMemo(() => {
    const entries = (filteredData?.hours?.length ? filteredData.hours : fullData?.hours) || [];
    return (entries as unknown as Array<Record<string, unknown>>)
      .map((row, index) => ({
        id: asText(row.id || index),
        date: asText(row.date || row.workDate || row.work_date),
        projectId: asText(row.projectId || row.project_id || '-'),
        projectName: asText(row.projectName || row.project_name || ''),
        taskId: asText(row.taskId || row.task_id || ''),
        phase: asText(row.phase || row.phases || ''),
        chargeCode: asText(row.chargeCode || row.charge_code),
        chargeType: asText(row.chargeType || row.charge_type || row.category || ''),
        hours: asNumber(row.hours),
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredData?.hours, fullData?.hours]);

  const summary = useMemo(() => {
    const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
    const byProject = new Map<string, number>();
    const byChargeType = new Map<string, number>();
    for (const row of rows) {
      const projectKey = row.projectName || row.projectId || 'Unknown';
      byProject.set(projectKey, (byProject.get(projectKey) || 0) + row.hours);
      const chargeKey = row.chargeType || row.chargeCode || 'Unspecified';
      byChargeType.set(chargeKey, (byChargeType.get(chargeKey) || 0) + row.hours);
    }
    return { totalHours, byProject, byChargeType };
  }, [rows]);

  const projectSplitOption: EChartsOption = useMemo(() => {
    const entries = [...summary.byProject.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 120, right: 20, top: 16, bottom: 22 },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: entries.map(([name]) => name) },
      series: [{ type: 'bar', data: entries.map(([, value]) => Number(value.toFixed(2))), barMaxWidth: 20 }],
    };
  }, [summary.byProject]);

  const chargeSplitOption: EChartsOption = useMemo(() => {
    const entries = [...summary.byChargeType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    return {
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['35%', '70%'],
          data: entries.map(([name, value]) => ({ name, value: Number(value.toFixed(2)) })),
          label: { formatter: '{b}: {d}%' },
        },
      ],
    };
  }, [summary.byChargeType]);

  return (
    <RoleWorkstationShell role="rda" title="Hours Lane" subtitle="Employee-scoped hour details with charge-code and project split visibility.">
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.65rem' }}>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total Hours</div>
            <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{summary.totalHours.toFixed(1)}</div>
          </div>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Projects Charged</div>
            <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{summary.byProject.size}</div>
          </div>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Charge Types</div>
            <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{summary.byChargeType.size}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 8 }}>Hours by Project</div>
            <ChartWrapper option={projectSplitOption} height="270px" />
          </div>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 8 }}>Hours by Charge Type</div>
            <ChartWrapper option={chargeSplitOption} height="270px" />
          </div>
        </div>

        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 1fr 120px 90px 90px', padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            <span>Date</span>
            <span>Project</span>
            <span>Phase</span>
            <span>Task</span>
            <span>Charge Code</span>
            <span>Charge Type</span>
            <span>Hours</span>
          </div>
          {rows.length === 0 ? (
            <div style={{ padding: '0.75rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>No hour entries in current employee scope.</div>
          ) : rows.slice(0, 250).map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 1fr 120px 90px 90px', padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.73rem' }}>
              <span>{row.date ? new Date(row.date).toLocaleDateString() : '-'}</span>
              <span>{row.projectName || row.projectId}</span>
              <span>{row.phase || '-'}</span>
              <span>{row.taskId || '-'}</span>
              <span>{row.chargeCode || '-'}</span>
              <span>{row.chargeType || '-'}</span>
              <span>{row.hours.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </RoleWorkstationShell>
  );
}
