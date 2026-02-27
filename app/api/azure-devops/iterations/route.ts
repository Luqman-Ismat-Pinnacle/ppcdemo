import { NextResponse } from 'next/server';
import { getADOConfig, getIterations, getSprintWorkItems } from '@/lib/azure-devops';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/azure-devops/iterations
 * Get iterations (sprints) from Azure DevOps
 * Query params:
 * - timeframe: current | past | future (default: current)
 * - iterationId: get work items for specific iteration
 */
export async function GET(request: Request) {
  const log = (msg: string, meta?: Record<string, unknown>) => {
    if (meta) console.log(`[Azure DevOps] ${msg}`, meta);
    else console.log(`[Azure DevOps] ${msg}`);
  };
  try {
    const hasOrg = Boolean(process.env.AZURE_DEVOPS_ORGANIZATION);
    const hasProject = Boolean(process.env.AZURE_DEVOPS_PROJECT);
    const hasPat = Boolean(process.env.AZURE_DEVOPS_PAT);
    log('Config check', { hasOrg, hasProject, hasPat, envKeys: Object.keys(process.env).filter(k => k.startsWith('AZURE_DEVOPS')).join(',') });

    const config = getADOConfig();
    if (!config) {
      log('Azure DevOps not configured - missing org, project, or PAT', { hasOrg, hasProject, hasPat });
      return NextResponse.json(
        { error: 'Azure DevOps not configured. Set AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, and AZURE_DEVOPS_PAT.' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const timeframe = (searchParams.get('timeframe') || 'current') as 'current' | 'past' | 'future';
    const iterationId = searchParams.get('iterationId');
    const team = searchParams.get('team');
    const scopedConfig = team ? { ...config, team } : config;

    if (iterationId) {
      log('Fetching work items for iteration', { iterationId: iterationId.slice(0, 50), team: scopedConfig.team });
      const workItems = await getSprintWorkItems(scopedConfig, iterationId);
      log('Work items fetched', { count: workItems.workItems?.length ?? 0 });
      return NextResponse.json({ workItems: workItems.workItems || [] });
    } else {
      log('Fetching iterations', { timeframe, team: scopedConfig.team });
      const iterations = await getIterations(scopedConfig, timeframe);
      log('Iterations fetched', { count: iterations.value?.length ?? 0 });
      return NextResponse.json({ iterations: iterations.value || [] });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[Azure DevOps] Error:', message);
    log('Request failed', { error: message, stack: stack?.slice(0, 200) });
    return NextResponse.json(
      { error: message || 'Failed to fetch iterations' },
      { status: 500 }
    );
  }
}
