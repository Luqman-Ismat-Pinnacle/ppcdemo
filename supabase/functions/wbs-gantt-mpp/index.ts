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

        // 1. Get all projects (no filtering - done on website)
        console.log('[wbs-gantt-mpp] Fetching all projects...');
        const { data: mppProjects, error: projectsError } = await supabase
            .from('projects')
            .select('*')
            .order('name', { ascending: true });

        if (projectsError) throw projectsError;

        if (!mppProjects || mppProjects.length === 0) {
            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'No projects found',
                    projects: [],
                    totalProjects: 0
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[wbs-gantt-mpp] Found ${mppProjects.length} projects`);

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

        // 3. Get MPP project structure (phases, units, tasks)
        const mppProjectIds = mppProjects.map(p => p.id);
        
        const { data: phases, error: phasesError } = await supabase
            .from('phases')
            .select('*')
            .in('project_id', mppProjectIds)
            .order('name', { ascending: true });

        if (phasesError) throw phasesError;

        const { data: units, error: unitsError } = await supabase
            .from('units')
            .select('*')
            .in('project_id', mppProjectIds)
            .order('name', { ascending: true });

        if (unitsError) throw unitsError;

        const { data: tasks, error: tasksError } = await supabase
            .from('tasks')
            .select('*')
            .in('project_id', mppProjectIds)
            .order('name', { ascending: true });

        if (tasksError) throw tasksError;

        console.log(`[wbs-gantt-mpp] Found ${phases.length} phases, ${units.length} units and ${tasks.length} tasks`);

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
        console.log('[wbs-gantt-mpp] Building WBS hierarchy from MPP data...');
        
        const projectsWithWBS = mppProjects.map(project => {
            // Find mapping for this project
            const mapping = projectMappings.find(m => m.mpp_project_id === project.id);
            const workdayProjectId = mapping?.workday_project_id;

            // Get MPP structure for this project
            const projectPhases = phases.filter(p => p.project_id === project.id);
            const projectUnits = units.filter(u => u.project_id === project.id);
            const projectTasks = tasks.filter(t => t.project_id === project.id);

            // Build WBS hierarchy like MPP parser does
            const wbsItems = [];
            
            // Add phases (level 1)
            projectPhases.forEach(phase => {
                wbsItems.push({
                    id: `wbs-${phase.id}`,
                    name: phase.name,
                    wbsCode: phase.phaseId || phase.id,
                    level: 1,
                    type: 'phase',
                    startDate: phase.startDate,
                    endDate: phase.endDate,
                    percentComplete: phase.percentComplete || 0,
                    plannedHours: phase.baselineHours || 0,
                    actualHours: phase.actualHours || 0,
                    remainingHours: phase.remainingHours || 0,
                    isCritical: phase.isCritical || false,
                    parent: null,
                    children: [],
                    projectId: project.id,
                    employeeId: phase.employeeId || null
                });
            });

            // Add units (level 2) 
            projectUnits.forEach(unit => {
                const parentPhase = projectPhases.find(p => p.id === unit.phaseId);
                wbsItems.push({
                    id: `wbs-${unit.id}`,
                    name: unit.name,
                    wbsCode: unit.unitId || unit.id,
                    level: 2,
                    type: 'unit',
                    startDate: unit.startDate,
                    endDate: unit.endDate,
                    percentComplete: unit.percentComplete || 0,
                    plannedHours: unit.baselineHours || 0,
                    actualHours: unit.actualHours || 0,
                    remainingHours: unit.remainingHours || 0,
                    isCritical: unit.isCritical || false,
                    parent: parentPhase ? `wbs-${parentPhase.id}` : null,
                    children: [],
                    projectId: project.id,
                    employeeId: unit.employeeId || null
                });
            });

            // Add tasks (level 3+)
            projectTasks.forEach(task => {
                const parentUnit = projectUnits.find(u => u.id === task.unitId);
                const parentPhase = projectPhases.find(p => p.id === task.phaseId);
                const parent = parentUnit ? `wbs-${parentUnit.id}` : (parentPhase ? `wbs-${parentPhase.id}` : null);
                
                wbsItems.push({
                    id: `wbs-${task.id}`,
                    name: task.taskName || task.name,
                    wbsCode: task.taskId || task.id,
                    level: parentUnit ? 3 : 2,
                    type: 'task',
                    startDate: task.startDate,
                    endDate: task.endDate,
                    percentComplete: task.percentComplete || 0,
                    plannedHours: task.baselineHours || 0,
                    actualHours: task.actualHours || 0,
                    remainingHours: task.remainingHours || 0,
                    isCritical: task.isCritical || false,
                    parent: parent,
                    children: [],
                    projectId: project.id,
                    employeeId: task.assignedResource ? null : null,
                    assignedResource: task.assignedResource || ''
                });
            });

            // Build parent-child relationships
            const itemMap = new Map(wbsItems.map(item => [item.id, item]));
            wbsItems.forEach(item => {
                if (item.parent && itemMap.has(item.parent)) {
                    const parent = itemMap.get(item.parent);
                    parent.children.push(item);
                }
            });

            // Get root items (no parent)
            const rootItems = wbsItems.filter(item => !item.parent);

            // Add Workday cost data if mapped
            let totalActualCost = 0;
            let totalActualHours = 0;
            
            if (workdayProjectId && hourEntries.length > 0) {
                const projectHours = hourEntries.filter(h => h.project_id === workdayProjectId);
                totalActualHours = projectHours.reduce((sum, h) => sum + (h.hours || 0), 0);
                totalActualCost = projectHours.reduce((sum, h) => sum + (h.cost || 0), 0);
            }

            return {
                id: project.id,
                name: project.name,
                projectId: project.id,
                workdayProjectId: workdayProjectId,
                hierarchy: rootItems,
                allItems: wbsItems,
                stats: {
                    totalPhases: projectPhases.length,
                    totalUnits: projectUnits.length,
                    totalTasks: projectTasks.length,
                    totalPlannedHours: projectPhases.reduce((sum, p) => sum + (p.baselineHours || 0), 0),
                    totalActualHours: totalActualHours,
                    totalActualCost: totalActualCost
                }
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
