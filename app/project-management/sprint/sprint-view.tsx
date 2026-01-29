'use client';

/**
 * @fileoverview Sprint View Component - Sprint Planning with Backlog, Taskboard, Capacity, and Kanban
 * 
 * Provides sprint-specific views:
 * - Backlog: Prioritized user stories for the sprint
 * - Taskboard: Stories with tasks broken down by status
 * - Capacity: Team member capacity planning
 * - Kanban: Kanban board for sprint tasks
 * 
 * @module app/project-management/sprint/sprint-view
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import type { Task, ChangeLogEntry, Employee, UserStory, Sprint, Epic, Feature } from '@/types/data';
import WorkItemModal from './components/WorkItemModal';
import SprintModal from './components/SprintModal';

// Helper functions
const getEmployeeName = (resourceId: string, employees: Employee[]): string => {
  const employee = employees.find(e => e.employeeId === resourceId);
  return employee?.name || resourceId;
};

const getInitials = (name: string): string => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
};

const getTaskIdentifier = (task: Task) => task.id || task.taskId;

type KanbanView = 'status' | 'resource' | 'project' | 'phase' | 'sprint';
type SprintView = 'backlog' | 'taskboard' | 'capacity' | 'kanban';

const STATUS_ORDER = ['Not Started', 'In Progress', 'Roadblock', 'QC Initial', 'QC Kickoff', 'QC Mid', 'QC Final', 'QC Post-Validation', 'QC Field QC', 'QC Validation', 'Closed'];
const PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'];

export default function SprintView() {
  const { filteredData, data, updateData } = useData();
  const [sprintView, setSprintView] = useState<SprintView>('kanban');
  const [selectedSprint, setSelectedSprint] = useState<string>('current');
  const [view, setView] = useState<KanbanView>('status');
  
  // CRUD state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createModalType, setCreateModalType] = useState<'Epic' | 'Feature' | 'User Story' | 'Task' | 'Bug'>('Task');
  const [editingItem, setEditingItem] = useState<Task | UserStory | Feature | Epic | null>(null);
  const [deletingItem, setDeletingItem] = useState<Task | null>(null);
  const [isCreateSprintModalOpen, setIsCreateSprintModalOpen] = useState(false);
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);
  
  // Get sprints from data
  const sprints = useMemo(() => {
    return (data.sprints || []).sort((a: any, b: any) => {
      const startA = a.startDate ? new Date(a.startDate).getTime() : 0;
      const startB = b.startDate ? new Date(b.startDate).getTime() : 0;
      return startA - startB;
    });
  }, [data.sprints]);

  // Get current sprint
  const currentSprint = useMemo(() => {
    if (selectedSprint === 'current') {
      const now = new Date();
      return sprints.find((s: any) => {
        const start = s.startDate ? new Date(s.startDate) : null;
        const end = s.endDate ? new Date(s.endDate) : null;
        return start && end && now >= start && now <= end;
      }) || sprints[0];
    }
    return sprints.find((s: any) => (s.id || s.sprintId) === selectedSprint) || sprints[0];
  }, [sprints, selectedSprint]);

  // Get user stories for current sprint
  const sprintStories = useMemo(() => {
    if (!currentSprint) return [];
    const sprintId = currentSprint.id || currentSprint.sprintId;
    return (filteredData.userStories || []).filter((story: UserStory) => story.sprintId === sprintId);
  }, [currentSprint, filteredData.userStories]);

  // Get tasks for sprint stories
  const sprintTasks = useMemo(() => {
    const storyIds = new Set(sprintStories.map((s: UserStory) => s.id));
    return (filteredData.tasks || []).filter((task: Task) => 
      task.sprintId === (currentSprint?.id || currentSprint?.sprintId) || 
      (task.userStoryId && storyIds.has(task.userStoryId))
    );
  }, [sprintStories, filteredData.tasks, currentSprint]);

  // Filter employees to only show those assigned to filtered tasks
  const employees = useMemo(() => {
    const assignedResourceIds = new Set(
      sprintTasks
        .map(t => t.employeeId || t.resourceId)
        .filter(Boolean)
    );
    if (assignedResourceIds.size === 0) return data.employees;
    return data.employees.filter(e => assignedResourceIds.has(e.employeeId));
  }, [sprintTasks, data.employees]);

  // Capacity planning data
  const capacityData = useMemo(() => {
    const employeeCapacity: Record<string, {
      employee: Employee;
      capacityHours: number;
      assignedHours: number;
      tasks: Task[];
    }> = {};

    employees.forEach(emp => {
      const empTasks = sprintTasks.filter((t: Task) => 
        (t.resourceId === emp.employeeId || t.employeeId === emp.employeeId)
      );
      const assignedHours = empTasks.reduce((sum: number, t: Task) => sum + (t.projectedHours || 0), 0);
      const capacityHours = 40; // Default: 40 hours per sprint (2 weeks)
      
      employeeCapacity[emp.employeeId] = {
        employee: emp,
        capacityHours,
        assignedHours,
        tasks: empTasks
      };
    });

    return Object.values(employeeCapacity);
  }, [employees, sprintTasks]);

  // Group tasks by view
  const groupedTasks = useMemo(() => {
    const groups = new Map<string, Task[]>();
    
    if (view === 'status') {
      STATUS_ORDER.forEach(status => groups.set(status, []));
    }

    sprintTasks.forEach((task) => {
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
        case 'sprint':
          groupKey = task.sprintId || 'Backlog';
          break;
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(task);
    });

    const entries = Array.from(groups.entries());
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
  }, [sprintTasks, view, sprints, employees]);

  const getPriorityColor = (priority?: string) => {
    switch (priority?.toLowerCase()) {
      case 'critical': return '#EF4444';
      case 'high': return '#F59E0B';
      case 'medium': return '#3B82F6';
      case 'low': return '#10B981';
      default: return '#3B82F6';
    }
  };

  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // CRUD handlers
  const handleCreate = useCallback((type: 'Epic' | 'Feature' | 'User Story' | 'Task' | 'Bug') => {
    setCreateModalType(type);
    setEditingItem(null);
    setIsCreateModalOpen(true);
  }, []);

  const handleEdit = useCallback((task: Task) => {
    setEditingItem(task);
    setCreateModalType('Task');
    setIsCreateModalOpen(true);
  }, []);

  const handleSaveWorkItem = useCallback((savedItem: any) => {
    const isEdit = !!editingItem;
    
    if (isEdit) {
      const updatedTasks = (data.tasks || []).map(task =>
        (task.id || task.taskId) === (editingItem!.id || (editingItem as Task).taskId)
          ? { ...task, ...savedItem }
          : task
      );
      updateData({ tasks: updatedTasks });
    } else {
      const newTask: Task = {
        ...savedItem,
        id: savedItem.id || savedItem.taskId,
        taskId: savedItem.taskId || savedItem.id,
      };
      updateData({ tasks: [...(data.tasks || []), newTask] });
    }
    
    setIsCreateModalOpen(false);
    setEditingItem(null);
  }, [editingItem, data.tasks, updateData]);

  const handleDeleteWorkItem = useCallback(() => {
    if (!deletingItem) return;
    updateData({
      tasks: (data.tasks || []).filter(task =>
        (task.id || task.taskId) !== (deletingItem.id || deletingItem.taskId)
      )
    });
    setDeletingItem(null);
  }, [deletingItem, data.tasks, updateData]);

  // Sprint CRUD handlers
  const handleSaveSprint = useCallback((savedSprint: any) => {
    const isEdit = !!editingSprint;
    
    if (isEdit) {
      const updatedSprints = (data.sprints || []).map(sprint =>
        (sprint.id || sprint.sprintId) === (editingSprint!.id || editingSprint!.sprintId)
          ? { ...sprint, ...savedSprint }
          : sprint
      );
      updateData({ sprints: updatedSprints });
    } else {
      const newSprint: Sprint = {
        ...savedSprint,
        id: savedSprint.id || savedSprint.sprintId,
        sprintId: savedSprint.sprintId || savedSprint.id,
      };
      updateData({ sprints: [...(data.sprints || []), newSprint] });
    }
    
    setIsCreateSprintModalOpen(false);
    setEditingSprint(null);
  }, [editingSprint, data.sprints, updateData]);

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
      user: 'System',
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
  };

  // Handle drag end
  const handleDragEnd = (e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    target.classList.remove('dragging');
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  // Handle drag over
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
      case 'sprint':
        fieldToUpdate = 'sprintId';
        oldValue = draggedTask.sprintId || 'Backlog';
        break;
    }

    if (oldValue === targetColumn) return;

    const updatedTasks = data.tasks.map(task => {
      if (getTaskIdentifier(task) && getTaskIdentifier(task) === getTaskIdentifier(draggedTask)) {
        return { ...task, [fieldToUpdate]: targetColumn, updatedAt: new Date().toISOString() };
      }
      return task;
    });

    addChangeLogEntry(draggedTask, fieldToUpdate, oldValue, targetColumn);
    updateData({ tasks: updatedTasks });
    setDraggedTask(null);
  };

  // Handle task edit save (deprecated - using handleSaveWorkItem instead)
  const handleTaskSave = (updatedTaskData: Partial<Task>) => {
    if (!editingItem) return;

    const updatedTasks = (data.tasks || []).map(task => {
      if (getTaskIdentifier(task) && getTaskIdentifier(task) === getTaskIdentifier(editingItem as Task)) {
        Object.keys(updatedTaskData).forEach(key => {
          const oldVal = String((editingItem as Task)[key as keyof Task] || '');
          const newVal = String(updatedTaskData[key as keyof Task] || '');
          if (oldVal !== newVal) {
            addChangeLogEntry(editingItem as Task, key, oldVal, newVal);
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
    setEditingItem(null);
  };

  // Handle card click to edit

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
            {currentSprint ? `${currentSprint.name}` : 'Select a sprint'}
          </h2>
          {currentSprint && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', margin: 0 }}>
              {currentSprint.startDate ? new Date(currentSprint.startDate).toLocaleDateString() : ''} to {currentSprint.endDate ? new Date(currentSprint.endDate).toLocaleDateString() : ''}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select
            value={selectedSprint}
            onChange={(e) => setSelectedSprint(e.target.value)}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem'
            }}
          >
            <option value="current">Current Sprint</option>
            {sprints.map((s: any) => (
              <option key={s.id || s.sprintId} value={s.id || s.sprintId}>
                {s.name}
              </option>
            ))}
          </select>
          <button 
            onClick={() => handleCreate('Task')}
            className="btn btn-primary"
          >
            + New Task
          </button>
          <button 
            onClick={() => setIsCreateSprintModalOpen(true)}
            className="btn btn-secondary"
            style={{ marginLeft: '0.5rem' }}
          >
            + New Sprint
          </button>
        </div>
      </div>

      {/* View Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        padding: '0 1rem',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        marginBottom: '1rem'
      }}>
        {(['backlog', 'taskboard', 'capacity', 'kanban'] as SprintView[]).map(viewType => (
          <button
            key={viewType}
            onClick={() => setSprintView(viewType)}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'none',
              border: 'none',
              borderBottom: sprintView === viewType ? '2px solid var(--pinnacle-teal)' : '2px solid transparent',
              color: sprintView === viewType ? 'var(--pinnacle-teal)' : 'var(--text-muted)',
              fontSize: '0.85rem',
              fontWeight: sprintView === viewType ? 600 : 400,
              cursor: 'pointer',
              textTransform: 'capitalize'
            }}
          >
            {viewType}
          </button>
        ))}
      </div>

      {/* Sprint Backlog View */}
      {sprintView === 'backlog' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Sprint Backlog</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sprintStories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                No user stories assigned to this sprint. Add stories from the Backlog page.
              </div>
            ) : (
              sprintStories.map((story: UserStory) => (
                <div
                  key={story.id}
                  style={{
                    padding: '1rem',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 'bold',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      background: '#3B82F620',
                      color: '#3B82F6'
                    }}>
                      User Story
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {story.userStoryId}
                    </span>
                    <div style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500 }}>
                      {story.name}
                    </div>
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'var(--text-secondary)'
                    }}>
                      {story.status}
                    </span>
                  </div>
                  {story.description && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {story.description}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Taskboard View */}
      {sprintView === 'taskboard' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Taskboard</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {sprintStories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                No user stories in this sprint.
              </div>
            ) : (
              sprintStories.map((story: UserStory) => {
                const storyTasks = sprintTasks.filter((t: Task) => t.userStoryId === story.id);
                return (
                  <div
                    key={story.id}
                    style={{
                      padding: '1rem',
                      background: 'var(--bg-tertiary)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.05)'
                    }}
                  >
                    <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>
                      {story.name} ({storyTasks.length} tasks)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.75rem' }}>
                      {STATUS_ORDER.map(status => {
                        const statusTasks = storyTasks.filter((t: Task) => t.status === status);
                        return (
                          <div key={status} style={{
                            padding: '0.75rem',
                            background: 'rgba(255,255,255,0.02)',
                            borderRadius: '6px',
                            minHeight: '100px'
                          }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                              {status} ({statusTasks.length})
                            </div>
                            {statusTasks.map((task: Task) => (
                              <div
                                key={task.id || task.taskId}
                                style={{
                                  padding: '0.5rem',
                                  background: 'var(--bg-card)',
                                  borderRadius: '4px',
                                  marginBottom: '0.5rem',
                                  fontSize: '0.75rem'
                                }}
                              >
                                {task.taskName}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Capacity Planning View */}
      {sprintView === 'capacity' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Capacity Planning</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {capacityData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                No team members assigned to this sprint.
              </div>
            ) : (
              capacityData.map(cap => {
                const utilization = (cap.assignedHours / cap.capacityHours) * 100;
                const isOverCapacity = cap.assignedHours > cap.capacityHours;
                return (
                  <div
                    key={cap.employee.employeeId}
                    style={{
                      padding: '1rem',
                      background: 'var(--bg-tertiary)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.05)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'var(--bg-hover)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.7rem',
                          color: 'var(--pinnacle-teal)',
                          fontWeight: 'bold'
                        }}>
                          {getInitials(cap.employee.name)}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{cap.employee.name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {cap.tasks.length} tasks assigned
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: isOverCapacity ? '#EF4444' : utilization > 80 ? '#F59E0B' : 'var(--text-primary)'
                        }}>
                          {cap.assignedHours.toFixed(1)} / {cap.capacityHours} hrs
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {utilization.toFixed(0)}% utilized
                        </div>
                      </div>
                    </div>
                    <div style={{
                      width: '100%',
                      height: '8px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${Math.min(100, utilization)}%`,
                        height: '100%',
                        background: isOverCapacity ? '#EF4444' : utilization > 80 ? '#F59E0B' : 'var(--pinnacle-teal)',
                        transition: 'width 0.3s'
                      }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Kanban View */}
      {sprintView === 'kanban' && (
        <>
          <div style={{ padding: '0 1rem', marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Group By:</span>
              <select
                value={view}
                onChange={(e) => setView(e.target.value as KanbanView)}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
              >
                <option value="status">Status</option>
                <option value="sprint">Sprint</option>
                <option value="resource">Resource</option>
                <option value="project">Project</option>
                <option value="phase">Phase</option>
              </select>
            </div>
          </div>
          {/* Header with Create Button */}
          <div style={{
            padding: '1rem',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Sprint Tasks</h3>
            <button
              onClick={() => handleCreate('Task')}
              className="btn btn-primary"
              style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }}
            >
              + New Task
            </button>
          </div>

          {/* Kanban Board */}
          <div className="kanban-container" style={{ flex: 1, overflowX: 'auto', display: 'flex', gap: '1rem', paddingBottom: '1rem', padding: '1rem' }}>
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
                  {group.tasks.map((task, taskIndex) => {
                    const priority = task.priority || 'medium';
                    const progress = ((task.actualHours || 0) / (task.projectedHours || 1)) * 100;
                    
                    return (
                      <div 
                        key={task.id || task.taskId || `${group.key}-${taskIndex}`} 
                        className="kanban-card"
                        draggable
                        onDragStart={(e) => handleDragStart(e, task)}
                        onDragEnd={handleDragEnd}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(task);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeletingItem(task);
                        }}
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
        </>
      )}

      {/* Create/Edit Task Modal */}
      {isCreateModalOpen && (
        <WorkItemModal
          isOpen={isCreateModalOpen}
          type={createModalType}
          item={editingItem || undefined}
          onSave={handleSaveWorkItem}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingItem(null);
          }}
          epics={filteredData.epics || []}
          features={filteredData.features || []}
          projects={filteredData.projects || []}
          employees={data.employees || []}
          sprints={sprints}
        />
      )}

      {/* Create/Edit Sprint Modal */}
      {isCreateSprintModalOpen && (
        <SprintModal
          isOpen={isCreateSprintModalOpen}
          sprint={editingSprint || undefined}
          onSave={handleSaveSprint}
          onClose={() => {
            setIsCreateSprintModalOpen(false);
            setEditingSprint(null);
          }}
          projects={filteredData.projects || []}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingItem && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setDeletingItem(null)}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1.25rem', fontWeight: 600 }}>
              Delete Task?
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Are you sure you want to delete "{deletingItem.taskName}"? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setDeletingItem(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteWorkItem}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#EF4444',
                  color: 'white',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
