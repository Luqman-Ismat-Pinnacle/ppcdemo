/**
 * Workday sync config for Edge Functions – mirrors Azure config.js.
 * URLs and options can be overridden via Supabase secrets (env).
 */

const DEFAULT_BASE = 'https://services1.myworkday.com';

export const workdayConfig = {
  workday: {
    user: Deno.env.get('WORKDAY_ISU_USER') ?? '',
    pass: Deno.env.get('WORKDAY_ISU_PASS') ?? '',
    baseUrl: Deno.env.get('WORKDAY_BASE_URL') ?? DEFAULT_BASE,
  },
  urls: {
    employees:
      Deno.env.get('WORKDAY_EMPLOYEES_URL') ??
      `${DEFAULT_BASE}/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Employees?Include_Terminated_Workers=1&format=json`,
    findProjects:
      Deno.env.get('WORKDAY_FIND_PROJECTS_URL') ??
      `${DEFAULT_BASE}/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Find_Projects_-_Pinnacle?Projects_and_Project_Hierarchies%21WID=6c3abbb4fb20100174cf1f0f36850000&Include_Subordinate_Project_Hierarchies=1&Billable=0&Capital=0&Inactive=0&Status%21WID=8114d1e7d62810016e8dbc4118e60000!8114d1e7d62810016e8dbba72b880000!758d94cc846601c5404e6ab4e2135430!8114d1e7d62810016e8dbb0d64800000!874d109880b8100105bee5e42fde0000!8114d1e7d62810016e8dbba72b880001&format=json`,
    integration:
      Deno.env.get('WORKDAY_INTEGRATION_URL') ??
      `${DEFAULT_BASE}/ccx/service/customreport2/pinnacle/mandie.burnett/RPT_-_View_Project_Plan_-_Integration?Include_Subordinate_Project_Hierarchies=1&Projects_and_Project_Hierarchies%21WID=6c3abbb4fb20100174cf1f0f36850000&format=json`,
    hoursBase:
      Deno.env.get('WORKDAY_HOURS_BASE_URL') ??
      `${DEFAULT_BASE}/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Project_Labor_Transactions`,
    hoursQueryWid:
      Deno.env.get('WORKDAY_HOURS_QUERY_WID') ??
      '94cffcd386281001f21ecbc0ba820001!3cc34283d5c31000b9685df9ccce0001!74988a42b1d71000bb0ee8b8b70c0000!74988a42b1d71000bad6bfeceb310001!74988a42b1d71000babc7d9ad9b50001!8114d1e7d6281001755179b2ecba0000!74988a42b1d71000b9565eb994d30000!74988a42b1d71000b928197b465e0001!74988a42b1d71000b90309e92b680001!6e4362224aa81000ca8f84a39b6a0001!74988a42b1d71000b8ee4094ed830001!82a1fc685dda1000c6c99bc7562b0000!6c3abbb4fb20100174cf1f0f36850000!e0c093bd0ece100165ff337f9cdd0000!5821192f86da1000c64cf77badb50001!2a5ee02cc70210015501fde7aa720001!2a5ee02cc702100154f3887562a20001!60cb012a3c2a100169b86b0bb3d20001!761afa109c8910017615a972157b0000!761afa109c8910017615a83d85680000!761afa109c8910017615a7094cce0000!761afa109c8910017615a53aeb070000!761afa109c8910017615a4050c3c0000!761afa109c8910017615a235a48a0000!3cc34283d5c31000ba1e365ffde80001',
    currencyRateTypeWid: Deno.env.get('WORKDAY_CURRENCY_RATE_TYPE_WID') ?? '44e3d909d76b0127e940e8b41011293b',
    reportingCurrencyWid: Deno.env.get('WORKDAY_REPORTING_CURRENCY_WID') ?? '9e996ffdd3e14da0ba7275d5400bafd4',
    customerContracts:
      Deno.env.get('WORKDAY_CUSTOMER_CONTRACTS_URL') ??
      `${DEFAULT_BASE}/ccx/service/customreport2/pinnacle/mandie.burnett/RPT_-_Find_Customer_Contract_Lines_-_Revenue?New_Business=0&Renewable=0&format=json`,
    workdayPhases:
      Deno.env.get('WORKDAY_PHASES_URL') ??
      `${DEFAULT_BASE}/ccx/service/customreport2/pinnacle/mandie.burnett/RPT_-_View_Project_Plan_-_Integration_for_Parent_Phase?Include_Subordinate_Project_Hierarchies=1&Projects_and_Project_Hierarchies%21WID=6c3abbb4fb20100174cf1f0f36850000&format=json`,
  },
  sync: {
    // Default 30 days. Use body.hoursDaysBack or WORKDAY_HOURS_DAYS_BACK for more (e.g. 90 or 730).
    hoursDaysBack: Math.min(730, Math.max(1, parseInt(Deno.env.get('WORKDAY_HOURS_DAYS_BACK') ?? '30', 10))),
    // Process hours day-by-day to avoid memory/worker limits; cooldown between each day.
    windowDays: 1,
    hoursChunkCooldownMs: parseInt(Deno.env.get('WORKDAY_HOURS_COOLDOWN_MS') ?? '500', 10),
    batchSize: 100,
    hoursBatchSize: 500,
  },
};

export function workdayFetch(url: string): Promise<Response> {
  const { user, pass } = workdayConfig.workday;
  const credentials = btoa(`${user}:${pass}`);
  return fetch(url, {
    headers: { Accept: 'application/json', Authorization: `Basic ${credentials}` },
  });
}
