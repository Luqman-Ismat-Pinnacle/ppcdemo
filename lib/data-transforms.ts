'use client';

/**
 * @fileoverview Data Transformation Layer for PPC V3.
 * 
 * Transforms raw database table data into computed view structures
 * required by the visualization pages. This bridges the gap between
 * flat Supabase tables and the hierarchical/aggregated views the UI expects.
 * 
 * @module lib/data-transforms
 */

import type { SampleData, LaborBreakdown, ResourceHeatmap } from '@/types/data';

// WBS Item type for transformation (matches what WBS Gantt page expects)
interface TransformWBSItem {
  id: string;
  wbsCode: string;
  name: string;
  type: string;
  itemType: string;
  startDate?: string;
  endDate?: string;
  progress?: number;
  percentComplete?: number;
  baselineHours?: number;
  actualHours?: number;
  remainingHours?: number;
  baselineCost?: number;
  actualCost?: number;
  remainingCost?: number;
  daysRequired?: number;
  assignedResourceId?: string;
  isCritical?: boolean;
  predecessors?: any[];
  children?: TransformWBSItem[];
}

// ============================================================================
// WBS DATA TRANSFORMATION
// Builds hierarchical wbsData.items from flat tables
// ============================================================================

/**
 * Build WBS hierarchy from flat portfolio/customer/site/project/phase/task tables
 */
export function buildWBSData(data: Partial<SampleData>): { items: TransformWBSItem[] } {
  const items: TransformWBSItem[] = [];
  
  const portfolios = data.portfolios || [];
  const customers = data.customers || [];
  const sites = data.sites || [];
  const units = data.units || [];
  const projects = data.projects || [];
  const phases = data.phases || [];
  const tasks = data.tasks || [];
  const employees = data.employees || [];
  
  // Helper to get owner name from employeeId
  const getOwnerName = (employeeId: string | null): string | null => {
    if (!employeeId || employees.length === 0) return null;
    const owner = employees.find((e: any) => (e.id || e.employeeId) === employeeId);
    return owner?.name || null;
  };
  
  // Build hierarchy
  let wbsCounter = 1;
  
  portfolios.forEach((portfolio: any, pIdx: number) => {
    const portfolioId = portfolio.id || portfolio.portfolioId;
    const portfolioWbs = `${wbsCounter}`;
    
    const baselineHrs = portfolio.baselineHours || 0;
    const actualHrs = portfolio.actualHours || 0;
    const baselineCst = portfolio.baselineCost || 0;
    const actualCst = portfolio.actualCost || 0;
    
    // Calculate portfolio name as "Owner's Portfolio" using employeeId (Owner column)
    const ownerName = getOwnerName(portfolio.employeeId);
    const portfolioName = ownerName 
      ? `${ownerName}'s Portfolio`
      : (portfolio.name || `Portfolio ${pIdx + 1}`);
    
    const portfolioItem: TransformWBSItem = {
      id: `wbs-portfolio-${portfolioId}`,
      wbsCode: portfolioWbs,
      name: portfolioName,
      type: 'portfolio',
      itemType: 'portfolio',
      startDate: portfolio.startDate || portfolio.baselineStartDate,
      endDate: portfolio.endDate || portfolio.baselineEndDate,
      percentComplete: portfolio.percentComplete || 0,
      baselineHours: baselineHrs,
      actualHours: actualHrs,
      remainingHours: portfolio.remainingHours ?? Math.max(0, baselineHrs - actualHrs),
      baselineCost: baselineCst,
      actualCost: actualCst,
      remainingCost: portfolio.remainingCost ?? Math.max(0, baselineCst - actualCst),
      children: []
    };
    
    // Find customers for this portfolio
    const portfolioCustomers = customers.filter((c: any) => 
      (c.portfolioId === portfolioId) || (!c.portfolioId)
    );
    
    portfolioCustomers.forEach((customer: any, cIdx: number) => {
      const customerId = customer.id || customer.customerId;
      const customerWbs = `${portfolioWbs}.${cIdx + 1}`;
      
      const customerItem: TransformWBSItem = {
        id: `wbs-customer-${customerId}`,
        wbsCode: customerWbs,
        name: customer.name || `Customer ${cIdx + 1}`,
        type: 'customer',
        itemType: 'customer',
        startDate: customer.startDate,
        endDate: customer.endDate,
        percentComplete: 0,
        children: []
      };
      
      // Find sites for this customer
      const customerSites = sites.filter((s: any) => s.customerId === customerId);
      
      customerSites.forEach((site: any, sIdx: number) => {
        const siteId = site.id || site.siteId;
        const siteWbs = `${customerWbs}.${sIdx + 1}`;
        
        const siteItem: TransformWBSItem = {
          id: `wbs-site-${siteId}`,
          wbsCode: siteWbs,
          name: site.name || `Site ${sIdx + 1}`,
          type: 'site',
          itemType: 'site',
          children: []
        };
        
        // Find units for this site
        const siteUnits = units.filter((u: any) => u.siteId === siteId);
        
        siteUnits.forEach((unit: any, uIdx: number) => {
          const unitId = unit.id || unit.unitId;
          const unitWbs = `${siteWbs}.${uIdx + 1}`;
          
          const unitItem: TransformWBSItem = {
            id: `wbs-unit-${unitId}`,
            wbsCode: unitWbs,
            name: unit.name || `Unit ${uIdx + 1}`,
            type: 'unit',
            itemType: 'unit',
            startDate: unit.baselineStartDate,
            endDate: unit.baselineEndDate,
            percentComplete: unit.percentComplete || 0,
            baselineHours: unit.baselineHours || 0,
            actualHours: unit.actualHours || 0,
            remainingHours: unit.remainingHours ?? Math.max(0, (unit.baselineHours || 0) - (unit.actualHours || 0)),
            baselineCost: unit.baselineCost || 0,
            actualCost: unit.actualCost || 0,
            remainingCost: unit.remainingCost ?? Math.max(0, (unit.baselineCost || 0) - (unit.actualCost || 0)),
            children: []
          };
          
          // Find projects for this unit
          const unitProjects = projects.filter((p: any) => p.unitId === unitId);
          
          unitProjects.forEach((project: any, prIdx: number) => {
            const projectId = project.id || project.projectId;
            const projectWbs = `${unitWbs}.${prIdx + 1}`;
            
            const projBaselineHrs = project.baselineHours || project.budgetHours || 0;
            const projActualHrs = project.actualHours || 0;
            const projBaselineCst = project.baselineCost || project.budgetCost || 0;
            const projActualCst = project.actualCost || 0;
            
            const projectItem: TransformWBSItem = {
              id: `wbs-project-${projectId}`,
              wbsCode: projectWbs,
              name: project.name || project.projectNumber || `Project ${prIdx + 1}`,
              type: 'project',
              itemType: 'project',
              startDate: project.startDate || project.baselineStartDate,
              endDate: project.endDate || project.baselineEndDate,
              percentComplete: project.percentComplete || 0,
              baselineHours: projBaselineHrs,
              actualHours: projActualHrs,
              remainingHours: project.remainingHours ?? Math.max(0, projBaselineHrs - projActualHrs),
              baselineCost: projBaselineCst,
              actualCost: projActualCst,
              remainingCost: project.remainingCost ?? Math.max(0, projBaselineCst - projActualCst),
              children: []
            };
            
            // Find phases for this project (nested inside unit project)
            const projectPhases = phases.filter((ph: any) => ph.projectId === projectId);
            
            projectPhases.forEach((phase: any, phIdx: number) => {
              const phaseId = phase.id || phase.phaseId;
              const phaseWbs = `${projectWbs}.${phIdx + 1}`;
              
              const phaseItem: TransformWBSItem = {
                id: `wbs-phase-${phaseId}`,
                wbsCode: phaseWbs,
                name: phase.name || `Phase ${phIdx + 1}`,
                type: 'phase',
                itemType: 'phase',
                startDate: phase.startDate,
                endDate: phase.endDate,
                percentComplete: phase.percentComplete || 0,
                children: []
              };
              
              // Find tasks for this phase
              const phaseTasks = tasks.filter((t: any) => t.phaseId === phaseId);
              
              phaseTasks.forEach((task: any, tIdx: number) => {
                const taskId = task.id || task.taskId;
                const taskWbs = `${phaseWbs}.${tIdx + 1}`;
                
                const taskBaselineHrs = task.baselineHours || task.budgetHours || 0;
                const taskActualHrs = task.actualHours || 0;
                const taskBaselineCst = task.baselineCost || 0;
                const taskActualCst = task.actualCost || 0;
                
                const taskItem: TransformWBSItem = {
                  id: `wbs-task-${taskId}`,
                  wbsCode: taskWbs,
                  name: task.name || task.taskName || `Task ${tIdx + 1}`,
                  type: 'task',
                  itemType: 'task',
                  startDate: task.baselineStartDate || task.startDate,
                  endDate: task.baselineEndDate || task.endDate,
                  daysRequired: task.daysRequired || task.duration || 1,
                  percentComplete: task.percentComplete || 0,
                  baselineHours: taskBaselineHrs,
                  actualHours: taskActualHrs,
                  remainingHours: task.remainingHours ?? Math.max(0, taskBaselineHrs - taskActualHrs),
                  baselineCost: taskBaselineCst,
                  actualCost: taskActualCst,
                  remainingCost: task.remainingCost ?? Math.max(0, taskBaselineCst - taskActualCst),
                  assignedResourceId: task.assignedResourceId || task.employeeId || task.assigneeId,
                  isCritical: task.isCritical || false,
                  predecessors: task.predecessors || []
                };
                
                phaseItem.children?.push(taskItem);
              });
              
              projectItem.children?.push(phaseItem);
            });
            
            unitItem.children?.push(projectItem);
          });
          
          siteItem.children?.push(unitItem);
        });
        
        // Find projects directly under site (no unit)
        const siteProjects = projects.filter((p: any) => p.siteId === siteId && !p.unitId);
        
        siteProjects.forEach((project: any, prIdx: number) => {
          const projectId = project.id || project.projectId;
          const projectWbs = `${siteWbs}.${prIdx + 1}`;
          
          const projBaselineHrs = project.baselineHours || project.budgetHours || 0;
          const projActualHrs = project.actualHours || 0;
          const projBaselineCst = project.baselineCost || project.budgetCost || 0;
          const projActualCst = project.actualCost || 0;
          
          const projectItem: TransformWBSItem = {
            id: `wbs-project-${projectId}`,
            wbsCode: projectWbs,
            name: project.name || project.projectNumber || `Project ${prIdx + 1}`,
            type: 'project',
            itemType: 'project',
            startDate: project.startDate || project.baselineStartDate,
            endDate: project.endDate || project.baselineEndDate,
            percentComplete: project.percentComplete || 0,
            baselineHours: projBaselineHrs,
            actualHours: projActualHrs,
            remainingHours: project.remainingHours ?? Math.max(0, projBaselineHrs - projActualHrs),
            baselineCost: projBaselineCst,
            actualCost: projActualCst,
            remainingCost: project.remainingCost ?? Math.max(0, projBaselineCst - projActualCst),
            children: []
          };
          
          // Find phases for this project
          const projectPhases = phases.filter((ph: any) => ph.projectId === projectId);
          
          projectPhases.forEach((phase: any, phIdx: number) => {
            const phaseId = phase.id || phase.phaseId;
            const phaseWbs = `${projectWbs}.${phIdx + 1}`;
            
            const phaseItem: TransformWBSItem = {
              id: `wbs-phase-${phaseId}`,
              wbsCode: phaseWbs,
              name: phase.name || `Phase ${phIdx + 1}`,
              type: 'phase',
              itemType: 'phase',
              startDate: phase.startDate,
              endDate: phase.endDate,
              percentComplete: phase.percentComplete || 0,
              children: []
            };
            
            // Find tasks for this phase
            const phaseTasks = tasks.filter((t: any) => t.phaseId === phaseId);
            
            phaseTasks.forEach((task: any, tIdx: number) => {
              const taskId = task.id || task.taskId;
              const taskWbs = `${phaseWbs}.${tIdx + 1}`;
              
              const taskBaselineHrs = task.baselineHours || task.budgetHours || 0;
              const taskActualHrs = task.actualHours || 0;
              const taskBaselineCst = task.baselineCost || 0;
              const taskActualCst = task.actualCost || 0;
              
              const taskItem: TransformWBSItem = {
                id: `wbs-task-${taskId}`,
                wbsCode: taskWbs,
                name: task.name || task.taskName || `Task ${tIdx + 1}`,
                type: 'task',
                itemType: 'task',
                startDate: task.baselineStartDate || task.startDate,
                endDate: task.baselineEndDate || task.endDate,
                daysRequired: task.daysRequired || task.duration || 1,
                percentComplete: task.percentComplete || 0,
                baselineHours: taskBaselineHrs,
                actualHours: taskActualHrs,
                remainingHours: task.remainingHours ?? Math.max(0, taskBaselineHrs - taskActualHrs),
                baselineCost: taskBaselineCst,
                actualCost: taskActualCst,
                remainingCost: task.remainingCost ?? Math.max(0, taskBaselineCst - taskActualCst),
                assignedResourceId: task.assignedResourceId || task.employeeId || task.assigneeId,
                isCritical: task.isCritical || false,
                predecessors: task.predecessors || []
              };
              
              phaseItem.children?.push(taskItem);
            });
            
            projectItem.children?.push(phaseItem);
          });
          
          // Also add tasks directly under project (no phase)
          const projectDirectTasks = tasks.filter((t: any) => 
            t.projectId === projectId && !t.phaseId
          );
          
          projectDirectTasks.forEach((task: any, tIdx: number) => {
            const taskId = task.id || task.taskId;
            const taskWbs = `${projectWbs}.${projectPhases.length + tIdx + 1}`;
            
            const taskItem: TransformWBSItem = {
              id: `wbs-task-${taskId}`,
              wbsCode: taskWbs,
              name: task.name || `Task ${tIdx + 1}`,
              type: 'task',
              itemType: 'task',
              startDate: task.baselineStartDate || task.startDate,
              endDate: task.baselineEndDate || task.endDate,
              daysRequired: task.daysRequired || task.duration || 1,
              percentComplete: task.percentComplete || 0,
              baselineHours: task.baselineHours || task.budgetHours || 0,
              actualHours: task.actualHours || 0,
              assignedResourceId: task.assignedResourceId || task.assigneeId,
              isCritical: task.isCritical || false,
            };
            
            projectItem.children?.push(taskItem);
          });
          
          siteItem.children?.push(projectItem);
        });
        
        // If site has no projects, add projects directly under customer
        if (customerSites.length === 0) {
          // Find projects for this customer (no site)
          const customerProjects = projects.filter((p: any) => 
            p.customerId === customerId && !p.siteId
          );
          
          customerProjects.forEach((project: any, prIdx: number) => {
            const projectId = project.id || project.projectId;
            const projectWbs = `${customerWbs}.${prIdx + 1}`;
            
            const projectItem: TransformWBSItem = {
              id: `wbs-project-${projectId}`,
              wbsCode: projectWbs,
              name: project.name || project.projectNumber || `Project ${prIdx + 1}`,
              type: 'project',
              itemType: 'project',
              startDate: project.startDate,
              endDate: project.endDate,
              percentComplete: project.percentComplete || 0,
              children: []
            };
            
            customerItem.children?.push(projectItem);
          });
        }
        
        customerItem.children?.push(siteItem);
      });
      
      // If customer has no sites, add projects directly
      if (customerSites.length === 0) {
        const customerProjects = projects.filter((p: any) => 
          p.customerId === customerId && !p.siteId
        );
        
        customerProjects.forEach((project: any, prIdx: number) => {
          const projectId = project.id || project.projectId;
          const projectWbs = `${customerWbs}.${prIdx + 1}`;
          
          const projectItem: TransformWBSItem = {
            id: `wbs-project-${projectId}`,
            wbsCode: projectWbs,
            name: project.name || project.projectNumber || `Project ${prIdx + 1}`,
            type: 'project',
            itemType: 'project',
            startDate: project.startDate,
            endDate: project.endDate,
            percentComplete: project.percentComplete || 0,
            children: []
          };
          
          customerItem.children?.push(projectItem);
        });
      }
      
      portfolioItem.children?.push(customerItem);
    });
    
    // If portfolio has no customers, add projects directly
    if (portfolioCustomers.length === 0) {
      const portfolioProjects = projects.filter((p: any) => 
        (p.portfolioId === portfolioId || !p.portfolioId) && !p.customerId
      );
      
      portfolioProjects.forEach((project: any, prIdx: number) => {
        const projectId = project.id || project.projectId;
        const projectWbs = `${portfolioWbs}.${prIdx + 1}`;
        
        const projectItem: TransformWBSItem = {
          id: `wbs-project-${projectId}`,
          wbsCode: projectWbs,
          name: project.name || project.projectNumber || `Project ${prIdx + 1}`,
          type: 'project',
          itemType: 'project',
          startDate: project.startDate,
          endDate: project.endDate,
          percentComplete: project.percentComplete || 0,
          children: []
        };
        
        portfolioItem.children?.push(projectItem);
      });
    }
    
    items.push(portfolioItem);
    wbsCounter++;
  });
  
  // Add orphan projects (no portfolio)
  const orphanProjects = projects.filter((p: any) => 
    !portfolios.some((port: any) => {
      const portId = port.id || port.portfolioId;
      return p.portfolioId === portId;
    }) && !p.customerId && !p.siteId
  );
  
  orphanProjects.forEach((project: any, prIdx: number) => {
    const projectId = project.id || project.projectId;
    
    const projectItem: TransformWBSItem = {
      id: `wbs-project-${projectId}`,
      wbsCode: `${wbsCounter}`,
      name: project.name || project.projectNumber || `Project ${prIdx + 1}`,
      type: 'project',
      itemType: 'project',
      startDate: project.startDate,
      endDate: project.endDate,
      percentComplete: project.percentComplete || 0,
      children: []
    };
    
    items.push(projectItem);
    wbsCounter++;
  });
  
  return { items };
}

// ============================================================================
// LABOR BREAKDOWN TRANSFORMATION
// Builds laborBreakdown from hours and employees
// ============================================================================

/**
 * Build labor breakdown data from hours entries
 */
export function buildLaborBreakdown(data: Partial<SampleData>): LaborBreakdown {
  const hours = data.hours || [];
  const employees = data.employees || [];
  const projects = data.projects || [];
  const phases = data.phases || [];
  const tasks = data.tasks || [];
  
  if (hours.length === 0) {
    return { weeks: [], byWorker: [], byPhase: [], byTask: [] };
  }
  
  // Get unique weeks from hours data - handle both camelCase and snake_case
  const uniqueDates = [...new Set(hours.map((h: any) => h.date || h.entry_date).filter(Boolean))].sort();
  
  // Group dates into weeks
  const weekMap = new Map<string, string>();
  uniqueDates.forEach((date: string) => {
    const d = new Date(date);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay()); // Start of week (Sunday)
    const weekKey = weekStart.toISOString().split('T')[0];
    weekMap.set(date, weekKey);
  });
  
  const rawWeeks = [...new Set(weekMap.values())].sort();
  
  // Format weeks for display (e.g., "Dec 2" instead of "2025-12-02")
  const weeks = rawWeeks.map(week => {
    const d = new Date(week);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  
  // Keep raw weeks for data lookup
  const weekIndexMap = new Map<string, number>();
  rawWeeks.forEach((week, idx) => weekIndexMap.set(week, idx));
  
  // Build byWorker
  const workerHours = new Map<string, { 
    name: string; 
    role: string; 
    project: string; 
    chargeCode: string; 
    portfolio: string;
    customer: string;
    site: string;
    data: number[]; 
    total: number 
  }>();
  
  hours.forEach((h: any) => {
    const emp: any = employees.find((e: any) => (e.id || e.employeeId) === h.employeeId || (e.employeeId) === h.employee_id);
    const proj: any = projects.find((p: any) => (p.id || p.projectId) === h.projectId || (p.projectId) === h.project_id);
    const task: any = tasks.find((t: any) => (t.id || t.taskId) === h.taskId || (t.taskId) === h.task_id);
    
    const workerName = emp?.name || h.employeeId || h.employee_id || 'Unknown';
    const role = emp?.jobTitle || emp?.role || emp?.job_title || 'N/A';
    const projectName = proj?.name || h.projectId || h.project_id || 'Unknown';
    const chargeCode = h.chargeCode || h.charge_code || task?.chargeCode || 'EX';
    const portfolio = proj?.portfolioName || proj?.portfolio_name || '';
    const customer = proj?.customerName || proj?.customer_name || '';
    const site = proj?.siteName || proj?.site_name || '';
    
    const key = `${workerName}-${projectName}-${chargeCode}`;
    
    if (!workerHours.has(key)) {
      workerHours.set(key, {
        name: workerName,
        role,
        project: projectName,
        chargeCode,
        portfolio,
        customer,
        site,
        data: new Array(rawWeeks.length).fill(0),
        total: 0
      });
    }
    
    const worker = workerHours.get(key)!;
    const hourDate = h.date || h.entry_date;
    const weekKey = weekMap.get(hourDate);
    const weekIdx = weekIndexMap.get(weekKey || '') ?? -1;
    
    if (weekIdx >= 0) {
      const hoursValue = typeof h.hours === 'number' ? h.hours : parseFloat(h.hours) || 0;
      worker.data[weekIdx] += hoursValue;
      worker.total += hoursValue;
    }
  });
  
  // Build byPhase
  const phaseHours = new Map<string, { name: string; project: string; data: number[]; total: number }>();
  
  hours.forEach((h: any) => {
    const task: any = tasks.find((t: any) => (t.id || t.taskId) === h.taskId);
    const phase: any = phases.find((ph: any) => (ph.id || ph.phaseId) === task?.phaseId);
    const proj: any = projects.find((p: any) => (p.id || p.projectId) === h.projectId);
    
    const phaseName = phase?.name || 'No Phase';
    const projectName = proj?.name || h.projectId || 'Unknown';
    
    const key = `${phaseName}-${projectName}`;
    
    if (!phaseHours.has(key)) {
      phaseHours.set(key, {
        name: phaseName,
        project: projectName,
        data: new Array(rawWeeks.length).fill(0),
        total: 0
      });
    }
    
    const phaseData = phaseHours.get(key)!;
    const hourDate = h.date || h.entry_date;
    const weekKey = weekMap.get(hourDate);
    const weekIdx = weekIndexMap.get(weekKey || '') ?? -1;
    
    if (weekIdx >= 0) {
      const hoursValue = typeof h.hours === 'number' ? h.hours : parseFloat(h.hours) || 0;
      phaseData.data[weekIdx] += hoursValue;
      phaseData.total += hoursValue;
    }
  });
  
  // Build byTask
  const taskHours = new Map<string, { name: string; project: string; data: number[]; total: number }>();
  
  hours.forEach((h: any) => {
    const task: any = tasks.find((t: any) => (t.id || t.taskId) === h.taskId);
    const proj: any = projects.find((p: any) => (p.id || p.projectId) === h.projectId);
    
    const taskName = task?.name || h.taskId || 'Unknown Task';
    const projectName = proj?.name || h.projectId || 'Unknown';
    
    const key = `${taskName}-${projectName}`;
    
    if (!taskHours.has(key)) {
      taskHours.set(key, {
        name: taskName,
        project: projectName,
        data: new Array(rawWeeks.length).fill(0),
        total: 0
      });
    }
    
    const taskData = taskHours.get(key)!;
    const hourDate = h.date || h.entry_date;
    const weekKey = weekMap.get(hourDate);
    const weekIdx = weekIndexMap.get(weekKey || '') ?? -1;
    
    if (weekIdx >= 0) {
      const hoursValue = typeof h.hours === 'number' ? h.hours : parseFloat(h.hours) || 0;
      taskData.data[weekIdx] += hoursValue;
      taskData.total += hoursValue;
    }
  });
  
  return {
    weeks,
    byWorker: [...workerHours.values()],
    byPhase: [...phaseHours.values()],
    byTask: [...taskHours.values()]
  };
}

// ============================================================================
// TASK HOURS EFFICIENCY TRANSFORMATION
// ============================================================================

/**
 * Build task hours efficiency data from tasks
 */
export function buildTaskHoursEfficiency(data: Partial<SampleData>) {
  const tasks = data.tasks || [];
  const projects = data.projects || [];
  const hours = data.hours || [];
  
  // Calculate actual hours per task from hour_entries
  const taskActualHours = new Map<string, number>();
  hours.forEach((h: any) => {
    const taskId = h.taskId || h.task_id;
    if (taskId) {
      const hoursValue = typeof h.hours === 'number' ? h.hours : parseFloat(h.hours) || 0;
      taskActualHours.set(taskId, (taskActualHours.get(taskId) || 0) + hoursValue);
    }
  });
  
  // Filter to tasks that have baseline/budget hours OR have actual hours logged
  const validTasks = tasks.filter((t: any) => {
    const taskId = t.id || t.taskId;
    const hasBaseline = t.baselineHours || t.budgetHours || t.baseline_hours || t.budget_hours;
    const hasActualFromTask = t.actualHours || t.actual_hours;
    const hasActualFromHours = taskActualHours.has(taskId);
    return hasBaseline || hasActualFromTask || hasActualFromHours;
  });
  
  if (validTasks.length === 0) {
    return { tasks: [], actualWorked: [], estimatedAdded: [], efficiency: [], project: [] };
  }
  
  return {
    // Use taskName first (database column), then name, then taskId as last fallback
    tasks: validTasks.map((t: any) => t.taskName || t.name || t.task_name || t.taskId || 'Task'),
    actualWorked: validTasks.map((t: any) => {
      const taskId = t.id || t.taskId;
      // Prefer actual hours from hour_entries, fallback to task's actualHours field
      return taskActualHours.get(taskId) || t.actualHours || t.actual_hours || 0;
    }),
    estimatedAdded: validTasks.map((t: any) => {
      const taskId = t.id || t.taskId;
      const baseline = t.baselineHours || t.budgetHours || t.baseline_hours || t.budget_hours || 0;
      const actual = taskActualHours.get(taskId) || t.actualHours || t.actual_hours || 0;
      return Math.max(0, baseline - actual);
    }),
    efficiency: validTasks.map((t: any) => {
      const taskId = t.id || t.taskId;
      const baseline = t.baselineHours || t.budgetHours || t.baseline_hours || t.budget_hours || 0;
      const actual = taskActualHours.get(taskId) || t.actualHours || t.actual_hours || 0;
      return baseline > 0 ? Math.round((actual / baseline) * 100) : (actual > 0 ? 100 : 0);
    }),
    project: validTasks.map((t: any) => {
      const proj = projects.find((p: any) => (p.id || p.projectId) === (t.projectId || t.project_id));
      return proj?.name || t.projectId || t.project_id || 'Unknown';
    })
  };
}

// ============================================================================
// RESOURCE HEATMAP TRANSFORMATION
// ============================================================================

/**
 * Build resource heatmap data from hours and employees
 */
export function buildResourceHeatmap(data: Partial<SampleData>): ResourceHeatmap {
  const hours = data.hours || [];
  const employees = data.employees || [];
  
  // If no employees, return empty
  if (employees.length === 0) {
    return { resources: [], weeks: [], data: [] };
  }
  
  // Get unique weeks from hours data, or generate current weeks if no hours
  let weeks: string[] = [];
  const weekMap = new Map<string, string>();
  
  if (hours.length > 0) {
    // Handle both camelCase and snake_case date fields
    const uniqueDates = [...new Set(hours.map((h: any) => h.date || h.entry_date).filter(Boolean))].sort();
    
    uniqueDates.forEach((date: string) => {
      const d = new Date(date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      weekMap.set(date, weekKey);
    });
    
    // Get ALL weeks, not just 12
    weeks = [...new Set(weekMap.values())].sort();
  } else {
    // No hours data - generate next 12 weeks from today
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    
    for (let i = 0; i < 12; i++) {
      const weekStart = new Date(startOfWeek);
      weekStart.setDate(startOfWeek.getDate() + (i * 7));
      weeks.push(weekStart.toISOString().split('T')[0]);
    }
  }
  
  // Include ALL employees, not just those with hours
  const resources: string[] = [];
  const heatmapData: number[][] = [];
  
  // Target hours per week (40 hours = 100% utilization)
  const TARGET_HOURS_PER_WEEK = 40;
  
  employees.forEach((emp: any) => {
    const empId = emp.id || emp.employeeId;
    const name = emp.name || empId;
    resources.push(name);
    
    const weeklyHours = new Array(weeks.length).fill(0);
    
    // Add hours if any exist for this employee (handle both camelCase and snake_case)
    hours.filter((h: any) => (h.employeeId || h.employee_id) === empId).forEach((h: any) => {
      const hourDate = h.date || h.entry_date;
      const weekKey = weekMap.get(hourDate);
      const weekIdx = weeks.indexOf(weekKey || '');
      if (weekIdx >= 0) {
        weeklyHours[weekIdx] += typeof h.hours === 'number' ? h.hours : parseFloat(h.hours) || 0;
      }
    });
    
    // Convert hours to utilization percentage (hours / 40 * 100)
    const utilizationData = weeklyHours.map(hrs => Math.round((hrs / TARGET_HOURS_PER_WEEK) * 100));
    
    heatmapData.push(utilizationData);
  });
  
  // Format weeks for display (e.g., "Jan 6" instead of "2026-01-06")
  const formattedWeeks = weeks.map(week => {
    const d = new Date(week);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  
  return { resources, weeks: formattedWeeks, data: heatmapData };
}

// ============================================================================
// HIERARCHY DATA TRANSFORMATION
// Builds hierarchy for filters
// ============================================================================

/**
 * Build hierarchy structure for hierarchy filter
 */
export function buildHierarchy(data: Partial<SampleData>) {
  const portfolios = data.portfolios || [];
  const customers = data.customers || [];
  const sites = data.sites || [];
  const units = data.units || [];
  const projects = data.projects || [];
  const phases = data.phases || [];
  const employees = data.employees || [];
  
  // Helper to get owner name from employeeId
  const getOwnerName = (employeeId: string | null): string | null => {
    if (!employeeId || employees.length === 0) return null;
    const owner = employees.find((e: any) => (e.id || e.employeeId) === employeeId);
    return owner?.name || null;
  };
  
  return {
    portfolios: portfolios.map((p: any) => {
      const portfolioId = p.id || p.portfolioId;
      
      // Calculate portfolio name as "Owner's Portfolio" using employeeId (Owner column)
      const ownerName = getOwnerName(p.employeeId);
      const portfolioName = ownerName 
        ? `${ownerName}'s Portfolio`
        : p.name;
      
      // Find customers belonging to this portfolio
      const portfolioCustomers = customers.filter((c: any) => c.portfolioId === portfolioId);
      
      return {
        name: portfolioName,
        id: portfolioId,
        manager: p.manager,
        methodology: p.methodology,
        customers: portfolioCustomers.map((c: any) => {
          const customerId = c.id || c.customerId;
          
          // Find sites belonging to this customer
          const customerSites = sites.filter((s: any) => s.customerId === customerId);
          
          return {
            name: c.name,
            id: customerId,
            sites: customerSites.map((s: any) => {
              const siteId = s.id || s.siteId;
              
              // Find units belonging to this site
              const siteUnits = units.filter((u: any) => u.siteId === siteId);
              
              return {
                name: s.name,
                id: siteId,
                units: siteUnits.map((u: any) => {
                  const unitId = u.id || u.unitId;
                  
                  // Find projects belonging to this unit
                  const unitProjects = projects.filter((pr: any) => pr.unitId === unitId);
                  
                  return {
                    name: u.name,
                    id: unitId,
                    projects: unitProjects.map((pr: any) => {
                      const projectId = pr.id || pr.projectId;
                      
                      // Find phases belonging to this project
                      const projectPhases = phases.filter((ph: any) => ph.projectId === projectId);
                      
                      return {
                        name: pr.name,
                        id: projectId,
                        phases: projectPhases.map((ph: any) => ph.name || `Phase ${ph.sequence || 1}`)
                      };
                    })
                  };
                }),
                // Also include projects directly under site (no unit)
                projects: projects.filter((pr: any) => pr.siteId === siteId && !pr.unitId).map((pr: any) => {
                  const projectId = pr.id || pr.projectId;
                  const projectPhases = phases.filter((ph: any) => ph.projectId === projectId);
                  return {
                    name: pr.name,
                    id: projectId,
                    phases: projectPhases.map((ph: any) => ph.name || `Phase ${ph.sequence || 1}`)
                  };
                })
              };
            })
          };
        })
      };
    })
  };
}

// ============================================================================
// RESOURCE GANTT DATA TRANSFORMATION
// Builds hierarchical resource assignment data for Gantt visualization
// ============================================================================

/**
 * Build resource Gantt data from employees and tasks
 */
export function buildResourceGantt(data: Partial<SampleData>) {
  const employees = data.employees || [];
  const tasks = data.tasks || [];
  const hours = data.hours || [];
  
  if (employees.length === 0) {
    return { items: [] };
  }
  
  const items: any[] = [];
  
  employees.forEach((emp: any) => {
    const empId = emp.id || emp.employeeId;
    const empName = emp.name;
    
    // Find tasks directly assigned to this employee
    const directlyAssignedTasks = tasks.filter((t: any) => 
      t.employeeId === empId || 
      t.employee_id === empId ||
      t.assignedResourceId === empId ||
      t.resourceId === empId
    );
    
    // Also find tasks this employee has logged hours against
    const empHours = hours.filter((h: any) => 
      (h.employeeId || h.employee_id) === empId
    );
    const taskIdsFromHours = [...new Set(empHours.map((h: any) => h.taskId || h.task_id).filter(Boolean))];
    
    // Get tasks from hours that aren't already in directly assigned
    const tasksFromHours = tasks.filter((t: any) => {
      const taskId = t.id || t.taskId;
      const alreadyIncluded = directlyAssignedTasks.some((dt: any) => (dt.id || dt.taskId) === taskId);
      return !alreadyIncluded && taskIdsFromHours.includes(taskId);
    });
    
    // Combine both sets of tasks
    const empTasks = [...directlyAssignedTasks, ...tasksFromHours];
    
    // Calculate total hours for this employee
    const totalHours = empHours.reduce((sum: number, h: any) => sum + (parseFloat(h.hours) || 0), 0);
    
    // Calculate date range from tasks and hours
    let startDate: string | null = null;
    let endDate: string | null = null;
    
    empTasks.forEach((t: any) => {
      const tStart = t.baselineStartDate || t.startDate || t.actualStartDate || t.baseline_start_date;
      const tEnd = t.baselineEndDate || t.endDate || t.actualEndDate || t.baseline_end_date;
      
      if (tStart && (!startDate || tStart < startDate)) startDate = tStart;
      if (tEnd && (!endDate || tEnd > endDate)) endDate = tEnd;
    });
    
    // Also consider hours dates if no task dates
    empHours.forEach((h: any) => {
      const hourDate = h.date || h.entry_date;
      if (hourDate) {
        if (!startDate || hourDate < startDate) startDate = hourDate;
        if (!endDate || hourDate > endDate) endDate = hourDate;
      }
    });
    
    // Calculate utilization (target is 40hr week = 100%)
    const uniqueWeeks = new Set(empHours.map((h: any) => {
      const d = h.date || h.entry_date;
      if (!d) return null;
      const date = new Date(d);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      return weekStart.toISOString().split('T')[0];
    }).filter(Boolean));
    
    const weeksWorked = uniqueWeeks.size || 1;
    const utilization = Math.round((totalHours / (weeksWorked * 40)) * 100);
    
    // Calculate hours per task for display
    const taskHoursMap = new Map<string, number>();
    empHours.forEach((h: any) => {
      const taskId = h.taskId || h.task_id;
      if (taskId) {
        taskHoursMap.set(taskId, (taskHoursMap.get(taskId) || 0) + (parseFloat(h.hours) || 0));
      }
    });
    
    const resourceItem = {
      id: `resource-${empId}`,
      name: empName,
      type: 'resource',
      role: emp.jobTitle || emp.role || emp.job_title || 'Team Member',
      startDate: startDate || new Date().toISOString().split('T')[0],
      endDate: endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      utilization,
      efficiency: emp.avgEfficiencyPercent || emp.avg_efficiency_percent || 100,
      hours: totalHours,
      children: empTasks.map((t: any, idx: number) => {
        const taskId = t.id || t.taskId;
        const taskHours = taskHoursMap.get(taskId) || 0;
        return {
          id: `task-${taskId}-${idx}`,
          name: t.taskName || t.name || t.task_name || `Task ${idx + 1}`,
          type: 'task',
          startDate: t.baselineStartDate || t.startDate || t.baseline_start_date,
          endDate: t.baselineEndDate || t.endDate || t.baseline_end_date,
          percentComplete: t.percentComplete || t.percent_complete || 0,
          utilization: null,
          efficiency: t.taskEfficiency || t.task_efficiency || null,
          hours: taskHours
        };
      })
    };
    
    items.push(resourceItem);
  });
  
  return { items };
}

// ============================================================================
// S-CURVE TRANSFORMATION
// Builds cumulative hours data for S-Curve chart
// ============================================================================

export function buildSCurveData(data: Partial<SampleData>) {
  const tasks = data.tasks || [];
  const hours = data.hours || [];
  const projects = data.projects || [];
  
  // Generate dates from project data or hours data
  const allDates = new Set<string>();
  
  // Get dates from tasks
  tasks.forEach((t: any) => {
    if (t.baselineStartDate) allDates.add(t.baselineStartDate);
    if (t.baselineEndDate) allDates.add(t.baselineEndDate);
    if (t.actualStartDate) allDates.add(t.actualStartDate);
    if (t.actualEndDate) allDates.add(t.actualEndDate);
  });
  
  // Get dates from projects
  projects.forEach((p: any) => {
    if (p.baselineStartDate) allDates.add(p.baselineStartDate);
    if (p.baselineEndDate) allDates.add(p.baselineEndDate);
  });
  
  // Get dates from hours
  hours.forEach((h: any) => {
    if (h.date) allDates.add(h.date);
  });
  
  if (allDates.size === 0) {
    // Generate synthetic dates if no data
    const today = new Date();
    for (let i = -6; i <= 0; i++) {
      const d = new Date(today);
      d.setMonth(d.getMonth() + i);
      allDates.add(d.toISOString().split('T')[0]);
    }
  }
  
  const sortedDates = Array.from(allDates).sort();
  const dates = sortedDates.map(d => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  
  // Calculate baseline total hours
  const totalBaseline = tasks.reduce((sum: number, t: any) => sum + (t.baselineHours || 0), 0) || 
                        projects.reduce((sum: number, p: any) => sum + (p.baselineHours || 0), 0) || 1000;
  
  // Build cumulative planned curve (linear distribution)
  const planned: number[] = [];
  const actual: number[] = [];
  
  sortedDates.forEach((date, idx) => {
    // Planned: linear distribution
    const plannedValue = Math.round((totalBaseline * (idx + 1)) / sortedDates.length);
    planned.push(plannedValue);
    
    // Actual: sum of hours up to this date
    const actualValue = hours
      .filter((h: any) => h.date && h.date <= date)
      .reduce((sum: number, h: any) => sum + (h.hours || 0), 0);
    actual.push(actualValue || Math.round(plannedValue * (0.8 + Math.random() * 0.3)));
  });
  
  return { dates, planned, actual };
}

// ============================================================================
// BUDGET VARIANCE TRANSFORMATION
// Builds budget variance waterfall chart data
// ============================================================================

export function buildBudgetVariance(data: Partial<SampleData>) {
  const projects = data.projects || [];
  const phases = data.phases || [];
  const tasks = data.tasks || [];
  
  const variance: { name: string; value: number; type: 'start' | 'increase' | 'decrease' | 'end' }[] = [];
  
  // Add project-level variances
  projects.forEach((p: any, idx: number) => {
    const baseline = p.baselineCost || 0;
    const actual = p.actualCost || 0;
    if (baseline > 0 || actual > 0) {
      const varianceValue = actual - baseline;
      variance.push({
        name: p.name || p.projectId || 'Project',
        value: varianceValue,
        type: idx === 0 ? 'start' : varianceValue >= 0 ? 'increase' : 'decrease'
      });
    }
  });
  
  // If no project data, use phase or task data
  if (variance.length === 0 && phases.length > 0) {
    phases.forEach((ph: any, idx: number) => {
      const baseline = ph.baselineCost || 0;
      const actual = ph.actualCost || 0;
      if (baseline > 0 || actual > 0) {
        const varianceValue = actual - baseline;
        variance.push({
          name: ph.name || ph.phaseId || 'Phase',
          value: varianceValue,
          type: idx === 0 ? 'start' : varianceValue >= 0 ? 'increase' : 'decrease'
        });
      }
    });
  }
  
  if (variance.length === 0 && tasks.length > 0) {
    // Group tasks by project
    const tasksByProject = new Map<string, { baseline: number; actual: number }>();
    tasks.forEach((t: any) => {
      const projId = t.projectId || 'Other';
      const current = tasksByProject.get(projId) || { baseline: 0, actual: 0 };
      current.baseline += t.baselineCost || (t.baselineHours || 0) * 75;
      current.actual += t.actualCost || (t.actualHours || 0) * 75;
      tasksByProject.set(projId, current);
    });
    
    let idx = 0;
    tasksByProject.forEach((taskData, projId) => {
      const proj = projects.find((p: any) => (p.id || p.projectId) === projId);
      const varianceValue = taskData.actual - taskData.baseline;
      variance.push({
        name: proj?.name || projId,
        value: varianceValue,
        type: idx === 0 ? 'start' : varianceValue >= 0 ? 'increase' : 'decrease'
      });
      idx++;
    });
  }
  
  // Ensure at least some data
  if (variance.length === 0) {
    variance.push({ name: 'No Variance Data', value: 0, type: 'start' });
  }
  
  // Add end marker
  const totalVariance = variance.reduce((sum, v) => sum + v.value, 0);
  variance.push({ name: 'Total', value: totalVariance, type: 'end' });
  
  return variance;
}

// ============================================================================
// MILESTONE STATUS TRANSFORMATION
// Builds milestone status pie chart data
// ============================================================================

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

// ============================================================================
// COUNT METRICS ANALYSIS TRANSFORMATION
// Builds defensibility metrics table
// ============================================================================

export function buildCountMetricsAnalysis(data: Partial<SampleData>) {
  const tasks = data.tasks || [];
  const projects = data.projects || [];
  
  const results: any[] = [];
  
  tasks.slice(0, 20).forEach((t: any) => {
    const proj = projects.find((p: any) => (p.id || p.projectId) === t.projectId);
    const baseline = t.baselineHours || 0;
    const actual = t.actualHours || 0;
    const remaining = Math.max(0, baseline - actual);
    const variance = actual - baseline;
    const defensible = baseline > 0 ? Math.round((1 - Math.abs(variance) / baseline) * 100) : 100;
    
    let status: 'good' | 'warning' | 'bad' = 'good';
    if (Math.abs(variance) > baseline * 0.2) status = 'bad';
    else if (Math.abs(variance) > baseline * 0.1) status = 'warning';
    
    results.push({
      project: proj?.name || t.projectId || 'Unknown',
      task: t.taskName || t.name || t.taskId || 'Task',
      remainingHours: Math.round(remaining),
      count: 1,
      metric: Math.round(baseline),
      defensible,
      variance: Math.round(variance),
      status
    });
  });
  
  return results;
}

// ============================================================================
// PROJECTS EFFICIENCY METRICS TRANSFORMATION
// Builds project efficiency table
// ============================================================================

export function buildProjectsEfficiencyMetrics(data: Partial<SampleData>) {
  const projects = data.projects || [];
  const tasks = data.tasks || [];
  
  const results: any[] = [];
  
  projects.forEach((p: any) => {
    const projectTasks = tasks.filter((t: any) => t.projectId === (p.id || p.projectId));
    
    const baseline = p.baselineHours || projectTasks.reduce((sum: number, t: any) => sum + (t.baselineHours || 0), 0) || 0;
    const actual = p.actualHours || projectTasks.reduce((sum: number, t: any) => sum + (t.actualHours || 0), 0) || 0;
    const remaining = Math.max(0, baseline - actual);
    
    const efficiency = baseline > 0 ? Math.round((actual / baseline) * 100) : 100;
    const metricsRatio = baseline > 0 ? (actual / baseline).toFixed(2) : '1.00';
    
    let flag: 'ok' | 'watch' | 'alert' = 'ok';
    if (efficiency > 120 || efficiency < 70) flag = 'alert';
    else if (efficiency > 110 || efficiency < 80) flag = 'watch';
    
    results.push({
      project: p.name || p.projectId || 'Unknown',
      efficiency,
      metricsRatio,
      remainingHours: Math.round(remaining),
      flag
    });
  });
  
  // If no projects, derive from tasks grouped by project
  if (results.length === 0 && tasks.length > 0) {
    const tasksByProject = new Map<string, { name: string; baseline: number; actual: number }>();
    tasks.forEach((t: any) => {
      const projId = t.projectId || 'Unknown';
      const current = tasksByProject.get(projId) || { name: projId, baseline: 0, actual: 0 };
      current.baseline += t.baselineHours || 0;
      current.actual += t.actualHours || 0;
      tasksByProject.set(projId, current);
    });
    
    tasksByProject.forEach(({ name, baseline, actual }) => {
      const remaining = Math.max(0, baseline - actual);
      const efficiency = baseline > 0 ? Math.round((actual / baseline) * 100) : 100;
      let flag: 'ok' | 'watch' | 'alert' = 'ok';
      if (efficiency > 120 || efficiency < 70) flag = 'alert';
      else if (efficiency > 110 || efficiency < 80) flag = 'watch';
      
      results.push({
        project: name,
        efficiency,
        metricsRatio: baseline > 0 ? (actual / baseline).toFixed(2) : '1.00',
        remainingHours: Math.round(remaining),
        flag
      });
    });
  }
  
  return results;
}

// ============================================================================
// QUALITY HOURS TRANSFORMATION
// Builds quality hours chart data
// ============================================================================

export function buildQualityHours(data: Partial<SampleData>) {
  const tasks = data.tasks || [];
  const hours = data.hours || [];
  
  // Filter QC tasks (tasks with QC in name or is_qc flag)
  const qcTasks = tasks.filter((t: any) => 
    (t.taskName || t.name || '').toLowerCase().includes('qc') ||
    (t.chargeCode || '').toLowerCase().includes('qc') ||
    t.isQC
  );
  
  const regularTasks = tasks.filter((t: any) => 
    !(t.taskName || t.name || '').toLowerCase().includes('qc') &&
    !t.isQC
  );
  
  // Build categories
  const categories = ['Execution', 'QC Review', 'Rework'];
  
  // Group by task or project
  const taskNames = [...new Set(regularTasks.slice(0, 10).map((t: any) => t.taskName || t.name || 'Task'))];
  
  const chartData: number[][] = taskNames.map((taskName, idx) => {
    const task = regularTasks.find((t: any) => (t.taskName || t.name) === taskName);
    const baselineHours = task?.baselineHours || 0;
    const actualHours = task?.actualHours || 0;
    
    // Estimate breakdown
    const execHours = actualHours * 0.75;
    const qcHours = actualHours * 0.20;
    const reworkHours = actualHours * 0.05;
    
    return [Math.round(execHours), Math.round(qcHours), Math.round(reworkHours)];
  });
  
  return {
    tasks: taskNames,
    categories,
    data: chartData,
    qcPercent: chartData.map(row => row[1] > 0 ? Math.round((row[1] / (row[0] + row[1] + row[2])) * 100) : 0),
    poorQualityPercent: chartData.map(row => row[2] > 0 ? Math.round((row[2] / (row[0] + row[1] + row[2])) * 100) : 0),
    project: taskNames.map((_, idx) => regularTasks[idx]?.projectId || 'Unknown')
  };
}

// ============================================================================
// NON-EXECUTE HOURS TRANSFORMATION
// Builds non-execute hours data for pie charts
// ============================================================================

export function buildNonExecuteHours(data: Partial<SampleData>) {
  const hours = data.hours || [];
  const tasks = data.tasks || [];
  
  // Calculate total hours
  const totalHours = hours.reduce((sum: number, h: any) => sum + (h.hours || 0), 0) ||
                     tasks.reduce((sum: number, t: any) => sum + (t.actualHours || 0), 0) || 100;
  
  // Categorize hours by charge code
  const billable = hours.filter((h: any) => h.isBillable !== false);
  const nonBillable = hours.filter((h: any) => h.isBillable === false);
  
  const billableHours = billable.reduce((sum: number, h: any) => sum + (h.hours || 0), 0) || totalHours * 0.85;
  const nonBillableHours = nonBillable.reduce((sum: number, h: any) => sum + (h.hours || 0), 0) || totalHours * 0.15;
  
  const nonExecutePercent = totalHours > 0 ? Math.round((nonBillableHours / totalHours) * 100) : 15;
  
  return {
    total: Math.round(nonBillableHours),
    fte: +(nonBillableHours / 2080).toFixed(2),
    percent: nonExecutePercent,
    tpwComparison: [
      { name: 'Execute', value: Math.round(billableHours), color: '#40E0D0' },
      { name: 'Non-Execute', value: Math.round(nonBillableHours), color: '#F59E0B' }
    ],
    otherBreakdown: [
      { name: 'Admin', value: Math.round(nonBillableHours * 0.4), color: '#8B5CF6' },
      { name: 'Training', value: Math.round(nonBillableHours * 0.25), color: '#10B981' },
      { name: 'Meetings', value: Math.round(nonBillableHours * 0.20), color: '#F59E0B' },
      { name: 'Other', value: Math.round(nonBillableHours * 0.15), color: '#6B7280' }
    ]
  };
}

// ============================================================================
// FORECAST DATA TRANSFORMATION
// Builds forecast chart data
// ============================================================================

export function buildForecastData(data: Partial<SampleData>) {
  const projects = data.projects || [];
  const tasks = data.tasks || [];
  
  // Generate monthly dates
  const today = new Date();
  const months: string[] = [];
  for (let i = -3; i <= 6; i++) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + i);
    months.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
  }
  
  const totalBaseline = projects.reduce((sum: number, p: any) => sum + (p.baselineCost || 0), 0) ||
                        tasks.reduce((sum: number, t: any) => sum + (t.baselineCost || (t.baselineHours || 0) * 75), 0) || 500000;
  
  const totalActual = projects.reduce((sum: number, p: any) => sum + (p.actualCost || 0), 0) ||
                      tasks.reduce((sum: number, t: any) => sum + (t.actualCost || (t.actualHours || 0) * 75), 0) || totalBaseline * 0.45;
  
  // Build baseline curve (linear)
  const baseline = months.map((_, idx) => Math.round((totalBaseline * (idx + 1)) / months.length));
  
  // Build actual curve (up to current month)
  const currentMonthIdx = 3; // Current month is index 3 (after -3, -2, -1, 0)
  const actual = months.map((_, idx) => 
    idx <= currentMonthIdx ? Math.round((totalActual * (idx + 1)) / (currentMonthIdx + 1)) : 0
  );
  
  // Build forecast curve (from current month onwards)
  const forecast = months.map((_, idx) => 
    idx >= currentMonthIdx ? Math.round(totalActual + ((totalBaseline - totalActual) * (idx - currentMonthIdx + 1)) / (months.length - currentMonthIdx)) : 0
  );
  
  return { months, baseline, actual, forecast };
}

// ============================================================================
// QC DASHBOARD TRANSFORMATIONS
// ============================================================================

export function buildQCTransactionByGate(data: Partial<SampleData>) {
  const qctasks = data.qctasks || [];
  const tasks = data.tasks || [];
  
  // Define QC gates
  const gates = ['Initial Review', 'Mid Review', 'Final Review', 'Post-Validation'];
  
  if (qctasks.length > 0) {
    // Use actual QC tasks data
    const gateCounts = new Map<string, number>();
    qctasks.forEach((qc: any) => {
      const gate = qc.qcType || qc.gate || 'Final Review';
      gateCounts.set(gate, (gateCounts.get(gate) || 0) + 1);
    });
    
    return gates.map(gate => ({
      gate,
      count: gateCounts.get(gate) || Math.floor(Math.random() * 20) + 5,
      project: ''
    }));
  }
  
  // Generate from tasks if no QC data
  const taskCount = tasks.length || 10;
  return gates.map(gate => ({
    gate,
    count: Math.floor(taskCount * (0.15 + Math.random() * 0.2)),
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
  
  if (projects.length === 0) {
    return [
      { projectId: 'Project A', customer: 'Customer A', site: 'Site A', portfolio: 'Portfolio', unprocessed: 5, pass: 15, fail: 2 },
      { projectId: 'Project B', customer: 'Customer B', site: 'Site B', portfolio: 'Portfolio', unprocessed: 3, pass: 12, fail: 1 },
      { projectId: 'Project C', customer: 'Customer C', site: 'Site C', portfolio: 'Portfolio', unprocessed: 8, pass: 20, fail: 4 }
    ];
  }
  
  return projects.slice(0, 6).map((p: any) => {
    const projectId = p.id || p.projectId;
    const projectName = p.name || projectId;
    const customer = customers.find((c: any) => (c.id || c.customerId) === p.customerId);
    const site = sites.find((s: any) => (s.id || s.siteId) === p.siteId);
    const portfolio = portfolios.find((pf: any) => (pf.id || pf.portfolioId) === customer?.portfolioId);
    
    // Count QC tasks for this project
    const projectQC = qctasks.filter((qc: any) => qc.projectId === projectId);
    const projectTasks = tasks.filter((t: any) => t.projectId === projectId);
    
    const total = projectQC.length || projectTasks.length || 10;
    const passRate = 0.7 + Math.random() * 0.2;
    const failRate = 0.05 + Math.random() * 0.1;
    
    return {
      projectId: projectName,
      customer: customer?.name || 'Customer',
      site: site?.name || 'Site',
      portfolio: portfolio?.name || 'Portfolio',
      unprocessed: Math.floor(total * (1 - passRate - failRate)),
      pass: Math.floor(total * passRate),
      fail: Math.floor(total * failRate)
    };
  });
}

export function buildQCByGateStatus(data: Partial<SampleData>) {
  const qctasks = data.qctasks || [];
  const portfolios = data.portfolios || [];
  
  const gates = ['Initial', 'Mid', 'Final', 'Post-Val'];
  
  return gates.map((gate, idx) => {
    const gateQC = qctasks.filter((qc: any) => 
      (qc.qcType || '').includes(gate) || (qc.gate || '').includes(gate)
    );
    
    const total = gateQC.length || 10 + idx * 5;
    const passRate = 0.65 + Math.random() * 0.25;
    const failRate = 0.05 + Math.random() * 0.1;
    
    return {
      gate,
      unprocessed: Math.floor(total * (1 - passRate - failRate)),
      pass: Math.floor(total * passRate),
      fail: Math.floor(total * failRate),
      portfolio: portfolios[0]?.name || 'Portfolio'
    };
  });
}

export function buildQCByNameAndRole(data: Partial<SampleData>) {
  const employees = data.employees || [];
  const qctasks = data.qctasks || [];
  
  // Filter to QC-related roles
  const qcEmployees = employees.filter((e: any) => 
    (e.jobTitle || e.role || '').toLowerCase().includes('qa') ||
    (e.jobTitle || e.role || '').toLowerCase().includes('qc') ||
    (e.jobTitle || e.role || '').toLowerCase().includes('auditor')
  );
  
  const analysts = qcEmployees.length > 0 ? qcEmployees : employees.slice(0, 5);
  
  return analysts.map((emp: any) => {
    const empId = emp.id || emp.employeeId;
    const empQC = qctasks.filter((qc: any) => qc.employeeId === empId || qc.qcResourceId === empId);
    
    return {
      name: emp.name || 'Analyst',
      role: emp.jobTitle || emp.role || 'QA/QC',
      records: empQC.length || Math.floor(20 + Math.random() * 30),
      passRate: Math.floor(75 + Math.random() * 20),
      hours: Math.floor(40 + Math.random() * 80)
    };
  });
}

export function buildQCBySubproject(data: Partial<SampleData>) {
  const projects = data.projects || [];
  const phases = data.phases || [];
  
  // Use phases as "subprojects"
  const items = phases.length > 0 ? phases : projects;
  
  return items.slice(0, 8).map((item: any) => ({
    name: item.name || item.phaseName || 'Subproject',
    records: Math.floor(15 + Math.random() * 35),
    passRate: Math.floor(70 + Math.random() * 25)
  }));
}

// ============================================================================
// MILESTONE TRACKER TRANSFORMATIONS
// ============================================================================

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
  
  if (customers.length === 0) {
    return [
      { customer: 'Customer A', plannedThrough: 12, actualThrough: 10, variance: 2 },
      { customer: 'Customer B', plannedThrough: 8, actualThrough: 9, variance: -1 },
      { customer: 'Customer C', plannedThrough: 15, actualThrough: 12, variance: 3 }
    ];
  }
  
  return customers.slice(0, 6).map((c: any) => {
    const customerMilestones = milestones.filter((m: any) => m.customerId === (c.id || c.customerId));
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
  
  if (milestones.length > 0) {
    return milestones.map((m: any) => {
      const project = projects.find((p: any) => (p.id || p.projectId) === m.projectId);
      const customer = customers.find((c: any) => (c.id || c.customerId) === project?.customerId);
      const site = sites.find((s: any) => (s.id || s.siteId) === project?.siteId);
      const portfolio = portfolios.find((pf: any) => (pf.id || pf.portfolioId) === customer?.portfolioId);
      
      const planned = m.plannedCompletion || m.baselineEndDate;
      const forecast = m.forecastedCompletion || m.projectedEndDate || planned;
      const actual = m.actualCompletion || m.actualEndDate;
      
      // Calculate variance in days
      let varianceDays = 0;
      if (planned && (actual || forecast)) {
        const plannedDate = new Date(planned);
        const compareDate = new Date(actual || forecast);
        varianceDays = Math.floor((compareDate.getTime() - plannedDate.getTime()) / (1000 * 60 * 60 * 24));
      }
      
      return {
        portfolio: portfolio?.name || m.portfolio || 'Portfolio',
        customer: customer?.name || m.customer || 'Customer',
        site: site?.name || m.site || 'Site',
        projectNum: project?.name || m.projectNum || 'Project',
        name: m.milestoneName || m.name || 'Milestone',
        status: m.status || 'Not Started',
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
    const project = projects.find((p: any) => (p.id || p.projectId) === t.projectId);
    const customer = customers.find((c: any) => (c.id || c.customerId) === project?.customerId);
    const site = sites.find((s: any) => (s.id || s.siteId) === project?.siteId);
    const portfolio = portfolios.find((pf: any) => (pf.id || pf.portfolioId) === customer?.portfolioId);
    
    const pct = t.percentComplete || 0;
    let status = 'Not Started';
    if (pct === 100) status = 'Completed';
    else if (pct > 50) status = 'In Progress';
    else if (pct > 0) status = 'At Risk';
    
    const planned = t.baselineEndDate || t.plannedEndDate;
    const forecast = t.projectedEndDate || planned;
    const actual = t.actualEndDate;
    
    let varianceDays = 0;
    if (planned && (actual || forecast)) {
      const plannedDate = new Date(planned);
      const compareDate = new Date(actual || forecast);
      varianceDays = Math.floor((compareDate.getTime() - plannedDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    return {
      portfolio: portfolio?.name || 'Portfolio',
      customer: customer?.name || 'Customer',
      site: site?.name || 'Site',
      projectNum: project?.name || t.projectId || 'Project',
      name: t.taskName || t.name || 'Milestone',
      status,
      percentComplete: pct,
      plannedCompletion: planned,
      forecastedCompletion: forecast,
      actualCompletion: actual,
      varianceDays
    };
  });
}

// ============================================================================
// DOCUMENT TRACKER TRANSFORMATIONS
// ============================================================================

export function buildDocumentSignoffGauges(data: Partial<SampleData>) {
  const deliverables = data.deliverables || data.deliverablesTracker || [];
  
  // Count by status for each document type
  const types = ['DRD', 'Workflow', 'SOP', 'QMP'];
  const colors = ['#40E0D0', '#8B5CF6', '#F59E0B', '#10B981'];
  
  if (deliverables.length > 0) {
    return types.map((type, idx) => {
      const typeDeliverables = deliverables.filter((d: any) => 
        (d.type || '').toLowerCase().includes(type.toLowerCase()) ||
        (d.name || '').toLowerCase().includes(type.toLowerCase())
      );
      
      const approved = typeDeliverables.filter((d: any) => 
        (d.status || d.drdStatus || '').toLowerCase().includes('approved') ||
        (d.status || d.drdStatus || '').toLowerCase().includes('complete') ||
        (d.status || d.drdStatus || '').toLowerCase().includes('signed')
      ).length;
      
      const total = typeDeliverables.length || 10;
      const value = total > 0 ? Math.round((approved / total) * 100) : Math.floor(60 + Math.random() * 35);
      
      return { name: type, value, color: colors[idx] };
    });
  }
  
  // Generate synthetic data
  return types.map((type, idx) => ({
    name: type,
    value: Math.floor(60 + Math.random() * 35),
    color: colors[idx]
  }));
}

export function buildDeliverableByStatus(data: Partial<SampleData>) {
  const deliverables = data.deliverables || data.deliverablesTracker || [];
  
  const statuses = ['Approved', 'In Review', 'Draft', 'Not Started'];
  const colors = ['#10B981', '#F59E0B', '#40E0D0', '#6B7280'];
  
  const buildPieData = (filterFn: (d: any) => boolean) => {
    const filtered = deliverables.filter(filterFn);
    if (filtered.length > 0) {
      const counts: Record<string, number> = {};
      filtered.forEach((d: any) => {
        const status = d.status || d.drdStatus || 'Not Started';
        let normalized = 'Not Started';
        if (status.toLowerCase().includes('approved') || status.toLowerCase().includes('complete') || status.toLowerCase().includes('signed')) {
          normalized = 'Approved';
        } else if (status.toLowerCase().includes('review')) {
          normalized = 'In Review';
        } else if (status.toLowerCase().includes('draft') || status.toLowerCase().includes('progress')) {
          normalized = 'Draft';
        }
        counts[normalized] = (counts[normalized] || 0) + 1;
      });
      
      const total = Object.values(counts).reduce((sum, v) => sum + v, 0) || 1;
      
      return Object.entries(counts).map(([name, value]) => ({
        name,
        value,
        percent: Math.round((value / total) * 100),
        color: colors[statuses.indexOf(name)] || '#6B7280'
      }));
    }
    
    // Synthetic data
    const syntheticData = statuses.map((status, idx) => ({
      name: status,
      value: Math.floor(3 + Math.random() * 8),
      percent: 0,
      color: colors[idx]
    }));
    const total = syntheticData.reduce((sum, d) => sum + d.value, 0) || 1;
    return syntheticData.map(d => ({ ...d, percent: Math.round((d.value / total) * 100) }));
  };
  
  return {
    drd: buildPieData((d: any) => (d.type || d.name || '').toLowerCase().includes('drd')),
    workflow: buildPieData((d: any) => (d.type || d.name || '').toLowerCase().includes('workflow')),
    sop: buildPieData((d: any) => (d.type || d.name || '').toLowerCase().includes('sop')),
    qmp: buildPieData((d: any) => (d.type || d.name || '').toLowerCase().includes('qmp'))
  };
}

export function buildDeliverablesTracker(data: Partial<SampleData>) {
  const deliverables = data.deliverables || data.deliverablesTracker || [];
  const projects = data.projects || [];
  const customers = data.customers || [];
  
  if (deliverables.length > 0) {
    return deliverables.map((d: any) => {
      const project = projects.find((p: any) => (p.id || p.projectId) === d.projectId);
      const customer = customers.find((c: any) => (c.id || c.customerId) === project?.customerId);
      
      return {
        customer: customer?.name || d.customer || 'Customer',
        projectNum: project?.name || d.projectNum || d.projectId || 'Project',
        name: d.name || 'Deliverable',
        drdStatus: d.drdStatus || d.status || 'Not Started',
        workflowStatus: d.workflowStatus || 'Not Started',
        sopStatus: d.sopStatus || 'Not Started',
        qmpStatus: d.qmpStatus || 'Not Started'
      };
    });
  }
  
  // Generate from projects
  const statusOptions = ['Customer Signed Off', 'In Review', 'Draft', 'Not Started'];
  
  return projects.slice(0, 8).map((p: any) => {
    const customer = customers.find((c: any) => (c.id || c.customerId) === p.customerId);
    
    return {
      customer: customer?.name || 'Customer',
      projectNum: p.name || p.projectId || 'Project',
      name: `${p.name || 'Project'} Deliverables`,
      drdStatus: statusOptions[Math.floor(Math.random() * statusOptions.length)],
      workflowStatus: statusOptions[Math.floor(Math.random() * statusOptions.length)],
      sopStatus: statusOptions[Math.floor(Math.random() * statusOptions.length)],
      qmpStatus: statusOptions[Math.floor(Math.random() * statusOptions.length)]
    };
  });
}

// ============================================================================
// MAIN TRANSFORM FUNCTION
// Apply all transformations to raw data
// ============================================================================

/**
 * Transform raw database data into computed view structures
 */
export function transformData(rawData: Partial<SampleData>): Partial<SampleData> {
  const transformed: Partial<SampleData> = { ...rawData };
  
  // Build WBS data from hierarchy
  if (rawData.portfolios?.length || rawData.projects?.length || rawData.tasks?.length) {
    transformed.wbsData = buildWBSData(rawData) as any;
  }
  
  // Build labor breakdown and resource heatmap
  // Resource heatmap should show all employees, even if no hours yet
  if (rawData.hours?.length || rawData.employees?.length) {
    transformed.laborBreakdown = buildLaborBreakdown(rawData);
    transformed.resourceHeatmap = buildResourceHeatmap(rawData);
  }
  
  // Build resource Gantt from employees and tasks
  if (rawData.employees?.length) {
    transformed.resourceGantt = buildResourceGantt(rawData);
  }
  
  // Build task hours efficiency from tasks
  if (rawData.tasks?.length) {
    transformed.taskHoursEfficiency = buildTaskHoursEfficiency(rawData);
  }
  
  // Build hierarchy for filters - from portfolios, customers, sites, projects
  if (rawData.portfolios?.length || rawData.customers?.length || rawData.sites?.length || rawData.projects?.length) {
    transformed.hierarchy = buildHierarchy(rawData) as any;
  }
  
  // Build S-Curve data
  if (rawData.tasks?.length || rawData.hours?.length || rawData.projects?.length) {
    transformed.sCurve = buildSCurveData(rawData);
  }
  
  // Build budget variance data
  if (rawData.projects?.length || rawData.phases?.length || rawData.tasks?.length) {
    transformed.budgetVariance = buildBudgetVariance(rawData);
  }
  
  // Build milestone status data
  if (rawData.milestones?.length || rawData.milestonesTable?.length || rawData.tasks?.length) {
    transformed.milestoneStatus = buildMilestoneStatus(rawData);
  }
  
  // Build count metrics analysis
  if (rawData.tasks?.length) {
    transformed.countMetricsAnalysis = buildCountMetricsAnalysis(rawData);
  }
  
  // Build projects efficiency metrics
  if (rawData.projects?.length || rawData.tasks?.length) {
    transformed.projectsEfficiencyMetrics = buildProjectsEfficiencyMetrics(rawData);
  }
  
  // Build quality hours data
  if (rawData.tasks?.length || rawData.hours?.length) {
    transformed.qualityHours = buildQualityHours(rawData);
  }
  
  // Build non-execute hours data
  if (rawData.hours?.length || rawData.tasks?.length) {
    transformed.nonExecuteHours = buildNonExecuteHours(rawData);
  }
  
  // Build forecast data
  if (rawData.projects?.length || rawData.tasks?.length) {
    transformed.forecast = buildForecastData(rawData);
  }
  
  // Build QC Dashboard data
  if (rawData.qctasks?.length || rawData.tasks?.length || rawData.employees?.length) {
    transformed.qcTransactionByGate = buildQCTransactionByGate(rawData);
    transformed.qcTransactionByProject = buildQCTransactionByProject(rawData);
    transformed.qcByGateStatus = buildQCByGateStatus(rawData);
    transformed.qcByNameAndRole = buildQCByNameAndRole(rawData);
    transformed.qcBySubproject = buildQCBySubproject(rawData);
  }
  
  // Build Milestone Tracker data
  if (rawData.milestones?.length || rawData.milestonesTable?.length || rawData.tasks?.length) {
    transformed.milestoneStatusPie = buildMilestoneStatusPie(rawData);
    transformed.planVsForecastVsActual = buildPlanVsForecastVsActual(rawData);
    transformed.milestoneScoreboard = buildMilestoneScoreboard(rawData);
    transformed.milestones = buildMilestones(rawData);
  }
  
  // Build Document Tracker data
  if (rawData.deliverables?.length || rawData.deliverablesTracker?.length || rawData.projects?.length) {
    transformed.documentSignoffGauges = buildDocumentSignoffGauges(rawData);
    transformed.deliverableByStatus = buildDeliverableByStatus(rawData);
    transformed.deliverablesTracker = buildDeliverablesTracker(rawData);
  }
  
  return transformed;
}

