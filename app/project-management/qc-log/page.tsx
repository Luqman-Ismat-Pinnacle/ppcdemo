'use client';

/**
 * @fileoverview QC Log Page for PPC V3 Project Management.
 * 
 * Provides a detailed, editable log of QC transactions with:
 * - Filterable/searchable QC task list
 * - Inline editing of QC fields (status, score, errors, comments)
 * - Change tracking with audit log
 * - Status-based color coding
 * - Error count summaries
 * - Evenly spaced columns for better readability
 * 
 * All changes are logged to the change history for auditing.
 * 
 * @module app/project-management/qc-log/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import type { QCTask, ChangeLogEntry } from '@/types/data';
import {
  type SortState,
  formatSortIndicator,
  getNextSortState,
  sortByState,
} from '@/lib/sort-utils';

export default function QCLogPage() {
  const { filteredData, data, updateData } = useData();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [qcSort, setQcSort] = useState<SortState | null>(null);

  // Helper to get task name from ID
  const getTaskName = useCallback((taskId: string): string => {
    const task = data.tasks?.find((t) => t.taskId === taskId);
    return task?.taskName || taskId;
  }, [data.tasks]);

  // Filter QC tasks
  const filteredQCTasks = useMemo(() => {
    return filteredData.qctasks.filter((qc) => {
      if (statusFilter !== 'all' && qc.qcStatus !== statusFilter) {
        return false;
      }
      const taskName = getTaskName(qc.parentTaskId);
      if (searchTerm && !qc.qcTaskId.toLowerCase().includes(searchTerm.toLowerCase()) && 
          !taskName.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !qc.parentTaskId.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [filteredData.qctasks, statusFilter, searchTerm, getTaskName]);

  const sortedQCTasks = useMemo(() => {
    return sortByState(filteredQCTasks, qcSort, (qc, key) => {
      switch (key) {
        case 'qcTaskId':
          return qc.qcTaskId;
        case 'parentTask':
          return getTaskName(qc.parentTaskId);
        case 'qcHours':
          return qc.qcHours ?? 0;
        case 'qcScore':
          return qc.qcScore ?? 0;
        case 'qcCount':
          return qc.qcCount ?? 0;
        case 'qcStatus':
          return qc.qcStatus;
        case 'qcCriticalErrors':
          return qc.qcCriticalErrors ?? 0;
        case 'qcNonCriticalErrors':
          return qc.qcNonCriticalErrors ?? 0;
        case 'qcComments':
          return qc.qcComments || '';
        default:
          return null;
      }
    });
  }, [filteredQCTasks, qcSort, getTaskName]);

  const statuses = useMemo(() => {
    return [...new Set(data.qctasks.map((qc) => qc.qcStatus))];
  }, [data.qctasks]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const tasks = filteredQCTasks;
    return {
      total: tasks.length,
      complete: tasks.filter(t => t.qcStatus === 'Complete').length,
      inProgress: tasks.filter(t => t.qcStatus === 'In Progress').length,
      notStarted: tasks.filter(t => t.qcStatus === 'Not Started').length,
      totalHours: tasks.reduce((sum, t) => sum + (t.qcHours || 0), 0),
      avgScore: tasks.length > 0 ? tasks.reduce((sum, t) => sum + (t.qcScore || 0), 0) / tasks.length : 0,
      totalCritical: tasks.reduce((sum, t) => sum + (t.qcCriticalErrors || 0), 0),
      totalNonCritical: tasks.reduce((sum, t) => sum + (t.qcNonCriticalErrors || 0), 0),
    };
  }, [filteredQCTasks]);

  // Add change log entry
  const addChangeLogEntry = useCallback((
    qcTask: QCTask,
    fieldName: string,
    oldValue: string,
    newValue: string
  ) => {
    const newEntry: ChangeLogEntry = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: 'System', // TODO: Get from user context
      action: 'QC Task Updated',
      entityType: 'QC Task',
      entityId: qcTask.qcTaskId,
      fieldName,
      oldValue,
      newValue,
    };

    const updatedChangeLog = [newEntry, ...(data.changeLog || [])];
    updateData({ changeLog: updatedChangeLog });
  }, [data.changeLog, updateData]);

  // Start editing a cell
  const startEdit = (taskId: string, field: string, currentValue: any) => {
    setEditingCell({ taskId, field });
    setEditValue(String(currentValue ?? ''));
  };

  // Save edit
  const saveEdit = (qcTask: QCTask) => {
    if (!editingCell) return;

    const { field } = editingCell;
    const oldValue = String((qcTask as any)[field] ?? '');
    
    if (oldValue === editValue) {
      setEditingCell(null);
      return;
    }

    // Parse numeric values
    let newValue: any = editValue;
    if (['qcHours', 'qcScore', 'qcCount', 'qcCriticalErrors', 'qcNonCriticalErrors'].includes(field)) {
      newValue = parseFloat(editValue) || 0;
    }

    // Update the QC task
    const updatedQCTasks = data.qctasks.map(task => {
      if (task.qcTaskId === qcTask.qcTaskId) {
        return { ...task, [field]: newValue };
      }
      return task;
    });

    // Add to change log
    addChangeLogEntry(qcTask, field, oldValue, String(newValue));

    // Update data
    updateData({ qctasks: updatedQCTasks });
    setEditingCell(null);
  };

  // Cancel edit
  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent, qcTask: QCTask) => {
    if (e.key === 'Enter') {
      saveEdit(qcTask);
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  // Render editable cell
  const renderEditableCell = (qcTask: QCTask, field: string, value: any, isNumber = false) => {
    const isEditing = editingCell?.taskId === qcTask.qcTaskId && editingCell?.field === field;

    if (isEditing) {
      return (
        <td style={{ padding: '8px 12px', textAlign: isNumber ? 'center' : 'left' }}>
          <input
            type={isNumber ? 'number' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => saveEdit(qcTask)}
            onKeyDown={(e) => handleKeyPress(e, qcTask)}
            autoFocus
            style={{
              width: '100%',
              padding: '6px 10px',
              fontSize: '0.8rem',
              background: 'var(--bg-tertiary)',
              border: '2px solid var(--pinnacle-teal)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              outline: 'none',
              textAlign: isNumber ? 'center' : 'left'
            }}
          />
        </td>
      );
    }

    return (
      <td 
        onClick={() => startEdit(qcTask.qcTaskId, field, value)}
        style={{ 
          cursor: 'pointer', 
          padding: '12px 16px',
          textAlign: isNumber ? 'center' : 'left',
          transition: 'background 0.15s',
          fontSize: '0.85rem',
          fontWeight: isNumber ? 600 : 400,
          color: isNumber && value > 0 ? 'var(--text-primary)' : 'var(--text-secondary)'
        }}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(64, 224, 208, 0.1)'; }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
        title="Click to edit"
      >
        {isNumber ? (value ?? 0) : (value || '—')}
      </td>
    );
  };

  // Render status dropdown
  const renderStatusCell = (qcTask: QCTask) => {
    const isEditing = editingCell?.taskId === qcTask.qcTaskId && editingCell?.field === 'qcStatus';

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'Complete': return { bg: 'rgba(16, 185, 129, 0.15)', color: '#10B981', border: '#10B981' };
        case 'In Progress': return { bg: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', border: '#F59E0B' };
        case 'Not Started': return { bg: 'rgba(107, 114, 128, 0.15)', color: '#9CA3AF', border: '#6B7280' };
        case 'On Hold': return { bg: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', border: '#EF4444' };
        default: return { bg: 'rgba(107, 114, 128, 0.15)', color: '#9CA3AF', border: '#6B7280' };
      }
    };

    if (isEditing) {
      return (
        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
          <select
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              setTimeout(() => saveEdit({ ...qcTask, qcStatus: editValue }), 0);
            }}
            onBlur={() => saveEdit(qcTask)}
            autoFocus
            style={{
              width: '100%',
              padding: '6px 10px',
              fontSize: '0.8rem',
              background: 'var(--bg-tertiary)',
              border: '2px solid var(--pinnacle-teal)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              outline: 'none'
            }}
          >
            {statuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </td>
      );
    }

    const colors = getStatusColor(qcTask.qcStatus);

    return (
      <td 
        onClick={() => startEdit(qcTask.qcTaskId, 'qcStatus', qcTask.qcStatus)}
        style={{ 
          cursor: 'pointer', 
          padding: '12px 16px',
          textAlign: 'center',
          transition: 'background 0.15s'
        }}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(64, 224, 208, 0.1)'; }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
        title="Click to edit"
      >
        <span style={{
          display: 'inline-block',
          padding: '5px 12px',
          borderRadius: '20px',
          fontSize: '0.75rem',
          fontWeight: 600,
          background: colors.bg,
          color: colors.color,
          border: `1px solid ${colors.border}`,
          minWidth: '90px'
        }}>
          {qcTask.qcStatus}
        </span>
      </td>
    );
  };

  return (
    <div className="page-panel full-height-page" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: 'calc(100vh - 100px)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="page-header" style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">QC Log</h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <svg 
              viewBox="0 0 24 24" 
              width="16" 
              height="16" 
              fill="none" 
              stroke="var(--text-muted)" 
              strokeWidth="2"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '10px 14px 10px 40px',
                fontSize: '0.85rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                width: '240px',
              }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '10px 14px',
              fontSize: '0.85rem',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              width: '160px',
            }}
          >
            <option value="all">All Status</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Stats */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(8, 1fr)', 
        gap: '12px',
        flexShrink: 0
      }}>
        {[
          { label: 'Total Tasks', value: summaryStats.total, color: 'var(--text-primary)' },
          { label: 'Complete', value: summaryStats.complete, color: '#10B981' },
          { label: 'In Progress', value: summaryStats.inProgress, color: '#F59E0B' },
          { label: 'Not Started', value: summaryStats.notStarted, color: '#6B7280' },
          { label: 'Total Hours', value: summaryStats.totalHours.toFixed(1), color: 'var(--pinnacle-teal)' },
          { label: 'Avg Score', value: summaryStats.avgScore.toFixed(1), color: '#3B82F6' },
          { label: 'Critical Errors', value: summaryStats.totalCritical, color: '#EF4444' },
          { label: 'Non-Critical', value: summaryStats.totalNonCritical, color: '#F59E0B' },
        ].map((stat, idx) => (
          <div 
            key={idx}
            style={{
              background: 'var(--bg-card)',
              borderRadius: '10px',
              padding: '14px 16px',
              border: '1px solid var(--border-color)',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {stat.label}
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* QC Tasks Table */}
      <div className="chart-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)', padding: '14px 20px' }}>
          <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
              <path d="M9 11l3 3L22 4"></path>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            </svg>
            QC Tasks
            <span style={{ 
              fontSize: '0.75rem', 
              background: 'var(--bg-tertiary)', 
              padding: '4px 10px', 
              borderRadius: '12px',
              color: 'var(--text-muted)',
              fontWeight: 500
            }}>
              {filteredQCTasks.length} records
            </span>
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            Click any cell to edit
          </span>
        </div>
        <div className="chart-card-body no-padding" style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: '0.85rem'
          }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={{ 
                  padding: '14px 20px', 
                  textAlign: 'left', 
                  fontWeight: 600, 
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: '2px solid var(--border-color)',
                  width: '14%'
                }}>
                  <button
                    type="button"
                    onClick={() => setQcSort(prev => getNextSortState(prev, 'qcTaskId'))}
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
                      textTransform: 'inherit',
                      letterSpacing: 'inherit',
                    }}
                  >
                    QC Task ID
                    {formatSortIndicator(qcSort, 'qcTaskId') && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                        {formatSortIndicator(qcSort, 'qcTaskId')}
                      </span>
                    )}
                  </button>
                </th>
                <th style={{ 
                  padding: '14px 20px', 
                  textAlign: 'left', 
                  fontWeight: 600, 
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: '2px solid var(--border-color)',
                  width: '14%'
                }}>
                  <button
                    type="button"
                    onClick={() => setQcSort(prev => getNextSortState(prev, 'parentTask'))}
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
                      textTransform: 'inherit',
                      letterSpacing: 'inherit',
                    }}
                  >
                    Parent Task
                    {formatSortIndicator(qcSort, 'parentTask') && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                        {formatSortIndicator(qcSort, 'parentTask')}
                      </span>
                    )}
                  </button>
                </th>
                <th style={{ 
                  padding: '14px 20px', 
                  textAlign: 'center', 
                  fontWeight: 600, 
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: '2px solid var(--border-color)',
                  width: '10%'
                }}>
                  <button
                    type="button"
                    onClick={() => setQcSort(prev => getNextSortState(prev, 'qcHours'))}
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
                      textTransform: 'inherit',
                      letterSpacing: 'inherit',
                    }}
                  >
                    Hours
                    {formatSortIndicator(qcSort, 'qcHours') && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                        {formatSortIndicator(qcSort, 'qcHours')}
                      </span>
                    )}
                  </button>
                </th>
                <th style={{ 
                  padding: '14px 20px', 
                  textAlign: 'center', 
                  fontWeight: 600, 
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: '2px solid var(--border-color)',
                  width: '10%'
                }}>
                  <button
                    type="button"
                    onClick={() => setQcSort(prev => getNextSortState(prev, 'qcScore'))}
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
                      textTransform: 'inherit',
                      letterSpacing: 'inherit',
                    }}
                  >
                    Score
                    {formatSortIndicator(qcSort, 'qcScore') && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                        {formatSortIndicator(qcSort, 'qcScore')}
                      </span>
                    )}
                  </button>
                </th>
                <th style={{ 
                  padding: '14px 20px', 
                  textAlign: 'center', 
                  fontWeight: 600, 
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: '2px solid var(--border-color)',
                  width: '8%'
                }}>
                  <button
                    type="button"
                    onClick={() => setQcSort(prev => getNextSortState(prev, 'qcCount'))}
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
                      textTransform: 'inherit',
                      letterSpacing: 'inherit',
                    }}
                  >
                    Count
                    {formatSortIndicator(qcSort, 'qcCount') && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                        {formatSortIndicator(qcSort, 'qcCount')}
                      </span>
                    )}
                  </button>
                </th>
                <th style={{ 
                  padding: '14px 20px', 
                  textAlign: 'center', 
                  fontWeight: 600, 
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: '2px solid var(--border-color)',
                  width: '14%'
                }}>
                  <button
                    type="button"
                    onClick={() => setQcSort(prev => getNextSortState(prev, 'qcStatus'))}
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
                      textTransform: 'inherit',
                      letterSpacing: 'inherit',
                    }}
                  >
                    Status
                    {formatSortIndicator(qcSort, 'qcStatus') && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                        {formatSortIndicator(qcSort, 'qcStatus')}
                      </span>
                    )}
                  </button>
                </th>
                <th style={{ 
                  padding: '14px 20px', 
                  textAlign: 'center', 
                  fontWeight: 600, 
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: '2px solid var(--border-color)',
                  width: '10%'
                }}>
                  <button
                    type="button"
                    onClick={() => setQcSort(prev => getNextSortState(prev, 'qcCriticalErrors'))}
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
                      textTransform: 'inherit',
                      letterSpacing: 'inherit',
                    }}
                  >
                    Critical
                    {formatSortIndicator(qcSort, 'qcCriticalErrors') && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                        {formatSortIndicator(qcSort, 'qcCriticalErrors')}
                      </span>
                    )}
                  </button>
                </th>
                <th style={{ 
                  padding: '14px 20px', 
                  textAlign: 'center', 
                  fontWeight: 600, 
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: '2px solid var(--border-color)',
                  width: '10%'
                }}>
                  <button
                    type="button"
                    onClick={() => setQcSort(prev => getNextSortState(prev, 'qcNonCriticalErrors'))}
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
                      textTransform: 'inherit',
                      letterSpacing: 'inherit',
                    }}
                  >
                    Non-Critical
                    {formatSortIndicator(qcSort, 'qcNonCriticalErrors') && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                        {formatSortIndicator(qcSort, 'qcNonCriticalErrors')}
                      </span>
                    )}
                  </button>
                </th>
                <th style={{ 
                  padding: '14px 20px', 
                  textAlign: 'left', 
                  fontWeight: 600, 
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: '2px solid var(--border-color)',
                  width: '10%'
                }}>
                  <button
                    type="button"
                    onClick={() => setQcSort(prev => getNextSortState(prev, 'qcComments'))}
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
                      textTransform: 'inherit',
                      letterSpacing: 'inherit',
                    }}
                  >
                    Comments
                    {formatSortIndicator(qcSort, 'qcComments') && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                        {formatSortIndicator(qcSort, 'qcComments')}
                      </span>
                    )}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedQCTasks.map((qc, idx) => (
                <tr 
                  key={qc.qcTaskId}
                  style={{ 
                    borderBottom: '1px solid var(--border-color)',
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'
                  }}
                >
                  <td style={{ 
                    padding: '12px 20px',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    color: 'var(--pinnacle-teal)',
                    fontWeight: 500
                  }}>
                    {qc.qcTaskId}
                  </td>
                  <td style={{ 
                    padding: '12px 20px',
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)'
                  }}
                  title={`ID: ${qc.parentTaskId}`}
                  >
                    {getTaskName(qc.parentTaskId)}
                  </td>
                  {renderEditableCell(qc, 'qcHours', qc.qcHours, true)}
                  {renderEditableCell(qc, 'qcScore', qc.qcScore, true)}
                  {renderEditableCell(qc, 'qcCount', qc.qcCount, true)}
                  {renderStatusCell(qc)}
                  <td 
                    onClick={() => startEdit(qc.qcTaskId, 'qcCriticalErrors', qc.qcCriticalErrors)}
                    style={{ 
                      cursor: 'pointer', 
                      padding: '12px 16px',
                      textAlign: 'center',
                      transition: 'background 0.15s',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: (qc.qcCriticalErrors || 0) > 0 ? '#EF4444' : 'var(--text-muted)'
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(64, 224, 208, 0.1)'; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                    title="Click to edit"
                  >
                    {editingCell?.taskId === qc.qcTaskId && editingCell?.field === 'qcCriticalErrors' ? (
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit(qc)}
                        onKeyDown={(e) => handleKeyPress(e, qc)}
                        autoFocus
                        style={{
                          width: '60px',
                          padding: '6px',
                          fontSize: '0.8rem',
                          background: 'var(--bg-tertiary)',
                          border: '2px solid var(--pinnacle-teal)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          outline: 'none',
                          textAlign: 'center'
                        }}
                      />
                    ) : (
                      qc.qcCriticalErrors ?? 0
                    )}
                  </td>
                  <td 
                    onClick={() => startEdit(qc.qcTaskId, 'qcNonCriticalErrors', qc.qcNonCriticalErrors)}
                    style={{ 
                      cursor: 'pointer', 
                      padding: '12px 16px',
                      textAlign: 'center',
                      transition: 'background 0.15s',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: (qc.qcNonCriticalErrors || 0) > 0 ? '#F59E0B' : 'var(--text-muted)'
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(64, 224, 208, 0.1)'; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                    title="Click to edit"
                  >
                    {editingCell?.taskId === qc.qcTaskId && editingCell?.field === 'qcNonCriticalErrors' ? (
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit(qc)}
                        onKeyDown={(e) => handleKeyPress(e, qc)}
                        autoFocus
                        style={{
                          width: '60px',
                          padding: '6px',
                          fontSize: '0.8rem',
                          background: 'var(--bg-tertiary)',
                          border: '2px solid var(--pinnacle-teal)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          outline: 'none',
                          textAlign: 'center'
                        }}
                      />
                    ) : (
                      qc.qcNonCriticalErrors ?? 0
                    )}
                  </td>
                  {renderEditableCell(qc, 'qcComments', qc.qcComments || '', false)}
                </tr>
              ))}
              {filteredQCTasks.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ 
                    padding: '40px', 
                    textAlign: 'center', 
                    color: 'var(--text-muted)',
                    fontSize: '0.9rem'
                  }}>
                    No QC tasks found matching your criteria
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
