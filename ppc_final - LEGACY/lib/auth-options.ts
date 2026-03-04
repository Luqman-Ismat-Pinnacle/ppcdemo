/**
 * @fileoverview Auth options compatibility stub.
 *
 * NextAuth-based auth was removed from this codebase; runtime auth now flows
 * through the active Auth0/local middleware stack. This file remains only to
 * preserve the historical `authOptions` export for any legacy imports.
 */

export interface LegacyAuthOptions {
  providers: unknown[];
  callbacks?: Record<string, unknown>;
  secret?: string;
  session?: {
    strategy?: string;
    maxAge?: number;
  };
  pages?: {
    signIn?: string;
  };
}

export const authOptions: LegacyAuthOptions = {
  providers: [],
};

