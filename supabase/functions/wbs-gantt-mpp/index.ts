// MPP-Driven WBS Gantt - Only shows projects with MPP files
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    console.log('[wbs-gantt-mpp] === MPP-Driven WBS Gantt Started ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Get all MPP projects (these are projects uploaded from MPP files)
        console.log('[wbs-gantt-mpp] Fetching MPP projects...');
        const { data: mppProjects, error: mppError } = await supabase
            .from('projects')
            .select('*')
            .order('name', { ascending: true });

        if (mppError) throw mppError;

        if (!mppProjects || mppProjects.length === 0) {
            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'No MPP projects found',
                    projects: [],
                    totalProjects: 0
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[wbs-gantt-mpp] Found ${mppProjects.length} MPP projects`);

        // 2. Try to get project mappings (if table exists)
        let projectMappings = [];
        try {
            const { data: mappings, error: mappingsError } = await supabase
                .from('project_mappings')
                .select('*')
                .eq('deleted', false);
            
            if (!mappingsError && mappings) {
                projectMappings = mappings;
                console.log(`[wbs-gantt-mpp] Found ${projectMappings.length} project mappings`);
            }
        } catch (error) {
            console.log('[wbs-gantt-mpp] Project mappings table not found, proceeding without mappings');
        }

        // 3. Get MPP project structure (phases and tasks)
        const mppProjectIds = mppProjects.map(p => p.id);
        
        const { data: phases, error: phasesError } = await supabase
            .from('phases')
            .select('*')
            .in('project_id', mppProjectIds)
            .order('name', { ascending: true });

        if (phasesError) throw phasesError;

        const { data: tasks, error: tasksError } = await supabase
            .from('tasks')
            .select('*')
            .in('project_id', mppProjectIds)
            .order('name', { ascending: true });

        if (tasksError) throw tasksError;

        console.log(`[wbs-gantt-mpp] Found ${phases.length} phases and ${tasks.length} tasks`);

        // 4. Get Workday data for projects that have mappings
        const workdayProjectIds = projectMappings
            .map(m => m.workday_project_id)
            .filter(Boolean);

        let hourEntries = [];
        if (workdayProjectIds.length > 0) {
            const { data: hours, error: hoursError } = await supabase
                .from('hour_entries')
                .select('*')
                .in('project_id', workdayProjectIds);

            if (!hoursError && hours) {
                hourEntries = hours;
                console.log(`[wbs-gantt-mpp] Found ${hourEntries.length} hour entries`);
            }
        }

        // 5. Build the WBS structure (MPP-driven)
        const projectsWithWBS = mppProjects.map(project => {
            // Find mapping for this project
            const mapping = projectMappings.find(m => m.mpp_project_id === project.id);
            const workdayProjectId = mapping?.workday_project_id;

            // Get MPP structure
            const projectPhases = phases.filter(p => p.project_id === project.id);
            const projectTasks = tasks.filter(t => t.project_id === project.id);

            // Get Workday actuals (if mapped)
            const projectHours = workdayProjectId 
                ? hourEntries.filter(h => h.project_id === workdayProjectId)
                : [];

            // Calculate actuals from Workday data
            const totalActualHours = projectHours.reduce((sum, h) => sum + (h.hours || 0), 0);
            const totalActualCost = projectHours.reduce((sum, h) => sum + (h.actual_cost || 0), 0);

            // Build WBS tree
            const wbsPhases = projectPhases.map(phase => {
                const phaseTasks = projectTasks.filter(t => t.phase_id === phase.id);
                const phaseActualHours = phaseTasks.reduce((sum, task) => {
                    const taskHours = projectHours.filter(h => h.task_id === task.id);
                    return sum + taskHours.reduce((s, h) => s + (h.hours || 0), 0);
                }, 0);

                return {
                    id: phase.id,
                    name: phase.name,
                    type: 'phase',
                    planned_hours: phase.planned_hours || 0,
                    planned_cost: phase.planned_cost || 0,
                    actual_hours: phaseActualHours,
                    actual_cost: phaseActualHours * 65, // Approximate hourly rate
                    progress: phase.planned_hours > 0 ? (phaseActualHours / phase.planned_hours) * 100 : 0,
                    tasks: phaseTasks.map(task => {
                        const taskHours = projectHours.filter(h => h.task_id === task.id);
                        const taskActualHours = taskHours.reduce((s, h) => s + (h.hours || 0), 0);
                        
                        return {
                            id: task.id,
                            name: task.name,
                            type: 'task',
                            planned_hours: task.planned_hours || 0,
                            planned_cost: task.planned_cost || 0,
                            actual_hours: taskActualHours,
                            actual_cost: taskActualHours * 65,
                            progress: task.planned_hours > 0 ? (taskActualHours / task.planned_hours) * 100 : 0,
                            start_date: task.start_date,
                            end_date: task.end_date,
                            assigned_resource: task.assigned_resource
                        };
                    })
                };
            });

            return {
                id: project.id,
                name: project.name,
                type: 'project',
                workday_project_id: workdayProjectId,
                has_workday_mapping: !!workdayProjectId,
                planned_hours: project.planned_hours || 0,
                planned_cost: project.planned_cost || 0,
                actual_hours: totalActualHours,
                actual_cost: totalActualCost,
                progress: project.planned_hours > 0 ? (totalActualHours / project.planned_hours) * 100 : 0,
                phases: wbsPhases,
                total_phases: wbsPhases.length,
                total_tasks: wbsPhases.reduce((sum, p) => sum + p.tasks.length, 0)
            };
        });

        console.log(`[wbs-gantt-mpp] Built WBS for ${projectsWithWBS.length} projects`);

        return new Response(
            JSON.stringify({
                success: true,
                projects: projectsWithWBS,
                summary: {
                    totalProjects: projectsWithWBS.length,
                    projectsWithMappings: projectsWithWBS.filter(p => p.has_workday_mapping).length,
                    totalPhases: projectsWithWBS.reduce((sum, p) => sum + p.total_phases, 0),
                    totalTasks: projectsWithWBS.reduce((sum, p) => sum + p.total_tasks, 0),
                    totalActualHours: projectsWithWBS.reduce((sum, p) => sum + p.actual_hours, 0),
                    totalActualCost: projectsWithWBS.reduce((sum, p) => sum + p.actual_cost, 0)
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[wbs-gantt-mpp] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
