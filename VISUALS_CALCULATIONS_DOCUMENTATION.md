# Visual Calculations and Data Sources Documentation

## Overview

This document describes the calculations and data sources for all visual components in the PPC V3 application. Each visual's data requirements, calculations, and current data sources are documented to provide clarity on how metrics are derived and where they come from.

## Data Architecture

### Data Flow
1. **Raw Data** → Supabase database tables
2. **Data Context** → `/lib/data-context.tsx` provides centralized data access
3. **Data Transforms** → `/lib/data-transforms.ts` converts raw data to computed views
4. **Visual Components** → `/components/charts/` consume transformed data
5. **Pages** → `/app/insights/` and `/app/project-controls/` display visuals

### Data Access Pattern
All visuals access data through the `useData()` hook which provides:
- `data`: Complete dataset with all tables and computed views
- `filteredData`: Dataset filtered by hierarchy and date filters
- `hierarchyFilter`: Portfolio → Customer → Site → Project → Phase → Task filtering
- `dateFilter`: Time-based filtering (week, month, quarter, YTD, custom)

---

## 1. Budget Variance Waterfall Chart

**Component**: `/components/charts/BudgetVarianceChart.tsx`

### Data Structure
```typescript
interface BudgetVarianceItem {
  name: string;
  value: number;
  type: 'start' | 'increase' | 'decrease' | 'end';
}
```

### Calculations
- **Cumulative Values**: Running total calculated for waterfall display
- **Variance Display**: Shows positive (increases) and negative (decreases) changes
- **Currency Formatting**: USD formatting with $ prefix and comma separators

### Current Data Source
- **Table**: `budgetVariance` array in `SampleData`
- **Fields Used**: `name`, `value`, `type`
- **Origin**: Loaded from database via `/api/data` endpoint
- **Transforms**: None - used directly as provided

### Visual Logic
- **Start/End Items**: Displayed in teal (#40E0D0)
- **Increases**: Displayed in lime (#CDDC39)
- **Decreases**: Displayed in pink (#E91E63)
- **Tooltip**: Shows change amount and running total

---

## 2. S-Curve Progress Chart

**Component**: `/components/charts/SCurveChart.tsx`

### Data Structure
```typescript
interface SCurveData {
  dates: string[];
  planned: number[];
  actual: number[];
  forecast: number[];
}
```

### Calculations
- **Cumulative Values**: All arrays represent cumulative totals over time
- **Progress Comparison**: Planned vs Actual vs Forecast progression
- **Time Series**: X-axis represents dates/periods

### Current Data Source
- **Table**: `sCurve` object in `SampleData`
- **Fields Used**: `dates`, `planned`, `actual`, `forecast`
- **Origin**: Computed in data transforms from task and hours data
- **Transforms**: Built from task baseline/actual hours aggregated by date

### Visual Logic
- **Planned Line**: Teal (#40E0D0) with area fill
- **Actual Line**: Lime (#CDDC39) with area fill
- **Forecast Line**: Orange (#FF8C00) dashed with area fill
- **Smooth Curves**: All lines use smoothing for better visualization

---

## 3. Hours Waterfall Chart

**Component**: `/components/charts/HoursWaterfallChart.tsx`

### Data Structure
```typescript
{
  tasks: string[];
  actualWorked: number[];
  estimatedAdded: number[];
}
```

### Calculations
- **Variance**: `actualWorked[i] - estimatedAdded[i]` per task
- **Total Planned**: Sum of all `estimatedAdded` values
- **Total Actual**: Sum of all `actualWorked` values
- **Variance Percentage**: `((totalActual - totalPlanned) / totalPlanned) * 100`
- **View Aggregations**: 
  - By Task: Individual task values
  - By Phase: Aggregate tasks by phase
  - By Time: Distribute across time periods

### Current Data Source
- **Table**: `taskHoursEfficiency` in `SampleData`
- **Fields Used**: `tasks`, `actualWorked`, `estimatedAdded`
- **Origin**: Computed from task baselineHours vs actualHours
- **Transforms**: Built from task table with efficiency calculations

### Visual Logic
- **Waterfall Structure**: Shows planned → variances → actual
- **Color Coding**: 
  - Planned/Actual: Teal (#40E0D0)
  - Over-budget: Red (#ef4444)
  - Under-budget: Green (#10b981)
- **Interactive Filtering**: Click to filter by efficiency status

---

## 4. QC Pass/Fail Stacked Chart

**Component**: `/components/charts/QCPassFailStackedChart.tsx`

### Data Structure
```typescript
Array<{ name: string; pass: number; fail: number }>
```

### Calculations
- **Total per Category**: `pass + fail` for each item
- **Pass Rate**: `pass / (pass + fail) * 100` (displayed in other components)
- **Stacked Values**: Horizontal bars showing pass/fail breakdown

### Current Data Source
- **Table**: `qcPassFailByTask` in `SampleData`
- **Fields Used**: `name`, `pass`, `fail`
- **Origin**: Computed from QC task results
- **Transforms**: Aggregated from QCTask table by task/subproject

### Visual Logic
- **Horizontal Stacking**: Pass values stack on fail values
- **Color Coding**: 
  - QC Pass: Teal (#40E0D0)
  - QC Fail: Green (#10B981)
- **Interactive**: Click bars to filter by category

---

## 5. Milestone Status Pie Chart

**Component**: `/components/charts/MilestoneStatusPie.tsx`

### Data Structure
```typescript
interface MilestoneStatusItem {
  name: string;
  value: number;
  color: string;
}
```

### Calculations
- **Total Count**: Sum of all milestone counts
- **Percentages**: Calculated per segment for tooltip display
- **Color Mapping**: Predefined colors per status type

### Current Data Source
- **Table**: `milestoneStatus` in `SampleData`
- **Fields Used**: `name`, `value`, `color`
- **Origin**: Computed from milestone table status aggregation
- **Transforms**: Built from MilestoneTable grouped by status

### Visual Logic
- **Donut Chart**: 50-75% radius for donut effect
- **Status Colors**: 
  - Complete: Green
  - In Progress: Yellow
  - Not Started: Gray
  - Missed: Red
- **Legend**: Vertical placement on right side

---

## 6. Labor Breakdown Chart

**Component**: `/components/charts/LaborBreakdownChart.tsx`

### Data Structure
```typescript
{
  months: string[];
  byEmployee: Record<string, number[]>;
}
```

### Calculations
- **Period Totals**: Sum of all categories per time period
- **Grand Total**: Sum across all periods and categories
- **Percentages**: Calculated per category within each period
- **Stacking Logic**: Categories stacked to show total hours per period

### Current Data Source
- **Table**: `laborChartData` in `SampleData`
- **Fields Used**: `months`, `byEmployee`
- **Origin**: Computed from hours entries aggregated by employee and month
- **Transforms**: Built from HourEntry table grouped by employee and time period

### Visual Logic
- **Stacked Bars**: Multiple categories stacked per time period
- **Pinnacle Colors**: Consistent brand color palette
- **Interactive**: Click segments to filter by category
- **Responsive**: ResizeObserver for smooth resizing

---

## 7. Gauge Charts (SPI/CPI)

**Component**: `/components/charts/GaugeChart.tsx`

### Data Structure
```typescript
{
  value: number;
  min: number;
  max: number;
  thresholds: Array<{ value: number; color: string }>;
}
```

### Calculations
- **SPI (Schedule Performance Index)**: `EV / PV` (Earned Value / Planned Value)
- **CPI (Cost Performance Index)**: `EV / AC` (Earned Value / Actual Cost)
- **Threshold Mapping**: Color zones based on performance ranges

### Current Data Source
- **Computed In-Page**: Overview page calculates from WBS data
- **Fields Used**: `pv`, `ev`, `ac` from WBS items
- **Origin**: Task-level earned value calculations
- **Transforms**: Rolled up from task baseline/actual costs and progress

### Visual Logic
- **Gauge Zones**: Red (<0.9), Yellow (0.9-1.1), Green (>1.1)
- **Pointer**: Shows current value position
- **Labels**: Display current value and threshold indicators

---

## 8. Resource Heatmap Chart

**Component**: `/components/charts/ResourceHeatmapChart.tsx`

### Data Structure
```typescript
{
  resources: string[];
  weeks: string[];
  data: number[][];
}
```

### Calculations
- **Utilization Percentage**: `(assignedHours / availableHours) * 100`
- **Color Mapping**: Heat gradient based on utilization levels
- **Matrix Layout**: Resources × Time periods grid

### Current Data Source
- **Table**: `resourceHeatmap` in `SampleData`
- **Fields Used**: `resources`, `weeks`, `data`
- **Origin**: Computed from resource assignments and calendars
- **Transforms**: Built from employee assignments and availability

### Visual Logic
- **Heat Gradient**: Blue (low) → Green (optimal) → Red (over-utilized)
- **Grid Layout**: Resources on Y-axis, time periods on X-axis
- **Cell Coloring**: Based on utilization percentage ranges

---

## 9. Forecast Chart

**Component**: `/components/charts/ForecastChart.tsx`

### Data Structure
```typescript
{
  months: string[];
  baseline: number[];
  actual: number[];
  forecast: number[];
}
```

### Calculations
- **Forecast Extension**: Continuation of actual trends
- **Variance Analysis**: Baseline vs actual vs forecast comparison
- **Trend Projection**: Linear or weighted forecasting methods

### Current Data Source
- **Table**: `forecast` in `SampleData`
- **Fields Used**: `months`, `baseline`, `actual`, `forecast`
- **Origin**: Computed using forecasting engine
- **Transforms**: Generated by `/lib/forecasting-engine.ts`

### Visual Logic
- **Multi-Line Display**: Three series comparison
- **Forecast Region**: Dashed line for projected values
- **Confidence Bands**: Optional confidence intervals

---

## 10. Task Hours Efficiency Chart

**Component**: `/components/charts/TaskHoursEfficiencyChart.tsx`

### Data Structure
```typescript
{
  tasks: string[];
  actualWorked: number[];
  estimatedAdded: number[];
  efficiency: number[];
}
```

### Calculations
- **Efficiency Percentage**: `(estimatedHours / actualHours) * 100`
- **Variance Analysis**: Difference between planned and actual
- **Efficiency Rating**: Good (>100%), Warning (80-100%), Bad (<80%)

### Current Data Source
- **Table**: `taskHoursEfficiency` in `SampleData`
- **Fields Used**: `tasks`, `actualWorked`, `estimatedAdded`, `efficiency`
- **Origin**: Computed from task baseline vs actual hours
- **Transforms**: Built from Task table efficiency calculations

### Visual Logic
- **Grouped Bars**: Actual vs Estimated side-by-side
- **Efficiency Overlay**: Line chart showing efficiency percentage
- **Color Coding**: Based on efficiency performance levels

---

## Data Transformations

### Key Transformation Functions

#### 1. Labor Breakdown Calculation
```typescript
// From HourEntry → LaborChartData
function buildLaborBreakdown(hours: HourEntry[], employees: Employee[]): LaborChartData
```
- Groups hours by employee and time period
- Calculates totals and percentages
- Handles charge code and project aggregations

#### 2. S-Curve Data Construction
```typescript
// From Task + Hours → SCurveData
function buildSCurveData(tasks: Task[], hours: HourEntry[]): SCurveData
```
- Aggregates baseline and actual hours by date
- Calculates cumulative progress
- Generates forecast projections

#### 3. QC Metrics Aggregation
```typescript
// From QCTask → QC Metrics
function buildQCMetrics(qcTasks: QCTask[]): QCByTask[]
```
- Groups QC results by task/subproject
- Calculates pass/fail rates
- Computes feedback times and scores

#### 4. WBS and Earned Value
```typescript
// From Task hierarchy → WBS with EVM
function buildWBSData(tasks: Task[]): WBSData
```
- Builds hierarchical work breakdown structure
- Calculates PV, EV, AC for each item
- Rolls up metrics from child to parent levels

### Computed Views

The following views are computed in `/lib/data-transforms.ts` and stored in the data context:

1. **wbsData**: Hierarchical work breakdown with EVM metrics
2. **laborBreakdown**: Multi-dimensional labor analysis
3. **resourceHeatmap**: Resource utilization matrix
4. **sCurve**: Cumulative progress curves
5. **taskHoursEfficiency**: Task-level efficiency metrics
6. **qcPassFailByTask**: QC performance by task
7. **milestoneStatus**: Milestone completion status
8. **forecast**: Projected performance trends

## Filter Integration

### Hierarchy Filtering
- **Portfolio → Customer → Site → Project → Phase → Task**
- Cascading filters maintain data integrity
- Applied in `data-context.tsx` `filteredData` computation

### Date Filtering
- **Predefined Ranges**: Week, Month, Quarter, YTD, Year
- **Custom Ranges**: User-defined start/end dates
- **Affects**: Tasks, Hours, QC transactions, Milestones

## Performance Considerations

### Data Optimization
1. **Memoization**: Expensive calculations cached with `useMemo`
2. **Lazy Loading**: Large datasets loaded on demand
3. **Incremental Updates**: Only recompute affected views on data changes

### Chart Optimization
1. **Data Sampling**: Large datasets sampled for visualization
2. **Virtual Scrolling**: Long lists use virtual scrolling
3. **Debounced Updates**: Filter changes debounced to prevent excessive re-renders

## Data Quality and Validation

### Input Validation
- **Type Safety**: TypeScript interfaces enforce data structure
- **Null Handling**: Graceful degradation for missing data
- **Range Validation**: Ensure numeric values within expected ranges

### Error Handling
- **Empty States**: User-friendly messages when no data available
- **Loading States**: Spinners during data fetching
- **Error Boundaries**: Prevent component crashes from data errors

## Future Enhancements

### Planned Improvements
1. **Real-time Updates**: WebSocket integration for live data
2. **Advanced Forecasting**: Machine learning-based predictions
3. **Custom Metrics**: User-defined KPI calculations
4. **Data Export**: CSV/PDF export capabilities
5. **Historical Trends**: Long-term trend analysis

### Extensibility
- **Plugin Architecture**: Support for custom visual components
- **API Integration**: External data source connectors
- **Custom Transforms**: User-defined data transformation rules

---

This documentation serves as a comprehensive reference for understanding how each visual component derives its data, performs calculations, and integrates with the overall data architecture. For specific implementation details, refer to the individual component files and transformation functions mentioned above.
