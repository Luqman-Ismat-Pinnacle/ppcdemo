
// Workday Hours & Cost Sync Edge Function
// Enhanced to extract both hours and cost actuals from Project Labor Transactions
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// URL Configuration
const REPORT_BASE_URL = 'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Project_Labor_Transactions';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: safe string extraction
const safeString = (val: any): string => (val || '').toString().trim();

// Helper: ID cleaner (matches workday-projects logic)
const cleanProjectId = (rawId: string): string => {
    // Remove (Inactive) suffix and trim - matches workday-projects logic exactly
    // e.g. "2373_200 (Inactive)" -> "2373_200"
    // e.g. "2803" -> "2803"
    if (!rawId) return '';
    return rawId.replace(/\s*\(Inactive\)\s*$/i, '').trim().substring(0, 50);
};

// Helper: Slug generator for IDs
const generateSlug = (text: string): string => {
    return text.replace(/[^A-Za-z0-9]/g, '').substring(0, 20);
};

// Helper: YYYY-MM-DD for Postgres DATE (match Azure)
const toDateOnly = (val: any): string | null => {
    if (val == null) return null;
    if (typeof val === 'string') {
        const part = val.split('T')[0].split(' ')[0].trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(part)) return part;
        const d = new Date(val);
        if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    if (val instanceof Date && !Number.isNaN(val.getTime())) return val.toISOString().split('T')[0];
    return null;
};

serve(async (req) => {
    console.log('[workday-hours] === Function Started ===');

    // Memory Check
    const memBefore = Deno.memoryUsage();
    console.log(`[workday-hours] Memory usage (Start): ${Math.round(memBefore.rss / 1024 / 1024)}MB RSS`);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // 1. Setup & Auth
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const workdayUser = Deno.env.get('WORKDAY_ISU_USER');
        const workdayPass = Deno.env.get('WORKDAY_ISU_PASS');

        if (!workdayUser || !workdayPass) {
            throw new Error('Workday credentials missing');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 2. Prepare URL & Date Range
        // Accept optional startDate/endDate from body (ISO YYYY-MM-DD) for chunked/streaming sync.
        // Default: rolling 30-day window. Mapping stays identical.
        let body: { startDate?: string; endDate?: string } = {};
        try {
            if (req.body) body = await req.json();
        } catch (_) { /* ignore */ }
        const endDate = body.endDate ? new Date(body.endDate) : new Date();
        const startDate = body.startDate ? new Date(body.startDate) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
            throw new Error('Invalid startDate/endDate; use ISO YYYY-MM-DD');
        }

        const formatDate = (date: Date) => date.toISOString().split('T')[0] + '-08:00';

        const params = new URLSearchParams({
            'Projects_and_Project_Hierarchies!WID': '94cffcd386281001f21ecbc0ba820001!3cc34283d5c31000b9685df9ccce0001!74988a42b1d71000bb0ee8b8b70c0000!74988a42b1d71000bad6bfeceb310001!74988a42b1d71000babc7d9ad9b50001!8114d1e7d6281001755179b2ecba0000!74988a42b1d71000b9565eb994d30000!74988a42b1d71000b928197b465e0001!8114d1e7d62810017551774c04d00000!74988a42b1d71000b90309e92b680001!6e4362224aa81000ca8f84a39b6a0001!74988a42b1d71000b8ee4094ed830001!82a1fc685dda1000c6c99bc7562b0000!6c3abbb4fb20100174cf1f0f36850000!e0c093bd0ece100165ff337f9cdd0000!5821192f86da1000c64cf77badb50001!2a5ee02cc70210015501fde7aa720001!2a5ee02cc702100154f3887562a20001!60cb012a3c2a100169b86b0bb3d20001!761afa109c8910017615a972157b0000!761afa109c8910017615a83d85680000!761afa109c8910017615a7094cce0000!761afa109c8910017615a53aeb070000!761afa109c8910017615a4050c3c0000!761afa109c8910017615a235a48a0000!3cc34283d5c31000ba1e365ffde80001',
            'Include_Subordinate_Project_Hierarchies': '1',
            'Currency_Rate_Type!WID': '44e3d909d76b0127e940e8b41011293b',
            'Reporting_Currency!WID': '9e996ffdd3e14da0ba7275d5400bafd4',
            'Start_Date': formatDate(startDate),
            'End_Date': formatDate(endDate),
            'format': 'json'
        });

        const fullUrl = `${REPORT_BASE_URL}?${params.toString()}`;
        console.log(`[workday-hours] Fetching URL: ${fullUrl}`);

        // 3. Fetch Data
        const credentials = btoa(`${workdayUser}:${workdayPass}`);
        const response = await fetch(fullUrl, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`Workday API Error: ${response.status} - ${txt}`);
        }

        const data = await response.json();
        const records = data.Report_Entry || [];
        console.log(`[workday-hours] Fetched ${records.length} records`);

        // 4. Processing & Deduplication
        // We need to upsert: Projects, Employees, Phases, Tasks (Skeletons) -> then Hour Entries.
        // We use Maps to deduplicate before sending to DB.

        const projectsToUpsert = new Map();
        const employeesToUpsert = new Map();
        const phasesToUpsert = new Map();
        const tasksToUpsert = new Map();
        const hoursToUpsert = new Map();

        // Check existing IDs to minimize upserts if needed, 
        // but "upsert" is safe. However, to save DB calls, we might want to check.
        // For now, we will rely on upsert onConflict='id'.

        for (const r of records) {
            // A. Extract & Clean IDs
            const rawProjectId = safeString(r.Project_ID);
            if (!rawProjectId) continue;

            const projectId = cleanProjectId(rawProjectId);
            const employeeId = safeString(r.Employee_ID);
            // Workday ID is the unique key for the hour entry
            const workdayId = safeString(r.workdayID || r.referenceID);

            if (!projectId || !employeeId || !workdayId) continue;

            const rawPhaseName = safeString(r.Phase) || 'General Phase';
            const rawTaskName = safeString(r.Task) || 'General Task';
            const rawProjectName = safeString(r.Project_Name) || projectId;
            const workerName = safeString(r.Worker);

            // B. Construct Hierarchy IDs (Standardized logic)
            // Phase ID: PHS_{ProjectID}_{Slug}
            const phaseSlug = generateSlug(rawPhaseName);
            const phaseId = `PHS_${projectId}_${phaseSlug}`.substring(0, 50);

            // Task ID: TSK_{ProjectID}_{PhaseSlug}_{TaskSlug}
            const taskSlug = generateSlug(rawTaskName);
            const taskId = `TSK_${projectId}_${phaseSlug}_${taskSlug}`.substring(0, 50);

            // C. Prepare Skeletons

            // 1. Project
            if (!projectsToUpsert.has(projectId)) {
                projectsToUpsert.set(projectId, {
                    id: projectId,
                    project_id: projectId,
                    name: rawProjectName,
                    is_active: true,
                    updated_at: new Date().toISOString()
                });
            }

            // 2. Employee - Track for reference but DO NOT upsert
            // The full employee data is synced by workday-employees function
            // We only track employee IDs here for statistics
            if (!employeesToUpsert.has(employeeId)) {
                employeesToUpsert.set(employeeId, {
                    id: employeeId,
                    employee_id: employeeId,
                    name: workerName
                    // NOTE: We don't upsert employees here anymore to avoid overwriting
                    // full employee data (job_title, email, department, etc.) with skeleton data
                });
            }

            // 3. Phase
            if (!phasesToUpsert.has(phaseId)) {
                phasesToUpsert.set(phaseId, {
                    id: phaseId,
                    phase_id: phaseId,
                    project_id: projectId,
                    name: rawPhaseName,
                    is_active: true,
                    updated_at: new Date().toISOString()
                });
            }

            // 4. Task - Use a simpler approach: create a task for each project/phase combination
            // Use a composite key to avoid duplicate tasks
            const taskKey = `${projectId}_${phaseId}`;
            let finalTaskId = taskId;
            
            if (!tasksToUpsert.has(taskKey)) {
                tasksToUpsert.set(taskKey, {
                    id: taskId,
                    task_id: taskId,
                    project_id: projectId,
                    phase_id: phaseId,
                    name: rawTaskName
                });
            } else {
                // Use existing task ID
                finalTaskId = tasksToUpsert.get(taskKey).id;
            }

            // D. Prepare Hour Entry with Cost Data (date as YYYY-MM-DD to match Azure)
            const hoursVal = parseFloat(r.Hours || '0');
            const dateOnly = toDateOnly(r.Transaction_Date ?? r.transaction_date ?? r.Date ?? r.date);
            if (!dateOnly) continue;
            const description = safeString(r.Time_Type) || safeString(r.Billable_Transaction);
            
            // Cost fields from Project Labor Transactions
            const billableRate = parseFloat(r.Billable_Rate || '0');
            const billableAmount = parseFloat(r.Billable_Amount || '0');
            const standardCostRate = parseFloat(r.Standard_Cost_Rate || '0');
            const standardCostAmt = parseFloat(r.Reported_Standard_Cost_Amt || '0');
            const reportedStandard22 = parseFloat(r.Reported_Standard_22 || '0'); // Alternative cost field
            
            // Use the most reliable cost amount (prefer standard cost amount, fallback to calculated)
            const actualCost = standardCostAmt || (hoursVal * standardCostRate) || (hoursVal * reportedStandard22) || 0;
            const actualRevenue = billableAmount || (hoursVal * billableRate) || 0;

            if (!hoursToUpsert.has(workdayId)) {
                hoursToUpsert.set(workdayId, {
                    id: workdayId,
                    entry_id: workdayId,
                    employee_id: employeeId,
                    project_id: projectId,
                    date: dateOnly,
                    hours: hoursVal,
                    description: description.substring(0, 500), // Truncate if too long
                    // Workday phase/task names for matching to MPP tasks
                    workday_phase: rawPhaseName,
                    workday_task: rawTaskName,
                    // Enhanced cost fields; reported_standard_cost_amt = Workday Reported_Standard_Cost_Amt for matching
                    billable_rate: billableRate,
                    billable_amount: billableAmount,
                    standard_cost_rate: standardCostRate,
                    reported_standard_cost_amt: standardCostAmt,
                    actual_cost: actualCost,
                    actual_revenue: actualRevenue,
                    // Additional billing status fields
                    customer_billing_status: safeString(r.Customer_Billing_Status),
                    invoice_number: safeString(r.Invoice_Number),
                    invoice_status: safeString(r.Invoice_Status),
                    charge_type: safeString(r.Charge_Type)
                });
            }
        }

        // 5. Batch Upsert Helper
        const upsertBatch = async (table: string, items: any[]) => {
            if (items.length === 0) return;
            const BATCH_SIZE = 500;
            console.log(`[workday-hours] Upserting ${items.length} to ${table}...`);

            for (let i = 0; i < items.length; i += BATCH_SIZE) {
                const batch = items.slice(i, i + BATCH_SIZE);
                const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
                if (error) {
                    console.error(`[workday-hours] Error upserting to ${table}:`, error.message);
                    // We continue processing other batches unless it's critical
                }
            }
        };

        // 6. Execute Upserts (Order matters for FKs)
        // NOTE: Employees/projects must exist (run workday-employees + workday-projects first). We only upsert phases, tasks, hour_entries.
        // Upsert phases and tasks first (match Azure order), then hour_entries
        await upsertBatch('phases', Array.from(phasesToUpsert.values()));
        await upsertBatch('tasks', Array.from(tasksToUpsert.values()));
        await upsertBatch('hour_entries', Array.from(hoursToUpsert.values()));

        // 7. Finish
        const memAfter = Deno.memoryUsage();
        console.log(`[workday-hours] Memory usage (End): ${Math.round(memAfter.rss / 1024 / 1024)}MB RSS`);

        return new Response(
            JSON.stringify({
                success: true,
                stats: {
                    fetched: records.length,
                    projects: projectsToUpsert.size,
                    employees: employeesToUpsert.size,
                    phases: phasesToUpsert.size,
                    tasks: tasksToUpsert.size,
                    hours: hoursToUpsert.size
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[workday-hours] Fatal Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
