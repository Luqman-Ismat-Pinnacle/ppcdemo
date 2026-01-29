// Debug version of workday-hours function
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const REPORT_BASE_URL = 'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Project_Labor_Transactions';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const safeString = (val: any): string => (val || '').toString().trim();
const cleanProjectId = (rawId: string): string => {
    if (!rawId) return '';
    return rawId.split('-')[0].trim().substring(0, 50);
};
const generateSlug = (text: string): string => {
    return text.replace(/[^A-Za-z0-9]/g, '').substring(0, 20);
};

serve(async (req) => {
    console.log('[workday-hours-debug] === Debug Started ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const workdayUser = Deno.env.get('WORKDAY_ISU_USER');
        const workdayPass = Deno.env.get('WORKDAY_ISU_PASS');

        if (!workdayUser || !workdayPass) {
            throw new Error('Workday credentials missing');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Test with just 3 records to debug
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 7);

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
        console.log(`[workday-hours-debug] Fetching: ${fullUrl}`);

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
        console.log(`[workday-hours-debug] Fetched ${records.length} records`);

        // Process just first 3 records for debugging
        const debugRecords = records.slice(0, 3);
        const debugResults = [];

        for (const r of debugRecords) {
            const rawProjectId = safeString(r.Project_ID);
            const projectId = cleanProjectId(rawProjectId);
            const employeeId = safeString(r.Employee_ID);
            const workdayId = safeString(r.workdayID || r.referenceID);

            if (!projectId || !employeeId || !workdayId) {
                debugResults.push({ error: 'Missing required IDs', data: r });
                continue;
            }

            const rawPhaseName = safeString(r.Phase) || 'General Phase';
            const rawTaskName = safeString(r.Task) || 'General Task';
            const rawProjectName = safeString(r.Project_Name) || projectId;
            const workerName = safeString(r.Worker);

            const phaseSlug = generateSlug(rawPhaseName);
            const phaseId = `PHS_${projectId}_${phaseSlug}`.substring(0, 50);
            const taskSlug = generateSlug(rawTaskName);
            const taskId = `TSK_${projectId}_${phaseSlug}_${taskSlug}`.substring(0, 50);

            // Check if these IDs exist in the database
            const { data: empCheck } = await supabase.from('employees').select('id').eq('id', employeeId).single();
            const { data: projCheck } = await supabase.from('projects').select('id').eq('id', projectId).single();
            const { data: phaseCheck } = await supabase.from('phases').select('id').eq('id', phaseId).single();
            const { data: taskCheck } = await supabase.from('tasks').select('id').eq('id', taskId).single();

            const debugInfo = {
                workdayData: {
                    projectId: rawProjectId,
                    employeeId: employeeId,
                    phaseName: rawPhaseName,
                    taskName: rawTaskName,
                    projectName: rawProjectName,
                    workerName: workerName
                },
                generatedIds: {
                    projectId: projectId,
                    phaseId: phaseId,
                    taskId: taskId
                },
                dbChecks: {
                    employee: !!empCheck,
                    project: !!projCheck,
                    phase: !!phaseCheck,
                    task: !!taskCheck
                }
            };

            debugResults.push(debugInfo);
        }

        return new Response(
            JSON.stringify({
                success: true,
                debug: debugResults,
                totalRecords: records.length
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[workday-hours-debug] Fatal Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
