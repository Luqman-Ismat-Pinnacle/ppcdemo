/**
 * Maps MPP parser JSON output into the minimal schema tables.
 * The parser emits an array of tasks with outline_level.
 * We split by outline_level into units (2), phases (3), tasks (4), sub_tasks (5+).
 */

type Raw = Record<string, unknown>;

function s(val: unknown): string { return val ? String(val).trim() : ''; }
function n(val: unknown): number { const v = Number(val); return Number.isFinite(v) ? v : 0; }
function i(val: unknown): number {
  const v = Number(val);
  return Number.isFinite(v) ? Math.round(v) : 0;
}
function d(val: unknown): string | null {
  if (!val) return null;
  const str = String(val).trim();
  if (!str) return null;
  const dt = new Date(str);
  return Number.isFinite(dt.getTime()) ? dt.toISOString().slice(0, 10) : null;
}

interface MppTask {
  id?: string;
  name?: string;
  outline_level?: number;
  outlineLevel?: number;
  parent_id?: string;
  parentId?: string;
  startDate?: string;
  endDate?: string;
  start_date?: string;
  end_date?: string;
  baselineStartDate?: string;
  baseline_start_date?: string;
  baselineEndDate?: string;
  baseline_end_date?: string;
  actualStartDate?: string;
  actual_start_date?: string;
  actualEndDate?: string;
  actual_end_date?: string;
  percentComplete?: number;
  percent_complete?: number;
  baselineHours?: number;
  baseline_hours?: number;
  actualHours?: number;
  actual_hours?: number;
  remainingHours?: number;
  remaining_hours?: number;
  projectedHours?: number;
  projected_hours?: number;
  baselineCost?: number;
  baseline_cost?: number;
  actualCost?: number;
  actual_cost?: number;
  remainingCost?: number;
  remaining_cost?: number;
  isCritical?: boolean;
  is_critical?: boolean;
  isMilestone?: boolean;
  is_milestone?: boolean;
  isSummary?: boolean;
  is_summary?: boolean;
  totalSlack?: number;
  total_slack?: number;
  assignedResource?: string;
  assigned_resource?: string;
  constraintType?: string;
  constraint_type?: string;
  constraintDate?: string;
  constraint_date?: string;
  earlyStart?: string;
  early_start?: string;
  earlyFinish?: string;
  early_finish?: string;
  lateStart?: string;
  late_start?: string;
  lateFinish?: string;
  late_finish?: string;
  priority?: number;
  wbsCode?: string;
  wbs_code?: string;
  folder?: string;
  predecessors?: Array<{
    taskId?: string;
    predecessorTaskId?: string;
    predecessor_task_id?: string;
    predecessorName?: string;
    predecessor_name?: string;
    relationship?: string;
    type?: string;
    lagDays?: number;
    lag_days?: number;
  }>;
  [key: string]: unknown;
}

export function mapMppOutput(
  parserTasks: MppTask[],
  projectId: string,
): { units: Raw[]; phases: Raw[]; tasks: Raw[]; sub_tasks: Raw[] } {
  const units: Raw[] = [];
  const phases: Raw[] = [];
  const tasks: Raw[] = [];
  const subTasks: Raw[] = [];

  let unitIdx = 0, phaseIdx = 0, taskIdx = 0, subIdx = 0;
  let currentUnitId = '';
  let currentPhaseId = '';
  let currentTaskId = '';

  for (const t of parserTasks) {
    const level = i(t.outline_level ?? t.outlineLevel ?? 0);
    if (level < 2) continue;

    const pred = Array.isArray(t.predecessors)
      ? t.predecessors.find((p) =>
        s(p.predecessorTaskId ?? p.predecessor_task_id ?? p.taskId ?? p.predecessorName ?? p.predecessor_name),
      ) || t.predecessors[0]
      : null;
    const predTaskId = pred ? s(pred.predecessorTaskId ?? pred.predecessor_task_id ?? pred.taskId) : '';
    const predName = pred ? s(pred.predecessorName ?? pred.predecessor_name) : '';
    const predRel = pred ? s((pred.relationship ?? pred.type) || 'FS') : '';
    const predLag = pred ? i(pred.lagDays ?? pred.lag_days) : 0;

    const base: Raw = {
      name: s(t.name),
      project_id: projectId,
      baseline_start: d(t.baselineStartDate ?? t.baseline_start_date),
      baseline_end: d(t.baselineEndDate ?? t.baseline_end_date),
      actual_start: d(t.actualStartDate ?? t.actual_start_date ?? t.startDate ?? t.start_date),
      actual_end: d(t.actualEndDate ?? t.actual_end_date ?? t.endDate ?? t.end_date),
      baseline_hours: n(t.baselineHours ?? t.baseline_hours),
      actual_hours: n(t.actualHours ?? t.actual_hours),
      remaining_hours: n(t.remainingHours ?? t.remaining_hours),
      projected_hours: n(t.projectedHours ?? t.projected_hours),
      actual_cost: n(t.actualCost ?? t.actual_cost),
      remaining_cost: n(t.remainingCost ?? t.remaining_cost),
      progress: n(t.percentComplete ?? t.percent_complete),
      is_critical: !!(t.isCritical ?? t.is_critical),
      is_milestone: !!(t.isMilestone ?? t.is_milestone),
      is_summary: !!(t.isSummary ?? t.is_summary),
      outline_level: level,
      total_float: i(t.totalSlack ?? t.total_slack),
      resources: s(t.assignedResource ?? t.assigned_resource),
      constraint_date: d(t.constraintDate ?? t.constraint_date),
      constraint_type: s(t.constraintType ?? t.constraint_type),
      early_start: d(t.earlyStart ?? t.early_start),
      early_finish: d(t.earlyFinish ?? t.early_finish),
      late_start: d(t.lateStart ?? t.late_start),
      late_finish: d(t.lateFinish ?? t.late_finish),
      priority_value: i(t.priority ?? 0),
      wbs_code: s(t.wbsCode ?? t.wbs_code),
      folder: s(t.folder),
      predecessor_name: predName || null,
      predecessor_task_id: predTaskId || null,
      relationship: predRel || null,
      lag_days: predLag,
    };

    if (level === 2) {
      unitIdx++;
      currentUnitId = s(t.id) || `${projectId}-U${unitIdx}`;
      base.id = currentUnitId;
      units.push(base);
    } else if (level === 3) {
      phaseIdx++;
      currentPhaseId = s(t.id) || `${projectId}-P${phaseIdx}`;
      base.id = currentPhaseId;
      base.unit_id = currentUnitId || null;
      base.resource = s(t.assignedResource ?? t.assigned_resource);
      phases.push(base);
    } else if (level === 4) {
      taskIdx++;
      currentTaskId = s(t.id) || `${projectId}-T${taskIdx}`;
      base.id = currentTaskId;
      base.phase_id = currentPhaseId || null;
      base.unit_id = currentUnitId || null;
      base.resource = s(t.assignedResource ?? t.assigned_resource);
      tasks.push(base);
    } else {
      subIdx++;
      base.id = s(t.id) || `${projectId}-ST${subIdx}`;
      base.task_id = currentTaskId || null;
      base.phase_id = currentPhaseId || null;
      base.unit_id = currentUnitId || null;
      base.resource = s(t.assignedResource ?? t.assigned_resource);
      subTasks.push(base);
    }
  }

  return { units, phases, tasks, sub_tasks: subTasks };
}
