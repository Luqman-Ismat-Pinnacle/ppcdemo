export interface AzureIterationDto {
  id?: string;
  identifier?: string;
  name?: string;
  path?: string;
  attributes?: {
    startDate?: string;
    finishDate?: string;
    timeFrame?: 'past' | 'current' | 'future';
  };
}

export interface AzureWorkItemDto {
  id: number;
  fields: Record<string, unknown>;
}

export interface AzureTeamDto {
  id: string;
  name: string;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // Ignore JSON parsing failures and use default message
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function fetchAzureIterations(
  timeframe: 'past' | 'current' | 'future',
  signal?: AbortSignal,
  team?: string,
): Promise<AzureIterationDto[]> {
  const query = new URLSearchParams({ timeframe });
  if (team) query.set('team', team);
  const response = await fetch(`/api/azure-devops/iterations?${query.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    signal,
  });
  const payload = await parseJsonResponse<{ iterations?: AzureIterationDto[] }>(response);
  return payload.iterations || [];
}

export async function fetchAzureSprintWorkItems(
  iterationPath: string,
  signal?: AbortSignal,
  team?: string,
): Promise<AzureWorkItemDto[]> {
  const query = new URLSearchParams({ iterationId: iterationPath });
  if (team) query.set('team', team);
  const response = await fetch(`/api/azure-devops/iterations?${query.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    signal,
  });
  const payload = await parseJsonResponse<{ workItems?: AzureWorkItemDto[] }>(response);
  return payload.workItems || [];
}

export async function fetchAzureTeams(
  signal?: AbortSignal,
): Promise<{ teams: AzureTeamDto[]; defaultTeam: string | null }> {
  const response = await fetch('/api/azure-devops/teams', {
    method: 'GET',
    cache: 'no-store',
    signal,
  });
  const payload = await parseJsonResponse<{ teams?: AzureTeamDto[]; defaultTeam?: string | null }>(response);
  return {
    teams: payload.teams || [],
    defaultTeam: payload.defaultTeam || null,
  };
}

export async function fetchAzureQcWorkItems(signal?: AbortSignal): Promise<AzureWorkItemDto[]> {
  const wiql = [
    'SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType],',
    '[System.IterationPath], [System.AssignedTo], [System.Tags],',
    '[Microsoft.VSTS.Scheduling.OriginalEstimate], [Microsoft.VSTS.Scheduling.CompletedWork], [Microsoft.VSTS.Scheduling.RemainingWork]',
    'FROM WorkItems',
    "WHERE [System.WorkItemType] IN ('Task','Bug')",
    "AND ([System.Tags] CONTAINS 'QC' OR [System.Title] CONTAINS 'QC')",
    'ORDER BY [System.ChangedDate] DESC',
  ].join(' ');

  const response = await fetch(`/api/azure-devops/work-items?wiql=${encodeURIComponent(wiql)}`, {
    method: 'GET',
    cache: 'no-store',
    signal,
  });
  const payload = await parseJsonResponse<{ workItems?: AzureWorkItemDto[] }>(response);
  return payload.workItems || [];
}

export async function syncAzureWorkItem(params: {
  workItem: Record<string, unknown>;
  workItemType: 'Epic' | 'Feature' | 'User Story' | 'Task' | 'Bug';
  changes: Record<string, unknown>;
}): Promise<{ success?: boolean; adoWorkItemId?: number; error?: string }> {
  const response = await fetch('/api/azure-devops/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    try {
      const payload = await response.json();
      return { error: payload?.error || 'Failed to sync with Azure DevOps' };
    } catch {
      return { error: 'Failed to sync with Azure DevOps' };
    }
  }

  return response.json();
}

export function getAdoAssignedName(value: unknown): string {
  if (!value) return 'Unassigned';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const displayName = record.displayName;
    if (typeof displayName === 'string' && displayName.trim()) return displayName;
    const uniqueName = record.uniqueName;
    if (typeof uniqueName === 'string' && uniqueName.trim()) return uniqueName;
  }
  return 'Unassigned';
}

export function mapAdoStateToLocal(state: string, tagsCsv?: string): string {
  const normalized = state.trim().toLowerCase();
  const tags = (tagsCsv || '').toLowerCase();
  if (normalized === 'new') return 'Not Started';
  if (normalized === 'closed' || normalized === 'done' || normalized === 'removed') return 'Closed';
  if (normalized === 'resolved') return 'In Progress';
  if (normalized === 'blocked') return 'Roadblock';

  if (tags.includes('qc-final')) return 'QC Final';
  if (tags.includes('qc-mid')) return 'QC Mid';
  if (tags.includes('qc-kickoff')) return 'QC Kickoff';
  if (tags.includes('qc-initial')) return 'QC Initial';

  return 'In Progress';
}
