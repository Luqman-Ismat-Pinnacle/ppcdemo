/**
 * @fileoverview Visual Snapshot Utilities
 * 
 * Utilities for capturing and storing snapshots of individual visuals (charts/tables)
 * for comparison purposes.
 */

import { generateId } from './database-schema';

export interface VisualSnapshot {
  id: string;
  visualId: string; // Unique identifier for the visual (e.g., 's-curve-chart', 'projects-table')
  visualType: 'chart' | 'table';
  visualTitle: string;
  snapshotName: string;
  snapshotDate: string;
  data: unknown; // Chart option or table data
  metadata: {
    filters?: Record<string, unknown>;
    dateRange?: { start: string; end: string };
    hierarchyFilter?: Record<string, unknown>;
    [key: string]: unknown;
  };
  createdAt: string;
  createdBy: string;
}

const VISUAL_SNAPSHOTS_STORAGE_KEY = 'ppc_visual_snapshots';

/**
 * Save a visual snapshot to localStorage
 */
export function saveVisualSnapshot(snapshot: Omit<VisualSnapshot, 'id' | 'createdAt'>): VisualSnapshot {
  const fullSnapshot: VisualSnapshot = {
    ...snapshot,
    id: generateId('VSN'),
    createdAt: new Date().toISOString(),
  };

  const existing = getVisualSnapshots();
  existing.push(fullSnapshot);
  
  // Keep only last 100 snapshots per visual
  const visualSnapshots = existing.filter(s => s.visualId === fullSnapshot.visualId);
  if (visualSnapshots.length > 100) {
    const toRemove = visualSnapshots.slice(0, visualSnapshots.length - 100);
    const filtered = existing.filter(s => !toRemove.includes(s));
    localStorage.setItem(VISUAL_SNAPSHOTS_STORAGE_KEY, JSON.stringify(filtered));
  } else {
    localStorage.setItem(VISUAL_SNAPSHOTS_STORAGE_KEY, JSON.stringify(existing));
  }

  return fullSnapshot;
}

/**
 * Get all visual snapshots
 */
export function getVisualSnapshots(): VisualSnapshot[] {
  try {
    const stored = localStorage.getItem(VISUAL_SNAPSHOTS_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Get snapshots for a specific visual
 */
export function getVisualSnapshotsById(visualId: string): VisualSnapshot[] {
  return getVisualSnapshots().filter(s => s.visualId === visualId);
}

/**
 * Delete a visual snapshot
 */
export function deleteVisualSnapshot(snapshotId: string): boolean {
  try {
    const existing = getVisualSnapshots();
    const filtered = existing.filter(s => s.id !== snapshotId);
    localStorage.setItem(VISUAL_SNAPSHOTS_STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch {
    return false;
  }
}

/**
 * Capture current chart data from ECharts instance
 */
export function captureChartSnapshot(
  chartInstance: { getOption: () => unknown },
  visualId: string,
  visualTitle: string,
  snapshotName: string,
  metadata?: Record<string, unknown>
): VisualSnapshot | null {
  try {
    const option = chartInstance.getOption();
    return saveVisualSnapshot({
      visualId,
      visualType: 'chart',
      visualTitle,
      snapshotName,
      snapshotDate: new Date().toISOString().split('T')[0],
      data: option,
      metadata: metadata || {},
      createdBy: 'User',
    });
  } catch (error) {
    // Error capturing chart snapshot - handled by returning null
    return null;
  }
}

/**
 * Capture current table data
 */
export function captureTableSnapshot(
  tableData: Record<string, unknown>[],
  visualId: string,
  visualTitle: string,
  snapshotName: string,
  metadata?: Record<string, unknown>
): VisualSnapshot | null {
  try {
    return saveVisualSnapshot({
      visualId,
      visualType: 'table',
      visualTitle,
      snapshotName,
      snapshotDate: new Date().toISOString().split('T')[0],
      data: tableData,
      metadata: metadata || {},
      createdBy: 'User',
    });
  } catch (error) {
    // Error capturing table snapshot - handled by returning null
    return null;
  }
}
