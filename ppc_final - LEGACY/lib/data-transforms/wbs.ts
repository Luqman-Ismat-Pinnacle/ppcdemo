'use client';

/**
 * WBS (Work Breakdown Structure) data transformation.
 */

import type { SampleData } from '@/types/data';
import { getPlannedProjectIdSet, memoize, normalizeId, safeNum } from './utils';
import { buildHierarchyMaps } from './hierarchy';

export interface TransformWBSItem {
  id: string;
  wbsCode: string;
  name: string;
  type: 'portfolio' | 'customer' | 'site' | 'project' | 'phase' | 'unit' | 'task' | 'sub_task';
  itemType: string;
  startDate?: string;
  endDate?: string;
  progress?: number;
  percentComplete?: number;
  baselineHours?: number;
  actualHours?: number;
  remainingHours?: number;
  baselineCost?: number;
  actualCost?: number;
  remainingCost?: number;
  daysRequired?: number;
  assignedResourceId?: string;
  assignedResource?: string;  // Generic role from Microsoft Project
  isCritical?: boolean;
  isMilestone?: boolean;
  taskEfficiency?: number | null;
  predecessors?: any[];
  children?: TransformWBSItem[];
  taskId?: string;
  parentTaskId?: string | null;
  phaseId?: string;
  projectId?: string;
  claimPct?: number;
  pv?: number;
  ev?: number;
  ac?: number;
  is_milestone?: boolean;
  resource_assignments?: any[];
  earlyStart?: string;
  earlyFinish?: string;
  lateStart?: string;
  lateFinish?: string;
  totalSlack?: number;
  freeSlack?: number;
}

export function buildWBSData(data: Partial<SampleData>): { items: any[] } {
  // Memoize hierarchy maps and WBS structure for performance (include phase/unit/task so MPP changes rebuild)
  // Also include sum of actualCost/actualHours/remainingHours so WBS rebuilds when these values change
  const tasks = data.tasks || [];
  const taskActualCostSum = tasks.reduce((sum: number, t: any) => sum + (t.actualCost || t.actual_cost || 0), 0);
  const taskActualHoursSum = tasks.reduce((sum: number, t: any) => sum + (t.actualHours || t.actual_hours || 0), 0);
  const taskRemainingHoursSum = tasks.reduce((sum: number, t: any) => sum + (t.remainingHours || t.remaining_hours || 0), 0);
  
  const dataKey = JSON.stringify({
    portfolioCount: data.portfolios?.length || 0,
    customerCount: data.customers?.length || 0,
    siteCount: data.sites?.length || 0,
    projectCount: data.projects?.length || 0,
    phaseCount: data.phases?.length || 0,
    unitCount: data.units?.length || 0,
    taskCount: tasks.length,
    taskDepsCount: ((data as any).taskDependencies || []).length,
    taskActualCostSum: Math.round(taskActualCostSum * 100) / 100,
    taskActualHoursSum: Math.round(taskActualHoursSum * 100) / 100,
    taskRemainingHoursSum: Math.round(taskRemainingHoursSum * 100) / 100,
  });

  return memoize('buildWBSData', () => {
    const items: TransformWBSItem[] = [];

    const portfolios = data.portfolios || [];
    const customers = data.customers || [];
    const sites = data.sites || [];
    const units = data.units || [];
    // Only include projects with an uploaded plan (schedule flag or project document).
    const plannedProjectIds = getPlannedProjectIdSet(data);
    const projects = (data.projects || []).filter((p: any) => {
      const projectId = normalizeId(p?.id ?? p?.projectId);
      return projectId ? plannedProjectIds.has(projectId) : false;
    });
    const tasks = data.tasks || [];
    const employees = data.employees || [];

    // Build a map of task dependencies from the DB (successor_task_id → array of predecessor links)
    const taskDeps = (data as any).taskDependencies || [];
    const depsBySuccessor = new Map<string, any[]>();
    taskDeps.forEach((d: any) => {
      const succId = String(d.successorTaskId || d.successor_task_id || '');
      const predId = String(d.predecessorTaskId || d.predecessor_task_id || '');
      if (!succId || !predId) return;
      const dep = {
        id: d.id,
        taskId: succId,
        predecessorTaskId: predId,
        relationship: d.relationshipType || d.relationship_type || 'FS',
        lagDays: d.lagDays || d.lag_days || 0,
      };
      if (!depsBySuccessor.has(succId)) depsBySuccessor.set(succId, []);
      depsBySuccessor.get(succId)!.push(dep);
    });

    // Also build a quick predecessor lookup from the tasks' own predecessor_id column (legacy single-predecessor)
    // This ensures arrows even if task_dependencies table hasn't been populated yet
    tasks.forEach((task: any) => {
      const taskId = String(task.id || task.taskId || '').trim();
      const rawPred = String(task.predecessorId || task.predecessor_id || '').trim();
      if (!taskId || !rawPred || depsBySuccessor.has(taskId)) return;
      const predecessors = rawPred
        .split(/[;,]+/)
        .map((id: string) => id.trim())
        .filter(Boolean);
      if (!predecessors.length) return;
      depsBySuccessor.set(taskId, predecessors.map((predId, idx) => ({
        id: `${taskId}-pred-${idx + 1}`,
        taskId,
        predecessorTaskId: predId,
        relationship: task.predecessorRelationship || task.predecessor_relationship || 'FS',
        lagDays: 0,
      })));
    });

    // Extract work items if available (new consolidated structure)
    const workItems = data.workItems || [];
    const epics = workItems.filter((w: any) => w.work_item_type === 'epic').length > 0
      ? workItems.filter((w: any) => w.work_item_type === 'epic')
      : (data.epics || []);
    const features = workItems.filter((w: any) => w.work_item_type === 'feature').length > 0
      ? workItems.filter((w: any) => w.work_item_type === 'feature')
      : (data.features || []);
    const userStories = workItems.filter((w: any) => w.work_item_type === 'user_story').length > 0
      ? workItems.filter((w: any) => w.work_item_type === 'user_story')
      : (data.userStories || []);

    // Build Map-based lookups for O(1) access instead of O(n) filtering
    const maps = buildHierarchyMaps(data);

    // Site lookup by ID (for project-driven hierarchy: place site under customer based on project.customerId, not site.customerId)
    const sitesById = new Map<string, any>();
    sites.forEach((s: any) => {
      const sid = String(s.id ?? s.siteId ?? '');
      if (sid) sitesById.set(sid, s);
    });

    // Global set: task IDs that belong to ANY unit (by unit_id or parent_id). These must NEVER appear under phase or project directly.
    const unitIds = new Set(units.map((u: any) => String(u.id ?? u.unitId)));
    const taskIdsUnderAnyUnit = new Set<string>();
    (tasks || []).forEach((t: any) => {
      const tid = String(t.id ?? t.taskId);
      const tUnit = String((t as any).unit_id ?? (t as any).unitId ?? '');
      const tParent = String((t as any).parent_id ?? '');
      if (unitIds.has(tUnit) || unitIds.has(tParent)) taskIdsUnderAnyUnit.add(tid);
    });

    // Helper to get owner name from employeeId using Map lookup
    const getOwnerName = (employeeId: string | null): string | null => {
      if (!employeeId) return null;
      const owner = maps.employeesById.get(employeeId);
      return owner?.name || null;
    };

    const isSubTaskRow = (task: any): boolean => {
      const explicit = String(task.hierarchy_type ?? task.hierarchyType ?? '').toLowerCase();
      if (explicit === 'sub_task') return true;
      return Boolean(task.isSubTask || task.is_sub_task);
    };

    const toTaskNode = (task: any, taskWbs: string, fallbackName: string): TransformWBSItem => {
      const taskId = task.id || task.taskId;
      const isSubTask = isSubTaskRow(task);
      return {
        id: `${isSubTask ? 'wbs-sub_task' : 'wbs-task'}-${taskId}`,
        wbsCode: taskWbs,
        name: task.name || task.taskName || fallbackName,
        type: isSubTask ? 'sub_task' : 'task',
        itemType: isSubTask ? 'sub_task' : 'task',
        startDate: task.baselineStartDate || task.startDate,
        endDate: task.baselineEndDate || task.endDate,
        daysRequired: (task.duration !== undefined ? task.duration : (task.daysRequired !== undefined ? task.daysRequired : 1)),
        percentComplete: safeNum(task.percentComplete ?? task.percent_complete),
        baselineHours: safeNum(task.baselineHours ?? task.budgetHours),
        actualHours: safeNum(task.actualHours ?? task.actual_hours),
        remainingHours: safeNum(task.remainingHours ?? task.projectedRemainingHours ?? task.remaining_hours),
        baselineCost: safeNum(task.baselineCost ?? task.baseline_cost),
        actualCost: safeNum(task.actualCost ?? task.actual_cost),
        remainingCost: safeNum(task.remainingCost ?? task.remaining_cost),
        assignedResourceId: task.assignedResourceId ?? (task as any).assigned_resource_id ?? task.employeeId ?? (task as any).employee_id ?? task.assigneeId ?? null,
        assignedResource: (task as any).assignedResource ?? (task as any).assigned_resource ?? '',
        is_milestone: task.is_milestone || task.isMilestone || false,
        isCritical: task.is_critical || task.isCritical || false,
        predecessors: Array.isArray(task.predecessors) && task.predecessors.length > 0
          ? task.predecessors
          : depsBySuccessor.get(String(taskId)) || [],
        totalSlack: task.totalSlack ?? task.total_slack ?? task.totalFloat ?? task.total_float ?? undefined,
        parentTaskId: task.parentTaskId ?? task.parent_task_id ?? null,
      };
    };

    const buildNestedTaskTree = (taskRows: any[], parentWbs: string, startIndex = 0): TransformWBSItem[] => {
      const deduped = Array.from(new Map(taskRows.map((t: any) => [String(t.id ?? t.taskId), t])).values());
      const taskIdSet = new Set(deduped.map((t: any) => String(t.id ?? t.taskId)));
      const childrenByParent = new Map<string, any[]>();
      const roots: any[] = [];

      deduped.forEach((task: any) => {
        const parentIdRaw = task.parentTaskId ?? task.parent_task_id;
        const parentId = parentIdRaw != null ? String(parentIdRaw) : '';
        if (parentId && taskIdSet.has(parentId)) {
          if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
          childrenByParent.get(parentId)!.push(task);
          return;
        }
        roots.push(task);
      });

      const buildRecursive = (task: any, rowWbs: string, ancestry: Set<string>): TransformWBSItem => {
        const taskId = String(task.id ?? task.taskId);
        const node = toTaskNode(task, rowWbs, 'Task');
        if (ancestry.has(taskId)) return node;
        const nextAncestry = new Set(ancestry);
        nextAncestry.add(taskId);
        const children = childrenByParent.get(taskId) || [];
        if (children.length > 0) {
          node.children = children.map((child, idx) => buildRecursive(child, `${rowWbs}.${idx + 1}`, nextAncestry));
        }
        return node;
      };

      return roots.map((task: any, idx: number) => {
        const rowWbs = `${parentWbs}.${startIndex + idx + 1}`;
        return buildRecursive(task, rowWbs, new Set<string>());
      });
    };

    // Unified helper to build a project node with all its children and rollup logic
    const buildProjectNode = (project: any, projectWbs: string): TransformWBSItem => {
      const projectId = String(project.id ?? project.projectId ?? '');
      const projBaselineHrs = project.baselineHours || project.budgetHours || 0;
      const projActualHrs = project.actualHours || project.actual_hours || 0;
      const projBaselineCst = project.baselineCost || project.budgetCost || 0;
      const projActualCst = project.actualCost || project.actual_cost || 0;

      const projectItem: TransformWBSItem = {
        id: `wbs-project-${projectId}`,
        wbsCode: projectWbs,
        name: project.name || project.projectNumber || `Project`,
        type: 'project',
        itemType: 'project',
        startDate: project.startDate || project.baselineStartDate,
        endDate: project.endDate || project.baselineEndDate,
        percentComplete: project.percentComplete ?? project.percent_complete ?? 0,
        baselineHours: projBaselineHrs,
        actualHours: projActualHrs,
        remainingHours: project.remainingHours ?? project.remaining_hours ?? null,
        baselineCost: projBaselineCst,
        actualCost: projActualCst,
        remainingCost: project.remainingCost ?? project.remaining_cost ?? null,
        children: []
      };

      // Track project rollup totals
      let projRollupBaselineHrs = 0;
      let projRollupActualHrs = 0;
      let projRollupBaselineCst = 0;
      let projRollupActualCst = 0;
      let projRollupRemainingHrs = 0;
      let projRollupRemainingCst = 0;
      let projRollupPercentComplete = 0;
      let projChildCount = 0;

      // Hierarchy: Project -> Unit -> Phase -> Task
      const projectUnitsRaw = maps.unitsByProject.get(String(projectId)) || [];
      const projectUnits = Array.from(new Map(projectUnitsRaw.map((u: any) => [String(u.id ?? u.unitId), u])).values());
      const projectUnitIds = new Set(projectUnits.map((u: any) => String(u.id ?? u.unitId)));
      const addedPhaseIds = new Set<string>();

      projectUnits.forEach((unit: any, uIdx: number) => {
        const unitId = String(unit.id || unit.unitId);
        const unitWbs = `${projectWbs}.${uIdx + 1}`;

        const unitStart = unit.startDate ?? unit.baselineStartDate ?? unit.start_date;
        const unitEnd = unit.endDate ?? unit.baselineEndDate ?? unit.end_date;
        const unitBaselineHrs = unit.baselineHours ?? unit.baseline_hours ?? 0;
        const unitBaselineCst = unit.baselineCost ?? unit.baseline_cost ?? 0;

        const unitItem: TransformWBSItem = {
          id: `wbs-unit-${unitId}`,
          wbsCode: unitWbs,
          name: unit.name || `Unit ${uIdx + 1}`,
          type: 'unit',
          itemType: 'unit',
          startDate: unitStart ?? undefined,
          endDate: unitEnd ?? undefined,
          percentComplete: unit.percentComplete ?? unit.percent_complete ?? 0,
          baselineHours: unitBaselineHrs || undefined,
          baselineCost: unitBaselineCst || undefined,
          children: []
        };

        let unitRollupBaselineHrs = 0;
        let unitRollupActualHrs = 0;
        let unitRollupBaselineCst = 0;
        let unitRollupActualCst = 0;
        let unitRollupRemainingHrs = 0;
        let unitRollupRemainingCst = 0;
        let unitRollupPercentComplete = 0;
        let unitChildCount = 0;

        const unitPhasesRaw = maps.phasesByUnit.get(unitId) || [];
        const unitPhases = Array.from(new Map(unitPhasesRaw.map((ph: any) => [String(ph.id ?? ph.phaseId), ph])).values());

        unitPhases.forEach((phase: any, phIdx: number) => {
          const phaseId = String(phase.id ?? phase.phaseId);
          addedPhaseIds.add(phaseId);
          const phaseWbs = `${unitWbs}.${phIdx + 1}`;

          let phaseRollupBaselineHrs = 0;
          let phaseRollupActualHrs = 0;
          let phaseRollupBaselineCst = 0;
          let phaseRollupActualCst = 0;
          let phaseRollupRemainingHrs = 0;
          let phaseRollupRemainingCst = 0;
          let phaseRollupPercentComplete = 0;
          let phaseChildCount = 0;

          const phaseItem: TransformWBSItem = {
            id: `wbs-phase-${phaseId}`,
            wbsCode: phaseWbs,
            name: phase.name || `Phase ${phIdx + 1}`,
            type: 'phase',
            itemType: 'phase',
            startDate: phase.startDate || phase.baselineStartDate,
            endDate: phase.endDate || phase.baselineEndDate,
            percentComplete: phase.percentComplete ?? phase.percent_complete ?? 0,
            baselineHours: Number(phase.baselineHours ?? phase.baseline_hours) || 0,
            actualHours: Number(phase.actualHours ?? phase.actual_hours) || 0,
            remainingHours: phase.remainingHours ?? phase.remaining_hours ?? 0,
            baselineCost: Number(phase.baselineCost ?? phase.baseline_cost) || 0,
            actualCost: Number(phase.actualCost ?? phase.actual_cost) || 0,
            remainingCost: phase.remainingCost ?? phase.remaining_cost ?? 0,
            children: []
          };

          const phaseTasksRaw = maps.tasksByPhase.get(phaseId) || [];
          const phaseTasks = Array.from(new Map(phaseTasksRaw.map((t: any) => [String(t.id ?? t.taskId), t])).values());

	          phaseTasks.forEach((task: any) => {
	            const taskId = task.id || task.taskId;
	            const taskBaselineHrs = safeNum(task.baselineHours ?? task.budgetHours);
	            const taskActualHrs = safeNum(task.actualHours ?? task.actual_hours);
	            const taskBaselineCst = safeNum(task.baselineCost ?? task.baseline_cost);
            const taskActualCst = safeNum(task.actualCost ?? task.actual_cost);
            const taskRemainingHrs = safeNum(task.remainingHours ?? task.projectedRemainingHours ?? task.remaining_hours);
            const taskRemainingCst = safeNum(task.remainingCost ?? task.remaining_cost);
            const taskPercent = safeNum(task.percentComplete ?? task.percent_complete);

            phaseRollupBaselineHrs += taskBaselineHrs;
            phaseRollupActualHrs += taskActualHrs;
            phaseRollupBaselineCst += taskBaselineCst;
            phaseRollupActualCst += taskActualCst;
            phaseRollupRemainingHrs += taskRemainingHrs;
	            phaseRollupRemainingCst += taskRemainingCst;
	            phaseRollupPercentComplete += taskPercent;
	            phaseChildCount++;
	          });

            const phaseTaskNodes = buildNestedTaskTree(phaseTasks, phaseWbs);
            phaseTaskNodes.forEach((node) => phaseItem.children?.push(node));

          if (phaseChildCount > 0) {
            // Always use child rollup for consistency (bottom-up aggregation)
            phaseItem.baselineHours = phaseRollupBaselineHrs;
            phaseItem.actualHours = phaseRollupActualHrs;
            phaseItem.baselineCost = phaseRollupBaselineCst;
            phaseItem.actualCost = phaseRollupActualCst;
            phaseItem.remainingHours = phaseRollupRemainingHrs || undefined;
            phaseItem.remainingCost = phaseRollupRemainingCst || undefined;
            phaseItem.percentComplete = Math.round(phaseRollupPercentComplete / phaseChildCount);
          }

          unitRollupBaselineHrs += Number(phaseItem.baselineHours) || 0;
          unitRollupActualHrs += Number(phaseItem.actualHours) || 0;
          unitRollupBaselineCst += Number(phaseItem.baselineCost) || 0;
          unitRollupActualCst += Number(phaseItem.actualCost) || 0;
          unitRollupRemainingHrs += Number(phaseItem.remainingHours) || 0;
          unitRollupRemainingCst += Number(phaseItem.remainingCost) || 0;
          unitRollupPercentComplete += phaseItem.percentComplete || 0;
          unitChildCount++;

          unitItem.children?.push(phaseItem);
        });

        if (unitChildCount > 0) {
          // Always use child rollup for consistency (bottom-up aggregation)
          unitItem.baselineHours = unitRollupBaselineHrs;
          unitItem.actualHours = unitRollupActualHrs;
          unitItem.baselineCost = unitRollupBaselineCst;
          unitItem.actualCost = unitRollupActualCst;
          unitItem.remainingHours = unitRollupRemainingHrs || undefined;
          unitItem.remainingCost = unitRollupRemainingCst || undefined;
          unitItem.percentComplete = Math.round(unitRollupPercentComplete / unitChildCount);
        }

        projRollupBaselineHrs += Number(unitItem.baselineHours) || 0;
        projRollupActualHrs += Number(unitItem.actualHours) || 0;
        projRollupBaselineCst += Number(unitItem.baselineCost) || 0;
        projRollupActualCst += Number(unitItem.actualCost) || 0;
        projRollupRemainingHrs += Number(unitItem.remainingHours) || 0;
        projRollupRemainingCst += Number(unitItem.remainingCost) || 0;
        projRollupPercentComplete += unitItem.percentComplete || 0;
        projChildCount++;

        projectItem.children?.push(unitItem);
      });

      // Phases with no unit OR with a stale/missing unit reference should render
      // directly under project, otherwise they get dropped and tasks appear flat.
      const directPhasesRaw = (maps.phasesByProject.get(String(projectId)) || []).filter(
        (ph: any) => {
          const rawUnitId = ph.unitId ?? ph.unit_id;
          if (rawUnitId == null || rawUnitId === '') return true;
          const unitId = String(rawUnitId);
          return !projectUnitIds.has(unitId);
        }
      );
      const directPhases = Array.from(new Map(directPhasesRaw.map((ph: any) => [String(ph.id ?? ph.phaseId), ph])).values());

      directPhases.forEach((phase: any, phIdx: number) => {
        const phaseId = phase.id || phase.phaseId;
        const phaseWbs = `${projectWbs}.${projectUnits.length + phIdx + 1}`;
        addedPhaseIds.add(String(phaseId));

        let phaseRollupBaselineHrs = 0;
        let phaseRollupActualHrs = 0;
        let phaseRollupBaselineCst = 0;
        let phaseRollupActualCst = 0;
        let phaseRollupRemainingHrs = 0;
        let phaseRollupRemainingCst = 0;
        let phaseRollupPercentComplete = 0;
        let phaseChildCount = 0;

        const phaseItem: TransformWBSItem = {
          id: `wbs-phase-${phaseId}`,
          wbsCode: phaseWbs,
          name: phase.name || `Phase ${phIdx + 1}`,
          type: 'phase',
          itemType: 'phase',
          startDate: phase.startDate || phase.baselineStartDate,
          endDate: phase.endDate || phase.baselineEndDate,
          percentComplete: phase.percentComplete ?? phase.percent_complete ?? 0,
          baselineHours: Number(phase.baselineHours ?? phase.baseline_hours) || 0,
          actualHours: Number(phase.actualHours ?? phase.actual_hours) || 0,
          remainingHours: phase.remainingHours ?? phase.remaining_hours ?? 0,
          baselineCost: Number(phase.baselineCost ?? phase.baseline_cost) || 0,
          actualCost: Number(phase.actualCost ?? phase.actual_cost) || 0,
          remainingCost: phase.remainingCost ?? phase.remaining_cost ?? 0,
          children: []
        };

        const directPhaseTasksRaw = (maps.tasksByPhase.get(String(phaseId)) || []).filter(
          (t: any) => !taskIdsUnderAnyUnit.has(String(t.id ?? t.taskId))
        );
        const directPhaseTasks = Array.from(new Map(directPhaseTasksRaw.map((t: any) => [String(t.id ?? t.taskId), t])).values());

	        directPhaseTasks.forEach((task: any) => {
	          const taskId = task.id || task.taskId;
	          const taskBaselineHrs = safeNum(task.baselineHours ?? task.budgetHours);
	          const taskActualHrs = safeNum(task.actualHours ?? task.actual_hours);
	          const taskBaselineCst = safeNum(task.baselineCost ?? task.baseline_cost);
          const taskActualCst = safeNum(task.actualCost ?? task.actual_cost);
          const taskRemainingHrs = safeNum(task.remainingHours ?? task.projectedRemainingHours ?? task.remaining_hours);
          const taskRemainingCst = safeNum(task.remainingCost ?? task.remaining_cost);
          const taskPercent = safeNum(task.percentComplete ?? task.percent_complete);

          phaseRollupBaselineHrs += taskBaselineHrs;
          phaseRollupActualHrs += taskActualHrs;
          phaseRollupBaselineCst += taskBaselineCst;
          phaseRollupActualCst += taskActualCst;
          phaseRollupRemainingHrs += taskRemainingHrs;
	          phaseRollupRemainingCst += taskRemainingCst;
	          phaseRollupPercentComplete += taskPercent;
	          phaseChildCount++;
	        });

          const directPhaseTaskNodes = buildNestedTaskTree(directPhaseTasks, phaseWbs);
          directPhaseTaskNodes.forEach((node) => phaseItem.children?.push(node));

        if (phaseChildCount > 0) {
          // Always use child rollup for consistency (bottom-up aggregation)
          phaseItem.baselineHours = phaseRollupBaselineHrs;
          phaseItem.actualHours = phaseRollupActualHrs;
          phaseItem.baselineCost = phaseRollupBaselineCst;
          phaseItem.actualCost = phaseRollupActualCst;
          phaseItem.remainingHours = phaseRollupRemainingHrs || undefined;
          phaseItem.remainingCost = phaseRollupRemainingCst || undefined;
          phaseItem.percentComplete = Math.round(phaseRollupPercentComplete / phaseChildCount);
        }

        projRollupBaselineHrs += Number(phaseItem.baselineHours) || 0;
        projRollupActualHrs += Number(phaseItem.actualHours) || 0;
        projRollupBaselineCst += Number(phaseItem.baselineCost) || 0;
        projRollupActualCst += Number(phaseItem.actualCost) || 0;
        projRollupRemainingHrs += Number(phaseItem.remainingHours) || 0;
        projRollupRemainingCst += Number(phaseItem.remainingCost) || 0;
        projRollupPercentComplete += phaseItem.percentComplete || 0;
        projChildCount++;

        projectItem.children?.push(phaseItem);
      });

      // Orphan tasks under Project (phase not under any unit/direct phase we added); dedupe by task id
      const directProjectTasksRaw = (maps.tasksByProject.get(String(projectId)) || []).filter((t: any) => {
        const tid = String(t.id ?? t.taskId);
        if (taskIdsUnderAnyUnit.has(tid)) return false;
        const tPhaseId = t.phaseId ?? t.phase_id;
        if (tPhaseId && addedPhaseIds.has(String(tPhaseId))) return false;
        return true;
      });
      const directProjectTasks = Array.from(
        new Map(directProjectTasksRaw.map((t: any) => [String(t.id ?? t.taskId), t])).values()
      );
	      directProjectTasks.forEach((task: any) => {
	        const taskId = task.id || task.taskId;

	        const taskBaselineHrs = safeNum(task.baselineHours ?? task.budgetHours);
	        const taskActualHrs = safeNum(task.actualHours ?? task.actual_hours);
        const taskBaselineCst = safeNum(task.baselineCost ?? task.baseline_cost);
        const taskActualCst = safeNum(task.actualCost ?? task.actual_cost);
        const taskPercent = safeNum(task.percentComplete ?? task.percent_complete);
        const taskRemainingHrs = safeNum(task.remainingHours ?? task.projectedRemainingHours ?? task.remaining_hours);
        const taskRemainingCst = safeNum(task.remainingCost ?? task.remaining_cost);

        // Aggregate to Project
        projRollupBaselineHrs += taskBaselineHrs;
        projRollupActualHrs += taskActualHrs;
        projRollupBaselineCst += taskBaselineCst;
        projRollupActualCst += taskActualCst;
        projRollupRemainingHrs += taskRemainingHrs;
	        projRollupRemainingCst += taskRemainingCst;
	        projRollupPercentComplete += taskPercent;
	        projChildCount++;
	      });

        const directProjectTaskNodes = buildNestedTaskTree(
          directProjectTasks,
          projectWbs,
          projectUnits.length + directPhases.length
        );
        directProjectTaskNodes.forEach((node) => projectItem.children?.push(node));

      // Always use child rollup for consistency (bottom-up aggregation)
      if (projChildCount > 0) {
        projectItem.baselineHours = projRollupBaselineHrs;
        projectItem.actualHours = projRollupActualHrs;
        projectItem.baselineCost = projRollupBaselineCst;
        projectItem.actualCost = projRollupActualCst;
        projectItem.remainingHours = projRollupRemainingHrs || undefined;
        projectItem.remainingCost = projRollupRemainingCst || undefined;
        projectItem.percentComplete = Math.round(projRollupPercentComplete / projChildCount);
      }

      return projectItem;
    };

    // Build hierarchy using Map lookups (O(n) instead of O(n⁴))
    let wbsCounter = 1;

    portfolios.forEach((portfolio: any, pIdx: number) => {
      const portfolioId = portfolio.id ?? portfolio.portfolioId;
      const portfolioIdStr = portfolioId != null ? String(portfolioId) : '';
      const portfolioWbs = `${wbsCounter}`;

      // Calculate portfolio name
      const ownerName = getOwnerName(portfolio.employeeId);
      const portfolioName = ownerName
        ? `${ownerName}'s Portfolio`
        : (portfolio.name || `Portfolio ${pIdx + 1}`);

      const portfolioItem: TransformWBSItem = {
        id: `wbs-portfolio-${portfolioId}`,
        wbsCode: portfolioWbs,
        name: portfolioName,
        type: 'portfolio',
        itemType: 'portfolio',
        startDate: portfolio.startDate || portfolio.baselineStartDate,
        endDate: portfolio.endDate || portfolio.baselineEndDate,
        percentComplete: portfolio.percentComplete ?? portfolio.percent_complete ?? 0,
        children: []
      };

      const allPortfolioCustomers = (portfolioIdStr ? maps.customersByPortfolio.get(portfolioIdStr) : null) || [];
      allPortfolioCustomers.forEach((customer: any, cIdx: number) => {
        const customerId = customer.id || customer.customerId;
        const customerWbs = `${portfolioWbs}.${cIdx + 1}`;

        const customerItem: TransformWBSItem = {
          id: `wbs-customer-${customerId}`,
          wbsCode: customerWbs,
          name: customer.name || `Customer ${cIdx + 1}`,
          type: 'customer',
          itemType: 'customer',
          percentComplete: customer.percentComplete ?? customer.percent_complete ?? 0,
          children: []
        };

        // Place sites under customer: use project-driven grouping when projects have siteId
        // (so shared sites like Fort McMurray show under the correct customer per project).
        // Fall back to site.customerId when no projects have siteId so sites still show.
        const customerIdStr = String(customerId);
        const customerProjectsRaw = (
          (maps.projectsByCustomer.get(customerId) || maps.projectsByCustomer.get(customerIdStr) || []) as any[]
        ).filter((p: any) => {
          const pPortfolioId = p.portfolioId ?? p.portfolio_id;
          // Keep legacy rows with null portfolio under the customer, but enforce portfolio match when present.
          return pPortfolioId == null || String(pPortfolioId) === portfolioIdStr;
        });
        const projectsBySiteId = new Map<string, any[]>();
        const customerProjectsNoSite: any[] = [];
        customerProjectsRaw.forEach((p: any) => {
          const pSiteId = p.siteId ?? p.site_id;
          if (pSiteId == null || pSiteId === '') {
            customerProjectsNoSite.push(p);
            return;
          }
          const key = String(pSiteId);
          if (!projectsBySiteId.has(key)) projectsBySiteId.set(key, []);
          projectsBySiteId.get(key)!.push(p);
        });

        const useProjectDrivenSites = projectsBySiteId.size > 0;

        if (useProjectDrivenSites) {
          let sIdx = 0;
          projectsBySiteId.forEach((siteProjects, siteId) => {
            const site = sitesById.get(siteId);
            const siteName = site?.name || `Site ${sIdx + 1}`;
            const siteWbs = `${customerWbs}.${sIdx + 1}`;

            const siteItem: TransformWBSItem = {
              id: `wbs-site-${siteId}-cust-${customerId}`,
              wbsCode: siteWbs,
              name: siteName,
              type: 'site',
              itemType: 'site',
              percentComplete: site?.percentComplete ?? site?.percent_complete ?? 0,
              children: []
            };

            const siteProjectsDeduped = Array.from(new Map(siteProjects.map((p: any) => [String(p.id ?? p.projectId), p])).values());
            siteProjectsDeduped.forEach((project: any, prIdx: number) => {
              siteItem.children?.push(buildProjectNode(project, `${siteWbs}.${prIdx + 1}`));
            });
            // Rollup site values from children
            if (siteItem.children && siteItem.children.length > 0) {
              let siteBaselineHrs = 0, siteActualHrs = 0, siteRemainingHrs = 0;
              let siteBaselineCst = 0, siteActualCst = 0, siteRemainingCst = 0;
              siteItem.children.forEach((child: any) => {
                siteBaselineHrs += child.baselineHours || 0;
                siteActualHrs += child.actualHours || 0;
                siteRemainingHrs += child.remainingHours || 0;
                siteBaselineCst += child.baselineCost || 0;
                siteActualCst += child.actualCost || 0;
                siteRemainingCst += child.remainingCost || 0;
              });
              siteItem.baselineHours = siteBaselineHrs;
              siteItem.actualHours = siteActualHrs;
              siteItem.remainingHours = siteRemainingHrs || undefined;
              siteItem.baselineCost = siteBaselineCst;
              siteItem.actualCost = siteActualCst;
              siteItem.remainingCost = siteRemainingCst || undefined;
            }
            customerItem.children?.push(siteItem);
            sIdx++;
          });
        } else {
          // Fallback: use site.customerId so sites still show when projects don't have siteId
          const customerSites = maps.sitesByCustomer.get(customerId) || maps.sitesByCustomer.get(customerIdStr) || [];
          customerSites.forEach((site: any, sIdx: number) => {
            const siteId = site.id || site.siteId;
            const siteWbs = `${customerWbs}.${sIdx + 1}`;

            const siteItem: TransformWBSItem = {
              id: `wbs-site-${siteId}`,
              wbsCode: siteWbs,
              name: site.name || `Site ${sIdx + 1}`,
              type: 'site',
              itemType: 'site',
              percentComplete: site.percentComplete ?? site.percent_complete ?? 0,
              children: []
            };

            // Only include projects for this customer so same-named sites for different customers don't share rollup
            const siteProjectsRaw = (maps.projectsBySite.get(siteId) || maps.projectsBySite.get(String(siteId)) || []).filter(
              (p: any) => {
                const pCustomerId = p.customerId ?? p.customer_id;
                const pPortfolioId = p.portfolioId ?? p.portfolio_id;
                const customerMatch = String(pCustomerId ?? '') === customerIdStr;
                const portfolioMatch = pPortfolioId == null || String(pPortfolioId) === portfolioIdStr;
                return customerMatch && portfolioMatch;
              }
            );
            const siteProjects = Array.from(new Map(siteProjectsRaw.map((p: any) => [String(p.id ?? p.projectId), p])).values());
            siteProjects.forEach((project: any, prIdx: number) => {
              siteItem.children?.push(buildProjectNode(project, `${siteWbs}.${prIdx + 1}`));
            });
            // Rollup site values from children
            if (siteItem.children && siteItem.children.length > 0) {
              let siteBaselineHrs = 0, siteActualHrs = 0, siteRemainingHrs = 0;
              let siteBaselineCst = 0, siteActualCst = 0, siteRemainingCst = 0;
              siteItem.children.forEach((child: any) => {
                siteBaselineHrs += child.baselineHours || 0;
                siteActualHrs += child.actualHours || 0;
                siteRemainingHrs += child.remainingHours || 0;
                siteBaselineCst += child.baselineCost || 0;
                siteActualCst += child.actualCost || 0;
                siteRemainingCst += child.remainingCost || 0;
              });
              siteItem.baselineHours = siteBaselineHrs;
              siteItem.actualHours = siteActualHrs;
              siteItem.remainingHours = siteRemainingHrs || undefined;
              siteItem.baselineCost = siteBaselineCst;
              siteItem.actualCost = siteActualCst;
              siteItem.remainingCost = siteRemainingCst || undefined;
            }
            customerItem.children?.push(siteItem);
          });
        }

        // Projects directly under customer (no site)
        const customerProjectsFiltered = Array.from(new Map(customerProjectsNoSite.map((p: any) => [String(p.id ?? p.projectId), p])).values());
        const numSites = useProjectDrivenSites ? projectsBySiteId.size : (maps.sitesByCustomer.get(customerId) || maps.sitesByCustomer.get(customerIdStr) || []).length;
        customerProjectsFiltered.forEach((project: any, prIdx: number) => {
          customerItem.children?.push(buildProjectNode(project, `${customerWbs}.${numSites + prIdx + 1}`));
        });

        // Rollup customer values from children (sites and direct projects)
        if (customerItem.children && customerItem.children.length > 0) {
          let custBaselineHrs = 0, custActualHrs = 0, custRemainingHrs = 0;
          let custBaselineCst = 0, custActualCst = 0, custRemainingCst = 0;
          customerItem.children.forEach((child: any) => {
            custBaselineHrs += child.baselineHours || 0;
            custActualHrs += child.actualHours || 0;
            custRemainingHrs += child.remainingHours || 0;
            custBaselineCst += child.baselineCost || 0;
            custActualCst += child.actualCost || 0;
            custRemainingCst += child.remainingCost || 0;
          });
          customerItem.baselineHours = custBaselineHrs;
          customerItem.actualHours = custActualHrs;
          customerItem.remainingHours = custRemainingHrs || undefined;
          customerItem.baselineCost = custBaselineCst;
          customerItem.actualCost = custActualCst;
          customerItem.remainingCost = custRemainingCst || undefined;
        }

        portfolioItem.children?.push(customerItem);
      });

      // Projects directly under portfolio (dedupe by projectId)
      const portfolioProjectsFiltered = (projects || []).filter((p: any) => {
        const pPortfolioId = p.portfolioId ?? p.portfolio_id;
        if (String(pPortfolioId ?? '') !== portfolioIdStr) return false;
        if (!p.customerId && !p.customer_id) return true;
        const pCustId = p.customerId || p.customer_id;
        return !allPortfolioCustomers.some((c: any) => (c.id || c.customerId) === pCustId);
      });
      const portfolioProjects = Array.from(new Map(portfolioProjectsFiltered.map((p: any) => [String(p.id ?? p.projectId), p])).values());
      portfolioProjects.forEach((project: any, prIdx: number) => {
        portfolioItem.children?.push(buildProjectNode(project, `${portfolioWbs}.${allPortfolioCustomers.length + prIdx + 1}`));
      });

      // Rollup portfolio values from children (customers and direct projects)
      if (portfolioItem.children && portfolioItem.children.length > 0) {
        let portBaselineHrs = 0, portActualHrs = 0, portRemainingHrs = 0;
        let portBaselineCst = 0, portActualCst = 0, portRemainingCst = 0;
        portfolioItem.children.forEach((child: any) => {
          portBaselineHrs += child.baselineHours || 0;
          portActualHrs += child.actualHours || 0;
          portRemainingHrs += child.remainingHours || 0;
          portBaselineCst += child.baselineCost || 0;
          portActualCst += child.actualCost || 0;
          portRemainingCst += child.remainingCost || 0;
        });
        portfolioItem.baselineHours = portBaselineHrs;
        portfolioItem.actualHours = portActualHrs;
        portfolioItem.remainingHours = portRemainingHrs || undefined;
        portfolioItem.baselineCost = portBaselineCst;
        portfolioItem.actualCost = portActualCst;
        portfolioItem.remainingCost = portRemainingCst || undefined;
      }

      items.push(portfolioItem);
      wbsCounter++;
    });

    // Add orphan projects (no portfolio); dedupe by projectId so each project appears once
    const orphanProjectsFiltered = projects.filter((p: any) => {
      const pPortId = p.portfolioId || p.portfolio_id;
      return !portfolios.some((port: any) => (port.id || port.portfolioId) === pPortId) &&
        !p.customerId && !p.customer_id && !p.siteId && !p.site_id && !p.unitId && !p.unit_id;
    });
    const orphanProjects = Array.from(new Map(orphanProjectsFiltered.map((p: any) => [String(p.id ?? p.projectId), p])).values());
    orphanProjects.forEach((project: any, prIdx: number) => {
      items.push(buildProjectNode(project, `${wbsCounter + prIdx}`));
    });

    // Helper to count tasks recursively
    const countTasks = (item: any): number => {
      if (!item.children || item.children.length === 0) {
        return item.type === 'task' ? 1 : 0;
      }
      return item.children.reduce((acc: number, child: any) => acc + countTasks(child), 0);
    };

    // Sort items by task count (descending)
    items.sort((a, b) => countTasks(b) - countTasks(a));

    // Re-index WBS codes after sorting
    const reindexWBS = (itemList: any[], prefix: string = '') => {
      itemList.forEach((item, idx) => {
        const newCode = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
        item.wbsCode = newCode;
        if (item.children && item.children.length > 0) {
          reindexWBS(item.children, newCode);
        }
      });
    };

    // Roll up dates and hours/cost from children
    const rollupDatesAndValues = (itemList: any[]): void => {
      itemList.forEach((item: any) => {
        if (item.children && item.children.length > 0) {
          rollupDatesAndValues(item.children);
          let minStart: string | undefined;
          let maxEnd: string | undefined;
          let sumBaselineHrs = 0;
          let sumActualHrs = 0;
          let sumBaselineCst = 0;
          let sumActualCst = 0;
          let sumRemainingHrs = 0;
          let sumRemainingCst = 0;
          let sumPercentComplete = 0;
          let childCount = 0;
          item.children.forEach((c: any) => {
            const s = c.startDate ?? c.baselineStartDate;
            const e = c.endDate ?? c.baselineEndDate;
            if (s) minStart = !minStart || s < minStart ? s : minStart;
            if (e) maxEnd = !maxEnd || e > maxEnd ? e : maxEnd;
            sumBaselineHrs += Number(c.baselineHours) || 0;
            sumActualHrs += Number(c.actualHours) || 0;
            sumBaselineCst += Number(c.baselineCost) || 0;
            sumActualCst += Number(c.actualCost) || 0;
            sumRemainingHrs += Number(c.remainingHours) || 0;
            sumRemainingCst += Number(c.remainingCost) || 0;
            const pct = c.percentComplete ?? c.percent_complete ?? 0;
            sumPercentComplete += pct;
            childCount++;
          });
          if (minStart) item.startDate = minStart;
          if (maxEnd) item.endDate = maxEnd;
          if (sumBaselineHrs > 0) item.baselineHours = sumBaselineHrs;
          if (sumActualHrs > 0) item.actualHours = sumActualHrs;
          if (sumBaselineCst > 0) item.baselineCost = sumBaselineCst;
          if (sumActualCst > 0) item.actualCost = sumActualCst;
          if (sumRemainingHrs > 0) item.remainingHours = sumRemainingHrs;
          if (sumRemainingCst > 0) item.remainingCost = sumRemainingCst;
          if (childCount > 0) {
            item.percentComplete = Math.round(sumPercentComplete / childCount);
          }
        }
      });
    };
    rollupDatesAndValues(items);

    // Compute daysRequired from start/end dates when both exist
    const setDaysFromDates = (itemList: any[]): void => {
      itemList.forEach((item: any) => {
        if (item.children && item.children.length > 0) {
          setDaysFromDates(item.children);
        }
        const start = item.startDate ?? item.baselineStartDate;
        const end = item.endDate ?? item.baselineEndDate;
        if (start && end) {
          const startMs = new Date(start).getTime();
          const endMs = new Date(end).getTime();
          if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
            const days = Math.max(1, Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000)));
            item.daysRequired = item.daysRequired ?? days;
          }
        }
      });
    };
    setDaysFromDates(items);

    reindexWBS(items);

    // Cast to WBSData format
    const wbsItems = items.map(item => {
      const itemAny = item as any;
      const startDate = item.startDate || itemAny.baselineStartDate || undefined;
      const endDate = item.endDate || itemAny.baselineEndDate || undefined;
      return {
        ...item,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        progress: item.percentComplete || 0,
      };
    }) as any;
    return { items: wbsItems };
  }, [dataKey]);
}

