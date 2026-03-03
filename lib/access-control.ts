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

function canonicalizeRole(raw: string | null | undefined): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  const lower = value.toLowerCase();

  // Direct aliases
  if (lower === 'coo' || lower.includes('chief operating officer')) return 'COO';
  if (lower === 'pcl' || lower.includes('project controls lead') || lower.includes('controls lead')) return 'PCL';
  if (lower === 'pca' || lower.includes('project controls analyst') || lower.includes('controls analyst')) return 'PCA';
  if (lower === 'sm' || lower.includes('senior manager')) return 'Senior Manager';
  if (lower === 'pl' || lower.includes('project lead')) return 'Project Lead';
  if (lower === 'po' || lower.includes('product owner')) return 'Product Owner';

  // If already a known exact display role, keep it.
  if (value === 'Senior Manager' || value === 'Project Lead' || value === 'Product Owner') return value;

  return '';
}

export function resolveRoleForIdentity(params: {
  email: string | null | undefined;
  fallbackRole?: string | null;
}): string {
  const email = normalizeEmail(params.email);
  if (ROLE_OVERRIDES[email]) return ROLE_OVERRIDES[email];
  const mappedFallback = canonicalizeRole(params.fallbackRole);
  return mappedFallback || 'PCA';
}

export function canSwitchViews(email: string | null | undefined): boolean {
  return CAN_SWITCH_VIEWS_EMAILS.has(normalizeEmail(email));
}
