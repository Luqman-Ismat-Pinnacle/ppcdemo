import { handleCallback } from '@auth0/nextjs-auth0';

export async function GET(request) {
  const callbackHandler = handleCallback();
  return callbackHandler(request);
}
