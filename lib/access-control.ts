/**
 * @fileoverview Access-control helpers for identity-based role overrides.
 *
 * Centralizes privileged-user detection and full-access role semantics so
 * client and server paths stay consistent.
 */

const PRODUCT_OWNER_EMAILS = new Set([
  'luqman.ismat@pinnaclereliability.com',
]);

export function normalizeEmail(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

export function isProductOwnerIdentity(email: string | null | undefined): boolean {
  return PRODUCT_OWNER_EMAILS.has(normalizeEmail(email));
}

export function resolveRoleForIdentity(params: {
  email: string | null | undefined;
  fallbackRole?: string | null;
}): string {
  if (isProductOwnerIdentity(params.email)) {
    return 'Product Owner';
  }
  const fallbackRole = String(params.fallbackRole || '').trim();
  return fallbackRole || 'User';
}

export function hasGlobalViewAccess(params: {
  email: string | null | undefined;
  role: string | null | undefined;
}): boolean {
  if (isProductOwnerIdentity(params.email)) return true;
  const role = String(params.role || '').trim().toLowerCase();
  return role === 'admin' || role === 'administrator';
}

