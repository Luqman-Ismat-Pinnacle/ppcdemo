/**
 * @fileoverview React Hook for Azure DevOps Real-time Sync
 * 
 * Provides a hook to sync work items to Azure DevOps in real-time.
 * Website is the source of truth - all changes are pushed to ADO.
 * 
 * @module lib/hooks/useAzureDevOpsSync
 */

import { useCallback } from 'react';
import type { ADOWorkItemType } from '@/lib/azure-devops';

interface SyncOptions {
  workItem: Record<string, unknown>;
  workItemType: ADOWorkItemType;
  changes: Record<string, unknown>;
}

/**
 * Hook for syncing work items to Azure DevOps
 * Returns a function to sync changes
 * 
 * IMPORTANT: All features work standalone - sync is optional.
 * If ADO is not configured or sync fails, the app continues to work normally.
 */
export function useAzureDevOpsSync() {
  const syncToADO = useCallback(async (options: SyncOptions): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/azure-devops/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const error = await response.json();
        // If ADO is not configured, that's fine - app continues working
        if (response.status === 500 && error.error?.includes('not configured')) {
          return { success: false, error: 'Azure DevOps not configured' };
        }
        return { success: false, error: error.error || 'Failed to sync to Azure DevOps' };
      }

      const result = await response.json();
      return { success: true };
    } catch (error) {
      // Azure DevOps sync failed - continuing without sync
      // Don't throw - allow app to continue working even if sync fails
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      return { success: false, error: errorMessage };
    }
  }, []);

  return { syncToADO };
}
