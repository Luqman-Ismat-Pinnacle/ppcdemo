#!/usr/bin/env node

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

  if (!/buildProjectBreakdown\(/.test(content) || !/buildPortfolioAggregate\(/.test(content)) {
    violations.push(`${target.file} must use buildProjectBreakdown() and buildPortfolioAggregate().`);
  }
}

if (violations.length > 0) {
  console.error('\n[calc-drift] FAILED\n');
  violations.forEach(v => console.error(` - ${v}`));
  process.exit(1);
}

console.log('[calc-drift] PASS');
