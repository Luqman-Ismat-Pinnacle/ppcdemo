import { handleLogin } from '@auth0/nextjs-auth0';

export async function GET(request) {
    try {
        const connection = process.env.AUTH0_CONNECTION;
        const audience = process.env.AUTH0_AUDIENCE;
        const roleScope = process.env.AUTH0_ROLE_SCOPE;

        const scopeParts = ['openid', 'profile', 'email'];
        if (roleScope) scopeParts.push(roleScope);

        const authorizationParams = {
            prompt: 'login',
            scope: scopeParts.join(' '),
        };

        if (connection) {
            authorizationParams.connection = connection;
        }

        if (audience) {
            authorizationParams.audience = audience;
        }

        return handleLogin(request, {
            authorizationParams,
        });
    } catch (error) {
        console.error(error);
        return new Response(error.message, { status: error.status || 500 });
    }
}
