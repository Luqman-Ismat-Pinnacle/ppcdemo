'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  GridApi,
  GridReadyEvent,
  ModelUpdatedEvent,
  RowGroupOpenedEvent,
  ValueFormatterParams,
} from 'ag-grid-community';
import { useData } from '@/lib/data-context';
import PageLoader from '@/components/ui/PageLoader';

type NodeType = 'portfolio' | 'customer' | 'site' | 'project' | 'unit' | 'phase' | 'task';

interface TreeNode {
  key: string;
  id: string;
  name: string;
  nodeType: NodeType;
  projectId: string;
  taskId: string;
  startDate: Date | null;
  endDate: Date | null;
  baselineHours: number;
  actualHours: number;
  remainingHours: number;
  percentComplete: number;
  predecessors: string[];
  children: TreeNode[];
}

interface V2Row {
  key: string;
  id: string;
  name: string;
  nodeType: NodeType;
  path: string[];
  projectId: string;
  taskId: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  baselineHours: number;
  actualHours: number;
  remainingHours: number;
  percentComplete: number;
  predecessors: string[];
}

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 34;

const typeColor: Record<NodeType, string> = {
  portfolio: '#40E0D0',
  customer: '#CDDC39',
  site: '#E91E63',
  project: '#F59E0B',
  unit: '#7C4DFF',
  phase: '#14B8A6',
  task: '#60A5FA',
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
};

const readString = (value: unknown, ...keys: string[]): string => {
  const record = toRecord(value);
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return '';
};

const readNumber = (value: unknown, ...keys: string[]): number => {
  const record = toRecord(value);
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
};

const readDate = (value: unknown, ...keys: string[]): Date | null => {
  const record = toRecord(value);
  for (const key of keys) {
    const raw = record[key];
    if (!raw) continue;
    const parsed = new Date(String(raw));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const readBoolean = (value: unknown, ...keys: string[]): boolean => {
  const record = toRecord(value);
  for (const key of keys) {
    const raw = record[key];
    if (raw === true || raw === 1) return true;
    if (typeof raw === 'string') {
      const lowered = raw.toLowerCase().trim();
      if (lowered === 'true' || lowered === '1' || lowered === 'yes') return true;
    }
  }
  return false;
};

const normalizeTaskRef = (value: string): string => value.replace(/^wbs-(task|sub_task)-/, '').trim();

const parsePredecessors = (task: unknown): string[] => {
  const result: string[] = [];
  const rawSingle = readString(task, 'predecessorId', 'predecessor_id');
  if (rawSingle) {
    rawSingle
      .split(/[;,]+/)
      .map((id) => normalizeTaskRef(id))
      .filter(Boolean)
      .forEach((id) => result.push(id));
  }

  const predecessorsRaw = toRecord(task).predecessors;
  if (Array.isArray(predecessorsRaw)) {
    predecessorsRaw.forEach((pred) => {
      const predecessorTaskId = readString(pred, 'predecessorTaskId', 'predecessor_task_id', 'taskId');
      const normalized = normalizeTaskRef(predecessorTaskId);
      if (normalized) result.push(normalized);
    });
  }

  return Array.from(new Set(result));
};

const createNode = (init: Omit<TreeNode, 'children'>): TreeNode => ({ ...init, children: [] });

const formatDate = (value: Date | null): string => {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
};

const durationBetween = (start: Date | null, end: Date | null): number => {
  if (!start || !end) return 0;
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return 0;
  return Math.max(1, Math.ceil(ms / 86400000));
};

const sortByName = <T,>(items: T[], getName: (item: T) => string): T[] => {
  return [...items].sort((a, b) => getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' }));
};

function buildRowsFromData(source: Record<string, unknown>): V2Row[] {
  const portfolios = (source.portfolios as unknown[] | undefined) ?? [];
  const customers = (source.customers as unknown[] | undefined) ?? [];
  const sites = (source.sites as unknown[] | undefined) ?? [];
  const projects = (source.projects as unknown[] | undefined) ?? [];
  const units = (source.units as unknown[] | undefined) ?? [];
  const phases = (source.phases as unknown[] | undefined) ?? [];
  const tasks = (source.tasks as unknown[] | undefined) ?? [];
  const projectDocuments = (source.projectDocuments as unknown[] | undefined) ?? [];

  const projectsWithDocs = new Set(
    projectDocuments
      .map((doc) => readString(doc, 'projectId', 'project_id'))
      .filter(Boolean),
  );

  const plannedProjects = projects.filter((project) => {
    const projectId = readString(project, 'id', 'projectId');
    return readBoolean(project, 'has_schedule', 'hasSchedule') || projectsWithDocs.has(projectId);
  });
  const sourceProjects = plannedProjects.length ? plannedProjects : projects;

  const siteToCustomer = new Map<string, string>();
  sites.forEach((site) => {
    const siteId = readString(site, 'id', 'siteId');
    const customerId = readString(site, 'customerId', 'customer_id', 'parent_id');
    if (siteId && customerId) siteToCustomer.set(siteId, customerId);
  });

  const unitToProject = new Map<string, string>();
  units.forEach((unit) => {
    const unitId = readString(unit, 'id', 'unitId');
    const projectId = readString(unit, 'projectId', 'project_id');
    if (unitId && projectId) unitToProject.set(unitId, projectId);
  });

  const phaseToProject = new Map<string, string>();
  phases.forEach((phase) => {
    const phaseId = readString(phase, 'id', 'phaseId');
    const unitId = readString(phase, 'unitId', 'unit_id');
    const projectId = readString(phase, 'projectId', 'project_id') || unitToProject.get(unitId) || '';
    if (phaseId && projectId) phaseToProject.set(phaseId, projectId);
  });

  const projectsByCustomer = new Map<string, unknown[]>();
  const projectsBySite = new Map<string, unknown[]>();
  sourceProjects.forEach((project) => {
    const siteId = readString(project, 'siteId', 'site_id');
    const customerId = readString(project, 'customerId', 'customer_id') || siteToCustomer.get(siteId) || '';
    if (customerId) {
      if (!projectsByCustomer.has(customerId)) projectsByCustomer.set(customerId, []);
      projectsByCustomer.get(customerId)?.push(project);
    }
    if (siteId) {
      if (!projectsBySite.has(siteId)) projectsBySite.set(siteId, []);
      projectsBySite.get(siteId)?.push(project);
    }
  });

  const customersByPortfolio = new Map<string, unknown[]>();
  customers.forEach((customer) => {
    const portfolioId = readString(customer, 'portfolioId', 'portfolio_id', 'parent_id');
    if (!portfolioId) return;
    if (!customersByPortfolio.has(portfolioId)) customersByPortfolio.set(portfolioId, []);
    customersByPortfolio.get(portfolioId)?.push(customer);
  });

  const sitesByCustomer = new Map<string, unknown[]>();
  sites.forEach((site) => {
    const customerId = readString(site, 'customerId', 'customer_id', 'parent_id');
    if (!customerId) return;
    if (!sitesByCustomer.has(customerId)) sitesByCustomer.set(customerId, []);
    sitesByCustomer.get(customerId)?.push(site);
  });

  const unitsByProject = new Map<string, unknown[]>();
  units.forEach((unit) => {
    const projectId = readString(unit, 'projectId', 'project_id');
    if (!projectId) return;
    if (!unitsByProject.has(projectId)) unitsByProject.set(projectId, []);
    unitsByProject.get(projectId)?.push(unit);
  });

  const phasesByUnit = new Map<string, unknown[]>();
  const phasesByProject = new Map<string, unknown[]>();
  phases.forEach((phase) => {
    const phaseUnitId = readString(phase, 'unitId', 'unit_id');
    const phaseProjectId = readString(phase, 'projectId', 'project_id') || unitToProject.get(phaseUnitId) || '';
    if (phaseUnitId) {
      if (!phasesByUnit.has(phaseUnitId)) phasesByUnit.set(phaseUnitId, []);
      phasesByUnit.get(phaseUnitId)?.push(phase);
    }
    if (phaseProjectId) {
      if (!phasesByProject.has(phaseProjectId)) phasesByProject.set(phaseProjectId, []);
      phasesByProject.get(phaseProjectId)?.push(phase);
    }
  });

  const tasksByPhase = new Map<string, unknown[]>();
  const tasksByProject = new Map<string, unknown[]>();
  tasks.forEach((task) => {
    const phaseId = readString(task, 'phaseId', 'phase_id');
    const unitId = readString(task, 'unitId', 'unit_id');
    const projectId = readString(task, 'projectId', 'project_id') || phaseToProject.get(phaseId) || unitToProject.get(unitId) || '';
    if (phaseId) {
      if (!tasksByPhase.has(phaseId)) tasksByPhase.set(phaseId, []);
      tasksByPhase.get(phaseId)?.push(task);
    }
    if (projectId) {
      if (!tasksByProject.has(projectId)) tasksByProject.set(projectId, []);
      tasksByProject.get(projectId)?.push(task);
    }
  });

  const makeTaskNode = (task: unknown): TreeNode => {
    const taskId = normalizeTaskRef(readString(task, 'id', 'taskId'));
    const taskName = readString(task, 'name', 'taskName') || `Task ${taskId || 'Unknown'}`;
    const startDate = readDate(task, 'startDate', 'baselineStartDate', 'plannedStartDate');
    const endDate = readDate(task, 'endDate', 'baselineEndDate', 'plannedEndDate');
    const baselineHours = readNumber(task, 'baselineHours', 'budgetHours');
    const actualHours = readNumber(task, 'actualHours', 'actual_hours');
    const remainingHours = readNumber(task, 'remainingHours', 'projectedRemainingHours', 'remaining_hours') || Math.max(0, baselineHours - actualHours);
    const percentComplete = readNumber(task, 'percentComplete', 'percent_complete');
    const projectId = readString(task, 'projectId', 'project_id');

    return createNode({
      key: `task:${taskId}`,
      id: taskId,
      taskId,
      projectId,
      name: taskName,
      nodeType: 'task',
      startDate,
      endDate,
      baselineHours,
      actualHours,
      remainingHours,
      percentComplete,
      predecessors: parsePredecessors(task),
    });
  };

  const aggregateNode = (node: TreeNode): void => {
    node.children.forEach(aggregateNode);
    if (!node.children.length) return;

    let baselineHours = 0;
    let actualHours = 0;
    let remainingHours = 0;
    let percentSum = 0;
    let childCount = 0;
    let minStart: Date | null = null;
    let maxEnd: Date | null = null;

    node.children.forEach((child) => {
      baselineHours += child.baselineHours;
      actualHours += child.actualHours;
      remainingHours += child.remainingHours;
      percentSum += child.percentComplete;
      childCount += 1;

      if (child.startDate && (!minStart || child.startDate < minStart)) minStart = child.startDate;
      if (child.endDate && (!maxEnd || child.endDate > maxEnd)) maxEnd = child.endDate;
    });

    node.baselineHours = baselineHours;
    node.actualHours = actualHours;
    node.remainingHours = remainingHours;
    node.percentComplete = childCount ? Math.round(percentSum / childCount) : node.percentComplete;
    node.startDate = minStart ?? node.startDate;
    node.endDate = maxEnd ?? node.endDate;
  };

  const createProjectNode = (project: unknown): TreeNode => {
    const projectId = readString(project, 'id', 'projectId');
    const projectNode = createNode({
      key: `project:${projectId}`,
      id: projectId,
      projectId,
      taskId: '',
      name: readString(project, 'name', 'projectNumber') || `Project ${projectId}`,
      nodeType: 'project',
      startDate: readDate(project, 'startDate', 'baselineStartDate'),
      endDate: readDate(project, 'endDate', 'baselineEndDate'),
      baselineHours: readNumber(project, 'baselineHours', 'budgetHours'),
      actualHours: readNumber(project, 'actualHours', 'actual_hours'),
      remainingHours: readNumber(project, 'remainingHours', 'remaining_hours'),
      percentComplete: readNumber(project, 'percentComplete', 'percent_complete'),
      predecessors: [],
    });

    const unitsForProject = sortByName(unitsByProject.get(projectId) || [], (unit) => readString(unit, 'name') || '');
    const phasesAdded = new Set<string>();

    unitsForProject.forEach((unit) => {
      const unitId = readString(unit, 'id', 'unitId');
      const unitNode = createNode({
        key: `unit:${unitId}`,
        id: unitId,
        projectId,
        taskId: '',
        name: readString(unit, 'name') || `Unit ${unitId}`,
        nodeType: 'unit',
        startDate: readDate(unit, 'startDate', 'baselineStartDate'),
        endDate: readDate(unit, 'endDate', 'baselineEndDate'),
        baselineHours: readNumber(unit, 'baselineHours', 'baseline_hours'),
        actualHours: readNumber(unit, 'actualHours', 'actual_hours'),
        remainingHours: readNumber(unit, 'remainingHours', 'remaining_hours'),
        percentComplete: readNumber(unit, 'percentComplete', 'percent_complete'),
        predecessors: [],
      });

      const phasesForUnit = sortByName(phasesByUnit.get(unitId) || [], (phase) => readString(phase, 'name') || '');
      phasesForUnit.forEach((phase) => {
        const phaseId = readString(phase, 'id', 'phaseId');
        phasesAdded.add(phaseId);
        const phaseNode = createNode({
          key: `phase:${phaseId}`,
          id: phaseId,
          projectId,
          taskId: '',
          name: readString(phase, 'name') || `Phase ${phaseId}`,
          nodeType: 'phase',
          startDate: readDate(phase, 'startDate', 'baselineStartDate'),
          endDate: readDate(phase, 'endDate', 'baselineEndDate'),
          baselineHours: readNumber(phase, 'baselineHours', 'baseline_hours'),
          actualHours: readNumber(phase, 'actualHours', 'actual_hours'),
          remainingHours: readNumber(phase, 'remainingHours', 'remaining_hours'),
          percentComplete: readNumber(phase, 'percentComplete', 'percent_complete'),
          predecessors: [],
        });

        sortByName(tasksByPhase.get(phaseId) || [], (task) => readString(task, 'name', 'taskName') || '').forEach((task) => {
          phaseNode.children.push(makeTaskNode(task));
        });

        unitNode.children.push(phaseNode);
      });

      projectNode.children.push(unitNode);
    });

    const directPhases = (phasesByProject.get(projectId) || []).filter((phase) => {
      const phaseId = readString(phase, 'id', 'phaseId');
      const phaseUnitId = readString(phase, 'unitId', 'unit_id');
      return !phaseUnitId && !phasesAdded.has(phaseId);
    });

    sortByName(directPhases, (phase) => readString(phase, 'name') || '').forEach((phase) => {
      const phaseId = readString(phase, 'id', 'phaseId');
      phasesAdded.add(phaseId);
      const phaseNode = createNode({
        key: `phase:${phaseId}`,
        id: phaseId,
        projectId,
        taskId: '',
        name: readString(phase, 'name') || `Phase ${phaseId}`,
        nodeType: 'phase',
        startDate: readDate(phase, 'startDate', 'baselineStartDate'),
        endDate: readDate(phase, 'endDate', 'baselineEndDate'),
        baselineHours: readNumber(phase, 'baselineHours', 'baseline_hours'),
        actualHours: readNumber(phase, 'actualHours', 'actual_hours'),
        remainingHours: readNumber(phase, 'remainingHours', 'remaining_hours'),
        percentComplete: readNumber(phase, 'percentComplete', 'percent_complete'),
        predecessors: [],
      });

      sortByName(tasksByPhase.get(phaseId) || [], (task) => readString(task, 'name', 'taskName') || '').forEach((task) => {
        phaseNode.children.push(makeTaskNode(task));
      });

      projectNode.children.push(phaseNode);
    });

    const projectTasks = (tasksByProject.get(projectId) || []).filter((task) => {
      const taskPhaseId = readString(task, 'phaseId', 'phase_id');
      return !taskPhaseId || !phasesAdded.has(taskPhaseId);
    });

    sortByName(projectTasks, (task) => readString(task, 'name', 'taskName') || '').forEach((task) => {
      projectNode.children.push(makeTaskNode(task));
    });

    aggregateNode(projectNode);
    return projectNode;
  };

  const rootNodes: TreeNode[] = [];

  sortByName(portfolios, (portfolio) => readString(portfolio, 'name') || '').forEach((portfolio) => {
    const portfolioId = readString(portfolio, 'id', 'portfolioId');
    const portfolioNode = createNode({
      key: `portfolio:${portfolioId}`,
      id: portfolioId,
      projectId: '',
      taskId: '',
      name: readString(portfolio, 'name') || `Portfolio ${portfolioId}`,
      nodeType: 'portfolio',
      startDate: readDate(portfolio, 'startDate', 'baselineStartDate'),
      endDate: readDate(portfolio, 'endDate', 'baselineEndDate'),
      baselineHours: 0,
      actualHours: 0,
      remainingHours: 0,
      percentComplete: 0,
      predecessors: [],
    });

    const customersForPortfolio = sortByName(customersByPortfolio.get(portfolioId) || [], (customer) => readString(customer, 'name') || '');
    customersForPortfolio.forEach((customer) => {
      const customerId = readString(customer, 'id', 'customerId');
      const customerNode = createNode({
        key: `customer:${customerId}`,
        id: customerId,
        projectId: '',
        taskId: '',
        name: readString(customer, 'name') || `Customer ${customerId}`,
        nodeType: 'customer',
        startDate: readDate(customer, 'startDate', 'baselineStartDate'),
        endDate: readDate(customer, 'endDate', 'baselineEndDate'),
        baselineHours: 0,
        actualHours: 0,
        remainingHours: 0,
        percentComplete: 0,
        predecessors: [],
      });

      const sitesForCustomer = sortByName(sitesByCustomer.get(customerId) || [], (site) => readString(site, 'name') || '');
      const projectsForCustomer = projectsByCustomer.get(customerId) || [];

      const projectIdsBySite = new Map<string, unknown[]>();
      projectsForCustomer.forEach((project) => {
        const projectSiteId = readString(project, 'siteId', 'site_id');
        if (!projectSiteId) return;
        if (!projectIdsBySite.has(projectSiteId)) projectIdsBySite.set(projectSiteId, []);
        projectIdsBySite.get(projectSiteId)?.push(project);
      });

      const renderedSiteIds = new Set<string>();
      sitesForCustomer.forEach((site) => {
        const siteId = readString(site, 'id', 'siteId');
        const siteNode = createNode({
          key: `site:${siteId}`,
          id: siteId,
          projectId: '',
          taskId: '',
          name: readString(site, 'name') || `Site ${siteId}`,
          nodeType: 'site',
          startDate: readDate(site, 'startDate', 'baselineStartDate'),
          endDate: readDate(site, 'endDate', 'baselineEndDate'),
          baselineHours: 0,
          actualHours: 0,
          remainingHours: 0,
          percentComplete: 0,
          predecessors: [],
        });

        const projectsForSite = sortByName(projectIdsBySite.get(siteId) || [], (project) => readString(project, 'name', 'projectNumber') || '');
        projectsForSite.forEach((project) => siteNode.children.push(createProjectNode(project)));

        if (siteNode.children.length) {
          aggregateNode(siteNode);
          customerNode.children.push(siteNode);
          renderedSiteIds.add(siteId);
        }
      });

      // Projects without site mapping still appear under customer.
      const directProjects = projectsForCustomer.filter((project) => {
        const siteId = readString(project, 'siteId', 'site_id');
        return !siteId || !renderedSiteIds.has(siteId);
      });
      sortByName(directProjects, (project) => readString(project, 'name', 'projectNumber') || '').forEach((project) => {
        customerNode.children.push(createProjectNode(project));
      });

      if (customerNode.children.length) {
        aggregateNode(customerNode);
        portfolioNode.children.push(customerNode);
      }
    });

    if (portfolioNode.children.length) {
      aggregateNode(portfolioNode);
      rootNodes.push(portfolioNode);
    }
  });

  // Fallback: when portfolio/customer hierarchy is absent, still render projects from Data Management.
  if (!rootNodes.length && sourceProjects.length) {
    const fallbackRoot = createNode({
      key: 'portfolio:unassigned',
      id: 'unassigned',
      projectId: '',
      taskId: '',
      name: 'Unassigned Portfolio',
      nodeType: 'portfolio',
      startDate: null,
      endDate: null,
      baselineHours: 0,
      actualHours: 0,
      remainingHours: 0,
      percentComplete: 0,
      predecessors: [],
    });
    sortByName(sourceProjects, (project) => readString(project, 'name', 'projectNumber') || '').forEach((project) => {
      fallbackRoot.children.push(createProjectNode(project));
    });
    aggregateNode(fallbackRoot);
    rootNodes.push(fallbackRoot);
  }

  const rows: V2Row[] = [];
  const visit = (node: TreeNode, path: string[]) => {
    const pathSegment = `${node.name}__${node.key}`;
    const nextPath = [...path, pathSegment];
    rows.push({
      key: node.key,
      id: node.id,
      name: node.name,
      nodeType: node.nodeType,
      path: nextPath,
      projectId: node.projectId,
      taskId: node.taskId,
      startDate: formatDate(node.startDate),
      endDate: formatDate(node.endDate),
      durationDays: durationBetween(node.startDate, node.endDate),
      baselineHours: Math.round(node.baselineHours),
      actualHours: Math.round(node.actualHours),
      remainingHours: Math.round(node.remainingHours),
      percentComplete: Math.max(0, Math.min(100, Math.round(node.percentComplete))),
      predecessors: node.predecessors,
    });
    node.children.forEach((child) => visit(child, nextPath));
  };

  rootNodes.forEach((node) => visit(node, []));
  return rows;
}

export default function WBSGanttV2Page() {
  const { filteredData, isLoading } = useData();
  const [gridApi, setGridApi] = useState<GridApi<V2Row> | null>(null);
  const [visibleRows, setVisibleRows] = useState<V2Row[]>([]);
  const [zoomPxPerDay, setZoomPxPerDay] = useState(12);
  const [timelineScrollTop, setTimelineScrollTop] = useState(0);
  const [timelineViewportHeight, setTimelineViewportHeight] = useState(640);
  const [isNarrow, setIsNarrow] = useState(false);

  const gridWrapRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const syncLockRef = useRef(false);

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 1180);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const update = () => setTimelineViewportHeight(el.clientHeight - HEADER_HEIGHT);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rowData = useMemo(() => {
    return buildRowsFromData(filteredData as unknown as Record<string, unknown>);
  }, [filteredData]);

  const collectVisibleRows = useCallback((api: GridApi<V2Row>) => {
    const rows: V2Row[] = [];
    api.forEachNodeAfterFilterAndSort((node) => {
      if (node.displayed && node.data) rows.push(node.data);
    });
    setVisibleRows(rows);
  }, []);

  const onGridReady = useCallback((event: GridReadyEvent<V2Row>) => {
    setGridApi(event.api);
    collectVisibleRows(event.api);
  }, [collectVisibleRows]);

  const onModelUpdated = useCallback((event: ModelUpdatedEvent<V2Row>) => {
    collectVisibleRows(event.api);
  }, [collectVisibleRows]);

  const onRowGroupOpened = useCallback((event: RowGroupOpenedEvent<V2Row>) => {
    collectVisibleRows(event.api);
  }, [collectVisibleRows]);

  useEffect(() => {
    if (!gridApi) return;
    collectVisibleRows(gridApi);
  }, [gridApi, rowData, collectVisibleRows]);

  useEffect(() => {
    if (!gridApi) setVisibleRows(rowData);
  }, [gridApi, rowData]);

  useEffect(() => {
    const gridViewport = gridWrapRef.current?.querySelector('.ag-body-viewport') as HTMLElement | null;
    const timelineViewport = timelineRef.current;
    if (!gridViewport || !timelineViewport) return;

    const onGridScroll = () => {
      if (syncLockRef.current) return;
      syncLockRef.current = true;
      timelineViewport.scrollTop = gridViewport.scrollTop;
      setTimelineScrollTop(gridViewport.scrollTop);
      requestAnimationFrame(() => { syncLockRef.current = false; });
    };

    const onTimelineScroll = () => {
      if (syncLockRef.current) return;
      syncLockRef.current = true;
      gridViewport.scrollTop = timelineViewport.scrollTop;
      setTimelineScrollTop(timelineViewport.scrollTop);
      requestAnimationFrame(() => { syncLockRef.current = false; });
    };

    gridViewport.addEventListener('scroll', onGridScroll, { passive: true });
    timelineViewport.addEventListener('scroll', onTimelineScroll, { passive: true });

    return () => {
      gridViewport.removeEventListener('scroll', onGridScroll);
      timelineViewport.removeEventListener('scroll', onTimelineScroll);
    };
  }, [gridApi]);

  const colDefs = useMemo<ColDef<V2Row>[]>(() => [
    {
      field: 'nodeType',
      headerName: 'Type',
      width: 96,
      valueFormatter: (params: ValueFormatterParams<V2Row>) => (params.value ? String(params.value).toUpperCase() : ''),
    },
    {
      field: 'startDate',
      headerName: 'Start',
      width: 105,
      valueFormatter: (params: ValueFormatterParams<V2Row>) => {
        if (!params.value) return '-';
        const d = new Date(String(params.value));
        return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
      },
    },
    {
      field: 'endDate',
      headerName: 'End',
      width: 105,
      valueFormatter: (params: ValueFormatterParams<V2Row>) => {
        if (!params.value) return '-';
        const d = new Date(String(params.value));
        return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
      },
    },
    { field: 'durationDays', headerName: 'Days', width: 78 },
    { field: 'baselineHours', headerName: 'BL Hrs', width: 92 },
    { field: 'actualHours', headerName: 'Act Hrs', width: 92 },
    { field: 'remainingHours', headerName: 'Rem Hrs', width: 94 },
    {
      field: 'percentComplete',
      headerName: '%',
      width: 88,
      cellRenderer: (params: { value: unknown }) => {
        const value = typeof params.value === 'number' ? params.value : Number(params.value || 0);
        const pct = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: '100%' }}>
            <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct >= 75 ? '#22c55e' : pct >= 45 ? '#eab308' : '#ef4444' }} />
            </div>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(pct)}</span>
          </div>
        );
      },
    },
  ], []);

  const autoGroupColumnDef = useMemo<ColDef<V2Row>>(() => ({
    headerName: 'WBS',
    minWidth: 300,
    pinned: 'left',
    valueGetter: (params) => params.data?.name || '',
    cellRendererParams: {
      suppressCount: true,
    },
  }), []);

  const { minDate, maxDate } = useMemo(() => {
    const dates = visibleRows
      .flatMap((row) => [row.startDate, row.endDate])
      .map((value) => new Date(value))
      .filter((d) => !Number.isNaN(d.getTime()));

    if (!dates.length) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { minDate: start, maxDate: end };
    }

    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    min.setDate(min.getDate() - 4);
    max.setDate(max.getDate() + 4);
    return { minDate: min, maxDate: max };
  }, [visibleRows]);

  const totalRows = visibleRows.length;
  const totalHeight = totalRows * ROW_HEIGHT;
  const totalDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / 86400000));
  const timelineWidth = Math.max(1000, totalDays * zoomPxPerDay);

  const xScale = useMemo(() => {
    return d3.scaleTime().domain([minDate, maxDate]).range([0, timelineWidth]);
  }, [minDate, maxDate, timelineWidth]);

  const tickDates = useMemo(() => {
    const tickCount = Math.max(8, Math.floor(timelineWidth / 140));
    return xScale.ticks(tickCount);
  }, [xScale, timelineWidth]);

  const startIndex = Math.max(0, Math.floor(timelineScrollTop / ROW_HEIGHT) - 8);
  const endIndex = Math.min(totalRows, Math.ceil((timelineScrollTop + timelineViewportHeight) / ROW_HEIGHT) + 8);
  const renderRows = visibleRows.slice(startIndex, endIndex);

  const rowIndexByTaskId = useMemo(() => {
    const map = new Map<string, number>();
    visibleRows.forEach((row, idx) => {
      if (row.taskId) map.set(normalizeTaskRef(row.taskId), idx);
      if (row.nodeType === 'task' && row.id) map.set(normalizeTaskRef(row.id), idx);
    });
    return map;
  }, [visibleRows]);

  if (isLoading) return <PageLoader message="Loading WBS Gantt V2..." />;

  return (
    <div className="page-panel" style={{ height: 'calc(100vh - 62px)', display: 'flex', flexDirection: 'column', gap: 8, padding: '0.5rem 0.75rem 0.5rem' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>WBS Gantt V2</h1>
          <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: '0.74rem' }}>
            Rebuilt with AG Grid + D3 from Data Management tables only
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '4px 8px' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Zoom</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setZoomPxPerDay((z) => Math.max(4, z - 2))}>-</button>
          <span style={{ width: 44, textAlign: 'center', fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums' }}>{zoomPxPerDay}px/d</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setZoomPxPerDay((z) => Math.min(36, z + 2))}>+</button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: isNarrow ? '1fr' : 'minmax(420px, 48%) minmax(420px, 1fr)',
          gap: 8,
        }}
      >
        <div ref={gridWrapRef} style={{ minHeight: 0, border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-card)' }}>
          <div className="ag-theme-quartz" style={{ width: '100%', height: '100%', ['--ag-background-color' as string]: 'var(--bg-card)', ['--ag-foreground-color' as string]: 'var(--text-primary)', ['--ag-header-background-color' as string]: 'var(--bg-secondary)', ['--ag-header-foreground-color' as string]: 'var(--text-secondary)', ['--ag-row-hover-color' as string]: 'rgba(64,224,208,0.08)', ['--ag-border-color' as string]: 'var(--border-color)', ['--ag-font-size' as string]: '11px', ['--ag-row-height' as string]: `${ROW_HEIGHT}px` }}>
            <AgGridReact<V2Row>
              rowData={rowData}
              columnDefs={colDefs}
              autoGroupColumnDef={autoGroupColumnDef}
              treeData
              animateRows={false}
              groupDefaultExpanded={2}
              getDataPath={(row) => row.path}
              rowHeight={ROW_HEIGHT}
              suppressRowTransform
              suppressCellFocus
              onGridReady={onGridReady}
              onModelUpdated={onModelUpdated}
              onRowGroupOpened={onRowGroupOpened}
            />
          </div>
        </div>

        <div ref={timelineRef} style={{ minHeight: 0, border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'auto', background: 'var(--bg-card)', position: 'relative' }}>
          <div style={{ width: timelineWidth, position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
            <svg width={timelineWidth} height={HEADER_HEIGHT}>
              {tickDates.map((tick) => {
                const x = xScale(tick);
                return (
                  <g key={tick.toISOString()} transform={`translate(${x},0)`}>
                    <line y1={0} y2={HEADER_HEIGHT} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
                    <text x={4} y={12} fill="var(--text-muted)" fontSize={10}>
                      {d3.timeFormat('%b %d')(tick)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div style={{ width: timelineWidth, height: totalHeight, position: 'relative' }}>
            <svg width={timelineWidth} height={totalHeight}>
              <defs>
                <marker id="v2-arrow" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
                  <polygon points="0 0, 8 4, 0 8" fill="#40E0D0" />
                </marker>
              </defs>

              {renderRows.map((row, localIndex) => {
                const index = startIndex + localIndex;
                const y = index * ROW_HEIGHT;
                const isAlt = index % 2 === 1;
                const start = row.startDate ? new Date(row.startDate) : null;
                const end = row.endDate ? new Date(row.endDate) : null;
                const hasBar = start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime());
                const x1 = hasBar ? xScale(start) : 0;
                const x2 = hasBar ? xScale(end) : 0;
                const width = hasBar ? Math.max(2, x2 - x1) : 0;
                const barY = y + 7;
                const barH = row.nodeType === 'task' ? 18 : 12;
                const barColor = typeColor[row.nodeType];
                return (
                  <g key={row.key}>
                    <rect x={0} y={y} width={timelineWidth} height={ROW_HEIGHT} fill={isAlt ? 'rgba(255,255,255,0.02)' : 'transparent'} />
                    {hasBar && (
                      <>
                        <rect x={x1} y={barY} width={width} height={barH} rx={4} ry={4} fill={row.nodeType === 'task' ? barColor : `${barColor}88`} stroke={barColor} strokeWidth={row.nodeType === 'task' ? 1 : 0.8} />
                        {row.nodeType === 'task' && (
                          <rect x={x1} y={barY} width={Math.max(2, width * (row.percentComplete / 100))} height={barH} rx={4} ry={4} fill={row.percentComplete >= 75 ? '#22c55e' : row.percentComplete >= 45 ? '#eab308' : '#f97316'} />
                        )}
                      </>
                    )}
                  </g>
                );
              })}

              {renderRows.flatMap((row, localIndex) => {
                const targetIndex = startIndex + localIndex;
                const targetStart = row.startDate ? new Date(row.startDate) : null;
                if (!targetStart || Number.isNaN(targetStart.getTime())) return [];

                const targetY = targetIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                const targetX = xScale(targetStart);

                return row.predecessors
                  .map((predId) => {
                    const sourceIndex = rowIndexByTaskId.get(normalizeTaskRef(predId));
                    if (sourceIndex == null || sourceIndex < startIndex || sourceIndex >= endIndex) return null;

                    const sourceRow = visibleRows[sourceIndex];
                    const sourceEnd = sourceRow?.endDate ? new Date(sourceRow.endDate) : null;
                    if (!sourceEnd || Number.isNaN(sourceEnd.getTime())) return null;

                    const sourceY = sourceIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                    const sourceX = xScale(sourceEnd);
                    const cp1 = sourceX + 24;
                    const cp2 = targetX - 24;
                    const path = `M${sourceX},${sourceY} C${cp1},${sourceY} ${cp2},${targetY} ${targetX},${targetY}`;

                    return <path key={`${row.key}-${predId}`} d={path} fill="none" stroke="#40E0D0" strokeWidth={1.4} markerEnd="url(#v2-arrow)" strokeLinecap="round" />;
                  })
                  .filter((shape): shape is JSX.Element => shape !== null);
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
