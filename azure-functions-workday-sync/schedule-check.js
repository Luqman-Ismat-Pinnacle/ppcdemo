/**
 * Read Workday sync schedule from app_settings and decide if the timer should run now.
 * Schedule is stored by the app via /api/settings/workday-schedule (hour, minute in UTC).
 * Timer runs every 15 min; we run when current UTC time matches the scheduled 15-min window
 * and we haven't run in the last 11 hours.
 */

const KEY = 'workday_sync_schedule';

async function getSchedule(client) {
  const res = await client.query('SELECT value FROM app_settings WHERE key = $1', [KEY]);
  const row = res.rows && res.rows[0];
  const v = row && row.value ? row.value : {};
  return {
    hour: typeof v.hour === 'number' ? v.hour : 2,
    minute: typeof v.minute === 'number' ? v.minute : 0,
    lastRunAt: v.lastRunAt || null,
  };
}

function shouldRunNow(schedule) {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  if (utcHour !== schedule.hour) return false;
  const scheduledBucket = Math.floor(schedule.minute / 15) * 15;
  const currentBucket = Math.floor(utcMinute / 15) * 15;
  if (currentBucket !== scheduledBucket) return false;
  const minGapMs = 11 * 60 * 60 * 1000;
  if (schedule.lastRunAt) {
    const last = new Date(schedule.lastRunAt).getTime();
    if (now.getTime() - last < minGapMs) return false;
  }
  return true;
}

async function markRun(client) {
  const res = await client.query('SELECT value FROM app_settings WHERE key = $1', [KEY]);
  const row = res.rows && res.rows[0];
  const value = (row && row.value) ? row.value : {};
  const updated = { ...value, lastRunAt: new Date().toISOString() };
  await client.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
    [KEY, JSON.stringify(updated)]
  );
}

module.exports = { getSchedule, shouldRunNow, markRun };
