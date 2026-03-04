'use client';

/**
 * Hierarchy building for portfolio/customer/site/unit/project/phase structure.
 */

import type { SampleData } from '@/types/data';
import { getPlannedProjectIdSet, memoize, normalizeId } from './utils';

function extractHierarchyLevels(data: {
  hierarchyNodes?: any[];
  portfolios?: any[];
  customers?: any[];
  sites?: any[];
  units?: any[];
}): {
  portfolios: any[];
  customers: any[];
  sites: any[];
  units: any[];
} {
  if (data.hierarchyNodes && data.hierarchyNodes.length > 0) {
    return {
      portfolios: data.hierarchyNodes.filter((n: any) => n.node_type === 'portfolio'),
      customers: data.hierarchyNodes.filter((n: any) => n.node_type === 'customer'),
      sites: data.hierarchyNodes.filter((n: any) => n.node_type === 'site'),
      units: data.hierarchyNodes.filter((n: any) => n.node_type === 'unit'),
    };
  }
  return {
    portfolios: data.portfolios || [],
    customers: data.customers || [],
    sites: data.sites || [],
    units: data.units || [],
  };
}

export function buildHierarchyMaps(data: {
  hierarchyNodes?: any[];
  portfolios?: any[];
  customers?: any[];
  sites?: any[];
  units?: any[];
  projects?: any[];
  phases?: any[];
  tasks?: any[];
  employees?: any[];
}): {
  customersByPortfolio: Map<string, any[]>;
  sitesByCustomer: Map<string, any[]>;
  unitsBySite: Map<string, any[]>;
  projectsByUnit: Map<string, any[]>;
  projectsBySite: Map<string, any[]>;
  projectsByCustomer: Map<string, any[]>;
  phasesByProject: Map<string, any[]>;
  phasesByUnit: Map<string, any[]>;
  unitsByProject: Map<string, any[]>;
  tasksByPhase: Map<string, any[]>;
  tasksByProject: Map<string, any[]>;
  employeesById: Map<string, any>;
} {
  const hierarchy = extractHierarchyLevels(data);
  const portfolios = hierarchy.portfolios;
  const customers = hierarchy.customers;
  const sites = hierarchy.sites;
  const units = hierarchy.units;

  const customersByPortfolio = new Map<string, any[]>();
  const sitesByCustomer = new Map<string, any[]>();
  const unitsBySite = new Map<string, any[]>();
  const projectsByUnit = new Map<string, any[]>();
  const projectsBySite = new Map<string, any[]>();
  const projectsByCustomer = new Map<string, any[]>();
  const phasesByProject = new Map<string, any[]>();
  const phasesByUnit = new Map<string, any[]>();
  const unitsByProject = new Map<string, any[]>();
  const tasksByPhase = new Map<string, any[]>();
  const tasksByProject = new Map<string, any[]>();
  const employeesById = new Map<string, any>();
  const plannedProjectIds = getPlannedProjectIdSet(data);
  const unitToProject = new Map<string, string>();
  const siteToCustomer = new Map<string, string>();
  const phaseToProject = new Map<string, string>();
  const taskPhaseToProject = new Map<string, string>();

  customers.forEach((customer: any) => {
    const portfolioId = customer.parent_id ?? customer.portfolioId ?? customer.portfolio_id;
    if (portfolioId != null && portfolioId !== '') {
      const key = String(portfolioId);
      if (!customersByPortfolio.has(key)) customersByPortfolio.set(key, []);
      customersByPortfolio.get(key)!.push(customer);
    }
  });

  sites.forEach((site: any) => {
    const customerId = site.parent_id ?? site.customerId ?? site.customer_id;
    const siteId = normalizeId(site.id ?? site.siteId);
    if (siteId && customerId != null && customerId !== '') {
      siteToCustomer.set(siteId, String(customerId));
    }
    if (customerId != null && customerId !== '') {
      const key = String(customerId);
      if (!sitesByCustomer.has(key)) sitesByCustomer.set(key, []);
      sitesByCustomer.get(key)!.push(site);
    }
  });

  units.forEach((unit: any) => {
    const projectId = unit.projectId ?? unit.project_id;
    const unitId = normalizeId(unit.id ?? unit.unitId);
    if (unitId && projectId != null && projectId !== '') {
      unitToProject.set(unitId, String(projectId));
    }
    if (projectId != null && projectId !== '') {
      const key = String(projectId);
      if (!unitsByProject.has(key)) unitsByProject.set(key, []);
      unitsByProject.get(key)!.push(unit);
    }
    const siteId = unit.parent_id || unit.siteId || unit.site_id;
    if (siteId) {
      const siteKey = String(siteId);
      if (!unitsBySite.has(siteKey)) {
        unitsBySite.set(siteKey, []);
      }
      unitsBySite.get(siteKey)!.push(unit);
    }
  });

  (data.projects || []).forEach((project: any) => {
    const projectId = normalizeId(project.id ?? project.projectId);
    if (!projectId || !plannedProjectIds.has(projectId)) return;
    const unitId = project.unitId ?? project.unit_id;
    const siteId = project.siteId ?? project.site_id;
    const customerIdRaw = project.customerId ?? project.customer_id;
    const customerId =
      customerIdRaw != null && customerIdRaw !== ''
        ? String(customerIdRaw)
        : (siteId != null && siteId !== '' ? siteToCustomer.get(String(siteId)) || '' : '');

    if (unitId != null && unitId !== '') {
      const key = String(unitId);
      if (!projectsByUnit.has(key)) projectsByUnit.set(key, []);
      projectsByUnit.get(key)!.push(project);
    }
    if (siteId != null && siteId !== '') {
      const key = String(siteId);
      if (!projectsBySite.has(key)) projectsBySite.set(key, []);
      projectsBySite.get(key)!.push(project);
    }
    if (customerId != null && customerId !== '') {
      const key = String(customerId);
      if (!projectsByCustomer.has(key)) projectsByCustomer.set(key, []);
      projectsByCustomer.get(key)!.push(project);
    }
  });

  (data.tasks || []).forEach((task: any) => {
    const phaseId = normalizeId(task.phaseId ?? task.phase_id);
    const projectId = normalizeId(task.projectId ?? task.project_id);
    if (phaseId && projectId) {
      taskPhaseToProject.set(phaseId, projectId);
    }
  });

  (data.phases || []).forEach((phase: any) => {
    const phaseId = normalizeId(phase.id ?? phase.phaseId);
    const unitId = phase.unitId ?? phase.unit_id;
    if (unitId != null && unitId !== '') {
      const key = String(unitId);
      if (!phasesByUnit.has(key)) phasesByUnit.set(key, []);
      phasesByUnit.get(key)!.push(phase);
    }
    const projectId =
      phase.projectId ??
      phase.project_id ??
      (unitId != null && unitId !== '' ? unitToProject.get(String(unitId)) : undefined) ??
      (phaseId ? taskPhaseToProject.get(phaseId) : undefined);
    if (phaseId && projectId != null && projectId !== '') phaseToProject.set(phaseId, String(projectId));
    if (projectId != null && projectId !== '') {
      const key = String(projectId);
      if (!phasesByProject.has(key)) phasesByProject.set(key, []);
      phasesByProject.get(key)!.push(phase);
    }
  });

  (data.tasks || []).forEach((task: any) => {
    const phaseId = task.phaseId ?? task.phase_id;
    if (phaseId != null && phaseId !== '') {
      const key = String(phaseId);
      if (!tasksByPhase.has(key)) tasksByPhase.set(key, []);
      tasksByPhase.get(key)!.push(task);
    }
    const unitId = task.unitId ?? task.unit_id;
    const projectId =
      task.projectId ??
      task.project_id ??
      (phaseId != null && phaseId !== '' ? phaseToProject.get(String(phaseId)) : undefined) ??
      (unitId != null && unitId !== '' ? unitToProject.get(String(unitId)) : undefined);
    if (projectId != null && projectId !== '') {
      const key = String(projectId);
      if (!tasksByProject.has(key)) tasksByProject.set(key, []);
      tasksByProject.get(key)!.push(task);
    }
  });

  (data.employees || []).forEach((employee: any) => {
    const empId = employee.id || employee.employeeId;
    if (empId) {
      employeesById.set(empId, employee);
    }
  });

  return {
    customersByPortfolio,
    sitesByCustomer,
    unitsBySite,
    projectsByUnit,
    projectsBySite,
    projectsByCustomer,
    phasesByProject,
    phasesByUnit,
    unitsByProject,
    tasksByPhase,
    tasksByProject,
    employeesById,
  };
}

/**
 * Build hierarchy structure for hierarchy filter
 */
export function buildHierarchy(data: Partial<SampleData>) {
  const dataKey = JSON.stringify({
    portfolioCount: data.portfolios?.length || 0,
    customerCount: data.customers?.length || 0,
    siteCount: data.sites?.length || 0,
    projectCount: data.projects?.length || 0,
  });

  return memoize('buildHierarchy', () => {
    const portfolios = data.portfolios || [];
    const customers = data.customers || [];
    const sites = data.sites || [];
    const maps = buildHierarchyMaps(data);

    const getOwnerName = (employeeId: string | null): string | null => {
      if (!employeeId) return null;
      const owner = maps.employeesById.get(employeeId);
      return owner?.name || null;
    };

    return {
      portfolios: portfolios.map((p: any) => {
        const portfolioId = p.id || p.portfolioId;
        const ownerName = getOwnerName(p.employeeId);
        const portfolioName = ownerName ? `${ownerName}'s Portfolio` : p.name;
        const portfolioCustomers = maps.customersByPortfolio.get(portfolioId) || [];
        const unassignedCustomers = customers.filter((c: any) => !c.portfolioId && !c.portfolio_id);
        const allPortfolioCustomers = [...portfolioCustomers, ...unassignedCustomers];

        return {
          name: portfolioName,
          id: portfolioId,
          manager: p.manager,
          methodology: p.methodology,
          customers: allPortfolioCustomers.map((c: any) => {
            const customerId = c.id || c.customerId;
            const customerSites = maps.sitesByCustomer.get(customerId) || [];

            return {
              name: c.name,
              id: customerId,
              sites: customerSites.map((s: any) => {
                const siteId = s.id || s.siteId;
                const siteUnits = maps.unitsBySite.get(siteId) || [];

                return {
                  name: s.name,
                  id: siteId,
                  units: siteUnits.map((u: any) => {
                    const unitId = u.id || u.unitId;
                    const unitProjects = maps.projectsByUnit.get(unitId) || [];

                    return {
                      name: u.name,
                      id: unitId,
                      projects: unitProjects.map((pr: any) => {
                        const projectId = pr.id || pr.projectId;
                        const projectPhases = maps.phasesByProject.get(String(projectId)) || [];
                        return {
                          name: pr.name,
                          id: projectId,
                          phases: projectPhases.map((ph: any) => ph.name || `Phase ${ph.sequence || 1}`)
                        };
                      })
                    };
                  }),
                  projects: (maps.projectsBySite.get(siteId) || []).filter((pr: any) => !pr.unitId && !pr.unit_id).map((pr: any) => {
                    const projectId = pr.id || pr.projectId;
                    const projectPhases = maps.phasesByProject.get(String(projectId)) || [];
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
  }, [dataKey]);
}
