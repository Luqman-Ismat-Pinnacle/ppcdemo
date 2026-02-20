/**
 * Workday sync – single place for all URLs and configuration.
 * All Workday report URLs are included below (can be overridden via env vars).
 * DevOps: set environment variables in Azure Function App settings (or local.settings.json).
 */

module.exports = {
  // ---------------------------------------------------------------------------
  // Workday API (Basic auth)
  // ---------------------------------------------------------------------------
  workday: {
    user: process.env.WORKDAY_ISU_USER || '',
    pass: process.env.WORKDAY_ISU_PASS || '',
    baseUrl: process.env.WORKDAY_BASE_URL || 'https://services1.myworkday.com',
  },

  // Employees report (ISU_PowerBI_HCM)
  urls: {
    employees:
      process.env.WORKDAY_EMPLOYEES_URL ||
      'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Employees?Include_Terminated_Workers=1&format=json',

    findProjects:
      process.env.WORKDAY_FIND_PROJECTS_URL ||
      'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Find_Projects_-_Pinnacle?Projects_and_Project_Hierarchies%21WID=6c3abbb4fb20100174cf1f0f36850000&Include_Subordinate_Project_Hierarchies=1&Billable=0&Capital=0&Inactive=0&Status%21WID=8114d1e7d62810016e8dbc4118e60000!8114d1e7d62810016e8dbba72b880000!758d94cc846601c5404e6ab4e2135430!8114d1e7d62810016e8dbb0d64800000!874d109880b8100105bee5e42fde0000!8114d1e7d62810016e8dbba72b880001&format=json',

    integration:
      process.env.WORKDAY_INTEGRATION_URL ||
      'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/mandie.burnett/RPT_-_View_Project_Plan_-_Integration?Include_Subordinate_Project_Hierarchies=1&Projects_and_Project_Hierarchies%21WID=6c3abbb4fb20100174cf1f0f36850000&format=json',

    hoursBase:
      process.env.WORKDAY_HOURS_BASE_URL ||
      'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Project_Labor_Transactions',
    hoursQueryWid:
      process.env.WORKDAY_HOURS_QUERY_WID ||
      '94cffcd386281001f21ecbc0ba820001!3cc34283d5c31000b9685df9ccce0001!74988a42b1d71000bb0ee8b8b70c0001!74988a42b1d71000bad6bfeceb310001!74988a42b1d71000babc7d9ad9b50001!8114d1e7d6281001755179b2ecba0000!74988a42b1d71000b9565eb994d30000!74988a42b1d71000b928197b465e0001!74988a42b1d71000b90309e92b680001!6e4362224aa81000ca8f84a39b6a0001!74988a42b1d71000b8ee4094ed830001!82a1fc685dda1000c6c99bc7562b0000!6c3abbb4fb20100174cf1f0f36850000!e0c093bd0ece100165ff337f9cdd0000!5821192f86da1000c64cf77badb50001!2a5ee02cc70210015501fde7aa720001!2a5ee02cc702100154f3887562a20001!60cb012a3c2a100169b86b0bb3d20001!761afa109c8910017615a972157b0000!761afa109c8910017615a83d85680000!761afa109c8910017615a7094cce0000!761afa109c8910017615a53aeb070000!761afa109c8910017615a4050c3c0000!761afa109c8910017615a235a48a0000!3cc34283d5c31000ba1e365ffde80001',
    currencyRateTypeWid: process.env.WORKDAY_CURRENCY_RATE_TYPE_WID || '44e3d909d76b0127e940e8b41011293b',
    reportingCurrencyWid: process.env.WORKDAY_REPORTING_CURRENCY_WID || '9e996ffdd3e14da0ba7275d5400bafd4',

    customerContracts:
      process.env.WORKDAY_CUSTOMER_CONTRACTS_URL ||
      'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/mandie.burnett/RPT_-_Find_Customer_Contract_Lines_-_Revenue?New_Business=0&Renewable=0&format=json',
  },

  // ---------------------------------------------------------------------------
  // Azure Postgres
  // ---------------------------------------------------------------------------
  postgres: {
    connectionString: process.env.POSTGRES_CONNECTION_STRING || process.env.AZURE_POSTGRES_CONNECTION_STRING || '',
  },

  // ---------------------------------------------------------------------------
  // Sync options
  // ---------------------------------------------------------------------------
  sync: {
    hoursDaysBack: Math.min(730, Math.max(1, parseInt(process.env.WORKDAY_HOURS_DAYS_BACK || '7', 10))),
    windowDays: parseInt(process.env.WORKDAY_HOURS_WINDOW_DAYS || '7', 10),
    batchSize: 100,
    hoursBatchSize: 500,
  },
};
