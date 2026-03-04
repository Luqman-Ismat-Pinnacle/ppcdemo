'use client';

/**
 * @fileoverview Sprint Create/Edit Modal Component
 * 
 * Provides a modal for creating and editing sprints
 * 
 * @module app/project-management/sprint/components/SprintModal
 */

import React, { useState, useEffect } from 'react';
import type { Sprint, ProjectTable } from '@/types/data';
import { generateId } from '@/lib/database-schema';

interface SprintModalProps {
  isOpen: boolean;
  sprint?: Sprint | null;
  onSave: (sprint: Sprint) => void;
  onClose: () => void;
  projects?: ProjectTable[];
}

export default function SprintModal({
  isOpen,
  sprint,
  onSave,
  onClose,
  projects = []
}: SprintModalProps) {
  const [formData, setFormData] = useState<Partial<Sprint>>({
    name: '',
    projectId: '',
    startDate: '',
    endDate: '',
    status: 'Planning'
  });

  useEffect(() => {
    if (sprint) {
      // Edit mode - populate form with existing data
      setFormData({
        id: sprint.id,
        sprintId: sprint.sprintId,
        name: sprint.name,
        projectId: sprint.projectId,
        startDate: sprint.startDate || '',
        endDate: sprint.endDate || '',
        status: sprint.status || 'Planning',
        createdAt: sprint.createdAt,
        updatedAt: sprint.updatedAt
      });
    } else {
      // Create mode - initialize with defaults
      const now = new Date().toISOString();
      const sprintId = generateId('SPR');
      setFormData({
        id: sprintId,
        sprintId: sprintId,
        name: '',
        projectId: projects[0]?.projectId || '',
        startDate: '',
        endDate: '',
        status: 'Planning',
        createdAt: now,
        updatedAt: now
      });
    }
  }, [sprint, projects]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.projectId) {
      alert('Please fill in all required fields');
      return;
    }

    const savedSprint: Sprint = {
      id: formData.id || formData.sprintId || '',
      sprintId: formData.sprintId || formData.id || '',
      name: formData.name,
      projectId: formData.projectId,
      startDate: formData.startDate || undefined,
      endDate: formData.endDate || undefined,
      status: formData.status || 'Planning',
      createdAt: formData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSave(savedSprint);
  };

  if (!isOpen) return null;

  return (
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
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
            {sprint ? 'Edit Sprint' : 'Create Sprint'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              padding: '4px 8px',
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Sprint Name */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500 }}>
                Sprint Name <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '0.875rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                }}
                placeholder="Sprint 1"
              />
            </div>

            {/* Project */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500 }}>
                Project <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <select
                value={formData.projectId || ''}
                onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '0.875rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                <option value="">Select Project</option>
                {projects.map((project) => (
                  <option key={project.projectId} value={project.projectId}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500 }}>
                Start Date
              </label>
              <input
                type="date"
                value={formData.startDate || ''}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '0.875rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* End Date */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500 }}>
                End Date
              </label>
              <input
                type="date"
                value={formData.endDate || ''}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '0.875rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* Status */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500 }}>
                Status
              </label>
              <select
                value={formData.status || 'Planning'}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '0.875rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                <option value="Planning">Planning</option>
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                background: 'var(--pinnacle-teal)',
                color: '#000',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {sprint ? 'Update' : 'Create'} Sprint
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
