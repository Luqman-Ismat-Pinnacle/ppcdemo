'use client';

/**
 * @fileoverview Redesigned Resourcing Page for PPC V3 Project Controls.
 * 
 * User-friendly resource management with:
 * - Overview dashboard with key metrics
 * - Resource Requirements Calculator (FTE based on baseline hours)
 * - Interactive resource utilization heatmap
 * - Resource Gantt chart with assignment timelines
 * - Resource leveling analysis
 * 
 * @module app/project-controls/resourcing/page
 */

import React, { useMemo, useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useData } from '@/lib/data-context';
import ResourceHeatmapChart from '@/components/charts/ResourceHeatmapChart';
import ResourceGanttChart from '@/components/charts/ResourceGanttChart';
import ResourceLevelingChart from '@/components/charts/ResourceLevelingChart';
import EnhancedTooltip from '@/components/ui/EnhancedTooltip';

// FTE Constants
const HOURS_PER_DAY = 8;
const DAYS_PER_WEEK = 5;
const HOURS_PER_WEEK = HOURS_PER_DAY * DAYS_PER_WEEK; // 40 hours
const WEEKS_PER_YEAR = 52;
const HOURS_PER_YEAR = HOURS_PER_WEEK * WEEKS_PER_YEAR; // 2080 hours

interface ResourceRequirement {
  resourceType: string;
  taskCount: number;
  totalBaselineHours: number;
  totalActualHours: number;
  remainingHours: number;
  fteRequired: number;
  fteMonthly: number;
  tasks: Array<{
    taskId: string;
    taskName: string;
    baselineHours: number;
    actualHours: number;
    percentComplete: number;
  }>;
}

type ActiveSection = 'overview' | 'requirements' | 'heatmap' | 'gantt' | 'leveling';

// Loading fallback component
function ResourcingPageLoading() {
  return (
    <div className="page-panel full-height-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 100px)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ 
          width: '48px', 
          height: '48px', 
          border: '3px solid var(--border-color)', 
          borderTopColor: 'var(--pinnacle-teal)', 
          borderRadius: '50%', 
          animation: 'spin 1s linear infinite',
          margin: '0 auto 1rem',
        }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading Resourcing...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Main page wrapper with Suspense
export default function ResourcingPage() {
  return (
    <Suspense fallback={<ResourcingPageLoading />}>
      <ResourcingPageContent />
    </Suspense>
  );
}

// Inner component that uses useSearchParams
function ResourcingPageContent() {
  const searchParams = useSearchParams();
  const { filteredData, data: fullData } = useData();
  
  // Check if we came from Project Plan page with a specific project
  const projectIdParam = searchParams.get('projectId');
  const scrollToSection = searchParams.get('section');
  
  const [activeSection, setActiveSection] = useState<ActiveSection>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectIdParam);
  const [expandedResourceType, setExpandedResourceType] = useState<string | null>(null);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    // If we came from Project Plan page, scroll to requirements section
    if (scrollToSection === 'requirements') {
      setActiveSection('requirements');
    }
    if (projectIdParam) {
      setSelectedProjectId(projectIdParam);
    }
  }, [scrollToSection, projectIdParam]);

  // Use fullData fallback when filtered data is empty
  const data = useMemo(() => {
    const filtered = filteredData || {};
    const full = fullData || {};
    return {
      ...filtered,
      resourceHeatmap: (filtered.resourceHeatmap?.resources?.length ? filtered.resourceHeatmap : full.resourceHeatmap) ?? filtered.resourceHeatmap,
      resourceGantt: (filtered.resourceGantt?.items?.length ? filtered.resourceGantt : full.resourceGantt) ?? filtered.resourceGantt,
      tasks: (filtered.tasks?.length ? filtered.tasks : full.tasks) ?? filtered.tasks ?? [],
      employees: (filtered.employees?.length ? filtered.employees : full.employees) ?? filtered.employees ?? [],
      projects: (filtered.projects?.length ? filtered.projects : full.projects) ?? filtered.projects ?? [],
      resourceLeveling: filtered.resourceLeveling ?? full.resourceLeveling,
    };
  }, [filteredData, fullData]);

  // Get available projects for filter
  const availableProjects = useMemo(() => {
    return (data.projects || []).map((p: any) => ({
      id: p.id || p.projectId,
      name: p.name,
    }));
  }, [data.projects]);

  // Calculate Resource Requirements (FTE based on baseline hours)
  const resourceRequirements = useMemo((): ResourceRequirement[] => {
    const tasks = data.tasks || [];
    
    // Filter by selected project if specified
    const filteredTasks = selectedProjectId 
      ? tasks.filter((t: any) => (t.projectId || t.project_id) === selectedProjectId)
      : tasks;

    // Group tasks by assigned resource type (role)
    const resourceMap = new Map<string, ResourceRequirement>();

    filteredTasks.forEach((task: any) => {
      const resourceType = task.assignedResource || task.assigned_resource || task.assignedResourceType || 'Unassigned';
      const baselineHours = task.baselineHours || task.baseline_hours || task.baselineWork || task.baseline_work || 0;
      const actualHours = task.actualHours || task.actual_hours || 0;
      const percentComplete = task.percentComplete || task.percent_complete || 0;
      
      if (!resourceMap.has(resourceType)) {
        resourceMap.set(resourceType, {
          resourceType,
          taskCount: 0,
          totalBaselineHours: 0,
          totalActualHours: 0,
          remainingHours: 0,
          fteRequired: 0,
          fteMonthly: 0,
          tasks: [],
        });
      }

      const req = resourceMap.get(resourceType)!;
      req.taskCount++;
      req.totalBaselineHours += baselineHours;
      req.totalActualHours += actualHours;
      const remaining = Math.max(0, baselineHours - actualHours);
      req.remainingHours += remaining;
      req.tasks.push({
        taskId: task.taskId || task.id,
        taskName: task.taskName || task.name || task.task_name || 'Unnamed Task',
        baselineHours,
        actualHours,
        percentComplete,
      });
    });

    // Calculate FTE for each resource type
    resourceMap.forEach((req) => {
      // FTE Required (Annual) = Total Baseline Hours / 2080
      req.fteRequired = req.totalBaselineHours / HOURS_PER_YEAR;
      // FTE Required (Monthly) = Total Baseline Hours / (2080/12) ≈ 173.33
      req.fteMonthly = req.totalBaselineHours / (HOURS_PER_YEAR / 12);
    });

    // Sort by FTE required (descending)
    return Array.from(resourceMap.values()).sort((a, b) => b.fteRequired - a.fteRequired);
  }, [data.tasks, selectedProjectId]);

  // Calculate summary metrics
  const summaryMetrics = useMemo(() => {
    const totalBaselineHours = resourceRequirements.reduce((sum, r) => sum + r.totalBaselineHours, 0);
    const totalActualHours = resourceRequirements.reduce((sum, r) => sum + r.totalActualHours, 0);
    const totalRemainingHours = resourceRequirements.reduce((sum, r) => sum + r.remainingHours, 0);
    const totalFTE = totalBaselineHours / HOURS_PER_YEAR;
    const totalTasks = resourceRequirements.reduce((sum, r) => sum + r.taskCount, 0);
    const uniqueResourceTypes = resourceRequirements.length;
    const utilizationPercent = totalBaselineHours > 0 ? (totalActualHours / totalBaselineHours) * 100 : 0;

    return {
      totalBaselineHours,
      totalActualHours,
      totalRemainingHours,
      totalFTE,
      totalTasks,
      uniqueResourceTypes,
      utilizationPercent,
    };
  }, [resourceRequirements]);

  // Navigation tabs
  const sections: { id: ActiveSection; label: string; icon: React.ReactNode }[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      ),
    },
    {
      id: 'requirements',
      label: 'Resource Requirements',
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      id: 'heatmap',
      label: 'Utilization Heatmap',
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <rect x="7" y="7" width="3" height="3" />
          <rect x="14" y="7" width="3" height="3" />
          <rect x="7" y="14" width="3" height="3" />
          <rect x="14" y="14" width="3" height="3" />
        </svg>
      ),
    },
    {
      id: 'gantt',
      label: 'Resource Gantt',
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="4" y1="15" x2="20" y2="15" />
          <rect x="6" y="6" width="8" height="6" rx="1" fill="currentColor" opacity="0.3" />
          <rect x="10" y="12" width="10" height="6" rx="1" fill="currentColor" opacity="0.3" />
        </svg>
      ),
    },
    {
      id: 'leveling',
      label: 'Resource Leveling',
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
  ];

  const formatNumber = (num: number, decimals = 0) => {
    return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  return (
    <div className="page-panel full-height-page" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 'calc(100vh - 100px)' }}>
      {/* Header */}
      <div className="page-header" style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Resourcing</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Plan, analyze, and optimize resource allocation across your projects
          </p>
        </div>
        
        {/* Project Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Filter by Project:</label>
          <select
            value={selectedProjectId || ''}
            onChange={(e) => setSelectedProjectId(e.target.value || null)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              minWidth: '200px',
            }}
          >
            <option value="">All Projects</option>
            {availableProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        borderBottom: '1px solid var(--border-color)', 
        paddingBottom: '0.5rem',
        flexShrink: 0,
      }}>
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.25rem',
              border: 'none',
              borderRadius: '8px 8px 0 0',
              background: activeSection === section.id ? 'var(--pinnacle-teal)' : 'transparent',
              color: activeSection === section.id ? '#000' : 'var(--text-secondary)',
              fontSize: '0.875rem',
              fontWeight: activeSection === section.id ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {section.icon}
            {section.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        
        {/* Overview Section */}
        {activeSection === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div className="metric-card accent-teal" style={{ padding: '1.25rem' }}>
                <div className="metric-label">Total FTE Required</div>
                <div className="metric-value" style={{ fontSize: '2rem' }}>{formatNumber(summaryMetrics.totalFTE, 1)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Based on {formatNumber(summaryMetrics.totalBaselineHours)} baseline hours
                </div>
              </div>
              
              <div className="metric-card" style={{ padding: '1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label">Resource Types</div>
                <div className="metric-value" style={{ fontSize: '2rem' }}>{summaryMetrics.uniqueResourceTypes}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Unique roles assigned
                </div>
              </div>
              
              <div className="metric-card" style={{ padding: '1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label">Total Tasks</div>
                <div className="metric-value" style={{ fontSize: '2rem' }}>{formatNumber(summaryMetrics.totalTasks)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  With resource assignments
                </div>
              </div>
              
              <div className="metric-card" style={{ padding: '1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label">Hours Progress</div>
                <div className="metric-value" style={{ fontSize: '2rem' }}>{formatNumber(summaryMetrics.utilizationPercent, 0)}%</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {formatNumber(summaryMetrics.totalActualHours)} of {formatNumber(summaryMetrics.totalBaselineHours)} hrs
                </div>
              </div>
              
              <div className="metric-card" style={{ padding: '1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label">Remaining Hours</div>
                <div className="metric-value" style={{ fontSize: '2rem', color: '#F59E0B' }}>{formatNumber(summaryMetrics.totalRemainingHours)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {formatNumber(summaryMetrics.totalRemainingHours / HOURS_PER_YEAR, 1)} FTE remaining
                </div>
              </div>
            </div>

            {/* Quick Access Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
              <div 
                className="chart-card" 
                style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                onClick={() => setActiveSection('requirements')}
              >
                <div className="chart-card-body" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ 
                    width: '60px', 
                    height: '60px', 
                    borderRadius: '12px', 
                    background: 'linear-gradient(135deg, var(--pinnacle-teal), var(--pinnacle-lime))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#000" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Resource Requirements Calculator</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                      Calculate FTE needs by resource type based on baseline hours
                    </p>
                  </div>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ marginLeft: 'auto' }}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </div>

              <div 
                className="chart-card" 
                style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                onClick={() => setActiveSection('heatmap')}
              >
                <div className="chart-card-body" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ 
                    width: '60px', 
                    height: '60px', 
                    borderRadius: '12px', 
                    background: 'linear-gradient(135deg, #E91E63, #F59E0B)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#fff" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <rect x="7" y="7" width="3" height="3" />
                      <rect x="14" y="7" width="3" height="3" />
                      <rect x="7" y="14" width="3" height="3" />
                      <rect x="14" y="14" width="3" height="3" />
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Utilization Heatmap</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                      Visualize resource utilization over time
                    </p>
                  </div>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ marginLeft: 'auto' }}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Top Resource Types Preview */}
            {resourceRequirements.length > 0 && (
              <div className="chart-card">
                <div className="chart-card-header">
                  <h3 className="chart-card-title">Top Resource Requirements</h3>
                  <button
                    onClick={() => setActiveSection('requirements')}
                    style={{
                      padding: '0.5rem 1rem',
                      border: 'none',
                      borderRadius: '6px',
                      background: 'var(--bg-tertiary)',
                      color: 'var(--pinnacle-teal)',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    View All →
                  </button>
                </div>
                <div className="chart-card-body" style={{ padding: '1rem' }}>
                  <table className="data-table" style={{ fontSize: '0.875rem' }}>
                    <thead>
                      <tr>
                        <th>Resource Type</th>
                        <th style={{ textAlign: 'right' }}>Tasks</th>
                        <th style={{ textAlign: 'right' }}>Baseline Hours</th>
                        <th style={{ textAlign: 'right' }}>FTE Required</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resourceRequirements.slice(0, 5).map((req) => (
                        <tr key={req.resourceType}>
                          <td style={{ fontWeight: 500 }}>{req.resourceType}</td>
                          <td style={{ textAlign: 'right' }}>{req.taskCount}</td>
                          <td style={{ textAlign: 'right' }}>{formatNumber(req.totalBaselineHours)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--pinnacle-teal)', fontWeight: 600 }}>
                            {formatNumber(req.fteRequired, 2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Resource Requirements Calculator Section */}
        {activeSection === 'requirements' && (
          <div id="requirements-section" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Explanation Banner */}
            <div className="chart-card" style={{ background: 'linear-gradient(135deg, rgba(64,224,208,0.1) 0%, rgba(205,220,57,0.05) 100%)' }}>
              <div className="chart-card-body" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ 
                    width: '48px', 
                    height: '48px', 
                    borderRadius: '10px', 
                    background: 'var(--pinnacle-teal)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#000" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4M12 8h.01" />
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Resource Requirements Calculator
                    </h3>
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      This calculator determines how many FTE (Full-Time Equivalent) resources are needed for each resource type 
                      based on baseline hours from your project plan. FTE is calculated assuming standard work hours:
                    </p>
                    <div style={{ 
                      display: 'flex', 
                      gap: '2rem', 
                      marginTop: '0.75rem',
                      padding: '0.75rem 1rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                    }}>
                      <div>
                        <strong style={{ color: 'var(--pinnacle-teal)' }}>{HOURS_PER_DAY}</strong> hours/day
                      </div>
                      <div>
                        <strong style={{ color: 'var(--pinnacle-teal)' }}>{DAYS_PER_WEEK}</strong> days/week
                      </div>
                      <div>
                        <strong style={{ color: 'var(--pinnacle-teal)' }}>{HOURS_PER_WEEK}</strong> hours/week
                      </div>
                      <div>
                        <strong style={{ color: 'var(--pinnacle-teal)' }}>{formatNumber(HOURS_PER_YEAR)}</strong> hours/year
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              <div className="metric-card accent-teal" style={{ padding: '1rem' }}>
                <div className="metric-label" style={{ fontSize: '0.75rem' }}>Total FTE Required</div>
                <div className="metric-value" style={{ fontSize: '1.75rem' }}>{formatNumber(summaryMetrics.totalFTE, 2)}</div>
              </div>
              <div className="metric-card" style={{ padding: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label" style={{ fontSize: '0.75rem' }}>Total Baseline Hours</div>
                <div className="metric-value" style={{ fontSize: '1.75rem' }}>{formatNumber(summaryMetrics.totalBaselineHours)}</div>
              </div>
              <div className="metric-card" style={{ padding: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label" style={{ fontSize: '0.75rem' }}>Resource Types</div>
                <div className="metric-value" style={{ fontSize: '1.75rem' }}>{summaryMetrics.uniqueResourceTypes}</div>
              </div>
              <div className="metric-card" style={{ padding: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label" style={{ fontSize: '0.75rem' }}>Total Tasks</div>
                <div className="metric-value" style={{ fontSize: '1.75rem' }}>{formatNumber(summaryMetrics.totalTasks)}</div>
              </div>
            </div>

            {/* Resource Requirements Table */}
            <div className="chart-card">
              <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <h3 className="chart-card-title">FTE Requirements by Resource Type</h3>
              </div>
              <div className="chart-card-body" style={{ padding: 0 }}>
                {resourceRequirements.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 1rem', opacity: 0.5 }}>
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <p>No tasks found with resource assignments.</p>
                    <p style={{ fontSize: '0.85rem' }}>
                      Upload an MPP file with resource assignments to see FTE requirements.
                    </p>
                  </div>
                ) : (
                  <div style={{ overflow: 'auto' }}>
                    <table className="data-table" style={{ fontSize: '0.875rem', margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}></th>
                          <th style={{ textAlign: 'left' }}>Resource Type / Role</th>
                          <th style={{ textAlign: 'right' }}>Tasks</th>
                          <th style={{ textAlign: 'right' }}>
                            <EnhancedTooltip content={{ title: 'Baseline Hours', description: 'Total planned hours from the MPP file' }}>
                              <span style={{ cursor: 'help', borderBottom: '1px dotted var(--text-muted)' }}>Baseline Hrs</span>
                            </EnhancedTooltip>
                          </th>
                          <th style={{ textAlign: 'right' }}>
                            <EnhancedTooltip content={{ title: 'Actual Hours', description: 'Hours already worked' }}>
                              <span style={{ cursor: 'help', borderBottom: '1px dotted var(--text-muted)' }}>Actual Hrs</span>
                            </EnhancedTooltip>
                          </th>
                          <th style={{ textAlign: 'right' }}>
                            <EnhancedTooltip content={{ title: 'Remaining Hours', description: 'Baseline - Actual hours' }}>
                              <span style={{ cursor: 'help', borderBottom: '1px dotted var(--text-muted)' }}>Remaining</span>
                            </EnhancedTooltip>
                          </th>
                          <th style={{ textAlign: 'right' }}>
                            <EnhancedTooltip content={{ title: 'FTE Required (Annual)', description: 'Full-Time Equivalent = Baseline Hours / 2080' }}>
                              <span style={{ cursor: 'help', borderBottom: '1px dotted var(--pinnacle-teal)' }}>FTE (Annual)</span>
                            </EnhancedTooltip>
                          </th>
                          <th style={{ textAlign: 'right' }}>
                            <EnhancedTooltip content={{ title: 'FTE Required (Monthly)', description: 'Full-Time Equivalent = Baseline Hours / 173.33' }}>
                              <span style={{ cursor: 'help', borderBottom: '1px dotted var(--pinnacle-teal)' }}>FTE (Monthly)</span>
                            </EnhancedTooltip>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {resourceRequirements.map((req) => (
                          <React.Fragment key={req.resourceType}>
                            <tr 
                              style={{ cursor: 'pointer' }}
                              onClick={() => setExpandedResourceType(expandedResourceType === req.resourceType ? null : req.resourceType)}
                            >
                              <td style={{ textAlign: 'center' }}>
                                <svg 
                                  viewBox="0 0 24 24" 
                                  width="16" 
                                  height="16" 
                                  fill="none" 
                                  stroke="var(--text-muted)" 
                                  strokeWidth="2"
                                  style={{ 
                                    transform: expandedResourceType === req.resourceType ? 'rotate(90deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.2s',
                                  }}
                                >
                                  <path d="M9 18l6-6-6-6" />
                                </svg>
                              </td>
                              <td style={{ fontWeight: 600 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <div style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: req.resourceType === 'Unassigned' ? '#F59E0B' : 'var(--pinnacle-teal)',
                                  }} />
                                  {req.resourceType}
                                </div>
                              </td>
                              <td style={{ textAlign: 'right' }}>{req.taskCount}</td>
                              <td style={{ textAlign: 'right' }}>{formatNumber(req.totalBaselineHours)}</td>
                              <td style={{ textAlign: 'right' }}>{formatNumber(req.totalActualHours)}</td>
                              <td style={{ textAlign: 'right', color: req.remainingHours > 0 ? '#F59E0B' : '#10B981' }}>
                                {formatNumber(req.remainingHours)}
                              </td>
                              <td style={{ textAlign: 'right', color: 'var(--pinnacle-teal)', fontWeight: 700, fontSize: '1rem' }}>
                                {formatNumber(req.fteRequired, 2)}
                              </td>
                              <td style={{ textAlign: 'right', color: 'var(--pinnacle-lime)', fontWeight: 600 }}>
                                {formatNumber(req.fteMonthly, 2)}
                              </td>
                            </tr>
                            
                            {/* Expanded Task Details */}
                            {expandedResourceType === req.resourceType && (
                              <tr>
                                <td colSpan={8} style={{ padding: 0, background: 'var(--bg-tertiary)' }}>
                                  <div style={{ padding: '1rem 1rem 1rem 3rem', maxHeight: '300px', overflow: 'auto' }}>
                                    <table className="data-table" style={{ fontSize: '0.8rem', margin: 0 }}>
                                      <thead>
                                        <tr>
                                          <th style={{ textAlign: 'left' }}>Task Name</th>
                                          <th style={{ textAlign: 'right' }}>Baseline Hrs</th>
                                          <th style={{ textAlign: 'right' }}>Actual Hrs</th>
                                          <th style={{ textAlign: 'right' }}>% Complete</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {req.tasks.map((task) => (
                                          <tr key={task.taskId}>
                                            <td>{task.taskName}</td>
                                            <td style={{ textAlign: 'right' }}>{formatNumber(task.baselineHours)}</td>
                                            <td style={{ textAlign: 'right' }}>{formatNumber(task.actualHours)}</td>
                                            <td style={{ textAlign: 'right' }}>
                                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                <div style={{
                                                  width: '60px',
                                                  height: '6px',
                                                  background: 'var(--bg-secondary)',
                                                  borderRadius: '3px',
                                                  overflow: 'hidden',
                                                }}>
                                                  <div style={{
                                                    width: `${Math.min(100, task.percentComplete)}%`,
                                                    height: '100%',
                                                    background: task.percentComplete >= 100 ? '#10B981' : 'var(--pinnacle-teal)',
                                                  }} />
                                                </div>
                                                {formatNumber(task.percentComplete)}%
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                        
                        {/* Totals Row */}
                        <tr style={{ fontWeight: 700, background: 'var(--bg-secondary)' }}>
                          <td></td>
                          <td>TOTAL</td>
                          <td style={{ textAlign: 'right' }}>{formatNumber(summaryMetrics.totalTasks)}</td>
                          <td style={{ textAlign: 'right' }}>{formatNumber(summaryMetrics.totalBaselineHours)}</td>
                          <td style={{ textAlign: 'right' }}>{formatNumber(summaryMetrics.totalActualHours)}</td>
                          <td style={{ textAlign: 'right', color: '#F59E0B' }}>{formatNumber(summaryMetrics.totalRemainingHours)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--pinnacle-teal)', fontSize: '1.1rem' }}>
                            {formatNumber(summaryMetrics.totalFTE, 2)}
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--pinnacle-lime)' }}>
                            {formatNumber(summaryMetrics.totalBaselineHours / (HOURS_PER_YEAR / 12), 2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* FTE Calculation Explanation */}
            <div className="chart-card">
              <div className="chart-card-header">
                <h3 className="chart-card-title">Understanding FTE Calculations</h3>
              </div>
              <div className="chart-card-body" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                  <div>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--pinnacle-teal)', marginBottom: '0.5rem' }}>
                      What is FTE?
                    </h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      FTE (Full-Time Equivalent) represents the workload of a full-time employee. 
                      1.0 FTE = one person working full-time for a year (2,080 hours).
                    </p>
                  </div>
                  <div>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--pinnacle-teal)', marginBottom: '0.5rem' }}>
                      Annual FTE Formula
                    </h4>
                    <div style={{ 
                      padding: '0.75rem', 
                      background: 'var(--bg-tertiary)', 
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                    }}>
                      FTE = Baseline Hours ÷ {formatNumber(HOURS_PER_YEAR)}
                    </div>
                  </div>
                  <div>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--pinnacle-teal)', marginBottom: '0.5rem' }}>
                      Monthly FTE Formula
                    </h4>
                    <div style={{ 
                      padding: '0.75rem', 
                      background: 'var(--bg-tertiary)', 
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                    }}>
                      FTE = Baseline Hours ÷ {formatNumber(HOURS_PER_YEAR / 12, 2)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Heatmap Section */}
        {activeSection === 'heatmap' && (
          <div className="chart-card" style={{ height: 'calc(100% - 20px)', minHeight: '600px' }}>
            <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <rect x="7" y="7" width="3" height="3" />
                  <rect x="14" y="7" width="3" height="3" />
                  <rect x="7" y="14" width="3" height="3" />
                  <rect x="14" y="14" width="3" height="3" />
                </svg>
                Resource Utilization Heatmap
              </h3>
            </div>
            <div className="chart-card-body" style={{ flex: 1, minHeight: 0, padding: '12px' }}>
              <ResourceHeatmapChart
                data={data.resourceHeatmap ?? { resources: [], weeks: [], data: [] }}
                employees={data.employees ?? []}
                height="100%"
                showControls={true}
              />
            </div>
          </div>
        )}

        {/* Gantt Section */}
        {activeSection === 'gantt' && (
          <div className="chart-card" style={{ height: 'calc(100% - 20px)', minHeight: '600px' }}>
            <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
                  <line x1="4" y1="9" x2="20" y2="9" />
                  <line x1="4" y1="15" x2="20" y2="15" />
                  <rect x="6" y="6" width="8" height="6" rx="1" fill="var(--pinnacle-teal)" opacity="0.3" />
                  <rect x="10" y="12" width="10" height="6" rx="1" fill="var(--pinnacle-teal)" opacity="0.3" />
                </svg>
                Resource Gantt Chart
              </h3>
            </div>
            <div className="chart-card-body" style={{ flex: 1, padding: '1rem', overflow: 'hidden' }}>
              <ResourceGanttChart
                tasks={data.tasks ?? []}
                employees={data.employees ?? []}
                height="100%"
                showControls={true}
              />
            </div>
          </div>
        )}

        {/* Leveling Section */}
        {activeSection === 'leveling' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="chart-card">
              <div className="chart-card-header">
                <h3 className="chart-card-title">Project Resource Leveling</h3>
              </div>
              <div className="chart-card-body" style={{ padding: '1rem' }}>
                {/* Quarterly Summary Table */}
                {data.resourceLeveling?.quarterly && data.resourceLeveling.quarterly.length > 0 ? (
                  <div style={{ marginBottom: '2rem' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)' }}>
                      Quarterly Summary
                    </h4>
                    <table className="data-table" style={{ width: '100%', marginBottom: '1rem' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left' }}>Metric</th>
                          {data.resourceLeveling.quarterly.map((q: any, idx: number) => (
                            <th key={idx} style={{ textAlign: 'right' }}>{q.quarterLabel}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ fontWeight: 600 }}>Total Project Hours</td>
                          {data.resourceLeveling.quarterly.map((q: any, idx: number) => (
                            <td key={idx} style={{ textAlign: 'right' }}>{q.totalProjectHours.toLocaleString()}</td>
                          ))}
                        </tr>
                        <tr>
                          <td style={{ fontWeight: 600 }}>Projected FTE</td>
                          {data.resourceLeveling.quarterly.map((q: any, idx: number) => (
                            <td key={idx} style={{ textAlign: 'right' }}>{q.projectedFTEUtilization.toFixed(2)}</td>
                          ))}
                        </tr>
                        <tr>
                          <td style={{ fontWeight: 600 }}>Variance %</td>
                          {data.resourceLeveling.quarterly.map((q: any, idx: number) => {
                            const color = q.variancePercent < -10 ? '#F59E0B' : q.variancePercent > 10 ? '#E91E63' : '#10B981';
                            return (
                              <td key={idx} style={{ textAlign: 'right', color, fontWeight: 600 }}>
                                {q.variancePercent > 0 ? '+' : ''}{q.variancePercent.toFixed(0)}%
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ width: '12px', height: '12px', background: 'rgba(245, 158, 11, 0.3)', border: '1px solid #F59E0B' }}></span>
                        Under-utilization risk
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ width: '12px', height: '12px', background: 'rgba(233, 30, 99, 0.3)', border: '1px solid #E91E63' }}></span>
                        Over-utilization risk
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ width: '12px', height: '12px', background: 'rgba(16, 185, 129, 0.3)', border: '1px solid #10B981' }}></span>
                        Balanced (±10%)
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No quarterly leveling data available
                  </div>
                )}

                {/* Monthly Chart */}
                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)' }}>
                    Monthly View
                  </h4>
                  <ResourceLevelingChart 
                    data={data.resourceLeveling || { monthly: [], quarterly: [] }} 
                    height="400px" 
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
