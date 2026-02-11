/**
 * @fileoverview NextAuth.js Configuration
 *
 * Uses Microsoft Entra ID (Azure AD) for authentication.
 * After sign-in, matches the user's name/email against the employees table
 * to pull their role, department, and management level.
 *
 * Required env vars:
 *   NEXTAUTH_SECRET       – random secret for JWT signing
 *   AZURE_AD_CLIENT_ID    – from Azure Portal > App Registrations
 *   AZURE_AD_CLIENT_SECRET– from Azure Portal > App Registrations > Certificates & secrets
 *   AZURE_AD_TENANT_ID    – your Azure AD tenant ID (or 'common' for multi-tenant)
 *
 * Set NEXT_PUBLIC_AUTH_DISABLED=true to bypass auth entirely (uses demo user).
 */

import type { NextAuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import CredentialsProvider from 'next-auth/providers/credentials';
import { isPostgresConfigured, query as pgQuery } from '@/lib/postgres';

const hasAzureAD = !!(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET);

const providers: NextAuthOptions['providers'] = [];

if (hasAzureAD) {
  providers.push(
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID || 'common',
      authorization: {
        params: { scope: 'openid profile email User.Read' },
      },
    })
  );
}

// Fallback credentials provider for development when Azure AD is not configured
if (!hasAzureAD) {
  providers.push(
    CredentialsProvider({
      name: 'Development Login',
      credentials: {
        name: { label: 'Name', type: 'text', placeholder: 'Your name' },
        email: { label: 'Email', type: 'email', placeholder: 'your@email.com' },
      },
      async authorize(credentials) {
        if (!credentials?.name || !credentials?.email) return null;
        return { id: credentials.email, name: credentials.name, email: credentials.email };
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async jwt({ token, account, profile, user }) {
      // On first sign-in, match user against employees table for role
      if (account) {
        const name = (profile as any)?.name || user?.name || token.name || '';
        const email = (profile as any)?.email || (profile as any)?.preferred_username || user?.email || token.email || '';

        token.name = name;
        token.email = email;
        token.role = 'User'; // default

        if (isPostgresConfigured() && (name || email)) {
          try {
            const result = await pgQuery(
              `SELECT name, email, role, job_title, management_level, employee_id, department
               FROM employees
               WHERE (is_active IS NULL OR is_active = true)
                 AND (LOWER(name) = LOWER($1) OR LOWER(email) = LOWER($2))
               LIMIT 1`,
              [name, email]
            );
            if (result.rows.length > 0) {
              const emp = result.rows[0];
              token.role = emp.role || emp.job_title || 'User';
              token.employeeId = emp.employee_id;
              token.department = emp.department || '';
              token.managementLevel = emp.management_level || '';
              console.log(`[Auth] Matched employee: ${emp.name} → role: ${token.role}`);
            } else {
              console.log(`[Auth] No employee match for: ${name} / ${email}`);
            }
          } catch (e) {
            console.error('[Auth] Employee match error:', e);
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = (token.role as string) || 'User';
        (session.user as any).employeeId = token.employeeId || null;
        (session.user as any).department = token.department || '';
        (session.user as any).managementLevel = token.managementLevel || '';
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },
  pages: {
    signIn: hasAzureAD ? undefined : '/api/auth/signin',
  },
};
