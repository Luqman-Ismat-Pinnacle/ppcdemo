import { handleLogout } from '@auth0/nextjs-auth0';

const logoutWithReturn = handleLogout({
  returnTo: process.env.AUTH0_BASE_URL || '/',
});

export const GET = logoutWithReturn;
