import { NextResponse } from 'next/server';
import { getADOConfig, getWorkItem, queryWorkItems } from '@/lib/azure-devops';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/azure-devops/work-items
 * Get work items from Azure DevOps
 * Query params:
 * - id: specific work item ID
 * - wiql: WIQL query string
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
    const id = searchParams.get('id');
    const wiql = searchParams.get('wiql');

    if (id) {
      // Get specific work item
      const workItem = await getWorkItem(config, parseInt(id));
      return NextResponse.json({ workItem });
    } else if (wiql) {
      // Query work items using WIQL
      const result = await queryWorkItems(config, wiql);
      return NextResponse.json({ workItems: result.workItems || [] });
    } else {
      return NextResponse.json(
        { error: 'Must provide either id or wiql parameter' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error fetching work items from Azure DevOps:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch work items' },
      { status: 500 }
    );
  }
}
