'use client';

/**
 * @fileoverview Comprehensive Sprint Planning Page
 * 
 * Combined sprint management with full analytics:
 * - Iteration selector with all sprints
 * - Sprint Command Center with health metrics
 * - View tabs (Board, Backlog, Tasks, Analytics)
 * - Integrated burndown, velocity, and capacity tracking
 * - Connection to Insights pages for drill-down
 * 
 * @module app/project-management/sprint/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import SprintBurndownChart from '@/components/charts/SprintBurndownChart';
import VelocityChart from '@/components/charts/VelocityChart';
import Link from 'next/link';
import type { EChartsOption } from 'echarts';

// Import views
import BoardsView from './boards-view';
import BacklogView from './backlog-view';
import SprintView from './sprint-view';

// ============================================================================
// TYPES
// ============================================================================

interface Iteration {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  status: 'past' | 'current' | 'future';
  workDays: number;
  daysRemaining: number;
  progress: number;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  hoursPerDay: number;
  daysOff: number;
  capacity: number;
  assigned: number;
}

type ViewType = 'board' | 'backlog' | 'tasks' | 'analytics';

// ============================================================================
// HELPERS
// ============================================================================

function getWorkDays(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function getDaysRemaining(end: Date): number {
  const now = new Date();
  if (now > end) return 0;
  return getWorkDays(now, end);
}

function getSprintProgress(start: Date, end: Date): number {
  const now = new Date();
  if (now < start) return 0;
  if (now > end) return 100;
  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  return Math.round((elapsed / total) * 100);
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start || !end) return 'No dates set';
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(s)} - ${fmt(e)}`;
}

// ============================================================================
// SPRINT COMMAND CENTER
// ============================================================================

function SprintCommandCenter({ 
  sprint, 
  stats, 
  teamCapacity,
  onViewInsights 
}: { 
  sprint: Iteration | null;
  stats: any;
  teamCapacity: { total: number; assigned: number; available: number };
  onViewInsights: () => void;
}) {
  if (!sprint) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        Select a sprint to view details
      </div>
    );
  }

  const healthColor = stats.health >= 80 ? '#10B981' : stats.health >= 60 ? '#F59E0B' : '#EF4444';
  const capacityUsed = teamCapacity.total > 0 ? Math.round((teamCapacity.assigned / teamCapacity.total) * 100) : 0;
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)',
      borderRadius: '20px',
      padding: '1.25rem',
      border: '1px solid var(--border-color)',
      display: 'grid',
      gridTemplateColumns: '160px 1fr auto auto',
      alignItems: 'center',
      gap: '1.5rem',
    }}>
      {/* Sprint Health Ring */}
      <div style={{ position: 'relative', width: '160px', height: '160px' }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-tertiary)" strokeWidth="8" />
          <circle cx="50" cy="50" r="42" fill="none" stroke={healthColor} strokeWidth="8"
            strokeDasharray={`${sprint.progress * 2.64} 264`} strokeLinecap="round"
            transform="rotate(-90 50 50)" style={{ filter: `drop-shadow(0 0 8px ${healthColor})` }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '2rem', fontWeight: 900, color: healthColor }}>{sprint.progress}%</span>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Progress</span>
        </div>
      </div>

      {/* Status Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
        {[
          { label: 'Completed', value: stats.completed, color: '#10B981', icon: 'check' },
          { label: 'In Progress', value: stats.inProgress, color: '#3B82F6', icon: 'clock' },
          { label: 'Blocked', value: stats.blocked, color: '#EF4444', icon: 'alert' },
          { label: 'Remaining', value: stats.remaining, color: '#6B7280', icon: 'list' },
        ].map((item, idx) => (
          <div key={idx} style={{
            background: `${item.color}10`,
            borderRadius: '12px',
            padding: '0.75rem 1rem',
            border: `1px solid ${item.color}30`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color }} />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.label}</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Capacity Gauge */}
      <div style={{ textAlign: 'center', minWidth: '140px' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Team Capacity</div>
        <div style={{ position: 'relative', width: '100px', height: '60px', margin: '0 auto' }}>
          <svg viewBox="0 0 100 50" style={{ width: '100%', height: '100%' }}>
            <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="var(--bg-tertiary)" strokeWidth="8" strokeLinecap="round" />
            <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" 
              stroke={capacityUsed > 100 ? '#EF4444' : capacityUsed > 80 ? '#F59E0B' : '#10B981'} 
              strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${Math.min(capacityUsed, 100) * 1.26} 126`} />
          </svg>
          <div style={{ position: 'absolute', bottom: '0', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: capacityUsed > 100 ? '#EF4444' : 'var(--text-primary)' }}>{capacityUsed}%</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          <span>{teamCapacity.assigned}h used</span>
          <span>{teamCapacity.available}h free</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#40E0D0' }}>{sprint.daysRemaining}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Days Left</div>
        </div>
        <Link href="/insights/tasks" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          padding: '0.6rem 1rem', background: 'var(--pinnacle-teal)', borderRadius: '8px',
          color: '#000', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 6-6" />
          </svg>
          View Insights
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// ITERATION SELECTOR
// ============================================================================

function IterationSelector({ iterations, selectedId, onSelect }: {
  iterations: Iteration[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = iterations.find(i => i.id === selectedId);

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setIsOpen(!isOpen)} style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px',
        background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
        borderRadius: '10px', cursor: 'pointer', minWidth: '280px',
      }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', 
          background: selected?.status === 'current' ? '#40E0D0' : selected?.status === 'future' ? '#6B7280' : '#9CA3AF' }} />
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{selected?.name || 'Select Sprint'}</div>
          {selected && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{formatDateRange(selected.startDate, selected.endDate)}</div>}
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {isOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setIsOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: '8px', width: '360px',
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 101, overflow: 'hidden'
          }}>
            <div style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Select Iteration</div>
            </div>
            <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
              {iterations.map(iter => (
                <button key={iter.id} onClick={() => { onSelect(iter.id); setIsOpen(false); }} style={{
                  display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px 16px',
                  background: iter.id === selectedId ? 'rgba(64,224,208,0.1)' : 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', textAlign: 'left'
                }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%',
                    background: iter.status === 'current' ? '#40E0D0' : iter.status === 'future' ? '#6B7280' : '#9CA3AF' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{iter.name}</span>
                      {iter.isCurrent && <span style={{ fontSize: '0.6rem', padding: '2px 6px', background: 'rgba(64,224,208,0.2)', color: '#40E0D0', borderRadius: '8px', fontWeight: 600 }}>CURRENT</span>}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {formatDateRange(iter.startDate, iter.endDate)}
                      {iter.status === 'current' && ` • ${iter.daysRemaining} days left`}
                    </div>
                  </div>
                  {iter.status === 'current' && (
                    <div style={{ width: '50px' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>{iter.progress}%</div>
                      <div style={{ width: '100%', height: '4px', background: 'var(--bg-tertiary)', borderRadius: '2px' }}>
                        <div style={{ width: `${iter.progress}%`, height: '100%', background: '#40E0D0', borderRadius: '2px' }} />
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// CAPACITY PANEL
// ============================================================================

function CapacityPanel({ isOpen, onClose, sprint, teamMembers, onUpdateMember }: { 
  isOpen: boolean; 
  onClose: () => void;
  sprint: Iteration | null;
  teamMembers: TeamMember[];
  onUpdateMember: (id: string, field: string, value: number) => void;
}) {
  if (!isOpen) return null;

  const totalCapacity = teamMembers.reduce((sum, m) => sum + m.capacity, 0);
  const totalAssigned = teamMembers.reduce((sum, m) => sum + m.assigned, 0);

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '420px',
      background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)',
      zIndex: 1000, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.3)'
    }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Team Capacity</h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{sprint?.name || 'No sprint selected'}</p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#40E0D0' }}>{totalCapacity}h</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total Capacity</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#CDDC39' }}>{totalAssigned}h</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Assigned</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: totalCapacity - totalAssigned >= 0 ? '#22c55e' : '#ef4444' }}>{totalCapacity - totalAssigned}h</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Available</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.25rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase' }}>Team Members ({teamMembers.length})</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {teamMembers.map(member => {
            const utilization = member.capacity > 0 ? Math.round((member.assigned / member.capacity) * 100) : 0;
            return (
              <div key={member.id} style={{ background: 'var(--bg-tertiary)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{member.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{member.role}</div>
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: utilization > 100 ? '#EF4444' : '#40E0D0', background: utilization > 100 ? 'rgba(239,68,68,0.1)' : 'rgba(64,224,208,0.1)', padding: '4px 10px', borderRadius: '12px' }}>
                    {member.capacity}h
                  </div>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Utilization ({member.assigned}h assigned)</span>
                    <span style={{ fontWeight: 600, color: utilization > 100 ? '#EF4444' : utilization > 80 ? '#F59E0B' : '#10B981' }}>{utilization}%</span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'var(--bg-secondary)', borderRadius: '2px' }}>
                    <div style={{ width: `${Math.min(utilization, 100)}%`, height: '100%', background: utilization > 100 ? '#EF4444' : utilization > 80 ? '#F59E0B' : '#10B981', borderRadius: '2px' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Hours/Day</label>
                    <input type="number" min="0" max="8" value={member.hoursPerDay} onChange={(e) => onUpdateMember(member.id, 'hoursPerDay', parseInt(e.target.value) || 0)}
                      style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Days Off</label>
                    <input type="number" min="0" max={sprint?.workDays || 10} value={member.daysOff} onChange={(e) => onUpdateMember(member.id, 'daysOff', parseInt(e.target.value) || 0)}
                      style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ANALYTICS VIEW
// ============================================================================

function AnalyticsView({ sprint, stats, teamMembers }: { sprint: Iteration | null; stats: any; teamMembers: TeamMember[] }) {
  // Task distribution for pie chart
  const taskDistOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff' } },
    series: [{
      type: 'pie',
      radius: ['50%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 6, borderColor: 'var(--bg-card)', borderWidth: 2 },
      label: { show: false },
      data: [
        { value: stats.completed, name: 'Completed', itemStyle: { color: '#10B981' } },
        { value: stats.inProgress, name: 'In Progress', itemStyle: { color: '#3B82F6' } },
        { value: stats.blocked, name: 'Blocked', itemStyle: { color: '#EF4444' } },
        { value: stats.remaining, name: 'Remaining', itemStyle: { color: '#6B7280' } },
      ].filter(d => d.value > 0),
    }],
  }), [stats]);

  // Team workload bar chart
  const workloadOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 100, right: 20, top: 20, bottom: 30 },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff' } },
    xAxis: { type: 'value', max: Math.max(...teamMembers.map(m => m.capacity), 1), axisLabel: { color: 'var(--text-muted)', fontSize: 10 }, splitLine: { lineStyle: { color: 'var(--border-color)' } } },
    yAxis: { type: 'category', data: teamMembers.map(m => m.name), axisLabel: { color: 'var(--text-primary)', fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
    series: [
      { name: 'Assigned', type: 'bar', stack: 'total', data: teamMembers.map(m => m.assigned), itemStyle: { color: '#3B82F6' }, barWidth: 16 },
      { name: 'Available', type: 'bar', stack: 'total', data: teamMembers.map(m => Math.max(0, m.capacity - m.assigned)), itemStyle: { color: 'var(--bg-tertiary)' }, barWidth: 16 },
    ],
  }), [teamMembers]);

  return (
    <div style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        {/* Burndown Chart */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>Sprint Burndown</h3>
          <div style={{ height: '250px' }}>
            <SprintBurndownChart unit="hours" height="100%" />
          </div>
        </div>

        {/* Velocity Chart */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>Team Velocity</h3>
          <div style={{ height: '250px' }}>
            <VelocityChart unit="points" height="100%" />
          </div>
        </div>

        {/* Task Distribution */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>Task Distribution</h3>
          <div style={{ height: '250px' }}>
            <ChartWrapper option={taskDistOption} height="100%" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Completed', color: '#10B981', value: stats.completed },
              { label: 'In Progress', color: '#3B82F6', value: stats.inProgress },
              { label: 'Blocked', color: '#EF4444', value: stats.blocked },
              { label: 'Remaining', color: '#6B7280', value: stats.remaining },
            ].map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color }} />
                <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
                <span style={{ fontWeight: 600 }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Team Workload */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>Team Workload</h3>
          <div style={{ height: '250px' }}>
            <ChartWrapper option={workloadOption} height="100%" />
          </div>
        </div>
      </div>

      {/* Links to Insights */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1rem' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>Detailed Analysis</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          <Link href="/insights/overview" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
            padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: '10px',
            textDecoration: 'none', color: 'var(--text-primary)', border: '1px solid var(--border-color)',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
              <path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 6-6" />
            </svg>
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Portfolio Overview</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Health, risks, variance</span>
          </Link>
          <Link href="/insights/tasks" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
            padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: '10px',
            textDecoration: 'none', color: 'var(--text-primary)', border: '1px solid var(--border-color)',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
              <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Task Operations</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Hours, labor, QC</span>
          </Link>
          <Link href="/project-controls/resourcing" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
            padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: '10px',
            textDecoration: 'none', color: 'var(--text-primary)', border: '1px solid var(--border-color)',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Resourcing</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Utilization, allocation</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// VIEW CONFIG
// ============================================================================

const VIEW_CONFIG: Record<ViewType, { label: string; icon: JSX.Element }> = {
  board: { label: 'Board', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg> },
  backlog: { label: 'Backlog', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg> },
  tasks: { label: 'Tasks', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg> },
  analytics: { label: 'Analytics', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg> },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SprintPlanningPage() {
  const { filteredData } = useData();
  const data = filteredData;
  
  const [selectedView, setSelectedView] = useState<ViewType>('board');
  const [selectedIterationId, setSelectedIterationId] = useState<string | null>(null);
  const [showCapacity, setShowCapacity] = useState(false);

  // Build iterations
  const iterations = useMemo((): Iteration[] => {
    const defaultIterations: Iteration[] = [
      { id: 'sprint-1', name: 'Sprint 1', startDate: '2026-01-06', endDate: '2026-01-19', isCurrent: false, status: 'past', workDays: 10, daysRemaining: 0, progress: 100 },
      { id: 'sprint-2', name: 'Sprint 2', startDate: '2026-01-20', endDate: '2026-02-02', isCurrent: true, status: 'current', workDays: 10, daysRemaining: 5, progress: 50 },
      { id: 'sprint-3', name: 'Sprint 3', startDate: '2026-02-03', endDate: '2026-02-16', isCurrent: false, status: 'future', workDays: 10, daysRemaining: 10, progress: 0 },
      { id: 'sprint-4', name: 'Sprint 4', startDate: '2026-02-17', endDate: '2026-03-02', isCurrent: false, status: 'future', workDays: 10, daysRemaining: 10, progress: 0 },
    ];

    if (data.sprints?.length) {
      return data.sprints.map((s: any) => {
        const start = s.startDate || s.start_date;
        const end = s.endDate || s.end_date;
        const startDate = start ? new Date(start) : new Date();
        const endDate = end ? new Date(end) : new Date();
        const now = new Date();
        
        let status: 'past' | 'current' | 'future' = 'future';
        if (now > endDate) status = 'past';
        else if (now >= startDate && now <= endDate) status = 'current';
        
        return {
          id: s.id || `sprint-${s.name}`,
          name: s.name,
          startDate: start,
          endDate: end,
          isCurrent: s.isCurrent || status === 'current',
          status,
          workDays: getWorkDays(startDate, endDate),
          daysRemaining: getDaysRemaining(endDate),
          progress: getSprintProgress(startDate, endDate)
        };
      });
    }
    return defaultIterations;
  }, [data.sprints]);

  const selectedIteration = useMemo(() => {
    if (selectedIterationId) return iterations.find(i => i.id === selectedIterationId) || null;
    return iterations.find(i => i.isCurrent) || iterations[0] || null;
  }, [iterations, selectedIterationId]);

  // Sprint stats from tasks
  const sprintStats = useMemo(() => {
    const tasks = data.tasks || [];
    let completed = 0, inProgress = 0, blocked = 0, remaining = 0;
    
    tasks.forEach((t: any) => {
      const status = (t.status || '').toLowerCase();
      const pc = t.percentComplete || 0;
      if (status.includes('complete') || pc >= 100) completed++;
      else if (status.includes('block') || status.includes('hold')) blocked++;
      else if (pc > 0 || status.includes('progress')) inProgress++;
      else remaining++;
    });
    
    const total = tasks.length || 1;
    const health = Math.round((completed / total) * 100);
    
    return { completed, inProgress, blocked, remaining, total, health };
  }, [data.tasks]);

  // Team members
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => {
    if (data.employees?.length) {
      return data.employees.slice(0, 8).map((emp: any, idx: number) => ({
        id: emp.id || emp.employeeId || `${idx}`,
        name: emp.name || `Team Member ${idx + 1}`,
        role: emp.jobTitle || emp.role || 'Developer',
        hoursPerDay: 6,
        daysOff: 0,
        capacity: 60,
        assigned: Math.round(Math.random() * 50 + 10),
      }));
    }
    return [
      { id: '1', name: 'Alice Johnson', role: 'Developer', hoursPerDay: 6, daysOff: 0, capacity: 60, assigned: 45 },
      { id: '2', name: 'Bob Smith', role: 'Developer', hoursPerDay: 6, daysOff: 1, capacity: 54, assigned: 52 },
      { id: '3', name: 'Carol Williams', role: 'QA Engineer', hoursPerDay: 6, daysOff: 0, capacity: 60, assigned: 38 },
      { id: '4', name: 'David Brown', role: 'Designer', hoursPerDay: 4, daysOff: 2, capacity: 32, assigned: 28 },
    ];
  });

  const teamCapacity = useMemo(() => {
    const total = teamMembers.reduce((sum, m) => sum + m.capacity, 0);
    const assigned = teamMembers.reduce((sum, m) => sum + m.assigned, 0);
    return { total, assigned, available: total - assigned };
  }, [teamMembers]);

  const handleUpdateMember = useCallback((id: string, field: string, value: number) => {
    setTeamMembers(prev => prev.map(m => {
      if (m.id !== id) return m;
      const updated = { ...m, [field]: value };
      updated.capacity = updated.hoursPerDay * ((selectedIteration?.workDays || 10) - updated.daysOff);
      return updated;
    }));
  }, [selectedIteration?.workDays]);

  return (
    <div className="page-panel full-height-page" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Sprint Planning</h1>
            <IterationSelector iterations={iterations} selectedId={selectedIteration?.id || null} onSelect={setSelectedIterationId} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={() => setShowCapacity(true)} style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
              borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              </svg>
              Capacity
            </button>
          </div>
        </div>
      </div>

      {/* Command Center */}
      <div style={{ padding: '1rem 1.5rem', flexShrink: 0 }}>
        <SprintCommandCenter sprint={selectedIteration} stats={sprintStats} teamCapacity={teamCapacity} onViewInsights={() => setSelectedView('analytics')} />
      </div>

      {/* View Toolbar */}
      <div style={{ display: 'flex', gap: '4px', padding: '0.5rem 1.5rem', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        {(Object.keys(VIEW_CONFIG) as ViewType[]).map(view => {
          const config = VIEW_CONFIG[view];
          const isActive = selectedView === view;
          return (
            <button key={view} onClick={() => setSelectedView(view)} style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
              background: isActive ? 'var(--pinnacle-teal)' : 'transparent', border: 'none', borderRadius: '6px',
              color: isActive ? '#000' : 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: isActive ? 600 : 500, cursor: 'pointer',
            }}>
              {config.icon}
              {config.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedView === 'board' && <BoardsView />}
        {selectedView === 'backlog' && <BacklogView />}
        {selectedView === 'tasks' && <SprintView />}
        {selectedView === 'analytics' && <AnalyticsView sprint={selectedIteration} stats={sprintStats} teamMembers={teamMembers} />}
      </div>

      {/* Capacity Panel */}
      <CapacityPanel isOpen={showCapacity} onClose={() => setShowCapacity(false)} sprint={selectedIteration} teamMembers={teamMembers} onUpdateMember={handleUpdateMember} />
      {showCapacity && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} onClick={() => setShowCapacity(false)} />}
    </div>
  );
}
