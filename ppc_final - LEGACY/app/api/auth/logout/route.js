import { handleLogout } from '@auth0/nextjs-auth0';

export async function GET(request) {
  return handleLogout(request, { params: {} }, {
    returnTo: process.env.AUTH0_BASE_URL || '/',
  });
}
