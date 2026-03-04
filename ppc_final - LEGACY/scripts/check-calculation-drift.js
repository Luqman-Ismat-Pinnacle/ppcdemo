#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Drift guard: prevent reintroduction of inline KPI formulas in overview pages.
 * These pages must use shared selectors/calculation modules.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

const targets = [
  {
    file: 'app/insights/overview/page.tsx',
    banned: [
      /const\s+spiMetric\s*=\s*calcSpi\(/g,
      /const\s+cpiMetric\s*=\s*calcCpi\(/g,
      /const\s+healthMetric\s*=\s*calcHealthScore\(/g,
    ],
  },
  {
    file: 'app/insights/overview-v2/page.tsx',
    banned: [
      /const\s+spiMetric\s*=\s*calcSpi\(/g,
      /const\s+cpiMetric\s*=\s*calcCpi\(/g,
      /const\s+healthMetric\s*=\s*calcHealthScore\(/g,
    ],
  },
  {
    file: 'app/project-controls/project-health/page.tsx',
    banned: [
      /Math\.round\(\(passed\s*\/\s*evaluated\.length\)\s*\*\s*100\)/g,
      /checks\.filter\(c\s*=>\s*c\.passed\s*!==\s*null\s*&&\s*!c\.isMultiLine\)/g,
    ],
    required: [
      /buildHealthCheckScore\(/,
    ],
  },
  {
    file: 'app/insights/mos-page/page.tsx',
    banned: [
      /taskRows\.reduce\(\(s,\s*r\)\s*=>\s*s\s*\+\s*r\.baseline,\s*0\)/g,
      /taskRows\.reduce\(\(s,\s*r\)\s*=>\s*s\s*\+\s*r\.actual,\s*0\)/g,
    ],
    required: [
      /buildPeriodHoursSummary\(/,
    ],
  },
  {
    file: 'app/insights/tasks/page.tsx',
    banned: [
      /\(Number\(t\.actualHours\)\s*\|\|\s*0\)\s*\/\s*\(Number\(t\.baselineHours\)\s*\|\|\s*1\)/g,
      /charge\.ex\s*>\s*0\s*&&\s*charge\.qc\s*===\s*0\s*&&\s*\(t\.percentComplete\s*\|\|\s*0\)\s*>\s*50/g,
      /efficiency\s*>\s*1\.2\s*&&\s*daysToDeadline\s*<\s*3/g,
    ],
    required: [
      /toTaskEfficiencyPct\(/,
      /buildTaskDecisionFlags\(/,
      /calcTaskEfficiencyPct\(/,
    ],
  },
  {
    file: 'app/project-controls/resourcing/page.tsx',
    banned: [
      /Math\.round\(\(actualHours\s*\/\s*allocatedHours\)\s*\*\s*100\)/g,
    ],
    required: [
      /toTaskEfficiencyPct\(/,
    ],
  },
  {
    file: 'app/project-controls/wbs-gantt/page.tsx',
    banned: [
      /baselineHours\s*>\s*0\s*\?\s*\(actualHours\s*\/\s*baselineHours\)\s*\*\s*100\s*:\s*0/g,
    ],
    required: [
      /toTaskEfficiencyPct\(/,
    ],
  },
  {
    file: 'app/project-controls/wbs-gantt-v2/page.tsx',
    banned: [
      /baselineHours\s*>\s*0\s*\?\s*\(actualHours\s*\/\s*baselineHours\)\s*\*\s*100\s*:\s*0/g,
    ],
    required: [
      /toTaskEfficiencyPct\(/,
    ],
  },
];

const violations = [];

for (const target of targets) {
  const full = path.join(root, target.file);
  const content = fs.readFileSync(full, 'utf8');
  for (const pattern of target.banned) {
    if (pattern.test(content)) {
      violations.push(`${target.file} still contains direct KPI derivation instead of shared selector: ${pattern}`);
    }
  }

  if (
    target.file.startsWith('app/insights/overview') &&
    (!/buildProjectBreakdown\(/.test(content) || !/buildPortfolioAggregate\(/.test(content))
  ) {
    violations.push(`${target.file} must use buildProjectBreakdown() and buildPortfolioAggregate().`);
  }

  if (Array.isArray(target.required)) {
    for (const pattern of target.required) {
      if (!pattern.test(content)) {
        violations.push(`${target.file} is missing required shared selector usage: ${pattern}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('\n[calc-drift] FAILED\n');
  violations.forEach(v => console.error(` - ${v}`));
  process.exit(1);
}

console.log('[calc-drift] PASS');
