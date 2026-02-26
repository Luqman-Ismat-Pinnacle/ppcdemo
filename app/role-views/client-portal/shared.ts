'use client';

/**
 * @fileoverview Shared data selectors for client portal routes.
 */

import { useMemo } from 'react';
import { useData } from '@/lib/data-context';

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function useClientPortalScope(selectedProjectId: string) {
  const { filteredData, data: fullData } = useData();

  const projects = useMemo(() => {
    const rawProjects = (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [];
    return rawProjects.map((project) => {
      const p = asRecord(project);
      const id = String(p.id || p.projectId || '');
      return { id, name: String(p.name || p.projectName || id || 'Project') };
    }).filter((project) => project.id);
  }, [filteredData?.projects, fullData?.projects]);

  const selectedId = selectedProjectId || (projects[0]?.id || '');

  const tasks = useMemo(() => (((filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || []) as unknown[])
    .map(asRecord)
    .filter((task) => String(task.projectId || task.project_id || '') === selectedId), [filteredData?.tasks, fullData?.tasks, selectedId]);

  const docs = useMemo(() => (((filteredData?.projectDocumentRecords?.length ? filteredData.projectDocumentRecords : fullData?.projectDocumentRecords)
    || (filteredData?.projectDocuments?.length ? filteredData.projectDocuments : fullData?.projectDocuments)
    || []) as unknown[])
    .map(asRecord)
    .filter((doc) => String(doc.projectId || doc.project_id || '') === selectedId)
    .filter((doc) => {
      const status = String(doc.status || '').toLowerCase();
      return status.includes('customer_signed_off') || status.includes('signed off') || status.includes('in_review') || status.includes('pending client');
    })
    .sort((a, b) => {
      const ad = new Date(String(a.updatedAt || a.updated_at || a.createdAt || a.created_at || 0)).getTime();
      const bd = new Date(String(b.updatedAt || b.updated_at || b.createdAt || b.created_at || 0)).getTime();
      return bd - ad;
    }), [filteredData?.projectDocumentRecords, filteredData?.projectDocuments, fullData?.projectDocumentRecords, fullData?.projectDocuments, selectedId]);

  const milestones = useMemo(() => (((filteredData?.milestones?.length ? filteredData.milestones : fullData?.milestones) || []) as unknown[])
    .map(asRecord)
    .filter((milestone) => String(milestone.projectId || milestone.project_id || '') === selectedId)
    .filter((milestone) => {
      const raw = milestone.is_client_visible ?? milestone.isClientVisible;
      return raw === true || raw === 1 || String(raw || '').toLowerCase() === 'true';
    }), [filteredData?.milestones, fullData?.milestones, selectedId]);

  const metrics = useMemo(() => {
    const baselineHours = tasks.reduce((sum, task) => sum + toNumber(task.baselineHours || task.baseline_hours), 0);
    const actualHours = tasks.reduce((sum, task) => sum + toNumber(task.actualHours || task.actual_hours), 0);
    const completedTasks = tasks.filter((task) => toNumber(task.percentComplete || task.percent_complete) >= 100).length;
    const totalTasks = tasks.length;
    const percentComplete = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    return {
      percentComplete,
      workPlannedVsDone: `${baselineHours.toFixed(1)}h / ${actualHours.toFixed(1)}h`,
    };
  }, [tasks]);

  return { projects, selectedId, tasks, docs, milestones, metrics };
}
