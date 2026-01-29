// Enhanced WBS Gantt - Only shows projects with MPP mappings
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    console.log('[wbs-gantt-enhanced] === Enhanced WBS Gantt Started ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Get all project mappings (MPP to Workday)
        console.log('[wbs-gantt-enhanced] Fetching project mappings...');
        const { data: projectMappings, error: mappingsError } = await supabase
            .from('project_mappings')
            .select('*')
            .eq('deleted', false);

        if (mappingsError) throw mappingsError;

        if (!projectMappings || projectMappings.length === 0) {
            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'No MPP-Workday project mappings found',
                    projects: [],
                    totalMappings: 0
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[wbs-gantt-enhanced] Found ${projectMappings.length} project mappings`);

        // 2. Get all MPP projects that have mappings
        const mppProjectIds = projectMappings.map(m => m.mpp_project_id).filter(Boolean);
        const workdayProjectIds = projectMappings.map(m => m.workday_project_id).filter(Boolean);

        // 3. Get MPP project data
        const { data: mppProjects, error: mppError } = await supabase
            .from('projects')
            .select('*')
            .in('id', mppProjectIds);

        if (mppError) throw mppError;

        // 4. Get Workday project data
        const { data: workdayProjects, error: workdayError } = await supabase
            .from('portfolios')
            .select('*')
            .in('id', workdayProjectIds);

        if (workdayError) throw workdayError;

        // 5. Get phases and tasks for mapped MPP projects
        const { data: mppPhases, error: phasesError } = await supabase
            .from('phases')
            .select('*')
            .in('project_id', mppProjectIds);

        const { data: mppTasks, error: tasksError } = await supabase
            .from('tasks')
            .select('*')
            .in('project_id', mppProjectIds);

        if (phasesError) throw phasesError;
        if (tasksError) throw tasksError;

        // 6. Get Workday actuals for mapped projects
        const { data: workdayHours, error: hoursError } = await supabase
            .from('hour_entries')
            .select('*')
            .in('project_id', workdayProjectIds)
            .order('date', { ascending: true });

        if (hoursError) throw hoursError;

        // 7. Aggregate Workday actuals by project and task
        const workdayActualsByProject = new Map();
        
        workdayHours?.forEach(hour => {
            const projectId = hour.project_id;
            if (!workdayActualsByProject.has(projectId)) {
                workdayActualsByProject.set(projectId, new Map());
            }
            
            const projectActuals = workdayActualsByProject.get(projectId);
            const key = hour.task_id || hour.phase_id || 'unassigned';
            if (!projectActuals.has(key)) {
                projectActuals.set(key, {
                    totalHours: 0,
                    totalCost: 0,
                    totalRevenue: 0,
                    entries: []
                });
            }
            
            const actual = projectActuals.get(key);
            actual.totalHours += hour.hours || 0;
            actual.totalCost += hour.actual_cost || 0;
            actual.totalRevenue += hour.actual_revenue || 0;
            actual.entries.push(hour);
        });

        // 8. Build combined project data
        const combinedProjects = projectMappings.map(mapping => {
            const mppProject = mppProjects?.find(p => p.id === mapping.mpp_project_id);
            const workdayProject = workdayProjects?.find(p => p.id === mapping.workday_project_id);
            const workdayActuals = workdayActualsByProject.get(mapping.workday_project_id) || new Map();

            // Get phases and tasks for this MPP project
            const projectPhases = mppPhases?.filter(p => p.project_id === mapping.mpp_project_id) || [];
            const projectTasks = mppTasks?.filter(t => t.project_id === mapping.mpp_project_id) || [];

            // Combine phases with actuals
            const combinedPhases = projectPhases.map(phase => {
                const actuals = workdayActuals.get(phase.id) || { totalHours: 0, totalCost: 0, totalRevenue: 0, entries: [] };
                
                return {
                    ...phase,
                    actualHours: actuals.totalHours,
                    actualCost: actuals.totalCost,
                    actualRevenue: actuals.totalRevenue,
                    remainingHours: Math.max(0, (phase.planned_hours || 0) - actuals.totalHours),
                    remainingCost: Math.max(0, (phase.planned_cost || 0) - actuals.totalCost),
                    variance: (phase.planned_cost || 0) - actuals.totalCost,
                    progress: phase.planned_hours > 0 ? (actuals.totalHours / phase.planned_hours) * 100 : 0
                };
            });

            // Combine tasks with actuals
            const combinedTasks = projectTasks.map(task => {
                const actuals = workdayActuals.get(task.id) || { totalHours: 0, totalCost: 0, totalRevenue: 0, entries: [] };
                
                return {
                    ...task,
                    actualHours: actuals.totalHours,
                    actualCost: actuals.totalCost,
                    actualRevenue: actuals.totalRevenue,
                    remainingHours: Math.max(0, (task.planned_hours || 0) - actuals.totalHours),
                    remainingCost: Math.max(0, (task.planned_cost || 0) - actuals.totalCost),
                    variance: (task.planned_cost || 0) - actuals.totalCost,
                    progress: task.planned_hours > 0 ? (actuals.totalHours / task.planned_hours) * 100 : 0
                };
            });

            // Calculate project totals
            const totalActualHours = combinedPhases.reduce((sum, p) => sum + (p.actualHours || 0), 0);
            const totalActualCost = combinedPhases.reduce((sum, p) => sum + (p.actualCost || 0), 0);
            const totalActualRevenue = combinedPhases.reduce((sum, p) => sum + (p.actualRevenue || 0), 0);
            const totalPlannedHours = combinedPhases.reduce((sum, p) => sum + (p.planned_hours || 0), 0);
            const totalPlannedCost = combinedPhases.reduce((sum, p) => sum + (p.planned_cost || 0), 0);

            return {
                mapping: {
                    id: mapping.id,
                    mppProjectId: mapping.mpp_project_id,
                    workdayProjectId: mapping.workday_project_id,
                    createdAt: mapping.created_at
                },
                mppProject: {
                    ...mppProject,
                    plannedHours: totalPlannedHours,
                    plannedCost: totalPlannedCost
                },
                workdayProject: workdayProject,
                actuals: {
                    totalHours: totalActualHours,
                    totalCost: totalActualCost,
                    totalRevenue: totalActualRevenue,
                    remainingHours: Math.max(0, totalPlannedHours - totalActualHours),
                    remainingCost: Math.max(0, totalPlannedCost - totalActualCost),
                    variance: totalPlannedCost - totalActualCost,
                    progress: totalPlannedHours > 0 ? (totalActualHours / totalPlannedHours) * 100 : 0
                },
                phases: combinedPhases,
                tasks: combinedTasks
            };
        });

        console.log(`[wbs-gantt-enhanced] Processed ${combinedProjects.length} mapped projects`);

        return new Response(
            JSON.stringify({
                success: true,
                projects: combinedProjects,
                summary: {
                    totalMappings: projectMappings.length,
                    totalMppProjects: mppProjects?.length || 0,
                    totalWorkdayProjects: workdayProjects?.length || 0,
                    totalPhases: mppPhases?.length || 0,
                    totalTasks: mppTasks?.length || 0,
                    totalHours: workdayHours?.length || 0
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[wbs-gantt-enhanced] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
