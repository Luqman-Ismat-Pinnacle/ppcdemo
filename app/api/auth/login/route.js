import { handleLogin } from '@auth0/nextjs-auth0';

export const GET = (req, res) => {
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

        return handleLogin(req, res, {
            authorizationParams,
        });
    } catch (error) {
        console.error(error);
        return new Response(error.message, { status: error.status || 500 });
    }
};
