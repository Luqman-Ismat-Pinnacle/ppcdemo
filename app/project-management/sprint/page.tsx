'use client';

/**
 * @fileoverview Unified Sprint Planning Page - Boards, Backlog, and Sprint Management
 * 
 * Integrated page combining:
 * - Boards: Kanban board with all work item types
 * - Backlog: Hierarchical backlog management
 * - Sprint: Sprint planning with backlog, taskboard, capacity, and kanban views
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

type MainView = 'boards' | 'backlog' | 'sprint';

export default function SprintPlanningPage() {
  const [mainView, setMainView] = useState<MainView>('boards');

  return (
    <div className="page-panel full-height-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sprint Planning</h1>
        </div>
      </div>

      {/* Main View Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        padding: '0 1rem',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        marginBottom: '1rem'
      }}>
        {(['boards', 'backlog', 'sprint'] as MainView[]).map(viewType => (
          <button
            key={viewType}
            onClick={() => setMainView(viewType)}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'none',
              border: 'none',
              borderBottom: mainView === viewType ? '2px solid var(--pinnacle-teal)' : '2px solid transparent',
              color: mainView === viewType ? 'var(--pinnacle-teal)' : 'var(--text-muted)',
              fontSize: '0.85rem',
              fontWeight: mainView === viewType ? 600 : 400,
              cursor: 'pointer',
              textTransform: 'capitalize'
            }}
          >
            {viewType}
          </button>
        ))}
      </div>

      {/* Render Selected View */}
      {mainView === 'boards' && <BoardsView />}
      {mainView === 'backlog' && <BacklogView />}
      {mainView === 'sprint' && <SprintView />}
    </div>
  );
}
