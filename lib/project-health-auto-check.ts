/**
 * Auto project health check - analyzes parsed MPP/schedule data and evaluates
 * automatable health checks. Returns a score (0-100) and list of flagged issues.
 */

export interface HealthCheckResult {
  checkName: string;
  passed: boolean;
  message?: string;
  details?: string;
}

export interface ProjectHealthAutoResult {
  score: number;
  totalChecks: number;
  passed: number;
  failed?: number;
  results: HealthCheckResult[];
  issues: string[];
}

interface ConvertedData {
  phases?: Array<{ id?: string; name?: string }>;
  units?: Array<{ id?: string; name?: string }>;
  tasks?: Array<{
    id?: string;
    name?: string;
    predecessorId?: string | null;
    predecessor_id?: string | null;
    predecessorIds?: string[];
    successorIds?: string[];
    assignedResourceId?: string | null;
    assigned_resource_id?: string | null;
    assignedResourceIds?: string[];
    assignedResource?: string;
    assigned_resource?: string;
    assignedResources?: string[];
    baselineWork?: number;
    baseline_work?: number;
    baselineHours?: number;
    baseline_hours?: number;
    duration?: number;
    work?: number;
    count?: number;
    baselineCount?: number;
    baseline_count?: number;
    isSubTask?: boolean;
    isExecution?: boolean;
    taskType?: string;
  }>;
}

export function runProjectHealthAutoCheck(convertedData: ConvertedData): ProjectHealthAutoResult {
  const results: HealthCheckResult[] = [];
  const issues: string[] = [];
  const tasks = convertedData.tasks || [];
  const executionTasks = tasks.filter((t) => t.isExecution !== false && !t.isSubTask);

  const getPredCount = (t: (typeof tasks)[0]) => {
    const ids = t.predecessorIds;
    if (ids && ids.length > 0) return ids.length;
    const single = t.predecessorId ?? t.predecessor_id;
    return single ? 1 : 0;
  };
  const getSuccCount = (t: (typeof tasks)[0]) => t.successorIds?.length ?? 0;
  const getWork = (t: (typeof tasks)[0]) => t.baselineWork ?? t.baseline_work ?? t.baselineHours ?? t.baseline_hours ?? t.work ?? 0;
  const getCount = (t: (typeof tasks)[0]) => t.count ?? t.baselineCount ?? t.baseline_count ?? 1;
  const hasResource = (t: (typeof tasks)[0]) => {
    const ids = t.assignedResourceIds?.length ?? 0;
    const names = t.assignedResources?.length ?? 0;
    const single = (t.assignedResource ?? t.assigned_resource ?? '').toString().trim();
    const singleId = (t.assignedResourceId ?? t.assigned_resource_id ?? '').toString().trim();
    return ids > 0 || names > 0 || single.length > 0 || singleId.length > 0;
  };

  // All Tasks Have Predecessors/Successors
  const tasksWithoutLogic = tasks.filter((t) => {
    const pred = getPredCount(t);
    const succ = getSuccCount(t);
    return pred === 0 && succ === 0 && !t.isSubTask;
  });
  const logicOk = tasksWithoutLogic.length === 0;
  results.push({
    checkName: 'All Tasks Have Predecessors/Successors',
    passed: logicOk,
    message: logicOk ? undefined : `${tasksWithoutLogic.length} task(s) without predecessors/successors`,
  });
  if (!logicOk) issues.push(`${tasksWithoutLogic.length} task(s) without logic links`);

  // No Orphaned Tasks (all connected - simplified: check we have at least one chain)
  const hasAnyLogic = tasks.some((t) => getPredCount(t) > 0 || getSuccCount(t) > 0);
  results.push({
    checkName: 'No Orphaned Tasks',
    passed: tasks.length === 0 || hasAnyLogic,
    message: tasks.length > 0 && !hasAnyLogic ? 'No task logic links found' : undefined,
  });

  // Resources Assigned to Execution Tasks
  const tasksWithoutResources = executionTasks.filter((t) => !hasResource(t));
  const resourcesOk = executionTasks.length === 0 || tasksWithoutResources.length === 0;
  results.push({
    checkName: 'Resources Assigned to Execution Tasks',
    passed: resourcesOk,
    message: resourcesOk ? undefined : `${tasksWithoutResources.length} execution task(s) without resources`,
  });
  if (!resourcesOk) issues.push(`${tasksWithoutResources.length} execution task(s) without resource assignment`);

  // Planned Effort Entered
  const tasksWithEffort = tasks.filter((t) => getWork(t) > 0);
  const effortOk = tasks.length === 0 || tasksWithEffort.length > 0;
  results.push({
    checkName: 'Planned Effort Entered',
    passed: effortOk,
    message: effortOk ? undefined : 'No tasks with baseline hours',
  });

  // Duration Reasonable (simple: has durations)
  const tasksWithDuration = tasks.filter((t) => (t.duration ?? 0) > 0);
  const durationOk = tasks.length === 0 || tasksWithDuration.length > 0;
  results.push({
    checkName: 'Duration Reasonable',
    passed: durationOk,
    message: durationOk ? undefined : 'No tasks with duration',
  });

  // No Tasks >100 hrs with Count = 1
  const largeTasks = tasks.filter((t) => getWork(t) > 100 && getCount(t) <= 1);
  results.push({
    checkName: 'No Tasks >100 hrs with Count = 1',
    passed: largeTasks.length === 0,
    message: largeTasks.length > 0 ? `${largeTasks.length} task(s) exceed 100 hrs with count=1` : undefined,
  });
  if (largeTasks.length > 0) issues.push(`${largeTasks.length} task(s) >100 hrs with count=1`);

  // Non-Execution ≤ 25% of Execution Hours (simplified if we can detect)
  let nonExecRatioOk = true;
  const execHours = executionTasks.reduce((s, t) => s + getWork(t), 0);
  const nonExecTasks = tasks.filter((t) => t.isExecution === false || t.taskType === 'non-execution');
  const nonExecHours = nonExecTasks.reduce((s, t) => s + getWork(t), 0);
  const totalHours = execHours + nonExecHours;
  if (totalHours > 0 && execHours > 0) {
    const ratio = nonExecHours / execHours;
    nonExecRatioOk = ratio <= 0.25;
    results.push({
      checkName: 'Non-Execution ≤ 25% of Execution Hours',
      passed: nonExecRatioOk,
      message: nonExecRatioOk ? undefined : `Non-exec ratio ${(ratio * 100).toFixed(1)}% exceeds 25%`,
    });
    if (!nonExecRatioOk) issues.push(`Non-execution hours (${(ratio * 100).toFixed(0)}%) exceed 25% of execution`);
  } else {
    results.push({ checkName: 'Non-Execution ≤ 25% of Execution Hours', passed: true });
  }

  const passed = results.filter((r) => r.passed).length;
  const totalChecks = results.length;
  const score = totalChecks === 0 ? 100 : Math.round((passed / totalChecks) * 100);

  return { score, totalChecks, passed, results, issues };
}
