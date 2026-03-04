/**
 * Azure Functions entry point for Workday sync.
 * Timer trigger: runs every 15 min; executes sync only when UTC time matches user-configured schedule (app_settings).
 * HTTP trigger: manual sync.
 */

const config = require('./config');
const { runFullSync, runHoursOnlySync } = require('./run-sync');
const { withClient } = require('./shared/db');
const { getSchedule, shouldRunNow, markRun } = require('./schedule-check');
const { syncCustomerContracts } = require('./sync/customer-contracts');

async function timerTrigger(context, myTimer) {
  context.log('WorkdaySync Timer: tick');
  let shouldRun = false;
  try {
    await withClient(async (client) => {
      const schedule = await getSchedule(client);
      shouldRun = shouldRunNow(schedule);
      context.log('WorkdaySync Timer: schedule', schedule.hour + ':' + String(schedule.minute).padStart(2, '0'), 'UTC, shouldRun', shouldRun);
    });
  } catch (err) {
    context.log.warn('WorkdaySync Timer: could not read schedule (table may be missing)', err.message);
    shouldRun = false;
  }
  if (!shouldRun) return;
  try {
    context.log('WorkdaySync Timer: starting full sync');
    const summary = await runFullSync();
    context.log('WorkdaySync Timer: done', JSON.stringify(summary));
    await withClient((client) => markRun(client));
  } catch (err) {
    context.log.error('WorkdaySync Timer: error', err);
    throw err;
  }
}

async function httpTrigger(context, req) {
  context.log('WorkdaySync HTTP: starting');
  const res = {
    status: 200,
    body: {},
    headers: { 'Content-Type': 'application/json' },
  };
  try {
    const syncOnly = (req.query && req.query.sync) || (req.body && req.body.sync);
    if (syncOnly === 'customerContracts') {
      context.log('WorkdaySync HTTP: customer contracts only');
      const result = await withClient((client) => syncCustomerContracts(client));
      res.body = { success: true, customerContracts: result };
      context.log('WorkdaySync HTTP: customer contracts done', JSON.stringify(result));
      context.res = res;
      return;
    }
    const startDate = req.body && typeof req.body.startDate === 'string' ? req.body.startDate : null;
    const endDate = req.body && typeof req.body.endDate === 'string' ? req.body.endDate : null;
    if (syncOnly === 'hours' && startDate && endDate) {
      context.log('WorkdaySync HTTP: hours only', startDate, 'to', endDate);
      const summary = await runHoursOnlySync(startDate, endDate);
      res.body = {
        success: (summary.hours.chunksFail || 0) === 0,
        summary,
        results: {
          hours: {
            success: summary.hours.chunksFail === 0,
            summary: summary.hours,
          },
          matching: summary.matching != null ? { success: true, summary: summary.matching } : null,
        },
      };
      context.res = res;
      return;
    }
    let hoursDaysBack = config.sync.hoursDaysBack;
    if (req.body && typeof req.body.hoursDaysBack === 'number') {
      hoursDaysBack = Math.min(730, Math.max(1, req.body.hoursDaysBack));
      context.log('WorkdaySync HTTP: using hoursDaysBack from body', hoursDaysBack);
    }
    const summary = await runFullSync(hoursDaysBack);
    // Expose step-level results so API/UI can show employees, hierarchy, hours, matching, customerContracts
    const results = {
      employees: summary.employees != null ? { success: true, summary: summary.employees } : null,
      hierarchy: summary.hierarchy != null ? { success: true, summary: summary.hierarchy } : null,
      hours: summary.hours != null ? {
        success: (summary.hours.chunksFail || 0) === 0,
        summary: {
          chunksOk: summary.hours.chunksOk,
          chunksFail: summary.hours.chunksFail,
          totalHours: summary.hours.totalHours,
          totalFetched: summary.hours.totalFetched,
          hoursDaysBack: summary.hours.hoursDaysBack,
          lastError: summary.hours.lastError || undefined,
        },
      } : null,
      matching: summary.matching != null ? { success: true, summary: summary.matching } : null,
      customerContracts: summary.customerContracts != null && !summary.customerContracts.error
        ? { success: true, summary: summary.customerContracts }
        : summary.customerContracts != null
          ? { success: false, error: summary.customerContracts.error, summary: summary.customerContracts }
          : null,
      workdayPhases: summary.workdayPhases != null && !summary.workdayPhases.error
        ? { success: true, summary: summary.workdayPhases }
        : summary.workdayPhases != null
          ? { success: false, error: summary.workdayPhases.error, summary: summary.workdayPhases }
          : null,
    };
    res.body = { success: true, summary, results };
    context.log('WorkdaySync HTTP: done', JSON.stringify(summary));
  } catch (err) {
    context.log.error('WorkdaySync HTTP: error', err);
    res.status = 500;
    res.body = { success: false, error: err.message };
  }
  context.res = res;
}

module.exports = { timerTrigger, httpTrigger };
