// Workday Employees Sync Edge Function
// Fetches employee data from Workday API and syncs to Supabase
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Hardcoded Workday API URL for employees
const WORKDAY_EMPLOYEES_URL = 'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Employees?Include_Terminated_Workers=1&format=json';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('[workday-employees] === Function Started ===');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const workdayUser = Deno.env.get('WORKDAY_ISU_USER');
    const workdayPass = Deno.env.get('WORKDAY_ISU_PASS');

    console.log('[workday-employees] Config check:');
    console.log('  - Supabase URL:', supabaseUrl ? 'OK' : 'MISSING');
    console.log('  - Supabase Key:', supabaseKey ? 'OK' : 'MISSING');
    console.log('  - Workday User:', workdayUser ? 'OK' : 'MISSING');
    console.log('  - Workday Pass:', workdayPass ? 'OK' : 'MISSING');

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Supabase not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!workdayUser || !workdayPass) {
      return new Response(
        JSON.stringify({ success: false, error: 'Workday credentials not configured. Set WORKDAY_ISU_USER and WORKDAY_ISU_PASS secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch from Workday API
    console.log('[workday-employees] Fetching from Workday...');
    console.log('[workday-employees] URL:', WORKDAY_EMPLOYEES_URL.substring(0, 80) + '...');

    const credentials = btoa(`${workdayUser}:${workdayPass}`);
    const workdayResponse = await fetch(WORKDAY_EMPLOYEES_URL, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
    });

    console.log('[workday-employees] Workday response status:', workdayResponse.status);

    if (!workdayResponse.ok) {
      const errorText = await workdayResponse.text().catch(() => 'Unable to read error');
      console.error('[workday-employees] Workday API error:', workdayResponse.status, errorText.substring(0, 200));
      return new Response(
        JSON.stringify({
          success: false,
          error: `Workday API returned ${workdayResponse.status}`,
          details: errorText.substring(0, 200),
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const responseText = await workdayResponse.text();
    console.log('[workday-employees] Response size:', responseText.length, 'bytes');

    let workdayData: any;
    try {
      workdayData = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('[workday-employees] JSON parse error:', parseErr);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to parse Workday response as JSON' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find the records array in the response
    let records: any[] = [];
    if (Array.isArray(workdayData)) {
      records = workdayData;
    } else if (workdayData.Report_Entry && Array.isArray(workdayData.Report_Entry)) {
      records = workdayData.Report_Entry;
    } else {
      // Try to find any array in the response
      for (const key of Object.keys(workdayData)) {
        if (Array.isArray(workdayData[key]) && workdayData[key].length > 0) {
          console.log('[workday-employees] Found records in key:', key);
          records = workdayData[key];
          break;
        }
      }
    }

    console.log('[workday-employees] Found', records.length, 'records');

    if (records.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          summary: { synced: 0, total: 0 },
          message: 'No employee records in Workday response',
          responseKeys: Object.keys(workdayData),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log sample record structure
    if (records.length > 0) {
      console.log('[workday-employees] Sample record keys:', Object.keys(records[0]).slice(0, 10));
    }

    // Map Workday fields to database schema
    const cleanedRecords: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      try {
        // Get Employee ID - this is required
        const employeeId = r.Employee_ID || r.employee_id || r.employeeId || r.ID;
        if (!employeeId) {
          errors.push(`Record ${i}: No Employee_ID`);
          continue;
        }

        // Build name from available fields
        let name = r.Worker || '';
        if (!name && r.firstName && r.lastName) {
          name = `${r.firstName} ${r.lastName}`;
        }
        if (!name && r.firstName) {
          name = r.firstName;
        }
        if (!name) {
          name = `Employee ${employeeId}`;
        }

        // Determine active status
        const isActive =
          r.Active_Status === '1' ||
          r.Active_Status === 1 ||
          r.Active_Status === true ||
          r.is_active === true ||
          (r.Active_Status !== '0' && r.Active_Status !== 0 && !r.termination_date);

        cleanedRecords.push({
          id: employeeId,
          employee_id: employeeId,
          name: name.trim(),
          email: r.Work_Email || r.work_email || r.email || null,
          job_title: r.businessTitle || r.Default_Job_Title || r.Job_Profile_Name || r.job_title || null,
          management_level: r.Management_Level || r.management_level || null,
          manager: r.Worker_s_Manager || r.manager || null,
          employee_type: r.Employee_Type || r.employee_type || null,
          role: r.Job_Profile || r.role || null,
          department: r.Cost_Center || r.department || null,
          is_active: isActive,
        });
      } catch (mapErr) {
        errors.push(`Record ${i}: ${String(mapErr)}`);
      }
    }

    console.log('[workday-employees] Mapped', cleanedRecords.length, 'valid records');
    if (errors.length > 0) {
      console.log('[workday-employees] Mapping errors:', errors.slice(0, 5));
    }

    if (cleanedRecords.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No valid employee records after mapping',
          mappingErrors: errors.slice(0, 10),
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upsert in batches to avoid timeout
    const BATCH_SIZE = 100;
    let totalSynced = 0;
    const dbErrors: string[] = [];

    // Track Senior Managers for Portfolio creation
    const portfoliosToUpsert: any[] = [];

    for (let i = 0; i < cleanedRecords.length; i += BATCH_SIZE) {
      const batch = cleanedRecords.slice(i, i + BATCH_SIZE);
      console.log(`[workday-employees] Upserting batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(cleanedRecords.length / BATCH_SIZE)}`);

      const { data, error } = await supabase
        .from('employees')
        .upsert(batch, { onConflict: 'id' })
        .select('id, name, management_level, job_title');

      if (error) {
        console.error('[workday-employees] DB error:', error.message);
        dbErrors.push(error.message);
      } else {
        totalSynced += data?.length || 0;

        // Identify Senior Managers in this batch and prepare Portfolios
        (data || []).forEach((emp: any) => {
          const title = (emp.job_title || '').toLowerCase();
          const level = (emp.management_level || '').toLowerCase();

          // Check for "Senior Manager" in title or level
          // Adjust criteria as needed based on actual data
          // Added 'sr. manager' and 'director' for broader coverage if needed
          if (
            title.includes('senior manager') ||
            title.includes('sr. manager') ||
            level.includes('senior manager') ||
            level.includes('sr. manager')
          ) {
            const portfolioId = `PRF_${emp.id}`;
            console.log(`[workday-employees] Creating/Syncing Portfolio for Senior Manager: ${emp.name} (${portfolioId})`);

            portfoliosToUpsert.push({
              // Use a deterministic ID for the portfolio so we don't duplicate on re-runs
              id: portfolioId, // Use standard PRF_ prefix
              portfolio_id: portfolioId, // Sync portfolio_id too
              name: `${emp.name}'s Portfolio`, // Default name "Name's Portfolio"
              employee_id: emp.id,
              manager: emp.name, // Map to manager
              description: `Portfolio for ${emp.name} (${emp.job_title})`,
              is_active: true,
              updated_at: new Date().toISOString()
            });
          }
        });
      }
    }

    // Upsert Portfolios
    if (portfoliosToUpsert.length > 0) {
      console.log(`[workday-employees] Creating/Updating ${portfoliosToUpsert.length} Portfolios for Senior Managers...`);
      const { error: portfolioError } = await supabase
        .from('portfolios')
        .upsert(portfoliosToUpsert, { onConflict: 'id' });

      if (portfolioError) {
        console.error('[workday-employees] Portfolio creation error:', portfolioError.message);
        dbErrors.push(`Portfolio Error: ${portfolioError.message}`);
      } else {
        console.log('[workday-employees] Portfolios synced successfully.');
      }
    }

    console.log('[workday-employees] === Complete ===');
    console.log('[workday-employees] Synced:', totalSynced, '/', cleanedRecords.length);

    return new Response(
      JSON.stringify({
        success: dbErrors.length === 0,
        summary: {
          synced: totalSynced,
          total: records.length,
          valid: cleanedRecords.length,
          errors: dbErrors.length,
        },
        logs: [
          `Fetched ${records.length} records.`,
          `Mapped ${cleanedRecords.length} valid employees.`,
          `Identified ${portfoliosToUpsert.length} Senior Managers for Portfolio creation.`,
          ...dbErrors
        ],
        dbErrors: dbErrors.length > 0 ? dbErrors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[workday-employees] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
