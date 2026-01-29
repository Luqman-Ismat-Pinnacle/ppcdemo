// Project Health - Flags projects without MPP assignments
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    console.log('[project-health] === Project Health Analysis Started ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Get all Workday projects (portfolios)
        console.log('[project-health] Fetching all Workday projects...');
        const { data: allWorkdayProjects, error: workdayError } = await supabase
            .from('portfolios')
            .select('*');

        if (workdayError) throw workdayError;

        // 2. Get all project mappings (if table exists)
        let projectMappings = [];
        try {
            const { data: mappings, error: mappingsError } = await supabase
                .from('project_mappings')
                .select('*');
            
            if (!mappingsError && mappings) {
                projectMappings = mappings.filter(m => !m.deleted);
            }
        } catch (error) {
            console.log('[project-health] Project mappings table not found, continuing without it');
        }

        // 3. Get all MPP projects
        console.log('[project-health] Fetching all MPP projects...');
        const { data: allMppProjects, error: mppError } = await supabase
            .from('projects')
            .select('*');

        if (mppError) throw mppError;

        // 4. Get project activity data
        console.log('[project-health] Fetching project activity...');
        const { data: hourEntries, error: hoursError } = await supabase
            .from('hour_entries')
            .select('project_id, hours, actual_cost, actual_revenue, date');

        if (hoursError) throw hoursError;

        // 5. Analyze project health
        const mappedWorkdayIds = projectMappings?.map(m => m.workday_project_id) || [];
        const mappedMppIds = projectMappings?.map(m => m.mpp_project_id) || [];

        // Projects without MPP assignments
        const projectsWithoutMpp = allWorkdayProjects?.filter(project => 
            !mappedWorkdayIds.includes(project.id)
        ) || [];

        // MPP projects without Workday assignments
        const mppProjectsWithoutWorkday = allMppProjects?.filter(project => 
            !mappedMppIds.includes(project.id)
        ) || [];

        // Calculate project activity metrics
        const projectActivity = new Map();
        
        hourEntries?.forEach(entry => {
            const projectId = entry.project_id;
            if (!projectActivity.has(projectId)) {
                projectActivity.set(projectId, {
                    totalHours: 0,
                    totalCost: 0,
                    totalRevenue: 0,
                    lastActivity: null,
                    entryCount: 0
                });
            }
            
            const activity = projectActivity.get(projectId);
            activity.totalHours += entry.hours || 0;
            activity.totalCost += entry.actual_cost || 0;
            activity.totalRevenue += entry.actual_revenue || 0;
            activity.entryCount += 1;
            
            // Track last activity date
            if (entry.date) {
                const entryDate = new Date(entry.date);
                if (!activity.lastActivity || entryDate > activity.lastActivity) {
                    activity.lastActivity = entryDate;
                }
            }
        });

        // 6. Generate health flags
        const healthFlags = [];
        const currentDate = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(currentDate.getDate() - 30);

        // Flag 1: Projects without MPP assignment
        projectsWithoutMpp.forEach(project => {
            const activity = projectActivity.get(project.id);
            healthFlags.push({
                type: 'NO_MPP_ASSIGNMENT',
                severity: 'HIGH',
                projectId: project.id,
                projectName: project.name,
                description: 'Workday project has no MPP file assigned',
                recommendation: 'Upload and assign an MPP file to enable WBS Gantt integration',
                metadata: {
                    projectType: 'Workday',
                    totalHours: activity?.totalHours || 0,
                    totalCost: activity?.totalCost || 0,
                    lastActivity: activity?.lastActivity
                }
            });
        });

        // Flag 2: MPP projects without Workday assignment
        mppProjectsWithoutWorkday.forEach(project => {
            healthFlags.push({
                type: 'NO_WORKDAY_ASSIGNMENT',
                severity: 'MEDIUM',
                projectId: project.id,
                projectName: project.name,
                description: 'MPP project has no Workday project assigned',
                recommendation: 'Assign to a Workday project to enable cost tracking',
                metadata: {
                    projectType: 'MPP',
                    plannedHours: project.planned_hours,
                    plannedCost: project.planned_cost
                }
            });
        });

        // Flag 3: Inactive projects (no activity in 30 days)
        allWorkdayProjects?.forEach(project => {
            const activity = projectActivity.get(project.id);
            if (activity && activity.lastActivity && activity.lastActivity < thirtyDaysAgo) {
                const daysInactive = Math.floor((currentDate - activity.lastActivity) / (1000 * 60 * 60 * 24));
                
                healthFlags.push({
                    type: 'INACTIVE_PROJECT',
                    severity: daysInactive > 90 ? 'HIGH' : 'MEDIUM',
                    projectId: project.id,
                    projectName: project.name,
                    description: `No activity for ${daysInactive} days`,
                    recommendation: daysInactive > 90 ? 'Consider archiving or reactivating project' : 'Check if project is still active',
                    metadata: {
                        projectType: 'Workday',
                        daysInactive,
                        lastActivity: activity.lastActivity,
                        totalHours: activity.totalHours,
                        totalCost: activity.totalCost
                    }
                });
            }
        });

        // Flag 4: Projects with no activity data
        allWorkdayProjects?.forEach(project => {
            if (!projectActivity.has(project.id)) {
                healthFlags.push({
                    type: 'NO_ACTIVITY_DATA',
                    severity: 'MEDIUM',
                    projectId: project.id,
                    projectName: project.name,
                    description: 'No hour or cost data recorded',
                    recommendation: 'Ensure time tracking is enabled and employees are logging hours',
                    metadata: {
                        projectType: 'Workday',
                        hasMppAssignment: mappedWorkdayIds.includes(project.id)
                    }
                });
            }
        });

        // 7. Generate health summary
        const healthSummary = {
            totalWorkdayProjects: allWorkdayProjects?.length || 0,
            totalMppProjects: allMppProjects?.length || 0,
            totalMappings: projectMappings?.length || 0,
            projectsWithoutMpp: projectsWithoutMpp.length,
            mppProjectsWithoutWorkday: mppProjectsWithoutWorkday.length,
            totalHealthFlags: healthFlags.length,
            highSeverityFlags: healthFlags.filter(f => f.severity === 'HIGH').length,
            mediumSeverityFlags: healthFlags.filter(f => f.severity === 'MEDIUM').length,
            lowSeverityFlags: healthFlags.filter(f => f.severity === 'LOW').length
        };

        console.log(`[project-health] Analysis complete: ${healthFlags.length} health flags generated`);

        return new Response(
            JSON.stringify({
                success: true,
                healthSummary,
                healthFlags: healthFlags.sort((a, b) => {
                    // Sort by severity first, then by type
                    const severityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
                    const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
                    if (severityDiff !== 0) return severityDiff;
                    return a.type.localeCompare(b.type);
                }),
                details: {
                    projectsWithoutMpp,
                    mppProjectsWithoutWorkday,
                    projectActivity: Object.fromEntries(projectActivity)
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[project-health] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
