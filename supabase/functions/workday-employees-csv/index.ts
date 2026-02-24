// Workday Employees CSV Sync Edge Function
// Fetches employee data from Workday CSV report and syncs to Supabase `employees`
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Use CSV format of the same RPT_-_Employees report
const WORKDAY_EMPLOYEES_CSV_URL =
  'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Employees?Include_Terminated_Workers=1&format=csv';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Minimal CSV parser that handles quoted fields and header row
function parseCsvWithHeader(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      current.push(field);
      field = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (field !== '' || current.length > 0) {
        current.push(field);
        rows.push(current);
        current = [];
        field = '';
      }
      if (ch === '\r' && next === '\n') i++;
    } else {
      field += ch;
    }
  }
  if (field !== '' || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((v) => !v || !v.trim())) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (row[idx] ?? '').trim();
    });
    out.push(obj);
  }
  return out;
}

serve(async (req) => {
  console.log('[workday-employees-csv] === Function Started ===');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const workdayUser = Deno.env.get('WORKDAY_ISU_USER');
    const workdayPass = Deno.env.get('WORKDAY_ISU_PASS');

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Supabase not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!workdayUser || !workdayPass) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Workday credentials not configured. Set WORKDAY_ISU_USER and WORKDAY_ISU_PASS secrets.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[workday-employees-csv] Fetching CSV from Workday...');
    console.log(
      '[workday-employees-csv] URL:',
      WORKDAY_EMPLOYEES_CSV_URL.substring(0, 80) + '...',
    );

    const credentials = btoa(`${workdayUser}:${workdayPass}`);
    const res = await fetch(WORKDAY_EMPLOYEES_CSV_URL, {
      headers: {
        Accept: 'text/csv',
        Authorization: `Basic ${credentials}`,
      },
    });

    console.log('[workday-employees-csv] Workday response status:', res.status);

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unable to read error');
      console.error(
        '[workday-employees-csv] Workday API error:',
        res.status,
        errorText.substring(0, 200),
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: `Workday API returned ${res.status}`,
          details: errorText.substring(0, 200),
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const csvText = await res.text();
    console.log('[workday-employees-csv] CSV size:', csvText.length, 'bytes');

    // Parse CSV with header row into array of objects
    const records = parseCsvWithHeader(csvText);

    console.log('[workday-employees-csv] Parsed', records.length, 'rows from CSV');

    if (records.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          summary: { synced: 0, total: 0 },
          message: 'CSV contained no records',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const cleaned: any[] = [];
    for (let i = 0; i < records.length; i++) {
      const r = records[i];

      const employeeId = (r['Employee_ID'] || r['employee_id'] || '').trim();
      if (!employeeId) {
        continue;
      }

      const firstName = (r['firstName'] || '').trim();
      const lastName = (r['lastName'] || '').trim();
      let name = (r['Worker'] || '').trim();
      if (!name) {
        name = `${firstName} ${lastName}`.trim();
      }
      if (!name) {
        name = `Employee ${employeeId}`;
      }

      const jobTitle =
        (r['businessTitle'] || '').trim() ||
        (r['Default_Job_Title'] || '').trim() ||
        (r['Job_Profile_Name'] || '').trim() ||
        null;

      const managementLevel = (r['Management_Level'] || '').trim() || null;
      const manager = (r['Worker_s_Manager'] || '').trim() || null;
      const employeeType = (r['Employee_Type'] || '').trim() || null;
      const role =
        (r['Job_Profile'] || '').trim() || (r['Job_Profile_Name'] || '').trim() || null;
      const department =
        (r['Cost_Center'] || '').trim() || (r['Company_-_ID'] || '').trim() || null;

      const seniorManager = (r['Sr_Project_Manager'] || '').trim() || null;
      const timeInJobProfile = (r['Time_in_Job_Profile'] || '').trim() || null;
      const employeeCustomer =
        (r['customerOnEmpProfile'] || '').trim() || (r['Client'] || '').trim() || null;
      const employeeSite =
        (r['siteOnEmpProfile'] || '').trim() || (r['location'] || '').trim() || null;
      const employeeProjects = (r['projectNumberOnEmpProfile'] || '').trim() || null;

      const email = (r['Work_Email'] || '').trim() || null;
      const activeStatus = (r['Active_Status'] || '').trim();
      const terminationDate = (r['termination_date'] || '').trim();
      const isActive =
        activeStatus === '1' ||
        activeStatus === 'Active' ||
        (!activeStatus && !terminationDate);

      cleaned.push({
        id: employeeId,
        employee_id: employeeId,
        name,
        email,
        job_title: jobTitle,
        management_level: managementLevel,
        manager,
        employee_type: employeeType,
        role,
        department,
        senior_manager: seniorManager,
        time_in_job_profile: timeInJobProfile,
        employee_customer: employeeCustomer,
        employee_site: employeeSite,
        employee_projects: employeeProjects,
        is_active: isActive,
      });
    }

    console.log('[workday-employees-csv] Cleaned records:', cleaned.length);

    if (!cleaned.length) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No valid employee rows after CSV mapping',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Upsert to Supabase in batches
    const BATCH_SIZE = 100;
    let totalSynced = 0;
    const dbErrors: string[] = [];

    for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
      const batch = cleaned.slice(i, i + BATCH_SIZE);
      console.log(
        `[workday-employees-csv] Upserting batch ${
          Math.floor(i / BATCH_SIZE) + 1
        }/${Math.ceil(cleaned.length / BATCH_SIZE)}`,
      );

      const { data, error } = await supabase
        .from('employees')
        .upsert(batch, { onConflict: 'id' })
        .select('id');

      if (error) {
        console.error('[workday-employees-csv] DB error:', error.message);
        dbErrors.push(error.message);
      } else {
        totalSynced += data?.length || 0;
      }
    }

    console.log('[workday-employees-csv] === Complete ===');
    console.log('[workday-employees-csv] Synced:', totalSynced, '/', cleaned.length);

    return new Response(
      JSON.stringify({
        success: dbErrors.length === 0,
        summary: {
          synced: totalSynced,
          total: records.length,
          valid: cleaned.length,
          errors: dbErrors.length,
        },
        dbErrors: dbErrors.length ? dbErrors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[workday-employees-csv] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

