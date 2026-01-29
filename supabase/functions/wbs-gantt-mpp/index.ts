// Simple WBS Gantt - reads MPP hierarchy from DB, actuals from Workday
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: any) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        // 1. Get projects with has_schedule = true (MPP uploaded)
        const { data: projects, error: projectsError } = await supabase
            .from('projects')
            .select('*')
            .eq('has_schedule', true);

        if (projectsError) throw projectsError;
        if (!projects?.length) {
            return new Response(JSON.stringify({ success: true, projects: [] }), 
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const projectIds = projects.map((p: any) => p.id);

        // 2. Get hierarchy (phases, units, tasks) using parent_id
        const [phasesRes, unitsRes, tasksRes, hoursRes] = await Promise.all([
            supabase.from('phases').select('*').in('project_id', projectIds),
            supabase.from('units').select('*').in('project_id', projectIds),
            supabase.from('tasks').select('*').in('project_id', projectIds),
            supabase.from('hour_entries').select('*').in('project_id', projectIds)
        ]);

        const phases = phasesRes.data || [];
        const units = unitsRes.data || [];
        const tasks = tasksRes.data || [];
        const hours = hoursRes.data || [];

        // 3. Build hierarchy for each project using parent_id
        const result = projects.map((project: any) => {
            const pPhases = phases.filter((p: any) => p.project_id === project.id);
            const pUnits = units.filter((u: any) => u.project_id === project.id);
            const pTasks = tasks.filter((t: any) => t.project_id === project.id);
            const pHours = hours.filter((h: any) => h.project_id === project.id);

            // Build flat items with parent references
            const items: any[] = [];
            
            pPhases.forEach((p: any) => items.push({
                id: p.id, name: p.name, type: 'phase', level: 1,
                parent_id: null, startDate: p.start_date, endDate: p.end_date,
                percentComplete: p.percent_complete || 0, baselineHours: p.baseline_hours || 0
            }));
            
            pUnits.forEach((u: any) => items.push({
                id: u.id, name: u.name, type: 'unit', level: 2,
                parent_id: u.phase_id || u.parent_id, startDate: u.start_date, endDate: u.end_date,
                percentComplete: u.percent_complete || 0, baselineHours: u.baseline_hours || 0
            }));
            
            pTasks.forEach((t: any) => items.push({
                id: t.id, name: t.task_name || t.name, type: 'task', level: 3,
                parent_id: t.unit_id || t.phase_id || t.parent_id, 
                startDate: t.start_date, endDate: t.end_date,
                percentComplete: t.percent_complete || 0, baselineHours: t.baseline_hours || 0,
                assignedResource: t.assigned_resource
            }));

            // Calculate actuals from Workday hours
            const totalActualHours = pHours.reduce((sum: number, h: any) => sum + (h.hours || 0), 0);
            const totalActualCost = pHours.reduce((sum: number, h: any) => sum + (h.cost || 0), 0);

            return {
                id: project.id,
                name: project.name,
                has_schedule: project.has_schedule,
                items: items,
                stats: {
                    phases: pPhases.length,
                    units: pUnits.length,
                    tasks: pTasks.length,
                    actualHours: totalActualHours,
                    actualCost: totalActualCost
                }
            };
        });

        return new Response(JSON.stringify({ success: true, projects: result }), 
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), 
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
});
