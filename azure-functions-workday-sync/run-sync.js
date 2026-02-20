/**
 * Runs the full Workday sync: employees -> projects -> hours (chunked) -> matching -> aggregation.
 * Used by both Timer and HTTP triggers. Call from Azure Function handler.
 */

const { withClient } = require('./shared/db');
const { syncEmployees } = require('./sync/employees');
const { syncProjects } = require('./sync/projects');
const { syncHours } = require('./sync/hours');
const { runMatchingAndAggregation } = require('./sync/matching');
const { syncCustomerContracts } = require('./sync/customer-contracts');
const { syncWorkdayPhases } = require('./sync/workday-phases');
const config = require('./config');

const WINDOW_DAYS = config.sync.windowDays;

function getHoursDaysBack(override) {
  if (typeof override === 'number' && override >= 1 && override <= 730) return override;
  return config.sync.hoursDaysBack;
}

async function runFullSync(hoursDaysBackOverride) {
  const HOURS_DAYS_BACK = getHoursDaysBack(hoursDaysBackOverride);
  const summary = {
    employees: null,
    hierarchy: null,
    hours: { chunksOk: 0, chunksFail: 0, totalHours: 0, totalFetched: 0, hoursDaysBack: HOURS_DAYS_BACK, lastError: null },
    matching: null,
    customerContracts: null,
    workdayPhases: null,
  };

  return await withClient(async (client) => {
    try {
      summary.employees = await syncEmployees(client);
    } catch (e) {
      console.error('[WorkdaySync] Employees failed:', e.message);
      throw e;
    }

    try {
      summary.hierarchy = await syncProjects(client);
    } catch (e) {
      console.error('[WorkdaySync] Projects failed:', e.message);
      throw e;
    }

    try {
      summary.customerContracts = await syncCustomerContracts(client);
      console.log('[WorkdaySync] Customer contracts:', JSON.stringify(summary.customerContracts));
    } catch (e) {
      console.error('[WorkdaySync] Customer contracts failed:', e.message);
      summary.customerContracts = { error: e.message };
    }

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - HOURS_DAYS_BACK);
    const totalChunks = Math.ceil(HOURS_DAYS_BACK / WINDOW_DAYS);

    console.log(`[WorkdaySync] Hours: ${totalChunks} chunks (${WINDOW_DAYS} days each), range ${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`);
    for (let i = 0; i < totalChunks; i++) {
      const chunkEnd = new Date(end);
      chunkEnd.setDate(end.getDate() - i * WINDOW_DAYS);
      const chunkStart = new Date(chunkEnd);
      chunkStart.setDate(chunkStart.getDate() - WINDOW_DAYS + 1);
      if (chunkStart < start) chunkStart.setTime(start.getTime());
      try {
        const result = await syncHours(client, chunkStart, chunkEnd);
        summary.hours.chunksOk++;
        summary.hours.totalFetched += result.fetched || 0;
        summary.hours.totalHours += result.hours || 0;
        console.log(`[WorkdaySync] Hours chunk ${i + 1}/${totalChunks} ok: fetched=${result.fetched} upserted=${result.hours}`);
      } catch (e) {
        summary.hours.chunksFail++;
        summary.hours.lastError = e.message || String(e);
        console.error(`[WorkdaySync] Hours chunk ${i + 1}/${totalChunks} failed:`, e.message);
        if (e.stack) console.error(e.stack);
      }
      if (i < totalChunks - 1) await new Promise((r) => setTimeout(r, 200));
    }

    try {
      summary.matching = await runMatchingAndAggregation(client);
    } catch (e) {
      console.error('[WorkdaySync] Matching/aggregation failed:', e.message);
    }

    try {
      summary.workdayPhases = await syncWorkdayPhases(client);
      console.log('[WorkdaySync] Workday phases:', JSON.stringify(summary.workdayPhases));
    } catch (e) {
      console.error('[WorkdaySync] Workday phases failed:', e.message);
      summary.workdayPhases = { error: e.message };
    }

    return summary;
  });
}

module.exports = { runFullSync };
