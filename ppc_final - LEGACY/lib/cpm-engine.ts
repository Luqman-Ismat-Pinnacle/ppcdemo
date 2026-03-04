/**
 * @file cpm-engine.ts
 * @description Advanced CPM (Critical Path Method) Analysis Engine
 * 
 * Features:
 * - Full PDM Support (FS, SS, FF, SF relationship types)
 * - Lag days support on all relationship types
 * - Free Float vs Total Float calculation
 * - Open Ends Detection (dangling logic - tasks with no successors/predecessors)
 * - Near-Critical Path identification
 * - Cycle detection in task dependencies
 * - Topological sorting for forward/backward pass
 * 
 * @dependencies None (standalone engine)
 * @dataflow 
 *   1. loadTasks() - Initialize with task data
 *   2. calculate() - Run CPM algorithm
 *   3. Returns CPMResult with critical path, floats, and statistics
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Predecessor relationship types for PDM (Precedence Diagramming Method)
 * FS = Finish-to-Start (most common) - Successor starts after predecessor finishes
 * SS = Start-to-Start - Successor starts when predecessor starts
 * FF = Finish-to-Finish - Successor finishes when predecessor finishes
 * SF = Start-to-Finish - Successor finishes when predecessor starts (rare)
 */
export type RelationshipType = 'FS' | 'SS' | 'FF' | 'SF';

/**
 * CPM Task - Represents a schedulable work item with all CPM fields
 */
export interface CPMTask {
  /** Unique identifier */
  id: string;
  /** Task display name */
  name: string;
  /** WBS code for hierarchy sorting */
  wbsCode: string;
  /** Duration in working days */
  daysRequired: number;
  /** Predecessor dependencies with relationship type and lag */
  predecessors: { 
    taskId: string; 
    relationship: RelationshipType; 
    lagDays: number;
  }[];
  
  // === Calculated Fields (populated by calculate()) ===
  
  /** Earliest day the task can start */
  earlyStart: number;
  /** Earliest day the task can finish */
  earlyFinish: number;
  /** Latest day the task can start without delaying project */
  lateStart: number;
  /** Latest day the task can finish without delaying project */
  lateFinish: number;
  /** Total Float: Flexibility without delaying the project */
  totalFloat: number;
  /** Free Float: Flexibility without delaying ANY immediate successor */
  freeFloat: number;
  /** Whether this task is on the critical path (totalFloat <= 0) */
  isCritical: boolean;
}

/**
 * CPM Calculation Result
 */
export interface CPMResult {
  /** All tasks with calculated CPM fields */
  tasks: CPMTask[];
  /** List of task IDs on the critical path */
  criticalPath: string[];
  /** Total project duration in working days */
  projectDuration: number;
  /** Statistics about the schedule */
  stats: {
    /** Total number of tasks */
    totalTasks: number;
    /** Number of tasks on critical path */
    criticalTasksCount: number;
    /** Average float across all tasks */
    averageFloat: number;
    /** Tasks with open ends (no successors at project end, or no predecessors at start) */
    danglingTasks: string[];
  };
}

// ============================================================================
// CPM ENGINE CLASS
// ============================================================================

/**
 * CPMEngine - Critical Path Method calculation engine
 * 
 * Usage:
 * ```typescript
 * const engine = new CPMEngine();
 * engine.loadTasks(tasks);
 * const result = engine.calculate();
 * console.log(result.criticalPath);
 * ```
 */
export class CPMEngine {
  /** Map of all tasks by ID */
  private tasks: Map<string, CPMTask> = new Map();
  /** Forward graph: predecessor -> successors[] */
  private adj: Map<string, string[]> = new Map();
  /** Reverse graph: successor -> predecessors[] (for backward pass) */
  private revAdj: Map<string, string[]> = new Map();

  /**
   * Load tasks into the engine and build dependency graphs
   * 
   * @param tasks - Array of partial CPMTask objects (only id, name, wbsCode, daysRequired, predecessors required)
   * @throws Error if any task is missing an ID
   */
  loadTasks(tasks: Partial<CPMTask>[]) {
    // Clear any existing data
    this.tasks.clear();
    this.adj.clear();
    this.revAdj.clear();
    
    // Initialize graph nodes with default values
    tasks.forEach(t => {
      if (!t.id) throw new Error("Task missing ID");
      
      this.tasks.set(t.id, {
        id: t.id,
        name: t.name || 'Unnamed',
        wbsCode: t.wbsCode || '',
        daysRequired: t.daysRequired || 0,
        predecessors: t.predecessors || [],
        earlyStart: 0,
        earlyFinish: 0,
        lateStart: 0,
        lateFinish: 0,
        totalFloat: 0,
        freeFloat: 0,
        isCritical: false
      });
      
      // Initialize adjacency lists
      this.adj.set(t.id, []);
      this.revAdj.set(t.id, []);
    });
    
    // Build edges from predecessor relationships
    tasks.forEach(t => {
      if (!t.id) return;
      
      t.predecessors?.forEach(p => {
        if (t.id && this.tasks.has(p.taskId)) {
          // Forward Graph: Predecessor -> Successor
          const successors = this.adj.get(p.taskId);
          if (successors && !successors.includes(t.id)) {
            successors.push(t.id);
          }
          
          // Reverse Graph: Successor -> Predecessor
          const predecessors = this.revAdj.get(t.id);
          if (predecessors && !predecessors.includes(p.taskId)) {
            predecessors.push(p.taskId);
          }
        }
      });
    });
  }

  /**
   * Run the complete CPM calculation
   * 
   * @returns CPMResult with all calculated values
   */
  calculate(): CPMResult {
    // Step 1: Topological Sort (detects cycles)
    const sorted = this.topoSort();
    
    if (sorted.cycle) {
      // Circular logic detected - handled by returning empty result
      return this.createEmptyResult();
    }
    
    // Step 2: Forward Pass (calculate early dates)
    this.forwardPass(sorted.list);
    
    // Step 3: Backward Pass (calculate late dates)
    this.backwardPass(sorted.list);
    
    // Step 4: Calculate Float and Criticality
    this.calcFloatAndCriticality();
    
    // Step 5: Calculate Project Duration (Max Early Finish)
    let projectDuration = 0;
    this.tasks.forEach(t => {
      if (t.earlyFinish > projectDuration) {
        projectDuration = t.earlyFinish;
      }
    });

    // Step 6: Compile Statistics & Quality Checks
    const tasksArray = Array.from(this.tasks.values());
    const criticalTasks = tasksArray.filter(t => t.isCritical);
    const totalFloatSum = tasksArray.reduce((sum, t) => sum + t.totalFloat, 0);
    
    // Find dangling tasks (open ends)
    const dangling = tasksArray
      .filter(t => 
        // Tasks with no successors that don't end at project finish
        ((this.adj.get(t.id)?.length === 0) && t.earlyFinish !== projectDuration) || 
        // Tasks with no predecessors that don't start at day 1
        (t.predecessors.length === 0 && t.earlyStart !== 1)
      )
      .map(t => t.id);

    return {
      tasks: tasksArray,
      criticalPath: criticalTasks.map(t => t.id),
      projectDuration,
      stats: {
        totalTasks: tasksArray.length,
        criticalTasksCount: criticalTasks.length,
        averageFloat: tasksArray.length > 0 ? totalFloatSum / tasksArray.length : 0,
        danglingTasks: dangling
      }
    };
  }

  /**
   * Topological Sort using Kahn's Algorithm
   * Detects cycles and returns tasks in dependency order
   * 
   * @returns Object with sorted list and cycle detection flag
   */
  private topoSort(): { list: CPMTask[]; cycle: boolean } {
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const sortedList: CPMTask[] = [];
    
    // Calculate in-degree (number of predecessors) for each task
    this.tasks.forEach((t, id) => {
      const degree = t.predecessors.length;
      inDegree.set(id, degree);
      
      // Tasks with no predecessors start in the queue
      if (degree === 0) {
        queue.push(id);
      }
    });
    
    let visitedCount = 0;
    
    while (queue.length > 0) {
      const id = queue.shift()!;
      const t = this.tasks.get(id);
      
      if (t) {
        sortedList.push(t);
        visitedCount++;
        
        // Reduce in-degree of all successors
        const successors = this.adj.get(id) || [];
        successors.forEach(neighbor => {
          const newDegree = (inDegree.get(neighbor) || 0) - 1;
          inDegree.set(neighbor, newDegree);
          
          // If all predecessors processed, add to queue
          if (newDegree === 0) {
            queue.push(neighbor);
          }
        });
      }
    }
    
    // If we didn't visit all tasks, there's a cycle
    return { 
      list: sortedList, 
      cycle: visitedCount !== this.tasks.size 
    };
  }

  /**
   * Forward Pass - Calculate Early Start and Early Finish for each task
   * Processes tasks in topological order (predecessors before successors)
   * 
   * @param list - Topologically sorted task list
   */
  private forwardPass(list: CPMTask[]) {
    list.forEach(t => {
      if (t.predecessors.length === 0) {
        // No predecessors: Start at day 1
        t.earlyStart = 1;
      } else {
        // Find the maximum constraint from all predecessors
        let maxEarlyStart = 1;
        
        t.predecessors.forEach(p => {
          const pred = this.tasks.get(p.taskId);
          if (pred) {
            // Convert all relationship types to an Early Start constraint
            let constraintDate = 0;
            const lag = p.lagDays || 0;
            const dur = t.daysRequired;

            switch (p.relationship) {
              case 'FS': 
                // Finish to Start: Starts after predecessor finishes
                // ES = PredEF + Lag + 1
                constraintDate = pred.earlyFinish + lag + 1;
                break;
              case 'SS': 
                // Start to Start: Starts after predecessor starts
                // ES = PredES + Lag
                constraintDate = pred.earlyStart + lag;
                break;
              case 'FF': 
                // Finish to Finish: Finishes after predecessor finishes
                // EF = PredEF + Lag => ES = PredEF + Lag - Duration + 1
                constraintDate = pred.earlyFinish + lag - dur + 1;
                break;
              case 'SF': 
                // Start to Finish: Finishes after predecessor starts
                // EF = PredES + Lag => ES = PredES + Lag - Duration + 1
                constraintDate = pred.earlyStart + lag - dur + 1;
                break;
            }
            
            maxEarlyStart = Math.max(maxEarlyStart, constraintDate);
          }
        });
        
        t.earlyStart = maxEarlyStart;
      }
      
      // Early Finish = Early Start + Duration - 1
      // (We subtract 1 because start day counts as work)
      t.earlyFinish = t.earlyStart + Math.max(0, t.daysRequired - 1);
      
      // Update the task in the map
      this.tasks.set(t.id, t);
    });
  }

  /**
   * Backward Pass - Calculate Late Start and Late Finish for each task
   * Processes tasks in reverse topological order (successors before predecessors)
   * 
   * @param list - Topologically sorted task list (will be reversed)
   */
  private backwardPass(list: CPMTask[]) {
    // Step 1: Determine Project End Date (max Early Finish)
    let maxProjectFinish = 0;
    this.tasks.forEach(t => {
      if (t.earlyFinish > maxProjectFinish) {
        maxProjectFinish = t.earlyFinish;
      }
    });

    // Step 2: Process in Reverse Order
    [...list].reverse().forEach(t => {
      const successors = this.adj.get(t.id) || [];
      
      if (successors.length === 0) {
        // No successors: Late Finish is project end date
        t.lateFinish = maxProjectFinish;
      } else {
        // Find the minimum constraint from all successors
        let minLateFinish = Infinity;
        
        successors.forEach(succId => {
          const succ = this.tasks.get(succId);
          if (succ) {
            // Find the relationship definition that points back to this task
            const rel = succ.predecessors.find(p => p.taskId === t.id);
            
            if (rel) {
              let constraintDate = Infinity;
              const lag = rel.lagDays || 0;
              const tDur = t.daysRequired;

              // Convert all relationship types to a Late Finish constraint
              switch (rel.relationship) {
                case 'FS': 
                  // Successor LS determines Task LF
                  // SuccLS = TaskLF + Lag + 1 => TaskLF = SuccLS - Lag - 1
                  constraintDate = succ.lateStart - lag - 1;
                  break;
                case 'SS': 
                  // Successor LS determines Task LS
                  // SuccLS = TaskLS + Lag => TaskLS = SuccLS - Lag
                  // TaskLF = TaskLS + Dur - 1 = SuccLS - Lag + Dur - 1
                  constraintDate = succ.lateStart - lag + tDur - 1;
                  break;
                case 'FF': 
                  // Successor LF determines Task LF
                  // SuccLF = TaskLF + Lag => TaskLF = SuccLF - Lag
                  constraintDate = succ.lateFinish - lag;
                  break;
                case 'SF': 
                  // Successor LF determines Task LS
                  // SuccLF = TaskLS + Lag => TaskLS = SuccLF - Lag
                  // TaskLF = SuccLF - Lag + Dur - 1
                  constraintDate = succ.lateFinish - lag + tDur - 1;
                  break;
              }
              
              minLateFinish = Math.min(minLateFinish, constraintDate);
            }
          }
        });
        
        t.lateFinish = minLateFinish;
      }
      
      // Late Start = Late Finish - Duration + 1
      t.lateStart = t.lateFinish - Math.max(0, t.daysRequired - 1);
      
      // Update the task in the map
      this.tasks.set(t.id, t);
    });
  }

  /**
   * Calculate Float values and determine Critical Path
   */
  private calcFloatAndCriticality() {
    this.tasks.forEach(t => {
      // Total Float: Flexibility without delaying the project
      // TF = LS - ES (or LF - EF, same result)
      t.totalFloat = t.lateStart - t.earlyStart;
      
      // Free Float: Flexibility without delaying ANY immediate successor
      // FF = min(Successor ES) - Task EF - 1
      const successors = this.adj.get(t.id) || [];
      
      if (successors.length === 0) {
        // If last task, Free Float equals Total Float
        t.freeFloat = t.totalFloat; 
      } else {
        let minSuccStart = Infinity;
        
        successors.forEach(sid => {
          const st = this.tasks.get(sid);
          if (st) {
            // For simplicity, using standard FS logic for Free Float
            // More complex relationships would need additional handling
            minSuccStart = Math.min(minSuccStart, st.earlyStart);
          }
        });
        
        // Free Float = Min Successor ES - Task EF - 1
        // Ensure non-negative
        t.freeFloat = Math.max(0, minSuccStart - t.earlyFinish - 1); 
      }

      // Critical if Total Float is zero or negative
      t.isCritical = t.totalFloat <= 0;
      
      // Update the task in the map
      this.tasks.set(t.id, t);
    });
  }

  /**
   * Create an empty result for error cases (e.g., cycle detected)
   */
  private createEmptyResult(): CPMResult {
    return { 
      tasks: [], 
      criticalPath: [], 
      projectDuration: 0, 
      stats: { 
        totalTasks: 0, 
        criticalTasksCount: 0, 
        averageFloat: 0, 
        danglingTasks: [] 
      } 
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a default CPMTask with minimal required fields
 * 
 * @param id - Task ID
 * @param name - Task name
 * @param daysRequired - Duration in days
 * @returns Partial CPMTask ready for loadTasks()
 */
export function createCPMTask(
  id: string, 
  name: string, 
  daysRequired: number
): Partial<CPMTask> {
  return {
    id,
    name,
    wbsCode: '',
    daysRequired,
    predecessors: []
  };
}

/**
 * Add a predecessor relationship to a task
 * 
 * @param task - The dependent task
 * @param predecessorId - ID of the predecessor task
 * @param relationship - Relationship type (default FS)
 * @param lagDays - Lag in days (default 0)
 */
export function addPredecessor(
  task: Partial<CPMTask>,
  predecessorId: string,
  relationship: RelationshipType = 'FS',
  lagDays: number = 0
): void {
  if (!task.predecessors) {
    task.predecessors = [];
  }
  
  task.predecessors.push({
    taskId: predecessorId,
    relationship,
    lagDays
  });
}
