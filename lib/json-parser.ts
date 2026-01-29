/**
 * @fileoverview JSON Parser Utility for PPC V3 Application.
 * 
 * Parses JSON project data and converts it to the application's data types.
 * Handles the hierarchical portfolio structure and generates all necessary 
 * entity records.
 * 
 * Schema features:
 * - Standardized ID prefixes (PRF, CST, STE, PRJ, PHS, TSK, SUB, DLB)
 * - Tracking fields (baseline dates, actual dates, percent complete, comments)
 * - BillableType on projects (T&M or FP)
 * - EmployeeId on portfolios for ownership
 * 
 * @module lib/json-parser
 * 
 * @example
 * ```ts
 * import { parseJSONData } from '@/lib/json-parser';
 * 
 * const jsonData = JSON.parse(fileContent);
 * const parsedData = parseJSONData(jsonData, existingEmployees);
 * ```
 */

import type { 
  SampleData, 
  PortfolioTable, 
  CustomerTable, 
  SiteTable, 
  UnitTable,
  ProjectTable, 
  Phase, 
  Task, 
  QCTask, 
  HourEntry, 
  Deliverable,
  Portfolio,
  Customer,
  Site,
  TrackingFields,
} from '@/types/data';

// ============================================================================
// JSON INPUT TYPES
// These match the expected structure for project plan JSON imports
// ============================================================================

/**
 * Portfolio structure in the JSON input.
 * Top-level container with a senior manager and customers.
 * 
 * @interface JSONPortfolio
 */
interface JSONPortfolio {
  /** Senior manager responsible for this portfolio */
  sr_manager: string;
  /** Array of customers under this portfolio */
  customers: JSONCustomer[];
}

/**
 * Customer structure in the JSON input.
 * Contains customer name and their projects.
 * 
 * @interface JSONCustomer
 */
interface JSONCustomer {
  /** Customer organization name */
  customer_name: string;
  /** Array of projects for this customer */
  projects: JSONProject[];
}

/**
 * Project structure in the JSON input.
 * Contains full project details including phases and baseline data.
 * 
 * @interface JSONProject
 */
interface JSONProject {
  /** Project display name */
  project_name: string;
  /** Type of project (e.g., "TL Services", "Audit") */
  project_type: string;
  /** Site/location name */
  site: string;
  /** Project start date (YYYY-MM-DD) */
  start_date: string;
  /** Project description */
  description: string;
  /** Array of project phases */
  phases: JSONPhase[];
  /** Baseline summary with total hours and cost */
  baseline_summary: {
    baseline_total_hours: number;
    baseline_total_cost: number;
  };
  /** Sample hour entries for this project */
  hours_entries_sample: JSONHourEntry[];
}

/**
 * Phase structure in the JSON input.
 * Groups tasks within a project phase.
 * 
 * @interface JSONPhase
 */
interface JSONPhase {
  /** Phase display name */
  phase_name: string;
  /** Array of tasks in this phase */
  tasks: JSONTask[];
}

/**
 * Task structure in the JSON input.
 * Defines work items with baseline estimates and optional QC/deliverables.
 * 
 * @interface JSONTask
 */
interface JSONTask {
  /** Task display name */
  task_name: string;
  /** Primary roles and their allocated hours */
  primary_roles: Array<{ role: string; hours: number }>;
  /** Baseline estimated hours */
  baseline_hours: number;
  /** Baseline estimated cost */
  baseline_cost: number;
  /** Optional QC configuration */
  qc?: {
    qc_types: string[];
    qc_hours: number;
    qc_cost: number;
    qc_count: number;
    qc_uom: string;
    qc_role: string;
  };
  /** Optional deliverable names */
  deliverables?: string[];
  /** Optional task notes */
  notes?: string;
}

/**
 * Hour entry structure in the JSON input.
 * Records time worked by role/task/date.
 * 
 * @interface JSONHourEntry
 */
interface JSONHourEntry {
  /** Role of the person who worked */
  person_role: string;
  /** Task name the hours were charged to */
  task_name: string;
  /** Date of the work (YYYY-MM-DD) */
  date: string;
  /** Number of hours worked */
  hours: number;
}

/**
 * Root JSON data structure.
 * Contains array of portfolios.
 * 
 * @interface JSONData
 */
interface JSONData {
  /** Array of portfolio structures */
  portfolios: JSONPortfolio[];
}

// ============================================================================
// ID GENERATION
// ============================================================================

/** Counter for generating unique IDs */
let idCounter = 1;

/**
 * Generate a unique ID with a prefix.
 * IDs are sequential within a parsing session.
 * 
 * @param {string} prefix - Prefix for the ID (e.g., "PRF", "CST", "TSK")
 * @returns {string} Generated ID (e.g., "PRF-0001", "CST-0005")
 */
function generateId(prefix: string): string {
  const num = idCounter++;
  return `${prefix}-${num.toString().padStart(4, '0')}`;
}

/**
 * Create default tracking fields
 */
function createDefaultTrackingFields(
  baselineStart: string | null = null,
  baselineEnd: string | null = null
): TrackingFields {
  return {
    baselineStartDate: baselineStart,
    baselineEndDate: baselineEnd,
    actualStartDate: null,
    actualEndDate: null,
    percentComplete: 0,
    comments: '',
    baselineHours: 0,
    actualHours: 0,
    baselineCost: 0,
    actualCost: 0,
    predecessorId: null,
    predecessorRelationship: null
  };
}

// ============================================================================
// MAIN PARSER
// ============================================================================

/**
 * Parse JSON data and convert to SampleData format.
 * Processes the hierarchical portfolio structure and generates
 * all entity records with proper relationships.
 * 
 * @param {JSONData} jsonData - Parsed JSON project plan data
 * @param {SampleData['employees']} [employees=[]] - Existing employees for role matching
 * @returns {Partial<SampleData>} Partial SampleData with parsed entities
 * 
 * @example
 * ```ts
 * const jsonData = JSON.parse(fileContent);
 * const result = parseJSONData(jsonData, existingEmployees);
 * 
 * console.log(result.portfolios);  // PortfolioTable[]
 * console.log(result.projects);    // ProjectTable[]
 * console.log(result.tasks);       // Task[]
 * ```
 */
export function parseJSONData(jsonData: JSONData, employees: SampleData['employees'] = []): Partial<SampleData> {
  // Reset ID counter for fresh parsing
  idCounter = 1;
  
  // Initialize output arrays
  const portfolios: PortfolioTable[] = [];
  const customers: CustomerTable[] = [];
  const sites: SiteTable[] = [];
  const units: UnitTable[] = [];  // Units between Site and Project
  const projects: ProjectTable[] = [];
  const phases: Phase[] = [];
  const tasks: Task[] = [];
  const qctasks: QCTask[] = [];
  const hours: HourEntry[] = [];
  const deliverables: Deliverable[] = [];
  const hierarchyPortfolios: Portfolio[] = [];

  // Create employee lookup map for role-based matching
  const employeeMap = new Map<string, string>();
  employees.forEach(emp => {
    // Map by employee name (lowercase for case-insensitive matching)
    employeeMap.set(emp.name.toLowerCase(), emp.employeeId);
    // Also map by job title for role-based lookups
    if (emp.jobTitle) {
      employeeMap.set(emp.jobTitle.toLowerCase(), emp.employeeId);
    }
  });

  /**
   * Find an employee ID by role/job title.
   * Searches employees for matching job title or name containing the role.
   * 
   * @param {string} role - Role name to search for
   * @returns {string} Employee ID or empty string if not found
   */
  function findEmployeeIdByRole(role: string): string {
    const emp = employees.find(e => 
      e.jobTitle?.toLowerCase() === role.toLowerCase() ||
      e.name.toLowerCase().includes(role.toLowerCase())
    );
    return emp?.employeeId || '';
  }

  // Process each portfolio
  jsonData.portfolios.forEach((jsonPortfolio) => {
    const portfolioId = generateId('PRF');
    // Calculate portfolio name as "Manager's Portfolio"
    const portfolioName = `${jsonPortfolio.sr_manager}'s Portfolio`;
    
    // Find the employee ID for the Sr. Manager
    const managerEmployeeId = findEmployeeIdByRole('Senior Manager') || 
                              findEmployeeIdByRole(jsonPortfolio.sr_manager) || 
                              null;
    
    // Create portfolio table record with employeeId and tracking fields
    portfolios.push({
      portfolioId,
      name: portfolioName,
      employeeId: managerEmployeeId,
      manager: jsonPortfolio.sr_manager,
      methodology: 'Mixed',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...createDefaultTrackingFields()
    });

    // Build hierarchy customers for this portfolio
    const hierarchyCustomers: Customer[] = [];

    // Process each customer
    jsonPortfolio.customers.forEach((jsonCustomer) => {
      const customerId = generateId('CST');
      
      // Create customer table record with tracking fields
      customers.push({
        customerId,
        name: jsonCustomer.customer_name,
        portfolioId,
        employeeId: '',
        ...createDefaultTrackingFields(),
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Track sites for hierarchy and deduplication
      const hierarchySites: Site[] = [];
      const siteMap = new Map<string, string>(); // site name -> siteId

      // Process each project
      jsonCustomer.projects.forEach((jsonProject, prIdx) => {
        // Get or create site for this project
        let siteId = siteMap.get(jsonProject.site);
        const projectStart = jsonProject.start_date;
        const projectEnd = addMonths(projectStart, 6);
        
        if (!siteId) {
          siteId = generateId('STE');
          sites.push({
            siteId,
            name: jsonProject.site,
            customerId,
            employeeId: '',
            ...createDefaultTrackingFields(projectStart, projectEnd),
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          siteMap.set(jsonProject.site, siteId);
        }

        // Create project record - without projectNumber, with billableType
        const projectId = generateId('PRJ');
        
        projects.push({
          projectId,
          name: jsonProject.project_name,
          unitId: null,  // No unit assignment from JSON import
          customerId,
          siteId,
          employeeId: '',
          billableType: jsonProject.project_type.includes('QRO') ? 'FP' : 'T&M',
          methodology: jsonProject.project_type,
          manager: jsonPortfolio.sr_manager,
          ...createDefaultTrackingFields(projectStart, projectEnd),
          active: true,
          createdAt: jsonProject.start_date,
          updatedAt: new Date().toISOString(),
        });

        // Process phases for this project
        let phaseOffset = 0;
        jsonProject.phases.forEach((jsonPhase, phIdx) => {
          const phaseId = generateId('PHS');
          const phaseStart = addDays(projectStart, phaseOffset * 14);
          const phaseEnd = addDays(phaseStart, 14);
          
          // Create phase record - without code field
          phases.push({
            phaseId,
            name: jsonPhase.phase_name,
            methodology: jsonProject.project_type,
            projectId,
            employeeId: '',
            startDate: phaseStart,
            endDate: phaseEnd,
            sequence: phIdx,
            ...createDefaultTrackingFields(phaseStart, phaseEnd),
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Process tasks for this phase
          let taskOffset = 0;
          jsonPhase.tasks.forEach((jsonTask, tIdx) => {
            const taskId = generateId('TSK');
            const taskDays = Math.ceil(jsonTask.baseline_hours / 8);
            const taskStart = addDays(phaseStart, taskOffset);
            const taskEnd = addDays(taskStart, taskDays);
            
            // Create task record with predecessor linking and tracking fields
            tasks.push({
              ...createDefaultTrackingFields(taskStart, taskEnd),
              taskId,
              customerId,
              projectId,
              siteId,
              phaseId,
              subProjectId: '',
              resourceId: '',
              employeeId: '',
              assignedResourceType: 'generic',
              assignedResource: jsonTask.primary_roles?.[0]?.role || '',
              taskName: jsonTask.task_name,
              taskDescription: jsonTask.notes || '',
              isSubTask: false,
              parentTaskId: null,
              predecessor: tIdx > 0 ? tasks[tasks.length - 1].taskId : null,
              projectedHours: jsonTask.baseline_hours,
              status: 'Not Started',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });

            // Create QC task if defined
            if (jsonTask.qc) {
              const qcTaskId = generateId('QCT');
              const qcEmployeeId = findEmployeeIdByRole(jsonTask.qc.qc_role);
              
              qctasks.push({
                qcTaskId,
                parentTaskId: taskId,
                qcResourceId: qcEmployeeId,
                employeeId: qcEmployeeId,
                qcHours: jsonTask.qc.qc_hours,
                qcScore: 0, // Initial score
                qcCount: jsonTask.qc.qc_count,
                qcUOM: jsonTask.qc.qc_uom,
                qcType: jsonTask.qc.qc_types.join(', '),
                qcStatus: 'Pending',
                qcCriticalErrors: 0,
                qcNonCriticalErrors: 0,
                qcComments: '',
                qcStartDate: new Date().toISOString(),
                qcEndDate: null,
                baselineStartDate: taskStart,
                baselineEndDate: taskEnd,
                actualStartDate: null,
                actualEndDate: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            }

            // Create deliverable records with tracking fields
            if (jsonTask.deliverables) {
              jsonTask.deliverables.forEach((deliverableName) => {
                const deliverableId = generateId('DLB');
                deliverables.push({
                  deliverableId,
                  name: deliverableName,
                  projectId,
                  phaseId,
                  employeeId: '',
                  status: 'Not Started',
                  dueDate: taskEnd,
                  completedDate: null,
                  assigneeId: '',
                  ...createDefaultTrackingFields(taskStart, taskEnd),
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
              });
            }
            
            taskOffset += Math.ceil(taskDays * 0.8);
          });
          
          phaseOffset++;
        });

        // Create hour entries from sample data
        jsonProject.hours_entries_sample.forEach((jsonHour) => {
          const entryId = generateId('HRS');
          const task = tasks.find(t => t.taskName === jsonHour.task_name && t.projectId === projectId);
          const employeeId = findEmployeeIdByRole(jsonHour.person_role);
          
          hours.push({
            entryId,
            employeeId,
            taskId: task?.taskId || null,
            projectId,
            chargeCode: '',
            date: jsonHour.date,
            hours: jsonHour.hours,
            description: `${jsonHour.person_role} - ${jsonHour.task_name}`,
            billable: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        });

        // Build hierarchy site structure
        let existingSite = hierarchySites.find(s => s.name === jsonProject.site);
        if (!existingSite) {
          existingSite = {
            id: siteId,
            name: jsonProject.site,
            projects: [],
          };
          hierarchySites.push(existingSite);
        }
        existingSite.projects.push({
          id: projectId,
          name: jsonProject.project_name,
          phases: jsonProject.phases.map(p => p.phase_name),
        });
      });

      // Add customer to hierarchy
      hierarchyCustomers.push({
        id: customerId,
        name: jsonCustomer.customer_name,
        sites: hierarchySites,
      });
    });

    // Add portfolio to hierarchy
    hierarchyPortfolios.push({
      id: portfolioId,
      name: portfolioName,
      manager: jsonPortfolio.sr_manager,
      methodology: 'Mixed',
      customers: hierarchyCustomers,
    });
  });

  // Return all generated data
  return {
    hierarchy: { portfolios: hierarchyPortfolios },
    portfolios,
    customers,
    sites,
    units,
    projects,
    phases,
    tasks,
    qctasks,
    hours,
    deliverables,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Add days to a date string
 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Add months to a date string
 */
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}
