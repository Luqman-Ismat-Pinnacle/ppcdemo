'use client';

/**
 * @fileoverview Backlog Management Page - Azure DevOps-style Backlog
 * 
 * Provides full backlog management with:
 * - Hierarchical view: Epics → Features → User Stories → Tasks
 * - Drag-and-drop prioritization
 * - Sprint assignment
 * - Story point estimation
 * - Backlog grooming tools
 * - Works standalone without Azure DevOps connection
 * 
 * @module app/project-management/backlog/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import type { Epic, Feature, UserStory, Task, Employee, Sprint, ChangeLogEntry, ProjectTable } from '@/types/data';
import WorkItemModal from './components/WorkItemModal';

// Helper functions
const getEmployeeName = (resourceId: string, employees: Employee[]): string => {
  const employee = employees.find(e => e.employeeId === resourceId);
  return employee?.name || resourceId;
};

const getInitials = (name: string): string => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
};

type ViewMode = 'hierarchy' | 'flat';
type GroupBy = 'epic' | 'feature' | 'sprint' | 'status' | 'none';

interface BacklogItem {
  id: string;
  type: 'Epic' | 'Feature' | 'User Story' | 'Task';
  data: Epic | Feature | UserStory | Task;
  children?: BacklogItem[];
  storyPoints?: number;
  priority: number; // For sorting
}

export default function BacklogView() {
  const { filteredData, data, updateData } = useData();
  
  const [viewMode, setViewMode] = useState<ViewMode>('hierarchy');
  const [groupBy, setGroupBy] = useState<GroupBy>('epic');
  const [selectedSprint, setSelectedSprint] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [draggedItem, setDraggedItem] = useState<BacklogItem | null>(null);
  const [editingItem, setEditingItem] = useState<BacklogItem | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createModalType, setCreateModalType] = useState<'Epic' | 'Feature' | 'User Story' | 'Task' | 'Bug'>('Epic');
  const [deletingItem, setDeletingItem] = useState<BacklogItem | null>(null);

  // Get all sprints
  const sprints = useMemo(() => {
    return (data.sprints || []).sort((a, b) => {
      const startA = a.startDate ? new Date(a.startDate).getTime() : 0;
      const startB = b.startDate ? new Date(b.startDate).getTime() : 0;
      return startA - startB;
    });
  }, [data.sprints]);

  // Build hierarchical backlog structure
  const backlogHierarchy = useMemo(() => {
    const epics = (filteredData.epics || []) as Epic[];
    const features = (filteredData.features || []) as Feature[];
    const userStories = (filteredData.userStories || []) as UserStory[];
    const tasks = (filteredData.tasks || []) as Task[];

    // Build Epic → Feature → Story → Task hierarchy
    const epicMap = new Map<string, BacklogItem>();

    epics.forEach(epic => {
      epicMap.set(epic.id, {
        id: epic.id,
        type: 'Epic',
        data: epic,
        children: [],
        priority: 0
      });
    });

    features.forEach(feature => {
      const epic = epicMap.get(feature.epicId);
      if (epic) {
        const featureItem: BacklogItem = {
          id: feature.id,
          type: 'Feature',
          data: feature,
          children: [],
          priority: 0
        };
        epic.children!.push(featureItem);
      }
    });

    userStories.forEach(story => {
      features.forEach(feature => {
        if (feature.id === story.featureId) {
          const epic = epicMap.get(feature.epicId);
          if (epic) {
            const featureItem = epic.children!.find(c => c.id === feature.id);
            if (featureItem) {
              const storyItem: BacklogItem = {
                id: story.id,
                type: 'User Story',
                data: story,
                children: [],
                priority: 0
              };
              featureItem.children!.push(storyItem);
            }
          }
        }
      });
    });

    tasks.forEach(task => {
      if (task.userStoryId) {
        userStories.forEach(story => {
          if (story.id === task.userStoryId) {
            features.forEach(feature => {
              if (feature.id === story.featureId) {
                const epic = epicMap.get(feature.epicId);
                if (epic) {
                  const featureItem = epic.children!.find(c => c.id === feature.id);
                  if (featureItem) {
                    const storyItem = featureItem.children!.find(c => c.id === story.id);
                    if (storyItem) {
                      const taskItem: BacklogItem = {
                        id: task.id || task.taskId,
                        type: 'Task',
                        data: task,
                        priority: 0
                      };
                      storyItem.children!.push(taskItem);
                    }
                  }
                }
              }
            });
          }
        });
      }
    });

    return Array.from(epicMap.values());
  }, [filteredData]);

  // Flatten hierarchy for flat view
  const flatBacklog = useMemo(() => {
    const flatten = (items: BacklogItem[]): BacklogItem[] => {
      const result: BacklogItem[] = [];
      items.forEach(item => {
        result.push(item);
        if (item.children) {
          result.push(...flatten(item.children));
        }
      });
      return result;
    };
    return flatten(backlogHierarchy);
  }, [backlogHierarchy]);

  // Filter backlog items
  const filteredBacklog = useMemo(() => {
    const items = viewMode === 'hierarchy' ? backlogHierarchy : flatBacklog;

    let filtered = items;

    // Sprint filter
    if (selectedSprint !== 'all') {
      filtered = filtered.filter(item => {
        if (item.type === 'User Story') {
          return (item.data as UserStory).sprintId === selectedSprint;
        }
        if (item.type === 'Task') {
          return (item.data as Task).sprintId === selectedSprint;
        }
        // For Epics/Features, check if any child is in sprint
        return true; // Will filter recursively
      });
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item => {
        const name = (item.data as any).name || (item.data as any).taskName || '';
        const id = (item.data as any).epicId || (item.data as any).featureId || 
                   (item.data as any).userStoryId || (item.data as any).taskId || '';
        return name.toLowerCase().includes(query) || id.toLowerCase().includes(query);
      });
    }

    return filtered;
  }, [viewMode, backlogHierarchy, flatBacklog, selectedSprint, searchQuery]);

  // Toggle expand/collapse
  const toggleExpand = (itemId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, item: BacklogItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Handle drop - reorder items
  const handleDrop = (e: React.DragEvent, targetItem: BacklogItem) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.id === targetItem.id) return;

    // TODO: Implement reordering logic
    // This would update the priority/order of items
    setDraggedItem(null);
  };

  // Assign to sprint
  const assignToSprint = (item: BacklogItem, sprintId: string) => {
    if (item.type === 'User Story') {
      const updatedStories = (data.userStories || []).map(story =>
        story.id === item.id ? { ...story, sprintId, updatedAt: new Date().toISOString() } : story
      );
      updateData({ userStories: updatedStories });
    } else if (item.type === 'Task') {
      const updatedTasks = (data.tasks || []).map(task =>
        (task.id || task.taskId) === item.id 
          ? { ...task, sprintId, updatedAt: new Date().toISOString() } 
          : task
      );
      updateData({ tasks: updatedTasks });
    }
  };

  // CRUD handlers
  const handleCreate = (type: 'Epic' | 'Feature' | 'User Story' | 'Task' | 'Bug') => {
    setCreateModalType(type);
    setEditingItem(null);
    setIsCreateModalOpen(true);
  };

  const handleSaveWorkItem = (savedItem: any) => {
    const isEdit = !!editingItem;
    const type = createModalType;
    
    switch (type) {
      case 'Epic':
        if (isEdit) {
          const updatedEpics = (data.epics || []).map(epic =>
            epic.id === editingItem!.id ? { ...epic, ...savedItem } : epic
          );
          updateData({ epics: updatedEpics });
        } else {
          const newEpic: Epic = {
            id: savedItem.id,
            epicId: savedItem.epicId || savedItem.id,
            name: savedItem.name,
            projectId: savedItem.projectId,
            description: savedItem.description || '',
            status: savedItem.status,
            createdAt: savedItem.createdAt,
            updatedAt: savedItem.updatedAt,
          };
          updateData({ epics: [...(data.epics || []), newEpic] });
        }
        break;
      case 'Feature':
        if (isEdit) {
          const updatedFeatures = (data.features || []).map(feature =>
            feature.id === editingItem!.id ? { ...feature, ...savedItem } : feature
          );
          updateData({ features: updatedFeatures });
        } else {
          const newFeature: Feature = {
            id: savedItem.id,
            featureId: savedItem.featureId || savedItem.id,
            name: savedItem.name,
            epicId: savedItem.epicId,
            description: savedItem.description || '',
            status: savedItem.status,
            createdAt: savedItem.createdAt,
            updatedAt: savedItem.updatedAt,
          };
          updateData({ features: [...(data.features || []), newFeature] });
        }
        break;
      case 'User Story':
        if (isEdit) {
          const updatedStories = (data.userStories || []).map(story =>
            story.id === editingItem!.id ? { ...story, ...savedItem } : story
          );
          updateData({ userStories: updatedStories });
        } else {
          const newStory: UserStory = {
            id: savedItem.id,
            userStoryId: savedItem.userStoryId || savedItem.id,
            name: savedItem.name,
            featureId: savedItem.featureId,
            description: savedItem.description || '',
            acceptanceCriteria: savedItem.acceptanceCriteria || '',
            status: savedItem.status,
            sprintId: savedItem.sprintId || undefined,
            createdAt: savedItem.createdAt,
            updatedAt: savedItem.updatedAt,
          };
          updateData({ userStories: [...(data.userStories || []), newStory] });
        }
        break;
      case 'Task':
      case 'Bug':
        if (isEdit) {
          const updatedTasks = (data.tasks || []).map(task =>
            (task.id || task.taskId) === (editingItem!.id || editingItem!.data.id || (editingItem!.data as Task).taskId)
              ? { ...task, ...savedItem }
              : task
          );
          updateData({ tasks: updatedTasks });
        } else {
          const project = (filteredData.projects || []).find((p: ProjectTable) => p.projectId === savedItem.projectId);
          const newTask: Task = {
            id: savedItem.id,
            taskId: savedItem.taskId || savedItem.id,
            customerId: project?.customerId || '',
            projectId: savedItem.projectId,
            siteId: project?.siteId || '',
            phaseId: savedItem.phaseId || '',
            subProjectId: '',
            resourceId: savedItem.resourceId || savedItem.employeeId || '',
            employeeId: savedItem.employeeId || savedItem.resourceId || '',
            assignedResourceType: 'specific',
            assignedResource: (data.employees || []).find((e: Employee) => e.employeeId === savedItem.employeeId)?.name || '',
            taskName: savedItem.taskName,
            taskDescription: savedItem.taskDescription || savedItem.description || '',
            isSubTask: false,
            parentTaskId: null,
            predecessor: null,
            projectedHours: savedItem.projectedHours || 0,
            actualHours: savedItem.actualHours || 0,
            percentComplete: savedItem.percentComplete || 0,
            status: savedItem.status,
            priority: savedItem.priority || 'medium',
            userStoryId: savedItem.userStoryId || null,
            sprintId: savedItem.sprintId || null,
            createdAt: savedItem.createdAt,
            updatedAt: savedItem.updatedAt,
            baselineStartDate: null,
            baselineEndDate: null,
            actualStartDate: null,
            actualEndDate: null,
            baselineCost: 0,
            actualCost: 0,
            remainingCost: 0,
            baselineHours: savedItem.projectedHours || 0,
            remainingHours: 0,
            comments: '',
            predecessorId: null,
            predecessorRelationship: null,
          };
          updateData({ tasks: [...(data.tasks || []), newTask] });
        }
        break;
    }
    setIsCreateModalOpen(false);
    setEditingItem(null);
  };

  const handleDeleteWorkItem = () => {
    if (!deletingItem) return;
    switch (deletingItem.type) {
      case 'Epic':
        updateData({ epics: (data.epics || []).filter(epic => epic.id !== deletingItem.id) });
        break;
      case 'Feature':
        updateData({ features: (data.features || []).filter(feature => feature.id !== deletingItem.id) });
        break;
      case 'User Story':
        updateData({ userStories: (data.userStories || []).filter(story => story.id !== deletingItem.id) });
        break;
      case 'Task':
        updateData({
          tasks: (data.tasks || []).filter(task =>
            (task.id || task.taskId) !== deletingItem.id
          )
        });
        break;
    }
    setDeletingItem(null);
  };

  const handleEditWorkItem = (item: BacklogItem) => {
    setEditingItem(item);
    setCreateModalType(item.type);
    setIsCreateModalOpen(true);
  };

  const employees = useMemo(() => data.employees || [], [data.employees]);
  const projects = useMemo(() => filteredData.projects || [], [filteredData.projects]);

  // Render backlog item
  const renderBacklogItem = (item: BacklogItem, level: number = 0) => {
    const isExpanded = expandedItems.has(item.id);
    const hasChildren = item.children && item.children.length > 0;
    const indent = level * 24;

    const getItemName = () => {
      if ('name' in item.data) return item.data.name;
      if ('taskName' in item.data) return item.data.taskName;
      return '';
    };

    const getItemId = () => {
      if ('epicId' in item.data) return item.data.epicId;
      if ('featureId' in item.data) return item.data.featureId;
      if ('userStoryId' in item.data) return item.data.userStoryId;
      if ('taskId' in item.data) return item.data.taskId;
      return item.id;
    };

    const getStatus = () => {
      return (item.data as any).status || 'Not Started';
    };

    const getSprintId = () => {
      if ('sprintId' in item.data) return item.data.sprintId;
      return undefined;
    };

    return (
      <div
        key={item.id}
        draggable
        onDragStart={(e) => handleDragStart(e, item)}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, item)}
        style={{
          padding: '0.75rem',
          marginLeft: `${indent}px`,
          background: 'var(--bg-tertiary)',
          borderRadius: '6px',
          marginBottom: '0.5rem',
          border: '1px solid rgba(255,255,255,0.05)',
          cursor: 'grab',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--pinnacle-teal)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.05)';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Expand/Collapse */}
          {hasChildren && (
            <button
              onClick={() => toggleExpand(item.id)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                padding: '0.25rem'
              }}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          {!hasChildren && <div style={{ width: '20px' }} />}

          {/* Type Badge */}
          <span style={{
            fontSize: '0.65rem',
            fontWeight: 'bold',
            padding: '0.2rem 0.5rem',
            borderRadius: '4px',
            background: item.type === 'Epic' ? '#9333EA20' :
                        item.type === 'Feature' ? '#EC489920' :
                        item.type === 'User Story' ? '#3B82F620' :
                        '#10B98120',
            color: item.type === 'Epic' ? '#9333EA' :
                   item.type === 'Feature' ? '#EC4899' :
                   item.type === 'User Story' ? '#3B82F6' :
                   '#10B981'
          }}>
            {item.type}
          </span>

          {/* ID */}
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {getItemId()}
          </span>

          {/* Name */}
          <div style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>
            {getItemName()}
          </div>

          {/* Status */}
          <span style={{
            fontSize: '0.7rem',
            padding: '0.2rem 0.5rem',
            borderRadius: '4px',
            background: 'rgba(255,255,255,0.1)',
            color: 'var(--text-secondary)'
          }}>
            {getStatus()}
          </span>

          {/* Sprint Assignment */}
          <select
            value={getSprintId() || 'backlog'}
            onChange={(e) => {
              if (e.target.value === 'backlog') {
                assignToSprint(item, '');
              } else {
                assignToSprint(item, e.target.value);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: '0.3rem 0.6rem',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '0.75rem',
              minWidth: '120px'
            }}
          >
            <option value="backlog">Backlog</option>
            {sprints.map(sprint => (
              <option key={sprint.id || sprint.sprintId} value={sprint.id || sprint.sprintId}>
                {sprint.name}
              </option>
            ))}
          </select>

          {/* Story Points (for User Stories) */}
          {item.type === 'User Story' && (
            <input
              type="number"
              min="0"
              max="100"
              value={item.storyPoints || 0}
              onChange={(e) => {
                // TODO: Store story points
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '60px',
                padding: '0.3rem',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                textAlign: 'center'
              }}
              placeholder="SP"
            />
          )}

          {/* Actions */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEditWorkItem(item);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '0.25rem'
            }}
            title="Edit"
          >
            ✏️
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeletingItem(item);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#EF4444',
              cursor: 'pointer',
              padding: '0.25rem'
            }}
            title="Delete"
          >
            🗑️
          </button>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div style={{ marginTop: '0.5rem' }}>
            {item.children!.map(child => renderBacklogItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Filters and Controls */}
      <div style={{
        padding: '1rem',
        background: 'rgba(255,255,255,0.02)',
        borderRadius: '8px',
        marginBottom: '1rem',
        display: 'flex',
        gap: '1rem',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* View Mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>View:</span>
          <button
            onClick={() => setViewMode('hierarchy')}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: 'none',
              background: viewMode === 'hierarchy' ? 'var(--pinnacle-teal)' : 'var(--bg-secondary)',
              color: viewMode === 'hierarchy' ? '#000' : 'var(--text-primary)',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            Hierarchy
          </button>
          <button
            onClick={() => setViewMode('flat')}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: 'none',
              background: viewMode === 'flat' ? 'var(--pinnacle-teal)' : 'var(--bg-secondary)',
              color: viewMode === 'flat' ? '#000' : 'var(--text-primary)',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            Flat
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search backlog..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            padding: '0.4rem 0.8rem',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '0.8rem',
            minWidth: '200px',
            flex: 1
          }}
        />

        {/* Sprint Filter */}
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
          <option value="all">All Sprints</option>
          <option value="backlog">Backlog Only</option>
          {sprints.map(sprint => (
            <option key={sprint.id || sprint.sprintId} value={sprint.id || sprint.sprintId}>
              {sprint.name}
            </option>
          ))}
        </select>
      </div>

      {/* Backlog List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem',
        background: 'rgba(255,255,255,0.01)',
        borderRadius: '8px'
      }}>
        {filteredBacklog.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem',
            color: 'var(--text-muted)',
            fontSize: '0.9rem'
          }}>
            No work items found. Create an Epic to get started.
          </div>
        ) : (
          filteredBacklog.map(item => renderBacklogItem(item))
        )}
      </div>

      {/* Create/Edit Modal */}
      <WorkItemModal
        isOpen={isCreateModalOpen}
        type={createModalType}
        item={editingItem ? editingItem.data as any : null}
        onSave={handleSaveWorkItem}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingItem(null);
        }}
        epics={filteredData.epics || []}
        features={filteredData.features || []}
        projects={projects}
        employees={employees}
        sprints={sprints}
      />

      {/* Delete Confirmation Modal */}
      {deletingItem && (
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
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            border: '1px solid var(--border-color)'
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
              Delete {deletingItem.type}?
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Are you sure you want to delete this item? This action cannot be undone.
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
                  cursor: 'pointer'
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
                  cursor: 'pointer'
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
