'use client';

/**
 * @fileoverview Unified Sprint Planning Page - ADO-style with Boards, Backlog, Sprint, Burndown, Velocity
 * 
 * Integrated page combining:
 * - Boards: Kanban board with all work item types
 * - Backlog: Hierarchical backlog management
 * - Sprint: Sprint planning with backlog, taskboard, and kanban views
 * - Burndown: Sprint burndown chart with ideal vs actual trend
 * - Velocity: Team velocity tracking across sprints
 * 
 * All features work standalone without Azure DevOps connection.
 * 
 * @module app/project-management/sprint/page
 */

import React, { useState } from 'react';

// Import components from other pages
import BoardsView from './boards-view';
import BacklogView from './backlog-view';
import SprintView from './sprint-view';
import SprintBurndownChart from '@/components/charts/SprintBurndownChart';
import VelocityChart from '@/components/charts/VelocityChart';

type MainView = 'boards' | 'backlog' | 'sprint' | 'burndown' | 'velocity';

const viewLabels: Record<MainView, { label: string; title: string }> = {
  boards: { 
    label: 'Boards', 
    title: 'Kanban board for all work item types (Epic, Feature, User Story, Task, Bug).' 
  },
  backlog: { 
    label: 'Backlog', 
    title: 'Backlog of epics, features, and user stories. Prioritize and assign to sprints.' 
  },
  sprint: { 
    label: 'Taskboard', 
    title: 'Sprint taskboard with work items and tasks for the current sprint.' 
  },
  burndown: { 
    label: 'Burndown', 
    title: 'Sprint burndown chart showing remaining work vs ideal trend.' 
  },
  velocity: { 
    label: 'Velocity', 
    title: 'Team velocity tracking - planned vs completed across sprints.' 
  }
};

export default function SprintPlanningPage() {
  const [mainView, setMainView] = useState<MainView>('boards');

  return (
    <div className="page-panel full-height-page project-management-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sprint Planning</h1>
          <p style={{ marginTop: '4px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            ADO-style sprint management with boards, backlog, and analytics
          </p>
        </div>
      </div>

      {/* Main View Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.25rem',
        padding: '0 1rem',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: '1rem'
      }}>
        {(Object.keys(viewLabels) as MainView[]).map(viewType => (
          <button
            key={viewType}
            onClick={() => setMainView(viewType)}
            title={viewLabels[viewType].title}
            style={{
              padding: '0.75rem 1.25rem',
              background: mainView === viewType ? 'rgba(64, 224, 208, 0.1)' : 'none',
              border: 'none',
              borderBottom: mainView === viewType ? '2px solid var(--pinnacle-teal)' : '2px solid transparent',
              color: mainView === viewType ? 'var(--pinnacle-teal)' : 'var(--text-muted)',
              fontSize: '0.85rem',
              fontWeight: mainView === viewType ? 600 : 400,
              cursor: 'pointer',
              borderRadius: mainView === viewType ? '6px 6px 0 0' : '0',
              transition: 'all 0.15s'
            }}
          >
            {viewLabels[viewType].label}
          </button>
        ))}
      </div>

      {/* Render Selected View */}
      {mainView === 'boards' && <BoardsView />}
      {mainView === 'backlog' && <BacklogView />}
      {mainView === 'sprint' && <SprintView />}
      {mainView === 'burndown' && (
        <div style={{ padding: '0 1rem', height: 'calc(100% - 120px)' }}>
          <SprintBurndownChart unit="hours" height="100%" />
        </div>
      )}
      {mainView === 'velocity' && (
        <div style={{ padding: '0 1rem', height: 'calc(100% - 120px)' }}>
          <VelocityChart unit="points" height="100%" />
        </div>
      )}
    </div>
  );
}
