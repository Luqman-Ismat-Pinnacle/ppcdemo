'use client';

/**
 * @fileoverview Azure DevOps Boards Page - Kanban Board View
 * 
 * Provides a full-featured Kanban board matching Azure DevOps functionality:
 * - Work item types: Epic, Feature, User Story, Task, Bug
 * - Customizable columns with state workflow
 * - Swimlanes for grouping
 * - WIP limits per column
 * - Filtering and search
 * - Drag-and-drop between columns
 * - Real-time sync with Azure DevOps
 * 
 * States: Not Started, In Progress, Roadblock, QC Initial, QC Kickoff, QC Mid, 
 * QC Final, QC Post-Validation, QC Field QC, QC Validation, Closed
 * 
 * @module app/project-management/boards/page
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useData } from '@/lib/data-context';
import type { Task, UserStory, Feature, Epic, Employee, ChangeLogEntry, ProjectTable, Sprint } from '@/types/data';
import WorkItemModal from './components/WorkItemModal';

// Work item types
type WorkItemType = 'Epic' | 'Feature' | 'User Story' | 'Task' | 'Bug';
type WorkItem = (Task | UserStory | Feature | Epic) & { workItemType: WorkItemType };

// Simplified state workflow - grouped for better usability
// Default view shows 5 main columns, with QC expanded into sub-columns when needed
const MAIN_STATES = [
  'Not Started',
  'In Progress',
  'Roadblock',
  'In QC',  // Grouped QC states
  'Closed'
];

const QC_STATES = [
  'QC Initial',
  'QC Kickoff',
  'QC Mid',
  'QC Final',
  'QC Post-Validation',
  'QC Field QC',
  'QC Validation'
];

// Full state workflow for detailed view
const STATE_WORKFLOW = [
  'Not Started',
  'In Progress',
  'Roadblock',
  'QC Initial',
  'QC Kickoff',
  'QC Mid',
  'QC Final',
  'QC Post-Validation',
  'QC Field QC',
  'QC Validation',
  'Closed'
];

// Map QC sub-states to the grouped "In QC" state
const mapStateToDisplay = (state: string, isDetailedView: boolean): string => {
  if (isDetailedView) return state;
  if (QC_STATES.includes(state)) return 'In QC';
  return state;
};

// Tooltips for work item types (agile hierarchy)
const WORK_ITEM_TYPE_TOOLTIPS: Record<WorkItemType, string> = {
  'Epic': 'Epic: A large initiative or theme that spans multiple features. Top of the agile hierarchy (Epic → Feature → User Story → Task).',
  'Feature': 'Feature: A deliverable capability that groups user stories. Belongs to an Epic.',
  'User Story': 'User Story: User-facing value in one sentence (e.g. "As a user I want…"). Belongs to a Feature; can be assigned to a Sprint.',
  'Task': 'Task: A concrete work item. Can be linked to a User Story and assigned to a Sprint.',
  'Bug': 'Bug: A defect or issue to fix. Tracked like a Task with Bug type.'
};

// Tooltips for column states
const STATE_TOOLTIPS: Record<string, string> = {
  'Not Started': 'Work has not begun.',
  'In Progress': 'Work is actively in progress.',
  'Roadblock': 'Blocked or waiting on something.',
  'QC Initial': 'Quality check – initial review.',
  'QC Kickoff': 'Quality check – kickoff stage.',
  'QC Mid': 'Quality check – mid-point review.',
  'QC Final': 'Quality check – final review.',
  'QC Post-Validation': 'Quality check – post-validation.',
  'QC Field QC': 'Quality check – field QC.',
  'QC Validation': 'Quality check – validation.',
  'Closed': 'Completed and closed.'
};

// Helper functions
const getEmployeeName = (resourceId: string, employees: Employee[]): string => {
  const employee = employees.find(e => e.employeeId === resourceId);
  return employee?.name || resourceId;
};

const getInitials = (name: string): string => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
};

const getWorkItemId = (item: WorkItem): string => {
  if ('taskId' in item) return (item as Task).taskId;
  if ('userStoryId' in item) return (item as UserStory).userStoryId;
  if ('featureId' in item) return (item as Feature).featureId;
  if ('epicId' in item) return (item as Epic).epicId;
  return (item as any).id || '';
};

const getWorkItemName = (item: WorkItem): string => {
  if ('taskName' in item) return item.taskName;
  if ('name' in item) return item.name;
  return '';
};

const getWorkItemStatus = (item: WorkItem): string => {
  return item.status || 'Not Started';
};

// Priority colors
const getPriorityColor = (priority?: string) => {
  switch (priority?.toLowerCase()) {
    case 'critical': return '#EF4444';
    case 'high': return '#F59E0B';
    case 'medium': return '#3B82F6';
    case 'low': return '#10B981';
    default: return '#6B7280';
  }
};

// Work item type colors
const getWorkItemTypeColor = (type: WorkItemType) => {
  switch (type) {
    case 'Epic': return '#9333EA';
    case 'Feature': return '#EC4899';
    case 'User Story': return '#3B82F6';
    case 'Task': return '#10B981';
    case 'Bug': return '#EF4444';
    default: return '#6B7280';
  }
};

interface BoardColumn {
  state: string;
  items: WorkItem[];
  wipLimit?: number;
}

type SwimlaneType = 'none' | 'assignee' | 'priority' | 'workItemType' | 'project';

export default function BoardsView() {
  const { filteredData, data, updateData } = useData();
  
  // View state
  const [selectedWorkItemTypes, setSelectedWorkItemTypes] = useState<WorkItemType[]>(['Epic', 'Feature', 'User Story', 'Task', 'Bug']);
  const [swimlaneType, setSwimlaneType] = useState<SwimlaneType>('none');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [wipLimits, setWipLimits] = useState<Record<string, number>>({});
  const [showWipWarning, setShowWipWarning] = useState(true);
  const [isDetailedView, setIsDetailedView] = useState(false); // Toggle for expanded QC states
  
  // Drag state
  const [draggedItem, setDraggedItem] = useState<WorkItem | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  
  // CRUD state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createModalType, setCreateModalType] = useState<WorkItemType>('Task');
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<WorkItem | null>(null);

  // Combine all work items
  const allWorkItems = useMemo(() => {
    const items: WorkItem[] = [];
    
    // Add Epics
    (filteredData.epics || []).forEach(epic => {
      items.push({ ...epic, workItemType: 'Epic' as WorkItemType });
    });
    
    // Add Features
    (filteredData.features || []).forEach(feature => {
      items.push({ ...feature, workItemType: 'Feature' as WorkItemType });
    });
    
    // Add User Stories
    (filteredData.userStories || []).forEach(story => {
      items.push({ ...story, workItemType: 'User Story' as WorkItemType });
    });
    
    // Add Tasks
    (filteredData.tasks || []).forEach(task => {
      items.push({ ...task, workItemType: 'Task' as WorkItemType });
    });
    
    // Note: Bugs would be added here if we had a Bug type
    // For now, we can mark tasks with a bug flag as Bug type
    
    return items;
  }, [filteredData]);

  // Filter work items
  const filteredWorkItems = useMemo(() => {
    let filtered = allWorkItems.filter(item => 
      selectedWorkItemTypes.includes(item.workItemType)
    );

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item => {
        const name = getWorkItemName(item).toLowerCase();
        const id = getWorkItemId(item).toLowerCase();
        return name.includes(query) || id.includes(query);
      });
    }

    // Assignee filter
    if (selectedAssignee !== 'all') {
      filtered = filtered.filter(item => {
        if ('resourceId' in item) {
          return item.resourceId === selectedAssignee;
        }
        if ('employeeId' in item) {
          return item.employeeId === selectedAssignee;
        }
        return false;
      });
    }

    // Project filter
    if (selectedProject !== 'all') {
      filtered = filtered.filter(item => {
        if ('projectId' in item) {
          return item.projectId === selectedProject;
        }
        return false;
      });
    }

    return filtered;
  }, [allWorkItems, selectedWorkItemTypes, searchQuery, selectedAssignee, selectedProject]);

  // Group items by state into columns
  const boardColumns = useMemo(() => {
    const stateList = isDetailedView ? STATE_WORKFLOW : MAIN_STATES;
    const columns: BoardColumn[] = stateList.map(state => ({
      state,
      items: [],
      wipLimit: wipLimits[state]
    }));

    filteredWorkItems.forEach(item => {
      const rawStatus = getWorkItemStatus(item);
      const displayStatus = mapStateToDisplay(rawStatus, isDetailedView);
      const column = columns.find(col => col.state === displayStatus);
      if (column) {
        column.items.push(item);
      } else {
        // If status doesn't match, add to "Not Started"
        columns[0].items.push(item);
      }
    });

    return columns;
  }, [filteredWorkItems, wipLimits, isDetailedView]);

  // Group items by swimlane
  const getSwimlaneKey = (item: WorkItem): string => {
    switch (swimlaneType) {
      case 'assignee':
        if ('resourceId' in item) return (item as any).resourceId || 'Unassigned';
        if ('employeeId' in item) return (item as any).employeeId || 'Unassigned';
        return 'Unassigned';
      case 'priority':
        return (item as any).priority || 'Medium';
      case 'workItemType':
        return item.workItemType;
      case 'project':
        return (item as any).projectId || 'No Project';
      default:
        return 'default';
    }
  };

  // Get unique swimlane values
  const swimlanes = useMemo(() => {
    if (swimlaneType === 'none') return ['default'];
    
    const keys = new Set<string>();
    filteredWorkItems.forEach(item => {
      keys.add(getSwimlaneKey(item));
    });
    
    return Array.from(keys).sort();
  }, [filteredWorkItems, swimlaneType]);

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, item: WorkItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', getWorkItemId(item));
  };

  // Handle drag end
  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverColumn(null);
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent, state: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(state);
  };

  // Handle drag leave
  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent, targetState: string) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (!draggedItem) return;

    const currentState = getWorkItemStatus(draggedItem);
    if (currentState === targetState) return;

    // Check WIP limit
    const targetColumn = boardColumns.find(col => col.state === targetState);
    if (targetColumn?.wipLimit && targetColumn.items.length >= targetColumn.wipLimit) {
      alert(`WIP limit reached for ${targetState}. Current: ${targetColumn.items.length}, Limit: ${targetColumn.wipLimit}`);
      return;
    }

    // Update work item based on type
    const updateWorkItem = () => {
      switch (draggedItem.workItemType) {
        case 'Epic':
          const updatedEpics = (data.epics || []).map(epic => 
            epic.id === draggedItem.id ? { ...epic, status: targetState } : epic
          );
          updateData({ epics: updatedEpics });
          break;
        case 'Feature':
          const updatedFeatures = (data.features || []).map(feature =>
            feature.id === draggedItem.id ? { ...feature, status: targetState } : feature
          );
          updateData({ features: updatedFeatures });
          break;
        case 'User Story':
          const updatedStories = (data.userStories || []).map(story =>
            story.id === draggedItem.id ? { ...story, status: targetState } : story
          );
          updateData({ userStories: updatedStories });
          break;
        case 'Task':
        case 'Bug':
          const updatedTasks = (data.tasks || []).map(task =>
            getWorkItemId(task as WorkItem) === getWorkItemId(draggedItem) 
              ? { ...task, status: targetState } 
              : task
          );
          updateData({ tasks: updatedTasks });
          break;
      }
    };

    updateWorkItem();

    // Add to change log
    const newEntry: ChangeLogEntry = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: 'System',
      action: 'Work Item Updated',
      entityType: draggedItem.workItemType,
      entityId: getWorkItemId(draggedItem),
      fieldName: 'status',
      oldValue: currentState,
      newValue: targetState,
    };
    const updatedChangeLog = [newEntry, ...(data.changeLog || [])];
    updateData({ changeLog: updatedChangeLog });

    // Optional: Sync to Azure DevOps (non-blocking)
    // App works fine even if sync fails or ADO is not configured
    // Sync will be handled via API route when needed

    setDraggedItem(null);
  };

  // Get employees for assignee filter
  const employees = useMemo(() => data.employees || [], [data.employees]);

  // Get projects for project filter
  const projects = useMemo(() => filteredData.projects || [], [filteredData.projects]);

  // Get sprints
  const sprints = useMemo(() => data.sprints || [], [data.sprints]);

  // Handle create work item
  const handleCreate = (type: WorkItemType) => {
    setCreateModalType(type);
    setEditingItem(null);
    setIsCreateModalOpen(true);
  };

  // Handle save work item (create or update)
  const handleSaveWorkItem = (savedItem: any) => {
    const isEdit = !!editingItem;
    
    switch (createModalType) {
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
            (task.id || task.taskId) === (editingItem!.id || getWorkItemId(editingItem!))
              ? { ...task, ...savedItem }
              : task
          );
          updateData({ tasks: updatedTasks });
        } else {
          const project = projects.find(p => p.projectId === savedItem.projectId);
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
            assignedResource: employees.find(e => e.employeeId === savedItem.employeeId)?.name || '',
            taskName: savedItem.taskName,
            taskDescription: savedItem.taskDescription || savedItem.description || '',
            isSubTask: false,
            parentTaskId: null,
            projectedHours: savedItem.projectedHours || 0,
            actualHours: savedItem.actualHours || 0,
            percentComplete: savedItem.percentComplete || 0,
            status: savedItem.status,
            priority: savedItem.priority || 'medium',
            userStoryId: savedItem.userStoryId || null,
            sprintId: savedItem.sprintId || null,
            createdAt: savedItem.createdAt,
            updatedAt: savedItem.updatedAt,
            // Required TrackingFields
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

  // Handle delete work item
  const handleDeleteWorkItem = () => {
    if (!deletingItem) return;

    switch (deletingItem.workItemType) {
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
      case 'Bug':
        updateData({
          tasks: (data.tasks || []).filter(task =>
            (task.id || task.taskId) !== (deletingItem.id || getWorkItemId(deletingItem))
          )
        });
        break;
    }
    setDeletingItem(null);
  };

  // Handle edit work item
  const handleEditWorkItem = (item: WorkItem) => {
    setEditingItem(item);
    setCreateModalType(item.workItemType);
    setIsCreateModalOpen(true);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '1rem' }}>
      {/* Toolbar - Create Buttons and Filters */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        marginBottom: '1rem',
        flexShrink: 0
      }}>
        {/* Row 1: Create buttons and view toggle */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          {/* Create Buttons */}
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem', 
            flexWrap: 'wrap',
            background: 'rgba(255,255,255,0.02)',
            padding: '0.5rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.05)'
          }}>
            <span style={{ 
              fontSize: '0.75rem', 
              color: 'var(--text-muted)', 
              alignSelf: 'center',
              padding: '0 0.5rem',
              borderRight: '1px solid rgba(255,255,255,0.1)',
              marginRight: '0.25rem'
            }}>
              Create:
            </span>
            {(['Epic', 'Feature', 'User Story', 'Task', 'Bug'] as WorkItemType[]).map(type => (
              <button
                key={type}
                onClick={() => handleCreate(type)}
                style={{
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  background: 'transparent',
                  border: `1px solid ${getWorkItemTypeColor(type)}40`,
                  borderRadius: '6px',
                  color: getWorkItemTypeColor(type),
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s'
                }}
                title={WORK_ITEM_TYPE_TOOLTIPS[type]}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = `${getWorkItemTypeColor(type)}20`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <span style={{ fontSize: '0.9rem' }}>+</span>
                {type}
              </button>
            ))}
          </div>

          {/* View Toggle */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem',
            background: 'rgba(255,255,255,0.02)',
            padding: '0.5rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.05)'
          }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>View:</span>
            <button
              onClick={() => setIsDetailedView(false)}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.75rem',
                background: !isDetailedView ? 'var(--pinnacle-teal)' : 'transparent',
                border: !isDetailedView ? 'none' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: '5px',
                color: !isDetailedView ? '#000' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: !isDetailedView ? 600 : 400
              }}
              title="Show 5 main columns with QC grouped"
            >
              Simple (5 cols)
            </button>
            <button
              onClick={() => setIsDetailedView(true)}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.75rem',
                background: isDetailedView ? 'var(--pinnacle-teal)' : 'transparent',
                border: isDetailedView ? 'none' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: '5px',
                color: isDetailedView ? '#000' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: isDetailedView ? 600 : 400
              }}
              title="Show all 11 columns including QC sub-states"
            >
              Detailed (11 cols)
            </button>
          </div>
        </div>

        {/* Row 2: Filters */}
        <div style={{ 
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          padding: '0.75rem',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.05)'
        }}>
          {/* Search */}
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
              placeholder="Search work items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              title="Search by work item name or ID"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem 0.5rem 2rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem'
              }}
            />
          </div>

          {/* Separator */}
          <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />

          {/* Work Item Type Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '0.25rem' }}>Show:</span>
            {(['Epic', 'Feature', 'User Story', 'Task', 'Bug'] as WorkItemType[]).map(type => {
              const isSelected = selectedWorkItemTypes.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedWorkItemTypes(selectedWorkItemTypes.filter(t => t !== type));
                    } else {
                      setSelectedWorkItemTypes([...selectedWorkItemTypes, type]);
                    }
                  }}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    background: isSelected ? `${getWorkItemTypeColor(type)}20` : 'transparent',
                    border: `1px solid ${isSelected ? getWorkItemTypeColor(type) : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '12px',
                    color: isSelected ? getWorkItemTypeColor(type) : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  title={WORK_ITEM_TYPE_TOOLTIPS[type]}
                >
                  {type}
                </button>
              );
            })}
          </div>

          {/* Separator */}
          <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />

          {/* Dropdown Filters */}
          <select
            value={selectedAssignee}
            onChange={(e) => setSelectedAssignee(e.target.value)}
            title="Filter work items by assigned person"
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Assignees</option>
            {employees.map(emp => (
              <option key={emp.employeeId} value={emp.employeeId}>{emp.name}</option>
            ))}
          </select>

          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            title="Filter work items by project"
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Projects</option>
            {projects.map(proj => (
              <option key={proj.projectId} value={proj.projectId}>{proj.name}</option>
            ))}
          </select>

          <select
            value={swimlaneType}
            onChange={(e) => setSwimlaneType(e.target.value as SwimlaneType)}
            title="Group cards into horizontal lanes"
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            <option value="none">No Swimlanes</option>
            <option value="assignee">By Assignee</option>
            <option value="priority">By Priority</option>
            <option value="workItemType">By Type</option>
            <option value="project">By Project</option>
          </select>
        </div>
      </div>

      {/* Kanban Board - responsive with horizontal scroll */}
      <div style={{ 
        flex: 1, 
        overflowX: 'auto', 
        overflowY: 'hidden',
        display: 'flex', 
        gap: '0.75rem', 
        paddingBottom: '0.5rem'
      }}>
        {boardColumns.map((column) => {
          const isOverLimit = column.wipLimit && column.items.length > column.wipLimit;
          const isAtLimit = column.wipLimit && column.items.length === column.wipLimit;
          const isQCColumn = column.state === 'In QC';
          
          // Get column color based on state
          const getColumnColor = (state: string) => {
            switch (state) {
              case 'Not Started': return '#6B7280';
              case 'In Progress': return '#3B82F6';
              case 'Roadblock': return '#EF4444';
              case 'In QC': return '#F59E0B';
              case 'Closed': return '#10B981';
              default: 
                if (state.startsWith('QC')) return '#F59E0B';
                return '#6B7280';
            }
          };
          
          const columnColor = getColumnColor(column.state);
          
          return (
            <div
              key={column.state}
              style={{
                minWidth: isDetailedView ? '240px' : '280px',
                maxWidth: isDetailedView ? '280px' : '350px',
                flex: '1 1 auto',
                background: 'var(--bg-card)',
                borderRadius: '12px',
                border: dragOverColumn === column.state 
                  ? '2px solid var(--pinnacle-teal)' 
                  : isOverLimit 
                    ? '2px solid #EF4444' 
                    : isAtLimit && showWipWarning
                      ? '2px solid #F59E0B'
                      : '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.2s',
                overflow: 'hidden'
              }}
              onDragOver={(e) => handleDragOver(e, column.state)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.state)}
            >
              {/* Column Header */}
              <div style={{ 
                padding: '0.85rem 1rem', 
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: `linear-gradient(135deg, ${columnColor}15 0%, transparent 100%)`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '3px',
                    background: columnColor
                  }} />
                  <h3
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      margin: 0
                    }}
                    title={STATE_TOOLTIPS[column.state] ?? `Status: ${column.state}`}
                  >
                    {column.state}
                    {isQCColumn && !isDetailedView && (
                      <span style={{ 
                        fontSize: '0.65rem', 
                        color: 'var(--text-muted)', 
                        fontWeight: 400,
                        marginLeft: '0.35rem'
                      }}>
                        (grouped)
                      </span>
                    )}
                  </h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ 
                    fontSize: '0.7rem', 
                    background: isOverLimit ? '#EF4444' : 'rgba(255,255,255,0.1)', 
                    padding: '0.15rem 0.5rem', 
                    borderRadius: '10px', 
                    color: isOverLimit ? '#fff' : 'var(--text-muted)',
                    fontWeight: 600
                  }}>
                    {column.items.length}
                    {column.wipLimit && <span style={{ opacity: 0.7 }}> / {column.wipLimit}</span>}
                  </span>
                  <button
                    onClick={() => {
                      const newLimit = prompt(`Set WIP limit for ${column.state}:`, column.wipLimit?.toString() || '');
                      if (newLimit !== null) {
                        const limit = parseInt(newLimit);
                        if (!isNaN(limit) && limit > 0) {
                          setWipLimits({ ...wipLimits, [column.state]: limit });
                        } else if (newLimit === '') {
                          const { [column.state]: _, ...rest } = wipLimits;
                          setWipLimits(rest);
                        }
                      }
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '0.65rem',
                      padding: '0.2rem 0.35rem',
                      borderRadius: '4px',
                      lineHeight: 1
                    }}
                    title="Set WIP limit"
                  >
                    ⚙
                  </button>
                </div>
              </div>

              {/* Column Body */}
              <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                {swimlaneType === 'none' ? (
                  // No swimlanes - flat list
                  column.items.map((item) => (
                    <WorkItemCard
                      key={getWorkItemId(item)}
                      item={item}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onEdit={handleEditWorkItem}
                      onDelete={setDeletingItem}
                      employees={employees}
                    />
                  ))
                ) : (
                  // With swimlanes
                  swimlanes.map(swimlane => {
                    const swimlaneItems = column.items.filter(item => getSwimlaneKey(item) === swimlane);
                    if (swimlaneItems.length === 0) return null;
                    
                    return (
                      <div key={swimlane} style={{ marginBottom: '1rem' }}>
                        <div style={{ 
                          fontSize: '0.7rem', 
                          color: 'var(--text-muted)', 
                          marginBottom: '0.5rem',
                          fontWeight: 600,
                          textTransform: 'uppercase'
                        }}>
                          {swimlaneType === 'assignee' 
                            ? getEmployeeName(swimlane, employees)
                            : swimlane}
                          <span style={{ marginLeft: '0.5rem', opacity: 0.6 }}>
                            ({swimlaneItems.length})
                          </span>
                        </div>
                        {swimlaneItems.map((item) => (
                          <WorkItemCard
                            key={getWorkItemId(item)}
                            item={item}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            onEdit={handleEditWorkItem}
                            onDelete={setDeletingItem}
                            employees={employees}
                          />
                        ))}
                      </div>
                    );
                  })
                )}

                {column.items.length === 0 && (
                  <div
                    style={{
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
                    }}
                    title="Drag cards here to move them to this status"
                  >
                    Drop work items here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
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
          epics={data.epics || []}
          features={data.features || []}
          projects={filteredData.projects || []}
          employees={employees}
          sprints={sprints}
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
              Delete {deletingItem.workItemType}?
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Are you sure you want to delete &quot;{getWorkItemName(deletingItem)}&quot;? This action cannot be undone.
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

// Work Item Card Component
interface WorkItemCardProps {
  item: WorkItem;
  onDragStart: (e: React.DragEvent, item: WorkItem) => void;
  onDragEnd: () => void;
  onEdit: (item: WorkItem) => void;
  onDelete: (item: WorkItem) => void;
  employees: Employee[];
}

function WorkItemCard({ item, onDragStart, onDragEnd, onEdit, onDelete, employees }: WorkItemCardProps) {
  const priority = (item as any).priority || 'Medium';
  const resourceId = (item as any).resourceId || (item as any).employeeId;
  const progress = (item as any).percentComplete || 0;
  const projectedHours = (item as any).projectedHours || 0;
  const actualHours = (item as any).actualHours || 0;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      onDragEnd={onDragEnd}
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
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 12px -2px rgba(0, 0, 0, 0.2)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.05)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              fontSize: '0.6rem',
              fontWeight: 'bold',
              color: getWorkItemTypeColor(item.workItemType),
              background: `${getWorkItemTypeColor(item.workItemType)}20`,
              padding: '0.1rem 0.4rem',
              borderRadius: '4px'
            }}
            title={WORK_ITEM_TYPE_TOOLTIPS[item.workItemType]}
          >
            {item.workItemType}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {getWorkItemName(item)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{ width: '8px', height: '8px', borderRadius: '50%', background: getPriorityColor(priority) }}
            title={`Priority: ${priority}`}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(item);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.7rem',
              padding: '2px 4px'
            }}
            title="Edit"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#EF4444',
              cursor: 'pointer',
              fontSize: '0.7rem',
              padding: '2px 4px'
            }}
            title="Delete"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Title */}
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        {getWorkItemId(item)}
      </div>

      {/* Progress Bar (for tasks) */}
      {item.workItemType === 'Task' && projectedHours > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px' }}>
            <div style={{
              width: `${Math.min(100, progress)}%`,
              height: '100%',
              background: getPriorityColor(priority),
              borderRadius: '2px',
              transition: 'width 0.3s'
            }} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {resourceId && (
            <>
              <div
                title={getEmployeeName(resourceId, employees)}
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: 'var(--bg-hover)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.55rem',
                  color: 'var(--pinnacle-teal)',
                  fontWeight: 'bold'
                }}
              >
                {getInitials(getEmployeeName(resourceId, employees))}
              </div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                {getEmployeeName(resourceId, employees).split(' ')[0]}
              </span>
            </>
          )}
        </div>
        {item.workItemType === 'Task' && projectedHours > 0 && (
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            <span style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>{actualHours || 0}</span>
            {' / '}
            {projectedHours} hrs
          </div>
        )}
      </div>
    </div>
  );
}
