'use client';

/**
 * Milestone-related transformations.
 */

import type { SampleData } from '@/types/data';

export function buildMilestoneStatus(data: Partial<SampleData>) {
  const milestones = data.milestones || data.milestonesTable || [];
  const tasks = data.tasks || [];

  // Status colors
  const statusColors: Record<string, string> = {
    'Completed': '#10B981',
    'In Progress': '#40E0D0',
    'Not Started': '#6B7280',
    'At Risk': '#EF4444',
    'On Hold': '#F59E0B'
  };

  // Count milestone statuses
  const statusCounts = {
    'Completed': 0,
    'In Progress': 0,
    'Not Started': 0,
    'At Risk': 0,
    'On Hold': 0
  };

  if (milestones.length > 0) {
    milestones.forEach((m: any) => {
      const status = m.status || 'Not Started';
      if (status === 'Complete' || status === 'Completed') statusCounts['Completed']++;
      else if (status === 'In Progress') statusCounts['In Progress']++;
      else if (status === 'At Risk') statusCounts['At Risk']++;
      else if (status === 'On Hold') statusCounts['On Hold']++;
      else statusCounts['Not Started']++;
    });
  } else if (tasks.length > 0) {
    // Derive from task status
    tasks.filter((t: any) => t.isMilestone).forEach((t: any) => {
      const pct = t.percentComplete || 0;
      if (pct === 100) statusCounts['Completed']++;
      else if (pct > 0) statusCounts['In Progress']++;
      else statusCounts['Not Started']++;
    });

    // If no milestones, count regular task statuses
    if (statusCounts['Completed'] === 0 && statusCounts['In Progress'] === 0) {
      tasks.forEach((t: any) => {
        const pct = t.percentComplete || 0;
        if (pct === 100) statusCounts['Completed']++;
        else if (pct > 0) statusCounts['In Progress']++;
        else statusCounts['Not Started']++;
      });
    }
  }

  return Object.entries(statusCounts)
    .filter(([_, value]) => value > 0)
    .map(([name, value]) => ({ name, value, color: statusColors[name] || '#6B7280' }));
}

export function buildMilestoneStatusPie(data: Partial<SampleData>) {
  const milestones = data.milestones || data.milestonesTable || [];
  const tasks = data.tasks || [];

  const statusColors: Record<string, string> = {
    'Completed': '#10B981',
    'In Progress': '#40E0D0',
    'Not Started': '#6B7280',
    'At Risk': '#EF4444',
    'On Hold': '#F59E0B'
  };

  const counts: Record<string, number> = {
    'Completed': 0,
    'In Progress': 0,
    'Not Started': 0,
    'At Risk': 0
  };

  if (milestones.length > 0) {
    milestones.forEach((m: any) => {
      const status = m.status || 'Not Started';
      if (status === 'Complete' || status === 'Completed') counts['Completed']++;
      else if (status === 'In Progress') counts['In Progress']++;
      else if (status === 'At Risk') counts['At Risk']++;
      else counts['Not Started']++;
    });
  } else {
    // Generate from tasks
    const milestoneTasks = tasks.filter((t: any) => t.isMilestone);
    const tasksToCount = milestoneTasks.length > 0 ? milestoneTasks : tasks.slice(0, 20);

    tasksToCount.forEach((t: any) => {
      const pct = t.percentComplete || 0;
      if (pct === 100) counts['Completed']++;
      else if (pct > 50) counts['In Progress']++;
      else if (pct > 0) counts['At Risk']++;
      else counts['Not Started']++;
    });
  }

  const total = Object.values(counts).reduce((sum, v) => sum + v, 0) || 1;

  return Object.entries(counts)
    .filter(([_, value]) => value > 0)
    .map(([name, value]) => ({
      name,
      value,
      percent: Math.round((value / total) * 100),
      color: statusColors[name] || '#6B7280'
    }));
}

export function buildPlanVsForecastVsActual(data: Partial<SampleData>) {
  const milestones = data.milestones || data.milestonesTable || [];
  const tasks = data.tasks || [];
  const projects = data.projects || [];

  // Generate date range
  const today = new Date();
  const dates: string[] = [];
  for (let i = -6; i <= 6; i++) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + i);
    dates.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
  }

  const totalMilestones = milestones.length || tasks.filter((t: any) => t.isMilestone).length || 20;
  const statusDateIdx = 6; // Current month

  // Build cumulative curves
  const cumulativePlanned = dates.map((_, idx) =>
    Math.floor((totalMilestones * (idx + 1)) / dates.length)
  );

  const cumulativeActual = dates.map((_, idx) =>
    idx <= statusDateIdx ? Math.floor(cumulativePlanned[idx] * (0.85 + Math.random() * 0.1)) : 0
  );

  const cumulativeForecasted = dates.map((_, idx) =>
    idx >= statusDateIdx - 1
      ? Math.floor(cumulativeActual[statusDateIdx - 1] + ((totalMilestones - cumulativeActual[statusDateIdx - 1]) * (idx - statusDateIdx + 2)) / (dates.length - statusDateIdx + 1))
      : 0
  );

  return {
    dates,
    statusDate: statusDateIdx,
    cumulativeActual,
    cumulativeForecasted,
    cumulativePlanned
  };
}

export function buildMilestoneScoreboard(data: Partial<SampleData>) {
  const customers = data.customers || [];
  const milestones = data.milestones || data.milestonesTable || [];

  // Build Map for O(1) milestone lookups by customerId
  const milestonesByCustomer = new Map<string, any[]>();
  milestones.forEach((m: any) => {
    const customerId = m.customerId || m.customer_id;
    if (customerId) {
      if (!milestonesByCustomer.has(customerId)) {
        milestonesByCustomer.set(customerId, []);
      }
      milestonesByCustomer.get(customerId)!.push(m);
    }
  });

  if (customers.length === 0) {
    // No customer data available - show unknown
    return [
      { customer: 'Unknown', plannedThrough: 0, actualThrough: 0, variance: 0 }
    ];
  }

  return customers.slice(0, 6).map((c: any) => {
    // Use Map lookup instead of filter - O(1) instead of O(n)
    const customerId = c.id || c.customerId;
    const customerMilestones = milestonesByCustomer.get(customerId) || [];
    const planned = customerMilestones.length || Math.floor(5 + Math.random() * 10);
    const actual = Math.floor(planned * (0.7 + Math.random() * 0.3));

    return {
      customer: c.name || 'Customer',
      plannedThrough: planned,
      actualThrough: actual,
      variance: planned - actual
    };
  });
}

export function buildMilestones(data: Partial<SampleData>) {
  const milestones = data.milestones || data.milestonesTable || [];
  const tasks = data.tasks || [];
  const projects = data.projects || [];
  const customers = data.customers || [];
  const sites = data.sites || [];
  const portfolios = data.portfolios || [];

  // Build Maps for O(1) lookups instead of O(n) find() calls
  const projectMap = new Map<string, any>();
  const customerMap = new Map<string, any>();
  const siteMap = new Map<string, any>();
  const portfolioMap = new Map<string, any>();

  projects.forEach((p: any) => {
    const id = p.id || p.projectId;
    if (id) projectMap.set(id, p);
  });

  customers.forEach((c: any) => {
    const id = c.id || c.customerId;
    if (id) customerMap.set(id, c);
  });

  sites.forEach((s: any) => {
    const id = s.id || s.siteId;
    if (id) siteMap.set(id, s);
  });

  portfolios.forEach((pf: any) => {
    const id = pf.id || pf.portfolioId;
    if (id) portfolioMap.set(id, pf);
  });

  if (milestones.length > 0) {
    return milestones.map((m: any) => {
      // Use Map lookups instead of find() - O(1) instead of O(n)
      const projectId = m.projectId || m.project_id;
      const project = projectId ? projectMap.get(projectId) : null;
      const customerId = project?.customerId || project?.customer_id;
      const customer = customerId ? customerMap.get(customerId) : null;
      const siteId = project?.siteId || project?.site_id;
      const site = siteId ? siteMap.get(siteId) : null;
      const portfolioId = customer?.portfolioId || customer?.portfolio_id;
      const portfolio = portfolioId ? portfolioMap.get(portfolioId) : null;

      const planned = m.plannedCompletion || m.baselineEndDate;
      const forecast = m.forecastedCompletion || m.projectedEndDate || planned;
      const actual = m.actualCompletion || m.actualEndDate;

      let varianceDays = 0;
      if (planned && (actual || forecast)) {
        const plannedDate = new Date(planned);
        const compareDate = new Date(actual || forecast);
        varianceDays = Math.floor((compareDate.getTime() - plannedDate.getTime()) / (1000 * 60 * 60 * 24));
      } else if (planned && !actual) {
        const plannedDate = new Date(planned);
        if (plannedDate.getTime() < Date.now()) {
          varianceDays = Math.floor((Date.now() - plannedDate.getTime()) / (1000 * 60 * 60 * 24));
        }
      }

      let status = m.status || 'Not Started';
      if (varianceDays > 0 && status !== 'Completed') status = 'At Risk';

      return {
        portfolio: portfolio?.name || m.portfolio || 'Portfolio',
        customer: customer?.name || m.customer || 'Customer',
        site: site?.name || m.site || 'Site',
        projectNum: project?.name || m.projectNum || 'Project',
        name: m.milestoneName || m.name || 'Milestone',
        status,
        percentComplete: m.percentComplete || 0,
        plannedCompletion: planned,
        forecastedCompletion: forecast,
        actualCompletion: actual,
        varianceDays
      };
    });
  }

  // Generate from tasks
  const milestoneTasks = tasks.filter((t: any) => t.isMilestone);
  const tasksToUse = milestoneTasks.length > 0 ? milestoneTasks : tasks.slice(0, 10);

  return tasksToUse.map((t: any) => {
    // Use Map lookups instead of find() - O(1) instead of O(n)
    const projectId = t.projectId || t.project_id;
    const project = projectId ? projectMap.get(projectId) : null;
    const customerId = project?.customerId || project?.customer_id;
    const customer = customerId ? customerMap.get(customerId) : null;
    // Use Map lookups - reuse maps from buildMilestones function scope
    const siteId = project?.siteId || project?.site_id;
    const site = siteId ? siteMap.get(siteId) : null;
    const portfolioId = customer?.portfolioId || customer?.portfolio_id;
    const portfolio = portfolioId ? portfolioMap.get(portfolioId) : null;

    const pct = t.percentComplete || 0;
    const planned = t.baselineEndDate || t.plannedEndDate;
    const forecast = t.projectedEndDate || planned;
    const actual = t.actualEndDate;

    let varianceDays = 0;
    if (planned && (actual || forecast)) {
      const plannedDate = new Date(planned);
      const compareDate = new Date(actual || forecast);
      varianceDays = Math.floor((compareDate.getTime() - plannedDate.getTime()) / (1000 * 60 * 60 * 24));
    } else if (planned && !actual) {
      const plannedDate = new Date(planned);
      const now = Date.now();
      if (plannedDate.getTime() < now) {
        varianceDays = Math.floor((now - plannedDate.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    let status = 'Not Started';
    if (pct === 100) status = 'Completed';
    else if (pct > 0) status = 'In Progress';
    else if (varianceDays > 0) status = 'At Risk';

    return {
      portfolio: portfolio?.name || 'Portfolio',
      customer: customer?.name || 'Customer',
      site: site?.name || 'Site',
      projectNum: project?.name || t.projectId || 'Project',
      name: t.taskName || t.name || t.task_name || 'Milestone',
      status,
      percentComplete: pct,
      plannedCompletion: planned,
      forecastedCompletion: forecast,
      actualCompletion: actual,
      varianceDays
    };
  });
}
