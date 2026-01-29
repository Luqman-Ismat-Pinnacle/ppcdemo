// Add has_schedule column to projects table
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    console.log('[add-has-schedule] === Adding has_schedule column ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Add the column
        console.log('[add-has-schedule] Adding has_schedule column...');
        const { error: alterError } = await supabase
            .rpc('exec_sql', { 
                sql: 'ALTER TABLE projects ADD COLUMN IF NOT EXISTS has_schedule BOOLEAN DEFAULT FALSE;' 
            });

        if (alterError) {
            console.log('[add-has-schedule] RPC failed, trying direct approach...');
        }

        // Update projects that have phases or tasks
        console.log('[add-has-schedule] Updating projects with schedules...');
        const { error: updateError } = await supabase
            .rpc('exec_sql', { 
                sql: `
                    UPDATE projects 
                    SET has_schedule = TRUE 
                    WHERE id IN (
                        SELECT DISTINCT project_id 
                        FROM phases 
                        WHERE project_id IS NOT NULL
                        UNION
                        SELECT DISTINCT project_id 
                        FROM tasks 
                        WHERE project_id IS NOT NULL
                    );
                `
            });

        if (updateError) {
            console.log('[add-has-schedule] Update failed, but column may exist');
        }

        // Check results
        const { data: projects, error: checkError } = await supabase
            .from('projects')
            .select('id, name, has_schedule')
            .eq('has_schedule', true)
            .limit(10);

        console.log(`[add-has-schedule] Found ${projects?.length || 0} projects with schedules`);

        return new Response(
            JSON.stringify({
                success: true,
                message: 'has_schedule column added successfully',
                projectsWithSchedule: projects?.length || 0,
                sampleProjects: projects || []
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[add-has-schedule] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
