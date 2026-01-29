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
  try {
    const config = getADOConfig();
    if (!config) {
      return NextResponse.json(
        { error: 'Azure DevOps not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const timeframe = (searchParams.get('timeframe') || 'current') as 'current' | 'past' | 'future';
    const iterationId = searchParams.get('iterationId');

    if (iterationId) {
      // Get work items for specific iteration
      const workItems = await getSprintWorkItems(config, iterationId);
      return NextResponse.json({ workItems: workItems.workItems || [] });
    } else {
      // Get iterations
      const iterations = await getIterations(config, timeframe);
      return NextResponse.json({ iterations: iterations.value || [] });
    }
  } catch (error: any) {
    console.error('Error fetching iterations from Azure DevOps:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch iterations' },
      { status: 500 }
    );
  }
}
