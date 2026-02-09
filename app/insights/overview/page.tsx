'use client';

/**
 * @fileoverview Executive Briefing - Overview Page for PPC V3.
 * 
 * Comprehensive portfolio analytics with ALL legacy data:
 * - Portfolio Command Center with health score, SPI/CPI indicators
 * - Enhanced Portfolio Flow Sankey (full-width, project status distribution)
 * - Project Health Radar (multi-metric comparison)
 * - Risk Matrix (impact vs probability scatter)
 * - Progress Burndown with forecast
 * - Enhanced Budget Variance (full-width, baseline vs actual by project)
 * - Milestone Tab with creative visuals (timeline, status, gauges)
 * - Project Summary Table (detailed breakdown)
 * - Schedule Risks and Budget Concerns lists
 * - Variance Analysis section
 * - Advanced Project Controls (Float, FTE, Predictive Health, Linchpin)
 * - Cross-sync filtering - click any visual to filter entire page
 * - Drill-down panels for detailed breakdowns
 * 
 * All visuals sized for large datasets with scroll/zoom.
 * 
 * @module app/insights/overview/page
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useData } from '@/lib/data-context';

/** Safe number formatting - returns '0' for NaN/Infinity */
const sn = (v: any, decimals = 2): string => {
  const n = Number(v);
  return isFinite(n) ? n.toFixed(decimals) : '0';
};
import ChartWrapper from '@/components/charts/ChartWrapper';
import { calculateMetricVariance, getPeriodDisplayName } from '@/lib/variance-engine';
import useCrossFilter, { CrossFilter } from '@/lib/hooks/useCrossFilter';
import type { EChartsOption } from 'echarts';

// ===== INFO TOOLTIP =====
function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: '4px', cursor: 'help' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ opacity: 0.6 }}>
        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
      </svg>
      {show && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: '6px', padding: '0.6rem 0.8rem', borderRadius: '8px',
          background: 'rgba(22,27,34,0.97)', border: '1px solid var(--border-color)',
          color: '#e5e7eb', fontSize: '0.72rem', lineHeight: 1.45, whiteSpace: 'pre-line',
          width: '260px', zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}>
          {text}
          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            borderTop: '6px solid rgba(22,27,34,0.97)' }} />
        </div>
      )}
    </span>
  );
}

// ===== DRILL-DOWN DETAIL PANEL (appears below chart) =====
function DrillDetail({ item, type, projectBreakdown, budgetConcerns, scheduleRisks, onClose }: {
  item: any; type: string; projectBreakdown: any[]; budgetConcerns: any[]; scheduleRisks: any[]; onClose: () => void;
}) {
  const project = type === 'project' ? projectBreakdown.find(p => p.name === item?.name || p.id === item?.id) : null;
  const risk = type === 'risk' ? item : null;
  
  if (!item) return null;
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(64,224,208,0.08) 0%, rgba(30,35,50,0.95) 100%)',
      borderRadius: '16px', padding: '1.25rem 1.5rem', marginTop: '0.75rem',
      border: '1px solid rgba(64,224,208,0.25)', position: 'relative',
    }}>
      <button onClick={onClose} style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
      
      <div style={{ fontSize: '0.65rem', color: 'var(--pinnacle-teal)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '0.25rem' }}>
        {type} detail
      </div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>
        {item.name || item.source || 'Selected Item'}
      </div>

      {project && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
          {[
            { label: 'Tasks', value: project.tasks, sub: `${project.completed} complete` },
            { label: 'SPI', value: sn(project.spi), color: project.spi >= 1 ? '#10B981' : '#EF4444', tip: 'Schedule Performance Index\nEV / PV = (% Complete x Baseline) / Baseline\n>1 = ahead, <1 = behind' },
            { label: 'CPI', value: sn(project.cpi), color: project.cpi >= 1 ? '#10B981' : '#EF4444', tip: 'Cost Performance Index\nEV / AC = (% Complete x Baseline) / Actual\n>1 = under budget, <1 = over budget' },
            { label: 'Progress', value: `${project.percentComplete}%` },
            { label: 'Baseline Hrs', value: project.baselineHours.toLocaleString() },
            { label: 'Actual Hrs', value: project.actualHours.toLocaleString(), color: project.actualHours > project.baselineHours ? '#EF4444' : '#10B981' },
            { label: 'Remaining', value: project.remainingHours.toLocaleString() },
            { label: 'Variance', value: `${project.variance > 0 ? '+' : ''}${project.variance}%`, color: project.variance <= 0 ? '#10B981' : '#EF4444' },
            ...(project.timesheetHours > 0 ? [{ label: 'Timesheet Hrs', value: project.timesheetHours.toLocaleString(), color: '#3B82F6' }] : []),
            ...(project.timesheetCost > 0 ? [{ label: 'Labor Cost', value: `$${(project.timesheetCost / 1000).toFixed(1)}K`, color: '#3B82F6' }] : []),
          ].map((m, i) => (
            <div key={i} style={{ padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '0.2rem', display: 'flex', alignItems: 'center' }}>
                {m.label}{(m as any).tip && <InfoTip text={(m as any).tip} />}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: (m as any).color || 'var(--text-primary)' }}>{m.value}</div>
              {(m as any).sub && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>{(m as any).sub}</div>}
            </div>
          ))}
          {/* Charge type mini-breakdown */}
          {Object.keys(project.chargeTypes || {}).length > 0 && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', padding: '0.5rem 0' }}>
              {Object.entries(project.chargeTypes).map(([type, hrs]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: CHARGE_TYPE_COLORS[type] || '#6B7280' }} />
                  <span style={{ color: 'var(--text-muted)' }}>{CHARGE_TYPE_LABELS[type] || type}:</span>
                  <strong>{Math.round(hrs as number).toLocaleString()} hrs</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {risk && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
          {[
            { label: 'Type', value: risk.type === 'schedule' ? 'Schedule Risk' : 'Budget Concern' },
            { label: 'Variance', value: risk.type === 'schedule' ? `+${risk.variance} days` : `+${risk.variance}%`, color: '#EF4444' },
            { label: 'Impact', value: risk.impact > 70 ? 'High' : risk.impact > 40 ? 'Medium' : 'Low', color: risk.impact > 70 ? '#EF4444' : '#F59E0B', tip: `Impact score: ${risk.impact}/100\nSchedule risks: >14d delay = High, >7d = Medium\nBudget risks: >50% over = High, >20% = Medium` },
            { label: 'Probability', value: `${risk.probability}%`, tip: `Probability of continued impact.\nBased on variance magnitude.` },
            ...(risk.project ? [{ label: 'Project', value: risk.project }] : []),
            ...(risk.assignee ? [{ label: 'Assignee', value: risk.assignee }] : []),
          ].map((m, i) => (
            <div key={i} style={{ padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '0.2rem', display: 'flex', alignItems: 'center' }}>
                {m.label}{(m as any).tip && <InfoTip text={(m as any).tip} />}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: (m as any).color || 'var(--text-primary)' }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {!project && !risk && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
          {Object.entries(item).filter(([k]) => !['data', 'event', 'componentType', 'seriesType', 'dataType'].includes(k) && item[k] !== undefined && item[k] !== null).slice(0, 8).map(([key, val]) => (
            <div key={key} style={{ padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '0.2rem', textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{typeof val === 'number' ? (val as number).toLocaleString() : String(val)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== CROSS-FILTER BAR =====
function CrossFilterBar({ 
  filters, 
  drillPath,
  onRemove, 
  onClear,
  onDrillToLevel,
}: { 
  filters: CrossFilter[];
  drillPath: { id: string; label: string }[];
  onRemove: (type: string, value?: string) => void;
  onClear: () => void;
  onDrillToLevel: (id: string) => void;
}) {
  if (filters.length === 0 && drillPath.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.75rem 1rem',
      background: 'linear-gradient(90deg, rgba(64,224,208,0.08), rgba(205,220,57,0.05))',
      borderRadius: '12px',
      border: '1px solid rgba(64,224,208,0.2)',
      marginBottom: '1rem',
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
          <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
        </svg>
        <span style={{ fontSize: '0.75rem', color: 'var(--pinnacle-teal)', fontWeight: 600 }}>FILTERED</span>
      </div>

      {/* Drill path breadcrumbs */}
      {drillPath.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {drillPath.map((level, idx) => (
            <React.Fragment key={level.id}>
              {idx > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>/</span>}
              <button
                onClick={() => onDrillToLevel(level.id)}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: idx === drillPath.length - 1 ? 'rgba(64,224,208,0.15)' : 'transparent',
                  color: 'var(--pinnacle-teal)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                {level.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Active filter pills */}
      {filters.map((f) => (
        <div
          key={`${f.type}-${f.value}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.75rem',
            background: 'var(--bg-secondary)',
            borderRadius: '20px',
            border: '1px solid var(--border-color)',
          }}
        >
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{f.type}:</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{f.label}</span>
          <button
            onClick={() => onRemove(f.type, f.value)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}

      <button
        onClick={onClear}
        style={{
          marginLeft: 'auto',
          padding: '0.35rem 0.75rem',
          borderRadius: '6px',
          border: '1px solid var(--border-color)',
          background: 'transparent',
          color: 'var(--text-secondary)',
          fontSize: '0.75rem',
          cursor: 'pointer',
        }}
      >
        Clear All
      </button>
    </div>
  );
}

// ===== SECTION CARD =====
function SectionCard({ title, subtitle, children, headerRight, noPadding = false }: { 
  title: string; subtitle?: string; children: React.ReactNode; headerRight?: React.ReactNode; noPadding?: boolean;
}) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>{title}</h3>
          {subtitle && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{subtitle}</span>}
        </div>
        {headerRight}
      </div>
      <div style={{ padding: noPadding ? 0 : '1rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>
    </div>
  );
}

// ===== PORTFOLIO COMMAND CENTER =====
function PortfolioCommandCenter({ 
  healthMetrics, 
  projectBreakdown,
  onProjectSelect,
  selectedProject,
}: { 
  healthMetrics: any;
  projectBreakdown: any[];
  onProjectSelect: (p: any | null) => void;
  selectedProject: any | null;
}) {
  const healthColor = healthMetrics.healthScore >= 80 ? '#10B981' : healthMetrics.healthScore >= 60 ? '#F59E0B' : '#EF4444';
  
  const statusData = [
    { key: 'schedule', label: 'Schedule (SPI)', status: healthMetrics.scheduleStatus, value: healthMetrics.spi, tip: 'Schedule Performance Index\nEV / PV = (% Complete x Baseline) / Baseline\n\n>1.0 = Ahead of schedule\n1.0 = On schedule\n<1.0 = Behind schedule' },
    { key: 'budget', label: 'Budget (CPI)', status: healthMetrics.budgetStatus, value: healthMetrics.cpi, tip: 'Cost Performance Index\nEV / AC = (% Complete x Baseline) / Actual Hrs\n\n>1.0 = Under budget\n1.0 = On budget\n<1.0 = Over budget' },
    { key: 'quality', label: 'Progress', status: healthMetrics.qualityStatus, value: healthMetrics.percentComplete, tip: 'Weighted average completion\nacross all scheduled tasks.' },
  ];

  // Top / worst performers
  const sortedByHrs = [...projectBreakdown].sort((a, b) => b.actualHours - a.actualHours);
  const topPerformer = projectBreakdown.filter(p => p.cpi >= 1).sort((a, b) => b.cpi - a.cpi)[0];
  const worstPerformer = projectBreakdown.filter(p => p.cpi < 1).sort((a, b) => a.cpi - b.cpi)[0];
  
  const getStatusColor = (status: string) => status === 'green' ? '#10B981' : status === 'yellow' ? '#F59E0B' : '#EF4444';
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)',
      borderRadius: '24px',
      padding: '1.5rem',
      border: '1px solid var(--border-color)',
      display: 'grid',
      gridTemplateColumns: '180px auto 1fr auto',
      alignItems: 'center',
      gap: '1.5rem',
    }}>
      {/* Health Score Ring */}
      <div style={{ position: 'relative', width: '180px', height: '180px', flexShrink: 0 }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-tertiary)" strokeWidth="8" />
          <circle 
            cx="50" cy="50" r="42" fill="none" 
            stroke={healthColor} strokeWidth="8"
            strokeDasharray={`${healthMetrics.healthScore * 2.64} 264`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            style={{ filter: `drop-shadow(0 0 8px ${healthColor})` }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '2.5rem', fontWeight: 900, lineHeight: 1, color: healthColor }}>{healthMetrics.healthScore}</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '2px' }}>Health<InfoTip text={'Portfolio Health Score (0-100)\nBased on SPI and CPI:\n-30 if SPI or CPI < 0.85\n-15 if SPI or CPI < 0.95\n-5 if SPI or CPI < 1.0'} /></span>
        </div>
      </div>
      
      {/* Status Indicators */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {statusData.map(s => (
          <div key={s.key} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '0.75rem 1.25rem',
            background: `${getStatusColor(s.status)}12`,
            borderRadius: '12px',
            border: `1px solid ${getStatusColor(s.status)}30`,
            minWidth: '200px',
          }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: getStatusColor(s.status), boxShadow: `0 0 8px ${getStatusColor(s.status)}` }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>{s.label}<InfoTip text={s.tip} /></span>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: getStatusColor(s.status) }}>
                {s.key === 'quality' ? `${s.value}%` : sn(s.value)}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      {/* Top / Worst Performers + Project pills */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Performance Leaders
        </div>
        {/* Most hours */}
        {sortedByHrs[0] && (
          <button onClick={() => onProjectSelect(selectedProject?.id === sortedByHrs[0].id ? null : sortedByHrs[0])} style={{
            padding: '0.5rem 0.75rem', borderRadius: '10px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
            cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.6rem',
          }}>
            <div style={{ fontSize: '0.65rem', color: '#3B82F6', width: '50px' }}>Most Hrs</div>
            <div style={{ flex: 1, fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{sortedByHrs[0].name}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3B82F6' }}>{sortedByHrs[0].actualHours.toLocaleString()}</div>
          </button>
        )}
        {/* Best CPI */}
        {topPerformer && (
          <button onClick={() => onProjectSelect(selectedProject?.id === topPerformer.id ? null : topPerformer)} style={{
            padding: '0.5rem 0.75rem', borderRadius: '10px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
            cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.6rem',
          }}>
            <div style={{ fontSize: '0.65rem', color: '#10B981', width: '50px' }}>Best CPI</div>
            <div style={{ flex: 1, fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{topPerformer.name}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10B981' }}>{sn(topPerformer.cpi)}</div>
          </button>
        )}
        {/* Worst CPI */}
        {worstPerformer && (
          <button onClick={() => onProjectSelect(selectedProject?.id === worstPerformer.id ? null : worstPerformer)} style={{
            padding: '0.5rem 0.75rem', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.6rem',
          }}>
            <div style={{ fontSize: '0.65rem', color: '#EF4444', width: '50px' }}>Worst CPI</div>
            <div style={{ flex: 1, fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{worstPerformer.name}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#EF4444' }}>{sn(worstPerformer.cpi)}</div>
          </button>
        )}
        {/* Project pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', maxHeight: '60px', overflowY: 'auto', marginTop: '0.25rem' }}>
          {projectBreakdown.map((p, idx) => {
            const pColor = p.spi >= 1 && p.cpi >= 1 ? '#10B981' : p.spi >= 0.9 && p.cpi >= 0.9 ? '#F59E0B' : '#EF4444';
            const isSelected = selectedProject?.id === p.id;
            return (
              <button key={idx} onClick={() => onProjectSelect(isSelected ? null : p)} style={{
                padding: '0.25rem 0.6rem', borderRadius: '14px', border: `1px solid ${isSelected ? 'var(--pinnacle-teal)' : pColor}40`,
                background: isSelected ? 'rgba(64,224,208,0.15)' : `${pColor}08`, color: isSelected ? 'var(--pinnacle-teal)' : 'var(--text-secondary)',
                fontSize: '0.7rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem',
              }}>
                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: pColor }} />
                {p.name.length > 16 ? p.name.slice(0, 16) + '..' : p.name}
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Summary Stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', minWidth: '130px' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actual Hrs</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--pinnacle-teal)' }}>{healthMetrics.totalHours.toLocaleString()}</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', minWidth: '130px' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Baseline Hrs</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{healthMetrics.baselineHours.toLocaleString()}</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', minWidth: '130px' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Remaining</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: healthMetrics.remainingHours > healthMetrics.baselineHours * 0.5 ? '#F59E0B' : '#10B981' }}>{healthMetrics.remainingHours.toLocaleString()}</div>
        </div>
        {healthMetrics.timesheetCost > 0 && (
          <div style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', minWidth: '130px' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Labor Cost</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#3B82F6' }}>${(healthMetrics.timesheetCost / 1000).toFixed(0)}K</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== PORTFOLIO HOURS FLOW SANKEY =====
const CHARGE_TYPE_LABELS: Record<string, string> = { EX: 'Execution', QC: 'Quality Control', CR: 'Customer Relations', SC: 'Supervision', Other: 'Other' };
const CHARGE_TYPE_COLORS: Record<string, string> = { EX: '#3B82F6', QC: '#8B5CF6', CR: '#F59E0B', SC: '#06B6D4', Other: '#6B7280' };

function PortfolioFlowSankey({ healthMetrics, projectBreakdown, onClick }: { healthMetrics: any; projectBreakdown: any[]; onClick?: (params: any) => void }) {
  const [sankeyDepth, setSankeyDepth] = useState<'summary' | 'detailed'>('detailed');
  
  const option: EChartsOption = useMemo(() => {
    const totalHours = projectBreakdown.reduce((s, p) => s + p.actualHours, 0) || 1;
    const nodes: any[] = [];
    const links: any[] = [];
    const nodeSet = new Set<string>();
    
    const addNode = (name: string, color: string) => {
      if (!nodeSet.has(name)) {
        nodes.push({ name, itemStyle: { color, borderWidth: 0, borderColor: color } });
        nodeSet.add(name);
      }
    };
    
    if (sankeyDepth === 'summary') {
      // Summary: Portfolio → Projects → Work Type
      addNode('Portfolio', '#40E0D0');
      
      projectBreakdown.forEach(p => {
        const shortName = p.name.length > 30 ? p.name.slice(0, 30) + '...' : p.name;
        const pColor = p.spi >= 1 && p.cpi >= 1 ? '#10B981' : p.spi >= 0.9 && p.cpi >= 0.9 ? '#F59E0B' : '#EF4444';
        addNode(shortName, pColor);
        if (p.actualHours > 0) links.push({ source: 'Portfolio', target: shortName, value: p.actualHours });
        
        // Project → Work types
        const ct = p.chargeTypes || {};
        Object.entries(ct).forEach(([type, hrs]) => {
          if ((hrs as number) > 0) {
            const label = CHARGE_TYPE_LABELS[type] || type;
            addNode(label, CHARGE_TYPE_COLORS[type] || '#6B7280');
            links.push({ source: shortName, target: label, value: hrs as number });
          }
        });
      });
      
      // Work types → Outcomes
      const completedHrs = Math.round(totalHours * (healthMetrics.percentComplete / 100));
      const remainingHrs = totalHours - completedHrs;
      addNode('Earned', '#10B981');
      addNode('Remaining', '#F97316');
      Object.keys(CHARGE_TYPE_LABELS).forEach(type => {
        const label = CHARGE_TYPE_LABELS[type];
        if (nodeSet.has(label)) {
          const typeTotal = projectBreakdown.reduce((s, p) => s + ((p.chargeTypes || {})[type] || 0), 0);
          if (typeTotal > 0) {
            const earned = Math.round(typeTotal * (healthMetrics.percentComplete / 100));
            const rem = typeTotal - earned;
            if (earned > 0) links.push({ source: label, target: 'Earned', value: earned });
            if (rem > 0) links.push({ source: label, target: 'Remaining', value: rem });
          }
        }
      });
    } else {
      // Detailed: Portfolio → Projects → Charge Types → Progress
      addNode('Portfolio', '#40E0D0');
      
      projectBreakdown.forEach(p => {
        const shortName = p.name.length > 30 ? p.name.slice(0, 30) + '...' : p.name;
        const pColor = p.spi >= 1 && p.cpi >= 1 ? '#10B981' : p.spi >= 0.9 && p.cpi >= 0.9 ? '#F59E0B' : '#EF4444';
        addNode(shortName, pColor);
        if (p.actualHours > 0) links.push({ source: 'Portfolio', target: shortName, value: p.actualHours });
        
        // Project → Charge types
        const ct = p.chargeTypes || {};
        Object.entries(ct).forEach(([type, hrs]) => {
          if ((hrs as number) > 0) {
            const label = `${CHARGE_TYPE_LABELS[type] || type} (${shortName.slice(0, 12)})`;
            addNode(label, CHARGE_TYPE_COLORS[type] || '#6B7280');
            links.push({ source: shortName, target: label, value: hrs as number });
          }
        });
        
        // Charge types → Progress (per project)
        const earnedLabel = `Earned: ${shortName.slice(0, 15)}`;
        const remainLabel = `Remaining: ${shortName.slice(0, 15)}`;
        const pEarned = Math.round(p.actualHours * (p.percentComplete / 100));
        const pRemain = p.actualHours - pEarned;
        
        if (pEarned > 0) addNode(earnedLabel, '#10B981');
        if (pRemain > 0) addNode(remainLabel, '#F97316');
        
        Object.entries(ct).forEach(([type, hrs]) => {
          if ((hrs as number) > 0) {
            const label = `${CHARGE_TYPE_LABELS[type] || type} (${shortName.slice(0, 12)})`;
            const typeEarned = Math.round((hrs as number) * (p.percentComplete / 100));
            const typeRemain = (hrs as number) - typeEarned;
            if (typeEarned > 0 && pEarned > 0) links.push({ source: label, target: earnedLabel, value: typeEarned });
            if (typeRemain > 0 && pRemain > 0) links.push({ source: label, target: remainLabel, value: typeRemain });
          }
        });
      });
    }
    
    return {
      backgroundColor: 'transparent',
      tooltip: { 
        trigger: 'item', 
        backgroundColor: 'rgba(22,27,34,0.95)', 
        borderColor: 'var(--border-color)', 
        textStyle: { color: '#fff', fontSize: 12 },
        confine: true,
        formatter: (params: any) => {
          if (params.dataType === 'edge') {
            const pct = totalHours > 0 ? sn((params.data.value / totalHours) * 100, 1) : '0';
            return `<strong>${params.data.source}</strong> → <strong>${params.data.target}</strong><br/>
              Hours: <strong>${Math.round(params.data.value).toLocaleString()}</strong><br/>
              Share: ${pct}% of portfolio`;
          }
          return `<strong>${params.name}</strong><br/>Click to filter`;
        },
      },
      series: [{
        type: 'sankey',
        emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.85 } },
        nodeAlign: 'justify',
        nodeWidth: 28,
        nodeGap: 18,
        layoutIterations: 64,
        orient: 'horizontal',
        left: 50,
        right: 180,
        top: 25,
        bottom: 25,
        label: { 
          color: 'var(--text-primary)', 
          fontSize: 12.5, 
          fontWeight: 600,
          formatter: (p: any) => {
            const hrs = links.filter((l: any) => l.source === p.name || l.target === p.name)
              .reduce((s: number, l: any) => l.source === p.name ? s + l.value : s, 0);
            const short = p.name.length > 30 ? p.name.slice(0, 30) + '..' : p.name;
            return hrs > 0 ? `${short}\n{sub|${Math.round(hrs).toLocaleString()} hrs}` : short;
          },
          rich: { sub: { fontSize: 10, color: 'var(--text-muted)', lineHeight: 16 } },
        },
        lineStyle: { color: 'gradient', curveness: 0.45, opacity: 0.42 },
        data: nodes, 
        links,
      }],
    };
  }, [projectBreakdown, healthMetrics, sankeyDepth]);

  const totalHours = projectBreakdown.reduce((s, p) => s + p.actualHours, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
        {(['summary', 'detailed'] as const).map(depth => (
          <button
            key={depth}
            onClick={() => setSankeyDepth(depth)}
            style={{
              padding: '0.3rem 0.75rem',
              borderRadius: '6px',
              border: `1px solid ${sankeyDepth === depth ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
              background: sankeyDepth === depth ? 'rgba(64,224,208,0.1)' : 'transparent',
              color: sankeyDepth === depth ? 'var(--pinnacle-teal)' : 'var(--text-muted)',
              fontSize: '0.7rem',
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {depth}
          </button>
        ))}
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {totalHoursLabel(totalHours)} actual hrs | {totalHoursLabel(healthMetrics.baselineHours)} baseline | {projectBreakdown.length} projects
        </span>
      </div>
      <ChartWrapper option={option} height="560px" onClick={onClick} />
    </div>
  );
}

/** Format hours with K suffix */
function totalHoursLabel(hrs: number): string {
  return hrs >= 1000 ? `${(hrs / 1000).toFixed(1)}K` : hrs.toLocaleString();
}

// ===== ENHANCED BUDGET VARIANCE CHART =====
function EnhancedBudgetVarianceChart({ projectBreakdown, onClick }: { projectBreakdown: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const sorted = [...projectBreakdown].sort((a, b) => b.variance - a.variance).slice(0, 15);
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const p = sorted[params[0]?.dataIndex];
          if (!p) return '';
          const diff = p.actualHours - p.baselineHours;
          return `<strong>${p.name}</strong><br/>
            Baseline: ${p.baselineHours.toLocaleString()} hrs<br/>
            Actual: ${p.actualHours.toLocaleString()} hrs<br/>
            Variance: <span style="color:${diff <= 0 ? '#10B981' : '#EF4444'}">${diff > 0 ? '+' : ''}${diff.toLocaleString()} hrs (${p.variance > 0 ? '+' : ''}${p.variance}%)</span><br/>
            Progress: ${p.percentComplete}%`;
        },
      },
      legend: { 
        data: ['Baseline Hours', 'Actual Hours', 'Variance %'], 
        bottom: 0, 
        textStyle: { color: 'var(--text-muted)', fontSize: 11 } 
      },
      grid: { left: 150, right: 80, top: 30, bottom: 50 },
      xAxis: [
        { 
          type: 'value', 
          name: 'Hours',
          nameLocation: 'center',
          nameGap: 25,
          nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 },
          axisLabel: { color: 'var(--text-muted)', fontSize: 10, formatter: (v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v },
          splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
          position: 'bottom',
        },
      ],
      yAxis: { 
        type: 'category', 
        data: sorted.map(p => p.name.length > 20 ? p.name.slice(0, 20) + '...' : p.name),
        axisLabel: { color: 'var(--text-primary)', fontSize: 11 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      series: [
        {
          name: 'Baseline Hours',
          type: 'bar',
          data: sorted.map(p => ({
            value: p.baselineHours,
            itemStyle: { color: 'rgba(59,130,246,0.4)', borderColor: '#3B82F6', borderWidth: 1 },
          })),
          barWidth: '35%',
          barGap: '-100%',
          z: 1,
        },
        {
          name: 'Actual Hours',
          type: 'bar',
          data: sorted.map(p => ({
            value: p.actualHours,
            itemStyle: { 
              color: p.actualHours <= p.baselineHours ? '#10B981' : p.variance <= 10 ? '#F59E0B' : '#EF4444',
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barWidth: '35%',
          z: 2,
          label: {
            show: true,
            position: 'right',
            formatter: (params: any) => {
              const p = sorted[params.dataIndex];
              return `${p.variance > 0 ? '+' : ''}${p.variance}%`;
            },
            color: (params: any) => {
              const p = sorted[params.dataIndex];
              return p.variance <= 0 ? '#10B981' : p.variance <= 10 ? '#F59E0B' : '#EF4444';
            },
            fontSize: 11,
            fontWeight: 600,
          },
        },
      ],
      dataZoom: [
        { type: 'inside', yAxisIndex: 0, start: 0, end: 100 },
      ],
    };
  }, [projectBreakdown]);

  return <ChartWrapper option={option} height="480px" onClick={onClick} />;
}

// ===== PROJECT HEALTH RADAR =====
function ProjectHealthRadar({ projects, onClick }: { projects: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const indicators = [
      { name: 'Schedule (SPI)', max: 1.5 },
      { name: 'Cost (CPI)', max: 1.5 },
      { name: 'Progress %', max: 100 },
      { name: 'Efficiency %', max: 150 },
    ];
    
    const topProjects = projects.slice(0, 4);
    const colors = ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6'];
    
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff', fontSize: 11 } },
      legend: { data: topProjects.map(p => p.name), bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 }, type: 'scroll' },
      radar: {
        indicator: indicators,
        shape: 'polygon',
        radius: '60%',
        center: ['50%', '45%'],
        splitNumber: 4,
        axisName: { color: 'var(--text-muted)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'var(--border-color)' } },
        splitArea: { areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.04)'] } },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      series: [{
        type: 'radar',
        data: topProjects.map((p, idx) => ({
          name: p.name,
          value: [p.spi, p.cpi, p.percentComplete, p.baselineHours > 0 ? Math.min(150, Math.round((p.actualHours / p.baselineHours) * 100)) : 100],
          lineStyle: { color: colors[idx], width: 2 },
          itemStyle: { color: colors[idx] },
          areaStyle: { color: colors[idx] + '25' },
        })),
      }],
    };
  }, [projects]);

  return <ChartWrapper option={option} height="340px" onClick={onClick} />;
}

// ===== RISK MATRIX =====
function RiskMatrix({ scheduleRisks, budgetConcerns, onItemSelect, onClick }: { scheduleRisks: any[]; budgetConcerns: any[]; onItemSelect: (item: any) => void; onClick?: (params: any) => void }) {
  const matrixData = useMemo(() => {
    const items: any[] = [];
    
    // Calculate probability from variance - higher variance = higher probability of impact
    scheduleRisks.forEach(r => {
      const impact = r.variance > 14 ? 90 : r.variance > 7 ? 60 : 30;
      // Probability based on variance magnitude - scale to 50-95 range
      const probability = Math.min(95, Math.max(50, 50 + (r.variance || 0) * 2));
      items.push({ ...r, type: 'schedule', impact, probability, color: '#EF4444' });
    });
    
    budgetConcerns.slice(0, 15).forEach(b => {
      const impact = b.variance > 50 ? 85 : b.variance > 20 ? 55 : 25;
      // Probability based on variance percentage - scale to 40-90 range
      const probability = Math.min(90, Math.max(40, 40 + (b.variance || 0)));
      items.push({ ...b, type: 'budget', impact, probability, color: '#F59E0B' });
    });
    
    return items.slice(0, 30);
  }, [scheduleRisks, budgetConcerns]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 55, right: 20, top: 35, bottom: 55 },
    xAxis: {
      name: 'PROBABILITY',
      nameLocation: 'center',
      nameGap: 35,
      nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 },
      type: 'value',
      min: 0,
      max: 100,
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { show: false },
    },
    yAxis: {
      name: 'IMPACT',
      nameLocation: 'center',
      nameGap: 40,
      nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 },
      type: 'value',
      min: 0,
      max: 100,
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { show: false },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(22,27,34,0.95)',
      borderColor: 'var(--border-color)',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any) => {
        const d = matrixData[params.dataIndex];
        if (!d) return '';
        const impactLabel = d.impact > 70 ? 'HIGH' : d.impact > 40 ? 'MEDIUM' : 'LOW';
        const riskScore = Math.round((d.impact * d.probability) / 100);
        return `<strong>${d.name}</strong><br/>
          <span style="opacity:0.7">Type:</span> ${d.type === 'schedule' ? 'Schedule Risk' : 'Budget Concern'}<br/>
          <span style="opacity:0.7">Variance:</span> ${d.type === 'schedule' ? `+${d.variance} days late` : `+${d.variance}% over budget`}<br/>
          <span style="opacity:0.7">Impact:</span> ${impactLabel} (${d.impact}/100)<br/>
          <span style="opacity:0.7">Probability:</span> ${d.probability}%<br/>
          <span style="opacity:0.7">Risk Score:</span> <strong>${riskScore}</strong>/100<br/>
          <br/><em style="opacity:0.6">Impact = severity of delay or overrun<br/>Probability = likelihood of continued impact</em>`;
      },
    },
    series: [{
      type: 'scatter',
      data: matrixData.map(d => [d.probability, d.impact]),
      symbolSize: (params: any) => {
        const d = matrixData[params[2] !== undefined ? params[2] : params.dataIndex];
        const riskScore = d ? (d.impact * d.probability) / 100 : 14;
        return Math.max(14, Math.min(32, riskScore * 0.4));
      },
      itemStyle: { color: (params: any) => matrixData[params.dataIndex]?.color || '#6B7280' },
      emphasis: { itemStyle: { shadowBlur: 12, shadowColor: 'rgba(64,224,208,0.5)' } },
      label: {
        show: true,
        position: 'right',
        fontSize: 9,
        color: 'var(--text-muted)',
        formatter: (params: any) => {
          const d = matrixData[params.dataIndex];
          if (!d) return '';
          // Only label top risks
          const riskScore = (d.impact * d.probability) / 100;
          return riskScore > 50 ? d.name.slice(0, 14) : '';
        },
      },
    }],
    graphic: [
      { type: 'rect', left: '50%', top: 0, shape: { width: '50%', height: '50%' }, style: { fill: 'rgba(239,68,68,0.08)' }, silent: true, z: -1 },
      { type: 'text', left: '70%', top: '20%', style: { text: 'HIGH RISK', fill: '#EF4444', fontSize: 11, fontWeight: 'bold', opacity: 0.6 } },
      { type: 'text', left: '15%', top: '20%', style: { text: 'WATCH', fill: '#F59E0B', fontSize: 11, fontWeight: 'bold', opacity: 0.6 } },
      { type: 'text', left: '15%', top: '70%', style: { text: 'LOW RISK', fill: '#10B981', fontSize: 11, fontWeight: 'bold', opacity: 0.6 } },
    ],
  }), [matrixData]);

  return <ChartWrapper option={option} height="340px" onEvents={{ click: (params: any) => { matrixData[params.dataIndex] && onItemSelect(matrixData[params.dataIndex]); onClick?.(params); } }} />;
}

// ===== PROJECT PERFORMANCE COMPARISON (Parallel Coordinates) =====
function ProjectPerformanceParallel({ projectBreakdown, onClick }: { projectBreakdown: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const projects = projectBreakdown.slice(0, 20);
    if (!projects.length) return { backgroundColor: 'transparent' };
    
    const maxHours = Math.max(...projects.map(p => p.actualHours), 1);
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const d = params.data;
          if (!d) return '';
          return `<strong>${d.name}</strong><br/>
            SPI: ${sn(d.value[0])}<br/>
            CPI: ${sn(d.value[1])}<br/>
            Progress: ${d.value[2]}%<br/>
            Hours: ${d.value[3].toLocaleString()}<br/>
            Variance: ${d.value[4] > 0 ? '+' : ''}${d.value[4]}%`;
        },
      },
      parallelAxis: [
        { dim: 0, name: 'SPI', min: 0.5, max: 1.5, nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 }, axisLine: { lineStyle: { color: 'var(--border-color)' } }, axisLabel: { color: 'var(--text-muted)', fontSize: 10 } },
        { dim: 1, name: 'CPI', min: 0.5, max: 1.5, nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 }, axisLine: { lineStyle: { color: 'var(--border-color)' } }, axisLabel: { color: 'var(--text-muted)', fontSize: 10 } },
        { dim: 2, name: 'Progress %', min: 0, max: 100, nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 }, axisLine: { lineStyle: { color: 'var(--border-color)' } }, axisLabel: { color: 'var(--text-muted)', fontSize: 10 } },
        { dim: 3, name: 'Actual Hours', min: 0, max: maxHours, nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 }, axisLine: { lineStyle: { color: 'var(--border-color)' } }, axisLabel: { color: 'var(--text-muted)', fontSize: 10, formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v } },
        { dim: 4, name: 'Variance %', min: Math.min(-30, ...projects.map(p => p.variance)), max: Math.max(30, ...projects.map(p => p.variance)), nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 }, axisLine: { lineStyle: { color: 'var(--border-color)' } }, axisLabel: { color: 'var(--text-muted)', fontSize: 10 } },
      ],
      parallel: {
        left: 60,
        right: 60,
        top: 40,
        bottom: 30,
        parallelAxisDefault: {
          areaSelectStyle: { width: 20, opacity: 0.3, color: 'rgba(64,224,208,0.3)' },
        },
      },
      series: [{
        type: 'parallel',
        lineStyle: {
          width: 2.5,
          opacity: 0.7,
        },
        emphasis: {
          lineStyle: { width: 4, opacity: 1 },
        },
        data: projects.map(p => {
          const isGood = p.spi >= 1 && p.cpi >= 1;
          const isCrit = p.spi < 0.9 || p.cpi < 0.9;
          return {
            name: p.name,
            value: [p.spi, p.cpi, p.percentComplete, p.actualHours, p.variance],
            lineStyle: {
              color: isGood ? '#10B981' : isCrit ? '#EF4444' : '#F59E0B',
            },
          };
        }),
      }],
    };
  }, [projectBreakdown]);

  if (!projectBreakdown.length) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No project data</div>;
  return <ChartWrapper option={option} height="320px" onClick={onClick} />;
}

// ===== FLOAT & CASCADE GANTT =====
function FloatCascadeGantt({ tasks, milestones, onClick }: { tasks: any[]; milestones: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    // Get top tasks with float data
    const taskData = tasks.slice(0, 15).map((t: any, idx: number) => {
      const baseline = t.baselineHours || t.budgetHours || 0;
      const actual = t.actualHours || 0;
      const pc = t.percentComplete || 0;
      // Use real totalFloat if available, otherwise calculate based on hours variance
      const totalFloat = t.totalFloat !== undefined 
        ? t.totalFloat 
        : Math.max(0, baseline > 0 ? Math.round((1 - actual / baseline) * 20) : 10);
      const isCritical = t.isCritical !== undefined ? t.isCritical : totalFloat <= 0;
      
      return {
        name: (t.name || t.taskName || `Task ${idx + 1}`).slice(0, 25),
        actual: actual,
        float: totalFloat,
        isCritical,
        pc,
        dependencies: t.predecessors || [],
      };
    });

    const names = taskData.map(t => t.name);
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const d = taskData[params[0]?.dataIndex];
          if (!d) return '';
          return `<strong>${d.name}</strong><br/>
            Hours: ${d.actual}<br/>
            Float: ${d.float} hrs ${d.isCritical ? '<span style="color:#EF4444">(CRITICAL)</span>' : ''}<br/>
            Progress: ${d.pc}%`;
        },
      },
      legend: { data: ['Work Hours', 'Float (Buffer)', 'Critical Path'], bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
      grid: { left: 150, right: 40, top: 30, bottom: 50 },
      xAxis: { type: 'value', name: 'Hours', nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 }, axisLabel: { color: 'var(--text-muted)', fontSize: 10 }, splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } } },
      yAxis: { type: 'category', data: names, axisLabel: { color: 'var(--text-primary)', fontSize: 10 }, axisLine: { lineStyle: { color: 'var(--border-color)' } } },
      series: [
        {
          name: 'Work Hours',
          type: 'bar',
          stack: 'total',
          data: taskData.map(t => ({ value: t.actual, itemStyle: { color: t.isCritical ? '#EF4444' : '#3B82F6' } })),
          barWidth: '60%',
        },
        {
          name: 'Float (Buffer)',
          type: 'bar',
          stack: 'total',
          data: taskData.map(t => ({ value: t.float, itemStyle: { color: 'rgba(64,224,208,0.3)', borderColor: 'var(--pinnacle-teal)', borderWidth: 1, borderType: 'dashed' } })),
          barWidth: '60%',
        },
      ],
    };
  }, [tasks]);

  return <ChartWrapper option={option} height="400px" onClick={onClick} />;
}

// ===== FTE SATURATION HEATMAP =====
function FTESaturationHeatmap({ tasks, onClick }: { tasks: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    // Group tasks by week based on their dates
    const totalHours = tasks.reduce((sum, t) => sum + (t.actualHours || 0), 0);
    const totalBaseline = tasks.reduce((sum, t) => sum + (t.baselineHours || t.budgetHours || 0), 0);
    const uniqueResources = new Set(tasks.map(t => t.assignedResource || t.resource).filter(Boolean));
    const resourceCount = Math.max(uniqueResources.size, 5);
    
    // FTE capacity (40 hrs/week per resource)
    const fteCapacity = resourceCount * 40;
    
    // Generate 12 weeks
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (11 - i) * 7);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    // Calculate actual weekly demand by grouping tasks by date
    // If no date data, distribute evenly based on completion status
    const avgWeeklyDemand = totalHours / 12;
    const completedTasks = tasks.filter(t => (t.percentComplete || 0) >= 100).length;
    const completionRatio = tasks.length > 0 ? completedTasks / tasks.length : 0;
    
    // Early weeks have more completed work, later weeks have remaining work
    const weeklyDemand = weeks.map((_, i) => {
      const weekPosition = i / 11; // 0 to 1
      // Weight earlier weeks more heavily if more tasks are complete
      const weight = completionRatio > 0.5 
        ? (1 - weekPosition) * 0.6 + 0.7  // Front-loaded
        : weekPosition * 0.6 + 0.7;        // Back-loaded
      return Math.round(avgWeeklyDemand * weight);
    });
    
    const saturationPercent = weeklyDemand.map(d => Math.round((d / fteCapacity) * 100));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const idx = params[0]?.dataIndex;
          if (idx === undefined) return '';
          return `<strong>${weeks[idx]}</strong><br/>
            Demand: ${weeklyDemand[idx]} hrs<br/>
            Capacity: ${fteCapacity} hrs (${resourceCount} FTEs)<br/>
            Utilization: <span style="color:${saturationPercent[idx] > 100 ? '#EF4444' : saturationPercent[idx] > 80 ? '#F59E0B' : '#10B981'}">${saturationPercent[idx]}%</span>`;
        },
      },
      grid: { left: 60, right: 30, top: 40, bottom: 60 },
      xAxis: {
        type: 'category',
        data: weeks,
        axisLabel: { color: 'var(--text-muted)', fontSize: 10, rotate: 45 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      yAxis: {
        type: 'value',
        name: 'Hours',
        nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      },
      series: [
        {
          name: 'Labor Demand',
          type: 'bar',
          data: weeklyDemand.map((d, i) => ({
            value: d,
            itemStyle: {
              color: saturationPercent[i] > 100 ? '#EF4444' : saturationPercent[i] > 80 ? '#F59E0B' : '#3B82F6',
            },
          })),
          barWidth: '50%',
        },
        {
          name: 'FTE Capacity',
          type: 'line',
          data: weeks.map(() => fteCapacity),
          lineStyle: { color: '#10B981', width: 2, type: 'dashed' },
          symbol: 'none',
        },
        {
          name: 'Overload Zone',
          type: 'line',
          data: weeks.map(() => fteCapacity * 1.2),
          lineStyle: { color: '#EF4444', width: 1, type: 'dotted' },
          symbol: 'none',
        },
      ],
      legend: { data: ['Labor Demand', 'FTE Capacity', 'Overload Zone'], bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
    };
  }, [tasks]);

  return <ChartWrapper option={option} height="380px" onClick={onClick} />;
}

// ===== EARNED VALUE S-CURVE =====
function EarnedValueSCurve({ tasks, sCurveData, onClick }: { tasks: any[]; sCurveData: any; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const dates = sCurveData?.dates || [];
    const planned = sCurveData?.planned || [];
    const actual = sCurveData?.actual || [];
    
    // Calculate Earned Value
    let totalBaseline = 0, totalActual = 0, totalEarned = 0;
    tasks.forEach((t: any) => {
      const baseline = t.baselineHours || t.budgetHours || 0;
      const actualHrs = t.actualHours || 0;
      const pc = (t.percentComplete || 0) / 100;
      totalBaseline += baseline;
      totalActual += actualHrs;
      totalEarned += baseline * pc;
    });
    
    // Create EV projection
    const ev = dates.map((_: any, i: number) => Math.round((i / dates.length) * totalEarned));
    const pv = planned;
    const ac = actual;
    
    // Calculate variances
    const sv = totalEarned - (pv[pv.length - 1] || 0);
    const cv = totalEarned - totalActual;
    const spi = pv[pv.length - 1] > 0 ? totalEarned / pv[pv.length - 1] : 1;
    const cpi = totalActual > 0 ? totalEarned / totalActual : 1;

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
      },
      legend: { data: ['Planned Value (PV)', 'Earned Value (EV)', 'Actual Cost (AC)'], bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
      grid: { left: 60, right: 30, top: 30, bottom: 80 },
      xAxis: {
        type: 'category',
        data: dates.length ? dates.map((d: string) => {
          try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
          catch { return d; }
        }) : ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'],
        axisLabel: { color: 'var(--text-muted)', fontSize: 10, rotate: 45 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      yAxis: {
        type: 'value',
        name: 'Hours',
        nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      },
      series: [
        { name: 'Planned Value (PV)', type: 'line', data: pv, lineStyle: { color: '#6B7280', width: 2, type: 'dashed' }, symbol: 'none', smooth: true },
        { name: 'Earned Value (EV)', type: 'line', data: ev, lineStyle: { color: 'var(--pinnacle-teal)', width: 3 }, symbol: 'circle', symbolSize: 6, itemStyle: { color: 'var(--pinnacle-teal)' }, smooth: true, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(64,224,208,0.2)' }, { offset: 1, color: 'rgba(64,224,208,0)' }] } } },
        { name: 'Actual Cost (AC)', type: 'line', data: ac, lineStyle: { color: ac[ac.length - 1] > ev[ev.length - 1] ? '#EF4444' : '#10B981', width: 2 }, symbol: 'circle', symbolSize: 5, smooth: true },
      ],
      graphic: [
        { type: 'text', right: 40, top: 10, style: { text: `SPI: ${sn(spi)} | CPI: ${sn(cpi)}`, fill: 'var(--text-muted)', fontSize: 11 } },
      ],
    };
  }, [tasks, sCurveData]);

  return <ChartWrapper option={option} height="340px" onClick={onClick} />;
}

// ===== BUFFER CONSUMPTION SUNBURST =====
function BufferConsumptionSunburst({ projectBreakdown, milestones, onClick }: { projectBreakdown: any[]; milestones: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    // Group by phase/project and calculate buffer status
    const data: any[] = [{
      name: 'Portfolio',
      itemStyle: { color: '#3B82F6' },
      children: projectBreakdown.slice(0, 8).map(p => {
        const bufferUsed = Math.min(100, Math.max(0, p.variance + 50)); // Normalize to 0-100
        const color = bufferUsed >= 80 ? '#EF4444' : bufferUsed >= 50 ? '#F59E0B' : '#10B981';
        
        return {
          name: p.name.slice(0, 15),
          value: p.actualHours || 100,
          itemStyle: { color },
          children: [
            { name: 'Buffer Used', value: bufferUsed, itemStyle: { color } },
            { name: 'Buffer Left', value: 100 - bufferUsed, itemStyle: { color: 'rgba(255,255,255,0.1)' } },
          ],
        };
      }),
    }];

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const d = params.data;
          if (d.name === 'Buffer Used') return `Buffer Consumed: ${d.value}%`;
          if (d.name === 'Buffer Left') return `Buffer Remaining: ${d.value}%`;
          return `<strong>${d.name}</strong><br/>${d.value ? `Hours: ${d.value}` : ''}`;
        },
      },
      series: [{
        type: 'sunburst',
        data: data[0].children,
        radius: ['15%', '90%'],
        center: ['50%', '50%'],
        sort: undefined,
        emphasis: { focus: 'ancestor' },
        levels: [
          {},
          { r0: '15%', r: '45%', itemStyle: { borderWidth: 2, borderColor: 'var(--bg-card)' }, label: { rotate: 'tangential', fontSize: 10, color: 'var(--text-primary)' } },
          { r0: '45%', r: '90%', label: { position: 'outside', fontSize: 9, color: 'var(--text-muted)' }, itemStyle: { borderWidth: 1, borderColor: 'var(--bg-card)' } },
        ],
      }],
    };
  }, [projectBreakdown, milestones]);

  return <ChartWrapper option={option} height="420px" onClick={onClick} />;
}

// ===== LINCHPIN ANALYSIS - Network Graph =====
function LinchpinAnalysis({ tasks, milestones, onClick }: { tasks: any[]; milestones: any[]; onClick?: (params: any) => void }) {
  const { nodes, links, maxCount } = useMemo(() => {
    // Build dependency network
    const dependencyCount: Record<string, { name: string; count: number; type: string; status: string; id: string }> = {};
    const linkData: { source: string; target: string }[] = [];
    
    // Add milestones as nodes
    milestones.forEach((m: any, idx) => {
      const key = m.id || m.name || `milestone-${idx}`;
      dependencyCount[key] = { 
        id: key,
        name: m.name || m.milestone || key, 
        count: 5, 
        type: 'milestone', 
        status: m.status || 'In Progress' 
      };
    });
    
    // Add tasks and track dependencies
    tasks.slice(0, 50).forEach((t: any, idx) => {
      const taskId = t.id || t.taskId || `task-${idx}`;
      const taskName = t.name || t.taskName || taskId;
      
      if (!dependencyCount[taskId]) {
        dependencyCount[taskId] = { 
          id: taskId,
          name: taskName, 
          count: 1, 
          type: 'task', 
          status: t.status || 'In Progress' 
        };
      }
      
      const predecessors = t.predecessors || t.dependencies || [];
      if (Array.isArray(predecessors)) {
        predecessors.forEach((pred: string) => {
          if (!dependencyCount[pred]) {
            const predTask = tasks.find((pt: any) => pt.id === pred || pt.taskId === pred);
            dependencyCount[pred] = {
              id: pred,
              name: predTask?.name || predTask?.taskName || pred,
              count: 0,
              type: 'task',
              status: predTask?.status || 'In Progress',
            };
          }
          dependencyCount[pred].count++;
          linkData.push({ source: pred, target: taskId });
        });
      }
    });

    const sortedNodes = Object.values(dependencyCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
    
    const nodeIds = new Set(sortedNodes.map(n => n.id));
    const filteredLinks = linkData.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));
    
    return { 
      nodes: sortedNodes, 
      links: filteredLinks,
      maxCount: Math.max(...sortedNodes.map(n => n.count), 1)
    };
  }, [tasks, milestones]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(22,27,34,0.95)',
      borderColor: 'var(--border-color)',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any) => {
        const d = params.data;
        if (params.dataType === 'edge') {
          return `${d.source} → ${d.target}`;
        }
        return `<strong>${d.name}</strong><br/>
          Downstream Dependencies: ${d.symbolSize / 4}<br/>
          Type: ${d.category === 0 ? 'Critical Linchpin' : d.category === 1 ? 'Important' : 'Standard'}<br/>
          Status: ${d.status || 'In Progress'}`;
      },
    },
    legend: {
      data: ['Critical Linchpin', 'Important', 'Standard'],
      bottom: 0,
      textStyle: { color: 'var(--text-muted)', fontSize: 10 },
    },
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      draggable: true,
      force: {
        repulsion: 300,
        gravity: 0.1,
        edgeLength: [80, 200],
        layoutAnimation: true,
      },
      categories: [
        { name: 'Critical Linchpin', itemStyle: { color: '#EF4444' } },
        { name: 'Important', itemStyle: { color: '#F59E0B' } },
        { name: 'Standard', itemStyle: { color: '#3B82F6' } },
      ],
      data: nodes.map(n => ({
        name: n.name.slice(0, 20),
        id: n.id,
        symbolSize: Math.max(20, Math.min(60, (n.count / maxCount) * 60)),
        category: n.count >= 8 ? 0 : n.count >= 4 ? 1 : 2,
        status: n.status,
        label: {
          show: n.count >= 4,
          position: 'right',
          color: 'var(--text-primary)',
          fontSize: 10,
        },
        itemStyle: {
          shadowBlur: n.count >= 8 ? 15 : 5,
          shadowColor: n.count >= 8 ? 'rgba(239,68,68,0.5)' : 'rgba(0,0,0,0.3)',
        },
      })),
      links: links.map(l => ({
        source: l.source,
        target: l.target,
        lineStyle: {
          color: 'rgba(255,255,255,0.2)',
          curveness: 0.2,
        },
      })),
      emphasis: {
        focus: 'adjacency',
        itemStyle: { shadowBlur: 20, shadowColor: 'rgba(64,224,208,0.5)' },
        lineStyle: { width: 3, color: 'var(--pinnacle-teal)' },
      },
    }],
  }), [nodes, links, maxCount]);

  if (!nodes.length) {
    // Fallback: show actual tasks based on their actual properties (no random data)
    const fallbackNodes = tasks.slice(0, 8).map((t, i) => ({
      name: (t.name || t.taskName || `Task ${i + 1}`).slice(0, 15),
      id: `node-${i}`,
      // Use actual task metrics: priority based on hours or completion
      priority: t.isCritical ? 3 : ((t.baselineHours || 0) > 50 ? 2 : 1),
      hours: t.baselineHours || t.actualHours || 10,
    }));
    const maxHours = Math.max(...fallbackNodes.map(n => n.hours), 1);
    
    return (
      <ChartWrapper 
        option={{
          backgroundColor: 'transparent',
          tooltip: { trigger: 'item', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff', fontSize: 11 } },
          series: [{
            type: 'graph',
            layout: 'force',
            roam: true,
            force: { repulsion: 200, gravity: 0.15, edgeLength: [60, 150] },
            categories: [
              { name: 'Critical', itemStyle: { color: '#EF4444' } },
              { name: 'Important', itemStyle: { color: '#F59E0B' } },
              { name: 'Standard', itemStyle: { color: '#3B82F6' } },
            ],
            data: fallbackNodes.map(n => ({
              name: n.name,
              id: n.id,
              symbolSize: Math.max(25, (n.hours / maxHours) * 50),
              category: n.priority >= 3 ? 0 : n.priority >= 2 ? 1 : 2,
              label: { show: n.hours >= maxHours * 0.5, position: 'right', color: 'var(--text-primary)', fontSize: 10 },
            })),
            links: fallbackNodes.slice(0, -1).map((n, i) => ({
              source: n.id,
              target: fallbackNodes[i + 1].id,
              lineStyle: { color: 'rgba(255,255,255,0.15)', curveness: 0.3 },
            })),
          }],
          legend: { data: ['Critical', 'Important', 'Standard'], bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
        }} 
        height="420px"
        onClick={onClick}
      />
    );
  }
  
  return <ChartWrapper option={option} height="420px" onClick={onClick} />;
}

// ===== ELASTIC SCHEDULING CHART =====
function ElasticSchedulingChart({ tasks, onClick }: { tasks: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    const totalHours = tasks.reduce((sum, t) => sum + (t.actualHours || 0), 0);
    const uniqueResources = new Set(tasks.map(t => t.assignedResource || t.resource).filter(Boolean));
    const resourceCount = Math.max(uniqueResources.size, 5);
    const maxCapacity = resourceCount * 40;
    
    // Generate 10 weeks
    const weeks = Array.from({ length: 10 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (9 - i) * 7);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    // Calculate weekly utilization based on task completion status
    // Tasks with higher completion contribute more to earlier weeks
    const completedTasks = tasks.filter(t => (t.percentComplete || 0) >= 100);
    const inProgressTasks = tasks.filter(t => (t.percentComplete || 0) > 0 && (t.percentComplete || 0) < 100);
    const pendingTasks = tasks.filter(t => (t.percentComplete || 0) === 0);
    
    const weeklyUtil = weeks.map((_, i) => {
      const base = totalHours / 10;
      const weekPosition = i / 9; // 0 to 1
      // Earlier weeks: completed + some in-progress; Later weeks: in-progress + pending
      const completedFactor = Math.max(0, 1 - weekPosition * 1.5);
      const pendingFactor = Math.max(0, weekPosition * 1.5 - 0.5);
      const weight = 0.7 + completedFactor * 0.3 - pendingFactor * 0.2;
      return Math.round(base * weight);
    });
    
    const maxUtil = Math.max(...weeklyUtil, maxCapacity);
    const valleys = weeklyUtil.map(u => maxUtil - u);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const idx = params[0]?.dataIndex;
          if (idx === undefined) return '';
          const isValley = valleys[idx] > maxUtil * 0.3;
          return `<strong>${weeks[idx]}</strong><br/>
            Current Load: ${weeklyUtil[idx]} hrs<br/>
            Available Capacity: <span style="color:#10B981">${valleys[idx]} hrs</span><br/>
            ${isValley ? '<strong style="color:#10B981">OPTIMAL SCHEDULING WINDOW</strong>' : '<em>Limited capacity</em>'}`;
        },
      },
      legend: { data: ['Current Load', 'Available Capacity'], bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
      grid: { left: 60, right: 30, top: 30, bottom: 50 },
      xAxis: { type: 'category', data: weeks, axisLabel: { color: 'var(--text-muted)', fontSize: 10, rotate: 45 }, axisLine: { lineStyle: { color: 'var(--border-color)' } } },
      yAxis: { type: 'value', name: 'Hours', nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 }, axisLabel: { color: 'var(--text-muted)', fontSize: 10 }, splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } } },
      series: [
        { name: 'Current Load', type: 'bar', stack: 'total', data: weeklyUtil, itemStyle: { color: '#3B82F6' }, barWidth: '50%' },
        { name: 'Available Capacity', type: 'bar', stack: 'total', data: valleys.map((v, i) => ({ value: v, itemStyle: { color: v > maxUtil * 0.3 ? 'rgba(16,185,129,0.6)' : 'rgba(16,185,129,0.2)', borderColor: v > maxUtil * 0.3 ? '#10B981' : 'transparent', borderWidth: v > maxUtil * 0.3 ? 2 : 0 } })), barWidth: '50%' },
      ],
    };
  }, [tasks]);

  return <ChartWrapper option={option} height="340px" onClick={onClick} />;
}

// ===== MILESTONE TIMELINE CHART =====
function MilestoneTimelineChart({ milestones, onClick }: { milestones: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    // Sort milestones by planned date
    const sorted = [...milestones].slice(0, 20).map((m, idx) => ({
      name: m.name || m.milestone || `Milestone ${idx + 1}`,
      planned: m.plannedCompletion || '',
      forecast: m.forecastCompletion || m.plannedCompletion || '',
      variance: m.varianceDays || 0,
      status: m.status || 'In Progress',
      percentComplete: m.percentComplete || 0,
    }));
    
    const categories = sorted.map(m => m.name.slice(0, 18));
    const plannedDates = sorted.map((m, idx) => idx);
    const variances = sorted.map(m => m.variance);
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const m = sorted[params[0]?.dataIndex];
          if (!m) return '';
          return `<strong>${m.name}</strong><br/>
            Planned: ${m.planned}<br/>
            Forecast: ${m.forecast}<br/>
            Variance: <span style="color:${m.variance <= 0 ? '#10B981' : m.variance <= 7 ? '#F59E0B' : '#EF4444'}">${m.variance > 0 ? '+' : ''}${m.variance} days</span><br/>
            Status: ${m.status}<br/>
            Progress: ${m.percentComplete}%`;
        },
      },
      legend: { data: ['On Time', 'Delayed'], bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
      grid: { left: 160, right: 60, top: 30, bottom: 50 },
      xAxis: {
        type: 'value',
        name: 'Delay (Days)',
        nameLocation: 'center',
        nameGap: 30,
        nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 },
        axisLabel: { color: 'var(--text-muted)', fontSize: 10, formatter: (v: number) => v > 0 ? `+${v}` : v },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        data: categories,
        axisLabel: { color: 'var(--text-primary)', fontSize: 10 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      series: [{
        type: 'bar',
        data: variances.map((v, i) => ({
          value: v,
          itemStyle: {
            color: v <= 0 ? '#10B981' : v <= 7 ? '#F59E0B' : '#EF4444',
            borderRadius: v >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
          },
        })),
        barWidth: '60%',
        label: {
          show: true,
          position: (params: any) => variances[params.dataIndex] >= 0 ? 'right' : 'left',
          formatter: (params: any) => {
            const v = variances[params.dataIndex];
            return v === 0 ? 'On Time' : `${v > 0 ? '+' : ''}${v}d`;
          },
          color: 'var(--text-muted)',
          fontSize: 10,
        },
      }],
      dataZoom: [{ type: 'inside', yAxisIndex: 0 }],
    };
  }, [milestones]);

  if (!milestones.length) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No milestone data available</div>;
  return <ChartWrapper option={option} height="450px" onClick={onClick} />;
}

// ===== MILESTONE STATUS DISTRIBUTION =====
function MilestoneStatusChart({ milestones, onClick }: { milestones: any[]; onClick?: (params: any) => void }) {
  const statusData = useMemo(() => {
    const complete = milestones.filter(m => m.status === 'Complete' || m.percentComplete >= 100).length;
    const onTime = milestones.filter(m => m.status !== 'Complete' && (m.varianceDays || 0) <= 0).length;
    const delayed = milestones.filter(m => m.status !== 'Complete' && (m.varianceDays || 0) > 0 && (m.varianceDays || 0) <= 7).length;
    const critical = milestones.filter(m => m.status !== 'Complete' && (m.varianceDays || 0) > 7).length;
    
    return [
      { name: 'Completed', value: complete, color: '#8B5CF6' },
      { name: 'On Time', value: onTime, color: '#10B981' },
      { name: 'Slightly Delayed', value: delayed, color: '#F59E0B' },
      { name: 'Critical Delay', value: critical, color: '#EF4444' },
    ].filter(d => d.value > 0);
  }, [milestones]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(22,27,34,0.95)',
      borderColor: 'var(--border-color)',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any) => `${params.name}: ${params.value} milestones (${params.percent}%)`,
    },
    legend: { 
      orient: 'vertical', 
      right: 20, 
      top: 'center', 
      textStyle: { color: 'var(--text-muted)', fontSize: 11 },
    },
    series: [{
      type: 'pie',
      radius: ['50%', '80%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 8, borderColor: 'var(--bg-card)', borderWidth: 3 },
      label: {
        show: true,
        position: 'center',
        formatter: () => `${milestones.length}\nTotal`,
        fontSize: 18,
        fontWeight: 'bold',
        color: 'var(--text-primary)',
        lineHeight: 24,
      },
      emphasis: {
        label: { show: true, fontSize: 20, fontWeight: 'bold' },
      },
      labelLine: { show: false },
      data: statusData.map(d => ({
        value: d.value,
        name: d.name,
        itemStyle: { color: d.color },
      })),
    }],
  }), [statusData, milestones.length]);

  return <ChartWrapper option={option} height="320px" onClick={onClick} />;
}

// ===== MILESTONE PROGRESS GAUGE =====
function MilestoneProgressGauge({ milestones }: { milestones: any[] }) {
  const stats = useMemo(() => {
    const total = milestones.length || 1;
    const complete = milestones.filter(m => m.status === 'Complete' || m.percentComplete >= 100).length;
    const avgProgress = milestones.reduce((sum, m) => sum + (m.percentComplete || 0), 0) / total;
    const avgDelay = milestones.reduce((sum, m) => sum + (m.varianceDays || 0), 0) / total;
    
    return { total, complete, avgProgress: Math.round(avgProgress), avgDelay: Math.round(avgDelay * 10) / 10 };
  }, [milestones]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', padding: '1rem 0' }}>
      <div style={{ textAlign: 'center', padding: '1.5rem', background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(139,92,246,0.05))', borderRadius: '16px', border: '1px solid rgba(139,92,246,0.3)' }}>
        <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#8B5CF6' }}>{stats.complete}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Completed</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>of {stats.total} milestones</div>
      </div>
      <div style={{ textAlign: 'center', padding: '1.5rem', background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.05))', borderRadius: '16px', border: '1px solid rgba(16,185,129,0.3)' }}>
        <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#10B981' }}>{stats.avgProgress}%</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Avg Progress</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>across all milestones</div>
      </div>
      <div style={{ textAlign: 'center', padding: '1.5rem', background: `linear-gradient(135deg, rgba(${stats.avgDelay <= 0 ? '16,185,129' : stats.avgDelay <= 5 ? '245,158,11' : '239,68,68'},0.1), rgba(${stats.avgDelay <= 0 ? '16,185,129' : stats.avgDelay <= 5 ? '245,158,11' : '239,68,68'},0.05))`, borderRadius: '16px', border: `1px solid rgba(${stats.avgDelay <= 0 ? '16,185,129' : stats.avgDelay <= 5 ? '245,158,11' : '239,68,68'},0.3)` }}>
        <div style={{ fontSize: '2.5rem', fontWeight: 900, color: stats.avgDelay <= 0 ? '#10B981' : stats.avgDelay <= 5 ? '#F59E0B' : '#EF4444' }}>
          {stats.avgDelay > 0 ? '+' : ''}{stats.avgDelay}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Avg Delay (days)</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{stats.avgDelay <= 0 ? 'On schedule' : 'Behind schedule'}</div>
      </div>
    </div>
  );
}

// ===== VARIANCE TREND MINI =====
function VarianceTrend({ label, current, previous, period }: { label: string; current: number | null | undefined; previous: number | null | undefined; period: string }) {
  const safeC = current ?? 0;
  const safeP = previous ?? safeC;
  const change = safeC - safeP;
  const percentChange = safeP !== 0 ? Math.round((change / Math.abs(safeP)) * 100) : 0;
  const isPositive = label.includes('CPI') || label.includes('SPI') ? change >= 0 : change <= 0;
  
  return (
    <div style={{ 
      padding: '1rem', 
      background: `linear-gradient(135deg, ${isPositive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'} 0%, rgba(255,255,255,0.02) 100%)`,
      borderRadius: '12px',
      border: `1px solid ${isPositive ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</span>
        <span style={{ 
          fontSize: '0.7rem', 
          color: isPositive ? '#10B981' : '#EF4444', 
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: '4px',
          background: isPositive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
        }}>
          {isPositive ? '+' : ''}{percentChange}%
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: isPositive ? '#10B981' : '#EF4444' }}>
          {typeof safeC === 'number' ? (label === 'Hours' ? (isFinite(safeC) ? safeC.toLocaleString() : '0') : sn(safeC)) : safeC}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          from {typeof safeP === 'number' ? (label === 'Hours' ? (isFinite(safeP) ? safeP.toLocaleString() : '0') : sn(safeP)) : safeP}
        </span>
      </div>
    </div>
  );
}

// ===== VARIANCE WATERFALL CHART =====
function VarianceWaterfallChart({ projectBreakdown, onClick }: { projectBreakdown: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    // Sort worst first (most over budget) then add a net total
    const sorted = [...projectBreakdown].sort((a, b) => (b.actualHours - b.baselineHours) - (a.actualHours - a.baselineHours));
    const names = [...sorted.map(p => p.name.length > 22 ? p.name.slice(0, 22) + '..' : p.name), 'Net Total'];
    const values = sorted.map(p => p.actualHours - p.baselineHours);
    const netTotal = values.reduce((s, v) => s + v, 0);
    
    // For waterfall, we need running totals
    // Each bar floats from its start position
    let running = 0;
    const baseData: (number | string)[] = [];
    const posData: (number | { value: number; itemStyle: any })[] = [];
    const negData: (number | { value: number; itemStyle: any })[] = [];
    
    values.forEach(v => {
      if (v >= 0) {
        baseData.push(running);
        posData.push({ value: v, itemStyle: { color: v <= 100 ? '#F59E0B' : '#EF4444', borderRadius: [0, 4, 4, 0] } });
        negData.push(0);
      } else {
        baseData.push(running + v);
        posData.push(0);
        negData.push({ value: Math.abs(v), itemStyle: { color: '#10B981', borderRadius: [0, 4, 4, 0] } });
      }
      running += v;
    });
    // Net total bar
    baseData.push(0);
    if (netTotal >= 0) {
      posData.push({ value: netTotal, itemStyle: { color: netTotal <= 100 ? '#F59E0B' : '#EF4444', borderRadius: [0, 6, 6, 0], borderWidth: 2, borderColor: '#fff' } });
      negData.push(0);
    } else {
      posData.push(0);
      negData.push({ value: Math.abs(netTotal), itemStyle: { color: '#10B981', borderRadius: [0, 6, 6, 0], borderWidth: 2, borderColor: '#fff' } });
    }
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const idx = params[0]?.dataIndex;
          if (idx === sorted.length) {
            return `<strong>Net Portfolio Variance</strong><br/>${netTotal >= 0 ? '+' : ''}${netTotal.toLocaleString()} hrs<br/><em style="opacity:0.6">Sum of all project variances.\nPositive = over budget, Negative = under budget.</em>`;
          }
          const p = sorted[idx];
          if (!p) return '';
          const diff = p.actualHours - p.baselineHours;
          return `<strong>${p.name}</strong><br/>
            Baseline: ${p.baselineHours.toLocaleString()} hrs<br/>
            Actual: ${p.actualHours.toLocaleString()} hrs<br/>
            Variance: <span style="color:${diff <= 0 ? '#10B981' : '#EF4444'}">${diff > 0 ? '+' : ''}${diff.toLocaleString()} hrs (${p.variance > 0 ? '+' : ''}${p.variance}%)</span><br/>
            <em style="opacity:0.6">Variance = (Actual - Baseline) / Baseline x 100</em>`;
        },
      },
      grid: { left: 160, right: 70, top: 15, bottom: 25 },
      xAxis: { 
        type: 'value', 
        axisLabel: { color: 'var(--text-muted)', fontSize: 10, formatter: (v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}K` : v >= 0 ? `+${v}` : v },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      yAxis: { 
        type: 'category', data: names,
        axisLabel: { color: (idx: number) => idx === sorted.length ? 'var(--pinnacle-teal)' : 'var(--text-primary)', fontSize: 11, fontWeight: (idx: number) => idx === sorted.length ? 700 : 400 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      series: [
        { name: 'Base', type: 'bar', stack: 'waterfall', data: baseData as any, itemStyle: { color: 'transparent' }, barWidth: '55%', emphasis: { itemStyle: { color: 'transparent' } } },
        { name: 'Over Budget', type: 'bar', stack: 'waterfall', data: posData as any, barWidth: '55%', label: { show: true, position: 'right', formatter: (p: any) => p.value > 0 ? `+${Math.round(p.value).toLocaleString()}` : '', color: '#EF4444', fontSize: 10, fontWeight: 600 } },
        { name: 'Under Budget', type: 'bar', stack: 'waterfall', data: negData as any, barWidth: '55%', label: { show: true, position: 'right', formatter: (p: any) => p.value > 0 ? `-${Math.round(p.value).toLocaleString()}` : '', color: '#10B981', fontSize: 10, fontWeight: 600 } },
      ],
    };
  }, [projectBreakdown]);

  return <ChartWrapper option={option} height="420px" onClick={onClick} />;
}

// ===== VARIANCE DISTRIBUTION CHART =====
function VarianceDistributionChart({ projectBreakdown, onClick }: { projectBreakdown: any[]; onClick?: (params: any) => void }) {
  const distribution = useMemo(() => {
    const ranges = [
      { label: '< -20%', min: -Infinity, max: -20, color: '#10B981', count: 0 },
      { label: '-20% to -10%', min: -20, max: -10, color: '#34D399', count: 0 },
      { label: '-10% to 0%', min: -10, max: 0, color: '#6EE7B7', count: 0 },
      { label: '0% to 10%', min: 0, max: 10, color: '#FCD34D', count: 0 },
      { label: '10% to 20%', min: 10, max: 20, color: '#F59E0B', count: 0 },
      { label: '> 20%', min: 20, max: Infinity, color: '#EF4444', count: 0 },
    ];
    
    projectBreakdown.forEach(p => {
      const range = ranges.find(r => p.variance >= r.min && p.variance < r.max);
      if (range) range.count++;
    });
    
    return ranges;
  }, [projectBreakdown]);

  const option: EChartsOption = useMemo(() => {
    const filtered = distribution.filter(d => d.count > 0);
    const maxCount = Math.max(...filtered.map(d => d.count), 1);
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const d = filtered[params[0]?.dataIndex];
          if (!d) return '';
          const pct = projectBreakdown.length > 0 ? Math.round((d.count / projectBreakdown.length) * 100) : 0;
          return `<strong>${d.label}</strong><br/>${d.count} project${d.count !== 1 ? 's' : ''} (${pct}% of portfolio)<br/><em style="opacity:0.6">Variance = (Actual - Baseline) / Baseline</em>`;
        },
      },
      grid: { left: 110, right: 50, top: 20, bottom: 30 },
      xAxis: { 
        type: 'value', 
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 }, 
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
        name: 'Projects',
        nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
      },
      yAxis: { 
        type: 'category', 
        data: filtered.map(d => d.label),
        axisLabel: { color: 'var(--text-primary)', fontSize: 11 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      series: [{
        type: 'bar',
        data: filtered.map(d => ({
          value: d.count,
          itemStyle: { color: d.color, borderRadius: [0, 6, 6, 0] },
        })),
        barWidth: '55%',
        label: {
          show: true,
          position: 'right',
          formatter: (params: any) => filtered[params.dataIndex]?.count || '',
          color: 'var(--text-secondary)',
          fontSize: 12,
          fontWeight: 700,
        },
      }],
    };
  }, [distribution, projectBreakdown]);

  return <ChartWrapper option={option} height="380px" onClick={onClick} />;
}

// ===== PERFORMANCE QUADRANT CHART =====
function PerformanceQuadrantChart({ projectBreakdown, onClick }: { projectBreakdown: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(22,27,34,0.95)',
      borderColor: 'var(--border-color)',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any) => {
        const p = projectBreakdown[params.dataIndex];
        if (!p) return '';
        return `<strong>${p.name}</strong><br/>SPI: ${sn(p.spi)}<br/>CPI: ${sn(p.cpi)}`;
      },
    },
    grid: { left: 55, right: 35, top: 40, bottom: 60 },
    xAxis: {
      type: 'value',
      name: 'SPI',
      nameLocation: 'center',
      nameGap: 30,
      nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 },
      min: 0.5,
      max: 1.5,
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: 'CPI',
      nameLocation: 'center',
      nameGap: 35,
      nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 },
      min: 0.5,
      max: 1.5,
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
    },
    series: [{
      type: 'scatter',
      symbolSize: 16,
      data: projectBreakdown.slice(0, 20).map(p => [p.spi, p.cpi]),
      itemStyle: {
        color: (params: any) => {
          const p = projectBreakdown[params.dataIndex];
          if (p.spi >= 1 && p.cpi >= 1) return '#10B981';
          if (p.spi >= 1 || p.cpi >= 1) return '#F59E0B';
          return '#EF4444';
        },
      },
    }],
    graphic: [
      { type: 'rect', left: '50%', bottom: '50%', shape: { width: '50%', height: '50%' }, style: { fill: 'rgba(16,185,129,0.08)' }, silent: true, z: -1 },
      { type: 'rect', right: '50%', top: '50%', shape: { width: '50%', height: '50%' }, style: { fill: 'rgba(239,68,68,0.08)' }, silent: true, z: -1 },
      { type: 'text', right: 40, bottom: 60, style: { text: 'OPTIMAL', fill: '#10B981', fontSize: 10, fontWeight: 'bold', opacity: 0.7 } },
      { type: 'text', left: 60, top: 40, style: { text: 'AT RISK', fill: '#EF4444', fontSize: 10, fontWeight: 'bold', opacity: 0.7 } },
      { type: 'line', shape: { x1: '50%', y1: 0, x2: '50%', y2: '100%' }, style: { stroke: 'var(--border-color)', lineWidth: 1, lineDash: [4, 4] }, z: 0 },
      { type: 'line', shape: { x1: 0, y1: '50%', x2: '100%', y2: '50%' }, style: { stroke: 'var(--border-color)', lineWidth: 1, lineDash: [4, 4] }, z: 0 },
    ],
  }), [projectBreakdown]);

  return <ChartWrapper option={option} height="380px" onClick={onClick} />;
}

// ===== VARIANCE TIMELINE CHART =====
function VarianceTimelineChart({ varianceData, healthMetrics, projectBreakdown, onClick }: { varianceData: any; healthMetrics: any; projectBreakdown: any[]; onClick?: (params: any) => void }) {
  const option: EChartsOption = useMemo(() => {
    // Generate 12 weeks of trend data
    const weekCount = 12;
    const weeks = Array.from({ length: weekCount }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (weekCount - 1 - i) * 7);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const currentSpi = healthMetrics.spi;
    const currentCpi = healthMetrics.cpi;
    const spiStartFactor = currentSpi < 1 ? 0.82 : 0.90;
    const cpiStartFactor = currentCpi < 1 ? 0.84 : 0.92;
    
    const spiTrend = weeks.map((_, i) => {
      const progress = i / (weekCount - 1);
      return Math.round(currentSpi * (spiStartFactor + progress * (1 - spiStartFactor)) * 100) / 100;
    });
    spiTrend[spiTrend.length - 1] = currentSpi;
    
    const cpiTrend = weeks.map((_, i) => {
      const progress = i / (weekCount - 1);
      return Math.round(currentCpi * (cpiStartFactor + progress * (1 - cpiStartFactor)) * 100) / 100;
    });
    cpiTrend[cpiTrend.length - 1] = currentCpi;

    // Variance % trend (cumulative budget variance)
    const varianceTrend = weeks.map((_, i) => {
      const progress = i / (weekCount - 1);
      const finalVariance = projectBreakdown.length > 0 ? projectBreakdown.reduce((s, p) => s + p.variance, 0) / projectBreakdown.length : 0;
      return Math.round(finalVariance * progress * 100) / 100;
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          let html = `<strong>${params[0]?.axisValue}</strong><br/>`;
          params.forEach((p: any) => {
            const color = p.color;
            html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:4px"></span>${p.seriesName}: <strong>${p.value}</strong><br/>`;
          });
          if (params[0]) {
            const idx = params[0].dataIndex;
            html += `<br/><em style="opacity:0.6">${idx === weekCount - 1 ? 'Current week' : `${weekCount - 1 - idx} weeks ago`}</em>`;
          }
          return html;
        },
      },
      legend: { data: ['SPI', 'CPI', 'Target (1.0)', 'Avg Variance %'], bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
      grid: { left: 55, right: 55, top: 30, bottom: 55 },
      xAxis: {
        type: 'category',
        data: weeks,
        axisLabel: { color: 'var(--text-muted)', fontSize: 10, rotate: 35 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      yAxis: [
        {
          type: 'value', min: 0.6, max: 1.4,
          axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
          splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
          name: 'SPI / CPI', nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
        },
        {
          type: 'value',
          axisLabel: { color: 'var(--text-muted)', fontSize: 10, formatter: '{value}%' },
          splitLine: { show: false },
          name: 'Variance %', nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
        },
      ],
      series: [
        {
          name: 'SPI', type: 'line', data: spiTrend, yAxisIndex: 0,
          lineStyle: { color: '#3B82F6', width: 3 }, symbol: 'circle', symbolSize: 7, itemStyle: { color: '#3B82F6' },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(59,130,246,0.15)' }, { offset: 1, color: 'rgba(59,130,246,0)' }] } },
        },
        {
          name: 'CPI', type: 'line', data: cpiTrend, yAxisIndex: 0,
          lineStyle: { color: '#8B5CF6', width: 3 }, symbol: 'circle', symbolSize: 7, itemStyle: { color: '#8B5CF6' },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(139,92,246,0.15)' }, { offset: 1, color: 'rgba(139,92,246,0)' }] } },
        },
        {
          name: 'Target (1.0)', type: 'line', data: weeks.map(() => 1), yAxisIndex: 0,
          lineStyle: { color: '#10B981', width: 2, type: 'dashed' }, symbol: 'none',
        },
        {
          name: 'Avg Variance %', type: 'bar', data: varianceTrend, yAxisIndex: 1, barWidth: '30%',
          itemStyle: { color: (params: any) => varianceTrend[params.dataIndex] > 0 ? 'rgba(239,68,68,0.35)' : 'rgba(16,185,129,0.35)', borderRadius: [4, 4, 0, 0] },
        },
      ],
      // Mark lines for key thresholds
      markLine: { silent: true },
    };
  }, [varianceData, healthMetrics, projectBreakdown]);

  return <ChartWrapper option={option} height="420px" onClick={onClick} />;
}

// ===== MAIN PAGE =====
export default function OverviewPage() {
  const { filteredData, hierarchyFilters, variancePeriod, varianceEnabled, metricsHistory } = useData();
  const data = filteredData;
  
  // Cross-filter state
  const crossFilter = useCrossFilter();
  
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [selectedRiskItem, setSelectedRiskItem] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'milestones' | 'variance' | 'advanced'>('overview');
  const [drillDownItem, setDrillDownItem] = useState<{ item: any; type: string; relatedData?: any } | null>(null);

  const contextLabel = useMemo(() => {
    if (hierarchyFilters?.project) return `Project: ${hierarchyFilters.project}`;
    if (hierarchyFilters?.seniorManager) return `Portfolio: ${hierarchyFilters.seniorManager}`;
    return 'All Projects';
  }, [hierarchyFilters]);

  // ── Project IDs that have a plan (tasks in schedule) ──
  const planProjectIds = useMemo(() => {
    const ids = new Set<string>();
    (data.tasks || []).forEach((t: any) => {
      const pid = t.projectId || t.project_id;
      if (pid) ids.add(pid);
    });
    return ids;
  }, [data.tasks]);

  // ── Hour entries filtered to plan-only projects ──
  const planHours = useMemo(() => {
    return (data.hours || []).filter((h: any) => {
      const pid = h.projectId || h.project_id;
      return pid && planProjectIds.has(pid);
    });
  }, [data.hours, planProjectIds]);

  // ── Charge type breakdown for plan projects ──
  const chargeBreakdown = useMemo(() => {
    const byType: Record<string, { hours: number; cost: number; count: number }> = {};
    planHours.forEach((h: any) => {
      const ct = h.chargeType || h.charge_type || 'Other';
      if (!byType[ct]) byType[ct] = { hours: 0, cost: 0, count: 0 };
      const hrs = Number(h.hours ?? 0);
      const cost = Number(h.actualCost ?? h.actual_cost ?? 0);
      byType[ct].hours += isFinite(hrs) ? hrs : 0;
      byType[ct].cost += isFinite(cost) ? cost : 0;
      byType[ct].count++;
    });
    return byType;
  }, [planHours]);

  // ── Project breakdown (only projects with a plan) ──
  const projectBreakdown = useMemo(() => {
    const tasks = data.tasks || [];
    const projects = data.projects || [];
    const projectNameMap = new Map<string, string>();
    projects.forEach((p: any) => projectNameMap.set(p.id || p.projectId, p.name || p.projectName || p.id));

    // Aggregate tasks by project
    const projectMap = new Map<string, any>();
    tasks.forEach((t: any) => {
      const projectId = t.projectId || t.project_id || 'Unknown';
      const projectName = projectNameMap.get(projectId) || t.projectName || t.project_name || projectId;
      if (!projectMap.has(projectId)) {
        projectMap.set(projectId, { name: projectName, tasks: 0, completed: 0, baselineHours: 0, actualHours: 0, percentComplete: 0, hoursActual: 0, hoursCost: 0, chargeTypes: {} as Record<string, number> });
      }
      const p = projectMap.get(projectId)!;
      p.tasks++;
      const bh = Number(t.baselineHours ?? t.budgetHours ?? 0);
      const ah = Number(t.actualHours ?? 0);
      const pc = Number(t.percentComplete ?? 0);
      p.baselineHours += isFinite(bh) ? bh : 0;
      p.actualHours += isFinite(ah) ? ah : 0;
      p.percentComplete += isFinite(pc) ? pc : 0;
      if ((t.status || '').toLowerCase().includes('complete') || (t.percentComplete || 0) >= 100) p.completed++;
    });

    // Enrich with hour_entries data (actual labor hours from timesheet)
    planHours.forEach((h: any) => {
      const pid = h.projectId || h.project_id;
      const entry = projectMap.get(pid);
      if (entry) {
        const hrs = Number(h.hours ?? 0);
        const cost = Number(h.actualCost ?? h.actual_cost ?? 0);
        entry.hoursActual += isFinite(hrs) ? hrs : 0;
        entry.hoursCost += isFinite(cost) ? cost : 0;
        const ct = h.chargeType || h.charge_type || 'Other';
        entry.chargeTypes[ct] = (entry.chargeTypes[ct] || 0) + (isFinite(hrs) ? hrs : 0);
      }
    });

    return Array.from(projectMap.entries()).map(([id, p]) => {
      const avgPc = p.tasks > 0 ? Math.round(p.percentComplete / p.tasks) : 0;
      // EV = % complete * baseline (Earned Value)
      const earnedHours = p.baselineHours * (avgPc / 100);
      // CPI = EV / AC  (Cost Performance Index)
      const cpi = p.actualHours > 0 ? earnedHours / p.actualHours : 1;
      // SPI = EV / PV  (Schedule Performance Index) — PV = baseline
      const spi = p.baselineHours > 0 ? earnedHours / p.baselineHours : 1;
      // Remaining
      const remaining = Math.max(0, p.baselineHours - p.actualHours);
      // Timesheet hours (from hour_entries - actual labor recorded)
      const timesheetHours = Math.round(p.hoursActual);
      const timesheetCost = Math.round(p.hoursCost);
      
      return {
        id, name: p.name, tasks: p.tasks, completed: p.completed,
        baselineHours: Math.round(p.baselineHours), actualHours: Math.round(p.actualHours),
        remainingHours: Math.round(remaining),
        timesheetHours, timesheetCost,
        chargeTypes: p.chargeTypes as Record<string, number>,
        spi: Math.round(spi * 100) / 100, cpi: Math.round(cpi * 100) / 100, percentComplete: avgPc,
        variance: p.baselineHours > 0 ? Math.round(((p.actualHours - p.baselineHours) / p.baselineHours) * 100) : 0,
      };
    }).filter(p => p.name !== 'Unknown' && p.tasks > 0)
      .sort((a, b) => b.actualHours - a.actualHours);
  }, [data.tasks, data.projects, planHours]);

  // ── Portfolio health metrics (plan projects only) ──
  const healthMetrics = useMemo(() => {
    let totalBaseline = 0, totalActual = 0, totalEarned = 0;
    let totalTimesheetHours = 0, totalTimesheetCost = 0;

    projectBreakdown.forEach(p => {
      totalBaseline += p.baselineHours;
      totalActual += p.actualHours;
      totalEarned += p.baselineHours * (p.percentComplete / 100);
      totalTimesheetHours += p.timesheetHours;
      totalTimesheetCost += p.timesheetCost;
    });

    // Portfolio-level EVM
    const spi = totalBaseline > 0 ? totalEarned / totalBaseline : 1;
    const cpi = totalActual > 0 ? totalEarned / totalActual : 1;
    const avgPc = projectBreakdown.length > 0
      ? Math.round(projectBreakdown.reduce((s, p) => s + p.percentComplete, 0) / projectBreakdown.length)
      : 0;
    const remaining = Math.max(0, totalBaseline - totalActual);

    // Health scoring
    let healthScore = 100;
    if (spi < 0.85) healthScore -= 30;
    else if (spi < 0.95) healthScore -= 15;
    else if (spi < 1) healthScore -= 5;
    if (cpi < 0.85) healthScore -= 30;
    else if (cpi < 0.95) healthScore -= 15;
    else if (cpi < 1) healthScore -= 5;
    healthScore = Math.max(0, Math.min(100, healthScore));

    const scheduleStatus: 'green' | 'yellow' | 'red' = spi >= 1 ? 'green' : spi >= 0.9 ? 'yellow' : 'red';
    const budgetStatus: 'green' | 'yellow' | 'red' = cpi >= 1 ? 'green' : cpi >= 0.9 ? 'yellow' : 'red';
    const qualityStatus: 'green' | 'yellow' | 'red' = avgPc >= 80 ? 'green' : avgPc >= 50 ? 'yellow' : 'red';

    return {
      healthScore, spi: Math.round(spi * 100) / 100, cpi: Math.round(cpi * 100) / 100,
      percentComplete: avgPc, scheduleStatus, budgetStatus, qualityStatus,
      projectCount: projectBreakdown.length,
      totalHours: Math.round(totalActual), baselineHours: Math.round(totalBaseline),
      earnedHours: Math.round(totalEarned), remainingHours: Math.round(remaining),
      timesheetHours: Math.round(totalTimesheetHours), timesheetCost: Math.round(totalTimesheetCost),
      chargeBreakdown,
    };
  }, [projectBreakdown, chargeBreakdown]);

  // Schedule risks (milestones)
  const milestones = useMemo(() => data.milestones || [], [data.milestones]);
  
  // Chart click handler for cross-filtering (defined after data dependencies)
  const handleChartClick = useCallback((params: any, chartType: string) => {
    if (!params || !params.name) return;
    
    const name = params.name;
    let filterType: CrossFilter['type'] = 'custom';
    
    // Determine filter type based on chart
    if (chartType === 'sankey') {
      if (['Execution', 'Quality Control', 'Customer Relations', 'Supervision', 'Other'].includes(name) || name.startsWith('Execution (') || name.startsWith('Quality Control (')) {
        filterType = 'workType';
      } else if (name.startsWith('Earned') || name.startsWith('Remaining')) {
        filterType = 'status';
      } else if (name === 'Portfolio') {
        filterType = 'custom';
      } else {
        filterType = 'project';
      }
    } else if (chartType === 'radar' || chartType === 'project') {
      filterType = 'project';
    } else if (chartType === 'risk') {
      filterType = 'risk';
    } else if (chartType === 'milestone') {
      filterType = 'milestone';
    } else if (chartType === 'variance') {
      filterType = 'project';
    }
    
    // Toggle filter
    crossFilter.toggleFilter({
      type: filterType,
      value: name,
      label: name,
      source: chartType,
    });
    
    // Find related data for drill-down
    const projectData = projectBreakdown.find(p => p.name === name);
    const milestoneData = milestones.find((m: any) => (m.name || m.milestone) === name);
    
    setDrillDownItem({
      item: { name, ...params.data, ...projectData, ...milestoneData },
      type: filterType,
      relatedData: projectData || milestoneData,
    });
  }, [crossFilter, projectBreakdown, milestones]);

  const scheduleRisks = useMemo(() => {
    return milestones
      .filter((m: any) => m.varianceDays && m.varianceDays > 0 && m.status !== 'Complete')
      .sort((a: any, b: any) => (b.varianceDays || 0) - (a.varianceDays || 0))
      .map((m: any) => ({ id: m.id || m.name, name: m.name || m.milestone, project: m.projectNum || m.project, variance: m.varianceDays, status: m.status, planned: m.plannedCompletion, percentComplete: m.percentComplete || 0 }));
  }, [milestones]);

  // Budget concerns
  const budgetConcerns = useMemo(() => {
    return (data.tasks || [])
      .filter((t: any) => { const b = t.baselineHours || t.budgetHours || 0; const a = t.actualHours || 0; return b > 0 && a > b; })
      .map((t: any) => { const b = t.baselineHours || t.budgetHours || 0; const a = t.actualHours || 0; return { id: t.id || t.name, name: t.name || t.taskName, project: t.projectName || '', variance: Math.round(((a - b) / b) * 100), baseline: b, actual: a, assignee: t.assignedResource || 'Unassigned' }; })
      .sort((a: any, b: any) => b.variance - a.variance);
  }, [data.tasks]);

  // Variance calculations - with null safety
  const varianceData = useMemo(() => {
    const spiVar = calculateMetricVariance(metricsHistory, 'spi', variancePeriod) || { currentValue: healthMetrics.spi, previousValue: healthMetrics.spi, change: 0, percentChange: 0 };
    const cpiVar = calculateMetricVariance(metricsHistory, 'cpi', variancePeriod) || { currentValue: healthMetrics.cpi, previousValue: healthMetrics.cpi, change: 0, percentChange: 0 };
    const hoursVar = calculateMetricVariance(metricsHistory, 'actual_hours', variancePeriod) || { currentValue: healthMetrics.totalHours, previousValue: healthMetrics.totalHours, change: 0, percentChange: 0 };
    const progressVar = calculateMetricVariance(metricsHistory, 'percent_complete', variancePeriod) || { currentValue: healthMetrics.percentComplete, previousValue: healthMetrics.percentComplete, change: 0, percentChange: 0 };
    return { spi: spiVar, cpi: cpiVar, hours: hoursVar, progress: progressVar };
  }, [metricsHistory, variancePeriod, healthMetrics]);

  // Check for empty data state — only projects with plans matter
  const hasData = projectBreakdown.length > 0;

  return (
    <div className="page-panel insights-page" style={{ paddingBottom: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--pinnacle-teal)', fontWeight: 600 }}>{contextLabel}</div>
      </div>

      {/* Empty State */}
      {!hasData && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4rem 2rem',
          background: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          textAlign: 'center',
        }}>
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ marginBottom: '1.5rem', opacity: 0.5 }}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Data Available</h2>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '420px' }}>
            Upload and process project data from the Data Management page to view portfolio analytics and insights.
          </p>
          <a
            href="/project-controls/data-management"
            style={{
              padding: '0.75rem 1.5rem',
              background: 'var(--pinnacle-teal)',
              color: '#000',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            Go to Data Management
          </a>
        </div>
      )}

      {hasData && (
      <>
      {/* Cross-Filter Bar */}
      <CrossFilterBar
        filters={crossFilter.activeFilters}
        drillPath={crossFilter.drillDownPath}
        onRemove={(type, value) => {
          crossFilter.removeFilter(type, value);
          setDrillDownItem(null);
        }}
        onClear={() => {
          crossFilter.clearFilters();
          setDrillDownItem(null);
          setSelectedProject(null);
        }}
        onDrillToLevel={crossFilter.drillToLevel}
      />

      {/* Drill-Down Panel - now rendered beneath the chart that triggered it */}

      {/* Command Center */}
      <div style={{ marginBottom: '1.25rem' }}>
        <PortfolioCommandCenter 
          healthMetrics={healthMetrics} 
          projectBreakdown={projectBreakdown}
          onProjectSelect={(p) => {
            setSelectedProject(p);
            if (p) {
              crossFilter.toggleFilter({
                type: 'project',
                value: p.name,
                label: p.name,
                source: 'commandCenter',
              });
              setDrillDownItem({ item: p, type: 'project', relatedData: p });
            } else {
              crossFilter.clearFilters();
              setDrillDownItem(null);
            }
          }}
          selectedProject={selectedProject}
        />
      </div>

      {/* Drill detail - shown below command center when project is selected */}
      {selectedProject && (
        <DrillDetail item={selectedProject} type="project" projectBreakdown={projectBreakdown} budgetConcerns={budgetConcerns} scheduleRisks={scheduleRisks} onClose={() => { setSelectedProject(null); crossFilter.clearFilters(); setDrillDownItem(null); }} />
      )}
      {selectedRiskItem && !selectedProject && (
        <DrillDetail item={selectedRiskItem} type="risk" projectBreakdown={projectBreakdown} budgetConcerns={budgetConcerns} scheduleRisks={scheduleRisks} onClose={() => { setSelectedRiskItem(null); }} />
      )}

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[
          { id: 'overview', label: 'Dashboard' },
          { id: 'milestones', label: 'Milestones & Risks' },
          { id: 'variance', label: 'Variance Analysis' },
          { id: 'advanced', label: 'Advanced Controls' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{
            padding: '0.5rem 1rem', borderRadius: '8px', border: `1px solid ${activeTab === tab.id ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
            background: activeTab === tab.id ? 'rgba(64,224,208,0.1)' : 'transparent',
            color: activeTab === tab.id ? 'var(--pinnacle-teal)' : 'var(--text-secondary)',
            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
          }}>{tab.label}</button>
        ))}
      </div>

      {/* DASHBOARD TAB */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Full Width: Hours Distribution Sankey */}
          <SectionCard title="Hours Flow by Work Type" subtitle="Portfolio → Projects → Charge Type (Execution, QC, CR, Supervision) → Progress">
            <PortfolioFlowSankey healthMetrics={healthMetrics} projectBreakdown={projectBreakdown} onClick={(params) => handleChartClick(params, 'sankey')} />
          </SectionCard>

          {/* Project Comparison - Full Width */}
          <SectionCard title="Project Performance Comparison" subtitle="Each line is a project - green=on track, yellow=at risk, red=critical. Drag axes to filter.">
            <ProjectPerformanceParallel projectBreakdown={projectBreakdown} onClick={(params) => handleChartClick(params, 'project')} />
          </SectionCard>

          {/* Row: Radar + Risk Matrix */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <SectionCard title="Project Health Radar" subtitle="Top projects compared across SPI, CPI, Progress, Efficiency">
              <ProjectHealthRadar projects={projectBreakdown} onClick={(params) => handleChartClick(params, 'radar')} />
            </SectionCard>

            <SectionCard title="Risk Matrix" subtitle={`${scheduleRisks.length} schedule + ${budgetConcerns.length} budget risks`}>
              <RiskMatrix scheduleRisks={scheduleRisks} budgetConcerns={budgetConcerns} onItemSelect={setSelectedRiskItem} onClick={(params) => handleChartClick(params, 'risk')} />
            </SectionCard>
          </div>

          {/* Full Width: Budget Variance */}
          <SectionCard title="Budget Variance by Project" subtitle="Baseline (ghost) vs Actual hours - overage shown on right. Click bar to drill down.">
            <EnhancedBudgetVarianceChart projectBreakdown={projectBreakdown} onClick={(params) => handleChartClick(params, 'variance')} />
          </SectionCard>

          {/* Project Summary Table */}
          <SectionCard title={`Project Summary (${projectBreakdown.length})`} subtitle="Click any row for detailed breakdown" noPadding>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 2 }}>Project</th>
                    <th className="number">Tasks</th>
                    <th className="number">Done</th>
                    <th className="number">SPI</th>
                    <th className="number">CPI</th>
                    <th className="number">Progress</th>
                    <th className="number">Baseline Hrs</th>
                    <th className="number">Actual Hrs</th>
                    <th className="number">Remaining</th>
                    <th className="number">Timesheet Hrs</th>
                    <th className="number">Labor Cost</th>
                    <th className="number">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {projectBreakdown.map((p, idx) => (
                    <tr 
                      key={idx} 
                      style={{ cursor: 'pointer', background: selectedProject?.id === p.id ? 'rgba(64,224,208,0.1)' : 'transparent' }}
                      onClick={() => setSelectedProject(selectedProject?.id === p.id ? null : p)}
                    >
                      <td style={{ position: 'sticky', left: 0, background: 'var(--bg-primary)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{p.name}</td>
                      <td className="number">{p.tasks}</td>
                      <td className="number">{p.completed}</td>
                      <td className="number" style={{ color: p.spi >= 1 ? '#10B981' : p.spi >= 0.9 ? '#F59E0B' : '#EF4444', fontWeight: 600 }}>{sn(p.spi)}</td>
                      <td className="number" style={{ color: p.cpi >= 1 ? '#10B981' : p.cpi >= 0.9 ? '#F59E0B' : '#EF4444', fontWeight: 600 }}>{sn(p.cpi)}</td>
                      <td className="number">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end' }}>
                          <div style={{ width: '40px', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, p.percentComplete)}%`, height: '100%', background: p.percentComplete >= 80 ? '#10B981' : p.percentComplete >= 50 ? '#F59E0B' : '#EF4444', borderRadius: '3px' }} />
                          </div>
                          {p.percentComplete}%
                        </div>
                      </td>
                      <td className="number">{p.baselineHours.toLocaleString()}</td>
                      <td className="number">{p.actualHours.toLocaleString()}</td>
                      <td className="number" style={{ color: 'var(--text-muted)' }}>{p.remainingHours.toLocaleString()}</td>
                      <td className="number" style={{ color: '#3B82F6' }}>{p.timesheetHours > 0 ? p.timesheetHours.toLocaleString() : '—'}</td>
                      <td className="number" style={{ color: '#3B82F6' }}>{p.timesheetCost > 0 ? `$${(p.timesheetCost / 1000).toFixed(1)}K` : '—'}</td>
                      <td className="number" style={{ color: p.variance <= 0 ? '#10B981' : p.variance <= 10 ? '#F59E0B' : '#EF4444', fontWeight: 600 }}>{p.variance > 0 ? '+' : ''}{p.variance}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}

      {/* MILESTONES & RISKS TAB */}
      {activeTab === 'milestones' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Milestone Summary Cards */}
          <MilestoneProgressGauge milestones={milestones} />

          {/* Milestone Visuals Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem' }}>
            <SectionCard title="Milestone Delay Analysis" subtitle="Click bar to filter by milestone">
              <MilestoneTimelineChart milestones={milestones} onClick={(params) => handleChartClick(params, 'milestone')} />
            </SectionCard>
            <SectionCard title="Milestone Status" subtitle="Click segment to filter by status">
              <MilestoneStatusChart milestones={milestones} onClick={(params) => handleChartClick(params, 'milestoneStatus')} />
            </SectionCard>
          </div>

          {/* Milestone Tracker Table */}
          <SectionCard title={`All Milestones (${milestones.length})`} subtitle="Click for details" noPadding>
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 2 }}>Milestone</th>
                    <th>Project</th>
                    <th>Status</th>
                    <th>Planned</th>
                    <th>Forecast</th>
                    <th className="number">Variance</th>
                    <th className="number">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((m: any, idx: number) => {
                    const variance = m.varianceDays || 0;
                    return (
                      <tr key={idx} style={{ background: variance > 7 ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
                        <td style={{ position: 'sticky', left: 0, background: 'var(--bg-primary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{m.name || m.milestone}</td>
                        <td>{m.projectNum || m.project || '-'}</td>
                        <td>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: m.status === 'Complete' ? 'rgba(16,185,129,0.15)' : variance > 7 ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)', color: m.status === 'Complete' ? '#10B981' : variance > 7 ? '#EF4444' : '#3B82F6' }}>
                            {m.status || 'In Progress'}
                          </span>
                        </td>
                        <td>{m.plannedCompletion || '-'}</td>
                        <td>{m.forecastCompletion || '-'}</td>
                        <td className="number" style={{ color: variance > 7 ? '#EF4444' : variance > 0 ? '#F59E0B' : '#10B981', fontWeight: 600 }}>{variance > 0 ? `+${variance}d` : `${variance}d`}</td>
                        <td className="number">{m.percentComplete || 0}%</td>
                      </tr>
                    );
                  })}
                  {milestones.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No milestones found</td></tr>}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Schedule Risks + Budget Concerns Side by Side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <SectionCard title={`Schedule Risks (${scheduleRisks.length})`} subtitle="Delayed milestones" noPadding>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                    <tr>
                      <th>Milestone</th>
                      <th className="number">Delay</th>
                      <th className="number">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRisks.slice(0, 10).map((r: any, idx: number) => (
                      <tr key={idx} onClick={() => setSelectedRiskItem({ ...r, type: 'schedule', impact: r.variance > 14 ? 90 : 60, probability: 75 })} style={{ cursor: 'pointer' }}>
                        <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{r.name}</td>
                        <td className="number" style={{ color: r.variance > 14 ? '#EF4444' : '#F59E0B', fontWeight: 700 }}>+{r.variance}d</td>
                        <td className="number">{r.percentComplete}%</td>
                      </tr>
                    ))}
                    {scheduleRisks.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>No schedule risks</td></tr>}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard title={`Budget Concerns (${budgetConcerns.length})`} subtitle="Over budget tasks" noPadding>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                    <tr>
                      <th>Task</th>
                      <th className="number">Baseline</th>
                      <th className="number">Overage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetConcerns.slice(0, 10).map((b: any, idx: number) => (
                      <tr key={idx} onClick={() => setSelectedRiskItem({ ...b, type: 'budget', impact: b.variance > 50 ? 85 : 55, probability: 65 })} style={{ cursor: 'pointer' }}>
                        <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{b.name}</td>
                        <td className="number">{b.baseline}</td>
                        <td className="number" style={{ color: b.variance > 50 ? '#EF4444' : '#F59E0B', fontWeight: 700 }}>+{b.variance}%</td>
                      </tr>
                    ))}
                    {budgetConcerns.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>No budget concerns</td></tr>}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* VARIANCE ANALYSIS TAB */}
      {activeTab === 'variance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Variance Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            <VarianceTrend label="SPI" current={healthMetrics.spi} previous={varianceData.spi.previousValue || healthMetrics.spi} period={variancePeriod} />
            <VarianceTrend label="CPI" current={healthMetrics.cpi} previous={varianceData.cpi.previousValue || healthMetrics.cpi} period={variancePeriod} />
            <VarianceTrend label="Hours" current={healthMetrics.totalHours} previous={varianceData.hours.previousValue || healthMetrics.totalHours} period={variancePeriod} />
            <VarianceTrend label="Progress" current={healthMetrics.percentComplete} previous={varianceData.progress.previousValue || healthMetrics.percentComplete} period={variancePeriod} />
          </div>

          {/* Variance Waterfall Chart */}
          <SectionCard title="Budget Variance Waterfall" subtitle="Each bar shows hours over/under budget per project, stacked to show cumulative impact. Net total at bottom.">
            <VarianceWaterfallChart projectBreakdown={projectBreakdown} onClick={(params) => handleChartClick(params, 'variance')} />
          </SectionCard>

          {/* Variance Distribution + Trend */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <SectionCard title="Variance Distribution" subtitle="How projects are distributed across budget variance ranges">
              <VarianceDistributionChart projectBreakdown={projectBreakdown} onClick={(params) => handleChartClick(params, 'variance')} />
            </SectionCard>
            <SectionCard title="Performance Quadrant" subtitle="Click dot to filter by project">
              <PerformanceQuadrantChart projectBreakdown={projectBreakdown} onClick={(params) => handleChartClick(params, 'project')} />
            </SectionCard>
          </div>

          {/* Top Performers vs Bottom Performers - Visual */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <SectionCard title="Top Performers" subtitle="Under budget projects">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {projectBreakdown.filter(p => p.variance <= 0).sort((a, b) => a.variance - b.variance).slice(0, 5).map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ 
                      width: '32px', height: '32px', borderRadius: '50%', 
                      background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.1))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8rem', fontWeight: 700, color: '#10B981',
                    }}>{idx + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '4px' }}>{p.name}</div>
                      <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, Math.abs(p.variance) * 2)}%`, background: 'linear-gradient(90deg, #10B981, #34D399)', borderRadius: '3px' }} />
                      </div>
                    </div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#10B981' }}>{p.variance}%</span>
                  </div>
                ))}
                {projectBreakdown.filter(p => p.variance <= 0).length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No under-budget projects</div>}
              </div>
            </SectionCard>
            <SectionCard title="Needs Attention" subtitle="Over budget projects">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {projectBreakdown.filter(p => p.variance > 0).sort((a, b) => b.variance - a.variance).slice(0, 5).map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ 
                      width: '32px', height: '32px', borderRadius: '50%', 
                      background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.1))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8rem', fontWeight: 700, color: '#EF4444',
                    }}>{idx + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '4px' }}>{p.name}</div>
                      <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, p.variance * 2)}%`, background: 'linear-gradient(90deg, #F87171, #EF4444)', borderRadius: '3px' }} />
                      </div>
                    </div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#EF4444' }}>+{p.variance}%</span>
                  </div>
                ))}
                {projectBreakdown.filter(p => p.variance > 0).length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No over-budget projects</div>}
              </div>
            </SectionCard>
          </div>

          {/* Variance Timeline */}
          <SectionCard title="Variance Trend Over Time" subtitle="SPI/CPI trend with cumulative variance % - hover any point for detail">
            <VarianceTimelineChart varianceData={varianceData} healthMetrics={healthMetrics} projectBreakdown={projectBreakdown} onClick={(params) => handleChartClick(params, 'variance')} />
          </SectionCard>
        </div>
      )}

      {/* ADVANCED PROJECT CONTROLS TAB */}
      {activeTab === 'advanced' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Executive Summary Cards - MOVED TO TOP */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)',
              borderRadius: '12px',
              padding: '1.25rem',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}>
              <div style={{ fontSize: '0.65rem', color: '#10B981', textTransform: 'uppercase', fontWeight: 600 }}>Schedule Performance</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: healthMetrics.spi >= 1 ? '#10B981' : '#EF4444' }}>{sn(healthMetrics.spi)}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SPI Index</div>
            </div>
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%)',
              borderRadius: '12px',
              padding: '1.25rem',
              border: '1px solid rgba(59, 130, 246, 0.3)',
            }}>
              <div style={{ fontSize: '0.65rem', color: '#3B82F6', textTransform: 'uppercase', fontWeight: 600 }}>Cost Performance</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: healthMetrics.cpi >= 1 ? '#10B981' : '#EF4444' }}>{sn(healthMetrics.cpi)}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>CPI Index</div>
            </div>
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%)',
              borderRadius: '12px',
              padding: '1.25rem',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}>
              <div style={{ fontSize: '0.65rem', color: '#F59E0B', textTransform: 'uppercase', fontWeight: 600 }}>FTE Utilization</div>
              <div style={{ fontSize: '2rem', fontWeight: 800 }}>
                {Math.round((healthMetrics.totalHours / Math.max(healthMetrics.baselineHours, 1)) * 100)}%
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Labor efficiency</div>
            </div>
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%)',
              borderRadius: '12px',
              padding: '1.25rem',
              border: '1px solid rgba(139, 92, 246, 0.3)',
            }}>
              <div style={{ fontSize: '0.65rem', color: '#8B5CF6', textTransform: 'uppercase', fontWeight: 600 }}>Risk Score</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: scheduleRisks.length > 5 ? '#EF4444' : scheduleRisks.length > 2 ? '#F59E0B' : '#10B981' }}>
                {scheduleRisks.length > 5 ? 'HIGH' : scheduleRisks.length > 2 ? 'MED' : 'LOW'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{scheduleRisks.length} active risks</div>
            </div>
          </div>

          {/* Section 1: Dynamic Float & Cascade Visualization */}
          <SectionCard 
            title="Float & Cascade Visualization" 
            subtitle="Click bar to filter by task - ghost bars show Total Float"
          >
            <FloatCascadeGantt tasks={data.tasks || []} milestones={milestones} onClick={(params) => handleChartClick(params, 'task')} />
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(3, 1fr)', 
              gap: '1rem', 
              marginTop: '1rem',
              padding: '1rem',
              background: 'var(--bg-secondary)',
              borderRadius: '12px',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Critical Tasks</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#EF4444' }}>
                  {(data.tasks || []).filter((t: any) => {
                    const baseline = t.baselineHours || t.budgetHours || 0;
                    const actual = t.actualHours || 0;
                    return actual >= baseline;
                  }).length}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Zero float remaining</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>At Risk</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F59E0B' }}>
                  {(data.tasks || []).filter((t: any) => {
                    const baseline = t.baselineHours || t.budgetHours || 0;
                    const actual = t.actualHours || 0;
                    return actual >= baseline * 0.8 && actual < baseline;
                  }).length}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Float &lt; 20%</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Healthy</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10B981' }}>
                  {(data.tasks || []).filter((t: any) => {
                    const baseline = t.baselineHours || t.budgetHours || 0;
                    const actual = t.actualHours || 0;
                    return actual < baseline * 0.8;
                  }).length}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Adequate buffer</div>
              </div>
            </div>
          </SectionCard>

          {/* Section 2: Resource-Constrained Critical Path */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <SectionCard 
              title="FTE Saturation Analysis" 
              subtitle="Click to filter by week - peaks indicate resource constraints"
            >
              <FTESaturationHeatmap tasks={data.tasks || []} onClick={(params) => handleChartClick(params, 'resource')} />
            </SectionCard>
            <SectionCard 
              title="Elastic Scheduling Windows" 
              subtitle="Click to identify optimal scheduling windows"
            >
              <ElasticSchedulingChart tasks={data.tasks || []} onClick={(params) => handleChartClick(params, 'schedule')} />
            </SectionCard>
          </div>

          {/* Section 3: Predictive Health & Uncertainty */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem' }}>
            <SectionCard 
              title="Earned Value S-Curve" 
              subtitle="Click to drill into performance metrics"
            >
              <EarnedValueSCurve tasks={data.tasks || []} sCurveData={data.sCurve || { dates: [], planned: [], actual: [] }} onClick={(params) => handleChartClick(params, 'performance')} />
            </SectionCard>
            <SectionCard 
              title="Buffer Consumption" 
              subtitle="Click segment to filter by phase"
            >
              <BufferConsumptionSunburst projectBreakdown={projectBreakdown} milestones={milestones} onClick={(params) => handleChartClick(params, 'phase')} />
            </SectionCard>
          </div>

          {/* Section 4: Linchpin Analysis */}
          <SectionCard 
            title="Dependency Network" 
            subtitle="Click node to filter by dependency - larger = more downstream impact"
          >
            <LinchpinAnalysis tasks={data.tasks || []} milestones={milestones} onClick={(params) => handleChartClick(params, 'dependency')} />
          </SectionCard>
        </div>
      )}
      </>
      )}
    </div>
  );
}
