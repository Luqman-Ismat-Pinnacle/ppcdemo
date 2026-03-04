import type { MoPeriodNote, MoPeriodNoteType } from '@/types/data';

type NoteScope = {
  portfolioId: string | null;
  customerId: string | null;
  siteId: string | null;
  projectId: string | null;
};

export function filterNotesByScope(notes: MoPeriodNote[], scope: NoteScope): MoPeriodNote[] {
  return notes.filter((n) => {
    const pid = (n.projectId ?? (n as any).project_id) || null;
    const sid = (n.siteId ?? (n as any).site_id) || null;
    const cid = (n.customerId ?? (n as any).customer_id) || null;
    const pfid = (n.portfolioId ?? (n as any).portfolio_id) || null;
    return (
      pid === scope.projectId &&
      sid === scope.siteId &&
      cid === scope.customerId &&
      pfid === scope.portfolioId
    );
  });
}

export function findNote(
  notes: MoPeriodNote[],
  type: MoPeriodNoteType,
  periodStart: string,
  periodEnd: string,
  sortOrder = 0,
): MoPeriodNote | undefined {
  return notes.find((n) => {
    const nt = n.noteType ?? (n as any).note_type;
    const ps = n.periodStart ?? (n as any).period_start;
    const pe = n.periodEnd ?? (n as any).period_end;
    const so = Number((n.sortOrder ?? (n as any).sort_order) || 0);
    return nt === type && ps === periodStart && pe === periodEnd && so === sortOrder;
  });
}

export function buildMoPeriodNote(params: {
  existing?: MoPeriodNote;
  id?: string;
  type: MoPeriodNoteType;
  periodGranularity: MoPeriodNote['periodGranularity'];
  periodStart: string;
  periodEnd: string;
  scope: NoteScope;
  content: string;
  sortOrder?: number;
}): MoPeriodNote {
  const nowIso = new Date().toISOString();
  return {
    id:
      params.id ||
      params.existing?.id ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `monote-${Date.now()}-${Math.random()}`),
    noteType: params.type,
    periodGranularity: params.periodGranularity,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    portfolioId: params.scope.portfolioId,
    customerId: params.scope.customerId,
    siteId: params.scope.siteId,
    projectId: params.scope.projectId,
    content: params.content,
    sortOrder: params.sortOrder ?? Number(params.existing?.sortOrder ?? (params as any).sort_order ?? 0),
    createdAt: params.existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };
}

