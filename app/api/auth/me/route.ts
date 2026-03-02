import { handleProfile } from '@auth0/nextjs-auth0';
import { NextResponse } from 'next/server';

const AUTH_DISABLED = process.env.NEXT_PUBLIC_AUTH_DISABLED === 'true';

export async function GET(request: Request) {
  if (AUTH_DISABLED) {
    return NextResponse.json({
      user: { name: 'Demo User (PCA)', email: 'demo@pinnacle.com' },
      demo: true,
    });
  }
  // @ts-expect-error Auth0 SDK types expect NextRequest; Request works at runtime
  return handleProfile(request, { params: {} });
}
