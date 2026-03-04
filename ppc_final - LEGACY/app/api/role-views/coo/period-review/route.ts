import { NextRequest, NextResponse } from 'next/server';
import { fetchAllData } from '@/lib/database';
import { buildProjectBreakdown, buildPortfolioAggregate, buildPeriodHoursSummary } from '@/lib/calculations/selectors';
import { asNumber } from '@/lib/role-summary-db';

export const dynamic = 'force-dynamic';

type ScopeLevel = 'portfolio' | 'customer' | 'site' | 'project';

function parseIsoDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const scope: ScopeLevel = (url.searchParams.get('scope') as ScopeLevel) || 'portfolio';
    const scopeId = url.searchParams.get('scopeId');
    const periodStartParam = url.searchParams.get('periodStart');
    const periodEndParam = url.searchParams.get('periodEnd');

    const today = new Date();
    const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const defaultEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const periodStartDate = parseIsoDate(periodStartParam) || defaultStart;
    const periodEndDate = parseIsoDate(periodEndParam) || defaultEnd;

    const periodStart = periodStartDate.toISOString().slice(0, 10);
    const periodEnd = periodEndDate.toISOString().slice(0, 10);

    const data = await fetchAllData();
    if (!data) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
    }

    // For v1, scope filtering is portfolio-wide; future iterations can narrow by hierarchy.
    const projectBreakdown = buildProjectBreakdown(
      (data.tasks || []) as unknown[],
      (data.projects || []) as unknown[],
      (data.hours || []) as unknown[],
      (data.sites || []) as unknown[],
      'project',
    );
    const portfolio = buildPortfolioAggregate(projectBreakdown, 'project');

    const hoursSummary = buildPeriodHoursSummary([
      { baseline: portfolio.baselineHours, actual: portfolio.totalHours },
    ]);

    // Approximate planned value (PV) from project baseline dates.
    let pvHours = 0;
    const projects = (data.projects || []) as Array<Record<string, unknown>>;
    projects.forEach((p) => {
      const baseline = asNumber(p.baselineHours ?? p.baseline_hours);
      if (!baseline || baseline <= 0) return;

      const startRaw = (p.baselineStartDate ?? p.baseline_start_date) as string | null | undefined;
      const endRaw = (p.baselineEndDate ?? p.baseline_end_date) as string | null | undefined;
      const start = parseIsoDate(startRaw || null);
      const end = parseIsoDate(endRaw || null);
      if (!start || !end || !(end.getTime() > start.getTime())) return;

      const totalDays = (end.getTime() - start.getTime()) / 86400000;
      if (!Number.isFinite(totalDays) || totalDays <= 0) return;

      const elapsedDays = (today.getTime() - start.getTime()) / 86400000;
      const fraction = clamp01(elapsedDays / totalDays);
      pvHours += baseline * fraction;
    });

    const evHours = portfolio.earnedHours;
    const baselineHours = portfolio.baselineHours;

    const actualPercentComplete = portfolio.percentComplete;
    const plannedPercentComplete = baselineHours > 0 ? (pvHours / baselineHours) * 100 : actualPercentComplete;
    const scheduleDeltaHours = evHours - pvHours;

    const workingDaysApprox = 10; // Two-week working approximation; refined by client period selector.
    const hoursFteEquivalent = workingDaysApprox > 0 ? hoursSummary.added / 8 / workingDaysApprox : 0;

    const summary = {
      scheduleVariance: {
        actualPercentComplete,
        plannedPercentComplete,
        deltaPercentPoints: actualPercentComplete - plannedPercentComplete,
        deltaHours: scheduleDeltaHours,
        evHours,
        pvHours,
      },
      periodHoursVariance: {
        plan: hoursSummary.plan,
        actual: hoursSummary.actual,
        added: hoursSummary.added,
        reduced: hoursSummary.reduced,
        deltaHours: hoursSummary.deltaHours,
        deltaPct: hoursSummary.deltaPct,
        fteEquivalent: hoursFteEquivalent,
      },
      baselineVsActualVsRemaining: {
        baselineHours,
        actualHours: portfolio.totalHours,
        remainingHours: portfolio.remainingHours,
      },
    };

    const response = {
      success: true,
      scope: { level: scope, id: scopeId },
      period: {
        granularity: 'month' as const,
        start: periodStart,
        end: periodEnd,
      },
      summary,
      sections: {
        // Placeholders for drill-down sections to be populated by follow-on transforms.
        hoursDrilldown: {
          taskHours: [],
          qualityHours: [],
          nonExecute: [],
        },
        deliverableVariance: {
          rows: [],
          summary: null,
        },
        resourcing: {
          byPerson: [],
          byRole: [],
        },
        milestones: {
          buckets: null,
          rows: [],
        },
        commitments: {
          lastPeriod: [],
          thisPeriod: [],
          notes: [],
        },
      },
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

