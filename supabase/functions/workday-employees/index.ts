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

    // Log sample record structure - show ALL keys for debugging
    if (records.length > 0) {
      const allKeys = Object.keys(records[0]);
      console.log('[workday-employees] Sample record ALL keys (' + allKeys.length + '):', allKeys);
      console.log('[workday-employees] Sample record VALUES:', JSON.stringify(records[0]).substring(0, 1000));
    }

    // Map Workday fields to database schema
    // IMPORTANT: Workday API field names vary - check logs above to see actual field names
    const cleanedRecords: any[] = [];
    const errors: string[] = [];
    const fieldStats = {
      hasName: 0,
      hasEmail: 0,
      hasJobTitle: 0,
      hasManagementLevel: 0,
      hasManager: 0,
      hasEmployeeType: 0,
      hasRole: 0,
      hasDepartment: 0,
    };

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      try {
        // Get Employee ID - this is required
        // Try multiple possible field names
        const employeeId = r.Employee_ID || r.employee_id || r.employeeId || r.ID || r.Worker_ID || r.worker_id;
        if (!employeeId) {
          errors.push(`Record ${i}: No Employee_ID (keys: ${Object.keys(r).join(', ')})`);
          continue;
        }

        // Build name from available fields - try many variations
        let name = r.Worker || r.Name || r.name || r.Full_Name || r.full_name || '';
        if (!name && (r.firstName || r.First_Name || r.first_name) && (r.lastName || r.Last_Name || r.last_name)) {
          const firstName = r.firstName || r.First_Name || r.first_name || '';
          const lastName = r.lastName || r.Last_Name || r.last_name || '';
          name = `${firstName} ${lastName}`;
        }
        if (!name && (r.firstName || r.First_Name || r.first_name)) {
          name = r.firstName || r.First_Name || r.first_name;
        }
        if (!name) {
          name = `Employee ${employeeId}`;
        }
        if (name && name !== `Employee ${employeeId}`) fieldStats.hasName++;

        // Email - try multiple field names
        const email = r.Work_Email || r.work_email || r.Email || r.email || 
                      r.Primary_Work_Email || r.primary_work_email || null;
        if (email) fieldStats.hasEmail++;

        // Job Title - try multiple field names
        const jobTitle = r.businessTitle || r.Business_Title || r.business_title ||
                         r.Default_Job_Title || r.default_job_title || 
                         r.Job_Profile_Name || r.job_profile_name ||
                         r.Job_Title || r.job_title || r.Position_Title || null;
        if (jobTitle) fieldStats.hasJobTitle++;

        // Management Level
        const managementLevel = r.Management_Level || r.management_level || 
                                r.ManagementLevel || r.Manager_Level || null;
        if (managementLevel) fieldStats.hasManagementLevel++;

        // Manager
        const manager = r.Worker_s_Manager || r.Workers_Manager || r["Worker's Manager"] ||
                        r.Manager || r.manager || r.Manager_Name || r.manager_name || null;
        if (manager) fieldStats.hasManager++;

        // Employee Type
        const employeeType = r.Employee_Type || r.employee_type || r.EmployeeType ||
                             r.Worker_Type || r.worker_type || null;
        if (employeeType) fieldStats.hasEmployeeType++;

        // Role/Job Profile
        const role = r.Job_Profile || r.job_profile || r.JobProfile ||
                     r.Role || r.role || r.Roles || r.roles || null;
        if (role) fieldStats.hasRole++;

        // Department/Cost Center
        const department = r.Cost_Center || r.cost_center || r.CostCenter ||
                           r.Department || r.department || r.Org_Unit || null;
        if (department) fieldStats.hasDepartment++;

        // Determine active status
        const activeStatus = r.Active_Status || r.active_status || r.ActiveStatus || r.Status;
        const terminationDate = r.termination_date || r.Termination_Date || r.TerminationDate;
        const isActive =
          activeStatus === '1' ||
          activeStatus === 1 ||
          activeStatus === true ||
          activeStatus === 'Active' ||
          activeStatus === 'active' ||
          r.is_active === true ||
          (activeStatus !== '0' && activeStatus !== 0 && activeStatus !== 'Inactive' && !terminationDate);

        cleanedRecords.push({
          id: employeeId,
          employee_id: employeeId,
          name: name.trim(),
          email: email,
          job_title: jobTitle,
          management_level: managementLevel,
          manager: manager,
          employee_type: employeeType,
          role: role,
          department: department,
          is_active: isActive,
        });
      } catch (mapErr) {
        errors.push(`Record ${i}: ${String(mapErr)}`);
      }
    }

    // Log field statistics to help debug what data is being received
    console.log('[workday-employees] Field statistics:', JSON.stringify(fieldStats));

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

    // NOTE: Portfolio creation removed to avoid duplicates
    // Portfolios are now created only by workday-projects function

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
        // Portfolio creation logic removed - portfolios handled by workday-projects function
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
          `Portfolio creation disabled - handled by workday-projects function.`,
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
