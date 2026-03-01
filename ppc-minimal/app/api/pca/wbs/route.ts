import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');

    const projectFilter = projectId ? 'WHERE project_id = $1' : '';
    const params = projectId ? [projectId] : [];

    const [units, phases, tasks, subTasks, portfolios, customers, sites, projects] = await Promise.all([
      query(`SELECT * FROM units ${projectFilter} ORDER BY project_id, outline_level, name`, params),
      query(`SELECT * FROM phases ${projectFilter} ORDER BY project_id, outline_level, name`, params),
      query(`SELECT * FROM tasks ${projectFilter} ORDER BY project_id, outline_level, name`, params),
      query(`SELECT * FROM sub_tasks ${projectFilter} ORDER BY project_id, outline_level, name`, params),
      query('SELECT * FROM portfolios ORDER BY name'),
      query('SELECT * FROM customers ORDER BY name'),
      query('SELECT * FROM sites ORDER BY name'),
      query(
        `SELECT * FROM projects ${projectId ? 'WHERE id = $1' : 'WHERE is_active = true'} ORDER BY name`,
        projectId ? [projectId] : [],
      ),
    ]);

    type R = Record<string, unknown>;
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const str = (v: unknown) => String(v ?? '');

    const phaseByUnit = new Map<string, R[]>();
    phases.forEach((p) => {
      const key = str((p as R).unit_id);
      if (!phaseByUnit.has(key)) phaseByUnit.set(key, []);
      phaseByUnit.get(key)!.push(p as R);
    });
    const taskByPhase = new Map<string, R[]>();
    tasks.forEach((t) => {
      const key = str((t as R).phase_id);
      if (!taskByPhase.has(key)) taskByPhase.set(key, []);
      taskByPhase.get(key)!.push(t as R);
    });
    const subTaskByTask = new Map<string, R[]>();
    subTasks.forEach((s) => {
      const key = str((s as R).task_id);
      if (!subTaskByTask.has(key)) subTaskByTask.set(key, []);
      subTaskByTask.get(key)!.push(s as R);
    });

    function toRow(
      row: R,
      type: 'portfolio' | 'customer' | 'site' | 'project' | 'unit' | 'phase' | 'task' | 'sub_task',
      level: number,
      parentId: string | null,
      hasChildren: boolean,
    ) {
      const baselineHours = num(row.baseline_hours);
      const actualHours = num(row.actual_hours);
      const remainingHours = num(row.remaining_hours);
      const work = actualHours + remainingHours;
      const baselineCost = num(row.baseline_cost);
      const actualCost = num(row.actual_cost);
      const remainingCost = num(row.remaining_cost);
      const scheduleCost = num(row.scheduled_cost || actualCost + remainingCost);
      const percentComplete = num(row.percent_complete);
      const efficiency = baselineHours > 0 ? (actualHours / baselineHours) * 100 : 0;
      const cpi = actualCost > 0 ? ((baselineCost * (percentComplete / 100)) / actualCost) : 0;

      return {
        id: str(row.id),
        parent_id: parentId,
        type,
        level,
        has_children: hasChildren,
        project_id: str(row.project_id),
        unit_id: str(row.unit_id),
        phase_id: str(row.phase_id),
        task_id: str(row.task_id || row.id),
        wbs_code: str(row.wbs_code),
        name: str(row.name),
        resource_name: str(row.resource || row.resources || ''),
        assigned_resource: str(row.resource || row.resources || ''),
        start_date: row.actual_start || row.baseline_start || null,
        end_date: row.actual_end || row.baseline_end || null,
        baseline_start: row.baseline_start || null,
        baseline_end: row.baseline_end || null,
        days_required: num(row.days),
        baseline_hours: baselineHours,
        actual_hours: actualHours,
        remaining_hours: remainingHours,
        work,
        baseline_cost: baselineCost,
        actual_cost: actualCost,
        remaining_cost: remainingCost,
        schedule_cost: scheduleCost,
        efficiency,
        percent_complete: percentComplete,
        predecessor_ids: row.predecessor_task_id ? [str(row.predecessor_task_id)] : [],
        predecessor_name: str(row.predecessor_name),
        predecessor_task_id: str(row.predecessor_task_id),
        relationship: str(row.relationship),
        lag_days: num(row.lag_days),
        total_float: num(row.total_float || row.tf),
        is_critical: Boolean(row.is_critical),
        is_milestone: Boolean(row.is_milestone),
        cpi,
      };
    }

    const unitByProject = new Map<string, R[]>();
    (units as R[]).forEach((u) => {
      const key = str(u.project_id);
      if (!unitByProject.has(key)) unitByProject.set(key, []);
      unitByProject.get(key)!.push(u);
    });

    const portfolioMap = new Map<string, R>((portfolios as R[]).map((r) => [str(r.id), r]));
    const customerMap = new Map<string, R>((customers as R[]).map((r) => [str(r.id), r]));
    const siteMap = new Map<string, R>((sites as R[]).map((r) => [str(r.id), r]));
    const usedProjectIds = new Set<string>();
    (units as R[]).forEach((r) => usedProjectIds.add(str(r.project_id)));
    (phases as R[]).forEach((r) => usedProjectIds.add(str(r.project_id)));
    (tasks as R[]).forEach((r) => usedProjectIds.add(str(r.project_id)));
    (subTasks as R[]).forEach((r) => usedProjectIds.add(str(r.project_id)));
    if (projectId) usedProjectIds.add(projectId);

    const treePortfolios = new Map<string, R>();
    const treeCustomers = new Map<string, R>();
    const treeSites = new Map<string, R>();
    const treeProjects = new Map<string, R>();
    const customerIdsByPortfolio = new Map<string, Set<string>>();
    const siteIdsByCustomer = new Map<string, Set<string>>();
    const projectIdsBySite = new Map<string, Set<string>>();

    const ensureSet = (map: Map<string, Set<string>>, key: string) => {
      if (!map.has(key)) map.set(key, new Set<string>());
      return map.get(key)!;
    };

    const addNode = (
      p: R,
      portIdRaw: string,
      customerIdRaw: string,
      siteIdRaw: string,
    ) => {
      const portId = portIdRaw || '__unassigned_portfolio__';
      const custId = customerIdRaw || `__unassigned_customer__:${portId}`;
      const siteId = siteIdRaw || `__unassigned_site__:${custId}`;

      const portRec = portfolioMap.get(portId) || { id: portId, name: 'Unassigned Portfolio' };
      const custRec = customerMap.get(custId) || { id: custId, name: 'Unassigned Customer', portfolio_id: portId };
      const siteRec = siteMap.get(siteId) || { id: siteId, name: 'Unassigned Site', customer_id: custId, portfolio_id: portId };

      treePortfolios.set(portId, portRec);
      treeCustomers.set(custId, custRec);
      treeSites.set(siteId, siteRec);
      treeProjects.set(str(p.id), p);

      ensureSet(customerIdsByPortfolio, portId).add(custId);
      ensureSet(siteIdsByCustomer, custId).add(siteId);
      ensureSet(projectIdsBySite, siteId).add(str(p.id));
    };

    (projects as R[]).forEach((p) => {
      const pid = str(p.id);
      if (usedProjectIds.size > 0 && !usedProjectIds.has(pid)) return;
      addNode(p, str(p.portfolio_id), str(p.customer_id), str(p.site_id));
    });

    const rows: Record<string, unknown>[] = [];
    const sortedPortfolioIds = [...treePortfolios.keys()].sort((a, b) => str(treePortfolios.get(a)?.name).localeCompare(str(treePortfolios.get(b)?.name)));
    for (const portfolioId of sortedPortfolioIds) {
      const customerIds = [...(customerIdsByPortfolio.get(portfolioId) || new Set<string>())];
      rows.push(toRow(treePortfolios.get(portfolioId) as R, 'portfolio', 0, null, customerIds.length > 0));

      customerIds.sort((a, b) => str(treeCustomers.get(a)?.name).localeCompare(str(treeCustomers.get(b)?.name)));
      for (const customerId of customerIds) {
        const siteIds = [...(siteIdsByCustomer.get(customerId) || new Set<string>())];
        rows.push(toRow(treeCustomers.get(customerId) as R, 'customer', 1, portfolioId, siteIds.length > 0));

        siteIds.sort((a, b) => str(treeSites.get(a)?.name).localeCompare(str(treeSites.get(b)?.name)));
        for (const siteId of siteIds) {
          const projectIds = [...(projectIdsBySite.get(siteId) || new Set<string>())];
          rows.push(toRow(treeSites.get(siteId) as R, 'site', 2, customerId, projectIds.length > 0));

          projectIds.sort((a, b) => str(treeProjects.get(a)?.name).localeCompare(str(treeProjects.get(b)?.name)));
          for (const pid of projectIds) {
            const project = treeProjects.get(pid) as R;
            const projectUnits = unitByProject.get(pid) || [];
            rows.push(toRow(project, 'project', 3, siteId, projectUnits.length > 0));

            for (const u of projectUnits) {
              const uid = str(u.id);
              const uPhases = phaseByUnit.get(uid) || [];
              rows.push(toRow(u, 'unit', 4, pid, uPhases.length > 0));
              for (const p of uPhases) {
                const phaseId = str(p.id);
                const pTasks = taskByPhase.get(phaseId) || [];
                rows.push(toRow(p, 'phase', 5, uid, pTasks.length > 0));
                for (const t of pTasks) {
                  const taskId = str(t.id);
                  const tSubs = subTaskByTask.get(taskId) || [];
                  rows.push(toRow(t, 'task', 6, phaseId, tSubs.length > 0));
                  for (const s of tSubs) {
                    rows.push(toRow(s, 'sub_task', 7, taskId, false));
                  }
                }
              }
            }
          }
        }
      }
    }

    return NextResponse.json(
      { success: true, items: rows },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
