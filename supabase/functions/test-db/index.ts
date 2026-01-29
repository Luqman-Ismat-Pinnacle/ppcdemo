// Test database connection and check projects table
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    console.log('[test-db] === Testing database connection ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        console.log(`[test-db] URL: ${supabaseUrl}, Key exists: ${!!supabaseKey}`);
        const supabase = createClient(supabaseUrl, supabaseKey);

        console.log('[test-db] Connected to Supabase');

        // Check projects table
        const { data: projects, error: projectsError } = await supabase
            .from('projects')
            .select('id, name')
            .limit(5);

        console.log(`[test-db] Projects query result: ${projects?.length || 0} projects, error: ${projectsError?.message || 'none'}`);

        // Check phases table
        const { data: phases, error: phasesError } = await supabase
            .from('phases')
            .select('id, name, project_id')
            .limit(5);

        console.log(`[test-db] Phases query result: ${phases?.length || 0} phases, error: ${phasesError?.message || 'none'}`);

        // Check tasks table
        const { data: tasks, error: tasksError } = await supabase
            .from('tasks')
            .select('id, name, project_id')
            .limit(5);

        console.log(`[test-db] Tasks query result: ${tasks?.length || 0} tasks, error: ${tasksError?.message || 'none'}`);

        // Check portfolios table
        const { data: portfolios, error: portfoliosError } = await supabase
            .from('portfolios')
            .select('id, name')
            .limit(5);

        console.log(`[test-db] Portfolios query result: ${portfolios?.length || 0} portfolios, error: ${portfoliosError?.message || 'none'}`);

        return new Response(
            JSON.stringify({
                success: true,
                counts: {
                    projects: projects?.length || 0,
                    phases: phases?.length || 0,
                    tasks: tasks?.length || 0,
                    portfolios: portfolios?.length || 0
                },
                sampleData: {
                    projects: projects || [],
                    phases: phases || [],
                    tasks: tasks || [],
                    portfolios: portfolios || []
                },
                errors: {
                    projects: projectsError?.message,
                    phases: phasesError?.message,
                    tasks: tasksError?.message,
                    portfolios: portfoliosError?.message
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[test-db] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
