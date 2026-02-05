'use client';

/**
 * @fileoverview Unified Sprint Planning Page
 * 
 * Combined sprint management with:
 * - Iteration selector at the top (shows all sprints)
 * - Sprint-specific views in toolbar (Board, Backlog, Tasks, Burndown, Velocity)
 * - Capacity panel accessible from header
 * - Designed for daily use by workers and project leads
 * 
 * @module app/project-management/sprint/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';

// Import views
import BoardsView from './boards-view';
import BacklogView from './backlog-view';
import SprintView from './sprint-view';
import SprintBurndownChart from '@/components/charts/SprintBurndownChart';
import VelocityChart from '@/components/charts/VelocityChart';

// ============================================================================
// TYPES
// ============================================================================

interface Iteration {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  isDefault: boolean;
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
}

type ViewType = 'board' | 'backlog' | 'tasks' | 'burndown' | 'velocity';

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
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(s)} - ${fmt(e)}`;
}

// ============================================================================
// CAPACITY PANEL
// ============================================================================

function CapacityPanel({ 
  isOpen, 
  onClose, 
  sprint,
  teamMembers,
  onUpdateMember
}: { 
  isOpen: boolean; 
  onClose: () => void;
  sprint: Iteration | null;
  teamMembers: TeamMember[];
  onUpdateMember: (id: string, field: string, value: number) => void;
}) {
  if (!isOpen) return null;

  const totalCapacity = teamMembers.reduce((sum, m) => sum + m.capacity, 0);
  const assignedWork = Math.round(totalCapacity * 0.65); // Mock

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: '420px',
      background: 'var(--bg-secondary)',
      borderLeft: '1px solid var(--border-color)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.3)'
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.25rem',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Team Capacity</h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {sprint?.name || 'No sprint selected'}
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '8px'
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Summary */}
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#40E0D0' }}>{totalCapacity}h</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total Capacity</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#CDDC39' }}>{assignedWork}h</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Assigned</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: totalCapacity - assignedWork > 0 ? '#22c55e' : '#ef4444' }}>
              {totalCapacity - assignedWork}h
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Available</div>
          </div>
        </div>
        <div style={{ marginTop: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Utilization</span>
            <span style={{ fontWeight: 600 }}>{Math.round((assignedWork / totalCapacity) * 100)}%</span>
          </div>
          <div style={{ width: '100%', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px' }}>
            <div style={{
              width: `${Math.min((assignedWork / totalCapacity) * 100, 100)}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #40E0D0, #CDDC39)',
              borderRadius: '3px'
            }} />
          </div>
        </div>
      </div>

      {/* Team Members */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.25rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Team Members ({teamMembers.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {teamMembers.map(member => (
            <div key={member.id} style={{
              background: 'var(--bg-tertiary)',
              borderRadius: '8px',
              padding: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{member.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{member.role}</div>
                </div>
                <div style={{ 
                  fontSize: '1rem', 
                  fontWeight: 700, 
                  color: '#40E0D0',
                  background: 'rgba(64,224,208,0.1)',
                  padding: '4px 10px',
                  borderRadius: '12px'
                }}>
                  {member.capacity}h
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    Hours/Day
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="8"
                    value={member.hoursPerDay}
                    onChange={(e) => onUpdateMember(member.id, 'hoursPerDay', parseInt(e.target.value) || 0)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    Days Off
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={sprint?.workDays || 10}
                    value={member.daysOff}
                    onChange={(e) => onUpdateMember(member.id, 'daysOff', parseInt(e.target.value) || 0)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ITERATION SELECTOR
// ============================================================================

function IterationSelector({
  iterations,
  selectedId,
  onSelect,
  onAddNew
}: {
  iterations: Iteration[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddNew: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = iterations.find(i => i.id === selectedId);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 16px',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          cursor: 'pointer',
          minWidth: '280px'
        }}
      >
        <div style={{ 
          width: '10px', 
          height: '10px', 
          borderRadius: '50%', 
          background: selected?.status === 'current' ? '#40E0D0' : selected?.status === 'future' ? '#6B7280' : '#9CA3AF'
        }} />
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
            {selected?.name || 'Select Sprint'}
          </div>
          {selected && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {formatDateRange(selected.startDate, selected.endDate)}
            </div>
          )}
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, zIndex: 100 }} 
            onClick={() => setIsOpen(false)} 
          />
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '8px',
            width: '360px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            zIndex: 101,
            overflow: 'hidden'
          }}>
            <div style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Select Iteration
              </div>
            </div>
            <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
              {iterations.map(iter => (
                <button
                  key={iter.id}
                  onClick={() => { onSelect(iter.id); setIsOpen(false); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    width: '100%',
                    padding: '12px 16px',
                    background: iter.id === selectedId ? 'rgba(64,224,208,0.1)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ 
                    width: '10px', 
                    height: '10px', 
                    borderRadius: '50%',
                    background: iter.status === 'current' ? '#40E0D0' : iter.status === 'future' ? '#6B7280' : '#9CA3AF',
                    flexShrink: 0
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{iter.name}</span>
                      {iter.isCurrent && (
                        <span style={{ 
                          fontSize: '0.6rem', 
                          padding: '2px 6px', 
                          background: 'rgba(64,224,208,0.2)', 
                          color: '#40E0D0',
                          borderRadius: '8px',
                          fontWeight: 600
                        }}>
                          CURRENT
                        </span>
                      )}
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
            <div style={{ padding: '12px', borderTop: '1px solid var(--border-color)' }}>
              <button
                onClick={() => { onAddNew(); setIsOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '10px',
                  background: 'var(--bg-tertiary)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--pinnacle-teal)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 500
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New Sprint
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const VIEW_CONFIG: Record<ViewType, { label: string; icon: JSX.Element; description: string }> = {
  board: {
    label: 'Board',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
    description: 'Kanban board view'
  },
  backlog: {
    label: 'Backlog',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>,
    description: 'Prioritized work items'
  },
  tasks: {
    label: 'Tasks',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
    description: 'Sprint taskboard'
  },
  burndown: {
    label: 'Burndown',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 6-6" /></svg>,
    description: 'Sprint progress chart'
  },
  velocity: {
    label: 'Velocity',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>,
    description: 'Team velocity over time'
  }
};

export default function SprintPlanningPage() {
  const { data } = useData();
  
  // State
  const [selectedView, setSelectedView] = useState<ViewType>('board');
  const [selectedIterationId, setSelectedIterationId] = useState<string | null>(null);
  const [showCapacity, setShowCapacity] = useState(false);
  const [showMyTasksOnly, setShowMyTasksOnly] = useState(false);

  // Build iterations from data
  const iterations = useMemo((): Iteration[] => {
    const defaultIterations: Iteration[] = [
      { id: 'sprint-1', name: 'Sprint 1', startDate: '2026-01-06', endDate: '2026-01-19', isCurrent: false, isDefault: false, status: 'past', workDays: 10, daysRemaining: 0, progress: 100 },
      { id: 'sprint-2', name: 'Sprint 2', startDate: '2026-01-20', endDate: '2026-02-02', isCurrent: true, isDefault: false, status: 'current', workDays: 10, daysRemaining: 5, progress: 50 },
      { id: 'sprint-3', name: 'Sprint 3', startDate: '2026-02-03', endDate: '2026-02-16', isCurrent: false, isDefault: true, status: 'future', workDays: 10, daysRemaining: 10, progress: 0 },
      { id: 'sprint-4', name: 'Sprint 4', startDate: '2026-02-17', endDate: '2026-03-02', isCurrent: false, isDefault: false, status: 'future', workDays: 10, daysRemaining: 10, progress: 0 },
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
          isDefault: s.isDefault || false,
          status,
          workDays: getWorkDays(startDate, endDate),
          daysRemaining: getDaysRemaining(endDate),
          progress: getSprintProgress(startDate, endDate)
        };
      });
    }

    return defaultIterations;
  }, [data.sprints]);

  // Auto-select current sprint
  const selectedIteration = useMemo(() => {
    if (selectedIterationId) {
      return iterations.find(i => i.id === selectedIterationId) || null;
    }
    return iterations.find(i => i.isCurrent) || iterations[0] || null;
  }, [iterations, selectedIterationId]);

  // Team members for capacity
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => {
    if (data.employees?.length) {
      return data.employees.slice(0, 8).map((emp: any, idx: number) => ({
        id: emp.id || emp.employeeId || `${idx}`,
        name: emp.name || `Team Member ${idx + 1}`,
        role: emp.jobTitle || emp.role || 'Developer',
        hoursPerDay: 6,
        daysOff: 0,
        capacity: 6 * 10 // 6 hours * 10 work days
      }));
    }
    return [
      { id: '1', name: 'Alice Johnson', role: 'Developer', hoursPerDay: 6, daysOff: 0, capacity: 60 },
      { id: '2', name: 'Bob Smith', role: 'Developer', hoursPerDay: 6, daysOff: 1, capacity: 54 },
      { id: '3', name: 'Carol Williams', role: 'QA Engineer', hoursPerDay: 6, daysOff: 0, capacity: 60 },
      { id: '4', name: 'David Brown', role: 'Designer', hoursPerDay: 4, daysOff: 2, capacity: 32 },
    ];
  });

  const handleUpdateMember = useCallback((id: string, field: string, value: number) => {
    setTeamMembers(prev => prev.map(m => {
      if (m.id !== id) return m;
      const updated = { ...m, [field]: value };
      updated.capacity = updated.hoursPerDay * ((selectedIteration?.workDays || 10) - updated.daysOff);
      return updated;
    }));
  }, [selectedIteration?.workDays]);

  const handleAddIteration = () => {
    // In production, this would open a modal to create a new sprint
    alert('Add new sprint - would open creation modal');
  };

  const totalCapacity = teamMembers.reduce((sum, m) => sum + m.capacity, 0);

  return (
    <div className="page-panel full-height-page" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header with Iteration Selector */}
      <div style={{ 
        padding: '1rem 1.5rem',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Left: Title + Iteration Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Sprint Planning</h1>
            <IterationSelector
              iterations={iterations}
              selectedId={selectedIteration?.id || null}
              onSelect={setSelectedIterationId}
              onAddNew={handleAddIteration}
            />
          </div>

          {/* Right: Quick Stats + Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Sprint Stats */}
            {selectedIteration && (
              <div style={{ display: 'flex', gap: '1.5rem', marginRight: '1rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#40E0D0' }}>{selectedIteration.workDays}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Work Days</div>
                </div>
                {selectedIteration.status === 'current' && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#CDDC39' }}>{selectedIteration.daysRemaining}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Days Left</div>
                  </div>
                )}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#FF9800' }}>{totalCapacity}h</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Capacity</div>
                </div>
              </div>
            )}

            {/* My Tasks Toggle */}
            <button
              onClick={() => setShowMyTasksOnly(!showMyTasksOnly)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                background: showMyTasksOnly ? 'rgba(64,224,208,0.15)' : 'var(--bg-tertiary)',
                border: `1px solid ${showMyTasksOnly ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
                borderRadius: '8px',
                color: showMyTasksOnly ? 'var(--pinnacle-teal)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 500
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              My Tasks
            </button>

            {/* Capacity Button */}
            <button
              onClick={() => setShowCapacity(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 500
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Capacity
            </button>
          </div>
        </div>
      </div>

      {/* View Toolbar */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '0.75rem 1.5rem',
        background: 'rgba(0,0,0,0.2)',
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0
      }}>
        {(Object.keys(VIEW_CONFIG) as ViewType[]).map(view => {
          const config = VIEW_CONFIG[view];
          const isActive = selectedView === view;
          
          return (
            <button
              key={view}
              onClick={() => setSelectedView(view)}
              title={config.description}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: isActive ? 'var(--pinnacle-teal)' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: isActive ? '#000' : 'var(--text-secondary)',
                fontSize: '0.85rem',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {config.icon}
              {config.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedView === 'board' && <BoardsView />}
        {selectedView === 'backlog' && <BacklogView />}
        {selectedView === 'tasks' && <SprintView />}
        {selectedView === 'burndown' && (
          <div style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
            <div style={{ 
              background: 'var(--bg-card)', 
              borderRadius: '12px', 
              border: '1px solid var(--border-color)',
              padding: '1.5rem',
              height: '100%',
              minHeight: '400px'
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Sprint Burndown - {selectedIteration?.name}
              </h3>
              <div style={{ height: 'calc(100% - 40px)' }}>
                <SprintBurndownChart unit="hours" height="100%" />
              </div>
            </div>
          </div>
        )}
        {selectedView === 'velocity' && (
          <div style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
            <div style={{ 
              background: 'var(--bg-card)', 
              borderRadius: '12px', 
              border: '1px solid var(--border-color)',
              padding: '1.5rem',
              height: '100%',
              minHeight: '400px'
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Team Velocity
              </h3>
              <div style={{ height: 'calc(100% - 40px)' }}>
                <VelocityChart unit="points" height="100%" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Capacity Side Panel */}
      <CapacityPanel
        isOpen={showCapacity}
        onClose={() => setShowCapacity(false)}
        sprint={selectedIteration}
        teamMembers={teamMembers}
        onUpdateMember={handleUpdateMember}
      />

      {/* Backdrop for capacity panel */}
      {showCapacity && (
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(0,0,0,0.5)', 
            zIndex: 999 
          }} 
          onClick={() => setShowCapacity(false)}
        />
      )}
    </div>
  );
}
