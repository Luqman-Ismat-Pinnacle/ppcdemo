'use client';

/**
 * QC (Quality Control) dashboard transformations.
 */

import type { SampleData } from '@/types/data';

export function buildQCTransactionByGate(data: Partial<SampleData>) {
  const qctasks = data.qctasks || [];

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  // Define QC gates
  const gates = ['Initial Review', 'Mid Review', 'Final Review', 'Post-Validation'];

  // Use actual QC tasks data
  const gateCounts = new Map<string, number>();
  qctasks.forEach((qc: any) => {
    const gate = qc.qcType || qc.gate || 'Final Review';
    gateCounts.set(gate, (gateCounts.get(gate) || 0) + 1);
  });

  return gates.map(gate => ({
    gate,
    count: gateCounts.get(gate) || 0,
    project: ''
  }));
}

export function buildQCTransactionByProject(data: Partial<SampleData>) {
  const projects = data.projects || [];
  const customers = data.customers || [];
  const sites = data.sites || [];
  const portfolios = data.portfolios || [];
  const qctasks = data.qctasks || [];
  const tasks = data.tasks || [];

  // Return empty array if no data
  if (projects.length === 0 || qctasks.length === 0) {
    return [];
  }

  return projects.slice(0, 6).map((p: any) => {
    const projectId = p.id || p.projectId;
    const projectName = p.name || projectId;
    // Use Map lookups - build maps if not already built
    const customerMap = new Map<string, any>();
    const siteMap = new Map<string, any>();
    const portfolioMap = new Map<string, any>();
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

    // Use Map lookups instead of find() - O(1) instead of O(n)
    const customerId = p.customerId || p.customer_id;
    const siteId = p.siteId || p.site_id;
    const customer = customerId ? customerMap.get(customerId) : null;
    const site = siteId ? siteMap.get(siteId) : null;
    const portfolioId = customer?.portfolioId || customer?.portfolio_id;
    const portfolio = portfolioId ? portfolioMap.get(portfolioId) : null;

    // Count QC tasks for this project
    const projectQC = qctasks.filter((qc: any) => {
      if (qc.projectId === projectId) return true;
      if (qc.parentTaskId) {
        const parentTask = tasks.find((t: any) => (t.id || t.taskId) === qc.parentTaskId);
        return parentTask?.projectId === projectId;
      }
      return false;
    });

    // Count by status
    const unprocessed = projectQC.filter((qc: any) => !qc.qcStatus || qc.qcStatus === 'Pending' || qc.qcStatus === 'In Progress').length;
    const pass = projectQC.filter((qc: any) => qc.qcStatus === 'Pass' || qc.qcStatus === 'Approved').length;
    const fail = projectQC.filter((qc: any) => qc.qcStatus === 'Fail' || qc.qcStatus === 'Rejected').length;

    return {
      projectId: projectName,
      customer: customer?.name || 'Customer',
      site: site?.name || 'Site',
      portfolio: portfolio?.name || 'Portfolio',
      unprocessed,
      pass,
      fail
    };
  }).filter(p => p.unprocessed + p.pass + p.fail > 0);
}

export function buildQCByGateStatus(data: Partial<SampleData>) {
  const qctasks = data.qctasks || [];
  const portfolios = data.portfolios || [];

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  const gates = ['Initial', 'Mid', 'Final', 'Post-Val'];

  return gates.map((gate) => {
    const gateQC = qctasks.filter((qc: any) =>
      (qc.qcType || '').includes(gate) || (qc.gate || '').includes(gate)
    );

    const unprocessed = gateQC.filter((qc: any) => !qc.qcStatus || qc.qcStatus === 'Pending' || qc.qcStatus === 'In Progress').length;
    const pass = gateQC.filter((qc: any) => qc.qcStatus === 'Pass' || qc.qcStatus === 'Approved').length;
    const fail = gateQC.filter((qc: any) => qc.qcStatus === 'Fail' || qc.qcStatus === 'Rejected').length;

    return {
      gate,
      unprocessed,
      pass,
      fail,
      portfolio: portfolios[0]?.name || 'Portfolio'
    };
  }).filter(g => g.unprocessed + g.pass + g.fail > 0);
}

export function buildQCByNameAndRole(data: Partial<SampleData>) {
  const employees = data.employees || [];
  const qctasks = data.qctasks || [];

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  // Get employees who have QC tasks
  const empIdsWithQC = new Set<string>();
  qctasks.forEach((qc: any) => {
    if (qc.employeeId) empIdsWithQC.add(qc.employeeId);
    if (qc.qcResourceId) empIdsWithQC.add(qc.qcResourceId);
  });

  const analysts = employees.filter((e: any) => {
    const empId = e.id || e.employeeId;
    return empIdsWithQC.has(empId);
  });

  if (analysts.length === 0) {
    return [];
  }

  return analysts.map((emp: any) => {
    const empId = emp.id || emp.employeeId;
    const empQC = qctasks.filter((qc: any) => qc.employeeId === empId || qc.qcResourceId === empId);

    const total = empQC.length;
    const pass = empQC.filter((qc: any) => {
      const status = (qc.qcStatus || '').toUpperCase();
      return status === 'PASS' || status === 'APPROVED';
    }).length;
    const closed = empQC.filter((qc: any) => {
      const status = (qc.qcStatus || '').toUpperCase();
      return status === 'PASS' || status === 'APPROVED' || status === 'FAIL' || status === 'REJECTED';
    }).length;
    const open = total - closed;
    const passRate = closed > 0 ? Math.round((pass / closed) * 100 * 10) / 10 : 0;
    const totalHours = empQC.reduce((sum: number, qc: any) => sum + (qc.qcHours || 0), 0);

    return {
      name: emp.name || 'Analyst',
      role: emp.jobTitle || emp.role || 'QA/QC',
      records: total,
      passRate,
      hours: Math.round(totalHours),
      openCount: open,
      closedCount: closed,
      passCount: pass,
    };
  });
}

export function buildQCBySubproject(data: Partial<SampleData>) {
  const projects = data.projects || [];
  const phases = data.phases || [];
  const qctasks = data.qctasks || [];

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  // Filter projects by isSubproject flag instead of using separate subprojects table
  const subprojects = projects.filter((p: any) => p.isSubproject === true || p.is_subproject === true);

  // Use subprojects, phases, or projects
  const items = subprojects.length > 0 ? subprojects : (phases.length > 0 ? phases : projects);

  if (items.length === 0) {
    return [];
  }

  return items.slice(0, 8).map((item: any) => {
    const itemId = item.id || item.subprojectId || item.phaseId || item.projectId;
    const itemQC = qctasks.filter((qc: any) => {
      // Try to match by project/phase/subproject
      return qc.projectId === itemId || qc.phaseId === itemId || qc.subprojectId === itemId;
    });

    const total = itemQC.length;
    const pass = itemQC.filter((qc: any) => qc.qcStatus === 'Pass' || qc.qcStatus === 'Approved').length;
    const passRate = total > 0 ? Math.round((pass / total) * 100) : 0;

    return {
      name: item.name || item.phaseName || 'Subproject',
      records: total,
      passRate
    };
  }).filter(item => item.records > 0);
}

export function buildExecuteHoursSinceLastQC(data: Partial<SampleData>) {
  const hours = data.hours || [];
  const qctasks = data.qctasks || [];
  const employees = data.employees || [];

  // Return empty array if no data
  if (hours.length === 0 || qctasks.length === 0) {
    return [];
  }

  // Get execute hours (non-QC charge codes)
  const executeHours = hours.filter((h: any) => {
    const chargeCode = (h.chargeCode || h.charge_code || '').toUpperCase();
    return !chargeCode.includes('QC') && h.isBillable !== false;
  });

  // Group QC tasks by employee to find last QC date
  const lastQCDateByEmployee = new Map<string, Date>();
  qctasks.forEach((qc: any) => {
    const empId = qc.employeeId || qc.qcResourceId;
    if (!empId) return;

    const qcDate = qc.qcEndDate || qc.qcStartDate || qc.actualEndDate || qc.actualStartDate;
    if (!qcDate) return;

    const date = new Date(qcDate);
    if (isNaN(date.getTime())) return;

    const existing = lastQCDateByEmployee.get(empId);
    if (!existing || date > existing) {
      lastQCDateByEmployee.set(empId, date);
    }
  });

  // Calculate hours since last QC for each employee
  const employeeHours = new Map<string, number>();
  executeHours.forEach((h: any) => {
    const empId = h.employeeId;
    if (!empId) return;

    const lastQCDate = lastQCDateByEmployee.get(empId);
    const hourDate = new Date(h.date || h.entry_date);
    if (isNaN(hourDate.getTime())) return;

    // If no QC date or hour is after last QC, count it
    if (!lastQCDate || hourDate > lastQCDate) {
      const current = employeeHours.get(empId) || 0;
      employeeHours.set(empId, current + (h.hours || 0));
    }
  });

  // Build result array
  return Array.from(employeeHours.entries())
    .map(([empId, hours]) => {
      const emp = employees.find((e: any) => (e.id || e.employeeId) === empId);
      return {
        employeeId: empId,
        employeeName: emp?.name || empId,
        hours: Math.round(hours * 100) / 100,
      };
    })
    .sort((a, b) => b.hours - a.hours);
}

/**
 * Calculate EX hours to QC check ratio for each employee
 */
export function buildEXHoursToQCRatio(data: Partial<SampleData>) {
  const hours = data.hours || [];
  const qctasks = data.qctasks || [];
  const employees = data.employees || [];

  // Return empty array if no data
  if (hours.length === 0 || qctasks.length === 0) {
    return [];
  }

  // Get execute hours
  const executeHours = hours.filter((h: any) => {
    const chargeCode = (h.chargeCode || h.charge_code || '').toUpperCase();
    return !chargeCode.includes('QC') && h.isBillable !== false;
  });

  // Count QC checks and total hours by employee
  const qcCountByEmployee = new Map<string, number>();
  const hoursByEmployee = new Map<string, number>();

  qctasks.forEach((qc: any) => {
    const empId = qc.employeeId || qc.qcResourceId;
    if (empId) {
      qcCountByEmployee.set(empId, (qcCountByEmployee.get(empId) || 0) + 1);
    }
  });

  executeHours.forEach((h: any) => {
    const empId = h.employeeId;
    if (empId) {
      hoursByEmployee.set(empId, (hoursByEmployee.get(empId) || 0) + (h.hours || 0));
    }
  });

  // Calculate ratio
  return Array.from(hoursByEmployee.entries())
    .map(([empId, totalHours]) => {
      const qcCount = qcCountByEmployee.get(empId) || 0;
      const ratio = qcCount > 0 ? totalHours / qcCount : totalHours;
      const emp = employees.find((e: any) => (e.id || e.employeeId) === empId);
      return {
        employeeId: empId,
        employeeName: emp?.name || empId,
        hours: Math.round(totalHours * 100) / 100,
        qcCount,
        ratio: Math.round(ratio * 100) / 100,
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/**
 * Calculate execute hours since last QC check by project
 */
export function buildExecuteHoursSinceLastQCByProject(data: Partial<SampleData>) {
  const hours = data.hours || [];
  const qctasks = data.qctasks || [];
  const projects = data.projects || [];

  // Return empty array if no data
  if (hours.length === 0 || qctasks.length === 0) {
    return [];
  }

  // Get execute hours
  const executeHours = hours.filter((h: any) => {
    const chargeCode = (h.chargeCode || h.charge_code || '').toUpperCase();
    return !chargeCode.includes('QC') && h.isBillable !== false;
  });

  // Find last QC date by project
  const lastQCDateByProject = new Map<string, Date>();
  qctasks.forEach((qc: any) => {
    const projectId = qc.projectId;
    if (!projectId) return;

    const qcDate = qc.qcEndDate || qc.qcStartDate || qc.actualEndDate || qc.actualStartDate;
    if (!qcDate) return;

    const date = new Date(qcDate);
    if (isNaN(date.getTime())) return;

    const existing = lastQCDateByProject.get(projectId);
    if (!existing || date > existing) {
      lastQCDateByProject.set(projectId, date);
    }
  });

  // Calculate hours since last QC by project
  const projectHours = new Map<string, number>();
  executeHours.forEach((h: any) => {
    const projectId = h.projectId;
    if (!projectId) return;

    const lastQCDate = lastQCDateByProject.get(projectId);
    const hourDate = new Date(h.date || h.entry_date);
    if (isNaN(hourDate.getTime())) return;

    if (!lastQCDate || hourDate > lastQCDate) {
      const current = projectHours.get(projectId) || 0;
      projectHours.set(projectId, current + (h.hours || 0));
    }
  });

  return Array.from(projectHours.entries())
    .map(([projectId, hours]) => {
      const project = projects.find((p: any) => (p.id || p.projectId) === projectId);
      return {
        projectId,
        projectName: project?.name || projectId,
        hours: Math.round(hours * 100) / 100,
      };
    })
    .sort((a, b) => b.hours - a.hours);
}

/**
 * Calculate QC hours since last QC check for each employee
 */
export function buildQCHoursSinceLastQC(data: Partial<SampleData>) {
  const hours = data.hours || [];
  const qctasks = data.qctasks || [];
  const employees = data.employees || [];

  // Return empty array if no data
  if (hours.length === 0 || qctasks.length === 0) {
    return [];
  }

  // Get QC hours
  const qcHours = hours.filter((h: any) => {
    const chargeCode = (h.chargeCode || h.charge_code || '').toUpperCase();
    return chargeCode.includes('QC');
  });

  // Find last QC check date by employee
  const lastQCDateByEmployee = new Map<string, Date>();
  qctasks.forEach((qc: any) => {
    const empId = qc.employeeId || qc.qcResourceId;
    if (!empId) return;

    const qcDate = qc.qcEndDate || qc.qcStartDate || qc.actualEndDate || qc.actualStartDate;
    if (!qcDate) return;

    const date = new Date(qcDate);
    if (isNaN(date.getTime())) return;

    const existing = lastQCDateByEmployee.get(empId);
    if (!existing || date > existing) {
      lastQCDateByEmployee.set(empId, date);
    }
  });

  // Calculate QC hours since last QC check
  const employeeHours = new Map<string, number>();
  qcHours.forEach((h: any) => {
    const empId = h.employeeId;
    if (!empId) return;

    const lastQCDate = lastQCDateByEmployee.get(empId);
    const hourDate = new Date(h.date || h.entry_date);
    if (isNaN(hourDate.getTime())) return;

    if (!lastQCDate || hourDate > lastQCDate) {
      const current = employeeHours.get(empId) || 0;
      employeeHours.set(empId, current + (h.hours || 0));
    }
  });

  return Array.from(employeeHours.entries())
    .map(([empId, hours]) => {
      const emp = employees.find((e: any) => (e.id || e.employeeId) === empId);
      return {
        employeeId: empId,
        employeeName: emp?.name || empId,
        hours: Math.round(hours * 100) / 100,
      };
    })
    .sort((a, b) => b.hours - a.hours);
}

/**
 * Calculate QC hours to QC check ratio for each employee
 */
export function buildQCHoursToQCRatio(data: Partial<SampleData>) {
  const hours = data.hours || [];
  const qctasks = data.qctasks || [];
  const employees = data.employees || [];

  // Return empty array if no data
  if (hours.length === 0 || qctasks.length === 0) {
    return [];
  }

  // Get QC hours
  const qcHours = hours.filter((h: any) => {
    const chargeCode = (h.chargeCode || h.charge_code || '').toUpperCase();
    return chargeCode.includes('QC');
  });

  // Count QC checks and total QC hours by employee
  const qcCountByEmployee = new Map<string, number>();
  const hoursByEmployee = new Map<string, number>();

  qctasks.forEach((qc: any) => {
    const empId = qc.employeeId || qc.qcResourceId;
    if (empId) {
      qcCountByEmployee.set(empId, (qcCountByEmployee.get(empId) || 0) + 1);
    }
  });

  qcHours.forEach((h: any) => {
    const empId = h.employeeId;
    if (empId) {
      hoursByEmployee.set(empId, (hoursByEmployee.get(empId) || 0) + (h.hours || 0));
    }
  });

  return Array.from(hoursByEmployee.entries())
    .map(([empId, totalHours]) => {
      const qcCount = qcCountByEmployee.get(empId) || 0;
      const ratio = qcCount > 0 ? totalHours / qcCount : totalHours;
      const emp = employees.find((e: any) => (e.id || e.employeeId) === empId);
      return {
        employeeId: empId,
        employeeName: emp?.name || empId,
        hours: Math.round(totalHours * 100) / 100,
        qcCount,
        ratio: Math.round(ratio * 100) / 100,
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/**
 * Calculate QC hours since last QC check by project and subproject
 */
export function buildQCHoursSinceLastQCByProject(data: Partial<SampleData>) {
  const hours = data.hours || [];
  const qctasks = data.qctasks || [];
  const projects = data.projects || [];
  // Filter projects by isSubproject flag instead of using separate subprojects table
  const subprojects = projects.filter((p: any) => p.isSubproject === true || p.is_subproject === true);

  // Return empty array if no data
  if (hours.length === 0 || qctasks.length === 0) {
    return [];
  }

  // Get QC hours
  const qcHours = hours.filter((h: any) => {
    const chargeCode = (h.chargeCode || h.charge_code || '').toUpperCase();
    return chargeCode.includes('QC');
  });

  // Find last QC date by project
  const lastQCDateByProject = new Map<string, Date>();
  qctasks.forEach((qc: any) => {
    const projectId = qc.projectId;
    if (!projectId) return;

    const qcDate = qc.qcEndDate || qc.qcStartDate || qc.actualEndDate || qc.actualStartDate;
    if (!qcDate) return;

    const date = new Date(qcDate);
    if (isNaN(date.getTime())) return;

    const existing = lastQCDateByProject.get(projectId);
    if (!existing || date > existing) {
      lastQCDateByProject.set(projectId, date);
    }
  });

  // Calculate hours by project and subproject
  const projectSubprojectHours = new Map<string, { projectId: string; subprojectId?: string; hours: number }>();

  qcHours.forEach((h: any) => {
    const projectId = h.projectId;
    if (!projectId) return;

    const lastQCDate = lastQCDateByProject.get(projectId);
    const hourDate = new Date(h.date || h.entry_date);
    if (isNaN(hourDate.getTime())) return;

    if (!lastQCDate || hourDate > lastQCDate) {
      const subprojectId = h.subprojectId || '';
      const key = `${projectId}-${subprojectId}`;
      const current = projectSubprojectHours.get(key);
      projectSubprojectHours.set(key, {
        projectId,
        subprojectId: subprojectId || undefined,
        hours: (current?.hours || 0) + (h.hours || 0),
      });
    }
  });

  return Array.from(projectSubprojectHours.values())
    .map((item) => {
      const project = projects.find((p: any) => (p.id || p.projectId) === item.projectId);
      // Find subproject from filtered projects list
      const subproject = item.subprojectId
        ? subprojects.find((s: any) => (s.id || s.projectId) === item.subprojectId)
        : null;
      return {
        projectId: item.projectId,
        projectName: project?.name || item.projectId,
        subprojectId: item.subprojectId,
        subprojectName: subproject?.name || item.subprojectId || '(Blank)',
        hours: Math.round(item.hours * 100) / 100,
      };
    })
    .sort((a, b) => b.hours - a.hours);
}

/**
 * Calculate QC pass and fail by task/subproject
 */
export function buildQCPassFailByTask(data: Partial<SampleData>) {
  const qctasks = data.qctasks || [];
  const tasks = data.tasks || [];
  const projects = data.projects || [];
  // Filter projects by isSubproject flag instead of using separate subprojects table
  const subprojects = projects.filter((p: any) => p.isSubproject === true || p.is_subproject === true);

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  // Group by task/subproject
  const taskMap = new Map<string, { name: string; pass: number; fail: number }>();

  qctasks.forEach((qc: any) => {
    // Try to find task or subproject
    const taskId = qc.parentTaskId || qc.taskId;
    const subprojectId = qc.subprojectId;

    let key = '';
    let name = '';

    if (subprojectId) {
      const subproject = subprojects.find((s: any) => (s.id || s.projectId) === subprojectId);
      key = `subproject-${subprojectId}`;
      name = subproject?.name || subprojectId || '(Blank)';
    } else if (taskId) {
      const task = tasks.find((t: any) => (t.id || t.taskId) === taskId);
      key = `task-${taskId}`;
      name = task?.taskName || (task as any)?.name || taskId || '(Blank)';
    } else {
      key = 'blank';
      name = '(Blank)';
    }

    const existing = taskMap.get(key) || { name, pass: 0, fail: 0 };
    const status = (qc.qcStatus || '').toUpperCase();
    if (status === 'PASS' || status === 'APPROVED') {
      existing.pass++;
    } else if (status === 'FAIL' || status === 'REJECTED') {
      existing.fail++;
    }
    taskMap.set(key, existing);
  });

  return Array.from(taskMap.values())
    .filter(item => item.pass > 0 || item.fail > 0)
    .sort((a, b) => (b.pass + b.fail) - (a.pass + a.fail));
}

/**
 * Calculate QC feedback time (days to close) by task/subproject
 */
export function buildQCFeedbackTimeByTask(data: Partial<SampleData>) {
  const qctasks = data.qctasks || [];
  const tasks = data.tasks || [];
  const projects = data.projects || [];
  // Filter projects by isSubproject flag instead of using separate subprojects table
  const subprojects = projects.filter((p: any) => p.isSubproject === true || p.is_subproject === true);

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  // Group by task/subproject and calculate average days
  const taskMap = new Map<string, { name: string; days: number[] }>();

  qctasks.forEach((qc: any) => {
    const startDate = qc.qcStartDate || qc.actualStartDate;
    const endDate = qc.qcEndDate || qc.actualEndDate;
    if (!startDate || !endDate) return;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    const taskId = qc.parentTaskId || qc.taskId;
    const subprojectId = qc.subprojectId;

    let key = '';
    let name = '';

    if (subprojectId) {
      const subproject = subprojects.find((s: any) => (s.id || s.projectId) === subprojectId);
      key = `subproject-${subprojectId}`;
      name = subproject?.name || subprojectId || '(Blank)';
    } else if (taskId) {
      const task = tasks.find((t: any) => (t.id || t.taskId) === taskId);
      key = `task-${taskId}`;
      name = task?.taskName || (task as any)?.name || taskId || '(Blank)';
    } else {
      key = 'blank';
      name = '(Blank)';
    }

    const existing = taskMap.get(key) || { name, days: [] };
    existing.days.push(days);
    taskMap.set(key, existing);
  });

  return Array.from(taskMap.entries())
    .map(([key, item]) => ({
      name: item.name,
      avgDays: item.days.length > 0
        ? Math.round((item.days.reduce((a, b) => a + b, 0) / item.days.length) * 100) / 100
        : 0,
    }))
    .filter(item => item.avgDays > 0)
    .sort((a, b) => b.avgDays - a.avgDays);
}

/**
 * Calculate QC pass rate per month
 */
export function buildQCPassRatePerMonth(data: Partial<SampleData>) {
  const qctasks = data.qctasks || [];

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  // Group by month
  const monthMap = new Map<string, { pass: number; total: number; label: string }>();

  qctasks.forEach((qc: any) => {
    const date = qc.qcEndDate || qc.qcStartDate || qc.actualEndDate || qc.actualStartDate;
    if (!date) return;

    const d = new Date(date);
    if (isNaN(d.getTime())) return;

    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    const existing = monthMap.get(monthKey) || { pass: 0, total: 0, label: monthLabel };
    existing.total++;

    const status = (qc.qcStatus || '').toUpperCase();
    if (status === 'PASS' || status === 'APPROVED') {
      existing.pass++;
    }

    monthMap.set(monthKey, existing);
  });

  return Array.from(monthMap.entries())
    .map(([key, item]) => ({
      month: key,
      monthLabel: item.label || key,
      passRate: item.total > 0 ? Math.round((item.pass / item.total) * 100 * 10) / 10 : 0,
      pass: item.pass,
      total: item.total,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Calculate QC outcomes (pass/fail) by month
 */
export function buildQCOutcomesByMonth(data: Partial<SampleData>) {
  const qctasks = data.qctasks || [];

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  // Group by month
  const monthMap = new Map<string, { pass: number; fail: number; label: string }>();

  qctasks.forEach((qc: any) => {
    const date = qc.qcEndDate || qc.qcStartDate || qc.actualEndDate || qc.actualStartDate;
    if (!date) return;

    const d = new Date(date);
    if (isNaN(d.getTime())) return;

    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    const existing = monthMap.get(monthKey) || { pass: 0, fail: 0, label: monthLabel };

    const status = (qc.qcStatus || '').toUpperCase();
    if (status === 'PASS' || status === 'APPROVED') {
      existing.pass++;
    } else if (status === 'FAIL' || status === 'REJECTED') {
      existing.fail++;
    }

    monthMap.set(monthKey, existing);
  });

  return Array.from(monthMap.entries())
    .map(([key, item]) => ({
      month: key,
      monthLabel: item.label || key,
      pass: item.pass,
      fail: item.fail,
      total: item.pass + item.fail,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Calculate QC feedback time (takt time) by month
 */
export function buildQCFeedbackTimeByMonth(data: Partial<SampleData>) {
  const qctasks = data.qctasks || [];

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  // Group by month
  const monthMap = new Map<string, { days: number[]; label: string }>();

  qctasks.forEach((qc: any) => {
    const startDate = qc.qcStartDate || qc.actualStartDate;
    const endDate = qc.qcEndDate || qc.actualEndDate;
    if (!startDate || !endDate) return;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    const monthKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    const existing = monthMap.get(monthKey) || { days: [], label: monthLabel };
    existing.days.push(days);
    monthMap.set(monthKey, existing);
  });

  return Array.from(monthMap.entries())
    .map(([key, item]) => ({
      month: key,
      monthLabel: item.label || key,
      avgDays: item.days.length > 0
        ? Math.round((item.days.reduce((a, b) => a + b, 0) / item.days.length) * 100) / 100
        : 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ============================================================================
// MILESTONE TRACKER TRANSFORMATIONS
