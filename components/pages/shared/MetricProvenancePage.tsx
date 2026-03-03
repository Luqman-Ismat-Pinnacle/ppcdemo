'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

type Role = 'PCA' | 'PCL' | 'COO';
type VarianceNote = {
  id: string;
  role: string | null;
  table_name: string;
  record_id: string;
  metric_key: string;
  baseline_value: number | null;
  current_value: number | null;
  variance_value: number | null;
  status: string;
  comment: string | null;
  created_by: string | null;
  created_at: string;
};

type VariableDef = {
  key: string;
  name: string;
  sourceSystem: 'Workday' | 'MPP' | 'Database' | 'Computed' | 'Codebase';
  sourceTable: string;
  sourceColumn: string;
  dataType: string;
  meaning: string;
  transform: string;
  usedBy: string[];
};

type MetricDef = {
  metric: string;
  formula: string;
  interpretation: string;
  inputs: string[];
};

export default function MetricProvenancePage({ role }: { role: Role }) {
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<VarianceNote[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    table_name: 'projects',
    record_id: '',
    metric_key: '',
    baseline_value: '',
    current_value: '',
    comment: '',
  });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const inputStyle: React.CSSProperties = {
    background: 'var(--glass-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--glass-border)',
    borderRadius: 8,
    padding: '0.4rem 0.5rem',
    fontSize: '0.72rem',
  };

  const loadNotes = useCallback(async () => {
    const res = await fetch(`/api/variance/notes?role=${encodeURIComponent(role)}`, { cache: 'no-store' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to load variance notes');
    setNotes(data.notes || []);
  }, [role]);

  useEffect(() => {
    loadNotes().catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [loadNotes]);

  const formulas = useMemo(
    (): MetricDef[] => [
      { metric: 'SPI (Schedule Performance Index)', formula: 'actual_hours / baseline_hours', interpretation: '>= 1.0 good, < 1.0 lagging', inputs: ['projects.actual_hours', 'projects.baseline_hours'] },
      { metric: 'CPI (Cost Performance Index)', formula: 'earned_value / actual_cost (or contract_value / actual_cost)', interpretation: '>= 1.0 efficient, < 1.0 overrun risk', inputs: ['projects.percent_complete', 'projects.baseline_cost', 'projects.actual_cost', 'customer_contracts.line_amount'] },
      { metric: 'EAC (Estimate at Completion)', formula: 'actual_cost + remaining_cost', interpretation: 'Total expected cost at completion', inputs: ['projects.actual_cost', 'projects.remaining_cost'] },
      { metric: 'Schedule Health', formula: '100 - overdue_penalty - variance_days_penalty; overdue_penalty = min(40, overdue_count*8); variance_days_penalty = min(30, schedule_variance_days)', interpretation: 'Credibility of PWA hours: remaining hours burndown vs actual charged. Trust = 100 minus penalties for overdue tasks and schedule slip.', inputs: ['tasks.overdue_count', 'projects.baseline_end', 'tasks.percent_complete'] },
      { metric: 'Variance Hours', formula: 'SUM(actual_hours - baseline_hours)', interpretation: 'Cumulative hours above/below baseline', inputs: ['tasks.actual_hours', 'tasks.baseline_hours'] },
      { metric: 'Variance %', formula: '(actual_hours - baseline_hours) / baseline_hours * 100', interpretation: 'Percent deviation from baseline hours', inputs: ['tasks.actual_hours', 'tasks.baseline_hours'] },
      { metric: 'Baseline Health', formula: 'clamp(spi * 100)', interpretation: 'SPI expressed as 0–100 score', inputs: ['projects.actual_hours', 'projects.baseline_hours'] },
      { metric: 'Trend Health', formula: 'clamp(100 - |trend_hours_pct|)', interpretation: 'Inverse of trend volatility; stable workload = high', inputs: ['hour_entries.hours', 'hour_entries.date'] },
      { metric: 'Execution Health', formula: 'clamp(avg(percent_complete))', interpretation: 'Average task progress as 0–100', inputs: ['tasks.percent_complete'] },
      { metric: 'Overall Compliance', formula: 'baseline_health*0.30 + schedule_health*0.30 + trend_health*0.15 + execution_health*0.25 - critical_open_penalty', interpretation: 'Weighted health composite minus critical-path penalty', inputs: ['baseline_health', 'schedule_health', 'trend_health', 'execution_health', 'tasks.is_critical'] },
      { metric: 'Mapping Coverage %', formula: 'mapped_hours / total_hours * 100', interpretation: 'Higher means better Workday→MPP traceability', inputs: ['hour_entries.hours', 'hour_entries.mpp_phase_task'] },
      { metric: 'Profit Margin %', formula: '(contract_value - EAC) / contract_value * 100', interpretation: 'Positive and high margin is healthier', inputs: ['customer_contracts.line_amount', 'projects.actual_cost', 'projects.remaining_cost'] },
      { metric: 'Burn Rate %', formula: 'actual_cost / contract_value * 100', interpretation: 'Cost consumed vs contract; high = less headroom', inputs: ['projects.actual_cost', 'customer_contracts.line_amount'] },
      { metric: 'Utilization %', formula: 'demand_hours / capacity_hours * 100', interpretation: '>100 overloaded, 60–100 balanced, <60 underloaded', inputs: ['tasks.total_hours', 'tasks.days', 'tasks.resource'] },
      { metric: 'Trending Hours %', formula: '(recent_3m_hours - prior_3m_hours) / prior_3m_hours * 100', interpretation: 'Positive = workload acceleration; negative = workload deceleration', inputs: ['hour_entries.hours', 'hour_entries.date', 'projects.id'] },
      { metric: 'Trending Hours (hrs/mo)', formula: 'recent_3m_hours / 3', interpretation: 'Recent average throughput velocity per month', inputs: ['hour_entries.hours', 'hour_entries.date', 'projects.id'] },
      { metric: 'Contract Gap ($)', formula: 'contract_value - EAC', interpretation: 'Positive = under contract; negative = over contract', inputs: ['customer_contracts.line_amount', 'projects.actual_cost', 'projects.remaining_cost'] },
      { metric: 'Exposure Ratio %', formula: 'cost_to_date / contract_value * 100', interpretation: 'Higher ratio indicates reduced financial headroom', inputs: ['projects.actual_cost', 'customer_contracts.line_amount'] },
      { metric: 'QC Ratio %', formula: 'qc_hours / total_hours * 100', interpretation: 'Share of hours in QC/quality charge codes', inputs: ['hour_entries.hours', 'hour_entries.charge_code'] },
      { metric: 'Rework Ratio %', formula: 'rework_hours / total_hours * 100', interpretation: 'Share of hours in rework/RW charge codes', inputs: ['hour_entries.hours', 'hour_entries.charge_code'] },
      { metric: 'Cost of Quality %', formula: '(qc_hours + rework_hours) / total_hours * 100', interpretation: 'Combined QC + rework as % of total', inputs: ['hour_entries.hours', 'hour_entries.charge_code'] },
      { metric: 'Execute Ratio %', formula: 'execute_hours / total_hours * 100', interpretation: 'Share of hours in Execute (non-QC/admin/meeting) category', inputs: ['hour_entries.hours', 'hour_entries.charge_code'] },
      { metric: 'Milestone On-Time Rate %', formula: '(completed_on_time + in_progress_on_track) / total_milestones * 100', interpretation: 'Milestones on or ahead of schedule', inputs: ['tasks.percent_complete', 'tasks.baseline_end', 'tasks.is_milestone'] },
      { metric: 'Completion Rate %', formula: 'completed_tasks / total_tasks * 100', interpretation: 'Tasks at 100% complete', inputs: ['tasks.percent_complete'] },
      { metric: 'Revenue Recognized', formula: 'SUM(COALESCE(NULLIF(actual_revenue,0), actual_cost))', interpretation: 'Uses explicit revenue; falls back to cost when revenue is missing/zero', inputs: ['hour_entries.actual_revenue', 'hour_entries.actual_cost'] },
      { metric: 'Variance (generic)', formula: 'current_value - baseline_value', interpretation: 'Positive/negative direction depends on metric semantics', inputs: ['variance_notes.baseline_value', 'variance_notes.current_value'] },
      { metric: 'Epic Completion %', formula: 'AVG(tasks.percent_complete) WHERE tasks.epic_id = X', interpretation: 'Average progress of tasks within an epic', inputs: ['tasks.percent_complete', 'tasks.epic_id'] },
      { metric: 'Feature Completion %', formula: 'AVG(tasks.percent_complete) WHERE tasks.feature_id = X', interpretation: 'Average progress of tasks within a feature', inputs: ['tasks.percent_complete', 'tasks.feature_id'] },
      { metric: 'Epic Task Count', formula: 'COUNT(tasks) WHERE tasks.epic_id = X', interpretation: 'Number of tasks assigned to each epic', inputs: ['tasks.epic_id'] },
      { metric: 'Intervention Escalation Rate', formula: 'COUNT(intervention_items) / COUNT(exception_queue) * 100', interpretation: 'Fraction of PCL exceptions escalated to intervention', inputs: ['intervention_items.status', 'intervention_items.project_id'] },
      { metric: 'Intervention Approval Rate', formula: 'COUNT(WHERE status = approved) / COUNT(intervention_items) * 100', interpretation: 'Fraction of escalated interventions approved for COO', inputs: ['intervention_items.status'] },
      { metric: 'Intervention Resolution Time', formula: 'AVG(updated_at - approved_at) WHERE status = resolved', interpretation: 'Average time from approval to resolution', inputs: ['intervention_items.approved_at', 'intervention_items.status'] },
      { metric: 'PCL-to-COO Pipeline', formula: 'COUNT(intervention_items WHERE status = approved)', interpretation: 'Number of items pushed from PCL to COO', inputs: ['intervention_items.status'] },
    ],
    [],
  );

  const variables = useMemo(
    (): VariableDef[] => [
      // Codebase hierarchy / linking variables (schema-defined keys that connect tables)
      { key: '*.project_id', name: 'Project ID', sourceSystem: 'Codebase', sourceTable: 'schema', sourceColumn: 'project_id', dataType: 'text', meaning: 'Links records to a project. Present on projects, units, phases, tasks, sub_tasks, hour_entries, customer_contracts, forecasts, project_documents.', transform: 'Set on insert; FK to projects(id).', usedBy: ['All rollups', 'Filtering', 'JOINs'] },
      { key: '*.unit_id', name: 'Unit ID', sourceSystem: 'Codebase', sourceTable: 'schema', sourceColumn: 'unit_id', dataType: 'text', meaning: 'Links units to projects; phases and tasks to their unit. Present on units, phases, tasks, sub_tasks.', transform: 'Set on insert; FK to units(id).', usedBy: ['WBS hierarchy', 'Rollups', 'Unit drill-down'] },
      { key: '*.phase_id', name: 'Phase ID', sourceSystem: 'Codebase', sourceTable: 'schema', sourceColumn: 'phase_id', dataType: 'text', meaning: 'Links phases to units; tasks and sub_tasks to their phase. Present on phases, tasks, sub_tasks, qc_logs.', transform: 'Set on insert; FK to phases(id).', usedBy: ['WBS hierarchy', 'Rollups', 'Phase drill-down'] },
      { key: '*.task_id', name: 'Task ID', sourceSystem: 'Codebase', sourceTable: 'schema', sourceColumn: 'task_id', dataType: 'text', meaning: 'Links sub_tasks to their parent task. Present on tasks, sub_tasks, sprint_tasks, qc_logs.', transform: 'Set on insert; FK to tasks(id).', usedBy: ['WBS hierarchy', 'Sprint board', 'QC log'] },
      { key: '*.parent_id', name: 'Parent ID', sourceSystem: 'Codebase', sourceTable: 'schema', sourceColumn: 'parent_id', dataType: 'text', meaning: 'WBS flat hierarchy: links a row to its parent (unit→project, phase→unit, task→phase, sub_task→task).', transform: 'Derived from unit_id/phase_id/task_id during WBS flatten.', usedBy: ['WBS Gantt', 'Hierarchy walk'] },
      { key: '*.site_id', name: 'Site ID', sourceSystem: 'Codebase', sourceTable: 'schema', sourceColumn: 'site_id', dataType: 'text', meaning: 'Links projects to sites. Present on projects.', transform: 'Set on insert; FK to sites(id).', usedBy: ['Project hierarchy', 'Customer/site rollup'] },
      { key: '*.customer_id', name: 'Customer ID', sourceSystem: 'Codebase', sourceTable: 'schema', sourceColumn: 'customer_id', dataType: 'text', meaning: 'Links projects to customers. Present on projects.', transform: 'Set on insert; FK to customers(id).', usedBy: ['Project hierarchy', 'Contract matching'] },
      { key: '*.portfolio_id', name: 'Portfolio ID', sourceSystem: 'Codebase', sourceTable: 'schema', sourceColumn: 'portfolio_id', dataType: 'text', meaning: 'Links customers/sites/projects to portfolios. Present on customers, sites, projects.', transform: 'Set on insert; FK to portfolios(id).', usedBy: ['Portfolio rollup', 'Aggregate views'] },
      { key: '*.employee_id', name: 'Employee ID', sourceSystem: 'Codebase', sourceTable: 'schema', sourceColumn: 'employee_id', dataType: 'text', meaning: 'Links records to employees. Present on units, phases, tasks, sub_tasks, hour_entries.', transform: 'Set on insert; FK to employees(id).', usedBy: ['Ownership', 'Hour attribution', 'PCA lookup'] },
      { key: '*.sprint_id', name: 'Sprint ID', sourceSystem: 'Codebase', sourceTable: 'schema', sourceColumn: 'sprint_id', dataType: 'text', meaning: 'Links sprint_tasks to sprints. Present on sprint_tasks.', transform: 'Set on insert; FK to sprints(id).', usedBy: ['Sprint board', 'Burndown'] },
      { key: '*.epic_id', name: 'Epic ID', sourceSystem: 'Codebase', sourceTable: 'schema', sourceColumn: 'epic_id', dataType: 'text', meaning: 'Links tasks to epics (phase-level breakdown). Present on tasks, epics.', transform: 'Set on insert; FK to epics(id).', usedBy: ['Epic Completion %', 'Sprint grouping', 'QC log'] },
      { key: '*.feature_id', name: 'Feature ID', sourceSystem: 'Codebase', sourceTable: 'schema', sourceColumn: 'feature_id', dataType: 'text', meaning: 'Links tasks to features (epic-level breakdown). Present on tasks, features.', transform: 'Set on insert; FK to features(id).', usedBy: ['Feature Completion %', 'Sprint grouping', 'QC log'] },
      // Metric / rollup variables
      { key: 'projects.actual_hours', name: 'Actual Hours', sourceSystem: 'Computed', sourceTable: 'projects', sourceColumn: 'actual_hours', dataType: 'numeric', meaning: 'Actual consumed hours at project level (rollup).', transform: 'DB rollup from units/phases/tasks/sub_tasks.', usedBy: ['SPI', 'Efficiency', 'Forecast'] },
      { key: 'projects.baseline_hours', name: 'Baseline Hours', sourceSystem: 'Computed', sourceTable: 'projects', sourceColumn: 'baseline_hours', dataType: 'numeric', meaning: 'Planned baseline hours at project level.', transform: 'DB rollup from schedule hierarchy.', usedBy: ['SPI', 'Efficiency'] },
      { key: 'projects.remaining_hours', name: 'Remaining Hours', sourceSystem: 'Computed', sourceTable: 'projects', sourceColumn: 'remaining_hours', dataType: 'numeric', meaning: 'Estimated hours left to complete.', transform: 'DB rollup / ingest.', usedBy: ['EAC Hours', 'Forecast'] },
      { key: 'projects.actual_cost', name: 'Actual Cost', sourceSystem: 'Computed', sourceTable: 'projects', sourceColumn: 'actual_cost', dataType: 'numeric', meaning: 'Actual cost spent to date.', transform: 'DB rollup from schedule/workday costs.', usedBy: ['CPI', 'EAC', 'Margin'] },
      { key: 'projects.remaining_cost', name: 'Remaining Cost', sourceSystem: 'Computed', sourceTable: 'projects', sourceColumn: 'remaining_cost', dataType: 'numeric', meaning: 'Expected cost still to spend.', transform: 'DB rollup / planner updates.', usedBy: ['EAC', 'Margin'] },
      { key: 'projects.percent_complete', name: 'Percent Complete', sourceSystem: 'Computed', sourceTable: 'projects', sourceColumn: 'percent_complete', dataType: 'numeric', meaning: 'Completion ratio in percent.', transform: 'actual_hours / total_hours * 100 where available.', usedBy: ['Earned Value', 'CPI', 'Progress visuals'] },
      { key: 'projects.has_schedule', name: 'Has Schedule', sourceSystem: 'Computed', sourceTable: 'projects', sourceColumn: 'has_schedule', dataType: 'boolean', meaning: 'Project has current processed MPP schedule.', transform: 'Set during upload/process/delete lifecycle.', usedBy: ['Project filtering', 'Plans freshness'] },
      { key: 'tasks.total_hours', name: 'Task Total Hours', sourceSystem: 'MPP', sourceTable: 'tasks', sourceColumn: 'total_hours', dataType: 'numeric', meaning: 'Task-level total hours (actual + remaining).', transform: 'Mapped from MPP then rolled up.', usedBy: ['WBS load', 'Utilization'] },
      { key: 'tasks.baseline_hours', name: 'Task Baseline Hours', sourceSystem: 'MPP', sourceTable: 'tasks', sourceColumn: 'baseline_hours', dataType: 'numeric', meaning: 'Planned hours at task level.', transform: 'Mapped from MPP then rolled up.', usedBy: ['SPI', 'Variance Hours', 'Variance %'] },
      { key: 'tasks.total_float', name: 'Task Total Float', sourceSystem: 'MPP', sourceTable: 'tasks', sourceColumn: 'total_float', dataType: 'numeric', meaning: 'Slack in workdays before task becomes critical.', transform: 'From MPP totalSlack.', usedBy: ['Schedule Health', 'Float distribution'] },
      { key: 'tasks.is_critical', name: 'Task Is Critical', sourceSystem: 'MPP', sourceTable: 'tasks', sourceColumn: 'is_critical', dataType: 'boolean', meaning: 'Task on critical path.', transform: 'From MPP critical path calc.', usedBy: ['Overall Compliance', 'Critical open count'] },
      { key: 'tasks.is_milestone', name: 'Task Is Milestone', sourceSystem: 'MPP', sourceTable: 'tasks', sourceColumn: 'is_milestone', dataType: 'boolean', meaning: 'Zero-duration milestone.', transform: 'From MPP.', usedBy: ['Milestone on-time rate'] },
      { key: 'tasks.days', name: 'Task Duration Days', sourceSystem: 'MPP', sourceTable: 'tasks', sourceColumn: 'days', dataType: 'integer', meaning: 'Duration in days from schedule model.', transform: 'Mapped from MPP parser.', usedBy: ['FTE load', 'Utilization'] },
      { key: 'tasks.resource', name: 'Task Resource', sourceSystem: 'MPP', sourceTable: 'tasks', sourceColumn: 'resource', dataType: 'text', meaning: 'Assigned resource or role on the task.', transform: 'Mapped from MPP resources.', usedBy: ['Resourcing heatmaps', 'Unassigned checks'] },
      { key: 'tasks.comments', name: 'Task Comments', sourceSystem: 'MPP', sourceTable: 'tasks', sourceColumn: 'comments', dataType: 'text', meaning: 'Task commentary or notes.', transform: 'Direct value, variance tracked as text change.', usedBy: ['WBS comments variance'] },
      { key: 'hour_entries.charge_code', name: 'Charge Code', sourceSystem: 'Workday', sourceTable: 'hour_entries', sourceColumn: 'charge_code', dataType: 'text', meaning: 'Workday charge code (QC, rework, admin, execute, etc.).', transform: 'Direct ingest.', usedBy: ['QC ratio', 'Rework ratio', 'Cost of Quality', 'Execute ratio'] },
      { key: 'hour_entries.hours', name: 'Workday Hours', sourceSystem: 'Workday', sourceTable: 'hour_entries', sourceColumn: 'hours', dataType: 'numeric', meaning: 'Raw actual hours from Workday.', transform: 'Ingested and keyed by project/employee/date.', usedBy: ['Mapping coverage', 'Actual propagation'] },
      { key: 'hour_entries.mpp_phase_task', name: 'Mapped MPP Key', sourceSystem: 'Computed', sourceTable: 'hour_entries', sourceColumn: 'mpp_phase_task', dataType: 'text', meaning: 'Resolved MPP phase/task mapping key.', transform: 'Auto-match gates + manual mapping.', usedBy: ['Mapping coverage', 'Exceptions'] },
      { key: 'hour_entries.date', name: 'Workday Date', sourceSystem: 'Workday', sourceTable: 'hour_entries', sourceColumn: 'date', dataType: 'date', meaning: 'Posting date for time entry.', transform: 'Flexible date parse + sanitize.', usedBy: ['Trend charts', 'Time slicing'] },
      { key: 'hour_entries.actual_revenue', name: 'Actual Revenue', sourceSystem: 'Workday', sourceTable: 'hour_entries', sourceColumn: 'actual_revenue', dataType: 'numeric', meaning: 'Revenue recognized against time entry.', transform: 'Direct ingest; when missing can be proxied by actual_cost for high-level trajectory.', usedBy: ['Revenue trajectory', 'Revenue recognized KPI'] },
      { key: 'projects.trend_hours_pct', name: 'Trending Hours %', sourceSystem: 'Computed', sourceTable: 'projects', sourceColumn: 'trend_hours_pct', dataType: 'numeric', meaning: 'Recent 3 months hours change vs prior 3 months.', transform: '(recent_3m - prior_3m) / prior_3m * 100.', usedBy: ['COO forecast', 'COO variance review', 'Driver matrices', 'Trend Health'] },
      { key: 'projects.trend_hours_mo', name: 'Trending Hours / Month', sourceSystem: 'Computed', sourceTable: 'projects', sourceColumn: 'trend_hours_mo', dataType: 'numeric', meaning: 'Average monthly hours in recent 3-month window.', transform: 'recent_3m_hours / 3.', usedBy: ['COO drill down', 'Forecast pace'] },
      { key: 'projects.baseline_end', name: 'Baseline End', sourceSystem: 'MPP', sourceTable: 'projects', sourceColumn: 'baseline_end', dataType: 'date', meaning: 'Planned project end date.', transform: 'MAX of children baseline_end.', usedBy: ['Schedule Health', 'Schedule variance days'] },
      { key: 'hours_trend.recent_hours', name: 'Recent 3M Hours', sourceSystem: 'Computed', sourceTable: 'hour_entries', sourceColumn: 'hours', dataType: 'numeric', meaning: 'Sum of hours in last 3 months.', transform: 'SUM(hours) WHERE date >= CURRENT_DATE - 3 months.', usedBy: ['Trending Hours %', 'Trending Hours / Month'] },
      { key: 'hours_trend.prior_hours', name: 'Prior 3M Hours', sourceSystem: 'Computed', sourceTable: 'hour_entries', sourceColumn: 'hours', dataType: 'numeric', meaning: 'Sum of hours in 3–6 months ago.', transform: 'SUM(hours) WHERE date 3–6 months ago.', usedBy: ['Trending Hours %'] },
      { key: 'overdue_count', name: 'Overdue Task Count', sourceSystem: 'Computed', sourceTable: 'tasks', sourceColumn: 'overdue_count', dataType: 'integer', meaning: 'Tasks past baseline_end and not 100% complete.', transform: 'COUNT WHERE baseline_end < CURRENT_DATE AND percent_complete < 100.', usedBy: ['Schedule Health'] },
      { key: 'schedule_variance_days', name: 'Schedule Variance Days', sourceSystem: 'Computed', sourceTable: 'projects', sourceColumn: 'schedule_variance_days', dataType: 'integer', meaning: 'Days past baseline_end (0 if on or ahead).', transform: 'CURRENT_DATE - baseline_end when baseline_end < CURRENT_DATE.', usedBy: ['Schedule Health'] },
      { key: 'project_documents.uploaded_at', name: 'Plan Upload Timestamp', sourceSystem: 'MPP', sourceTable: 'project_documents', sourceColumn: 'uploaded_at', dataType: 'timestamp', meaning: 'When a project file was uploaded.', transform: 'Set on document insert.', usedBy: ['Plan freshness', 'Stale plan detection'] },
      { key: 'project_documents.is_current_version', name: 'Current Plan Flag', sourceSystem: 'Computed', sourceTable: 'project_documents', sourceColumn: 'is_current_version', dataType: 'boolean', meaning: 'Current active schedule version.', transform: 'Maintained on upload/reprocess/delete.', usedBy: ['Schedule availability', 'Data lifecycle'] },
      { key: 'customer_contracts.line_amount', name: 'Contract Amount', sourceSystem: 'Workday', sourceTable: 'customer_contracts', sourceColumn: 'line_amount', dataType: 'numeric', meaning: 'Contract value line item.', transform: 'Summed by project for totals.', usedBy: ['Margin', 'EAC variance to contract'] },
      { key: 'variance_notes.baseline_value', name: 'Variance Baseline', sourceSystem: 'Computed', sourceTable: 'variance_notes', sourceColumn: 'baseline_value', dataType: 'numeric', meaning: 'Prior value for tracked variable.', transform: 'Captured automatically on edits.', usedBy: ['Delta render in WBS', 'Provenance notes'] },
      { key: 'variance_notes.current_value', name: 'Variance Current', sourceSystem: 'Computed', sourceTable: 'variance_notes', sourceColumn: 'current_value', dataType: 'numeric', meaning: 'New value for tracked variable.', transform: 'Captured automatically on edits.', usedBy: ['Delta render in WBS', 'Variance tables'] },
      { key: 'variance_notes.variance_value', name: 'Variance Delta', sourceSystem: 'Computed', sourceTable: 'variance_notes', sourceColumn: 'variance_value', dataType: 'numeric', meaning: 'current_value - baseline_value.', transform: 'Computed at write time.', usedBy: ['Delta labels', 'Audit'] },
      { key: 'variance_notes.comment', name: 'Variance Comment', sourceSystem: 'Computed', sourceTable: 'variance_notes', sourceColumn: 'comment', dataType: 'text', meaning: 'Rationale or serialized text change details.', transform: 'Manual note or auto JSON for text change.', usedBy: ['WBS comment variance', 'Audit trail'] },
      { key: 'epics.name', name: 'Epic Name', sourceSystem: 'Database', sourceTable: 'epics', sourceColumn: 'name', dataType: 'text', meaning: 'Name of the epic (phase-level grouping).', transform: 'Set on create.', usedBy: ['Sprint grouping', 'QC log', 'Epic Completion %'] },
      { key: 'epics.phase_id', name: 'Epic Phase', sourceSystem: 'Database', sourceTable: 'epics', sourceColumn: 'phase_id', dataType: 'text', meaning: 'Phase this epic breaks down.', transform: 'Set on create; FK to phases(id).', usedBy: ['WBS hierarchy', 'Epic Completion %'] },
      { key: 'epics.status', name: 'Epic Status', sourceSystem: 'Database', sourceTable: 'epics', sourceColumn: 'status', dataType: 'text', meaning: 'Active or archived status of the epic.', transform: 'Default active; toggled by user.', usedBy: ['Sprint filter'] },
      { key: 'features.name', name: 'Feature Name', sourceSystem: 'Database', sourceTable: 'features', sourceColumn: 'name', dataType: 'text', meaning: 'Name of the feature (epic-level breakdown).', transform: 'Set on create.', usedBy: ['Sprint grouping', 'QC log', 'Feature Completion %'] },
      { key: 'features.epic_id', name: 'Feature Epic', sourceSystem: 'Database', sourceTable: 'features', sourceColumn: 'epic_id', dataType: 'text', meaning: 'Epic this feature breaks down.', transform: 'Set on create; FK to epics(id).', usedBy: ['Hierarchy walk'] },
      { key: 'features.status', name: 'Feature Status', sourceSystem: 'Database', sourceTable: 'features', sourceColumn: 'status', dataType: 'text', meaning: 'Active or archived status of the feature.', transform: 'Default active; toggled by user.', usedBy: ['Sprint filter'] },
      { key: 'intervention_items.project_id', name: 'Intervention Project', sourceSystem: 'Database', sourceTable: 'intervention_items', sourceColumn: 'project_id', dataType: 'text', meaning: 'Project associated with the intervention.', transform: 'Set on escalation; FK to projects(id).', usedBy: ['Intervention queue', 'COO merge'] },
      { key: 'intervention_items.severity', name: 'Intervention Severity', sourceSystem: 'Database', sourceTable: 'intervention_items', sourceColumn: 'severity', dataType: 'text', meaning: 'Exception severity (critical/warning/info).', transform: 'Set by PCL on review.', usedBy: ['Intervention queue', 'Escalation Rate'] },
      { key: 'intervention_items.priority', name: 'Intervention Priority', sourceSystem: 'Database', sourceTable: 'intervention_items', sourceColumn: 'priority', dataType: 'text', meaning: 'Priority level P1/P2/P3.', transform: 'Set by PCL on review.', usedBy: ['Intervention queue', 'COO display'] },
      { key: 'intervention_items.status', name: 'Intervention Status', sourceSystem: 'Database', sourceTable: 'intervention_items', sourceColumn: 'status', dataType: 'text', meaning: 'Lifecycle state: pcl_review, approved, dismissed, resolved.', transform: 'Updated by PCL/COO actions.', usedBy: ['Approval Rate', 'Resolution Time', 'Pipeline Count'] },
      { key: 'intervention_items.pcl_notes', name: 'PCL Notes', sourceSystem: 'Database', sourceTable: 'intervention_items', sourceColumn: 'pcl_notes', dataType: 'text', meaning: 'Notes from PCL during review.', transform: 'Editable by PCL.', usedBy: ['Intervention queue'] },
      { key: 'intervention_items.approved_at', name: 'Intervention Approved At', sourceSystem: 'Database', sourceTable: 'intervention_items', sourceColumn: 'approved_at', dataType: 'timestamp', meaning: 'When the intervention was approved for COO.', transform: 'Set on approve action.', usedBy: ['Resolution Time', 'Pipeline Count'] },
      { key: 'intervention_items.escalated_by', name: 'Escalated By', sourceSystem: 'Database', sourceTable: 'intervention_items', sourceColumn: 'escalated_by', dataType: 'text', meaning: 'PCL user who escalated the exception.', transform: 'Set on escalation.', usedBy: ['Audit'] },
      { key: 'intervention_items.variance_pct', name: 'Intervention Variance %', sourceSystem: 'Database', sourceTable: 'intervention_items', sourceColumn: 'variance_pct', dataType: 'numeric', meaning: 'Variance % at time of escalation.', transform: 'Snapshot from exception queue.', usedBy: ['COO display', 'Escalation Rate'] },
    ],
    [],
  );

  const q = search.trim().toLowerCase();
  const filteredFormulas = useMemo(
    () => formulas.filter((f) =>
      !q
      || f.metric.toLowerCase().includes(q)
      || f.formula.toLowerCase().includes(q)
      || f.interpretation.toLowerCase().includes(q)
      || f.inputs.some((i) => i.toLowerCase().includes(q))),
    [formulas, q],
  );
  const filteredVariables = useMemo(
    () => variables.filter((v) =>
      !q
      || v.key.toLowerCase().includes(q)
      || v.name.toLowerCase().includes(q)
      || v.sourceSystem.toLowerCase().includes(q)
      || v.sourceTable.toLowerCase().includes(q)
      || v.sourceColumn.toLowerCase().includes(q)
      || v.meaning.toLowerCase().includes(q)
      || v.transform.toLowerCase().includes(q)
      || v.usedBy.some((u) => u.toLowerCase().includes(q))),
    [variables, q],
  );
  const filteredNotes = useMemo(
    () => notes.filter((n) =>
      !q
      || n.table_name.toLowerCase().includes(q)
      || n.record_id.toLowerCase().includes(q)
      || n.metric_key.toLowerCase().includes(q)
      || (n.comment || '').toLowerCase().includes(q)),
    [notes, q],
  );

  const lineageGraphOption = useMemo((): EChartsOption => {
    const nodes: Array<Record<string, unknown>> = [];
    const links: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    const addNode = (id: string, name: string, category: number, value = 1) => {
      if (seen.has(id)) return;
      seen.add(id);
      nodes.push({ id, name, category, value });
    };

    const sourceSystems = ['Workday', 'MPP', 'Database', 'Computed', 'Codebase'] as const;
    sourceSystems.forEach((s) => addNode(`source:${s}`, s, 0, 18));

    const tables = [...new Set(filteredVariables.map((v) => v.sourceTable))];
    tables.forEach((t) => addNode(`table:${t}`, t, 1, 14));
    filteredVariables.forEach((v) => {
      addNode(`var:${v.key}`, `${v.sourceColumn}`, 2, 10);
      links.push({ source: `source:${v.sourceSystem}`, target: `table:${v.sourceTable}` });
      links.push({ source: `table:${v.sourceTable}`, target: `var:${v.key}` });
    });
    filteredFormulas.forEach((m) => {
      const metricId = `metric:${m.metric}`;
      addNode(metricId, m.metric.replace(/\s+\(.+\)/, ''), 3, 16);
      m.inputs.forEach((input) => links.push({ source: `var:${input}`, target: metricId }));
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (p: any) => {
          if (p.dataType === 'edge') return `${p.data.source} -> ${p.data.target}`;
          return `<b>${p.data.name}</b>`;
        },
      },
      series: [
        {
          type: 'graph',
          layout: 'force',
          roam: true,
          draggable: true,
          data: nodes,
          links,
          categories: [
            { name: 'Source System' },
            { name: 'Table' },
            { name: 'Variable' },
            { name: 'Metric' },
          ],
          label: {
            show: true,
            color: '#f8fafc',
            fontSize: 13,
            fontWeight: 600,
            backgroundColor: 'rgba(15, 23, 42, 0.74)',
            borderRadius: 4,
            padding: [2, 5],
          },
          lineStyle: {
            color: 'source',
            opacity: 0.8,
            width: 1.6,
            curveness: 0.14,
          },
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: [0, 7],
          itemStyle: {
            color: '#60a5fa',
            borderColor: '#dbeafe',
            borderWidth: 1,
          },
          emphasis: { focus: 'adjacency', lineStyle: { width: 2.3 } },
          force: {
            repulsion: 300,
            edgeLength: [90, 170],
            friction: 0.2,
            gravity: 0.04,
          },
        },
      ],
    };
  }, [filteredVariables, filteredFormulas]);

  const onSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/variance/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          ...form,
          baseline_value: form.baseline_value === '' ? null : Number(form.baseline_value),
          current_value: form.current_value === '' ? null : Number(form.current_value),
          created_by: `${role} User`,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to save variance note');
      setForm((f) => ({ ...f, record_id: '', metric_key: '', baseline_value: '', current_value: '', comment: '' }));
      await loadNotes();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Metric Provenance</h1>
      <p className="page-subtitle">
        Comprehensive, role-aware metric definitions, formulas, and variance commentary ({role} view).
      </p>

      <div className="glass-raised" style={{ padding: '0.75rem', marginBottom: 14 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search variables, formulas, source systems, notes..."
          style={{ ...inputStyle, width: '100%' }}
        />
        <div style={{ marginTop: 6, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          Filtered: {filteredVariables.length} variables · {filteredFormulas.length} formulas · {filteredNotes.length} notes
        </div>
      </div>

      <div className="glass" style={{ padding: '1rem', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>Lineage Flow (Source System → Table → Variable → Metric)</div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 10 }}>
          Multi-branch lineage graph with explicit Workday/MPP/Database/Codebase source ancestry. Codebase = app-specific hierarchy keys (project_id, unit_id, phase_id, task_id, etc.) that link tables.
        </div>
        <ChartWrapper option={lineageGraphOption} height={520} />
      </div>

      <div className="glass" style={{ padding: '1rem', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 10 }}>Metric Formula Reference</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dm-table" style={{ width: '100%', fontSize: '0.74rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Metric</th>
                <th style={{ textAlign: 'left' }}>Formula / Calculation</th>
                <th style={{ textAlign: 'left' }}>Interpretation</th>
              </tr>
            </thead>
            <tbody>
              {filteredFormulas.map((f) => (
                <tr key={f.metric}>
                  <td style={{ fontWeight: 600 }}>{f.metric}</td>
                  <td>{f.formula}</td>
                  <td>{f.interpretation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass" style={{ padding: '1rem', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 10 }}>Variable Registry (Granular)</div>
        <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
          <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Variable</th>
                <th style={{ textAlign: 'left' }}>Source System</th>
                <th style={{ textAlign: 'left' }}>Source</th>
                <th style={{ textAlign: 'left' }}>Type</th>
                <th style={{ textAlign: 'left' }}>Meaning</th>
                <th style={{ textAlign: 'left' }}>Transform</th>
                <th style={{ textAlign: 'left' }}>Used By</th>
              </tr>
            </thead>
            <tbody>
              {filteredVariables.map((v) => (
                <tr key={v.key}>
                  <td style={{ fontWeight: 600 }}>{v.key}</td>
                  <td>{v.sourceSystem}</td>
                  <td>{v.sourceTable}.{v.sourceColumn}</td>
                  <td>{v.dataType}</td>
                  <td>{v.meaning}</td>
                  <td>{v.transform}</td>
                  <td>{v.usedBy.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="glass" style={{ padding: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 10 }}>Add Variance Note</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input value={form.table_name} onChange={(e) => setForm({ ...form, table_name: e.target.value })} placeholder="Table (e.g. projects)" style={inputStyle} />
            <input value={form.record_id} onChange={(e) => setForm({ ...form, record_id: e.target.value })} placeholder="Record ID" style={inputStyle} />
            <input value={form.metric_key} onChange={(e) => setForm({ ...form, metric_key: e.target.value })} placeholder="Metric Key (e.g. actual_hours)" style={inputStyle} />
            <div />
            <input value={form.baseline_value} onChange={(e) => setForm({ ...form, baseline_value: e.target.value })} placeholder="Baseline Value" type="number" style={inputStyle} />
            <input value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} placeholder="Current Value" type="number" style={inputStyle} />
          </div>
          <textarea
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
            placeholder="Variance comment / rationale"
            rows={4}
            style={{ width: '100%', marginTop: 8, background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '0.45rem 0.55rem' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Minimal variance model: numeric delta + timestamped comment.
            </span>
            <button className="btn btn-accent" onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Variance Note'}
            </button>
          </div>
          {error && <div style={{ color: 'var(--color-error)', fontSize: '0.72rem', marginTop: 8 }}>{error}</div>}
        </div>

        <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 10 }}>Recent Variance Notes</div>
          {loading ? (
            <Skeleton height={220} />
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
              <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Table.Record</th>
                    <th style={{ textAlign: 'left' }}>Metric</th>
                    <th style={{ textAlign: 'right' }}>Delta</th>
                    <th style={{ textAlign: 'left' }}>Comment</th>
                    <th style={{ textAlign: 'right' }}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNotes.map((n) => (
                    <tr key={n.id}>
                      <td>{n.table_name}.{n.record_id}</td>
                      <td>{n.metric_key}</td>
                      <td style={{ textAlign: 'right', color: Number(n.variance_value || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                        {Number(n.variance_value || 0).toFixed(2)}
                      </td>
                      <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.comment || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{n.created_at ? new Date(n.created_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                  {filteredNotes.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No variance notes yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

