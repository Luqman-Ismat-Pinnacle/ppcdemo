/**
 * @file forecasting-engine.ts
 * @description Advanced Forecasting Engine for Project Controls
 * 
 * Features:
 * - Monte Carlo Simulation (P10/P50/P90 probabilistic forecasts)
 * - Standard EVM IEAC Calculations (CPI, CPI*SPI, Budget Rate methods)
 * - TCPI (To-Complete Performance Index) calculation
 * - Dynamic Scenario Modeling with configurable parameters
 * - Box-Muller normal distribution for randomization
 * 
 * @dependencies None (standalone engine)
 * @dataflow 
 *   - Import and use from forecast page
 *   - Receives ProjectState derived from useData()
 *   - Returns ForecastResult with all calculations
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Engine Parameters - Configurable inputs for Monte Carlo simulation
 */
export interface EngineParams {
  /** PERT Distribution Skew (0.5 to 1.5). >1 = optimistic, <1 = pessimistic */
  optimismFactor: number;
  /** Risk buffer percentage added to estimates (0.0 to 0.5) */
  riskBuffer: number;
  /** Global resource efficiency factor (0.5 to 1.0) */
  resourceEfficiency: number;
  /** Expected scope contingency/growth percentage (0.0 to 0.3) */
  scopeContingency: number;
  /** Labor rate variance multiplier (0.8 to 1.5) */
  laborCostMultiplier: number;
  /** Number of Monte Carlo iterations (100 to 10000) */
  iterations: number;
}

/**
 * Engine Log Entry - Audit trail for simulation runs
 */
export interface EngineLogEntry {
  /** ISO timestamp of the event */
  timestamp: string;
  /** Type of event */
  type: 'calculation' | 'update' | 'simulation';
  /** Human-readable message */
  message: string;
  /** Parameters used (for simulation events) */
  params?: Partial<EngineParams>;
  /** Key results (for simulation events) */
  results?: {
    p50Cost: number;
    p90Cost: number;
    p50Date: string;
  };
}

/**
 * Simulation Result - Percentile-based forecast output
 */
export interface SimulationResult {
  /** 10th percentile (best case, 10% chance of being at or below this) */
  p10: number;
  /** 50th percentile (most likely, median) */
  p50: number;
  /** 90th percentile (worst case, 90% chance of being at or below this) */
  p90: number;
  /** Arithmetic mean of all samples */
  mean: number;
  /** Minimum value from samples */
  min: number;
  /** Maximum value from samples */
  max: number;
}

/**
 * Forecast Result - Complete output from the forecasting engine
 */
export interface ForecastResult {
  /** Monte Carlo simulation results for cost */
  monteCarloCost: SimulationResult;
  /** Monte Carlo simulation results for duration */
  monteCarloDuration: SimulationResult;
  /** Independent Estimate at Completion (three standard EVM methods) */
  ieac: {
    /** IEAC using CPI only: BAC / CPI */
    cpi: number;
    /** IEAC using CPI*SPI: AC + (BAC - EV) / (CPI * SPI) */
    cpiSpi: number;
    /** IEAC assuming future work at budget rate: AC + (BAC - EV) */
    budgetRate: number;
  };
  /** To-Complete Performance Index */
  tcpi: {
    /** Efficiency needed to complete at original BAC */
    toBac: number;
    /** Efficiency needed to complete at P50 EAC */
    toEac: number;
  };
  /** Estimated completion date (based on P50 duration) */
  completionDate: string;
}

/**
 * Project State - Current EVM snapshot required for forecasting
 */
export interface ProjectState {
  /** Budget at Completion (total planned budget) */
  bac: number;
  /** Actual Cost (cost incurred to date) */
  ac: number;
  /** Earned Value (value of work completed) */
  ev: number;
  /** Planned Value (value of work that should be complete by now) */
  pv: number;
  /** Cost Performance Index (EV / AC) */
  cpi: number;
  /** Schedule Performance Index (EV / PV) */
  spi: number;
  /** Remaining duration in working days */
  remainingDuration: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default engine parameters - sensible starting values
 */
export const DEFAULT_ENGINE_PARAMS: EngineParams = {
  optimismFactor: 1.0,        // Neutral (no optimism/pessimism bias)
  riskBuffer: 0.10,           // 10% risk buffer
  resourceEfficiency: 0.90,   // 90% efficiency
  scopeContingency: 0.05,     // 5% scope growth expected
  laborCostMultiplier: 1.0,   // No labor rate variance
  iterations: 1000            // 1000 Monte Carlo iterations
};

/**
 * Parameter configuration for UI display
 */
export const PARAM_LABELS: Record<keyof Omit<EngineParams, 'iterations'>, {
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  isPercent: boolean;
}> = {
  optimismFactor: {
    label: 'Optimism Bias',
    description: 'Skew simulation >1 (better) or <1 (worse)',
    min: 0.5,
    max: 2.0,
    step: 0.1,
    isPercent: false
  },
  riskBuffer: {
    label: 'Risk Variance',
    description: 'Std Dev for Monte Carlo inputs',
    min: 0,
    max: 0.5,
    step: 0.05,
    isPercent: true
  },
  resourceEfficiency: {
    label: 'Resource Efficiency',
    description: 'Base efficiency override',
    min: 0.5,
    max: 1.0,
    step: 0.05,
    isPercent: true
  },
  scopeContingency: {
    label: 'Scope Growth %',
    description: 'Likely unapproved scope creep',
    min: 0,
    max: 0.3,
    step: 0.05,
    isPercent: true
  },
  laborCostMultiplier: {
    label: 'Labor Rate Multi',
    description: 'Rate variance impact',
    min: 0.8,
    max: 1.5,
    step: 0.05,
    isPercent: false
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Box-Muller Transform - Generate normally distributed random number
 * 
 * @param mean - Center of the distribution
 * @param stdDev - Standard deviation (spread)
 * @returns Random number from normal distribution
 * 
 * @example
 * // Generate random value centered at 1.0 with 10% std dev
 * const value = randomNormal(1.0, 0.1);
 */
export function randomNormal(mean: number, stdDev: number): number {
  const u = 1 - Math.random();  // (0, 1] to avoid log(0)
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdDev + mean;
}

/**
 * Calculate percentile from sorted array
 * 
 * @param sortedArray - Pre-sorted array of numbers
 * @param percentile - Percentile to calculate (0.0 to 1.0)
 * @returns Value at the given percentile
 */
function getPercentile(sortedArray: number[], percentile: number): number {
  const index = Math.floor(sortedArray.length * percentile);
  return sortedArray[Math.min(index, sortedArray.length - 1)];
}

// ============================================================================
// CORE CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate standard EVM IEAC (Independent Estimate at Completion)
 * 
 * Three methods:
 * 1. Budget Rate (Optimistic): Assumes remaining work at budget rate
 * 2. CPI (Status Quo): Assumes remaining work at current CPI
 * 3. CPI*SPI (Pessimistic): Accounts for schedule slip cost
 * 
 * @param bac - Budget at Completion
 * @param ac - Actual Cost
 * @param ev - Earned Value
 * @param cpi - Cost Performance Index
 * @param spi - Schedule Performance Index
 * @returns IEAC values for all three methods
 */
export function calculateIEAC(
  bac: number,
  ac: number,
  ev: number,
  cpi: number,
  spi: number
): { budgetRate: number; cpi: number; cpiSpi: number } {
  const remainingBudget = bac - ev;
  
  return {
    // Optimistic: Future work at budgeted rate
    budgetRate: ac + remainingBudget,
    
    // Realistic: Future work at current CPI
    cpi: cpi > 0 ? bac / cpi : bac,
    
    // Pessimistic: Future work at CPI*SPI (includes schedule drag cost)
    cpiSpi: cpi > 0 && spi > 0 
      ? ac + (remainingBudget / (cpi * spi))
      : ac + remainingBudget
  };
}

/**
 * Calculate TCPI (To-Complete Performance Index)
 * 
 * TCPI indicates the efficiency required to complete remaining work
 * within budget constraints.
 * 
 * @param bac - Budget at Completion
 * @param ev - Earned Value
 * @param ac - Actual Cost
 * @param eac - Estimate at Completion (usually P50 from Monte Carlo)
 * @returns TCPI values for BAC and EAC targets
 */
export function calculateTCPI(
  bac: number,
  ev: number,
  ac: number,
  eac: number
): { toBac: number; toEac: number } {
  const workRemaining = bac - ev;
  const budgetRemaining = bac - ac;
  const eacRemaining = eac - ac;
  
  return {
    // TCPI to BAC: Efficiency needed to hit original budget
    toBac: budgetRemaining > 0 ? workRemaining / budgetRemaining : 0,
    
    // TCPI to EAC: Efficiency needed to hit forecasted EAC
    toEac: eacRemaining > 0 ? workRemaining / eacRemaining : 0
  };
}

/**
 * Run Monte Carlo Simulation for forecasting
 * 
 * @param projectState - Current project EVM state
 * @param params - Engine parameters for simulation
 * @returns Complete ForecastResult with all calculations
 * 
 * @example
 * const state = { bac: 500000, ac: 220000, ev: 210000, ... };
 * const result = runForecastSimulation(state, DEFAULT_ENGINE_PARAMS);
 * console.log(`P50 Cost: $${result.monteCarloCost.p50}`);
 */
export function runForecastSimulation(
  projectState: ProjectState,
  params: EngineParams
): ForecastResult {
  const { bac, ac, ev, cpi, spi, remainingDuration } = projectState;
  const { 
    optimismFactor, 
    riskBuffer, 
    scopeContingency, 
    laborCostMultiplier, 
    iterations 
  } = params;

  const costSamples: number[] = [];
  const durationSamples: number[] = [];

  // =========================================================================
  // MONTE CARLO SIMULATION
  // =========================================================================
  
  for (let i = 0; i < iterations; i++) {
    // Randomize factors based on Normal Distribution around the parameter
    // The parameter is the Mean, with ~10% of parameter as Standard Deviation
    const simRisk = Math.max(0, randomNormal(riskBuffer, 0.05));
    const simScope = Math.max(0, randomNormal(scopeContingency, 0.02));
    const simLabor = Math.max(0.5, randomNormal(laborCostMultiplier, 0.1));
    
    // Randomize Efficiency (CPI/SPI) based on Optimism Factor
    // optimismFactor > 1 means we expect to get BETTER
    // optimismFactor < 1 means we expect to get WORSE
    const simCpi = Math.max(0.5, randomNormal(cpi * optimismFactor, 0.1));
    const simSpi = Math.max(0.5, randomNormal(spi * optimismFactor, 0.1));

    // Calculate Forecast for this iteration
    // Remaining work = (BAC - EV) * (1 + scope growth)
    const remainingWork = (bac - ev) * (1 + simScope);
    
    // ETC (Estimate to Complete) = Remaining Work / simulated CPI * factors
    const etcCost = (remainingWork / simCpi) * (1 + simRisk) * simLabor;
    
    // EAC (Estimate at Completion) = Actual Cost + ETC
    const eacCost = ac + etcCost;

    // Duration: Remaining duration adjusted by SPI and risk
    const etcDuration = (remainingDuration / simSpi) * (1 + simRisk);
    
    costSamples.push(eacCost);
    durationSamples.push(etcDuration);
  }

  // =========================================================================
  // CALCULATE PERCENTILES
  // =========================================================================
  
  // Sort samples for percentile calculation
  costSamples.sort((a, b) => a - b);
  durationSamples.sort((a, b) => a - b);

  const monteCarloCost: SimulationResult = {
    p10: getPercentile(costSamples, 0.10),
    p50: getPercentile(costSamples, 0.50),
    p90: getPercentile(costSamples, 0.90),
    mean: costSamples.reduce((a, b) => a + b, 0) / iterations,
    min: costSamples[0],
    max: costSamples[iterations - 1]
  };

  const monteCarloDuration: SimulationResult = {
    p10: getPercentile(durationSamples, 0.10),
    p50: getPercentile(durationSamples, 0.50),
    p90: getPercentile(durationSamples, 0.90),
    mean: durationSamples.reduce((a, b) => a + b, 0) / iterations,
    min: durationSamples[0],
    max: durationSamples[iterations - 1]
  };

  // =========================================================================
  // STANDARD EVM CALCULATIONS
  // =========================================================================
  
  const ieac = calculateIEAC(bac, ac, ev, cpi, spi);
  const tcpi = calculateTCPI(bac, ev, ac, monteCarloCost.p50);

  // =========================================================================
  // COMPLETION DATE
  // =========================================================================
  
  const today = new Date();
  const p50Days = Math.round(monteCarloDuration.p50);
  const completionDate = new Date(today);
  completionDate.setDate(today.getDate() + p50Days);
  
  const completionDateStr = completionDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return {
    monteCarloCost,
    monteCarloDuration,
    ieac,
    tcpi,
    completionDate: completionDateStr
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a log entry for a simulation run
 * 
 * @param params - Parameters used
 * @param result - Simulation result
 * @returns EngineLogEntry for audit trail
 */
export function createLogEntry(
  params: EngineParams,
  result: ForecastResult
): EngineLogEntry {
  return {
    timestamp: new Date().toISOString(),
    type: 'simulation',
    message: `Monte Carlo (${params.iterations} runs) complete.`,
    params,
    results: {
      p50Cost: result.monteCarloCost.p50,
      p90Cost: result.monteCarloCost.p90,
      p50Date: result.completionDate
    }
  };
}

/**
 * Derive ProjectState from aggregated project data
 * 
 * @param projects - Array of project objects with budget/cost data
 * @param remainingDays - Estimated remaining duration
 * @returns ProjectState ready for simulation
 * 
 * @example
 * const state = deriveProjectState(data.projects, 120);
 * const forecast = runForecastSimulation(state, params);
 */
export function deriveProjectState(
  projects: Array<{
    baselineBudget?: number;
    actualCost?: number;
    percentComplete?: number;
  }>,
  remainingDays: number
): ProjectState {
  // Aggregate across all projects
  const bac = projects.reduce((sum, p) => sum + (p.baselineBudget || 0), 0);
  const ac = projects.reduce((sum, p) => sum + (p.actualCost || 0), 0);
  const ev = projects.reduce((sum, p) => {
    const projectBac = p.baselineBudget || 0;
    const pct = (p.percentComplete || 0) / 100;
    return sum + (projectBac * pct);
  }, 0);
  
  // Estimate PV based on time elapsed (simplified)
  const pv = ev; // In real implementation, calculate based on schedule
  
  // Calculate performance indices
  const cpi = ac > 0 ? ev / ac : 1;
  const spi = pv > 0 ? ev / pv : 1;
  
  return {
    bac,
    ac,
    ev,
    pv,
    cpi,
    spi,
    remainingDuration: remainingDays
  };
}

/**
 * Format currency value for display
 * 
 * @param value - Dollar amount
 * @returns Formatted string like "$525K" or "$1.2M"
 */
export function formatForecastCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  return `$${(value / 1000).toFixed(0)}K`;
}

/**
 * Format variance as percentage
 * 
 * @param actual - Actual/forecast value
 * @param baseline - Baseline/budget value
 * @returns Formatted percentage string with sign
 */
export function formatVariancePercent(actual: number, baseline: number): string {
  if (baseline === 0) return '0%';
  const variance = ((actual - baseline) / baseline) * 100;
  const sign = variance >= 0 ? '+' : '';
  return `${sign}${variance.toFixed(1)}%`;
}

