import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { fetchAllData } from '@/lib/database';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shell = searchParams.get('shell') === 'true';
    const mode = shell ? 'shell' : 'full';
    const role = searchParams.get('role') ?? undefined;
    const email = searchParams.get('email') ?? undefined;
    const employeeId = searchParams.get('employeeId') ?? undefined;
    const projectId = searchParams.get('project')?.trim() || undefined;
    const from = searchParams.get('from')?.trim() || undefined;
    const to = searchParams.get('to')?.trim() || undefined;
    const scope: { role?: string; email?: string; employeeId?: string; projectId?: string; from?: string; to?: string } = {};
    if (role) scope.role = role;
    if (email) scope.email = email;
    if (employeeId) scope.employeeId = employeeId;
    if (projectId) scope.projectId = projectId;
    if (from) scope.from = from;
    if (to) scope.to = to;
    const hasScope = Object.keys(scope).length > 0;
    const data = await fetchAllData(mode, hasScope ? scope : undefined);
    
    if (!data) {
      return NextResponse.json({ data: null, error: 'No database configured' }, { status: 200 });
    }
    
    // Debug: Log counts for key tables
    const dataCounts: Record<string, number> = {};
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        dataCounts[key] = value.length;
      }
    }
    console.log('[API /data] Fetched data counts:', JSON.stringify(dataCounts));
    
    return NextResponse.json(
      { data, error: null },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error fetching data:', error);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
