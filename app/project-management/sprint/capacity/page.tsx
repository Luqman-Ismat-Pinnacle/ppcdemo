'use client';

/**
 * @fileoverview Capacity Planning Page (ADO-style)
 * 
 * Manages team capacity for sprint planning:
 * - Set hours per day for each team member
 * - Track days off
 * - Calculate available capacity vs. assigned work
 * - Activity-based capacity allocation
 * 
 * @module app/project-management/sprint/capacity/page
 */

import React, { useState, useMemo } from 'react';
import { useData } from '@/lib/data-context';

interface TeamMember {
  id: string;
  name: string;
  role: string;
  hoursPerDay: number;
  daysOff: number;
  activities: {
    development: number;
    testing: number;
    design: number;
    other: number;
  };
}

interface Sprint {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  workDays: number;
}

// Mock data
const defaultSprint: Sprint = {
  id: 'sprint-2',
  name: 'Sprint 2',
  startDate: '2026-01-20',
  endDate: '2026-02-02',
  workDays: 10
};

const defaultTeamMembers: TeamMember[] = [
  { id: '1', name: 'Alice Johnson', role: 'Developer', hoursPerDay: 6, daysOff: 0, activities: { development: 80, testing: 10, design: 5, other: 5 } },
  { id: '2', name: 'Bob Smith', role: 'Developer', hoursPerDay: 6, daysOff: 1, activities: { development: 70, testing: 20, design: 0, other: 10 } },
  { id: '3', name: 'Carol Williams', role: 'QA Engineer', hoursPerDay: 6, daysOff: 0, activities: { development: 0, testing: 90, design: 0, other: 10 } },
  { id: '4', name: 'David Brown', role: 'Designer', hoursPerDay: 4, daysOff: 2, activities: { development: 0, testing: 0, design: 85, other: 15 } },
  { id: '5', name: 'Eve Davis', role: 'Tech Lead', hoursPerDay: 4, daysOff: 0, activities: { development: 50, testing: 10, design: 10, other: 30 } },
];

const ACTIVITY_COLORS = {
  development: '#40E0D0',
  testing: '#CDDC39',
  design: '#FF9800',
  other: '#9CA3AF'
};

export default function CapacityPage() {
  const { data } = useData();
  const [sprint, setSprint] = useState<Sprint>(() => {
    // Try to get current sprint from data
    const currentSprint = data.sprints?.find((s: any) => s.isCurrent);
    if (currentSprint) {
      const start = new Date(currentSprint.startDate || currentSprint.start_date);
      const end = new Date(currentSprint.endDate || currentSprint.end_date);
      const workDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7) * 5);
      return {
        id: currentSprint.id,
        name: currentSprint.name,
        startDate: currentSprint.startDate || currentSprint.start_date,
        endDate: currentSprint.endDate || currentSprint.end_date,
        workDays: workDays || 10
      };
    }
    return defaultSprint;
  });

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => {
    // Try to build from employees
    if (data.employees?.length) {
      return data.employees.slice(0, 6).map((emp: any, idx: number) => ({
        id: emp.id || emp.employeeId || `${idx}`,
        name: emp.name || `Team Member ${idx + 1}`,
        role: emp.jobTitle || emp.role || 'Developer',
        hoursPerDay: 6,
        daysOff: 0,
        activities: { 
          development: emp.role?.includes('Developer') ? 80 : 20, 
          testing: emp.role?.includes('QA') ? 80 : 10, 
          design: emp.role?.includes('Design') ? 80 : 5, 
          other: 5 
        }
      }));
    }
    return defaultTeamMembers;
  });

  // Calculate capacity
  const capacityData = useMemo(() => {
    let totalCapacity = 0;
    const byActivity = { development: 0, testing: 0, design: 0, other: 0 };
    
    teamMembers.forEach(member => {
      const memberCapacity = member.hoursPerDay * (sprint.workDays - member.daysOff);
      totalCapacity += memberCapacity;
      
      byActivity.development += memberCapacity * (member.activities.development / 100);
      byActivity.testing += memberCapacity * (member.activities.testing / 100);
      byActivity.design += memberCapacity * (member.activities.design / 100);
      byActivity.other += memberCapacity * (member.activities.other / 100);
    });
    
    // Mock assigned work (would come from work items in production)
    const assignedWork = {
      development: Math.round(byActivity.development * 0.7),
      testing: Math.round(byActivity.testing * 0.5),
      design: Math.round(byActivity.design * 0.8),
      other: Math.round(byActivity.other * 0.3)
    };
    const totalAssigned = assignedWork.development + assignedWork.testing + assignedWork.design + assignedWork.other;
    
    return {
      totalCapacity: Math.round(totalCapacity),
      totalAssigned,
      utilization: totalCapacity > 0 ? Math.round((totalAssigned / totalCapacity) * 100) : 0,
      byActivity,
      assignedWork
    };
  }, [teamMembers, sprint]);

  const updateMember = (id: string, field: keyof TeamMember, value: any) => {
    setTeamMembers(prev => prev.map(m => 
      m.id === id ? { ...m, [field]: value } : m
    ));
  };

  const updateActivity = (id: string, activity: keyof TeamMember['activities'], value: number) => {
    setTeamMembers(prev => prev.map(m => {
      if (m.id !== id) return m;
      const newActivities = { ...m.activities, [activity]: value };
      // Ensure activities sum to 100
      const total = Object.values(newActivities).reduce((a, b) => a + b, 0);
      if (total !== 100) {
        const diff = 100 - total;
        const others = Object.keys(newActivities).filter(k => k !== activity) as (keyof typeof newActivities)[];
        if (others.length > 0) {
          newActivities[others[others.length - 1]] += diff;
        }
      }
      return { ...m, activities: newActivities };
    }));
  };

  return (
    <div className="page-panel" style={{ padding: '1.5rem', height: 'calc(100vh - 100px)', overflow: 'auto' }}>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">Capacity Planning</h1>
          <p style={{ marginTop: '4px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            {sprint.name}: {sprint.startDate} to {sprint.endDate} ({sprint.workDays} work days)
          </p>
        </div>
      </div>

      {/* Capacity Overview */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr 1fr', 
        gap: '1rem', 
        marginBottom: '1.5rem' 
      }}>
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: '10px',
          padding: '1.25rem',
          border: '1px solid var(--border-color)'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Capacity
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#40E0D0', marginTop: '8px' }}>
            {capacityData.totalCapacity}h
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {teamMembers.length} team members
          </div>
        </div>
        
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: '10px',
          padding: '1.25rem',
          border: '1px solid var(--border-color)'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Assigned Work
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#CDDC39', marginTop: '8px' }}>
            {capacityData.totalAssigned}h
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {capacityData.totalCapacity - capacityData.totalAssigned}h available
          </div>
        </div>
        
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: '10px',
          padding: '1.25rem',
          border: '1px solid var(--border-color)'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Utilization
          </div>
          <div style={{ 
            fontSize: '2rem', 
            fontWeight: 700, 
            color: capacityData.utilization > 100 ? '#ef4444' : capacityData.utilization > 80 ? '#CDDC39' : '#40E0D0',
            marginTop: '8px' 
          }}>
            {capacityData.utilization}%
          </div>
          <div style={{ 
            width: '100%', 
            height: '8px', 
            background: 'var(--bg-tertiary)', 
            borderRadius: '4px', 
            marginTop: '8px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${Math.min(capacityData.utilization, 100)}%`,
              height: '100%',
              background: capacityData.utilization > 100 ? '#ef4444' : capacityData.utilization > 80 ? '#CDDC39' : '#40E0D0',
              borderRadius: '4px',
              transition: 'width 0.3s'
            }} />
          </div>
        </div>
      </div>

      {/* Capacity by Activity */}
      <div className="chart-card" style={{ marginBottom: '1.5rem' }}>
        <div className="chart-card-header">
          <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
              <path d="M18 20V10M12 20V4M6 20v-6" />
            </svg>
            Capacity by Activity
          </h3>
        </div>
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            {(Object.keys(ACTIVITY_COLORS) as (keyof typeof ACTIVITY_COLORS)[]).map(activity => {
              const capacity = Math.round(capacityData.byActivity[activity]);
              const assigned = capacityData.assignedWork[activity];
              const percentage = capacity > 0 ? Math.round((assigned / capacity) * 100) : 0;
              
              return (
                <div key={activity} style={{
                  background: 'var(--bg-tertiary)',
                  borderRadius: '8px',
                  padding: '1rem'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    marginBottom: '12px' 
                  }}>
                    <div style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '3px',
                      background: ACTIVITY_COLORS[activity]
                    }} />
                    <span style={{ 
                      fontSize: '0.85rem', 
                      fontWeight: 600, 
                      textTransform: 'capitalize' 
                    }}>
                      {activity}
                    </span>
                  </div>
                  <div style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: 700, 
                    color: ACTIVITY_COLORS[activity] 
                  }}>
                    {assigned}h / {capacity}h
                  </div>
                  <div style={{ 
                    width: '100%', 
                    height: '6px', 
                    background: 'var(--bg-secondary)', 
                    borderRadius: '3px', 
                    marginTop: '8px' 
                  }}>
                    <div style={{
                      width: `${Math.min(percentage, 100)}%`,
                      height: '100%',
                      background: ACTIVITY_COLORS[activity],
                      borderRadius: '3px'
                    }} />
                  </div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--text-muted)', 
                    marginTop: '6px' 
                  }}>
                    {percentage}% allocated
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Team Capacity Table */}
      <div className="chart-card">
        <div className="chart-card-header">
          <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Team Member Capacity
          </h3>
        </div>
        <div style={{ overflow: 'auto' }}>
          <table className="data-table" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th style={{ width: '180px' }}>Name</th>
                <th style={{ width: '120px' }}>Role</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Hours/Day</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Days Off</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Capacity</th>
                <th style={{ textAlign: 'center' }}>Activity Distribution</th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.map(member => {
                const memberCapacity = member.hoursPerDay * (sprint.workDays - member.daysOff);
                
                return (
                  <tr key={member.id}>
                    <td style={{ fontWeight: 500 }}>{member.name}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{member.role}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        min="0"
                        max="8"
                        value={member.hoursPerDay}
                        onChange={(e) => updateMember(member.id, 'hoursPerDay', parseInt(e.target.value) || 0)}
                        style={{
                          width: '50px',
                          padding: '4px 8px',
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          color: 'var(--text-primary)',
                          textAlign: 'center'
                        }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        min="0"
                        max={sprint.workDays}
                        value={member.daysOff}
                        onChange={(e) => updateMember(member.id, 'daysOff', parseInt(e.target.value) || 0)}
                        style={{
                          width: '50px',
                          padding: '4px 8px',
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          color: 'var(--text-primary)',
                          textAlign: 'center'
                        }}
                      />
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#40E0D0' }}>
                      {memberCapacity}h
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {(Object.keys(member.activities) as (keyof typeof member.activities)[]).map(activity => (
                          <div key={activity} style={{ flex: 1, minWidth: '60px' }}>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '4px', 
                              marginBottom: '4px' 
                            }}>
                              <div style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '2px',
                                background: ACTIVITY_COLORS[activity]
                              }} />
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                {activity.slice(0, 3)}
                              </span>
                            </div>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={member.activities[activity]}
                              onChange={(e) => updateActivity(member.id, activity, parseInt(e.target.value) || 0)}
                              style={{
                                width: '100%',
                                padding: '2px 4px',
                                background: 'var(--bg-tertiary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '3px',
                                color: 'var(--text-primary)',
                                textAlign: 'center',
                                fontSize: '0.75rem'
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
