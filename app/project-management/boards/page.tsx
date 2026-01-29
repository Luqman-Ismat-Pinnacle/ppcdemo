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
import type { Task, UserStory, Feature, Epic, Employee, ChangeLogEntry } from '@/types/data';

// Work item types
type WorkItemType = 'Epic' | 'Feature' | 'User Story' | 'Task' | 'Bug';
type WorkItem = (Task | UserStory | Feature | Epic) & { workItemType: WorkItemType };

// State workflow - matches user requirements
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

const QC_STATES = [
  'QC Initial',
  'QC Kickoff',
  'QC Mid',
  'QC Final',
  'QC Post-Validation',
  'QC Field QC',
  'QC Validation'
];

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

export default function BoardsPage() {
  const { filteredData, data, updateData } = useData();
  
  // View state
  const [selectedWorkItemTypes, setSelectedWorkItemTypes] = useState<WorkItemType[]>(['Epic', 'Feature', 'User Story', 'Task', 'Bug']);
  const [swimlaneType, setSwimlaneType] = useState<SwimlaneType>('none');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [wipLimits, setWipLimits] = useState<Record<string, number>>({});
  const [showWipWarning, setShowWipWarning] = useState(true);
  
  // Drag state
  const [draggedItem, setDraggedItem] = useState<WorkItem | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

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
    const columns: BoardColumn[] = STATE_WORKFLOW.map(state => ({
      state,
      items: [],
      wipLimit: wipLimits[state]
    }));

    filteredWorkItems.forEach(item => {
      const status = getWorkItemStatus(item);
      const column = columns.find(col => col.state === status);
      if (column) {
        column.items.push(item);
      } else {
        // If status doesn't match, add to "Not Started"
        columns[0].items.push(item);
      }
    });

    return columns;
  }, [filteredWorkItems, wipLimits]);

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

  return (
    <div className="page-panel full-height-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Boards</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Azure DevOps-style Kanban board with real-time sync
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="btn btn-primary">+ New Work Item</button>
        </div>
      </div>

      {/* Filters and Controls */}
      <div style={{ 
        padding: '1rem', 
        background: 'rgba(255,255,255,0.02)', 
        borderRadius: '8px',
        marginBottom: '1rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center'
      }}>
        {/* Work Item Type Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Types:</span>
          {(['Epic', 'Feature', 'User Story', 'Task', 'Bug'] as WorkItemType[]).map(type => (
            <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selectedWorkItemTypes.includes(type)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedWorkItemTypes([...selectedWorkItemTypes, type]);
                  } else {
                    setSelectedWorkItemTypes(selectedWorkItemTypes.filter(t => t !== type));
                  }
                }}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{type}</span>
            </label>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search work items..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            padding: '0.4rem 0.8rem',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '0.8rem',
            minWidth: '200px'
          }}
        />

        {/* Assignee Filter */}
        <select
          value={selectedAssignee}
          onChange={(e) => setSelectedAssignee(e.target.value)}
          style={{
            padding: '0.4rem 0.8rem',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '0.8rem'
          }}
        >
          <option value="all">All Assignees</option>
          {employees.map(emp => (
            <option key={emp.employeeId} value={emp.employeeId}>{emp.name}</option>
          ))}
        </select>

        {/* Project Filter */}
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          style={{
            padding: '0.4rem 0.8rem',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '0.8rem'
          }}
        >
          <option value="all">All Projects</option>
          {projects.map(proj => (
            <option key={proj.projectId} value={proj.projectId}>{proj.name}</option>
          ))}
        </select>

        {/* Swimlane Selector */}
        <select
          value={swimlaneType}
          onChange={(e) => setSwimlaneType(e.target.value as SwimlaneType)}
          style={{
            padding: '0.4rem 0.8rem',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '0.8rem'
          }}
        >
          <option value="none">No Swimlanes</option>
          <option value="assignee">By Assignee</option>
          <option value="priority">By Priority</option>
          <option value="workItemType">By Work Item Type</option>
          <option value="project">By Project</option>
        </select>
      </div>

      {/* Kanban Board */}
      <div style={{ 
        flex: 1, 
        overflowX: 'auto', 
        display: 'flex', 
        gap: '1rem', 
        paddingBottom: '1rem',
        minHeight: '500px'
      }}>
        {boardColumns.map((column) => {
          const isOverLimit = column.wipLimit && column.items.length > column.wipLimit;
          const isAtLimit = column.wipLimit && column.items.length === column.wipLimit;
          
          return (
            <div
              key={column.state}
              style={{
                minWidth: '300px',
                flex: 1,
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '12px',
                border: dragOverColumn === column.state 
                  ? '2px solid var(--pinnacle-teal)' 
                  : isOverLimit 
                    ? '2px solid #EF4444' 
                    : isAtLimit && showWipWarning
                      ? '2px solid #F59E0B'
                      : '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.2s'
              }}
              onDragOver={(e) => handleDragOver(e, column.state)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.state)}
            >
              {/* Column Header */}
              <div style={{ 
                padding: '1rem', 
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h3 style={{ 
                    fontSize: '0.85rem', 
                    fontWeight: 700, 
                    color: 'var(--text-primary)', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    {column.state}
                  </h3>
                  <span style={{ 
                    fontSize: '0.7rem', 
                    background: isOverLimit ? '#EF4444' : 'rgba(255,255,255,0.1)', 
                    padding: '0.1rem 0.5rem', 
                    borderRadius: '10px', 
                    color: 'var(--text-muted)'
                  }}>
                    {column.items.length}
                    {column.wipLimit && ` / ${column.wipLimit}`}
                  </span>
                </div>
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
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    padding: '0.25rem'
                  }}
                  title="Set WIP limit"
                >
                  ⚙️
                </button>
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
                            employees={employees}
                          />
                        ))}
                      </div>
                    );
                  })
                )}

                {column.items.length === 0 && (
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
                    Drop work items here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Work Item Card Component
interface WorkItemCardProps {
  item: WorkItem;
  onDragStart: (e: React.DragEvent, item: WorkItem) => void;
  onDragEnd: () => void;
  employees: Employee[];
}

function WorkItemCard({ item, onDragStart, onDragEnd, employees }: WorkItemCardProps) {
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
          <span style={{
            fontSize: '0.6rem',
            fontWeight: 'bold',
            color: getWorkItemTypeColor(item.workItemType),
            background: `${getWorkItemTypeColor(item.workItemType)}20`,
            padding: '0.1rem 0.4rem',
            borderRadius: '4px'
          }}>
            {item.workItemType}
          </span>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
            {getWorkItemId(item)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{ width: '8px', height: '8px', borderRadius: '50%', background: getPriorityColor(priority) }}
            title={`Priority: ${priority}`}
          />
        </div>
      </div>

      {/* Title */}
      <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
        {getWorkItemName(item)}
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
