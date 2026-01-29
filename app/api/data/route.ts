import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { fetchAllData } from '@/lib/database';

export async function GET() {
  try {
    const data = await fetchAllData();
    
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
  } catch (error: any) {
    console.error('Error fetching data:', error);
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
}
