'use client';

/**
 * @fileoverview Project Health Page for PPC V3 Project Controls.
 * 
 * Provides comprehensive project health assessment with:
 * - 35 health check items organized by category
 * - Pass/fail checkmarks with failure reason selection
 * - Comments field for each check
 * - Approval workflow section
 * - Overall health score calculation
 * 
 * @module app/project-controls/project-health/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import EnhancedTooltip from '@/components/ui/EnhancedTooltip';
import ContainerLoader from '@/components/ui/ContainerLoader';
import type {
  ProjectHealth,
  HealthCheckItem,
  HealthApproval,
  HealthCheckFailureReason
} from '@/types/data';
import { DEFAULT_HEALTH_CHECKS } from '@/types/data';
import {
  type SortState,
  formatSortIndicator,
  getNextSortState,
  sortByState,
} from '@/lib/sort-utils';
import {
  ProjectState,
  DEFAULT_ENGINE_PARAMS,
} from '@/lib/forecasting-engine';
import MetricProvenanceChip from '@/components/ui/MetricProvenanceChip';
import type { MetricProvenance } from '@/lib/calculations/types';
import { buildHealthCheckScore } from '@/lib/calculations/selectors';

// Generate unique ID
const generateId = (prefix: string): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}-${timestamp}${random}`.toUpperCase();
};

// Category labels
const CATEGORY_LABELS: Record<string, string> = {
  scope: 'Scope Verification',
  tasks: 'Task Definition',
  structure: 'Schedule Structure',
  resources: 'Resource Assignment',
  compliance: 'Compliance & Standards',
};

// Failure reasons (excluding null)
const FAILURE_REASONS: Exclude<HealthCheckFailureReason, null>[] = [
  'Scope Gaps',
  'Missing Logic',
  'Resources',
  'Structure',
];

export default function ProjectHealthPage() {
  const { filteredData, data, updateData, isLoading } = useData();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['scope', 'tasks', 'structure', 'resources', 'compliance'])
  );
  const [checkSortStates, setCheckSortStates] = useState<Record<string, SortState | null>>({});

  // Auto-select first project from filtered list
  const selectedProjectId = filteredData.projects.length > 0
    ? filteredData.projects[0].projectId
    : '';

  // Get current health record or create new
  const currentHealth = useMemo(() => {
    if (!selectedProjectId) return null;

    const existing = data.projectHealth.find(h => h.projectId === selectedProjectId);
    if (existing) return existing;

    // Create new health record
    const newHealth: ProjectHealth = {
      id: generateId('PHC'),
      projectId: selectedProjectId,
      projectName: filteredData.projects.find(p => p.projectId === selectedProjectId)?.name || '',
      scheduleRequired: false,
      totalContract: 0,
      revTd: 0,
      billedTd: 0,
      latestForecastedCost: 0,
      forecastedGp: 0,
      forecastedGm: 0,
      baselineWork: 0,
      actualWork: 0,
      remainingWork: 0,
      workVariance: 0,
      baselineCost: 0,
      actualCost: 0,
      scheduleForecastedCost: 0,
      costVariance: 0,
      scheduleCostForecastedCostVariance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      checks: DEFAULT_HEALTH_CHECKS.map((check, idx) => ({
        ...check,
        id: `check-${idx}`,
      })),
      approvals: {
        pcQcComplete: { role: 'Project Controls QC Complete', name: '', date: null, approved: false, comments: '' },
        projectLeadAcknowledged: { role: 'Project Lead Acknowledged', name: '', date: null, approved: false, comments: '' },
        seniorManagerApproval: { role: 'Senior Manager Approval', name: '', date: null, approved: false, comments: '' },
        approvedForExecution: { role: 'Approved for Execution Setup', name: '', date: null, approved: false, comments: '' },
      },
      overallStatus: 'draft',
      overallScore: 0,
    };

    return newHealth;
  }, [selectedProjectId, data.projectHealth, filteredData.projects]);

  const healthScoreSummary = useMemo(
    () => buildHealthCheckScore(currentHealth?.checks || []),
    [currentHealth]
  );

  // Calculate overall score
  const overallScore = healthScoreSummary.overallScore;

  const effectiveScore = useMemo(() => {
    if (!currentHealth) return overallScore;
    const manual = Number((currentHealth as any).manualHealthOverride);
    if (Number.isFinite(manual)) return Math.max(0, Math.min(100, Math.round(manual)));
    return overallScore;
  }, [currentHealth, overallScore]);

  const healthScoreProvenance = useMemo<MetricProvenance>(() => {
    return {
      id: 'HEALTH_SCORE_V1',
      version: 'v1',
      label: 'Project Health Score',
      dataSources: ['project_health.checks'],
      scope: selectedProjectId || 'project',
      timeWindow: 'current',
      inputs: [
        { key: 'passed_checks', label: 'Passed Checks', value: healthScoreSummary.passed },
        { key: 'evaluated_checks', label: 'Evaluated Checks', value: healthScoreSummary.evaluated },
      ],
      trace: {
        formula: '(Passed Checks / Evaluated Checks) * 100',
        steps: [
          `Passed=${healthScoreSummary.passed}`,
          `Evaluated=${healthScoreSummary.evaluated}`,
          `Pending=${healthScoreSummary.pending}`,
          `Score=${effectiveScore}%`,
        ],
        computedAt: new Date().toISOString(),
      },
    };
  }, [selectedProjectId, effectiveScore, healthScoreSummary]);

  // Group checks by category
  const checksByCategory = useMemo(() => {
    if (!currentHealth) return {};
    const grouped: Record<string, HealthCheckItem[]> = {};
    currentHealth.checks.forEach(check => {
      if (!grouped[check.category]) {
        grouped[check.category] = [];
      }
      grouped[check.category].push(check);
    });
    return grouped;
  }, [currentHealth]);

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  // Update check item
  const updateCheck = useCallback((checkId: string, updates: Partial<HealthCheckItem>) => {
    if (!currentHealth) return;

    const updatedChecks = currentHealth.checks.map(check =>
      check.id === checkId ? { ...check, ...updates } : check
    );

    const updatedHealth: ProjectHealth = {
      ...currentHealth,
      checks: updatedChecks,
      updatedAt: new Date().toISOString(),
    };

    // Update in data
    const existingIndex = data.projectHealth.findIndex(h => h.projectId === currentHealth.projectId);
    const newHealthData = existingIndex >= 0
      ? data.projectHealth.map((h, i) => i === existingIndex ? updatedHealth : h)
      : [...data.projectHealth, updatedHealth];

    updateData({ projectHealth: newHealthData });
  }, [currentHealth, data.projectHealth, updateData]);

  const updateHealthFields = useCallback((updates: Partial<ProjectHealth> & Record<string, any>) => {
    if (!currentHealth) return;
    const updatedHealth: ProjectHealth = {
      ...currentHealth,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    const existingIndex = data.projectHealth.findIndex(h => h.projectId === currentHealth.projectId);
    const newHealthData = existingIndex >= 0
      ? data.projectHealth.map((h, i) => i === existingIndex ? updatedHealth : h)
      : [...data.projectHealth, updatedHealth];
    updateData({ projectHealth: newHealthData });
  }, [currentHealth, data.projectHealth, updateData]);

  // Update approval
  const updateApproval = useCallback((key: keyof ProjectHealth['approvals'], updates: Partial<HealthApproval>) => {
    if (!currentHealth) return;

    const updatedApprovals = {
      ...currentHealth.approvals,
      [key]: { ...currentHealth.approvals[key], ...updates },
    };

    const updatedHealth: ProjectHealth = {
      ...currentHealth,
      approvals: updatedApprovals,
      updatedAt: new Date().toISOString(),
    };

    const existingIndex = data.projectHealth.findIndex(h => h.projectId === currentHealth.projectId);
    const newHealthData = existingIndex >= 0
      ? data.projectHealth.map((h, i) => i === existingIndex ? updatedHealth : h)
      : [...data.projectHealth, updatedHealth];

    updateData({ projectHealth: newHealthData });
  }, [currentHealth, data.projectHealth, updateData]);

  // Get category stats
  const getCategoryStats = (checks: HealthCheckItem[]) => {
    const total = checks.filter(c => !c.isMultiLine).length;
    const passed = checks.filter(c => c.passed === true && !c.isMultiLine).length;
    const failed = checks.filter(c => c.passed === false && !c.isMultiLine).length;
    const pending = total - passed - failed;
    return { total, passed, failed, pending };
  };

  return (
    <div
      className="page-panel"
      style={{
        height: 'calc(100vh - 80px)',
        overflow: 'auto',
        maxWidth: '1200px',
        margin: '0 auto',
      }}
    >
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <ContainerLoader message="Loading Project Health..." minHeight={200} />
        </div>
      ) : (
      <>
      {/* Header */}
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Current Project Name */}
          {currentHealth && (
            <span style={{
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              background: 'rgba(64, 224, 208, 0.1)',
              border: '1px solid rgba(64, 224, 208, 0.2)',
              color: 'var(--pinnacle-teal)',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}>
              {currentHealth.projectName || filteredData.projects.find(p => p.projectId === selectedProjectId)?.name || 'No Project'}
            </span>
          )}
        </div>

        {currentHealth && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Overall Score */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: effectiveScore >= 80 ? 'rgba(16, 185, 129, 0.1)' :
                effectiveScore >= 60 ? 'rgba(245, 158, 11, 0.1)' :
                  'rgba(239, 68, 68, 0.1)',
              borderRadius: '8px',
              border: `1px solid ${effectiveScore >= 80 ? 'rgba(16, 185, 129, 0.3)' :
                effectiveScore >= 60 ? 'rgba(245, 158, 11, 0.3)' :
                  'rgba(239, 68, 68, 0.3)'}`,
            }}>
              <EnhancedTooltip content={{
                title: 'Project Health Score',
                description: 'Overall assessment of project health based on check items.',
                calculation: 'Score = (Passed Checks / Total Evaluated Checks) × 100',
                details: [
                  'Green (80-100%): Healthy',
                  'Yellow (60-79%): At Risk',
                  'Red (0-59%): Critical',
                  'Only evaluated checks count towards score',
                ]
              }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'help', borderBottom: '1px dotted', display: 'flex', alignItems: 'center' }}>
                  Health Score:
                  <MetricProvenanceChip provenance={healthScoreProvenance} />
                </span>
              </EnhancedTooltip>
                <span style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: effectiveScore >= 80 ? '#10B981' :
                  effectiveScore >= 60 ? '#F59E0B' : '#EF4444',
              }}>
                {effectiveScore}%
              </span>
            </div>

            {/* Status Badge */}
            <span style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '12px',
              fontSize: '0.7rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              background: currentHealth.overallStatus === 'approved' ? 'rgba(16, 185, 129, 0.1)' :
                currentHealth.overallStatus === 'pending_review' ? 'rgba(245, 158, 11, 0.1)' :
                  currentHealth.overallStatus === 'rejected' ? 'rgba(239, 68, 68, 0.1)' :
                    'rgba(107, 114, 128, 0.1)',
              color: currentHealth.overallStatus === 'approved' ? '#10B981' :
                currentHealth.overallStatus === 'pending_review' ? '#F59E0B' :
                  currentHealth.overallStatus === 'rejected' ? '#EF4444' : '#6B7280',
            }}>
              {currentHealth.overallStatus.replace('_', ' ')}
            </span>
          </div>
        )}
      </div>

      {!selectedProjectId ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '1rem',
          color: 'var(--text-muted)',
        }}>
          <svg viewBox="0 0 24 24" width="64" height="64" stroke="currentColor" strokeWidth="1" fill="none" style={{ opacity: 0.3 }}>
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p style={{ fontSize: '1rem' }}>No projects available. Add projects via Data Management or use the hierarchy filter.</p>
        </div>
      ) : currentHealth && (
        <div style={{ display: 'block', gap: '1rem', paddingBottom: '1rem' }}>
          <div style={{ marginBottom: '0.9rem', padding: '0.75rem 0.9rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={Boolean(currentHealth.scheduleRequired)}
                onChange={(e) => updateHealthFields({ scheduleRequired: e.target.checked })}
              />
              Schedule Required (Manual)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Manual Health Score Override
              <input
                type="number"
                min={0}
                max={100}
                value={Number.isFinite(Number((currentHealth as any).manualHealthOverride)) ? Number((currentHealth as any).manualHealthOverride) : ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    updateHealthFields({ manualHealthOverride: null } as any);
                    return;
                  }
                  updateHealthFields({ manualHealthOverride: Math.max(0, Math.min(100, Number(raw) || 0)) } as any);
                }}
                placeholder={`${overallScore}`}
                style={{ width: 86, padding: '0.25rem 0.4rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              />
            </label>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Effective Score: {effectiveScore}%</span>
          </div>

          {/* Health Check Categories */}
          {Object.entries(checksByCategory).map(([category, checks]) => {
            const isExpanded = expandedCategories.has(category);
            const stats = getCategoryStats(checks);
            const sortState = checkSortStates[category] || null;
            const sortedChecks = sortByState(checks, sortState, (check, key) => {
              switch (key) {
                case 'passed':
                  return check.isMultiLine ? null : check.passed;
                case 'name':
                  return check.name;
                case 'failureReason':
                  return check.failureReason || '';
                case 'comments':
                  return check.comments || '';
                default:
                  return null;
              }
            });

            return (
              <div key={category} className="chart-card" style={{ marginBottom: '1rem' }}>
                {/* Category Header */}
                <div
                  className="chart-card-header"
                  onClick={() => toggleCategory(category)}
                  style={{
                    cursor: 'pointer',
                    borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <svg
                      viewBox="0 0 12 12"
                      width="12"
                      height="12"
                      style={{
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s'
                      }}
                    >
                      <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    </svg>
                    <h3 className="chart-card-title">{CATEGORY_LABELS[category]}</h3>
                    <span style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      background: 'var(--bg-tertiary)',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '10px',
                    }}>
                      {checks.length} checks
                    </span>
                  </div>

                  {/* Category Stats */}
                  <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.7rem' }}>
                    <span style={{ color: '#10B981' }}>✓ {stats.passed}</span>
                    <span style={{ color: '#EF4444' }}>✗ {stats.failed}</span>
                    <span style={{ color: 'var(--text-muted)' }}>○ {stats.pending}</span>
                  </div>
                </div>

                {/* Check Items */}
                {isExpanded && (
                  <div className="chart-card-body no-padding">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-tertiary)' }}>
                          <th style={{ width: '40px', padding: '10px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            <EnhancedTooltip content={{ title: 'Status', description: 'Current status of the health check item. Click to toggle pass/fail.' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setCheckSortStates(prev => ({
                                    ...prev,
                                    [category]: getNextSortState(prev[category] || null, 'passed'),
                                  }));
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  color: 'inherit',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: 'inherit',
                                  borderBottom: '1px dotted #ccc'
                                }}
                              >
                                Pass
                                {formatSortIndicator(sortState, 'passed') && (
                                  <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                                    {formatSortIndicator(sortState, 'passed')}
                                  </span>
                                )}
                              </button>
                            </EnhancedTooltip>
                          </th>
                          <th style={{ padding: '10px', textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            <EnhancedTooltip content={{ title: 'Check Item', description: 'Specific health check criteria to be evaluated.' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setCheckSortStates(prev => ({
                                    ...prev,
                                    [category]: getNextSortState(prev[category] || null, 'name'),
                                  }));
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  color: 'inherit',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: 'inherit',
                                  borderBottom: '1px dotted #ccc'
                                }}
                              >
                                Check Item
                                {formatSortIndicator(sortState, 'name') && (
                                  <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                                    {formatSortIndicator(sortState, 'name')}
                                  </span>
                                )}
                              </button>
                            </EnhancedTooltip>
                          </th>
                          <th style={{ width: '150px', padding: '10px', textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            <EnhancedTooltip content={{ title: 'Failure Reason', description: 'Categorized reason for check failure (required if failed).' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setCheckSortStates(prev => ({
                                    ...prev,
                                    [category]: getNextSortState(prev[category] || null, 'failureReason'),
                                  }));
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  color: 'inherit',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: 'inherit',
                                  borderBottom: '1px dotted #ccc'
                                }}
                              >
                                Failure Reason
                                {formatSortIndicator(sortState, 'failureReason') && (
                                  <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                                    {formatSortIndicator(sortState, 'failureReason')}
                                  </span>
                                )}
                              </button>
                            </EnhancedTooltip>
                          </th>
                          <th style={{ width: '200px', padding: '10px', textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            <EnhancedTooltip content={{ title: 'Comments', description: 'Additional notes or explanations.' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setCheckSortStates(prev => ({
                                    ...prev,
                                    [category]: getNextSortState(prev[category] || null, 'comments'),
                                  }));
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  color: 'inherit',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: 'inherit',
                                  borderBottom: '1px dotted #ccc'
                                }}
                              >
                                Comments
                                {formatSortIndicator(sortState, 'comments') && (
                                  <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                                    {formatSortIndicator(sortState, 'comments')}
                                  </span>
                                )}
                              </button>
                            </EnhancedTooltip>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedChecks.map((check, idx) => (
                          <tr
                            key={check.id}
                            style={{
                              borderBottom: idx < checks.length - 1 ? '1px solid var(--border-color)' : 'none',
                              background: check.passed === false ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                            }}
                          >
                            {/* Pass/Fail Toggle */}
                            <td style={{ padding: '10px', textAlign: 'center' }}>
                              {check.isMultiLine ? (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>N/A</span>
                              ) : (
                                <button
                                  onClick={() => updateCheck(check.id, {
                                    passed: check.passed === true ? false : check.passed === false ? null : true,
                                    failureReason: check.passed === true ? null : check.failureReason,
                                  })}
                                  style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    border: `2px solid ${check.passed === true ? '#10B981' : check.passed === false ? '#EF4444' : 'var(--border-color)'}`,
                                    background: check.passed === true ? 'rgba(16, 185, 129, 0.1)' :
                                      check.passed === false ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '14px',
                                    transition: 'all 0.15s',
                                  }}
                                  title={check.passed === true ? 'Pass (click to fail)' : check.passed === false ? 'Fail (click to reset)' : 'Not evaluated (click to pass)'}
                                >
                                  {check.passed === true && <span style={{ color: '#10B981' }}>✓</span>}
                                  {check.passed === false && <span style={{ color: '#EF4444' }}>✗</span>}
                                </button>
                              )}
                            </td>

                            {/* Check Name */}
                            <td style={{ padding: '10px' }}>
                              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                {check.name}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {check.description}
                              </div>
                              {check.isMultiLine && (
                                <textarea
                                  value={check.multiLineValue || ''}
                                  onChange={(e) => updateCheck(check.id, { multiLineValue: e.target.value })}
                                  placeholder="Enter tasks requiring rework (one per line)..."
                                  style={{
                                    width: '100%',
                                    marginTop: '8px',
                                    padding: '8px',
                                    borderRadius: '4px',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.8rem',
                                    minHeight: '60px',
                                    resize: 'vertical',
                                  }}
                                />
                              )}
                            </td>

                            {/* Failure Reason */}
                            <td style={{ padding: '10px' }}>
                              {check.passed === false && !check.isMultiLine && (
                                <select
                                  value={check.failureReason || ''}
                                  onChange={(e) => updateCheck(check.id, {
                                    failureReason: e.target.value as HealthCheckFailureReason || null
                                  })}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.75rem',
                                  }}
                                >
                                  <option value="">Select reason...</option>
                                  {FAILURE_REASONS.map(reason => (
                                    <option key={reason} value={reason || ''}>{reason}</option>
                                  ))}
                                </select>
                              )}
                            </td>

                            {/* Comments */}
                            <td style={{ padding: '10px' }}>
                              <input
                                type="text"
                                value={check.comments}
                                onChange={(e) => updateCheck(check.id, { comments: e.target.value })}
                                placeholder="Add comment..."
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: '4px',
                                  border: '1px solid var(--border-color)',
                                  background: 'var(--bg-secondary)',
                                  color: 'var(--text-primary)',
                                  fontSize: '0.75rem',
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Approval Section */}
          <div className="chart-card">
            <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="chart-card-title">Approval Workflow</h3>
            </div>
            <div className="chart-card-body" style={{ padding: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                {Object.entries(currentHealth.approvals).map(([key, approval]) => (
                  <div
                    key={key}
                    style={{
                      padding: '1rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      border: `1px solid ${approval.approved ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-color)'}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {approval.role}
                      </span>
                      <button
                        onClick={() => updateApproval(key as keyof ProjectHealth['approvals'], {
                          approved: !approval.approved,
                          date: !approval.approved ? new Date().toISOString() : null,
                        })}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          border: 'none',
                          background: approval.approved ? '#10B981' : 'var(--bg-tertiary)',
                          color: approval.approved ? '#fff' : 'var(--text-secondary)',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {approval.approved ? '✓ Approved' : 'Pending'}
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <div>
                        <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                          Name
                        </label>
                        <input
                          type="text"
                          value={approval.name}
                          onChange={(e) => updateApproval(key as keyof ProjectHealth['approvals'], { name: e.target.value })}
                          placeholder="Approver name..."
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-primary)',
                            fontSize: '0.75rem',
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                          Date
                        </label>
                        <input
                          type="text"
                          value={approval.date ? new Date(approval.date).toLocaleDateString() : '-'}
                          disabled
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-muted)',
                            fontSize: '0.75rem',
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: '0.5rem' }}>
                      <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                        Comments
                      </label>
                      <input
                        type="text"
                        value={approval.comments}
                        onChange={(e) => updateApproval(key as keyof ProjectHealth['approvals'], { comments: e.target.value })}
                        placeholder="Optional comments..."
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-tertiary)',
                          color: 'var(--text-primary)',
                          fontSize: '0.75rem',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
