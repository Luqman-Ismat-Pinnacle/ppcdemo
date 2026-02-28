/**
 * Workday hierarchy sync – 1:1 with Supabase workday-projects Edge Function.
 * Fetches Find Projects + View Project Plan Integration, upserts portfolios, customers, sites, projects, workday_tasks.
 */

const config = require('../config');

function workdayFetch(url) {
  const auth = Buffer.from(`${config.workday.user}:${config.workday.pass}`).toString('base64');
  return fetch(url, { headers: { Accept: 'application/json', Authorization: `Basic ${auth}` } });
}

function generateId(prefix, name) {
  const slug = String(name).toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 30);
  return `${prefix}-${slug}`;
}

function generateSiteId(custName, siteName) {
  if (!siteName) return null;
  const key = [custName, siteName].filter(Boolean).join(' ') || siteName;
  return generateId('STE', key);
}

function cleanProjectId(raw) {
  if (!raw) return '';
  return String(raw).replace(/\s*\(Inactive\)\s*$/i, '').trim().substring(0, 50);
}

async function syncProjects(client) {
  if (!config.workday.user || !config.workday.pass) {
    throw new Error('WORKDAY_ISU_USER and WORKDAY_ISU_PASS must be set');
  }

  const resMaster = await workdayFetch(config.urls.findProjects);
  if (!resMaster.ok) throw new Error(`Workday Find Projects ${resMaster.status}: ${await resMaster.text()}`);
  const dataMaster = await resMaster.json();
  const masterRecords = dataMaster.Report_Entry || [];

  const portfoliosToUpsert = new Map();
  const customersToUpsert = new Map();
  const sitesToUpsert = new Map();
  const projectsToUpsert = new Map();

  for (const r of masterRecords) {
    const custName = r.CF_Customer_Site_Ref_ID || r.Customer;
    const siteName = r.CF_Project_Site_Ref_ID || r.Site;
    const portfolioMgr = r.Optional_Project_Hierarchies;

    let portfolioId = null;
    if (portfolioMgr) {
      portfolioId = generateId('PRF', portfolioMgr);
      if (!portfoliosToUpsert.has(portfolioId)) {
        portfoliosToUpsert.set(portfolioId, {
          id: portfolioId,
          portfolio_id: portfolioId,
          name: `${portfolioMgr}'s Portfolio`,
          manager: portfolioMgr,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (custName) {
      const custId = generateId('CST', custName);
      if (!customersToUpsert.has(custId)) {
        customersToUpsert.set(custId, {
          id: custId,
          customer_id: custId,
          name: custName,
          portfolio_id: portfolioId,
          is_active: true,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (siteName) {
      const siteId = generateSiteId(custName || null, siteName);
      if (siteId && !sitesToUpsert.has(siteId)) {
        sitesToUpsert.set(siteId, {
          id: siteId,
          site_id: siteId,
          name: siteName,
          customer_id: custName ? generateId('CST', custName) : null,
          location: r.Location || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  for (const r of masterRecords) {
    const projectIdRaw = r.Project_by_ID || r.projectReferenceID || r.Project_ID;
    const projectName = r.Project || r.projectName;
    const projectId = cleanProjectId(projectIdRaw);
    const custName = r.CF_Customer_Site_Ref_ID || r.Customer;
    const siteName = r.CF_Project_Site_Ref_ID || r.Site;
    if (projectId && projectName) {
      const custId = custName ? generateId('CST', custName) : null;
      const siteId = generateSiteId(custName || null, siteName || null);
      if (!projectsToUpsert.has(projectId)) {
        projectsToUpsert.set(projectId, {
          id: projectId,
          project_id: projectId,
          name: projectName,
          customer_id: custId,
          site_id: siteId,
          has_schedule: false,
          is_active: r['Inactive_-_Current'] !== '1' && r.Project_Status !== 'Closed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  const workdayTasksToUpsert = new Map();
  try {
    const resInt = await workdayFetch(config.urls.integration);
    if (resInt.ok) {
      const dataInt = await resInt.json();
      const intRecords = dataInt.Report_Entry || [];
      for (const r of intRecords) {
        const taskId = r.Task_ID || r.taskReferenceID;
        const projectId = r.projectReferenceID || r.Project_ID;
        if (taskId && projectId) {
          if (!workdayTasksToUpsert.has(taskId)) {
            workdayTasksToUpsert.set(taskId, {
              id: taskId,
              project_id: projectId,
              task_name: r.Task || r.taskName || '',
              task_number: r.Task_Number || '',
              start_date: r.Start_Date || null,
              end_date: r.End_Date || null,
              budgeted_hours: parseFloat(r.Budgeted_Hours) || 0,
              actual_hours: parseFloat(r.Actual_Hours) || 0,
              actual_cost: parseFloat(r.Actual_Cost) || 0,
              status: r.Status || 'Active',
              assigned_resource: r.Assigned_Resource || '',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              deleted: false,
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn('[workday-projects] Integration report fetch failed (non-fatal):', e.message);
  }

  const upsert = async (table, items, cols) => {
    if (items.length === 0) return;
    const allCols = cols || Object.keys(items[0]);
    const setClause = allCols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ');
    const batchSize = config.sync.hoursBatchSize;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const values = batch.map(r => allCols.map(c => r[c]));
      const placeholders = batch.map((_, bi) => '(' + allCols.map((_, ci) => `$${bi * allCols.length + ci + 1}`).join(',') + ')').join(',');
      const sql = `INSERT INTO ${table} (${allCols.join(', ')}) VALUES ${placeholders} ON CONFLICT (id) DO UPDATE SET ${setClause}`;
      await client.query(sql, values.flat());
    }
  };

  const portfolioList = Array.from(portfoliosToUpsert.values());
  const customerList = Array.from(customersToUpsert.values());
  const siteList = Array.from(sitesToUpsert.values());
  const projectList = Array.from(projectsToUpsert.values());
  const workdayTasksList = Array.from(workdayTasksToUpsert.values());

  await upsert('portfolios', portfolioList);
  await upsert('customers', customerList);
  await upsert('sites', siteList);
  await upsert('projects', projectList);
  const wtCols = ['id', 'project_id', 'task_name', 'task_number', 'start_date', 'end_date', 'budgeted_hours', 'actual_hours', 'actual_cost', 'status', 'assigned_resource', 'created_at', 'updated_at', 'deleted'];
  await upsert('workday_tasks', workdayTasksList, wtCols);

  return {
    portfolios: portfolioList.length,
    customers: customerList.length,
    sites: siteList.length,
    projects: projectList.length,
    workdayTasks: workdayTasksList.length,
  };
}

module.exports = { syncProjects };
