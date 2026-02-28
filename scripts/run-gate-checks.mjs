#!/usr/bin/env node
/**
 * Run gate checks for PPC Full Overhaul phases.
 * Exits 0 if all checks pass, 1 if any fail.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function hasContent(path, ...patterns) {
  if (!existsSync(path)) return false;
  const content = readFileSync(path, 'utf8');
  return patterns.every((p) => (typeof p === 'string' ? content.includes(p) : p.test(content)));
}

function exists(path) {
  return existsSync(join(ROOT, path));
}

const checks = [
  // Phase 1.1
  { id: '1.1-route-config', msg: 'lib/route-data-config.ts with ROUTE_VIEWS, getViewsForPath', pass: () => hasContent(join(ROOT, 'lib/route-data-config.ts'), 'ROUTE_VIEWS', 'getViewsForPath', 'SHELL_TABLE_KEYS') },
  { id: '1.1-db-shell', msg: 'lib/database.ts fetchAllData shell mode', pass: () => hasContent(join(ROOT, 'lib/database.ts'), "mode === 'shell'", 'portfolios', 'customers', 'sites', 'projects', 'employees') },
  { id: '1.1-api-shell', msg: 'app/api/data/route.ts ?shell=true', pass: () => hasContent(join(ROOT, 'app/api/data/route.ts'), 'shell') },
  { id: '1.1-views', msg: 'transformData views option', pass: () => hasContent(join(ROOT, 'lib/data-transforms/transform-data.ts'), 'shouldBuildView', 'views') },
  { id: '1.1-context', msg: 'data-context shell then full load', pass: () => hasContent(join(ROOT, 'lib/data-context.tsx'), 'shell=true', 'getViewsForPath') },

  // Phase 1.2
  { id: '1.2-modules', msg: 'lib/data-transforms/ domain modules', pass: () => ['core', 'wbs', 'resource', 'qc', 'milestones', 'budget-forecast', 'tasks', 'documents', 'utils', 'transform-data', 'index'].every((m) => exists(`lib/data-transforms/${m}.ts`) || (m === 'index' && exists('lib/data-transforms/index.ts'))) },
  { id: '1.2-no-monolith', msg: 'No lib/data-transforms.ts monolith', pass: () => !exists('lib/data-transforms.ts') },
  { id: '1.2-reexport', msg: 'index re-exports transformData, clearMemoizationCache', pass: () => hasContent(join(ROOT, 'lib/data-transforms/index.ts'), 'transformData', 'clearMemoizationCache') },

  // Phase 2
  { id: '2.1-api-params', msg: 'api/data accepts role, email, employeeId', pass: () => hasContent(join(ROOT, 'app/api/data/route.ts'), 'role', 'employeeId') },
  { id: '2.1-fetch-scope', msg: 'database FetchScope and role filtering', pass: () => hasContent(join(ROOT, 'lib/database.ts'), 'FetchScope', 'scope') },
  { id: '2.1-rda', msg: 'RDA employee_id filter', pass: () => hasContent(join(ROOT, 'lib/database.ts'), "role === 'rda'", 'employee_id') },
  { id: '2.1-coo', msg: 'COO 1111 services filter', pass: () => hasContent(join(ROOT, 'lib/database.ts'), "1111 services") },

  // Phase 3
  { id: '3.1-shared', msg: 'app/shared/ with key pages', pass: () => ['wbs-gantt-v2', 'data-management', 'hours', 'tasks', 'resourcing', 'metric-provenance', 'mos-page', 'overview-v2'].every((p) => exists(`app/shared/${p}/page.tsx`) || exists(`app/shared/${p.replace('-v2', '')}/page.tsx`)) },
  { id: '3.3-nav', msg: 'role-navigation points to /shared/', pass: () => hasContent(join(ROOT, 'lib/role-navigation.ts'), '/shared/') },
  { id: '3.4-archive', msg: '_archive/ exists', pass: () => exists('_archive/azure-functions-workday-sync') || exists('_archive/migrations') },

  // Phase 4
  { id: '4.1-docs', msg: 'docs/WORKDAY_SYNC.md', pass: () => exists('docs/WORKDAY_SYNC.md') },
  { id: '4.2-hours-pull', msg: 'scripts/hours-pull.mjs with --from --to --dry-run', pass: () => hasContent(join(ROOT, 'scripts/hours-pull.mjs'), '--from', '--to', '--dry-run') },
  { id: '4.3-hours-match', msg: 'scripts/hours-match.mjs', pass: () => hasContent(join(ROOT, 'scripts/hours-match.mjs'), 'match-hours-to-workday-phases', 'match-hours-workday-mpp-buckets') },

  // Phase 5
  { id: '5.2-chart-tokens', msg: 'globals.css --chart-1 through --chart-6', pass: () => hasContent(join(ROOT, 'app/globals.css'), '--chart-1', '--chart-6') },
  { id: '5.3-card-panel', msg: 'card-panel, kpi-card classes', pass: () => hasContent(join(ROOT, 'app/globals.css'), 'card-panel', 'kpi-card') },

  // Phase 6
  { id: '6.1-chip-modal', msg: 'MetricProvenanceChip modal with formula', pass: () => hasContent(join(ROOT, 'components/ui/MetricProvenanceChip.tsx'), 'trace.formula', 'inputs') },
  { id: '6.2-lineage', msg: 'metric-provenance lineage view', pass: () => hasContent(join(ROOT, 'app/shared/metric-provenance/page.tsx'), 'DATA_FLOW_LINEAGE', 'Data Flow Lineage') },

  // Phase 7
  { id: '7.1-onExplain', msg: 'MetricProvenanceChip onExplain, value props', pass: () => hasContent(join(ROOT, 'components/ui/MetricProvenanceChip.tsx'), 'onExplain', 'value') },
  { id: '7.1-buildMetric', msg: 'buildMetricExplainContext in ai-context', pass: () => hasContent(join(ROOT, 'lib/ai-context.ts'), 'buildMetricExplainContext') },
  { id: '7.1-api-provenance', msg: 'api/ai/query accepts provenance, value', pass: () => hasContent(join(ROOT, 'app/api/ai/query/route.ts'), 'provenance', 'buildMetricExplainContext') },
  { id: '7.1-wired', msg: 'Pages wire onExplain (project-health)', pass: () => hasContent(join(ROOT, 'app/shared/project-health/page.tsx'), 'onExplain', 'useMetricExplain') },
  { id: '7.2-briefing', msg: 'Briefing asks for concrete actions', pass: () => hasContent(join(ROOT, 'app/api/ai/briefing/route.ts'), 'concrete', 'actionable') },

  // Phase 8
  { id: '8.1-light-border', msg: 'Light theme border-color rgba(0,0,0,0.08)', pass: () => hasContent(join(ROOT, 'app/globals.css'), 'rgba(0, 0, 0, 0.08)', 'rgba(0, 0, 0, 0.14)') },
  { id: '8.2-bg-image', msg: 'ambient-image uses PPM Background.png', pass: () => hasContent(join(ROOT, 'app/globals.css'), "url('/PPM Background.png')") },
  { id: '8.3-ambientFloat', msg: 'ambientFloat keyframes, staggered blobs', pass: () => hasContent(join(ROOT, 'app/globals.css'), 'ambientFloat', '20s', '28s', '32s') },
  { id: '8.3-reduced-motion', msg: 'prefers-reduced-motion', pass: () => hasContent(join(ROOT, 'app/globals.css'), 'prefers-reduced-motion') },
  { id: '8.4-grid-56', msg: 'ambient-grid 56px', pass: () => hasContent(join(ROOT, 'app/globals.css'), '56px') },

  // Phase 9
  { id: '9.1-gitignore', msg: 'docs/* !docs/README.md in gitignore', pass: () => hasContent(join(ROOT, '.gitignore'), 'docs/*', '!docs/README.md') },
  { id: '9.1-readme', msg: 'docs/README.md with architecture', pass: () => hasContent(join(ROOT, 'docs/README.md'), 'architecture', 'flowchart') },

  // Phase 10
  { id: '10.1-hierarchy-ids', msg: 'HierarchyFilter ID-based (portfolioId, projectId)', pass: () => hasContent(join(ROOT, 'types/data.ts'), 'portfolioId', 'projectId') },
  { id: '10.1-filter-utils', msg: 'lib/filter-utils.ts getValidProjectIdsFromHierarchyFilter', pass: () => hasContent(join(ROOT, 'lib/filter-utils.ts'), 'getValidProjectIdsFromHierarchyFilter') },
  { id: '10.2-date-persist', msg: 'Date filter localStorage persist/restore', pass: () => hasContent(join(ROOT, 'lib/filter-utils.ts'), 'persistDateFilter', 'restoreDateFilter') },
  { id: '10.2-context-restore', msg: 'data-context restores date filter', pass: () => hasContent(join(ROOT, 'lib/data-context.tsx'), 'restoreDateFilter') },
];

let failed = 0;
for (const c of checks) {
  const ok = c.pass();
  if (!ok) {
    console.log(`FAIL ${c.id}: ${c.msg}`);
    failed++;
  }
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log(`All ${checks.length} gate checks passed.`);
process.exit(0);
