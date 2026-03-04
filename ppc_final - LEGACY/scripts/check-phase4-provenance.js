#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Phase 4 gate:
 * - major KPI pages must render provenance chips
 * - major KPI pages must use shared calculations/selectors
 * - formula IDs in types and registry must stay aligned
 */

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const coverageTargets = [
  {
    file: 'app/insights/overview/page.tsx',
    required: [/MetricProvenanceChip/, /buildPortfolioAggregate\(/, /portfolio\.provenance\.health/, /portfolio\.provenance\.hoursVariance/],
  },
  {
    file: 'app/insights/overview-v2/page.tsx',
    required: [/MetricProvenanceChip/, /buildPortfolioAggregate\(/, /portfolio\.provenance\.health/, /portfolio\.provenance\.hoursVariance/],
  },
  {
    file: 'app/project-management/forecast/page.tsx',
    required: [/MetricProvenanceChip/, /calcCpi\(/, /calcSpi\(/, /calcIeacCpi\(/, /calcTcpiToBac\(/],
  },
  {
    file: 'app/insights/hours/page.tsx',
    required: [/MetricProvenanceChip/, /calcEfficiencyPct\(/],
  },
  {
    file: 'app/insights/tasks/page.tsx',
    required: [/MetricProvenanceChip/, /calcTaskEfficiencyPct\(/, /buildTaskDecisionFlags\(/],
  },
  {
    file: 'app/insights/mos-page/page.tsx',
    required: [/MetricProvenanceChip/, /buildPeriodHoursSummary\(/, /calcHoursVariancePct\(/],
  },
  {
    file: 'app/project-controls/resourcing/page.tsx',
    required: [/MetricProvenanceChip/, /calcUtilizationPct\(/],
  },
  {
    file: 'app/project-controls/project-health/page.tsx',
    required: [/MetricProvenanceChip/, /buildHealthCheckScore\(/],
  },
  {
    file: 'app/insights/metric-provenance/page.tsx',
    required: [/METRIC_DEFINITIONS/, /Metric Provenance Index/],
  },
  {
    file: 'components/ui/MetricProvenanceChip.tsx',
    required: [/Formula:/, /Source:/, /Inputs/, /Computation Steps/],
  },
];

function parseUnionIds(source) {
  const unionMatch = source.match(/export\s+type\s+FormulaId\s*=([\s\S]*?);/);
  if (!unionMatch) return [];
  const ids = [];
  const re = /'([A-Z0-9_]+)'/g;
  let m;
  while ((m = re.exec(unionMatch[1])) !== null) {
    ids.push(m[1]);
  }
  return ids;
}

function parseRegistryIds(source) {
  const ids = [];
  const re = /id:\s*'([A-Z0-9_]+)'/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    ids.push(m[1]);
  }
  return ids;
}

const failures = [];

for (const target of coverageTargets) {
  const content = read(target.file);
  for (const pattern of target.required) {
    if (!pattern.test(content)) {
      failures.push(`${target.file} missing required provenance/calc marker: ${pattern}`);
    }
  }
}

const typeIds = parseUnionIds(read('lib/calculations/types.ts'));
const registryIds = parseRegistryIds(read('lib/calculations/registry.ts'));

for (const id of typeIds) {
  if (!registryIds.includes(id)) {
    failures.push(`FormulaId ${id} exists in lib/calculations/types.ts but not in lib/calculations/registry.ts`);
  }
}
for (const id of registryIds) {
  if (!typeIds.includes(id)) {
    failures.push(`FormulaId ${id} exists in lib/calculations/registry.ts but not in lib/calculations/types.ts`);
  }
}

if (failures.length) {
  console.error('\n[phase4-provenance] FAILED\n');
  failures.forEach((f) => console.error(` - ${f}`));
  process.exit(1);
}

console.log('[phase4-provenance] PASS');
