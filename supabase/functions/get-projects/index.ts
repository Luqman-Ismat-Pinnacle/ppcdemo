// Get Available Projects for Dropdown Selection
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    console.log('[get-projects] === Get Available Projects Started ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get ALL projects (not filtered by has_schedule)
        console.log('[get-projects] Fetching all projects...');
        const { data: projects, error: projectsError } = await supabase
            .from('projects')
            .select('*')
            .order('name', { ascending: true });

        if (projectsError) throw projectsError;

        // Get hour entries to determine which projects have activity
        const { data: hourEntries, error: hoursError } = await supabase
            .from('hour_entries')
            .select('project_id, hours, actual_cost, actual_revenue');

        if (hoursError) throw hoursError;

        // Get portfolios for reference
        const { data: portfolios, error: portfoliosError } = await supabase
            .from('portfolios')
            .select('id, name')
            .order('name', { ascending: true });

        if (portfoliosError) throw portfoliosError;

        // Calculate project activity metrics
        const projectActivity = new Map();
        
        hourEntries?.forEach(entry => {
            const projectId = entry.project_id;
            if (!projectActivity.has(projectId)) {
                projectActivity.set(projectId, {
                    totalHours: 0,
                    totalCost: 0,
                    totalRevenue: 0,
                    entryCount: 0
                });
            }
            
            const activity = projectActivity.get(projectId);
            activity.totalHours += entry.hours || 0;
            activity.totalCost += entry.actual_cost || 0;
            activity.totalRevenue += entry.actual_revenue || 0;
            activity.entryCount += 1;
        });

        // Transform projects for dropdown
        const availableProjects = projects?.map(project => {
            const activity = projectActivity.get(project.id);
            const hasActivity = activity && activity.entryCount > 0;
            
            return {
                id: project.id,
                name: project.name,
                secondary: hasActivity 
                    ? `${activity.totalHours.toFixed(1)}h, $${activity.totalCost.toLocaleString()}`
                    : 'No activity data',
                metadata: {
                    plannedHours: project.planned_hours,
                    plannedCost: project.planned_cost,
                    actualHours: activity?.totalHours || 0,
                    actualCost: activity?.totalCost || 0,
                    hasActivity
                }
            };
        }) || [];

        // Transform portfolios for dropdown
        const availablePortfolios = portfolios?.map(portfolio => ({
            id: portfolio.id,
            name: portfolio.name,
            secondary: 'Portfolio',
            metadata: {
                type: 'portfolio'
            }
        })) || [];

        console.log(`[get-projects] Found ${availableProjects.length} projects and ${availablePortfolios.length} portfolios`);

        return new Response(
            JSON.stringify({
                success: true,
                projects: availableProjects,
                portfolios: availablePortfolios,
                summary: {
                    totalProjects: availableProjects.length,
                    activeProjects: availableProjects.filter(p => p.metadata.hasActivity).length,
                    totalPortfolios: availablePortfolios.length
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[get-projects] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
