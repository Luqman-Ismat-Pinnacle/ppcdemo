/**
 * Access control and role resolution for ppc-minimal.
 * Email-based overrides for known users; otherwise uses employees table / default.
 */

const ROLE_OVERRIDES: Record<string, string> = {
  'mauricio.olivares@pinnaclereliability.com': 'COO',
  'angel.barras@pinnaclereliability.com': 'PCL',
  'luqman.ismat@pinnaclereliability.com': 'Product Owner',
};

/** Only Luqman can see the role view switcher */
const CAN_SWITCH_VIEWS_EMAILS = new Set(['luqman.ismat@pinnaclereliability.com']);

export function normalizeEmail(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

export function resolveRoleForIdentity(params: {
  email: string | null | undefined;
  fallbackRole?: string | null;
}): string {
  const email = normalizeEmail(params.email);
  if (ROLE_OVERRIDES[email]) return ROLE_OVERRIDES[email];
  const fallbackRole = String(params.fallbackRole || '').trim();
  return fallbackRole || 'PCA';
}

export function canSwitchViews(email: string | null | undefined): boolean {
  return CAN_SWITCH_VIEWS_EMAILS.has(normalizeEmail(email));
}
