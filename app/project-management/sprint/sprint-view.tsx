'use client';

/**
 * @fileoverview Sprint Tasks View - Kanban board for sprint tasks
 * 
 * Simplified view that uses parent page's sprint selection.
 * Provides drag-and-drop Kanban board with task management.
 * 
 * @module app/project-management/sprint/sprint-view
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import type { Task, ChangeLogEntry, Employee, UserStory, Sprint, Epic, Feature } from '@/types/data';
import WorkItemModal from './components/WorkItemModal';

const getEmployeeName = (resourceId: string, employees: Employee[]): string => {
  if (!resourceId) return 'Unassigned';
  const employee = employees.find(e => (e.id || e.employeeId) === resourceId || e.name === resourceId);
  return employee?.name || resourceId;
};

const getEmployeeIdFromName = (nameOrId: string, employees: Employee[]): string | null => {
  if (!nameOrId || nameOrId === 'Unassigned') return null;
  const byName = employees.find(e => e.name === nameOrId || (e.name && e.name.trim() === nameOrId.trim()));
  if (byName) return byName.id || byName.employeeId || null;
  const byId = employees.find(e => (e.id || e.employeeId) === nameOrId);
  return byId ? (byId.id || byId.employeeId || null) : null;
};

const getInitials = (name: string): string => name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
const getTaskIdentifier = (task: Task) => task.id || task.taskId;

type KanbanView = 'status' | 'resource' | 'project' | 'priority';

const STATUS_ORDER = ['Not Started', 'In Progress', 'Roadblock', 'QC Initial', 'QC Kickoff', 'QC Mid', 'QC Final', 'Closed'];

export default function SprintView() {
  const { filteredData, data, updateData } = useData();
  const [view, setView] = useState<KanbanView>('status');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Task | null>(null);
  const [deletingItem, setDeletingItem] = useState<Task | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const sprints = useMemo(() => (data.sprints || []).sort((a: any, b: any) => {
    const startA = a.startDate ? new Date(a.startDate).getTime() : 0;
    const startB = b.startDate ? new Date(b.startDate).getTime() : 0;
    return startA - startB;
  }), [data.sprints]);

  const currentSprint = useMemo(() => {
    const now = new Date();
    return sprints.find((s: any) => {
      const start = s.startDate ? new Date(s.startDate) : null;
      const end = s.endDate ? new Date(s.endDate) : null;
      return start && end && now >= start && now <= end;
    }) || sprints[0];
  }, [sprints]);

  const sprintTasks = useMemo(() => {
    if (!currentSprint) return filteredData.tasks || [];
    const sprintId = currentSprint.id || currentSprint.sprintId;
    return (filteredData.tasks || []).filter((task: Task) => task.sprintId === sprintId || !task.sprintId);
  }, [currentSprint, filteredData.tasks]);

  const employees = useMemo(() => {
    const assignedResourceIds = new Set(sprintTasks.map((t: any) => t.employeeId || t.resourceId).filter(Boolean));
    if (assignedResourceIds.size === 0) return data.employees || [];
    return (data.employees || []).filter((e: any) => assignedResourceIds.has(e.employeeId));
  }, [sprintTasks, data.employees]);

  const groupedTasks = useMemo(() => {
    const groups = new Map<string, Task[]>();
    if (view === 'status') STATUS_ORDER.forEach(status => groups.set(status, []));

    sprintTasks.forEach((task: any) => {
      let groupKey = '';
      switch (view) {
        case 'status': groupKey = task.status || 'Not Started'; break;
        case 'resource': {
          const rid = task.assignedResourceId ?? task.employeeId ?? task.resourceId;
          groupKey = rid ? getEmployeeName(rid, employees) : 'Unassigned';
          break;
        }
        case 'project': groupKey = task.projectId || task.projectName || 'No Project'; break;
        case 'priority': groupKey = task.priority || 'Medium'; break;
      }
      if (!groups.has(groupKey)) groups.set(groupKey, []);
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
      key, tasks, count: tasks.length,
      totalHours: tasks.reduce((sum, t) => sum + (t.projectedHours || 0), 0)
    }));
  }, [sprintTasks, view, employees]);

  const getPriorityColor = (priority?: string) => {
    switch (priority?.toLowerCase()) {
      case 'critical': return '#EF4444';
      case 'high': return '#F59E0B';
      case 'medium': return '#3B82F6';
      case 'low': return '#10B981';
      default: return '#3B82F6';
    }
  };

  const handleCreate = useCallback(() => {
    setEditingItem(null);
    setIsCreateModalOpen(true);
  }, []);

  const handleEdit = useCallback((task: Task) => {
    setEditingItem(task);
    setIsCreateModalOpen(true);
  }, []);

  const handleSaveWorkItem = useCallback((savedItem: any) => {
    const isEdit = !!editingItem;
    if (isEdit) {
      const updatedTasks = (data.tasks || []).map((task: any) =>
        (task.id || task.taskId) === (editingItem!.id || editingItem!.taskId) ? { ...task, ...savedItem } : task
      );
      updateData({ tasks: updatedTasks });
    } else {
      const newTask: Task = { ...savedItem, id: savedItem.id || savedItem.taskId, taskId: savedItem.taskId || savedItem.id };
      updateData({ tasks: [...(data.tasks || []), newTask] });
    }
    setIsCreateModalOpen(false);
    setEditingItem(null);
  }, [editingItem, data.tasks, updateData]);

  const handleDeleteWorkItem = useCallback(() => {
    if (!deletingItem) return;
    updateData({ tasks: (data.tasks || []).filter((task: any) => (task.id || task.taskId) !== (deletingItem.id || deletingItem.taskId)) });
    setDeletingItem(null);
  }, [deletingItem, data.tasks, updateData]);

  const addChangeLogEntry = useCallback((task: Task, fieldName: string, oldValue: string, newValue: string) => {
    const newEntry: ChangeLogEntry = {
      id: `log-${Date.now()}`, timestamp: new Date().toISOString(), user: 'System',
      action: 'Task Updated', entityType: 'Task', entityId: task.taskId, fieldName, oldValue, newValue,
    };
    updateData({ changeLog: [newEntry, ...(data.changeLog || [])] });
  }, [data.changeLog, updateData]);

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.taskId);
  };

  const handleDragEnd = () => { setDraggedTask(null); setDragOverColumn(null); };
  const handleDragOver = (e: React.DragEvent, columnKey: string) => { e.preventDefault(); setDragOverColumn(columnKey); };
  const handleDragLeave = () => setDragOverColumn(null);

  const handleDrop = (e: React.DragEvent, targetColumn: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedTask) return;

    let fieldToUpdate: keyof Task = 'status';
    let oldValue = '';
    let valueToSet: string | null = targetColumn;

    switch (view) {
      case 'status': fieldToUpdate = 'status'; oldValue = draggedTask.status || 'Not Started'; break;
      case 'resource': {
        fieldToUpdate = 'resourceId';
        const currentId = draggedTask.assignedResourceId ?? draggedTask.employeeId ?? draggedTask.resourceId;
        oldValue = currentId ? getEmployeeName(currentId, data.employees || []) : 'Unassigned';
        valueToSet = getEmployeeIdFromName(targetColumn, data.employees || []);
        break;
      }
      case 'project': fieldToUpdate = 'projectId'; oldValue = draggedTask.projectId || 'No Project'; break;
      case 'priority': fieldToUpdate = 'priority'; oldValue = draggedTask.priority || 'Medium'; break;
    }

    const isSameValue = view === 'resource'
      ? (getEmployeeIdFromName(targetColumn, data.employees || []) === (draggedTask.assignedResourceId ?? draggedTask.employeeId ?? draggedTask.resourceId))
      : (oldValue === (valueToSet ?? targetColumn));
    if (isSameValue) return;

    const updatedTasks = data.tasks.map((task: any) => {
      if (getTaskIdentifier(task) === getTaskIdentifier(draggedTask)) {
        const base = { ...task, updatedAt: new Date().toISOString() };
        if (view === 'resource') {
          return { ...base, resourceId: valueToSet ?? undefined, employeeId: valueToSet ?? undefined, assignedResourceId: valueToSet ?? undefined };
        }
        return { ...base, [fieldToUpdate]: valueToSet ?? targetColumn };
      }
      return task;
    });

    addChangeLogEntry(draggedTask, fieldToUpdate, oldValue, valueToSet ?? targetColumn);
    updateData({ tasks: updatedTasks });
    setDraggedTask(null);

    const updatedTask = updatedTasks.find((t: any) => getTaskIdentifier(t) === getTaskIdentifier(draggedTask));
    if (updatedTask) {
      fetch('/api/data/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataKey: 'tasks', records: [updatedTask] }) }).catch(() => {});
    }
  };

  const sprintProgress = useMemo(() => {
    const total = sprintTasks.length;
    const closed = sprintTasks.filter((t: any) => t.status === 'Closed').length;
    return { total, closed, percent: total > 0 ? Math.round((closed / total) * 100) : 0 };
  }, [sprintTasks]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '1rem' }}>
      {/* Toolbar */}
      <div style={{ 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem',
        padding: '0.75rem 1rem', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {sprintTasks.length} tasks ({sprintProgress.percent}% complete)
          </span>
          <div style={{ width: '1px', height: '20px', background: 'var(--border-color)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Group:</span>
            <select value={view} onChange={(e) => setView(e.target.value as KanbanView)}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}>
              <option value="status">Status</option>
              <option value="resource">Assignee</option>
              <option value="project">Project</option>
              <option value="priority">Priority</option>
            </select>
          </div>
        </div>
        <button onClick={handleCreate} style={{
          padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: 'var(--pinnacle-teal)',
          color: '#000', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem'
        }}>+ Task</button>
      </div>

      {/* Kanban Board */}
      <div style={{ flex: 1, overflowX: 'auto', display: 'flex', gap: '1rem', paddingBottom: '1rem' }}>
        {groupedTasks.map((group) => (
          <div key={group.key} style={{ 
            minWidth: '280px', flex: 1, background: 'rgba(255,255,255,0.02)', borderRadius: '12px',
            border: dragOverColumn === group.key ? '2px solid var(--pinnacle-teal)' : '1px solid rgba(255,255,255,0.05)',
            display: 'flex', flexDirection: 'column', transition: 'all 0.2s'
          }}
            onDragOver={(e) => handleDragOver(e, group.key)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, group.key)}>
            <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group.key}</h3>
                <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.5rem', borderRadius: '10px', color: 'var(--text-muted)' }}>{group.count}</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--pinnacle-teal)', fontWeight: 'bold' }}>{(Number(group.totalHours) || 0).toFixed(0)} hrs</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: '100px' }}>
              {group.tasks.map((task: any, idx) => {
                const priority = task.priority || 'medium';
                const progress = ((task.actualHours || 0) / (task.projectedHours || 1)) * 100;
                return (
                  <div key={task.id || task.taskId || idx} draggable onDragStart={(e) => handleDragStart(e, task)} onDragEnd={handleDragEnd}
                    onClick={(e) => { e.stopPropagation(); handleEdit(task); }}
                    onContextMenu={(e) => { e.preventDefault(); setDeletingItem(task); }}
                    style={{ 
                      background: 'var(--bg-tertiary)', padding: '0.875rem', borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.05)', cursor: 'grab', transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--pinnacle-teal)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.05)'; }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.6rem', fontWeight: 'bold', color: 'var(--pinnacle-teal)', background: 'rgba(64,224,208,0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>{task.projectId || task.projectName || '-'}</span>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getPriorityColor(priority) }} title={`Priority: ${priority}`} />
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{task.taskName || task.name}</div>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                        <span>Progress</span><span>{Math.min(100, Math.round(progress))}%</span>
                      </div>
                      <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px' }}>
                        <div style={{ width: `${Math.min(100, progress)}%`, height: '100%', background: getPriorityColor(priority), borderRadius: '2px' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {(task.resourceId || task.employeeId) && (
                          <>
                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--bg-hover)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', color: 'var(--pinnacle-teal)', fontWeight: 'bold' }}>
                              {getInitials(getEmployeeName(task.resourceId || task.employeeId, employees))}
                            </div>
                            <span style={{ color: 'var(--text-secondary)' }}>{getEmployeeName(task.resourceId || task.employeeId, employees).split(' ')[0]}</span>
                          </>
                        )}
                      </div>
                      <span style={{ color: 'var(--text-muted)' }}><strong style={{ color: 'var(--text-secondary)' }}>{task.actualHours || 0}</strong>/{task.projectedHours || 0}h</span>
                    </div>
                  </div>
                );
              })}
              {group.tasks.length === 0 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '8px', minHeight: '80px' }}>
                  Drop tasks here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      {isCreateModalOpen && (
        <WorkItemModal isOpen={isCreateModalOpen} type="Task" item={editingItem || undefined} onSave={handleSaveWorkItem}
          onClose={() => { setIsCreateModalOpen(false); setEditingItem(null); }}
          epics={filteredData.epics || []} features={filteredData.features || []} projects={filteredData.projects || []} employees={data.employees || []} sprints={sprints} />
      )}

      {/* Delete Confirmation */}
      {deletingItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={() => setDeletingItem(null)}>
          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1.25rem', fontWeight: 600 }}>Delete Task?</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Are you sure you want to delete "{deletingItem.taskName}"?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setDeletingItem(null)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDeleteWorkItem} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#EF4444', color: 'white', fontSize: '0.85rem', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
