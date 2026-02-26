import { NextResponse } from 'next/server';
import { isPostgresConfigured, getPool } from '@/lib/postgres';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const startTime = Date.now();
  const result = {
    status: 'disconnected' as 'connected' | 'degraded' | 'disconnected',
    latency: null as number | null,
    lastChecked: new Date().toISOString(),
    error: null as string | null,
    details: {
      supabaseConfigured: false,
      authStatus: 'anonymous' as string,
      databaseReachable: false,
    },
  };

  try {
    // PostgreSQL check (primary)
    if (isPostgresConfigured()) {
      result.details.supabaseConfigured = true;
      const pool = getPool();
      if (pool) {
        const client = await pool.connect();
        try {
          await client.query('SELECT 1');
          result.details.databaseReachable = true;
          result.status = 'connected';
        } finally {
          client.release();
        }
      }
    } else {
      // Supabase fallback check
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        result.details.supabaseConfigured = true;
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { error } = await supabase.from('employees').select('id').limit(1);
        if (!error || error.code === '42P01') {
          result.details.databaseReachable = true;
          result.status = 'connected';
        } else {
          result.error = error.message;
          result.status = 'degraded';
        }
      } else {
        result.error = 'No database configured';
      }
    }

    result.latency = Date.now() - startTime;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result.latency = Date.now() - startTime;
    result.error = message;
    result.status = result.details.supabaseConfigured ? 'degraded' : 'disconnected';
  }

  return NextResponse.json(result, { status: 200 });
}
