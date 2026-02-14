'use client';

/**
 * @fileoverview Iteration Path Management Page (ADO-style)
 * 
 * Manages sprint iterations with:
 * - Create/edit/delete iterations
 * - Set start/end dates
 * - Define iteration hierarchy
 * - Configure as default or current iteration
 * 
 * @module app/project-management/sprint/iterations/page
 */

import React, { useState, useMemo } from 'react';
import { useData } from '@/lib/data-context';
import PageLoader from '@/components/ui/PageLoader';

interface Iteration {
  id: string;
  name: string;
  path: string;
  startDate: string | null;
  endDate: string | null;
  isDefault: boolean;
  isCurrent: boolean;
  parentId: string | null;
  level: number;
}

// Default root node for iteration hierarchy (always present)
const rootIteration: Iteration = { 
  id: 'root', 
  name: 'Project', 
  path: '\\Project', 
  startDate: null, 
  endDate: null, 
  isDefault: false, 
  isCurrent: false, 
  parentId: null, 
  level: 0 
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getIterationStatus(iter: Iteration): { label: string; color: string } {
  if (iter.isCurrent) return { label: 'Current', color: '#40E0D0' };
  if (iter.isDefault) return { label: 'Default', color: '#CDDC39' };
  
  if (iter.startDate && iter.endDate) {
    const now = new Date();
    const start = new Date(iter.startDate);
    const end = new Date(iter.endDate);
    
    if (now < start) return { label: 'Future', color: '#6B7280' };
    if (now > end) return { label: 'Past', color: '#9CA3AF' };
  }
  
  return { label: '', color: '' };
}

export default function IterationsPage() {
  const { filteredData, isLoading } = useData();
  const data = filteredData;
  const [iterations, setIterations] = useState<Iteration[]>(() => {
    // Build from sprints data if available
    if (data.sprints?.length) {
      const sprints = data.sprints.map((s: any, idx: number) => ({
        id: s.id || `sprint-${idx}`,
        name: s.name || `Sprint ${idx + 1}`,
        path: `\\Project\\${s.name || `Sprint ${idx + 1}`}`,
        startDate: s.startDate || s.start_date || null,
        endDate: s.endDate || s.end_date || null,
        isDefault: s.isDefault || false,
        isCurrent: s.isCurrent || false,
        parentId: 'root',
        level: 1
      }));
      return [rootIteration, ...sprints];
    }
    // Return just the root node if no sprint data
    return [rootIteration];
  });
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newIteration, setNewIteration] = useState<Partial<Iteration> | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['root']));

  // Calculate sprint statistics
  const stats = useMemo(() => {
    const sprints = iterations.filter(i => i.level > 0);
    const completed = sprints.filter(i => {
      if (!i.endDate) return false;
      return new Date(i.endDate) < new Date();
    }).length;
    const current = sprints.filter(i => i.isCurrent).length;
    const future = sprints.filter(i => {
      if (!i.startDate) return false;
      return new Date(i.startDate) > new Date();
    }).length;
    
    return { total: sprints.length, completed, current, future };
  }, [iterations]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSetDefault = (id: string) => {
    setIterations(prev => prev.map(iter => ({
      ...iter,
      isDefault: iter.id === id
    })));
  };

  const handleSetCurrent = (id: string) => {
    setIterations(prev => prev.map(iter => ({
      ...iter,
      isCurrent: iter.id === id
    })));
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this iteration?')) {
      setIterations(prev => prev.filter(iter => iter.id !== id && iter.parentId !== id));
    }
  };

  const handleSave = (iter: Iteration) => {
    setIterations(prev => prev.map(i => i.id === iter.id ? iter : i));
    setEditingId(null);
  };

  const handleAddIteration = () => {
    const newId = `sprint-${Date.now()}`;
    setNewIteration({
      id: newId,
      name: '',
      path: '\\Project\\New Sprint',
      startDate: null,
      endDate: null,
      isDefault: false,
      isCurrent: false,
      parentId: 'root',
      level: 1
    });
  };

  const handleSaveNewIteration = () => {
    if (newIteration?.name) {
      const iter: Iteration = {
        id: newIteration.id || `sprint-${Date.now()}`,
        name: newIteration.name,
        path: `\\Project\\${newIteration.name}`,
        startDate: newIteration.startDate || null,
        endDate: newIteration.endDate || null,
        isDefault: false,
        isCurrent: false,
        parentId: 'root',
        level: 1
      };
      setIterations(prev => [...prev, iter]);
      setNewIteration(null);
    }
  };

  // Flatten for display with hierarchy
  const flatIterations = useMemo(() => {
    const result: Iteration[] = [];
    const addChildren = (parentId: string | null, level: number) => {
      iterations
        .filter(i => i.parentId === parentId)
        .sort((a, b) => {
          // Sort by start date, then name
          if (a.startDate && b.startDate) {
            return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
          }
          return a.name.localeCompare(b.name);
        })
        .forEach(iter => {
          result.push({ ...iter, level });
          if (expandedIds.has(iter.id)) {
            addChildren(iter.id, level + 1);
          }
        });
    };
    addChildren(null, 0);
    return result;
  }, [iterations, expandedIds]);

  const hasChildren = (id: string) => iterations.some(i => i.parentId === id);

  if (isLoading) return <PageLoader />;

  return (
    <div className="page-panel" style={{ padding: '1.5rem', height: 'calc(100vh - 100px)', overflow: 'auto' }}>
      {/* Stats */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '1rem', 
        marginBottom: '1.5rem' 
      }}>
        {[
          { label: 'Total Sprints', value: stats.total, color: '#40E0D0' },
          { label: 'Completed', value: stats.completed, color: '#9CA3AF' },
          { label: 'Current', value: stats.current, color: '#CDDC39' },
          { label: 'Future', value: stats.future, color: '#6B7280' }
        ].map(stat => (
          <div
            key={stat.label}
            style={{
              background: 'var(--bg-secondary)',
              borderRadius: '10px',
              padding: '1rem',
              border: '1px solid var(--border-color)'
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {stat.label}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: stat.color, marginTop: '4px' }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Iterations Table */}
      <div className="chart-card" style={{ overflow: 'hidden' }}>
        <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Iteration Paths
          </h3>
          <button
            onClick={handleAddIteration}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: 'var(--pinnacle-teal)',
              color: '#000',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Iteration
          </button>
        </div>

        <div style={{ overflow: 'auto' }}>
          <table className="data-table" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th style={{ width: '280px' }}>Name</th>
                <th style={{ width: '120px' }}>Start Date</th>
                <th style={{ width: '120px' }}>End Date</th>
                <th style={{ width: '100px' }}>Status</th>
                <th style={{ width: '200px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {flatIterations.map(iter => {
                const status = getIterationStatus(iter);
                const isEditing = editingId === iter.id;
                const canExpand = hasChildren(iter.id);
                const isExpanded = expandedIds.has(iter.id);

                return (
                  <tr key={iter.id}>
                    <td style={{ paddingLeft: `${iter.level * 24 + 12}px` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {canExpand ? (
                          <button
                            onClick={() => toggleExpand(iter.id)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)' }}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                        ) : (
                          <span style={{ width: '12px' }} />
                        )}
                        {isEditing ? (
                          <input
                            type="text"
                            defaultValue={iter.name}
                            onBlur={(e) => handleSave({ ...iter, name: e.target.value })}
                            autoFocus
                            style={{
                              background: 'var(--bg-tertiary)',
                              border: '1px solid var(--pinnacle-teal)',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              color: 'var(--text-primary)',
                              fontSize: '0.85rem'
                            }}
                          />
                        ) : (
                          <span style={{ fontWeight: iter.level === 0 ? 600 : 400 }}>{iter.name}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="date"
                          defaultValue={iter.startDate || ''}
                          onChange={(e) => handleSave({ ...iter, startDate: e.target.value || null })}
                          style={{
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            color: 'var(--text-primary)',
                            fontSize: '0.8rem'
                          }}
                        />
                      ) : (
                        formatDate(iter.startDate)
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="date"
                          defaultValue={iter.endDate || ''}
                          onChange={(e) => handleSave({ ...iter, endDate: e.target.value || null })}
                          style={{
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            color: 'var(--text-primary)',
                            fontSize: '0.8rem'
                          }}
                        />
                      ) : (
                        formatDate(iter.endDate)
                      )}
                    </td>
                    <td>
                      {status.label && (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          borderRadius: '10px',
                          background: `${status.color}20`,
                          color: status.color
                        }}>
                          {status.label}
                        </span>
                      )}
                    </td>
                    <td>
                      {iter.level > 0 && (
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={() => setEditingId(isEditing ? null : iter.id)}
                            style={{
                              padding: '4px 10px',
                              fontSize: '0.7rem',
                              background: isEditing ? 'var(--pinnacle-teal)' : 'var(--bg-tertiary)',
                              color: isEditing ? '#000' : 'var(--text-secondary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            {isEditing ? 'Done' : 'Edit'}
                          </button>
                          {!iter.isCurrent && (
                            <button
                              onClick={() => handleSetCurrent(iter.id)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '0.7rem',
                                background: 'var(--bg-tertiary)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              Set Current
                            </button>
                          )}
                          {!iter.isDefault && (
                            <button
                              onClick={() => handleSetDefault(iter.id)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '0.7rem',
                                background: 'var(--bg-tertiary)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              Set Default
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(iter.id)}
                            style={{
                              padding: '4px 10px',
                              fontSize: '0.7rem',
                              background: 'var(--bg-tertiary)',
                              color: '#ef4444',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* New iteration row */}
              {newIteration && (
                <tr>
                  <td style={{ paddingLeft: '36px' }}>
                    <input
                      type="text"
                      placeholder="Sprint name"
                      value={newIteration.name || ''}
                      onChange={(e) => setNewIteration({ ...newIteration, name: e.target.value })}
                      autoFocus
                      style={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--pinnacle-teal)',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        width: '200px'
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={newIteration.startDate || ''}
                      onChange={(e) => setNewIteration({ ...newIteration, startDate: e.target.value })}
                      style={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem'
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={newIteration.endDate || ''}
                      onChange={(e) => setNewIteration({ ...newIteration, endDate: e.target.value })}
                      style={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem'
                      }}
                    />
                  </td>
                  <td>-</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button
                        onClick={handleSaveNewIteration}
                        disabled={!newIteration.name}
                        style={{
                          padding: '4px 12px',
                          fontSize: '0.7rem',
                          background: newIteration.name ? 'var(--pinnacle-teal)' : 'var(--bg-tertiary)',
                          color: newIteration.name ? '#000' : 'var(--text-muted)',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: newIteration.name ? 'pointer' : 'not-allowed',
                          fontWeight: 600
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setNewIteration(null)}
                        style={{
                          padding: '4px 12px',
                          fontSize: '0.7rem',
                          background: 'var(--bg-tertiary)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Help section */}
      <div style={{ 
        marginTop: '1.5rem', 
        padding: '1rem', 
        background: 'var(--bg-secondary)', 
        borderRadius: '8px',
        border: '1px solid var(--border-color)'
      }}>
        <h4 style={{ margin: '0 0 8px', color: 'var(--pinnacle-teal)', fontSize: '0.9rem' }}>
          About Iterations
        </h4>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Iterations (sprints) are time-boxed periods used for planning and tracking work. 
          Set the <strong>Current</strong> iteration to indicate the active sprint. 
          The <strong>Default</strong> iteration is where new work items are initially assigned.
          Configure start and end dates for each iteration to enable capacity planning and burndown tracking.
        </p>
      </div>
    </div>
  );
}
