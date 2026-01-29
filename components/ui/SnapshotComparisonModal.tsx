'use client';

/**
 * @fileoverview Snapshot Comparison Modal
 * 
 * Enhanced modal for comparing visual snapshots with:
 * - Smooth animations
 * - Overlay mode as default
 * - Proper chart rendering with filters
 * - Responsive side-by-side layout
 * - Minimal, modern design matching website theme
 */

import React, { useState, useMemo, useEffect } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { useData } from '@/lib/data-context';

interface SnapshotComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  visualId: string;
  visualTitle: string;
  visualType: 'chart' | 'table';
  currentData: any; // Current chart option or table data
  onRenderChart?: (container: HTMLDivElement, option: EChartsOption) => echarts.ECharts | null;
  filters?: any; // Optional filters to apply
}

type ComparisonMode = 'overlay' | 'side-by-side';

export default function SnapshotComparisonModal({
  isOpen,
  onClose,
  visualId,
  visualTitle,
  visualType,
  currentData,
  onRenderChart,
  filters,
}: SnapshotComparisonModalProps) {
  const { filteredData, updateData } = useData();
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('overlay');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [currentChartInstance, setCurrentChartInstance] = useState<echarts.ECharts | null>(null);
  const [snapshotChartInstance, setSnapshotChartInstance] = useState<echarts.ECharts | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Combine and normalize snapshots from both sources (VisualSnapshots and Global Snapshots)
  const snapshots = useMemo(() => {
    const visualSnaps = (filteredData.visualSnapshots || [])
      .filter(s => s.visualId === visualId)
      .map(s => ({
        id: s.id,
        name: s.snapshotName,
        date: s.createdAt,
        type: 'Visual Snapshot',
        data: s.data,
        source: 'visual'
      }));

    // Map global snapshots to this visual if applicable
    const globalSnaps = (filteredData.snapshots || [])
      .filter(s => {
        // Access view from metadata (new format) or fallback
        const view = s.snapshotData.metadata?.view;

        // Filter logic: does this snapshot contain data for the current visual?
        if (!view || view === 'all') return true;

        // Map visualId to view types
        if (visualId === 'wbs-gantt-chart' && view.includes('gantt')) return true;
        if (visualId === 'cost-dashboard' && view === 'cost') return true;
        if (visualId === 'milestone-chart' && view.includes('milestone')) return true;

        // Also check if view starts with the relevant section
        if (view.startsWith('project-controls/') || view.startsWith('insights/')) return true;

        return false;
      })
      .map(s => {
        let data = null;
        // Extract relevant data part based on visualId
        if (visualId === 'wbs-gantt-chart') {
          // For Gantt, we might need WBS Items, but the chart is custom. 
          // If the visualType is 'chart', we check charts.
          // Usually Gantt isn't echarts, but if it was... 
          // This modal seems designed for ECharts or Table.
          // If visualType is 'table', we use wbsData.
          if (visualType === 'table') data = s.snapshotData.wbsData?.items || [];
        } else if (visualId.includes('cost') || visualId.includes('budget')) {
          if (visualType === 'chart') data = s.snapshotData.charts.sCurve; // Default assumption
        }

        // Fallback or specific mapping
        if (!data && s.snapshotData.charts) {
          // Try to find a matching chart key? 
          // For now, if we can't map it, we skip or pass null (which will show 'No Data')
        }

        return {
          id: s.id,
          name: s.versionName,
          date: s.snapshotDate, // Use snapshot date, not created at
          type: `${s.snapshotType} (${s.snapshotData.metadata?.view || 'All'})`,
          data: data, // extracted data
          source: 'global'
        };
      });

    return [...visualSnaps, ...globalSnaps]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [visualId, isOpen, filteredData.visualSnapshots, filteredData.snapshots, visualType]);

  const selectedSnapshot = useMemo(() => {
    return selectedSnapshotId
      ? snapshots.find(s => s.id === selectedSnapshotId)
      : null;
  }, [selectedSnapshotId, snapshots]);

  // Animation on open
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Initialize chart for current data
  useEffect(() => {
    if (!isOpen || visualType !== 'chart' || !onRenderChart) return;

    const container = document.getElementById('current-chart-container') as HTMLDivElement | null;
    if (container && currentData) {
      const chart = onRenderChart(container, currentData);
      setCurrentChartInstance(chart);

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        chart?.resize();
      });
      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();
        if (chart) chart.dispose();
      };
    }
  }, [isOpen, currentData, visualType, onRenderChart, comparisonMode]);

  // Initialize chart for snapshot data (side-by-side mode)
  useEffect(() => {
    if (!isOpen || visualType !== 'chart' || !selectedSnapshot || !onRenderChart || comparisonMode !== 'side-by-side') {
      if (snapshotChartInstance) {
        snapshotChartInstance.dispose();
        setSnapshotChartInstance(null);
      }
      return;
    }

    const container = document.getElementById('snapshot-chart-container') as HTMLDivElement | null;
    if (container && selectedSnapshot.data && onRenderChart) {
      const chart = onRenderChart(container, selectedSnapshot.data as EChartsOption);
      setSnapshotChartInstance(chart);

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        chart?.resize();
      });
      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();
        if (chart) chart.dispose();
      };
    }
  }, [isOpen, selectedSnapshot, visualType, onRenderChart, comparisonMode]);

  // Handle overlay mode for charts
  useEffect(() => {
    if (!isOpen || visualType !== 'chart' || comparisonMode !== 'overlay' || !selectedSnapshot || !currentChartInstance) {
      return;
    }

    if (currentChartInstance && selectedSnapshot.data && typeof selectedSnapshot.data === 'object') {
      const snapshotData = selectedSnapshot.data as EChartsOption;
      const currentDataOption = currentData as EChartsOption;
      // Merge options for overlay with distinct styling
      const currentSeriesArray = Array.isArray(currentDataOption.series)
        ? currentDataOption.series
        : (currentDataOption.series ? [currentDataOption.series] : []);
      const snapshotSeriesArray = Array.isArray(snapshotData.series)
        ? snapshotData.series
        : (snapshotData.series ? [snapshotData.series] : []);

      const mergedOption: EChartsOption = {
        ...currentDataOption,
        series: [
          ...currentSeriesArray.map((s: any) => ({
            ...s,
            name: `${s.name || 'Current'} (Current)`,
            itemStyle: {
              ...s.itemStyle,
              opacity: 0.8,
              borderWidth: 2,
              borderColor: s.itemStyle?.color || '#40E0D0',
            },
            lineStyle: s.lineStyle ? {
              ...s.lineStyle,
              width: 3,
              type: 'solid',
            } : undefined,
          })),
          ...snapshotSeriesArray.map((s: any) => ({
            ...s,
            name: `${s.name || 'Snapshot'} (Snapshot)`,
            itemStyle: {
              ...s.itemStyle,
              opacity: 0.6,
              borderWidth: 2,
              borderColor: s.itemStyle?.color || '#FF8C00',
            },
            lineStyle: s.lineStyle ? {
              ...s.lineStyle,
              width: 3,
              type: 'dashed',
            } : undefined,
          })),
        ],
      };
      currentChartInstance.setOption(mergedOption, true);
    }
  }, [isOpen, comparisonMode, selectedSnapshot, currentChartInstance, currentData, visualType]);

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (confirm('Are you sure you want to delete this snapshot?')) {
      try {
        const response = await fetch('/api/data/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataKey: 'visualSnapshots',
            records: [snapshotId],
            operation: 'delete'
          }),
        });

        const result = await response.json();
        if (result.success) {
          const updatedSnapshots = (filteredData.visualSnapshots || []).filter(s => s.id !== snapshotId);
          updateData({ visualSnapshots: updatedSnapshots });

          if (selectedSnapshotId === snapshotId) {
            setSelectedSnapshotId(null);
          }
        } else {
          alert('Failed to delete snapshot: ' + (result.error || 'Unknown error'));
        }
      } catch (err) {
        console.error('Error deleting snapshot:', err);
      }
    }
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
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        animation: isAnimating ? 'fadeIn 0.3s ease-out' : 'none',
      }}
      onClick={onClose}
    >
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>

      <div
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '95vw',
          maxHeight: '95vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
          animation: isAnimating ? 'slideUp 0.3s ease-out' : 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px 28px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)',
          }}
        >
          <div>
            <h2 style={{
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {visualTitle}
            </h2>
            <p style={{
              margin: '8px 0 0 0',
              fontSize: '0.875rem',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <span style={{
                padding: '2px 8px',
                background: 'var(--bg-tertiary)',
                borderRadius: '4px',
                fontSize: '0.75rem',
              }}>
                {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}
              </span>
              {filters && Object.keys(filters).length > 0 && (
                <span style={{
                  padding: '2px 8px',
                  background: 'rgba(64, 224, 208, 0.2)',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  color: 'var(--pinnacle-teal)',
                }}>
                  Filters Active
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              background: 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              fontSize: '1.5rem',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-tertiary)';
              e.currentTarget.style.color = 'var(--pinnacle-teal)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
          >
            ×
          </button>
        </div>

        {/* Controls */}
        <div
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            gap: '20px',
            alignItems: 'center',
            flexWrap: 'wrap',
            background: 'var(--bg-secondary)',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Mode:
            </label>
            <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '3px' }}>
              <button
                onClick={() => setComparisonMode('overlay')}
                style={{
                  padding: '8px 16px',
                  background: comparisonMode === 'overlay' ? 'var(--pinnacle-teal)' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  color: comparisonMode === 'overlay' ? '#000' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
              >
                Overlay
              </button>
              <button
                onClick={() => setComparisonMode('side-by-side')}
                style={{
                  padding: '8px 16px',
                  background: comparisonMode === 'side-by-side' ? 'var(--pinnacle-teal)' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  color: comparisonMode === 'side-by-side' ? '#000' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
              >
                Side by Side
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, minWidth: '300px' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Compare with:
            </label>
            <select
              value={selectedSnapshotId || ''}
              onChange={(e) => setSelectedSnapshotId(e.target.value || null)}
              style={{
                flex: 1,
                maxWidth: '400px',
                padding: '8px 12px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--pinnacle-teal)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(64, 224, 208, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <option value="">Select snapshot...</option>
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {snapshot.name} ({new Date(snapshot.date).toLocaleDateString()}) - {snapshot.type}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '28px',
            background: 'var(--bg-primary)',
          }}
        >
          {visualType === 'chart' ? (
            <div
              style={{
                display: comparisonMode === 'side-by-side' ? 'grid' : 'block',
                gridTemplateColumns: comparisonMode === 'side-by-side' ? '1fr 1fr' : '1fr',
                gap: comparisonMode === 'side-by-side' ? '32px' : '0',
                height: comparisonMode === 'overlay' ? 'calc(95vh - 280px)' : 'auto',
                minHeight: comparisonMode === 'overlay' ? '600px' : '500px',
              }}
            >
              <div style={{
                position: 'relative',
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid var(--border-color)',
                height: comparisonMode === 'overlay' ? '100%' : 'auto',
                minHeight: comparisonMode === 'overlay' ? '600px' : '500px',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                  paddingBottom: '12px',
                  borderBottom: '1px solid var(--border-color)',
                }}>
                  <h3 style={{
                    margin: 0,
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--pinnacle-teal)',
                    }} />
                    Current
                  </h3>
                </div>
                <div
                  id="current-chart-container"
                  style={{
                    width: '100%',
                    height: comparisonMode === 'overlay' ? 'calc(100% - 60px)' : '500px',
                    minHeight: comparisonMode === 'overlay' ? '600px' : '500px',
                  }}
                />
              </div>
              {selectedSnapshot && comparisonMode === 'side-by-side' && (
                <div style={{
                  position: 'relative',
                  background: 'var(--bg-secondary)',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid var(--border-color)',
                  height: 'auto',
                  minHeight: '500px',
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid var(--border-color)',
                  }}>
                    <h3 style={{
                      margin: 0,
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#FF8C00',
                      }} />
                      {selectedSnapshot.name}
                    </h3>
                    <button
                      onClick={() => handleDeleteSnapshot(selectedSnapshot.id)}
                      style={{
                        padding: '6px 12px',
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                        e.currentTarget.style.borderColor = '#ef4444';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  <div
                    id="snapshot-chart-container"
                    style={{
                      width: '100%',
                      height: '500px',
                      minHeight: '500px',
                    }}
                  />
                </div>
              )}
              {selectedSnapshot && comparisonMode === 'overlay' && (
                <div style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 16px',
                  background: 'rgba(0, 0, 0, 0.7)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  zIndex: 10,
                }}>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#FF8C00',
                  }} />
                  <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {selectedSnapshot.name}
                  </span>
                  <button
                    onClick={() => handleDeleteSnapshot(selectedSnapshot.id)}
                    style={{
                      padding: '4px 8px',
                      background: 'transparent',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '4px',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                display: comparisonMode === 'side-by-side' ? 'grid' : 'block',
                gridTemplateColumns: comparisonMode === 'side-by-side' ? '1fr 1fr' : '1fr',
                gap: comparisonMode === 'side-by-side' ? '32px' : '0',
              }}
            >
              <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid var(--border-color)',
              }}>
                <h3 style={{
                  margin: '0 0 16px 0',
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  paddingBottom: '12px',
                  borderBottom: '1px solid var(--border-color)',
                }}>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--pinnacle-teal)',
                  }} />
                  Current
                </h3>
                <div style={{ maxHeight: '600px', overflow: 'auto' }}>
                  {renderTable(currentData)}
                </div>
              </div>
              {selectedSnapshot && (
                <div style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid var(--border-color)',
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid var(--border-color)',
                  }}>
                    <h3 style={{
                      margin: 0,
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#FF8C00',
                      }} />
                      {selectedSnapshot.name}
                    </h3>
                    <button
                      onClick={() => handleDeleteSnapshot(selectedSnapshot.id)}
                      style={{
                        padding: '6px 12px',
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                        e.currentTarget.style.borderColor = '#ef4444';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  <div style={{ maxHeight: '600px', overflow: 'auto' }}>
                    {renderTable(Array.isArray(selectedSnapshot.data) ? selectedSnapshot.data : [])}
                  </div>
                </div>
              )}
            </div>
          )}

          {!selectedSnapshot && (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 40px',
                color: 'var(--text-muted)',
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
                border: '1px dashed var(--border-color)',
              }}
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ margin: '0 auto 16px', opacity: 0.5 }}>
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <div style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '8px' }}>
                Select a snapshot to compare
              </div>
              <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                Choose from {snapshots.length} available snapshot{snapshots.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function renderTable(data: any[]) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div style={{
        color: 'var(--text-muted)',
        textAlign: 'center',
        padding: '40px',
        fontSize: '0.875rem',
      }}>
        No data available
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.875rem',
      }}
    >
      <thead>
        <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
          {columns.map((col) => (
            <th
              key={col}
              style={{
                padding: '12px 8px',
                textAlign: 'left',
                fontWeight: 600,
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.slice(0, 100).map((row, idx) => (
          <tr
            key={idx}
            style={{
              borderBottom: '1px solid var(--border-color)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-tertiary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {columns.map((col) => (
              <td
                key={col}
                style={{
                  padding: '10px 8px',
                  color: 'var(--text-secondary)',
                }}
              >
                {String(row[col] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
