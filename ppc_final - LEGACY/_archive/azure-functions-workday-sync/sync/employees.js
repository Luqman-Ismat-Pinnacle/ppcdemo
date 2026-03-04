/**
 * Workday employees sync – 1:1 with Supabase workday-employees Edge Function.
 * Fetches from Workday RPT_-_Employees and upserts into Postgres employees table.
 */

const config = require('../config');

function workdayFetch(url) {
  const auth = Buffer.from(`${config.workday.user}:${config.workday.pass}`).toString('base64');
  return fetch(url, {
    headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
  });
}

function mapRecord(r, i) {
  const employeeId = r.Employee_ID || r.employee_id || r.employeeId || r.ID || r.Worker_ID || r.worker_id;
  if (!employeeId) return null;

  let name = r.Worker || r.Name || r.name || r.Full_Name || r.full_name || '';
  if (!name && (r.firstName || r.First_Name) && (r.lastName || r.Last_Name)) {
    name = `${r.firstName || r.First_Name || ''} ${r.lastName || r.Last_Name || ''}`;
  }
  if (!name && (r.firstName || r.First_Name)) name = r.firstName || r.First_Name;
  if (!name) name = `Employee ${employeeId}`;

  const email = r.Work_Email || r.work_email || r.Email || r.email || r.Primary_Work_Email || r.primary_work_email || null;
  const jobTitle = r.businessTitle || r.Business_Title || r.business_title || r.Default_Job_Title || r.default_job_title || r.Job_Profile_Name || r.Job_Title || r.job_title || r.Position_Title || null;
  const managementLevel = r.Management_Level || r.management_level || r.ManagementLevel || r.Manager_Level || null;
  const manager = r.Worker_s_Manager || r.Workers_Manager || r["Worker's Manager"] || r.Manager || r.manager || r.Manager_Name || r.manager_name || null;
  const employeeType = r.Employee_Type || r.employee_type || r.EmployeeType || r.Worker_Type || r.worker_type || null;
  const role = r.Job_Profile || r.job_profile || r.JobProfile || r.Role || r.role || r.Roles || r.roles || null;
  const department = r.Cost_Center || r.cost_center || r.CostCenter || r.Department || r.department || r.Org_Unit || null;

  const seniorManager = r.Sr_Project_Manager || r.sr_project_manager || r.srProjectManager || null;
  const timeInJobProfile = r.Time_in_Job_Profile != null ? String(r.Time_in_Job_Profile) : (r.time_in_job_profile != null ? String(r.time_in_job_profile) : null);
  const employeeCustomer = r.customerOnEmpProfile || r.Customer_On_Emp_Profile || r.customer_on_emp_profile || null;
  const employeeSite = r.siteOnEmpProfile || r.Site_On_Emp_Profile || r.site_on_emp_profile || null;
  let employeeProjects = null;
  const rawProjects = r.projectNumberOnEmpProfile ?? r.Project_Number_On_Emp_Profile ?? r.project_number_on_emp_profile;
  if (rawProjects != null) {
    if (Array.isArray(rawProjects)) {
      employeeProjects = rawProjects.map((p) => String(p)).filter(Boolean).join(', ');
    } else {
      employeeProjects = String(rawProjects).trim() || null;
    }
  }

  const activeStatus = r.Active_Status || r.active_status || r.ActiveStatus || r.Status;
  const terminationDate = r.termination_date || r.Termination_Date || r.TerminationDate;
  const isActive =
    activeStatus === '1' || activeStatus === 1 || activeStatus === true ||
    activeStatus === 'Active' || activeStatus === 'active' || r.is_active === true ||
    (activeStatus !== '0' && activeStatus !== 0 && activeStatus !== 'Inactive' && !terminationDate);

  return {
    id: String(employeeId),
    employee_id: String(employeeId),
    name: String(name).trim(),
    email: email ? String(email) : null,
    job_title: jobTitle ? String(jobTitle) : null,
    management_level: managementLevel ? String(managementLevel) : null,
    manager: manager ? String(manager) : null,
    employee_type: employeeType ? String(employeeType) : null,
    role: role ? String(role) : null,
    department: department ? String(department) : null,
    senior_manager: seniorManager ? String(seniorManager) : null,
    time_in_job_profile: timeInJobProfile,
    employee_customer: employeeCustomer ? String(employeeCustomer) : null,
    employee_site: employeeSite ? String(employeeSite) : null,
    employee_projects: employeeProjects,
    is_active: !!isActive,
  };
}

async function upsertEmployees(client, rows) {
  if (rows.length === 0) return 0;
  const cols = ['id', 'employee_id', 'name', 'email', 'job_title', 'management_level', 'manager', 'employee_type', 'role', 'department', 'senior_manager', 'time_in_job_profile', 'employee_customer', 'employee_site', 'employee_projects', 'is_active'];
  const setClause = cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ');
  const batchSize = config.sync.batchSize;
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = batch.map(r => cols.map(c => r[c]));
    const placeholders = batch.map((_, bi) => '(' + cols.map((_, ci) => `$${bi * cols.length + ci + 1}`).join(',') + ')').join(',');
    const flat = values.flat();
    const sql = `INSERT INTO employees (${cols.join(', ')}) VALUES ${placeholders} ON CONFLICT (id) DO UPDATE SET ${setClause}`;
    await client.query(sql, flat);
    total += batch.length;
  }
  return total;
}

async function syncEmployees(client) {
  const url = config.urls.employees;
  if (!config.workday.user || !config.workday.pass) {
    throw new Error('WORKDAY_ISU_USER and WORKDAY_ISU_PASS must be set');
  }
  const res = await workdayFetch(url);
  if (!res.ok) throw new Error(`Workday employees API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  let records = Array.isArray(data) ? data : (data.Report_Entry || []);
  if (!Array.isArray(records) && data && typeof data === 'object') {
    const key = Object.keys(data).find(k => Array.isArray(data[k]) && data[k].length > 0);
    if (key) records = data[key];
  }
  const cleaned = records.map((r, i) => mapRecord(r, i)).filter(Boolean);
  const synced = await upsertEmployees(client, cleaned);
  return { total: records.length, valid: cleaned.length, synced };
}

module.exports = { syncEmployees };
