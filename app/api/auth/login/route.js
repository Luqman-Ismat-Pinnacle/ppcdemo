import { handleLogin } from '@auth0/nextjs-auth0';

export const GET = (req, res) => {
    try {
        return handleLogin(req, res, {
            authorizationParams: {
                prompt: 'login',
            },
        });
    } catch (error) {
        console.error(error);
        return new Response(error.message, { status: error.status || 500 });
    }
};
