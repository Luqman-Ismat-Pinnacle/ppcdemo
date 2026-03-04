import { handleLogin } from '@auth0/nextjs-auth0';

export async function GET(request: Request) {
  try {
    const connection = process.env.AUTH0_CONNECTION;
    const audience = process.env.AUTH0_AUDIENCE;
    const roleScope = process.env.AUTH0_ROLE_SCOPE;

    const scopeParts = ['openid', 'profile', 'email'];
    if (roleScope) scopeParts.push(roleScope);

    const authorizationParams: Record<string, string> = {
      prompt: 'login',
      scope: scopeParts.join(' '),
    };

    if (connection) authorizationParams.connection = connection;
    if (audience) authorizationParams.audience = audience;

    // @ts-expect-error Auth0 SDK types expect NextRequest; Request works at runtime
    return handleLogin(request, { params: {} }, { authorizationParams });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    const status = (error as { status?: number })?.status ?? 500;
    return new Response(message, { status });
  }
}
