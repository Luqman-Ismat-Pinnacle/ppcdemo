# Pinnacle Project Controls (PPC) V3

A comprehensive project controls and analytics platform built with Next.js, featuring real-time data visualization, resource management, and quality control tracking.

## ✨ Enhanced with Modern UI/UX

**Version 2.0** now includes professional UI/UX enhancements:
- 🎨 Glassmorphic design with gradient effects
- ✨ Smooth animations and transitions (60fps)
- 📦 Reusable modern component library
- 💫 Professional loading states with skeletons
- 🎯 Enhanced interactive elements with glow effects
- 📱 Fully responsive design
- 🐳 Docker-ready deployment

> See [UI_UX_ENHANCEMENTS.md](UI_UX_ENHANCEMENTS.md) for complete documentation of improvements.

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
| Auth | Auth0 |

## Authentication Setup (Auth0)

**The app automatically redirects to Auth0 login when you visit any URL.**

### Setup Steps:

**1. Create Auth0 Application**
- Go to [Auth0 Dashboard](https://manage.auth0.com)
- Applications > Create Application
- Name: "PPC NextJS"
- Type: **Regular Web Application**

**2. Configure Application Settings**

Add these URLs (replace with your actual URLs):

**Allowed Callback URLs:**
```
http://localhost:3000/api/auth/callback
https://ppc1.politemushroom-6b9c4fe7.eastus2.azurecontainerapps.io/api/auth/callback
```

**Allowed Logout URLs:**
```
http://localhost:3000
https://ppc1.politemushroom-6b9c4fe7.eastus2.azurecontainerapps.io
```

**Allowed Web Origins:**
```
http://localhost:3000
https://ppc1.politemushroom-6b9c4fe7.eastus2.azurecontainerapps.io
```

**3. Get Credentials & Update .env**

From Auth0 Settings, copy and add to `.env`:
```env
AUTH0_BASE_URL=https://ppc1.politemushroom-6b9c4fe7.eastus2.azurecontainerapps.io
AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret
```

**4. Deploy**
```bash
npm install --legacy-peer-deps
npm run build
docker-compose up --build
```

### How It Works:
- **Automatic Login**: App redirects to Auth0 when you visit any page
- **No Login Button**: Authentication is automatic via middleware
- **Logout**: Available in user profile dropdown in header

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

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start development server
npm run dev

# Open http://localhost:3000
```

### Docker Deployment

```bash
# Using Docker Compose (recommended)
docker-compose up --build

# Or using Docker directly
docker build -t ppc-nextjs-app .
docker run -p 3000:3000 --env-file .env ppc-nextjs-app

# Access at http://localhost:3000
```

## Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Create production build
npm run start    # Start production server
npm run lint     # Run ESLint
npm run clean    # Clean install
```

## 🎨 New UI Components

```tsx
import { Card, Button, Badge, MetricCard, Skeleton } from '@/components/ui';

// Modern Card
<Card hover gradient>
  <CardHeader title="Analytics" subtitle="Real-time data" />
  <CardBody>
    <Button variant="primary" size="md">Action</Button>
  </CardBody>
</Card>

// Metric with Trend
<MetricCard
  label="Total Revenue"
  value="$124,500"
  change={{ value: 12.5, trend: 'up' }}
/>

// Loading State
{loading ? <SkeletonCard /> : <Content />}
```

See [components/examples/ModernDashboardExample.tsx](components/examples/ModernDashboardExample.tsx) for complete examples.

## 📚 Documentation

- **UI/UX Enhancements**: [UI_UX_ENHANCEMENTS.md](UI_UX_ENHANCEMENTS.md)
- **Improvements Summary**: [IMPROVEMENTS_SUMMARY.md](IMPROVEMENTS_SUMMARY.md)
- **Component Examples**: [components/examples/](components/examples/)
- **Database Setup**: See SQL files in root directory

## License

Proprietary - Pinnacle Reliability © 2025
