/**
 * Azure Functions entry point for Workday sync.
 * Timer trigger: cron (default 2 AM daily). HTTP trigger: manual sync.
 */

const { runFullSync } = require('./run-sync');

async function timerTrigger(context, myTimer) {
  context.log('WorkdaySync Timer: starting');
  try {
    const summary = await runFullSync();
    context.log('WorkdaySync Timer: done', JSON.stringify(summary));
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
    const summary = await runFullSync();
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
