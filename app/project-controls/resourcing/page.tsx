'use client';

/**
 * @fileoverview Resourcing Page for PPC V3 Project Controls.
 * 
 * Enhanced resource allocation and utilization visualization with:
 * - Large, interactive resource heatmap with view toggles
 * - Resource Gantt chart with assignment timelines
 * - Expandable resource hierarchy
 * - Efficiency and utilization metrics
 * - Assigned vs Unassigned capacity views
 * - Employee vs Role grouping options
 * 
 * @module app/project-controls/resourcing/page
 */

import React, { useMemo, useRef, useState } from 'react';
import { useData } from '@/lib/data-context';
import ResourceHeatmapChart from '@/components/charts/ResourceHeatmapChart';

type GanttInterval = 'week' | 'month' | 'quarter' | 'year';
type GanttGroupBy = 'employee' | 'role';

export default function ResourcingPage() {
  const { filteredData } = useData();
  const data = filteredData;

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [ganttInterval, setGanttInterval] = useState<GanttInterval>('week');
  const [ganttGroupBy, setGanttGroupBy] = useState<GanttGroupBy>('employee');
  const containerRef = useRef<HTMLDivElement>(null);

  // Use actual current date
  const today = useMemo(() => new Date(), []);
  
  // Calculate date range from resource data
  const { projectStart, projectEnd } = useMemo(() => {
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    
    const findDateRange = (items: any[]) => {
      items.forEach(item => {
        if (item.startDate) {
          const start = new Date(item.startDate);
          if (!minDate || start < minDate) minDate = start;
        }
        if (item.endDate) {
          const end = new Date(item.endDate);
          if (!maxDate || end > maxDate) maxDate = end;
        }
        if (item.children) findDateRange(item.children);
      });
    };
    
    if (data.resourceGantt?.items) findDateRange(data.resourceGantt.items);
    
    // Default fallback if no dates found
    const defaultStart = new Date();
    defaultStart.setMonth(defaultStart.getMonth() - 3);
    const defaultEnd = new Date();
    defaultEnd.setMonth(defaultEnd.getMonth() + 6);
    
    return {
      projectStart: minDate || defaultStart,
      projectEnd: maxDate || defaultEnd
    };
  }, [data.resourceGantt?.items]);

  // Build "By Role" grouped data
  const groupedByRole = useMemo(() => {
    if (!data.resourceGantt?.items?.length) return [];
    
    const roleMap = new Map<string, any[]>();
    
    data.resourceGantt.items.forEach((item: any) => {
      const role = item.role || 'Unassigned';
      if (!roleMap.has(role)) {
        roleMap.set(role, []);
      }
      roleMap.get(role)!.push(item);
    });
    
    return Array.from(roleMap.entries()).map(([role, employees]) => ({
      id: `role-${role}`,
      name: role,
      type: 'role',
      role: role,
      startDate: employees.reduce((min: string, e: any) => (!min || e.startDate < min) ? e.startDate : min, ''),
      endDate: employees.reduce((max: string, e: any) => (!max || e.endDate > max) ? e.endDate : max, ''),
      utilization: Math.round(employees.reduce((sum: number, e: any) => sum + (e.utilization || 0), 0) / employees.length),
      efficiency: Math.round(employees.reduce((sum: number, e: any) => sum + (e.efficiency || 100), 0) / employees.length),
      children: employees
    }));
  }, [data.resourceGantt?.items]);

  // Get items based on group-by selection
  const ganttItems = useMemo(() => {
    if (ganttGroupBy === 'role') return groupedByRole;
    return data.resourceGantt?.items || [];
  }, [ganttGroupBy, groupedByRole, data.resourceGantt?.items]);

  // Flatten hierarchical resourcing data
  const flatResourceItems = useMemo(() => {
    const flatItems: any[] = [];
    const flatten = (items: any[], level = 0, parentId: string | null = null) => {
      items.forEach((item, index) => {
        const id = item.id || `${parentId || 'root'}-${item.name}-${index}`;
        const isExpanded = expandedIds.has(id);
        const hasChildren = item.children && item.children.length > 0;
        
        flatItems.push({ ...item, id, level, hasChildren, isExpanded });
        
        if (hasChildren && isExpanded) {
          flatten(item.children, level + 1, id);
        }
      });
    };
    flatten(ganttItems);
    return flatItems;
  }, [ganttItems, expandedIds]);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedIds(newExpanded);
  };

  // Generate Date Columns based on interval with 5 column buffer
  const dateColumns = useMemo(() => {
    const columns: { start: Date; end: Date; label: string }[] = [];
    const bufferStart = new Date(projectStart);
    const bufferEnd = new Date(projectEnd);
    let current = new Date(bufferStart);
    const bufferPeriods = 5;

    switch (ganttInterval) {
      case 'week': {
        bufferStart.setDate(bufferStart.getDate() - (7 * bufferPeriods));
        bufferEnd.setDate(bufferEnd.getDate() + (7 * bufferPeriods));
        
        const day = current.getDay();
        const diff = current.getDate() - day + (day === 0 ? -6 : 1);
        current = new Date(current.setDate(diff));
        current.setDate(current.getDate() - (7 * bufferPeriods));
        
        while (current <= bufferEnd) {
          const end = new Date(current);
          end.setDate(end.getDate() + 6);
          columns.push({
            start: new Date(current),
            end,
            label: `${current.getMonth() + 1}/${current.getDate()}`
          });
          current.setDate(current.getDate() + 7);
        }
        break;
      }
      case 'month': {
        bufferStart.setMonth(bufferStart.getMonth() - bufferPeriods);
        bufferEnd.setMonth(bufferEnd.getMonth() + bufferPeriods);
        
        current = new Date(bufferStart.getFullYear(), bufferStart.getMonth(), 1);
        while (current <= bufferEnd) {
          const end = new Date(current.getFullYear(), current.getMonth() + 1, 0);
          columns.push({
            start: new Date(current),
            end,
            label: current.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
          });
          current.setMonth(current.getMonth() + 1);
        }
        break;
      }
      case 'quarter': {
        bufferStart.setMonth(bufferStart.getMonth() - (3 * bufferPeriods));
        bufferEnd.setMonth(bufferEnd.getMonth() + (3 * bufferPeriods));
        
        const startQuarter = Math.floor(bufferStart.getMonth() / 3);
        current = new Date(bufferStart.getFullYear(), startQuarter * 3, 1);
        while (current <= bufferEnd) {
          const quarterNum = Math.floor(current.getMonth() / 3) + 1;
          const end = new Date(current.getFullYear(), current.getMonth() + 3, 0);
          columns.push({
            start: new Date(current),
            end,
            label: `Q${quarterNum} ${current.getFullYear().toString().slice(-2)}`
          });
          current.setMonth(current.getMonth() + 3);
        }
        break;
      }
      case 'year': {
        bufferStart.setFullYear(bufferStart.getFullYear() - bufferPeriods);
        bufferEnd.setFullYear(bufferEnd.getFullYear() + bufferPeriods);
        
        current = new Date(bufferStart.getFullYear(), 0, 1);
        while (current <= bufferEnd) {
          const end = new Date(current.getFullYear(), 11, 31);
          columns.push({
            start: new Date(current),
            end,
            label: current.getFullYear().toString()
          });
          current.setFullYear(current.getFullYear() + 1);
        }
        break;
      }
    }
    return columns;
  }, [ganttInterval, projectStart, projectEnd]);

  // Get column width based on interval
  const columnWidth = useMemo(() => {
    switch (ganttInterval) {
      case 'week': return 40;
      case 'month': return 80;
      case 'quarter': return 120;
      case 'year': return 200;
    }
  }, [ganttInterval]);

  // Find the "today" column index
  const todayColumnIndex = useMemo(() => {
    return dateColumns.findIndex(col => today >= col.start && today <= col.end);
  }, [dateColumns, today]);

  // Scroll to today - centers today column in the view
  const scrollToToday = () => {
    if (!containerRef.current || todayColumnIndex < 0) return;
    const fixedColsWidth = 220 + 70 + 70; // Resource/Task + Util% + Eff%
    const viewportWidth = containerRef.current.clientWidth - fixedColsWidth;
    const todayPosition = (todayColumnIndex * columnWidth) + (columnWidth / 2);
    const scrollX = todayPosition - (viewportWidth / 2) + fixedColsWidth;
    containerRef.current.scrollTo({
      left: Math.max(0, scrollX),
      behavior: 'smooth'
    });
  };
  
  // Expand All resources
  const expandAll = () => {
    const allIds = new Set<string>();
    
    const collectIds = (items: any[], parentId: string | null = null) => {
      items.forEach((item, index) => {
        const id = item.id || `${parentId || 'root'}-${item.name}-${index}`;
        if (item.children && item.children.length > 0) {
          allIds.add(id);
          collectIds(item.children, id);
        }
      });
    };
    
    if (ganttItems.length > 0) collectIds(ganttItems);
    setExpandedIds(allIds);
  };
  
  // Collapse All
  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  // Calculate bar position for a date range
  const getBarPosition = (itemStart: Date, itemEnd: Date, colStart: Date, colEnd: Date) => {
    const colDuration = colEnd.getTime() - colStart.getTime();
    const overlapStart = Math.max(itemStart.getTime(), colStart.getTime());
    const overlapEnd = Math.min(itemEnd.getTime(), colEnd.getTime());
    
    const left = ((overlapStart - colStart.getTime()) / colDuration) * 100;
    const width = ((overlapEnd - overlapStart) / colDuration) * 100;
    
    return { left, width };
  };

  return (
    <div className="page-panel full-height-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minHeight: 'calc(100vh - 100px)', overflow: 'auto' }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title">Resourcing</h1>
        </div>
      </div>

      {/* Enhanced Resource Heatmap - Full Width, Much Larger */}
      <div className="chart-card" style={{ 
        flex: '0 0 auto',
        minHeight: '700px',
        display: 'flex', 
        flexDirection: 'column'
      }}>
        <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <rect x="7" y="7" width="3" height="3"></rect>
              <rect x="14" y="7" width="3" height="3"></rect>
              <rect x="7" y="14" width="3" height="3"></rect>
              <rect x="14" y="14" width="3" height="3"></rect>
            </svg>
            Resource Utilization Heatmap
          </h3>
        </div>
        <div className="chart-card-body" style={{ flex: 1, minHeight: 0, padding: '12px' }}>
          <ResourceHeatmapChart 
            data={data.resourceHeatmap} 
            employees={data.employees}
            height="100%" 
            showControls={true}
          />
        </div>
      </div>

      {/* Resource Gantt Table - Much Larger */}
      <div className="chart-card" style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', minHeight: '600px', overflow: 'hidden' }}>
        <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
          <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
              <line x1="4" y1="9" x2="20" y2="9"></line>
              <line x1="4" y1="15" x2="20" y2="15"></line>
              <rect x="6" y="6" width="8" height="6" rx="1" fill="var(--pinnacle-teal)" opacity="0.3"></rect>
              <rect x="10" y="12" width="10" height="6" rx="1" fill="var(--pinnacle-teal)" opacity="0.3"></rect>
            </svg>
            Resource Gantt Chart
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {/* Group By Selector */}
            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '3px' }}>
              {(['employee', 'role'] as GanttGroupBy[]).map(groupBy => (
                <button
                  key={groupBy}
                  onClick={() => { setGanttGroupBy(groupBy); setExpandedIds(new Set()); }}
                  style={{
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    background: ganttGroupBy === groupBy ? 'var(--pinnacle-teal)' : 'transparent',
                    color: ganttGroupBy === groupBy ? '#000' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    textTransform: 'capitalize'
                  }}
                >
                  By {groupBy}
                </button>
              ))}
            </div>
            {/* Interval Selector */}
            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '3px' }}>
              {(['week', 'month', 'quarter', 'year'] as GanttInterval[]).map(interval => (
                <button
                  key={interval}
                  onClick={() => setGanttInterval(interval)}
                  style={{
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    background: ganttInterval === interval ? 'var(--pinnacle-teal)' : 'transparent',
                    color: ganttInterval === interval ? '#000' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    textTransform: 'capitalize'
                  }}
                >
                  {interval}
                </button>
              ))}
            </div>
            <button 
              onClick={scrollToToday}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.3rem 0.6rem',
                fontSize: '0.68rem',
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12,6 12,12 16,14"></polyline>
              </svg>
              Today
            </button>
            <button 
              onClick={collapseAll}
              style={{
                padding: '0.3rem 0.6rem',
                fontSize: '0.68rem',
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              Collapse All
            </button>
            <button 
              onClick={expandAll}
              style={{
                padding: '0.3rem 0.6rem',
                fontSize: '0.68rem',
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              Expand All
            </button>
          </div>
        </div>
        <div 
          className="chart-card-body no-padding" 
          style={{ flex: 1, overflow: 'auto', position: 'relative' }}
          ref={containerRef}
        >
          <table 
            className="wbs-table" 
            style={{ 
              width: 'max-content', 
              minWidth: '100%', 
              borderCollapse: 'separate', 
              borderSpacing: 0,
              // Limit width to actual content - prevent empty scroll space
              maxWidth: `${500 + (dateColumns.length * 40)}px`
            }}
          >
            <thead>
              <tr style={{ height: '36px' }}>
                <th style={{ width: '220px', position: 'sticky', left: 0, zIndex: 20, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)' }}>Resource / Task</th>
                <th style={{ width: '70px', textAlign: 'center' }}>Util%</th>
                <th style={{ width: '70px', textAlign: 'center' }}>Eff%</th>
                {dateColumns.map((col, i) => {
                  const isCurrentPeriod = today >= col.start && today <= col.end;
                  return (
                    <th key={i} style={{ 
                      width: `${columnWidth}px`, 
                      textAlign: 'center', 
                      fontSize: '0.62rem', 
                      borderLeft: '1px solid #333',
                      background: isCurrentPeriod ? 'rgba(64, 224, 208, 0.2)' : 'var(--bg-secondary)',
                      color: isCurrentPeriod ? 'var(--pinnacle-teal)' : 'inherit'
                    }}>{col.label}</th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {flatResourceItems.map((item) => {
                const efficiency = item.efficiency || 0;
                const utilColor = item.utilization != null 
                  ? item.utilization > 110 ? '#ef4444' : item.utilization > 90 ? '#40E0D0' : '#CDDC39'
                  : 'inherit';
                
                const barColor = efficiency >= 100 ? '#40E0D0' : efficiency >= 90 ? '#CDDC39' : '#F59E0B';

                return (
                  <tr key={item.id} className={item.hasChildren ? 'rollup' : ''} style={{ height: '32px' }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-primary)', borderRight: '1px solid var(--border-color)' }}>
                      <div style={{ paddingLeft: `${item.level * 14}px`, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {item.hasChildren && (
                          <button 
                            onClick={() => toggleExpand(item.id)}
                            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: '9px' }}
                          >
                            {item.isExpanded ? '▼' : '▶'}
                          </button>
                        )}
                        <span style={{ fontSize: '0.72rem', fontWeight: item.type === 'resource' ? 700 : 400 }}>{item.name}</span>
                      </div>
                    </td>
                    <td className="number" style={{ fontSize: '0.7rem', color: utilColor, textAlign: 'center' }}>{item.utilization != null ? `${item.utilization}%` : '-'}</td>
                    <td className="number" style={{ fontSize: '0.7rem', textAlign: 'center' }}>{item.efficiency != null ? `${Math.round(item.efficiency)}%` : '-'}</td>
                    
                    {dateColumns.map((col, i) => {
                      const isCurrentPeriod = today >= col.start && today <= col.end;
                      const cellBg = isCurrentPeriod ? 'rgba(64, 224, 208, 0.05)' : 'transparent';

                      if (!item.startDate || !item.endDate) return <td key={i} style={{ borderLeft: '1px solid #222', background: cellBg }}></td>;
                      
                      const itemStart = new Date(item.startDate);
                      const itemEnd = new Date(item.endDate);

                      if (itemStart <= col.end && itemEnd >= col.start) {
                        const { left, width } = getBarPosition(itemStart, itemEnd, col.start, col.end);

                        return (
                          <td key={i} style={{ position: 'relative', padding: 0, borderLeft: '1px solid #222', background: cellBg }}>
                            <div 
                              title={`${item.name}\n${item.startDate} - ${item.endDate}\nUtilization: ${item.utilization || 0}%`}
                              style={{
                                position: 'absolute',
                                left: `${left}%`,
                                width: `${Math.max(width, 8)}%`,
                                height: '16px',
                                top: '8px',
                                background: barColor,
                                opacity: item.type === 'resource' ? 0.4 : 1,
                                borderRadius: '3px',
                                zIndex: 2
                              }}
                            />
                          </td>
                        );
                      }
                      return <td key={i} style={{ borderLeft: '1px solid #222', background: cellBg }}></td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
