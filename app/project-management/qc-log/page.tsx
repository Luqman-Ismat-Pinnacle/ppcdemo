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
        <td style={{ padding: '6px 10px', textAlign: isNumber ? 'center' : 'left' }}>
          <input
            type={isNumber ? 'number' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => saveEdit(qcTask)}
            onKeyDown={(e) => handleKeyPress(e, qcTask)}
            autoFocus
            style={{
              width: isNumber ? '50px' : '100%',
              padding: '4px 6px',
              fontSize: '0.75rem',
              background: 'var(--bg-tertiary)',
              border: '2px solid var(--pinnacle-teal)',
              borderRadius: '4px',
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
          padding: '8px 12px',
          textAlign: isNumber ? 'center' : 'left',
          transition: 'background 0.15s',
          fontSize: '0.75rem',
          fontWeight: isNumber ? 600 : 400,
          color: isNumber && value > 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
          maxWidth: isNumber ? 'auto' : '150px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(64, 224, 208, 0.1)'; }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
        title={isNumber ? 'Click to edit' : (value || 'Click to edit')}
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
        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
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
              padding: '4px 6px',
              fontSize: '0.7rem',
              background: 'var(--bg-tertiary)',
              border: '2px solid var(--pinnacle-teal)',
              borderRadius: '4px',
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
          padding: '8px 12px',
          textAlign: 'center',
          transition: 'background 0.15s'
        }}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(64, 224, 208, 0.1)'; }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
        title="Click to edit"
      >
        <span style={{
          display: 'inline-block',
          padding: '3px 8px',
          borderRadius: '12px',
          fontSize: '0.65rem',
          fontWeight: 600,
          background: colors.bg,
          color: colors.color,
          border: `1px solid ${colors.border}`,
          whiteSpace: 'nowrap'
        }}>
          {qcTask.qcStatus}
        </span>
      </td>
    );
  };

  return (
    <div className="page-panel full-height-page project-management-page" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0, overflow: 'hidden', padding: '1rem' }}>
      {/* Header with Title and Filters */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        gap: '1rem',
        flexShrink: 0
      }}>
        {/* Title Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem'
            }}>
              ✓
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>QC Log</h1>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                Track and manage quality control tasks
              </p>
            </div>
          </div>
        </div>

        {/* Filters Row */}
        <div style={{ 
          display: 'flex', 
          gap: '0.75rem', 
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '0.75rem',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.05)'
        }}>
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '280px' }}>
            <svg 
              viewBox="0 0 24 24" 
              width="14" 
              height="14" 
              fill="none" 
              stroke="var(--text-muted)" 
              strokeWidth="2"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
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
                width: '100%',
                padding: '0.5rem 0.75rem 0.5rem 2rem',
                fontSize: '0.85rem',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              fontSize: '0.85rem',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              minWidth: '140px',
            }}
          >
            <option value="all">All Status</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <span style={{ 
            fontSize: '0.8rem', 
            color: 'var(--text-muted)',
            padding: '0.5rem 0.75rem',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '6px'
          }}>
            {filteredQCTasks.length} of {data.qctasks.length} tasks
          </span>
        </div>
      </div>

      {/* Summary Stats - Compact cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
        gap: '0.75rem',
        flexShrink: 0
      }}>
        {[
          { label: 'Total', value: summaryStats.total, color: 'var(--text-primary)' },
          { label: 'Complete', value: summaryStats.complete, color: '#10B981' },
          { label: 'In Progress', value: summaryStats.inProgress, color: '#F59E0B' },
          { label: 'Not Started', value: summaryStats.notStarted, color: '#6B7280' },
          { label: 'Hours', value: summaryStats.totalHours.toFixed(1), color: 'var(--pinnacle-teal)' },
          { label: 'Avg Score', value: summaryStats.avgScore.toFixed(1), color: '#3B82F6' },
          { label: 'Critical', value: summaryStats.totalCritical, color: '#EF4444' },
          { label: 'Minor', value: summaryStats.totalNonCritical, color: '#F59E0B' },
        ].map((stat, idx) => (
          <div 
            key={idx}
            style={{
              background: 'var(--bg-card)',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>{stat.icon}</span>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {stat.label}
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: stat.color }}>
                {stat.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* QC Tasks Table - scrollable when many rows */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        minHeight: 200, 
        minWidth: 0,
        background: 'var(--bg-card)',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        overflow: 'hidden'
      }}>
        <div style={{ 
          borderBottom: '1px solid var(--border-color)', 
          padding: '0.75rem 1rem', 
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>QC Tasks</span>
          </div>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem',
            fontSize: '0.75rem', 
            color: 'var(--text-muted)'
          }}>
            <span style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px',
              padding: '4px 8px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '4px'
            }}>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              Click to edit
            </span>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <table style={{ 
            width: '100%', 
            minWidth: '900px',
            borderCollapse: 'collapse',
            fontSize: '0.8rem'
          }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                {[
                  { key: 'qcTaskId', label: 'QC Task ID', align: 'left', minWidth: '100px' },
                  { key: 'parentTask', label: 'Parent Task', align: 'left', minWidth: '140px' },
                  { key: 'qcHours', label: 'Hours', align: 'center', minWidth: '70px' },
                  { key: 'qcScore', label: 'Score', align: 'center', minWidth: '70px' },
                  { key: 'qcCount', label: 'Count', align: 'center', minWidth: '60px' },
                  { key: 'qcStatus', label: 'Status', align: 'center', minWidth: '100px' },
                  { key: 'qcCriticalErrors', label: 'Critical', align: 'center', minWidth: '70px' },
                  { key: 'qcNonCriticalErrors', label: 'Minor', align: 'center', minWidth: '70px' },
                  { key: 'qcComments', label: 'Comments', align: 'left', minWidth: '120px' },
                ].map((col) => (
                  <th 
                    key={col.key}
                    style={{ 
                      padding: '10px 12px', 
                      textAlign: col.align as 'left' | 'center' | 'right', 
                      fontWeight: 600, 
                      color: 'var(--text-secondary)',
                      fontSize: '0.7rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      borderBottom: '1px solid var(--border-color)',
                      minWidth: col.minWidth,
                      whiteSpace: 'nowrap',
                      position: 'sticky',
                      top: 0,
                      background: 'var(--bg-secondary)',
                      zIndex: 1
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setQcSort(prev => getNextSortState(prev, col.key))}
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
                      {col.label}
                      {formatSortIndicator(qcSort, col.key) && (
                        <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                          {formatSortIndicator(qcSort, col.key)}
                        </span>
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedQCTasks.map((qc, idx) => (
                <tr 
                  key={qc.qcTaskId}
                  style={{ 
                    borderBottom: '1px solid var(--border-color)',
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    transition: 'background 0.1s'
                  }}
                >
                  <td style={{ 
                    padding: '8px 12px',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    color: 'var(--pinnacle-teal)',
                    fontWeight: 500
                  }}>
                    {qc.qcTaskId}
                  </td>
                  <td style={{ 
                    padding: '8px 12px',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    maxWidth: '180px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={`${getTaskName(qc.parentTaskId)} (ID: ${qc.parentTaskId})`}
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
                      padding: '8px 12px',
                      textAlign: 'center',
                      transition: 'background 0.15s',
                      fontSize: '0.75rem',
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
                          width: '50px',
                          padding: '4px',
                          fontSize: '0.75rem',
                          background: 'var(--bg-tertiary)',
                          border: '2px solid var(--pinnacle-teal)',
                          borderRadius: '4px',
                          color: 'var(--text-primary)',
                          outline: 'none',
                          textAlign: 'center'
                        }}
                      />
                    ) : (
                      <span style={{
                        display: 'inline-block',
                        minWidth: '24px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: (qc.qcCriticalErrors || 0) > 0 ? 'rgba(239, 68, 68, 0.15)' : 'transparent'
                      }}>
                        {qc.qcCriticalErrors ?? 0}
                      </span>
                    )}
                  </td>
                  <td 
                    onClick={() => startEdit(qc.qcTaskId, 'qcNonCriticalErrors', qc.qcNonCriticalErrors)}
                    style={{ 
                      cursor: 'pointer', 
                      padding: '8px 12px',
                      textAlign: 'center',
                      transition: 'background 0.15s',
                      fontSize: '0.75rem',
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
                          width: '50px',
                          padding: '4px',
                          fontSize: '0.75rem',
                          background: 'var(--bg-tertiary)',
                          border: '2px solid var(--pinnacle-teal)',
                          borderRadius: '4px',
                          color: 'var(--text-primary)',
                          outline: 'none',
                          textAlign: 'center'
                        }}
                      />
                    ) : (
                      <span style={{
                        display: 'inline-block',
                        minWidth: '24px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: (qc.qcNonCriticalErrors || 0) > 0 ? 'rgba(245, 158, 11, 0.15)' : 'transparent'
                      }}>
                        {qc.qcNonCriticalErrors ?? 0}
                      </span>
                    )}
                  </td>
                  {renderEditableCell(qc, 'qcComments', qc.qcComments || '', false)}
                </tr>
              ))}
              {filteredQCTasks.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ 
                    padding: '3rem', 
                    textAlign: 'center'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      gap: '0.75rem' 
                    }}>
                      <span style={{ fontSize: '0.85rem', opacity: 0.5 }}>No results</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        No QC tasks found matching your criteria
                      </span>
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm('')}
                          style={{
                            padding: '0.4rem 0.75rem',
                            fontSize: '0.75rem',
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer'
                          }}
                        >
                          Clear search
                        </button>
                      )}
                    </div>
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
