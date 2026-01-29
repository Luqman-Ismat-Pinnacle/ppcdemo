import { handleCallback } from '@auth0/nextjs-auth0';

export const GET = (req, res) => handleCallback(req, res);
