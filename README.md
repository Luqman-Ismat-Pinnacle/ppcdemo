# Pinnacle Project Controls (PPC) V3

A comprehensive project controls and analytics platform built with Next.js, featuring real-time data visualization, resource management, and quality control tracking.

## Overview

PPC V3 is an enterprise-grade project controls application designed for reliability engineering and project management teams. It provides:

- **Project Controls**: WBS/Gantt charts, resourcing, and resource leveling
- **Insights & Analytics**: Hours analysis, QC dashboards, milestone tracking, document management
- **Project Management**: Sprint planning, forecasting, and QC logging
- **Data Management**: Centralized data hub with Excel/CSV/JSON import/export

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16+ (App Router) |
| Language | TypeScript |
| UI | React 19, Tailwind CSS v4 |
| Charts | Apache ECharts |
| Gantt | dhtmlx-gantt |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |

### Environment Variables

`.env.local` file with:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Project Structure

```
ppc-v3/
├── app/                          # Next.js App Router
│   ├── project-controls/         # Project Controls section
│   │   ├── wbs-gantt/           # WBS & Gantt Chart
│   │   ├── resourcing/          # Resource allocation
│   │   ├── resource-leveling/   # Resource optimization
│   │   └── data-management/     # Data import/export hub
│   ├── insights/                # Analytics section
│   │   ├── overview/            # Executive dashboard
│   │   ├── hours/               # Labor analysis
│   │   ├── qc-dashboard/        # Quality control metrics
│   │   ├── milestones/          # Milestone tracking
│   │   └── documents/           # Document management
│   ├── project-management/      # PM section
│   │   ├── sprint/              # Sprint planning
│   │   ├── forecast/            # Budget forecasting
│   │   └── qc-log/              # QC transaction log
│   ├── login/                   # Authentication
│   └── help/                    # Documentation
├── components/                  # React components
│   ├── layout/                  # Header, Navigation, Theme
│   ├── charts/                  # ECharts visualizations
│   ├── wbs/                     # WBS components
│   └── kanban/                  # Sprint board
├── lib/                         # Core utilities
│   ├── data-context.tsx         # React Context for data
│   ├── auth-context.tsx         # Authentication context
│   ├── supabase.ts              # Database client
│   ├── data-converter.ts        # Data transformation
│   ├── cpm-engine.ts            # Critical path calculations
│   └── utilization-engine.ts    # Resource utilization
└── types/                       # TypeScript definitions
    └── data.ts                  # Data models
```

## Data Architecture

```
Data Sources (CSV, JSON, Excel)
            │
            ▼
    ┌───────────────┐
    │ Data Converter │
    └───────┬───────┘
            │
            ▼
    ┌───────────────────┐         ┌──────────┐
    │ Data Management   │◄───────►│ Supabase │
    │      Page         │         └──────────┘
    └───────┬───────────┘
            │
            ▼
    ┌───────────────┐
    │ Data Context  │
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │ App Pages     │
    └───────────────┘
```

All application pages consume data through the centralized `DataContext`, which provides:
- Filtered data based on hierarchy selection
- Date range filtering
- Real-time updates via state management

## Key Features

### Data Import/Export
- **Excel**: Full workbook import/export with template support
- **CSV**: Workday employee exports, timecard data
- **JSON**: Project plan hierarchies

### Hierarchy Filtering
Cascading filter system: Portfolio → Customer → Site → Project → Phase

### Visualizations
- S-Curve charts for project progress
- Waterfall charts for variance analysis
- Heatmaps for resource utilization
- Gantt charts for scheduling

### Quality Control
- QC gate tracking
- Transaction logging
- Efficiency metrics

## Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Create production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## License

Proprietary - Pinnacle Reliability © 2025
