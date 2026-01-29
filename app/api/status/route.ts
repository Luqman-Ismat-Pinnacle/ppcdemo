import { NextResponse } from 'next/server';
import { checkConnectionStatus } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const status = await checkConnectionStatus();
    return NextResponse.json(status, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'disconnected',
        latency: null,
        lastChecked: new Date().toISOString(),
        error: error?.message || 'Unknown error',
        details: {
          supabaseConfigured: false,
          authStatus: 'error',
          databaseReachable: false,
        },
      },
      { status: 500 }
    );
  }
}
