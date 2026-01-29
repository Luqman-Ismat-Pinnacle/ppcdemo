// Project mapping management for MPP to Workday project linking
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    console.log('[project-mapping] === Project Mapping Management ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { action, mppProjectId, workdayProjectId } = await req.json();
        
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        if (action === 'get-available-projects') {
            // Get all MPP projects and Workday projects for dropdown selection
            const { data: mppProjects } = await supabase
                .from('projects')
                .select('id, name, project_id')
                .like('id', 'PRJ_MPP_%')
                .order('name');

            const { data: workdayProjects } = await supabase
                .from('projects')
                .select('id, name, project_id')
                .not('id', 'like', 'PRJ_MPP_%')
                .order('name');

            return new Response(
                JSON.stringify({
                    success: true,
                    data: {
                        mpp_projects: mppProjects || [],
                        workday_projects: workdayProjects || []
                    }
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (action === 'get-mappings') {
            // Get all existing project mappings
            const { data: mappings, error } = await supabase
                .from('project_mappings')
                .select(`
                    id,
                    mpp_project_id,
                    workday_project_id,
                    is_active,
                    created_at,
                    updated_at,
                    mpp_project:projects!mpp_project_id(id, name),
                    workday_project:projects!workday_project_id(id, name)
                `)
                .eq('is_active', true);

            if (error) throw error;

            return new Response(
                JSON.stringify({
                    success: true,
                    data: mappings || []
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (action === 'create-mapping') {
            if (!mppProjectId || !workdayProjectId) {
                throw new Error('Both MPP and Workday project IDs are required');
            }

            // Create new project mapping
            const { data: mapping, error } = await supabase
                .from('project_mappings')
                .insert({
                    mpp_project_id: mppProjectId,
                    workday_project_id: workdayProjectId,
                    is_active: true
                })
                .select(`
                    id,
                    mpp_project_id,
                    workday_project_id,
                    is_active,
                    created_at,
                    updated_at,
                    mpp_project:projects!mpp_project_id(id, name),
                    workday_project:projects!workday_project_id(id, name)
                `)
                .single();

            if (error) throw error;

            return new Response(
                JSON.stringify({
                    success: true,
                    data: mapping
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (action === 'delete-mapping') {
            const { mappingId } = await req.json();
            
            if (!mappingId) {
                throw new Error('Mapping ID is required');
            }

            // Soft delete mapping
            const { error } = await supabase
                .from('project_mappings')
                .update({ is_active: false })
                .eq('id', mappingId);

            if (error) throw error;

            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'Mapping deleted successfully'
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        throw new Error('Invalid action specified');

    } catch (error: any) {
        console.error('[project-mapping] Fatal Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
