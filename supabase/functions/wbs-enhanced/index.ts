// Enhanced WBS Gantt - Direct integration without mapping table
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    console.log('[wbs-enhanced] === Enhanced WBS Gantt Integration ===');

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

        // 1. Get MPP project structure
        console.log('[wbs-enhanced] Fetching MPP project structure...');
        const { data: mppProject, error: projectError } = await supabase
            .from('projects')
            .select('*')
            .eq('id', mppProjectId)
            .single();

        const { data: mppPhases, error: phasesError } = await supabase
            .from('phases')
            .select('*')
            .eq('project_id', mppProjectId);

        const { data: mppTasks, error: tasksError } = await supabase
            .from('tasks')
            .select('*')
            .eq('project_id', mppProjectId);

        if (projectError) throw projectError;
        if (phasesError) throw phasesError;
        if (tasksError) throw tasksError;

        // 2. Get Workday actuals
        console.log('[wbs-enhanced] Fetching Workday actuals...');
        const workdayProjectIdToUse = workdayProjectId || mppProjectId;
        
        const { data: workdayHours, error: hoursError } = await supabase
            .from('hour_entries')
            .select('*')
            .eq('project_id', workdayProjectIdToUse);

        if (hoursError) throw hoursError;

        // 3. Aggregate Workday actuals
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

        // 4. Create enhanced WBS structure
        console.log('[wbs-enhanced] Creating enhanced WBS structure...');
        
        const enhancedPhases = (mppPhases || []).map(phase => {
            const phaseActuals = workdayActuals.get(phase.id) || {
                totalHours: 0,
                totalCost: 0,
                totalRevenue: 0,
                entries: []
            };

            return {
                ...phase,
                // MPP baseline data
                baseline_hours: phase.baseline_hours || 0,
                baseline_cost: phase.baseline_cost || 0,
                remaining_hours: Math.max(0, (phase.baseline_hours || 0) - phaseActuals.totalHours),
                remaining_cost: Math.max(0, (phase.baseline_cost || 0) - phaseActuals.totalCost),
                // Workday actuals
                actual_hours: phaseActuals.totalHours,
                actual_cost: phaseActuals.totalCost,
                actual_revenue: phaseActuals.totalRevenue,
                workday_actuals: phaseActuals,
                // Variance analysis
                hours_variance: phaseActuals.totalHours - (phase.baseline_hours || 0),
                cost_variance: phaseActuals.totalCost - (phase.baseline_cost || 0),
                // Performance metrics
                cost_performance_rate: (phase.baseline_cost || 0) > 0 ? phaseActuals.totalCost / (phase.baseline_cost || 0) : null,
                schedule_performance_rate: (phase.baseline_hours || 0) > 0 ? phaseActuals.totalHours / (phase.baseline_hours || 0) : null
            };
        });

        const enhancedTasks = (mppTasks || []).map(task => {
            const taskActuals = workdayActuals.get(task.id) || {
                totalHours: 0,
                totalCost: 0,
                totalRevenue: 0,
                entries: []
            };

            return {
                ...task,
                // MPP baseline data
                baseline_hours: task.baseline_hours || 0,
                baseline_cost: task.baseline_cost || 0,
                remaining_hours: Math.max(0, (task.baseline_hours || 0) - taskActuals.totalHours),
                remaining_cost: Math.max(0, (task.baseline_cost || 0) - taskActuals.totalCost),
                // Workday actuals
                actual_hours: taskActuals.totalHours,
                actual_cost: taskActuals.totalCost,
                actual_revenue: taskActuals.totalRevenue,
                workday_actuals: taskActuals,
                // Variance analysis
                hours_variance: taskActuals.totalHours - (task.baseline_hours || 0),
                cost_variance: taskActuals.totalCost - (task.baseline_cost || 0),
                // Performance metrics
                cost_performance_rate: (task.baseline_cost || 0) > 0 ? taskActuals.totalCost / (task.baseline_cost || 0) : null,
                schedule_performance_rate: (task.baseline_hours || 0) > 0 ? taskActuals.totalHours / (task.baseline_hours || 0) : null,
                // Status based on performance
                performance_status: getPerformanceStatus(taskActuals.totalHours, task.baseline_hours || 0, taskActuals.totalCost, task.baseline_cost || 0)
            };
        });

        // 5. Enhanced project summary
        const projectActuals = workdayActuals.get(mppProjectId) || {
            totalHours: 0,
            totalCost: 0,
            totalRevenue: 0,
            entries: []
        };

        const enhancedProject = {
            ...mppProject,
            // MPP baseline
            baseline_hours: mppProject.baseline_hours || 0,
            baseline_cost: mppProject.baseline_cost || 0,
            // Workday actuals
            actual_hours: projectActuals.totalHours,
            actual_cost: projectActuals.totalCost,
            actual_revenue: projectActuals.totalRevenue,
            // Calculations
            remaining_hours: Math.max(0, (mppProject.baseline_hours || 0) - projectActuals.totalHours),
            remaining_cost: Math.max(0, (mppProject.baseline_cost || 0) - projectActuals.totalCost),
            // Variance
            hours_variance: projectActuals.totalHours - (mppProject.baseline_hours || 0),
            cost_variance: projectActuals.totalCost - (mppProject.baseline_cost || 0),
            // Performance
            cost_performance_rate: (mppProject.baseline_cost || 0) > 0 ? projectActuals.totalCost / (mppProject.baseline_cost || 0) : null,
            schedule_performance_rate: (mppProject.baseline_hours || 0) > 0 ? projectActuals.totalHours / (mppProject.baseline_hours || 0) : null,
            workday_actuals: projectActuals
        };

        return new Response(
            JSON.stringify({
                success: true,
                data: {
                    project: enhancedProject,
                    phases: enhancedPhases,
                    tasks: enhancedTasks,
                    summary: {
                        total_workday_hours: Array.from(workdayActuals.values()).reduce((sum, a) => sum + a.totalHours, 0),
                        total_workday_cost: Array.from(workdayActuals.values()).reduce((sum, a) => sum + a.totalCost, 0),
                        total_workday_revenue: Array.from(workdayActuals.values()).reduce((sum, a) => sum + a.totalRevenue, 0),
                        workday_entries_count: workdayHours?.length || 0,
                        mpp_tasks_count: mppTasks?.length || 0,
                        mpp_phases_count: mppPhases?.length || 0,
                        tasks_with_actuals: enhancedTasks.filter(t => t.actual_hours > 0).length,
                        phases_with_actuals: enhancedPhases.filter(p => p.actual_hours > 0).length
                    }
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[wbs-enhanced] Fatal Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

function getPerformanceStatus(actualHours: number, baselineHours: number, actualCost: number, baselineCost: number): string {
    if (baselineHours === 0 && baselineCost === 0) return 'no-baseline';
    
    const hoursVariance = actualHours - baselineHours;
    const costVariance = actualCost - baselineCost;
    
    if (hoursVariance > 0.2 * baselineHours || costVariance > 0.2 * baselineCost) {
        return 'over-budget';
    } else if (hoursVariance < -0.1 * baselineHours && costVariance < -0.1 * baselineCost) {
        return 'under-budget';
    } else if (Math.abs(hoursVariance) <= 0.1 * baselineHours && Math.abs(costVariance) <= 0.1 * baselineCost) {
        return 'on-track';
    }
    
    return 'mixed';
}
