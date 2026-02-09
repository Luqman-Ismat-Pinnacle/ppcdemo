/**
 * @fileoverview Metrics Recorder for Variance Trending
 * 
 * Automatically records daily metrics snapshots to the metrics_history table
 * for use by the variance trending feature. This replaces the manual snapshot
 * system with automatic, scheduled metric recording.
 * 
 * @module lib/metrics-recorder
 */

import { supabase } from './supabase';

/**
 * Supabase env vars — if these are absent we're using the mock client,
 * so every DB call would return a fake error. Skip silently instead.
 */
const SUPABASE_LIVE =
  typeof window !== 'undefined'
    ? Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * Metrics to be recorded for variance tracking
 */
export interface MetricsSnapshot {
  recorded_date: string;
  scope: 'all' | 'project' | 'phase' | 'task';
  scope_id?: string | null;
  
  // Progress metrics
  total_tasks?: number;
  completed_tasks?: number;
  percent_complete?: number;
  
  // Hours metrics
  baseline_hours?: number;
  actual_hours?: number;
  remaining_hours?: number;
  
  // Cost metrics
  baseline_cost?: number;
  actual_cost?: number;
  remaining_cost?: number;
  
  // EVM metrics
  earned_value?: number;
  planned_value?: number;
  cpi?: number;
  spi?: number;
  
  // QC metrics
  qc_pass_rate?: number;
  qc_critical_errors?: number;
  qc_total_tasks?: number;
}

/**
 * Data structure expected for calculating metrics
 */
interface CalculationData {
  tasks?: any[];
  wbsData?: { items?: any[] };
  projects?: any[];
  milestoneStatus?: { name: string; value: number }[];
  sCurve?: { actual?: number[]; planned?: number[] };
  qualityMetrics?: any;
  hourEntries?: any[];
}

/**
 * Calculate aggregated metrics from the current data state
 */
export function calculateCurrentMetrics(data: CalculationData): MetricsSnapshot {
  const today = new Date().toISOString().split('T')[0];
  
  // Calculate task metrics
  const tasks = data.tasks || [];
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t: any) => 
    t.percentComplete === 100 || 
    t.status === 'Complete' || 
    t.status === 'Completed'
  ).length;
  
  // Calculate percent complete (average across all tasks)
  const percentComplete = totalTasks > 0
    ? tasks.reduce((sum: number, t: any) => sum + (t.percentComplete || 0), 0) / totalTasks
    : 0;
  
  // Calculate hours metrics
  let baselineHours = 0;
  let actualHours = 0;
  let remainingHours = 0;
  
  tasks.forEach((task: any) => {
    baselineHours += task.baselineHours || task.budgetHours || 0;
    actualHours += task.actualHours || 0;
    remainingHours += task.remainingHours || 
      Math.max(0, (task.baselineHours || task.budgetHours || 0) - (task.actualHours || 0));
  });
  
  // Calculate cost metrics
  let baselineCost = 0;
  let actualCost = 0;
  let remainingCost = 0;
  
  tasks.forEach((task: any) => {
    baselineCost += task.baselineCost || task.budgetCost || 0;
    actualCost += task.actualCost || 0;
    remainingCost += task.remainingCost || 
      Math.max(0, (task.baselineCost || task.budgetCost || 0) - (task.actualCost || 0));
  });
  
  // Calculate EVM metrics
  let earnedValue = 0;
  let plannedValue = 0;
  
  tasks.forEach((task: any) => {
    const taskBaselineCost = task.baselineCost || task.budgetCost || 0;
    const taskPercentComplete = task.percentComplete || 0;
    
    earnedValue += taskBaselineCost * (taskPercentComplete / 100);
    plannedValue += taskBaselineCost;
  });
  
  // Calculate CPI and SPI
  const cpi = actualCost > 0 ? earnedValue / actualCost : 1;
  const spi = plannedValue > 0 ? earnedValue / plannedValue : 1;
  
  // Calculate QC metrics
  const milestones = data.milestoneStatus || [];
  const totalMilestones = milestones.reduce((sum, m) => sum + m.value, 0);
  const completedMilestones = milestones.find(m => m.name === 'Complete')?.value || 0;
  const qcPassRate = totalMilestones > 0 
    ? (completedMilestones / totalMilestones) * 100 
    : 0;
  
  return {
    recorded_date: today,
    scope: 'all',
    scope_id: null,
    
    total_tasks: totalTasks,
    completed_tasks: completedTasks,
    percent_complete: Math.round(percentComplete * 100) / 100,
    
    baseline_hours: Math.round(baselineHours * 100) / 100,
    actual_hours: Math.round(actualHours * 100) / 100,
    remaining_hours: Math.round(remainingHours * 100) / 100,
    
    baseline_cost: Math.round(baselineCost * 100) / 100,
    actual_cost: Math.round(actualCost * 100) / 100,
    remaining_cost: Math.round(remainingCost * 100) / 100,
    
    earned_value: Math.round(earnedValue * 100) / 100,
    planned_value: Math.round(plannedValue * 100) / 100,
    cpi: Math.round(cpi * 1000) / 1000,
    spi: Math.round(spi * 1000) / 1000,
    
    qc_pass_rate: Math.round(qcPassRate * 100) / 100,
    qc_critical_errors: 0,
    qc_total_tasks: totalMilestones,
  };
}

/**
 * Calculate metrics for a specific project
 */
export function calculateProjectMetrics(data: CalculationData, projectId: string): MetricsSnapshot {
  const today = new Date().toISOString().split('T')[0];
  const tasks = (data.tasks || []).filter((t: any) => 
    t.projectId === projectId || t.project_id === projectId
  );
  
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t: any) => 
    t.percentComplete === 100 || 
    t.status === 'Complete' || 
    t.status === 'Completed'
  ).length;
  
  const percentComplete = totalTasks > 0
    ? tasks.reduce((sum: number, t: any) => sum + (t.percentComplete || 0), 0) / totalTasks
    : 0;
  
  let baselineHours = 0;
  let actualHours = 0;
  let baselineCost = 0;
  let actualCost = 0;
  
  tasks.forEach((task: any) => {
    baselineHours += task.baselineHours || task.budgetHours || 0;
    actualHours += task.actualHours || 0;
    baselineCost += task.baselineCost || task.budgetCost || 0;
    actualCost += task.actualCost || 0;
  });
  
  let earnedValue = 0;
  tasks.forEach((task: any) => {
    const taskBaselineCost = task.baselineCost || task.budgetCost || 0;
    const taskPercentComplete = task.percentComplete || 0;
    earnedValue += taskBaselineCost * (taskPercentComplete / 100);
  });
  
  const cpi = actualCost > 0 ? earnedValue / actualCost : 1;
  const spi = baselineCost > 0 ? earnedValue / baselineCost : 1;
  
  return {
    recorded_date: today,
    scope: 'project',
    scope_id: projectId,
    
    total_tasks: totalTasks,
    completed_tasks: completedTasks,
    percent_complete: Math.round(percentComplete * 100) / 100,
    
    baseline_hours: Math.round(baselineHours * 100) / 100,
    actual_hours: Math.round(actualHours * 100) / 100,
    remaining_hours: Math.round((baselineHours - actualHours) * 100) / 100,
    
    baseline_cost: Math.round(baselineCost * 100) / 100,
    actual_cost: Math.round(actualCost * 100) / 100,
    remaining_cost: Math.round((baselineCost - actualCost) * 100) / 100,
    
    earned_value: Math.round(earnedValue * 100) / 100,
    planned_value: Math.round(baselineCost * 100) / 100,
    cpi: Math.round(cpi * 1000) / 1000,
    spi: Math.round(spi * 1000) / 1000,
  };
}

/**
 * Record metrics to the database
 * Uses upsert to update existing records for the same date/scope
 */
export async function recordMetrics(metrics: MetricsSnapshot): Promise<{ success: boolean; error?: string }> {
  if (!supabase || !SUPABASE_LIVE) {
    return { success: false, error: 'Supabase not configured' };
  }
  
  try {
    const { error } = await supabase
      .from('metrics_history')
      .upsert(
        {
          ...metrics,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'recorded_date,scope,scope_id',
        }
      );
    
    if (error) {
      console.error('Error recording metrics:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error recording metrics:', message);
    return { success: false, error: message };
  }
}

/**
 * Record metrics for all scopes (global and per-project)
 */
export async function recordAllMetrics(data: CalculationData): Promise<{ 
  success: boolean; 
  recorded: number; 
  errors: string[] 
}> {
  const errors: string[] = [];
  let recorded = 0;
  
  // Record global metrics
  const globalMetrics = calculateCurrentMetrics(data);
  const globalResult = await recordMetrics(globalMetrics);
  if (globalResult.success) {
    recorded++;
  } else if (globalResult.error) {
    errors.push(`Global: ${globalResult.error}`);
  }
  
  // Record per-project metrics
  const projects = data.projects || [];
  for (const project of projects) {
    const projectId = project.id || project.projectId;
    if (!projectId) continue;
    
    const projectMetrics = calculateProjectMetrics(data, projectId);
    const projectResult = await recordMetrics(projectMetrics);
    if (projectResult.success) {
      recorded++;
    } else if (projectResult.error) {
      errors.push(`Project ${projectId}: ${projectResult.error}`);
    }
  }
  
  return {
    success: errors.length === 0,
    recorded,
    errors,
  };
}

/**
 * Fetch historical metrics for variance calculations
 */
export async function fetchMetricsHistory(
  scope: string = 'all',
  scopeId: string | null = null,
  days: number = 90
): Promise<MetricsSnapshot[]> {
  if (!supabase || !SUPABASE_LIVE) {
    return [];
  }
  
  try {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromDateStr = fromDate.toISOString().split('T')[0];
    
    let query = supabase
      .from('metrics_history')
      .select('*')
      .eq('scope', scope)
      .gte('recorded_date', fromDateStr)
      .order('recorded_date', { ascending: false });
    
    if (scopeId) {
      query = query.eq('scope_id', scopeId);
    } else {
      query = query.is('scope_id', null);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching metrics history:', error);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('Error fetching metrics history:', err);
    return [];
  }
}

/**
 * Check if metrics have been recorded today
 */
export async function hasRecordedToday(scope: string = 'all', scopeId: string | null = null): Promise<boolean> {
  if (!supabase || !SUPABASE_LIVE) {
    return false;
  }
  
  try {
    const today = new Date().toISOString().split('T')[0];
    
    let query = supabase
      .from('metrics_history')
      .select('id')
      .eq('scope', scope)
      .eq('recorded_date', today);
    
    if (scopeId) {
      query = query.eq('scope_id', scopeId);
    } else {
      query = query.is('scope_id', null);
    }
    
    const { data, error } = await query.limit(1);
    
    if (error) {
      console.error('Error checking today\'s metrics:', error);
      return false;
    }
    
    return data && data.length > 0;
  } catch (err) {
    console.error('Error checking today\'s metrics:', err);
    return false;
  }
}

/**
 * Auto-record metrics if not already recorded today
 * Call this on app load or data sync
 */
export async function autoRecordMetricsIfNeeded(data: CalculationData): Promise<void> {
  const alreadyRecorded = await hasRecordedToday('all');
  
  if (!alreadyRecorded) {
    console.log('Recording daily metrics...');
    const result = await recordAllMetrics(data);
    if (result.success) {
      console.log(`Recorded ${result.recorded} metric snapshots`);
    } else {
      console.warn('Some metrics failed to record:', result.errors);
    }
  } else {
    console.log('Metrics already recorded for today');
  }
}
