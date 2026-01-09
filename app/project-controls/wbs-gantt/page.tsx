'use client';

/**
 * @fileoverview WBS & Gantt Chart Page for PPC V3 Project Controls.
 * 
 * Main project scheduling visualization with:
 * - Work Breakdown Structure (WBS) hierarchy table
 * - Gantt chart with task bars and dependencies
 * - Critical Path Method (CPM) analysis
 * - Task progress and efficiency tracking
 * - Expandable/collapsible hierarchy navigation
 * - Resource assignment display
 * 
 * Integrates with CPMEngine for schedule calculations.
 * 
 * @module app/project-controls/wbs-gantt/page
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useData } from '@/lib/data-context';
import { CPMEngine, CPMTask, CPMResult } from '@/lib/cpm-engine';
import { WBSTableRow } from '@/types/wbs';
import { formatCurrency } from '@/lib/wbs-utils';
import type { Employee } from '@/types/data';

// Helper to get employee name from ID
const getEmployeeName = (resourceId: string | undefined, employees: Employee[]): string => {
  if (!resourceId) return '-';
  const employee = employees.find(e => e.employeeId === resourceId);
  return employee?.name?.split(' ')[0] || resourceId; // Show first name only
};

// Helper to get task name from ID
const getTaskName = (taskId: string | undefined, items: WBSTableRow[]): string => {
  if (!taskId) return '-';
  const task = items.find(t => t.id === taskId);
  return task?.name?.split(' ').slice(0, 3).join(' ') || taskId.replace('wbs-', ''); // First 3 words or short ID
};

const WBS_COLORS = {
  portfolio: '#40E0D0',
  customer: '#CDDC39',
  site: '#E91E63',
  project: '#FF9800',
  sub_project: '#1A9B8F',
  phase: '#1A9B8F',
  task: '#9E9D24',
  sub_task: '#AD1457',
  critical: '#DC2626'
};

type GanttInterval = 'week' | 'month' | 'quarter' | 'year';

export default function WBSGanttPage() {
  const { filteredData, updateData, data: fullData } = useData();
  const data = filteredData;
  const employees = fullData.employees;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['wbs-1', 'wbs-2', 'wbs-1.1', 'wbs-2.1', 'wbs-1.1.1', 'wbs-2.1.1', 'wbs-1.1.1.1', 'wbs-2.1.1.1']));
  const [cpmResult, setCpmResult] = useState<CPMResult | null>(null);
  const [ganttInterval, setGanttInterval] = useState<GanttInterval>('week');
  const containerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Use actual current date
  const today = useMemo(() => new Date(), []);

  // Calculate date range from data with 5 column buffer
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
    
    if (data.wbsData?.items) findDateRange(data.wbsData.items);
    
    // Default fallback if no dates found
    const defaultStart = new Date();
    defaultStart.setMonth(defaultStart.getMonth() - 3);
    const defaultEnd = new Date();
    defaultEnd.setMonth(defaultEnd.getMonth() + 6);
    
    return {
      projectStart: minDate || defaultStart,
      projectEnd: maxDate || defaultEnd
    };
  }, [data.wbsData?.items]);

  // Generate Date Columns based on interval with 5 column buffer
  const dateColumns = useMemo(() => {
    const columns: { start: Date; end: Date; label: string }[] = [];
    
    // Add buffer columns before start
    const bufferStart = new Date(projectStart);
    const bufferEnd = new Date(projectEnd);
    
    let current = new Date(bufferStart);

    // Calculate buffer based on interval (5 columns)
    const bufferPeriods = 5;
    
    switch (ganttInterval) {
      case 'week': {
        // Move start back 5 weeks
        bufferStart.setDate(bufferStart.getDate() - (7 * bufferPeriods));
        // Move end forward 5 weeks
        bufferEnd.setDate(bufferEnd.getDate() + (7 * bufferPeriods));
        
        // Start on Monday
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
        // Move start back 5 months
        bufferStart.setMonth(bufferStart.getMonth() - bufferPeriods);
        // Move end forward 5 months
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
        // Move start back 5 quarters
        bufferStart.setMonth(bufferStart.getMonth() - (3 * bufferPeriods));
        // Move end forward 5 quarters
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
        // Move start back 5 years
        bufferStart.setFullYear(bufferStart.getFullYear() - bufferPeriods);
        // Move end forward 5 years
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
    
    // Calculate total fixed columns width before date columns
    // WBS(100) + Name(200) + Type(80) + Resource(100) + Start(80) + End(80) + Days(40) + BLHrs(50) + 
    // BLCost(70) + ActHrs(50) + ActCost(70) + RemHrs(50) + RemCost(70) + Eff(40) + Prog(40) + Pred(80) + CP(30)
    const fixedColsWidth = 1230;
    const stickyColsWidth = 300; // WBS Code + Name that stay sticky
    const viewportWidth = containerRef.current.clientWidth;
    
    // Calculate the x position of today column relative to the start of date columns
    const todayPositionInGantt = todayColumnIndex * columnWidth;
    
    // Scroll to center today column (account for sticky columns taking up space)
    const targetScrollX = fixedColsWidth - stickyColsWidth + todayPositionInGantt - (viewportWidth - stickyColsWidth) / 2 + columnWidth / 2;
    
    containerRef.current.scrollTo({
      left: Math.max(0, targetScrollX),
      behavior: 'smooth'
    });
  };
  
  // Expand All - collect all IDs with children
  const expandAll = () => {
    const allIds = new Set<string>();
    
    const collectIds = (items: any[]) => {
      items.forEach(item => {
        if (item.children && item.children.length > 0) {
          allIds.add(item.id);
          collectIds(item.children);
        }
      });
    };
    
    if (data.wbsData?.items) collectIds(data.wbsData.items);
    setExpandedIds(allIds);
  };
  
  // Collapse All
  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  // Flatten WBS for table
  const flatRows = useMemo(() => {
    const rows: WBSTableRow[] = [];
    let rowIndex = 0;

    const processItem = (item: any, level: number) => {
      const isExpanded = expandedIds.has(item.id);
      const hasChildren = item.children && item.children.length > 0;
      const itemType = item.itemType || item.type || 'task';

      rows.push({
        ...item,
        itemType,
        level,
        indentLevel: level - 1,
        hasChildren: hasChildren || false,
        isExpanded: isExpanded || false,
        rowIndex: rowIndex++,
        isVisible: true
      });

      if (hasChildren && isExpanded) {
        item.children.forEach((child: any) => processItem(child, level + 1));
      }
    };

    if (data.wbsData?.items) {
      data.wbsData.items.forEach(item => processItem(item, 1));
    }
    return rows;
  }, [data.wbsData?.items, expandedIds]);

  // Run CPM Analysis
  const runCPM = () => {
    const engine = new CPMEngine();
    const tasks: Partial<CPMTask>[] = [];
    
    const collectTasks = (items: any[]) => {
      items.forEach(item => {
        if (!item.children || item.children.length === 0) {
          tasks.push({
            id: item.id,
            name: item.name,
            wbsCode: item.wbsCode,
            daysRequired: item.daysRequired || 1,
            predecessors: item.predecessors || []
          });
        } else {
          collectTasks(item.children);
        }
      });
    };

    if (data.wbsData?.items) collectTasks(data.wbsData.items);
    engine.loadTasks(tasks);
    const result = engine.calculate();
    setCpmResult(result);

    // Update global state with CPM results
    const updateItems = (items: any[]): any[] => {
      return items.map(item => {
        const cpmTask = result.tasks.find(t => t.id === item.id);
        const newItem = { ...item };
        if (cpmTask) {
          newItem.isCritical = cpmTask.isCritical;
          newItem.totalFloat = cpmTask.totalFloat;
        }
        if (newItem.children) {
          newItem.children = updateItems(newItem.children);
          newItem.isCritical = newItem.children.some((c: any) => c.isCritical);
        }
        return newItem;
      });
    };

    if (data.wbsData?.items) {
      const updated = updateItems(data.wbsData.items);
      updateData({ wbsData: { ...data.wbsData, items: updated } });
    }
  };

  // Draw Predecessor Arrows using SVG overlay
  useEffect(() => {
    if (!svgRef.current || !tableRef.current || flatRows.length === 0) return;
    
    const svg = svgRef.current;
    const table = tableRef.current;
    const container = containerRef.current;
    if (!container) return;

    // Clear arrows (keep defs)
    const children = Array.from(svg.children);
    children.forEach(child => {
      if (child.nodeName !== 'defs') {
        svg.removeChild(child);
      }
    });

    const bars = new Map();
    const barElements = table.querySelectorAll('.gantt-bar-segment');
    barElements.forEach(el => {
      bars.set(el.getAttribute('data-id'), el);
    });

    const containerRect = container.getBoundingClientRect();

    flatRows.forEach(item => {
      if (!item.predecessors || item.predecessors.length === 0) return;
      const targetBar = bars.get(item.id);
      if (!targetBar) return;

      item.predecessors.forEach((pred: any) => {
        const sourceBar = bars.get(pred.taskId);
        if (!sourceBar) return;

        const sRect = sourceBar.getBoundingClientRect();
        const tRect = targetBar.getBoundingClientRect();

        // Coordinates relative to the scrollable container
        const x1 = sRect.right - containerRect.left + container.scrollLeft;
        const y1 = sRect.top + sRect.height / 2 - containerRect.top + container.scrollTop;
        const x2 = tRect.left - containerRect.left + container.scrollLeft;
        const y2 = tRect.top + tRect.height / 2 - containerRect.top + container.scrollTop;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const midX = (x1 + x2) / 2;
        path.setAttribute('d', `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`);
        path.setAttribute('stroke', item.isCritical ? '#DC2626' : '#40E0D0');
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('fill', 'none');
        path.setAttribute('marker-end', 'url(#arrowhead)');
        path.setAttribute('opacity', '0.7');
        svg.appendChild(path);
      });
    });
  }, [flatRows, cpmResult, ganttInterval]);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedIds(newExpanded);
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
    <div className="page-panel full-height-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">WBS & Gantt Chart</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Interval Selector */}
          <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '2px' }}>
            {(['week', 'month', 'quarter', 'year'] as GanttInterval[]).map(interval => (
              <button
                key={interval}
                onClick={() => setGanttInterval(interval)}
                style={{
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.7rem',
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
            className="btn btn-secondary btn-sm" 
            onClick={scrollToToday}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12,6 12,12 16,14"></polyline>
            </svg>
            Today
          </button>
          <button className="btn btn-secondary btn-sm" onClick={collapseAll}>Collapse All</button>
          <button className="btn btn-secondary btn-sm" onClick={expandAll}>Expand All</button>
          <button className="btn btn-primary btn-sm" onClick={runCPM}>Run CPM Analysis</button>
        </div>
      </div>

      {cpmResult && (
        <div className="metrics-row-compact" style={{ marginBottom: '1rem' }}>
          <div className="metric-card">
            <div className="metric-label">Project Duration</div>
            <div className="metric-value">{cpmResult.projectDuration} Days</div>
          </div>
          <div className="metric-card accent-pink">
            <div className="metric-label">Critical Path Tasks</div>
            <div className="metric-value">{cpmResult.stats.criticalTasksCount}</div>
          </div>
          <div className="metric-card accent-lime">
            <div className="metric-label">Avg Schedule Float</div>
            <div className="metric-value">{cpmResult.stats.averageFloat.toFixed(1)} Days</div>
          </div>
        </div>
      )}
      
      <div className="chart-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div 
          className="chart-card-body no-padding" 
          style={{ flex: 1, overflow: 'auto', position: 'relative' }}
          ref={containerRef}
        >
          {/* SVG Overlay for Arrows */}
          <svg 
            ref={svgRef} 
            style={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              width: '10000px',
              height: '10000px', 
              pointerEvents: 'none', 
              zIndex: 5 
            }}
          >
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
              </marker>
            </defs>
          </svg>

          <table 
            ref={tableRef}
            className="wbs-table" 
            style={{ 
              width: 'max-content', 
              minWidth: '100%', 
              borderCollapse: 'separate', 
              borderSpacing: 0,
              // Limit width to actual content - prevent empty scroll space
              maxWidth: `${1230 + (dateColumns.length * columnWidth)}px`
            }}
          >
            <thead>
              <tr style={{ height: '36px' }}>
                <th style={{ width: '100px', position: 'sticky', left: 0, zIndex: 20, background: 'var(--bg-secondary)', borderRight: '1px solid #444' }}>WBS Code</th>
                <th style={{ width: '200px', position: 'sticky', left: '100px', zIndex: 20, background: 'var(--bg-secondary)', borderRight: '1px solid #444' }}>Name</th>
                <th style={{ width: '80px' }}>Type</th>
                <th style={{ width: '100px' }}>Resource</th>
                <th style={{ width: '80px' }}>Start</th>
                <th style={{ width: '80px' }}>End</th>
                <th style={{ width: '40px' }} className="number">Days</th>
                <th style={{ width: '50px' }} className="number">BL Hrs</th>
                <th style={{ width: '50px' }} className="number">Act Hrs</th>
                <th style={{ width: '55px', color: 'var(--pinnacle-teal)' }} className="number">Rem Hrs</th>
                <th style={{ width: '70px' }} className="number">BL Cost</th>
                <th style={{ width: '70px' }} className="number">Act Cost</th>
                <th style={{ width: '75px', color: 'var(--pinnacle-teal)' }} className="number">Rem Cost</th>
                <th style={{ width: '40px' }} className="number">Eff%</th>
                <th style={{ width: '40px' }} className="number">Prog</th>
                <th style={{ width: '80px' }}>Pred</th>
                <th style={{ width: '30px' }}>CP</th>
                {/* Gantt Timeline Headers */}
                {dateColumns.map((col, i) => {
                  const isCurrentPeriod = today >= col.start && today <= col.end;
                  return (
                    <th key={i} style={{ 
                      width: `${columnWidth}px`, 
                      textAlign: 'center', 
                      fontSize: '0.6rem', 
                      borderLeft: '1px solid #333',
                      background: isCurrentPeriod ? 'rgba(64, 224, 208, 0.2)' : 'var(--bg-secondary)',
                      color: isCurrentPeriod ? 'var(--pinnacle-teal)' : 'inherit'
                    }}>{col.label}</th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {flatRows.map((row) => {
                const efficiency = row.taskEfficiency || 0;
                const effColor = efficiency >= 100 ? '#40E0D0' : efficiency >= 90 ? '#CDDC39' : '#F59E0B';
                const itemColor = row.isCritical ? WBS_COLORS.critical : (row.hasChildren ? (WBS_COLORS as any)[row.itemType] || '#40E0D0' : effColor);
                
                return (
                  <tr key={row.id} data-id={row.id} className={row.hasChildren ? 'rollup' : ''} style={{ height: '30px' }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-primary)', borderRight: '1px solid #444' }}>
                      <div style={{ paddingLeft: `${row.indentLevel * 12}px`, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {row.hasChildren && (
                          <button 
                            onClick={() => toggleExpand(row.id)}
                            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: '8px' }}
                          >
                            {row.isExpanded ? '▼' : '▶'}
                          </button>
                        )}
                        <span style={{ color: row.isCritical ? '#ef4444' : 'inherit', fontSize: '0.65rem' }}>{row.wbsCode}</span>
                      </div>
                    </td>
                    <td style={{ position: 'sticky', left: '100px', zIndex: 10, background: 'var(--bg-primary)', borderRight: '1px solid #444', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: row.hasChildren ? 700 : 400, fontSize: '0.7rem' }}>{row.name}</span>
                    </td>
                    <td><span className={`type-badge ${row.itemType}`} style={{ fontSize: '0.5rem' }}>{(row.itemType || '').replace('_', ' ')}</span></td>
                    <td style={{ fontSize: '0.65rem' }}>{getEmployeeName(row.assignedResourceId, employees)}</td>
                    <td style={{ fontSize: '0.65rem' }}>{row.startDate ? new Date(row.startDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) : '-'}</td>
                    <td style={{ fontSize: '0.65rem' }}>{row.endDate ? new Date(row.endDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) : '-'}</td>
                    <td className="number" style={{ fontSize: '0.65rem' }}>{row.daysRequired || '-'}</td>
                    <td className="number" style={{ fontSize: '0.65rem' }}>{row.baselineHours || '-'}</td>
                    <td className="number" style={{ fontSize: '0.65rem' }}>{row.actualHours || '-'}</td>
                    <td className="number" style={{ fontSize: '0.65rem', color: 'var(--pinnacle-teal)' }}>{(row as any).remainingHours ?? row.projectedRemainingHours ?? (row.baselineHours && row.actualHours ? Math.max(0, (row.baselineHours || 0) - (row.actualHours || 0)) : '-')}</td>
                    <td className="number" style={{ fontSize: '0.65rem' }}>{formatCurrency(row.baselineCost || 0)}</td>
                    <td className="number" style={{ fontSize: '0.65rem' }}>{formatCurrency(row.actualCost || 0)}</td>
                    <td className="number" style={{ fontSize: '0.65rem', color: 'var(--pinnacle-teal)' }}>{formatCurrency(row.remainingCost ?? Math.max(0, (row.baselineCost || 0) - (row.actualCost || 0)))}</td>
                    <td className="number" style={{ fontSize: '0.65rem' }}>{row.taskEfficiency ? `${Math.round(row.taskEfficiency)}%` : '-'}</td>
                    <td>
                      <div className="progress-bar" style={{ width: '25px', height: '6px' }}>
                        <div className="progress-bar-fill" style={{ width: `${row.percentComplete || 0}%`, background: itemColor }}></div>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.55rem' }} title={row.predecessors?.map((p: any) => `${getTaskName(p.taskId, flatRows)} (${p.relationship})`).join(', ') || ''}>
                      {row.predecessors?.map((p: any) => `${getTaskName(p.taskId, flatRows)}`).join(', ') || '-'}
                    </td>
                    <td style={{ textAlign: 'center' }}>{row.isCritical ? <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '0.65rem' }}>CP</span> : ''}</td>
                    
                    {/* Gantt Timeline Cells */}
                    {dateColumns.map((col, i) => {
                      const isCurrentPeriod = today >= col.start && today <= col.end;
                      const cellBg = isCurrentPeriod ? 'rgba(64, 224, 208, 0.05)' : 'transparent';

                      if (!row.startDate || !row.endDate) return <td key={i} style={{ borderLeft: '1px solid #222', background: cellBg }}></td>;
                      
                      const itemStart = new Date(row.startDate);
                      const itemEnd = new Date(row.endDate);

                      if (itemStart <= col.end && itemEnd >= col.start) {
                        const { left, width } = getBarPosition(itemStart, itemEnd, col.start, col.end);

                        return (
                          <td key={i} style={{ position: 'relative', padding: 0, borderLeft: '1px solid #222', background: cellBg }}>
                            <div 
                              className="gantt-bar-segment"
                              data-id={row.id}
                              title={`${row.name}\n${row.startDate} - ${row.endDate}\nProgress: ${row.percentComplete}%${row.taskEfficiency ? `\nEfficiency: ${Math.round(row.taskEfficiency)}%` : ''}`}
                              style={{
                                position: 'absolute',
                                left: `${left}%`,
                                width: `${Math.max(width, 8)}%`,
                                height: '14px',
                                top: '8px',
                                background: itemColor,
                                opacity: row.hasChildren ? 0.4 : 1,
                                borderRadius: '2px',
                                zIndex: 2,
                                border: row.isCritical ? '1px solid #fff' : 'none'
                              }}
                            >
                              {!row.hasChildren && (
                                <div style={{ 
                                  width: `${row.percentComplete || 0}%`, 
                                  height: '100%', 
                                  background: 'rgba(0,0,0,0.3)',
                                  borderRadius: '2px'
                                }} />
                              )}
                            </div>
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
