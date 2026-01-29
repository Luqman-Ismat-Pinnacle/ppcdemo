// Enhanced debug to see what's happening in the upsert process
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    console.log('[workday-debug-upsert] === Debug Upsert Started ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Test direct upsert with a single hour entry
        const testHourEntry = {
            id: 'debug-hour-' + Date.now(),
            entry_id: 'debug-hour-' + Date.now(),
            employee_id: 'ID009340', // Known existing employee
            project_id: '30121',     // Known existing project  
            phase_id: 'PHS_30121_14d', // Generated phase ID
            task_id: 'TSK_30121_14d_Debug', // Generated task ID
            date: '2026-01-29',
            hours: 3.0,
            description: 'Debug hour entry with cost',
            billable_rate: 150.0,
            actual_cost: 120.0,
            actual_revenue: 150.0
        };

        console.log('[workday-debug-upsert] Testing hour entry upsert...');
        console.log('[workday-debug-upsert] Entry data:', testHourEntry);

        // First, try to create the phase and task if they don't exist
        const { data: phaseResult, error: phaseError } = await supabase
            .from('phases')
            .upsert({
                id: 'PHS_30121_14d',
                phase_id: 'PHS_30121_14d',
                project_id: '30121',
                name: '14d',
                is_active: true,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' })
            .select();

        console.log('[workday-debug-upsert] Phase upsert:', { phaseResult, phaseError });

        const { data: taskResult, error: taskError } = await supabase
            .from('tasks')
            .upsert({
                id: 'TSK_30121_14d_Debug',
                task_id: 'TSK_30121_14d_Debug',
                project_id: '30121',
                phase_id: 'PHS_30121_14d',
                name: 'Debug Task',
                is_active: true,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' })
            .select();

        console.log('[workday-debug-upsert] Task upsert:', { taskResult, taskError });

        // Now try the hour entry upsert
        const { data: hourResult, error: hourError } = await supabase
            .from('hour_entries')
            .upsert(testHourEntry, { onConflict: 'id' })
            .select();

        console.log('[workday-debug-upsert] Hour upsert:', { hourResult, hourError });

        // Test with a batch upsert like the real function
        console.log('[workday-debug-upsert] Testing batch upsert...');
        const batchEntries = [
            {
                id: 'debug-batch-1-' + Date.now(),
                entry_id: 'debug-batch-1-' + Date.now(),
                employee_id: 'ID009340',
                project_id: '30121',
                phase_id: 'PHS_30121_14d',
                task_id: 'TSK_30121_14d_Debug',
                date: '2026-01-28',
                hours: 4.0,
                description: 'Batch entry 1',
                actual_cost: 100.0,
                actual_revenue: 120.0
            },
            {
                id: 'debug-batch-2-' + Date.now(),
                entry_id: 'debug-batch-2-' + Date.now(),
                employee_id: 'ID009340',
                project_id: '30121',
                phase_id: 'PHS_30121_14d',
                task_id: 'TSK_30121_14d_Debug',
                date: '2026-01-27',
                hours: 2.0,
                description: 'Batch entry 2',
                actual_cost: 50.0,
                actual_revenue: 60.0
            }
        ];

        const { data: batchResult, error: batchError } = await supabase
            .from('hour_entries')
            .upsert(batchEntries, { onConflict: 'id' })
            .select();

        console.log('[workday-debug-upsert] Batch upsert:', { batchResult, batchError });

        return new Response(
            JSON.stringify({
                success: true,
                results: {
                    phaseUpsert: { data: phaseResult, error: phaseError },
                    taskUpsert: { data: taskResult, error: taskError },
                    hourUpsert: { data: hourResult, error: hourError },
                    batchUpsert: { data: batchResult, error: batchError }
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[workday-debug-upsert] Fatal Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
