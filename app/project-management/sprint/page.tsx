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

const viewConfig: Record<MainView, { label: string; icon: string; description: string }> = {
  boards: { 
    label: 'Kanban Board', 
    icon: '📋',
    description: 'Visual workflow with drag-and-drop cards' 
  },
  backlog: { 
    label: 'Backlog', 
    icon: '📝',
    description: 'Prioritize and organize work items' 
  },
  sprint: { 
    label: 'Taskboard', 
    icon: '🎯',
    description: 'Current sprint tasks and progress' 
  },
  burndown: { 
    label: 'Burndown', 
    icon: '📉',
    description: 'Sprint progress visualization' 
  },
  velocity: { 
    label: 'Velocity', 
    icon: '📊',
    description: 'Team capacity over time' 
  }
};

export default function SprintPlanningPage() {
  const [mainView, setMainView] = useState<MainView>('boards');

  return (
    <div className="page-panel full-height-page project-management-page" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ 
        padding: '1.25rem 1.5rem', 
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ 
              fontSize: '1.5rem', 
              fontWeight: 700, 
              color: 'var(--text-primary)', 
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              Sprint Planning
            </h1>
            <p style={{ marginTop: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Manage work items, sprints, and track team progress
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs - Clean card-style tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        padding: '1rem 1.5rem',
        background: 'rgba(0,0,0,0.15)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
        overflowX: 'auto'
      }}>
        {(Object.keys(viewConfig) as MainView[]).map(viewType => {
          const config = viewConfig[viewType];
          const isActive = mainView === viewType;
          
          return (
            <button
              key={viewType}
              onClick={() => setMainView(viewType)}
              title={config.description}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 1rem',
                background: isActive ? 'var(--pinnacle-teal)' : 'rgba(255,255,255,0.04)',
                border: isActive ? 'none' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                color: isActive ? '#000' : 'var(--text-secondary)',
                fontSize: '0.85rem',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.15)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)';
                }
              }}
            >
              <span style={{ fontSize: '1rem' }}>{config.icon}</span>
              {config.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {mainView === 'boards' && <BoardsView />}
        {mainView === 'backlog' && <BacklogView />}
        {mainView === 'sprint' && <SprintView />}
        {mainView === 'burndown' && (
          <div style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
            <div style={{ 
              background: 'var(--bg-card)', 
              borderRadius: '12px', 
              border: '1px solid var(--border-color)',
              padding: '1.5rem',
              height: '100%',
              minHeight: '400px'
            }}>
              <h3 style={{ 
                fontSize: '1rem', 
                fontWeight: 600, 
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                📉 Sprint Burndown
              </h3>
              <div style={{ height: 'calc(100% - 40px)' }}>
                <SprintBurndownChart unit="hours" height="100%" />
              </div>
            </div>
          </div>
        )}
        {mainView === 'velocity' && (
          <div style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
            <div style={{ 
              background: 'var(--bg-card)', 
              borderRadius: '12px', 
              border: '1px solid var(--border-color)',
              padding: '1.5rem',
              height: '100%',
              minHeight: '400px'
            }}>
              <h3 style={{ 
                fontSize: '1rem', 
                fontWeight: 600, 
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                📊 Team Velocity
              </h3>
              <div style={{ height: 'calc(100% - 40px)' }}>
                <VelocityChart unit="points" height="100%" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
