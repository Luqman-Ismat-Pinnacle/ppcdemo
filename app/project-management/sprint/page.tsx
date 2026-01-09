'use client';

/**
 * @fileoverview Sprint Planning Page for PPC V3 Project Management.
 * 
 * Provides Kanban-style task management with:
 * - Drag-and-drop task cards between status columns
 * - Group by options (Status, Resource, Project, Phase)
 * - Task priority indicators and color coding
 * - Assigned resource display with avatars
 * - Real-time status updates with change logging
 * - Task editing modal for detailed modifications
 * 
 * Tasks can be moved between columns to update their status.
 * Click on a task card to edit its details.
 * 
 * @module app/project-management/sprint/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import type { Task, ChangeLogEntry, Employee } from '@/types/data';

// Helper to get employee name from ID
const getEmployeeName = (resourceId: string, employees: Employee[]): string => {
  const employee = employees.find(e => e.employeeId === resourceId);
  return employee?.name || resourceId;
};

// Get initials from name
const getInitials = (name: string): string => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
};

type KanbanView = 'status' | 'resource' | 'project' | 'phase';

const STATUS_ORDER = ['Not Started', 'In Progress', 'Review', 'Complete'];
const PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'];

/**
 * Task Edit Modal Component
 */
interface TaskEditModalProps {
  task: Task;
  employees: Employee[];
  phases: { phaseId: string; name: string }[];
  projects: { projectId: string; name: string }[];
  onSave: (updatedTask: Partial<Task>) => void;
  onClose: () => void;
}

function TaskEditModal({ task, employees, phases, projects, onSave, onClose }: TaskEditModalProps) {
  const [editedTask, setEditedTask] = useState<Partial<Task>>({
    taskName: task.taskName,
    status: task.status || 'Not Started',
    priority: task.priority || 'medium',
    resourceId: task.resourceId || '',
    phaseId: task.phaseId || '',
    projectId: task.projectId || '',
    projectedHours: task.projectedHours || 0,
    actualHours: task.actualHours || 0,
    percentComplete: task.percentComplete || 0,
    comments: task.comments || '',
    baselineStartDate: task.baselineStartDate || '',
    baselineEndDate: task.baselineEndDate || '',
    actualStartDate: task.actualStartDate || '',
    actualEndDate: task.actualEndDate || '',
  });

  const handleChange = (field: keyof Task, value: string | number) => {
    setEditedTask(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(editedTask);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '12px',
        padding: '24px',
        width: '90%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflow: 'auto',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Edit Task
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '1.5rem',
              padding: '4px'
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Task ID (read-only) */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Task ID
            </label>
            <input
              type="text"
              value={task.taskId}
              disabled
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-muted)',
                fontSize: '0.85rem',
                cursor: 'not-allowed'
              }}
            />
          </div>

          {/* Task Name */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Task Name *
            </label>
            <input
              type="text"
              value={editedTask.taskName || ''}
              onChange={(e) => handleChange('taskName', e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem'
              }}
            />
          </div>

          {/* Two-column layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            {/* Status */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Status
              </label>
              <select
                value={editedTask.status || 'Not Started'}
                onChange={(e) => handleChange('status', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              >
                {STATUS_ORDER.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Priority
              </label>
              <select
                value={editedTask.priority || 'Medium'}
                onChange={(e) => handleChange('priority', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              >
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Assigned Resource */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Assigned Resource
              </label>
              <select
                value={editedTask.resourceId || ''}
                onChange={(e) => handleChange('resourceId', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              >
                <option value="">Unassigned</option>
                {employees.map(emp => (
                  <option key={emp.employeeId} value={emp.employeeId}>{emp.name}</option>
                ))}
              </select>
            </div>

            {/* Phase */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Phase
              </label>
              <select
                value={editedTask.phaseId || ''}
                onChange={(e) => handleChange('phaseId', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              >
                <option value="">No Phase</option>
                {phases.map(p => (
                  <option key={p.phaseId} value={p.phaseId}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Hours Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Projected Hours
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={editedTask.projectedHours || 0}
                onChange={(e) => handleChange('projectedHours', parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Actual Hours
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={editedTask.actualHours || 0}
                onChange={(e) => handleChange('actualHours', parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                % Complete
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={editedTask.percentComplete || 0}
                onChange={(e) => handleChange('percentComplete', parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
          </div>

          {/* Dates Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Baseline Start Date
              </label>
              <input
                type="date"
                value={editedTask.baselineStartDate || ''}
                onChange={(e) => handleChange('baselineStartDate', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Baseline End Date
              </label>
              <input
                type="date"
                value={editedTask.baselineEndDate || ''}
                onChange={(e) => handleChange('baselineEndDate', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Actual Start Date
              </label>
              <input
                type="date"
                value={editedTask.actualStartDate || ''}
                onChange={(e) => handleChange('actualStartDate', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Actual End Date
              </label>
              <input
                type="date"
                value={editedTask.actualEndDate || ''}
                onChange={(e) => handleChange('actualEndDate', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
          </div>

          {/* Comments */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Comments
            </label>
            <textarea
              value={editedTask.comments || ''}
              onChange={(e) => handleChange('comments', e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: 'none',
                background: 'var(--pinnacle-teal)',
                color: '#000',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SprintPage() {
  const { filteredData, data, updateData } = useData();
  const [view, setView] = useState<KanbanView>('status');
  
  // Filter employees to only show those assigned to filtered tasks
  const employees = useMemo(() => {
    const assignedResourceIds = new Set(
      filteredData.tasks
        .map(t => t.employeeId || t.resourceId)
        .filter(Boolean)
    );
    // Return all employees if no specific assignments, otherwise filter
    if (assignedResourceIds.size === 0) return data.employees;
    return data.employees.filter(e => assignedResourceIds.has(e.employeeId));
  }, [filteredData.tasks, data.employees]);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Group tasks by view
  const groupedTasks = useMemo(() => {
    const groups = new Map<string, Task[]>();
    
    // If viewing by status, ensure all standard statuses exist
    if (view === 'status') {
      STATUS_ORDER.forEach(status => groups.set(status, []));
    }

    filteredData.tasks.forEach((task) => {
      let groupKey = '';
      switch (view) {
        case 'status':
          groupKey = task.status || 'Not Started';
          break;
        case 'resource':
          groupKey = task.resourceId ? getEmployeeName(task.resourceId, employees) : 'Unassigned';
          break;
        case 'project':
          groupKey = task.projectId || 'No Project';
          break;
        case 'phase':
          groupKey = task.phaseId || 'No Phase';
          break;
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(task);
    });

    // Sort by STATUS_ORDER if viewing by status
    let entries = Array.from(groups.entries());
    if (view === 'status') {
      entries.sort((a, b) => {
        const indexA = STATUS_ORDER.indexOf(a[0]);
        const indexB = STATUS_ORDER.indexOf(b[0]);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
      });
    }

    return entries.map(([key, tasks]) => ({
      key,
      tasks,
      count: tasks.length,
      totalHours: tasks.reduce((sum, t) => sum + (t.projectedHours || 0), 0)
    }));
  }, [filteredData.tasks, view]);

  const getPriorityColor = (priority?: string) => {
    switch (priority?.toLowerCase()) {
      case 'critical': return '#EF4444';
      case 'high': return '#F59E0B';
      case 'medium': return '#3B82F6';
      case 'low': return '#10B981';
      default: return '#3B82F6';
    }
  };

  // Add change log entry
  const addChangeLogEntry = useCallback((
    task: Task,
    fieldName: string,
    oldValue: string,
    newValue: string
  ) => {
    const newEntry: ChangeLogEntry = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: 'System', // TODO: Get from user context
      action: 'Task Updated',
      entityType: 'Task',
      entityId: task.taskId,
      fieldName,
      oldValue,
      newValue,
    };

    const updatedChangeLog = [newEntry, ...(data.changeLog || [])];
    updateData({ changeLog: updatedChangeLog });
  }, [data.changeLog, updateData]);

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.taskId);
    
    // Add visual feedback
    const target = e.target as HTMLElement;
    setTimeout(() => target.classList.add('dragging'), 0);
  };

  // Handle drag end
  const handleDragEnd = (e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    target.classList.remove('dragging');
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  // Handle drag over column
  const handleDragOver = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnKey);
  };

  // Handle drag leave
  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent, targetColumn: string) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (!draggedTask) return;

    // Determine the field to update based on view
    let fieldToUpdate: keyof Task = 'status';
    let oldValue = '';
    
    switch (view) {
      case 'status':
        fieldToUpdate = 'status';
        oldValue = draggedTask.status || 'Not Started';
        break;
      case 'resource':
        fieldToUpdate = 'resourceId';
        oldValue = draggedTask.resourceId || 'Unassigned';
        break;
      case 'project':
        fieldToUpdate = 'projectId';
        oldValue = draggedTask.projectId || 'No Project';
        break;
      case 'phase':
        fieldToUpdate = 'phaseId';
        oldValue = draggedTask.phaseId || 'No Phase';
        break;
    }

    // Don't update if dropped on same column
    if (oldValue === targetColumn) return;

    // Update the task
    const updatedTasks = data.tasks.map(task => {
      if (task.taskId === draggedTask.taskId) {
        return { ...task, [fieldToUpdate]: targetColumn, updatedAt: new Date().toISOString() };
      }
      return task;
    });

    // Add to change log
    addChangeLogEntry(draggedTask, fieldToUpdate, oldValue, targetColumn);

    // Update data
    updateData({ tasks: updatedTasks });
    setDraggedTask(null);
  };

  // Handle task edit save
  const handleTaskSave = (updatedTaskData: Partial<Task>) => {
    if (!editingTask) return;

    const updatedTasks = data.tasks.map(task => {
      if (task.taskId === editingTask.taskId) {
        // Log changes for each modified field
        Object.keys(updatedTaskData).forEach(key => {
          const oldVal = String(editingTask[key as keyof Task] || '');
          const newVal = String(updatedTaskData[key as keyof Task] || '');
          if (oldVal !== newVal) {
            addChangeLogEntry(editingTask, key, oldVal, newVal);
          }
        });

        return { 
          ...task, 
          ...updatedTaskData, 
          updatedAt: new Date().toISOString() 
        };
      }
      return task;
    });

    updateData({ tasks: updatedTasks });
    setEditingTask(null);
  };

  // Handle card click to edit
  const handleCardClick = (task: Task, e: React.MouseEvent) => {
    // Don't open edit if we're dragging
    if (e.defaultPrevented) return;
    setEditingTask(task);
  };

  return (
    <div className="page-panel full-height-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sprint Planning</h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Group By:</span>
            <select
              value={view}
              onChange={(e) => setView(e.target.value as KanbanView)}
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              <option value="status">Status</option>
              <option value="resource">Resource</option>
              <option value="project">Project</option>
              <option value="phase">Phase</option>
            </select>
          </div>
          <button className="btn btn-primary">+ New Task</button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="kanban-container" style={{ flex: 1, overflowX: 'auto', display: 'flex', gap: '1rem', paddingBottom: '1rem' }}>
        {groupedTasks.map((group) => (
          <div 
            key={group.key} 
            className={`kanban-column ${dragOverColumn === group.key ? 'drag-over' : ''}`}
            style={{ 
              minWidth: '300px', 
              flex: 1, 
              background: 'rgba(255,255,255,0.02)', 
              borderRadius: '12px', 
              border: dragOverColumn === group.key ? '2px solid var(--pinnacle-teal)' : '1px solid rgba(255,255,255,0.05)', 
              display: 'flex', 
              flexDirection: 'column',
              transition: 'all 0.2s'
            }}
            onDragOver={(e) => handleDragOver(e, group.key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, group.key)}
          >
            <div className="kanban-column-header" style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group.key}</h3>
                <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.5rem', borderRadius: '10px', color: 'var(--text-muted)' }}>{group.count}</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--pinnacle-teal)', fontWeight: 'bold' }}>
                {group.totalHours.toFixed(0)} hrs
              </div>
            </div>
            <div className="kanban-column-body" style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: '100px' }}>
              {group.tasks.map((task) => {
                const priority = task.priority || 'medium';
                const progress = ((task.actualHours || 0) / (task.projectedHours || 1)) * 100;
                
                return (
                  <div 
                    key={task.taskId} 
                    className="kanban-card"
                    draggable
                    onDragStart={(e) => handleDragStart(e, task)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => handleCardClick(task, e)}
                    style={{ 
                      background: 'var(--bg-tertiary)', 
                      padding: '1rem', 
                      borderRadius: '8px', 
                      border: '1px solid rgba(255,255,255,0.05)', 
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', 
                      cursor: 'grab',
                      transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--pinnacle-teal)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.05)';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.6rem', fontWeight: 'bold', color: 'var(--pinnacle-teal)', background: 'rgba(64, 224, 208, 0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                        {task.projectId}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div 
                          style={{ width: '8px', height: '8px', borderRadius: '50%', background: getPriorityColor(priority) }}
                          title={`Priority: ${priority}`}
                        ></div>
                        <span title="Click to edit">
                          <svg 
                            viewBox="0 0 24 24" 
                            width="12" 
                            height="12" 
                            fill="none" 
                            stroke="var(--text-muted)" 
                            strokeWidth="2"
                            style={{ cursor: 'pointer' }}
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                          </svg>
                        </span>
                      </div>
                    </div>
                    <div className="kanban-card-title" style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                      {task.taskName}
                    </div>
                    
                    <div style={{ marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                        <span>Progress</span>
                        <span>{Math.min(100, Math.round(progress))}%</span>
                      </div>
                      <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px' }}>
                        <div style={{ width: `${Math.min(100, progress)}%`, height: '100%', background: getPriorityColor(priority), borderRadius: '2px', transition: 'width 0.3s' }}></div>
                      </div>
                    </div>

                    <div className="kanban-card-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {task.resourceId && (
                          <>
                            <div title={getEmployeeName(task.resourceId, employees)} style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--bg-hover)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', color: 'var(--pinnacle-teal)', fontWeight: 'bold' }}>
                              {getInitials(getEmployeeName(task.resourceId, employees))}
                            </div>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{getEmployeeName(task.resourceId, employees).split(' ')[0]}</span>
                          </>
                        )}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>{task.actualHours || 0}</span> / {task.projectedHours || 0} hrs
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {group.tasks.length === 0 && (
                <div style={{ 
                  flex: 1, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  fontStyle: 'italic',
                  border: '2px dashed rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  minHeight: '80px'
                }}>
                  Drop tasks here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Task Edit Modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          employees={employees}
          phases={filteredData.phases}
          projects={filteredData.projects}
          onSave={handleTaskSave}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
