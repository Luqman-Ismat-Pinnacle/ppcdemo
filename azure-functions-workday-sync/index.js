/**
 * Azure Functions entry point for Workday sync.
 * Timer trigger: runs every 15 min; executes sync only when UTC time matches user-configured schedule (app_settings).
 * HTTP trigger: manual sync.
 */

const { runFullSync } = require('./run-sync');
const { withClient } = require('./shared/db');
const { getSchedule, shouldRunNow, markRun } = require('./schedule-check');

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
    let hoursDaysBack;
    if (req.body && typeof req.body.hoursDaysBack === 'number') {
      hoursDaysBack = Math.min(730, Math.max(30, req.body.hoursDaysBack));
      context.log('WorkdaySync HTTP: using hoursDaysBack from body', hoursDaysBack);
    }
    const summary = await runFullSync(hoursDaysBack);
    res.body = { success: true, summary };
    context.log('WorkdaySync HTTP: done', JSON.stringify(summary));
  } catch (err) {
    context.log.error('WorkdaySync HTTP: error', err);
    res.status = 500;
    res.body = { success: false, error: err.message };
  }
  context.res = res;
}

module.exports = { timerTrigger, httpTrigger };
