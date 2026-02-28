import { handleProfile } from '@auth0/nextjs-auth0';
import { NextResponse } from 'next/server';

const AUTH_DISABLED = process.env.NEXT_PUBLIC_AUTH_DISABLED === 'true';

export async function GET(request) {
  if (AUTH_DISABLED) {
    return NextResponse.json({
      user: { name: 'Demo User (COO)', email: 'demo@pinnacle.com' },
      demo: true,
    });
  }
  return handleProfile(request, { params: {} });
}
