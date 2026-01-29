// Test function to verify hour_entries table functionality
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    console.log('[test-hour-entries] === Test Started ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Test 1: Check table structure
        console.log('[test-hour-entries] Checking table structure...');
        const { data: columns, error: columnsError } = await supabase
            .rpc('get_table_columns', { table_name: 'hour_entries' });
        
        if (columnsError) {
            console.log('[test-hour-entries] Columns error:', columnsError);
        } else {
            console.log('[test-hour-entries] Table columns:', columns);
        }

        // Test 2: Try to insert a simple test record
        console.log('[test-hour-entries] Testing simple insert...');
        
        // First get a valid employee and project
        const { data: employees } = await supabase.from('employees').select('id').limit(1);
        const { data: projects } = await supabase.from('projects').select('id').limit(1);
        const { data: phases } = await supabase.from('phases').select('id').limit(1);
        const { data: tasks } = await supabase.from('tasks').select('id').limit(1);
        
        const validEmployeeId = employees?.[0]?.id || 'ID009340';
        const validProjectId = projects?.[0]?.id || '30121';
        const validPhaseId = phases?.[0]?.id || 'PHS_30121_ProjectMonitoring';
        const validTaskId = tasks?.[0]?.id || 'TSK_30121_ProjectMonitoring_General';
        
        const testRecord = {
            id: 'test-record-' + Date.now(),
            entry_id: 'test-entry-' + Date.now(),
            employee_id: validEmployeeId,
            project_id: validProjectId,
            phase_id: validPhaseId,
            task_id: validTaskId,
            date: new Date().toISOString().split('T')[0],
            hours: 1.0,
            description: 'Test record'
        };

        const { data: insertData, error: insertError } = await supabase
            .from('hour_entries')
            .insert(testRecord)
            .select();

        console.log('[test-hour-entries] Insert result:', { insertData, insertError });

        // Test 3: Try to insert with cost fields
        console.log('[test-hour-entries] Testing insert with cost fields...');
        const testRecordWithCost = {
            id: 'test-record-cost-' + Date.now(),
            entry_id: 'test-entry-cost-' + Date.now(),
            employee_id: validEmployeeId,
            project_id: validProjectId,
            phase_id: validPhaseId,
            task_id: validTaskId,
            date: new Date().toISOString().split('T')[0],
            hours: 2.0,
            description: 'Test record with cost',
            billable_rate: 100.0,
            actual_cost: 80.0,
            actual_revenue: 100.0
        };

        const { data: insertCostData, error: insertCostError } = await supabase
            .from('hour_entries')
            .insert(testRecordWithCost)
            .select();

        console.log('[test-hour-entries] Insert with cost result:', { insertCostData, insertCostError });

        // Test 4: Query records
        console.log('[test-hour-entries] Querying records...');
        const { data: records, error: queryError } = await supabase
            .from('hour_entries')
            .select('*')
            .limit(5);

        console.log('[test-hour-entries] Query result:', { records, queryError });

        return new Response(
            JSON.stringify({
                success: true,
                tests: {
                    columns: { data: columns, error: columnsError },
                    simpleInsert: { data: insertData, error: insertError },
                    costInsert: { data: insertCostData, error: insertCostError },
                    query: { data: records, error: queryError }
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[test-hour-entries] Fatal Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
