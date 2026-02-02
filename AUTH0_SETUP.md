# Auth0 Setup for PPC

## Vercel Environment Variables

Add these in **Vercel** → Project → Settings → Environment Variables:

| Variable | Value | Environment |
|----------|-------|-------------|
| `AUTH0_SECRET` | Your secret (e.g. 32+ char random string) | Production, Preview |
| `AUTH0_BASE_URL` | Your Vercel URL (e.g. `https://your-app.vercel.app`) | Production, Preview |
| `AUTH0_ISSUER_BASE_URL` | Your Auth0 tenant (e.g. `https://your-tenant.auth0.com`) | Production, Preview |
| `AUTH0_CLIENT_ID` | Auth0 Application Client ID | Production, Preview |
| `AUTH0_CLIENT_SECRET` | Auth0 Application Client Secret | Production, Preview |

### Optional – session and inactivity

| Variable | Value | Description |
|----------|-------|-------------|
| `AUTH0_SESSION_ROLLING` | `false` | Session does not extend with activity |
| `AUTH0_SESSION_ABSOLUTE_DURATION` | `3600` | Session expires after 1 hour (seconds) |

**Note:** The app also implements a **client-side inactivity logout** (1 hour) that runs independently of these env vars.

## Auth0 Dashboard

1. **Applications** → Your Application → Settings
2. **Allowed Callback URLs:** `https://your-app.vercel.app/api/auth/callback`
3. **Allowed Logout URLs:** `https://your-app.vercel.app`
4. **Allowed Web Origins:** `https://your-app.vercel.app`

## Local development

Create `.env.local`:

```
AUTH0_SECRET=your-32-plus-char-secret
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
```

Use `http://localhost:3000` in the Auth0 **Allowed Callback URLs** and **Allowed Logout URLs** as well.

## Behavior

- Unauthenticated users are redirected to Auth0 login.
- After 1 hour of inactivity, users are logged out and sent back to the login page.
- Session does not persist across browser restarts (default).
