import { handleProfile } from '@auth0/nextjs-auth0';

export async function GET(request) {
  const profileHandler = handleProfile();
  return profileHandler(request);
}
