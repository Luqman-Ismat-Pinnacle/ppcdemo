'use client';

/**
 * @fileoverview Work Item Create/Edit Modal Component
 * 
 * Provides a comprehensive modal for creating and editing work items:
 * - Epic, Feature, User Story, Task, Bug
 * 
 * @module app/project-management/sprint/components/WorkItemModal
 */

import React, { useState, useEffect } from 'react';
import type { Epic, Feature, UserStory, Task, Employee, ProjectTable, Sprint } from '@/types/data';
import { generateId, ID_PREFIXES } from '@/lib/database-schema';

type WorkItemType = 'Epic' | 'Feature' | 'User Story' | 'Task' | 'Bug';

interface WorkItemModalProps {
  isOpen: boolean;
  type: WorkItemType;
  item?: Epic | Feature | UserStory | Task | null;
  onSave: (item: any) => void;
  onClose: () => void;
  // Context data
  epics?: Epic[];
  features?: Feature[];
  projects?: ProjectTable[];
  employees?: Employee[];
  sprints?: Sprint[];
}

export default function WorkItemModal({
  isOpen,
  type,
  item,
  onSave,
  onClose,
  epics = [],
  features = [],
  projects = [],
  employees = [],
  sprints = []
}: WorkItemModalProps) {
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (item) {
      // Edit mode - populate form with existing data
      setFormData(item);
    } else {
      // Create mode - initialize with defaults
      const now = new Date().toISOString();
      const defaults: any = {
        name: '',
        description: '',
        status: 'Not Started',
        createdAt: now,
        updatedAt: now,
      };

      switch (type) {
        case 'Epic':
          defaults.id = generateId('EPC');
          defaults.epicId = defaults.id;
          defaults.projectId = projects[0]?.projectId || '';
          break;
        case 'Feature':
          defaults.id = generateId('FTR');
          defaults.featureId = defaults.id;
          defaults.epicId = epics[0]?.id || '';
          break;
        case 'User Story':
          defaults.id = generateId('USR');
          defaults.userStoryId = defaults.id;
          defaults.featureId = features[0]?.id || '';
          defaults.acceptanceCriteria = '';
          break;
        case 'Task':
          defaults.id = generateId('TSK');
          defaults.taskId = defaults.id;
          defaults.taskName = '';
          defaults.projectId = projects[0]?.projectId || '';
          defaults.phaseId = '';
          defaults.resourceId = '';
          defaults.employeeId = '';
          defaults.projectedHours = 0;
          defaults.actualHours = 0;
          defaults.percentComplete = 0;
          defaults.priority = 'medium';
          defaults.userStoryId = '';
          defaults.sprintId = '';
          break;
        case 'Bug':
          defaults.id = generateId('BUG');
          defaults.taskId = defaults.id;
          defaults.taskName = '';
          defaults.projectId = projects[0]?.projectId || '';
          defaults.phaseId = '';
          defaults.resourceId = '';
          defaults.employeeId = '';
          defaults.projectedHours = 0;
          defaults.actualHours = 0;
          defaults.percentComplete = 0;
          defaults.priority = 'high';
          defaults.userStoryId = '';
          defaults.sprintId = '';
          defaults.isBug = true;
          break;
      }

      setFormData(defaults);
    }
  }, [item, type, epics, features, projects]);

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = { ...formData, updatedAt: new Date().toISOString() };
    onSave(updated);
    onClose();
  };

  if (!isOpen) return null;

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
        maxWidth: '700px',
        maxHeight: '90vh',
        overflow: 'auto',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {item ? 'Edit' : 'Create'} {type}
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
          {/* ID (read-only) */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              {type === 'Epic' ? 'Epic ID' : type === 'Feature' ? 'Feature ID' : type === 'User Story' ? 'User Story ID' : 'Task ID'}
            </label>
            <input
              type="text"
              value={formData.epicId || formData.featureId || formData.userStoryId || formData.taskId || formData.id || ''}
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

          {/* Name/Title */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              {type === 'Task' || type === 'Bug' ? 'Task Name' : 'Name'} *
            </label>
            <input
              type="text"
              value={formData.name || formData.taskName || ''}
              onChange={(e) => handleChange(type === 'Task' || type === 'Bug' ? 'taskName' : 'name', e.target.value)}
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

          {/* Description */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Description
            </label>
            <textarea
              value={formData.description || formData.taskDescription || ''}
              onChange={(e) => handleChange(type === 'Task' || type === 'Bug' ? 'taskDescription' : 'description', e.target.value)}
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

          {/* Two-column layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            {/* Status */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Status
              </label>
              <select
                value={formData.status || 'Not Started'}
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
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
                <option value="Roadblock">Roadblock</option>
                <option value="QC Initial">QC Initial</option>
                <option value="QC Kickoff">QC Kickoff</option>
                <option value="QC Mid">QC Mid</option>
                <option value="QC Final">QC Final</option>
                <option value="QC Post-Validation">QC Post-Validation</option>
                <option value="QC Field QC">QC Field QC</option>
                <option value="QC Validation">QC Validation</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            {/* Priority (for Tasks and Bugs) */}
            {(type === 'Task' || type === 'Bug') && (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Priority
                </label>
                <select
                  value={formData.priority || 'medium'}
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
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            )}

            {/* Project (for Epic, Task, Bug) */}
            {(type === 'Epic' || type === 'Task' || type === 'Bug') && (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Project *
                </label>
                <select
                  value={formData.projectId || ''}
                  onChange={(e) => handleChange('projectId', e.target.value)}
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
                >
                  <option value="">Select Project</option>
                  {projects.map(proj => (
                    <option key={proj.projectId} value={proj.projectId}>{proj.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Epic (for Feature) */}
            {type === 'Feature' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Epic *
                </label>
                <select
                  value={formData.epicId || ''}
                  onChange={(e) => handleChange('epicId', e.target.value)}
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
                >
                  <option value="">Select Epic</option>
                  {epics.map(epic => (
                    <option key={epic.id} value={epic.id}>{epic.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Feature (for User Story) */}
            {type === 'User Story' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Feature *
                </label>
                <select
                  value={formData.featureId || ''}
                  onChange={(e) => handleChange('featureId', e.target.value)}
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
                >
                  <option value="">Select Feature</option>
                  {features.map(feature => (
                    <option key={feature.id} value={feature.id}>{feature.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* User Story (for Task) */}
            {(type === 'Task' || type === 'Bug') && (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  User Story
                </label>
                <select
                  value={formData.userStoryId || ''}
                  onChange={(e) => handleChange('userStoryId', e.target.value || null)}
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
                  <option value="">No User Story</option>
                  {/* User stories will be filtered by project if needed */}
                </select>
              </div>
            )}

            {/* Sprint (for User Story, Task, Bug) */}
            {(type === 'User Story' || type === 'Task' || type === 'Bug') && (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Sprint
                </label>
                <select
                  value={formData.sprintId || ''}
                  onChange={(e) => handleChange('sprintId', e.target.value || null)}
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
                  <option value="">Backlog</option>
                  {sprints.map(sprint => (
                    <option key={sprint.id || sprint.sprintId} value={sprint.id || sprint.sprintId}>
                      {sprint.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Assigned Resource (for Task, Bug) */}
            {(type === 'Task' || type === 'Bug') && (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Assigned To
                </label>
                <select
                  value={formData.employeeId || formData.resourceId || ''}
                  onChange={(e) => {
                    handleChange('employeeId', e.target.value);
                    handleChange('resourceId', e.target.value);
                  }}
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
            )}
          </div>

          {/* Hours (for Task, Bug) */}
          {(type === 'Task' || type === 'Bug') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Projected Hours
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={formData.projectedHours || 0}
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
                  value={formData.actualHours || 0}
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
                  value={formData.percentComplete || 0}
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
          )}

          {/* Acceptance Criteria (for User Story) */}
          {type === 'User Story' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Acceptance Criteria
              </label>
              <textarea
                value={formData.acceptanceCriteria || ''}
                onChange={(e) => handleChange('acceptanceCriteria', e.target.value)}
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
                placeholder="Describe the acceptance criteria for this user story..."
              />
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
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
              {item ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
