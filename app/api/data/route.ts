import { NextResponse } from 'next/server';
import { fetchAllData } from '@/lib/database';

export async function GET() {
  try {
    const data = await fetchAllData();
    
    if (!data) {
      return NextResponse.json({ data: null, error: 'No database configured' }, { status: 200 });
    }
    
    return NextResponse.json({ data, error: null }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching data:', error);
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
}
