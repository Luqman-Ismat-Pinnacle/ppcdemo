import { NextResponse } from 'next/server';
import { getADOConfig, getProjectTeams } from '@/lib/azure-devops';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/azure-devops/teams
 * List teams for the configured Azure DevOps project.
 * Use this to find a valid AZURE_DEVOPS_TEAM value when you get "team does not exist".
 */
export async function GET() {
  try {
    const config = getADOConfig();
    if (!config) {
      return NextResponse.json(
        { error: 'Azure DevOps not configured. Set AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, and AZURE_DEVOPS_PAT.' },
        { status: 500 }
      );
    }
    const teams = await getProjectTeams(config);
    return NextResponse.json({
      teams,
      defaultTeam: config.team || config.project || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch teams';
    console.error('[Azure DevOps] GET /api/azure-devops/teams error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
