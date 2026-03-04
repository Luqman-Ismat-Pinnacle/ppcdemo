/**
 * @fileoverview Feature flags for the layout + data optimization rollout.
 */

function readFlag(name: string, fallback: boolean): boolean {
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (!value) return fallback;
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function getLayoutDataOptimizationFlags() {
  return {
    layoutShellV2: readFlag('NEXT_PUBLIC_UI_LAYOUT_SHELL_V2', true),
    roleNavCanonicalOnly: readFlag('NEXT_PUBLIC_UI_ROLE_NAV_CANONICAL_ONLY', true),
    commandCenterSectionState: readFlag('NEXT_PUBLIC_UI_COMMAND_CENTER_SECTION_STATE', true),
    metricContractTier1: readFlag('NEXT_PUBLIC_DATA_METRIC_CONTRACT_TIER1', true),
    metricDriftTier1: readFlag('NEXT_PUBLIC_OBS_METRIC_DRIFT_TIER1', true),
  };
}
