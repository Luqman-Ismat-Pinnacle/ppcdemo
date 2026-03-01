/**
 * Maps Workday REST API JSON data into the minimal schema tables.
 * Handles both raw Workday Report_Entry field names and snake_case fallbacks.
 */

type Raw = Record<string, unknown>;

function s(val: unknown): string { return val ? String(val).trim() : ''; }
function n(val: unknown): number { const v = Number(val); return Number.isFinite(v) ? v : 0; }
function bool(val: unknown): boolean {
  const v = s(val).toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'active';
}

function slugify(val: string): string {
  return val.replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

/**
 * Normalize a project ID: if purely alphabetic, keep as-is.
 * If numeric (e.g. "20605.1 Some Name"), extract the number with optional decimal.
 * Matches hour_entries Project_ID format.
 */
export function normalizeProjectId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^[a-zA-Z]+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)/);
  return match ? match[1] : trimmed;
}

export function mapEmployees(records: Raw[]): Raw[] {
  return records.filter(r => s(r.Employee_ID || r.employee_id)).map(r => ({
    id: s(r.Employee_ID || r.employee_id),
    employee_id: s(r.Employee_ID || r.employee_id),
    name: s(r.Worker || r.name || `${s(r.firstName)} ${s(r.lastName)}`).trim(),
    email: s(r.Work_Email || r.email),
    time_in_job_profile: s(r.Time_in_Job_Profile || r.time_in_job_profile),
    management_level: s(r.Management_Level || r.management_level),
    employee_type: s(r.Employee_Type || r.employee_type),
    senior_manager: s(r.Sr_Project_Manager || r.CF_ARI_Sr_Project_Manager || r.senior_manager),
    job_title: s(r.Default_Job_Title || r.businessTitle || r.job_title || r.Job_Profile),
    is_active: r.Active_Status !== undefined ? bool(r.Active_Status) : bool(r.is_active ?? 'true'),
    manager: s(r.Worker_s_Manager || r.Workers_Manager || r.manager),
    employee_customer: s(r.customerOnEmpProfile || r.employee_customer),
    employee_site: s(r.siteOnEmpProfile || r.employee_site),
    employee_project: s(r.projectNumberOnEmpProfile || r.employee_project),
    department: s(r.Cost_Center || r.department),
  }));
}

export function mapProjects(records: Raw[]): {
  portfolios: Raw[]; customers: Raw[]; sites: Raw[]; projects: Raw[];
} {
  const portMap = new Map<string, Raw>();
  const custMap = new Map<string, Raw>();
  const siteMap = new Map<string, Raw>();
  const projArr: Raw[] = [];

  for (const r of records) {
    const rawProjId = s(r.Project_by_ID || r.project_id || r.id);
    const projId = normalizeProjectId(rawProjId);
    if (!projId) continue;

    const smName = s(
      r.CF_ARI_Sr_Project_Manager || r.Optional_Project_Hierarchies ||
      r.Sr_Project_Manager || r.senior_manager || r.manager
    );
    const portId = smName ? slugify(smName) : 'default';
    if (!portMap.has(portId)) {
      portMap.set(portId, { id: portId, name: smName || 'Default Portfolio', is_active: true });
    }

    const custSite = s(r['Customer_-_Site'] || r.Customer_Site || '');
    const custName = s(r.Customer || r.Customer_Name || r.customer_name || '');
    const custId = s(r.CF_Customer_Site_Ref_ID || r.Customer_ID || r.customer_id || '') || (custName ? slugify(custName) : '');
    if (custId && !custMap.has(custId)) {
      custMap.set(custId, {
        id: custId, portfolio_id: portId,
        name: custName || custSite || custId, is_active: true,
      });
    }

    const siteName = s(r.Site || r.CF_Project_Site_Ref_ID || r.Site_Name || r.site_name || '');
    const siteId = s(r.CF_Project_Site_Ref_ID || r.Site_ID || r.site_id || '') || (siteName ? slugify(siteName) : '');
    if (siteId && !siteMap.has(siteId)) {
      siteMap.set(siteId, {
        id: siteId, customer_id: custId || null, portfolio_id: portId,
        name: siteName || siteId,
        location: s(r.Location || r.location),
        is_active: true,
      });
    }

    const projName = s(r.Project || r.Project_Name || r.project_name || r.name || projId);
    const isInactive = s(r['Inactive_-_Current'] || r.Inactive || '');

    projArr.push({
      id: projId,
      name: projName,
      site_id: siteId || null,
      customer_id: custId || null,
      portfolio_id: portId,
      pca_email: s(r.PCA_Email || r.pca_email),
      is_active: isInactive !== '1',
      has_schedule: false,
      baseline_start: r.Start_Date || r.Planned_Start_Date || r.baseline_start || null,
      baseline_end: r.End_Date || r.Planned_End_Date || r.baseline_end || null,
      actual_start: r.Actual_Start_Date || r.actual_start || null,
      actual_end: r.Actual_End_Date || r.actual_end || null,
      baseline_hours: n(r.Budgeted_Hours || r.baseline_hours),
      actual_hours: n(r.Actual_Hours || r.actual_hours),
      remaining_hours: n(r.Remaining_Hours || r.remaining_hours),
      actual_cost: n(r.Actual_Cost || r.actual_cost),
      remaining_cost: n(r.Remaining_Cost || r.remaining_cost),
    });
  }

  return {
    portfolios: [...portMap.values()],
    customers: [...custMap.values()],
    sites: [...siteMap.values()],
    projects: projArr,
  };
}

export function mapHours(records: Raw[]): Raw[] {
  return records.filter(r => s(r.Project_ID || r.project_id)).map((r, i) => {
    const refId = s(r.referenceID || r.workdayID || r.id);
    return {
      id: refId || `he-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      employee_id: s(r.Employee_ID || r.employee_id),
      project_id: normalizeProjectId(s(r.Project_ID || r.project_id)),
      phase: s(r.Phase || r.phase),
      task: s(r.Custom_Task_Name || r.Task || r.task),
      charge_code: s(r.Charge_Type || r.Charge_Code || r.charge_code),
      description: s(r.Project_Description || r.Description || r.description),
      date: r.Transaction_Date || r.Date || r.date || r.Work_Date || r.work_date || null,
      hours: n(r.Hours || r.hours),
      actual_cost: n(r.Reported_Standard_Cost_Amt || r.Reported_Standard_22 || r.Actual_Cost || r.actual_cost),
      workday_phase: s(r.Phase || r.Workday_Phase || r.workday_phase),
      workday_task: s(r.Custom_Task_Name || r.Task || r.Workday_Task || r.workday_task),
      mpp_phase_task: s(r.MPP_Phase_Task || r.mpp_phase_task),
      actual_revenue: n(r.Billable_Amount || r.Revenue || r.actual_revenue),
      billing_status: s(r.Timesheet_is_Approved || r.Billing_Status || r.billing_status),
    };
  });
}

/**
 * Extract project ID from Worktags string if present.
 * Format: "...; Project: 20605 Bumi Armada - 23 - ...; ..."
 */
function extractProjectFromWorktags(worktags: string): string {
  const match = worktags.match(/Project:\s*(\S+)/);
  return match ? match[1] : '';
}

/**
 * Extract Customer - Site from Worktags.
 * Format: "...; Customer - Site: Valero - Benicia; ..."
 */
function extractCustomerSiteFromWorktags(worktags: string): string {
  const match = worktags.match(/Customer - Site:\s*([^;]+)/);
  return match ? match[1].trim() : '';
}

/**
 * Contracts typically link at Customer-Site level, not project level.
 * We use project_id when available, otherwise store customer_site for later linking.
 */
export function mapContracts(records: Raw[]): Raw[] {
  return records
    .map((r, i) => {
      const worktags = s(r.Worktags);
      const rawProjId = s(r.Project_ID || r.project_id) || extractProjectFromWorktags(worktags);
      const projectId = normalizeProjectId(rawProjId);
      const customerSite = extractCustomerSiteFromWorktags(worktags);
      const refId = s(r.referenceID || r.CF_Billing_Schedule_Ref_ID || r.id);
      return {
        id: refId || `cc-${Date.now()}-${i}`,
        project_id: projectId || customerSite || null,
        line_amount: n(r.Line_Amount || r.line_amount || r.Amount || r.amount),
        line_date: r.Line_Date || r.line_date || r.Date || r.date || null,
        currency: s(r.Currency || r.currency) || 'USD',
      };
    })
    .filter(r => r.project_id);
}

/**
 * Workday Phases raw fields:
 *   Level_1, Level_2, Parent_Reference_ID, Project,
 *   Project_Phase_Description, Project_Phase_Description1,
 *   SubPhase_Reference_ID
 * "Project" is like "20246 TSAR - 24 - San Antonio - Reliability Optimization"
 */
export function mapWorkdayPhases(records: Raw[]): Raw[] {
  return records.flatMap((r) => {
      const projRaw = s(r.Project || r.project);
      const projId = normalizeProjectId(projRaw);
      if (!projId) return [];

      const subPhaseRef = s(r.SubPhase_Reference_ID || r.subPhaseReferenceId || r.Phase_ID || r.phase_id || r.id);
      const id = subPhaseRef || `wp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const unit = s(r.Level_1 || r.Project_Phase_Description || r.Unit || r.unit);
      const name = s(r.Level_2 || r.Project_Phase_Description1 || r.Phase_Name || r.Phase || r.name) || unit;

      return [{
        id,
        project_id: projId,
        unit,
        name,
        baseline_start: r.Planned_Start_Date || r.baseline_start || null,
        baseline_end: r.Planned_End_Date || r.baseline_end || null,
        actual_start: r.Actual_Start_Date || r.actual_start || null,
        actual_end: r.Actual_End_Date || r.actual_end || null,
        percent_complete: n(r.Percent_Complete || r.percent_complete),
        baseline_hours: n(r.Budgeted_Hours || r.baseline_hours),
        actual_hours: n(r.Actual_Hours || r.actual_hours),
        remaining_hours: n(r.Remaining_Hours || r.remaining_hours),
        actual_cost: n(r.Actual_Cost || r.actual_cost),
        remaining_cost: n(r.Remaining_Cost || r.remaining_cost),
        is_active: true,
        comments: s(r.Comments || r.comments),
        total_hours: n(r.Total_Hours || r.total_hours),
        days: n(r.Days || r.days),
        scheduled_cost: n(r.Scheduled_Cost || r.scheduled_cost),
        progress: n(r.Progress || r.progress),
        tf: n(r.TF || r.tf),
        projected_hours: n(r.Projected_Hours || r.projected_hours),
      }];
    });
}
