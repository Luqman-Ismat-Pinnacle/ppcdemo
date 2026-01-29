import { NextResponse } from 'next/server';
import { getADOConfig, syncWorkItemToADO, mapStateToADO } from '@/lib/azure-devops';
import type { ADOWorkItemType } from '@/lib/azure-devops';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/azure-devops/sync
 * Sync a work item from our app to Azure DevOps
 * Website is source of truth - pushes changes to ADO
 */
export async function POST(request: Request) {
  try {
    const config = getADOConfig();
    if (!config) {
      return NextResponse.json(
        { error: 'Azure DevOps not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      workItem,
      workItemType,
      changes
    }: {
      workItem: any;
      workItemType: ADOWorkItemType;
      changes: Record<string, any>;
    } = body;

    if (!workItem || !workItemType || !changes) {
      return NextResponse.json(
        { error: 'Missing required fields: workItem, workItemType, changes' },
        { status: 400 }
      );
    }

    // Sync to Azure DevOps
    const result = await syncWorkItemToADO(config, workItem, workItemType, changes);

    return NextResponse.json({
      success: true,
      adoWorkItemId: result.id,
      result
    });
  } catch (error: any) {
    console.error('Error syncing to Azure DevOps:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync to Azure DevOps' },
      { status: 500 }
    );
  }
}
