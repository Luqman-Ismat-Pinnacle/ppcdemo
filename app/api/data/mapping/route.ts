/**
 * Mapping API: assign hour entry to task, or assign task to workday phase.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isPostgresConfigured, query as pgQuery } from '@/lib/postgres';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === 'assignHourToTask') {
      const hourId = body.hourId as string;
      const taskId = body.taskId as string;
      if (!hourId || !taskId) {
        return NextResponse.json({ success: false, error: 'hourId and taskId required' }, { status: 400 });
      }
      if (isPostgresConfigured()) {
        await pgQuery('UPDATE hour_entries SET task_id = $1, updated_at = NOW() WHERE id = $2', [taskId, hourId]);
        return NextResponse.json({ success: true, hourId, taskId });
      }
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      }
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase.from('hour_entries').update({ task_id: taskId }).eq('id', hourId);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, hourId, taskId });
    }

    if (action === 'assignTaskToWorkdayPhase') {
      const taskId = body.taskId as string;
      const workdayPhaseId = body.workdayPhaseId as string | null;
      if (!taskId) {
        return NextResponse.json({ success: false, error: 'taskId required' }, { status: 400 });
      }
      if (isPostgresConfigured()) {
        await pgQuery('UPDATE tasks SET workday_phase_id = $1, updated_at = NOW() WHERE id = $2', [workdayPhaseId || null, taskId]);
        return NextResponse.json({ success: true, taskId, workdayPhaseId: workdayPhaseId || null });
      }
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      }
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase.from('tasks').update({ workday_phase_id: workdayPhaseId || null }).eq('id', taskId);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, taskId, workdayPhaseId: workdayPhaseId || null });
    }

    return NextResponse.json({ success: false, error: 'Invalid action. Use assignHourToTask or assignTaskToWorkdayPhase.' }, { status: 400 });
  } catch (err: any) {
    console.error('[Mapping] Error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
