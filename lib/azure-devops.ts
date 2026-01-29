/**
 * @fileoverview Azure DevOps REST API Client
 * 
 * Provides functions to interact with Azure DevOps REST API for:
 * - Work items (Epic, Feature, User Story, Task, Bug)
 * - Iterations (Sprints)
 * - Boards and Taskboards
 * - Backlogs
 * 
 * Website is the source of truth - changes are pushed to ADO in real-time.
 * 
 * @module lib/azure-devops
 */

// Azure DevOps API Configuration
// These should be set via environment variables on the backend
export interface AzureDevOpsConfig {
  organization: string;
  project: string;
  team?: string;
  personalAccessToken: string;
  baseUrl?: string; // Defaults to https://dev.azure.com
}

// Work Item Types in Azure DevOps
export type ADOWorkItemType = 'Epic' | 'Feature' | 'User Story' | 'Task' | 'Bug';

// State mapping: Our states → ADO states
const STATE_MAPPING: Record<string, string> = {
  'Not Started': 'New',
  'In Progress': 'Active',
  'Roadblock': 'Blocked',
  'QC Initial': 'Active', // Map QC states to Active with tags
  'QC Kickoff': 'Active',
  'QC Mid': 'Active',
  'QC Final': 'Active',
  'QC Post-Validation': 'Active',
  'QC Field QC': 'Active',
  'QC Validation': 'Active',
  'Closed': 'Closed'
};

// Reverse mapping: ADO states → Our states
const ADO_STATE_MAPPING: Record<string, string> = {
  'New': 'Not Started',
  'Active': 'In Progress', // Will check tags for QC states
  'Resolved': 'In Progress',
  'Closed': 'Closed',
  'Removed': 'Closed'
};

/**
 * Get Azure DevOps configuration from environment
 * Should be configured on backend
 */
export function getADOConfig(): AzureDevOpsConfig | null {
  // These will be set via environment variables on the backend
  const org = process.env.AZURE_DEVOPS_ORGANIZATION;
  const project = process.env.AZURE_DEVOPS_PROJECT;
  const team = process.env.AZURE_DEVOPS_TEAM;
  const pat = process.env.AZURE_DEVOPS_PAT;

  if (!org || !project || !pat) {
    return null;
  }

  return {
    organization: org,
    project,
    team: team || project, // Default to project name if team not specified
    personalAccessToken: pat,
    baseUrl: process.env.AZURE_DEVOPS_BASE_URL || 'https://dev.azure.com'
  };
}

/**
 * Make authenticated request to Azure DevOps API
 */
async function adoRequest(
  config: AzureDevOpsConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const url = `${config.baseUrl}/${config.organization}/${config.project}${endpoint}`;
  const auth = Buffer.from(`:${config.personalAccessToken}`).toString('base64');

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Azure DevOps API error: ${response.status} ${response.statusText} - ${error}`);
  }

  return response.json();
}

/**
 * Get work item from Azure DevOps
 */
export async function getWorkItem(
  config: AzureDevOpsConfig,
  workItemId: number
): Promise<any> {
  const endpoint = `/_apis/wit/workitems/${workItemId}?api-version=7.1`;
  return adoRequest(config, endpoint);
}

/**
 * Create or update work item in Azure DevOps
 */
export async function createOrUpdateWorkItem(
  config: AzureDevOpsConfig,
  workItemType: ADOWorkItemType,
  fields: Record<string, any>,
  workItemId?: number
): Promise<any> {
  // Build the patch document for ADO API
  const patchDocument = Object.entries(fields).map(([field, value]) => ({
    op: 'add',
    path: `/fields/${field}`,
    value: value
  }));

  if (workItemId) {
    // Update existing work item
    const endpoint = `/_apis/wit/workitems/${workItemId}?api-version=7.1`;
    return adoRequest(config, endpoint, {
      method: 'PATCH',
      body: JSON.stringify(patchDocument)
    });
  } else {
    // Create new work item
    const endpoint = `/_apis/wit/workitems/${workItemType}?api-version=7.1`;
    return adoRequest(config, endpoint, {
      method: 'POST',
      body: JSON.stringify(patchDocument)
    });
  }
}

/**
 * Query work items using WIQL (Work Item Query Language)
 */
export async function queryWorkItems(
  config: AzureDevOpsConfig,
  wiql: string
): Promise<any> {
  const endpoint = `/_apis/wit/wiql?api-version=7.1`;
  const response = await adoRequest(config, endpoint, {
    method: 'POST',
    body: JSON.stringify({ query: wiql })
  });

  // Get work item IDs from query result
  const workItemIds = (response.workItems as Array<{ id: number }>).map((wi) => wi.id);
  if (workItemIds.length === 0) {
    return { workItems: [] };
  }

  // Fetch full work item details
  const idsParam = workItemIds.join(',');
  const getEndpoint = `/_apis/wit/workitems?ids=${idsParam}&api-version=7.1`;
  return adoRequest(config, getEndpoint);
}

/**
 * Get iterations (sprints) for a team
 */
export async function getIterations(
  config: AzureDevOpsConfig,
  timeframe: 'current' | 'past' | 'future' = 'current'
): Promise<any> {
  const endpoint = `/${config.team}/_apis/work/teamsettings/iterations?$timeframe=${timeframe}&api-version=7.1`;
  return adoRequest(config, endpoint);
}

/**
 * Get work items for a specific iteration (sprint)
 */
export async function getSprintWorkItems(
  config: AzureDevOpsConfig,
  iterationId: string
): Promise<any> {
  // Query work items assigned to this iteration
  const wiql = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType] 
                FROM WorkItems 
                WHERE [System.IterationPath] = @currentIteration('${config.team}')
                ORDER BY [System.ChangedDate] DESC`;
  
  return queryWorkItems(config, wiql);
}

/**
 * Get taskboard work items for a sprint
 */
export async function getTaskboardWorkItems(
  config: AzureDevOpsConfig,
  iterationId: string
): Promise<any> {
  const endpoint = `/${config.team}/_apis/work/taskboardworkitems/${iterationId}?api-version=7.1`;
  return adoRequest(config, endpoint);
}

/**
 * Update taskboard work item (for task state changes)
 */
export async function updateTaskboardWorkItem(
  config: AzureDevOpsConfig,
  iterationId: string,
  workItemId: number,
  updates: Record<string, any>
): Promise<any> {
  const endpoint = `/${config.team}/_apis/work/taskboardworkitems/${iterationId}/${workItemId}?api-version=7.1`;
  
  const patchDocument = Object.entries(updates).map(([field, value]) => ({
    op: 'add',
    path: `/${field}`,
    value: value
  }));

  return adoRequest(config, endpoint, {
    method: 'PATCH',
    body: JSON.stringify(patchDocument)
  });
}

/**
 * Get backlog work items
 */
export async function getBacklogWorkItems(
  config: AzureDevOpsConfig,
  backlogId: string = 'Microsoft.RequirementCategory'
): Promise<any> {
  const endpoint = `/${config.team}/_apis/work/backlogs/${backlogId}/workitems?api-version=7.1`;
  return adoRequest(config, endpoint);
}

/**
 * Map our work item state to Azure DevOps state
 */
export function mapStateToADO(state: string): string {
  return STATE_MAPPING[state] || 'New';
}

/**
 * Map Azure DevOps state to our state
 */
export function mapStateFromADO(adoState: string, tags?: string[]): string {
  // Check if it's a QC state based on tags
  if (tags) {
    const qcTag = tags.find(tag => tag.startsWith('QC-'));
    if (qcTag) {
      const qcType = qcTag.replace('QC-', '');
      return `QC ${qcType}`;
    }
  }

  return ADO_STATE_MAPPING[adoState] || 'Not Started';
}

/**
 * Sync work item from our app to Azure DevOps
 * Website is source of truth - pushes changes to ADO
 */
export async function syncWorkItemToADO(
  config: AzureDevOpsConfig,
  workItem: Record<string, unknown>,
  workItemType: ADOWorkItemType,
  changes: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // Map our fields to ADO fields
  const adoFields: Record<string, unknown> = {};

  // Map title
  if (changes.name || changes.taskName) {
    adoFields['System.Title'] = changes.name || changes.taskName;
  }

  // Map state
  if (changes.status && typeof changes.status === 'string') {
    const adoState = mapStateToADO(changes.status);
    adoFields['System.State'] = adoState;

    // If it's a QC state, add tag
    if (changes.status.startsWith('QC ')) {
      const qcType = changes.status.replace('QC ', '');
      adoFields['System.Tags'] = `QC-${qcType}`;
    }
  }

  // Map assigned to
  if (changes.resourceId || changes.employeeId) {
    // Need to map employee ID to ADO user - this requires user lookup
    // For now, we'll store the mapping or use display name
    // adoFields['System.AssignedTo'] = mappedUser;
  }

  // Map description
  if (changes.description || changes.comments) {
    adoFields['System.Description'] = changes.description || changes.comments;
  }

  // Map iteration (sprint)
  if (changes.sprintId) {
    // Need to map sprint ID to ADO iteration path
    // adoFields['System.IterationPath'] = iterationPath;
  }

  // Get ADO work item ID if it exists (stored in our data)
  const adoWorkItemId = typeof workItem.adoWorkItemId === 'number' ? workItem.adoWorkItemId : undefined;

  return createOrUpdateWorkItem(config, workItemType, adoFields, adoWorkItemId);
}

/**
 * Sync work item from Azure DevOps to our app
 * Only used for initial sync or conflict resolution
 */
export async function syncWorkItemFromADO(
  config: AzureDevOpsConfig,
  adoWorkItem: Record<string, unknown>
): Promise<any> {
  const fields = (adoWorkItem.fields || {}) as Record<string, unknown>;
  const workItemType = (fields['System.WorkItemType'] || '') as ADOWorkItemType;

  // Map ADO fields to our fields
  const tags = typeof fields['System.Tags'] === 'string' ? fields['System.Tags'].split(';') : undefined;
  const mappedItem: Record<string, unknown> = {
    adoWorkItemId: adoWorkItem.id,
    name: (fields['System.Title'] || '') as string,
    status: mapStateFromADO(fields['System.State'] as string, tags),
    description: (fields['System.Description'] || '') as string,
    // Map other fields as needed
  };

  return {
    workItemType,
    ...mappedItem
  };
}
