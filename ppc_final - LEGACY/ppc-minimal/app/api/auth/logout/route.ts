import { handleLogout } from '@auth0/nextjs-auth0';

export async function GET(request: Request) {
  // @ts-expect-error Auth0 SDK types expect NextRequest; Request works at runtime
  return handleLogout(request, { params: {} }, {
    returnTo: process.env.AUTH0_BASE_URL || 'http://localhost:3001',
  });
}
