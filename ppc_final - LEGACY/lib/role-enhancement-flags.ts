/**
 * @fileoverview Role workstation enhancement feature flags.
 *
 * Allows staged rollout of tiered role workstation routes:
 * - tier1: critical functional pages
 * - tier2: depth/quality pages
 * - tier3: polish pages
 */

export type RoleEnhanceTier = 'tier1' | 'tier2' | 'tier3';

function readEnvFlag(name: string, defaultValue: boolean): boolean {
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (!value) return defaultValue;
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function getRoleEnhancementFlags(): Record<RoleEnhanceTier, boolean> {
  return {
    tier1: readEnvFlag('NEXT_PUBLIC_ROLE_ENHANCE_TIER1', true),
    tier2: readEnvFlag('NEXT_PUBLIC_ROLE_ENHANCE_TIER2', true),
    tier3: readEnvFlag('NEXT_PUBLIC_ROLE_ENHANCE_TIER3', true),
  };
}

export function isRoleEnhancementTierEnabled(tier: RoleEnhanceTier): boolean {
  return Boolean(getRoleEnhancementFlags()[tier]);
}
