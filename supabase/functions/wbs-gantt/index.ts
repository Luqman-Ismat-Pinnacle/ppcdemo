// WBS Gantt integration - combines MPP structure with Workday actuals
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    console.log('[wbs-gantt] === WBS Gantt Integration Started ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { mppProjectId, workdayProjectId } = await req.json();
        
        if (!mppProjectId) {
            throw new Error('MPP Project ID is required');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Get MPP project structure (phases and tasks)
        console.log('[wbs-gantt] Fetching MPP project structure...');
        const { data: mppPhases, error: phasesError } = await supabase
            .from('phases')
            .select('*')
            .eq('project_id', mppProjectId);

        const { data: mppTasks, error: tasksError } = await supabase
            .from('tasks')
            .select('*')
            .eq('project_id', mppProjectId);

        if (phasesError) throw phasesError;
        if (tasksError) throw tasksError;

        // 2. Get Workday actuals for the specified project
        console.log('[wbs-gantt] Fetching Workday actuals...');
        const workdayProjectIdToUse = workdayProjectId || mppProjectId;
        
        const { data: workdayHours, error: hoursError } = await supabase
            .from('hour_entries')
            .select('*')
            .eq('project_id', workdayProjectIdToUse)
            .order('date', { ascending: true });

        if (hoursError) throw hoursError;

        // 3. Aggregate Workday actuals by task/phase
        const workdayActuals = new Map();
        
        workdayHours?.forEach(hour => {
            const key = hour.task_id || hour.phase_id || 'unassigned';
            if (!workdayActuals.has(key)) {
                workdayActuals.set(key, {
                    totalHours: 0,
                    totalCost: 0,
                    totalRevenue: 0,
                    entries: []
                });
            }
            
            const actual = workdayActuals.get(key);
            actual.totalHours += hour.hours || 0;
            actual.totalCost += hour.actual_cost || 0;
            actual.totalRevenue += hour.actual_revenue || 0;
            actual.entries.push(hour);
        });

        // 4. Combine MPP structure with Workday actuals
        console.log('[wbs-gantt] Combining MPP structure with Workday actuals...');
        
        const combinedPhases = mppPhases?.map(phase => {
            const phaseActuals = workdayActuals.get(phase.id) || {
                totalHours: 0,
                totalCost: 0,
                totalRevenue: 0,
                entries: []
            };

            return {
                ...phase,
                // Keep MPP fields
                baseline_hours: phase.baseline_hours || 0,
                actual_hours: phaseActuals.totalHours,
                remaining_hours: Math.max(0, (phase.baseline_hours || 0) - phaseActuals.totalHours),
                baseline_cost: phase.baseline_cost || 0,
                actual_cost: phaseActuals.totalCost,
                remaining_cost: Math.max(0, (phase.baseline_cost || 0) - phaseActuals.totalCost),
                // Workday actuals data
                workday_actuals: phaseActuals,
                // Dates from MPP
                start_date: phase.start_date,
                end_date: phase.end_date,
                baseline_start_date: phase.baseline_start_date,
                baseline_end_date: phase.baseline_end_date,
                actual_start_date: phase.actual_start_date,
                actual_end_date: phase.actual_end_date
            };
        }) || [];

        const combinedTasks = mppTasks?.map(task => {
            const taskActuals = workdayActuals.get(task.id) || {
                totalHours: 0,
                totalCost: 0,
                totalRevenue: 0,
                entries: []
            };

            return {
                ...task,
                // Keep MPP fields
                baseline_hours: task.baseline_hours || 0,
                actual_hours: taskActuals.totalHours,
                remaining_hours: Math.max(0, (task.baseline_hours || 0) - taskActuals.totalHours),
                baseline_cost: task.baseline_cost || 0,
                actual_cost: taskActuals.totalCost,
                remaining_cost: Math.max(0, (task.baseline_cost || 0) - taskActuals.totalCost),
                // Workday actuals data
                workday_actuals: taskActuals,
                // Dates from MPP
                start_date: task.start_date,
                end_date: task.end_date,
                baseline_start_date: task.baseline_start_date,
                baseline_end_date: task.baseline_end_date,
                actual_start_date: task.actual_start_date,
                actual_end_date: task.actual_end_date
            };
        }) || [];

        // 5. Get project info
        const { data: projectInfo, error: projectError } = await supabase
            .from('projects')
            .select('*')
            .eq('id', mppProjectId)
            .single();

        if (projectError) throw projectError;

        const projectActuals = workdayActuals.get(mppProjectId) || {
            totalHours: 0,
            totalCost: 0,
            totalRevenue: 0,
            entries: []
        };

        const combinedProject = {
            ...projectInfo,
            baseline_hours: projectInfo.baseline_hours || 0,
            actual_hours: projectActuals.totalHours,
            remaining_hours: Math.max(0, (projectInfo.baseline_hours || 0) - projectActuals.totalHours),
            baseline_cost: projectInfo.baseline_cost || 0,
            actual_cost: projectActuals.totalCost,
            remaining_cost: Math.max(0, (projectInfo.baseline_cost || 0) - projectActuals.totalCost),
            workday_actuals: projectActuals
        };

        return new Response(
            JSON.stringify({
                success: true,
                data: {
                    project: combinedProject,
                    phases: combinedPhases,
                    tasks: combinedTasks,
                    workday_summary: {
                        total_hours: Array.from(workdayActuals.values()).reduce((sum, a) => sum + a.totalHours, 0),
                        total_cost: Array.from(workdayActuals.values()).reduce((sum, a) => sum + a.totalCost, 0),
                        total_revenue: Array.from(workdayActuals.values()).reduce((sum, a) => sum + a.totalRevenue, 0),
                        entries_count: workdayHours?.length || 0
                    }
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[wbs-gantt] Fatal Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
