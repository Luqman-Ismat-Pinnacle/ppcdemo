import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  calcCpi,
  calcEfficiencyPct,
  calcHealthScore,
  calcHoursVariancePct,
  calcIeacCpi,
  calcSpi,
  calcTaskEfficiencyPct,
  calcTcpiToBac,
  calcUtilizationPct,
} from '../lib/calculations/kpis';
import {
  buildHealthCheckScore,
  buildPeriodHoursSummary,
  buildPortfolioAggregate,
  buildProjectBreakdown,
  buildTaskDecisionFlags,
  toTaskEfficiencyPct,
} from '../lib/calculations/selectors';

function approx(actual: number, expected: number, epsilon = 0.0001): void {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${expected} but received ${actual} (epsilon=${epsilon})`,
  );
}

function readSnapshot(snapshotPath: string): Record<string, unknown> {
  const raw = fs.readFileSync(snapshotPath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function main(): void {
  const cpi = calcCpi(164, 170, 'test', 'fixture');
  const spi = calcSpi(164, 200, 'test', 'fixture');
  const hv = calcHoursVariancePct(170, 200, 'test', 'fixture');
  const health = calcHealthScore(spi.value, cpi.value, 'test', 'fixture');
  const ieac = calcIeacCpi(1000, 0.8, 'test', 'fixture');
  const tcpi = calcTcpiToBac(1000, 400, 500, 'test', 'fixture');
  const eff = calcEfficiencyPct(90, 10, 'test', 'fixture');
  const taskEff = calcTaskEfficiencyPct(120, 100, 'test', 'fixture');
  const util = calcUtilizationPct(1800, 2080, 'test', 'fixture');

  approx(cpi.value, 0.96);
  approx(spi.value, 0.82);
  approx(hv.value, -15);
  approx(health.value, 65);
  approx(ieac.value, 1250);
  approx(tcpi.value, 1.2);
  approx(eff.value, 90);
  approx(taskEff.value, 120);
  approx(util.value, 87);
  assert.equal(taskEff.provenance.id, 'TASK_EFFICIENCY_PCT_V1');
  assert.equal(util.provenance.id, 'UTILIZATION_PCT_V1');

  const projects = [
    { id: 'p1', name: 'Alpha', siteId: 's1' },
    { id: 'p2', name: 'Beta', siteId: 's1' },
  ];
  const sites = [{ id: 's1', name: 'West' }];
  const tasks = [
    { id: 't1', projectId: 'p1', baselineHours: 100, actualHours: 120, percentComplete: 80, status: 'In Progress' },
    { id: 't2', projectId: 'p1', baselineHours: 60, actualHours: 30, percentComplete: 100, status: 'Complete' },
    { id: 't3', projectId: 'p2', baselineHours: 40, actualHours: 20, percentComplete: 50, status: 'In Progress' },
  ];
  const hours = [
    { projectId: 'p1', hours: 100, actualCost: 10000, chargeType: 'EX' },
    { projectId: 'p1', hours: 20, actualCost: 2000, chargeType: 'QC' },
    { projectId: 'p2', hours: 25, actualCost: 3000, chargeType: 'EX' },
  ];

  const breakdown = buildProjectBreakdown(tasks, projects, hours, sites, 'project');
  const portfolio = buildPortfolioAggregate(breakdown, 'project');

  assert.equal(breakdown.length, 2);
  assert.equal(portfolio.projectCount, 2);
  approx(portfolio.healthScore, 65);
  approx(portfolio.spi, 0.82);
  approx(portfolio.cpi, 0.96);
  approx(portfolio.hrsVariance, -15);
  assert.ok(portfolio.remainingHours >= 0);
  assert.ok(portfolio.healthScore >= 0 && portfolio.healthScore <= 100);
  assert.equal(portfolio.provenance.health.id, 'HEALTH_SCORE_V1');
  assert.equal(portfolio.provenance.hoursVariance.id, 'HOURS_VARIANCE_PCT_V1');

  const period = buildPeriodHoursSummary([
    { baseline: 100, actual: 120 },
    { baseline: 60, actual: 30 },
    { baseline: 40, actual: 20 },
  ]);
  assert.equal(period.plan, 200);
  assert.equal(period.actual, 170);
  assert.equal(period.added, 0);
  assert.equal(period.reduced, 30);
  assert.equal(period.deltaHours, -30);
  approx(period.deltaPct, -15);
  assert.equal(period.efficiency, 85);
  assert.ok(!(period.added > 0 && period.reduced > 0), 'Added/reduced must be mutually exclusive');

  const healthScore = buildHealthCheckScore([
    { id: '1', isMultiLine: false, passed: true },
    { id: '2', isMultiLine: false, passed: false },
    { id: '3', isMultiLine: false, passed: true },
    { id: '4', isMultiLine: false, passed: null },
    { id: '5', isMultiLine: true, passed: true },
  ]);
  assert.equal(healthScore.overallScore, 67);
  assert.equal(healthScore.passed, 2);
  assert.equal(healthScore.failed, 1);
  assert.equal(healthScore.evaluated, 3);
  assert.equal(healthScore.pending, 1);

  const flags = buildTaskDecisionFlags({
    exHours: 12,
    qcHours: 0,
    percentComplete: 75,
    efficiencyPct: toTaskEfficiencyPct(130, 100),
    daysToDeadline: 2,
  });
  assert.equal(flags.needsQC, true);
  assert.equal(flags.needsSupport, true);
  assert.equal(flags.tag, 'Needs QC');

  const regression = {
    overview: {
      healthScore: portfolio.healthScore,
      spi: portfolio.spi,
      cpi: portfolio.cpi,
      hoursVariancePct: portfolio.hrsVariance,
      projectCount: portfolio.projectCount,
      totalHours: portfolio.totalHours,
      baselineHours: portfolio.baselineHours,
    },
    hours: {
      efficiencyPct: eff.value,
    },
    forecast: {
      cpi: cpi.value,
      spi: spi.value,
      ieacCpi: ieac.value,
      tcpiToBac: tcpi.value,
    },
    mosPage: {
      planHours: period.plan,
      actualHours: period.actual,
      reducedHours: period.reduced,
      deltaHours: period.deltaHours,
      deltaPct: period.deltaPct,
      efficiencyPct: period.efficiency,
    },
    projectHealth: {
      passed: healthScore.passed,
      evaluated: healthScore.evaluated,
      pending: healthScore.pending,
      score: healthScore.overallScore,
    },
    tasks: {
      taskEfficiencyPct: taskEff.value,
      needsQc: flags.needsQC,
      needsSupport: flags.needsSupport,
      triageTag: flags.tag,
    },
    resourcing: {
      avgUtilizationPct: util.value,
    },
  };

  const snapshotPath = path.join(process.cwd(), 'scripts', 'fixtures', 'calculation-regression-snapshot.json');
  const expectedSnapshot = readSnapshot(snapshotPath);
  assert.deepEqual(regression, expectedSnapshot);

  console.log('[calc-correctness] PASS');
}

main();
