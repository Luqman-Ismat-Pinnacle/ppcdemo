import { handleLogout } from '@auth0/nextjs-auth0';

export async function GET(request) {
  const logoutWithReturn = handleLogout({
    returnTo: process.env.AUTH0_BASE_URL || '/',
  });
  return logoutWithReturn(request);
}
