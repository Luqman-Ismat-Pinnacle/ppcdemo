# Role View Enhancement Changelog

Last updated: 2026-02-26

## Scope
Tracks implementation status for Role View Enhancement Plan v2.1.

## Completed
- Canonicalized legacy routes:
  - `/role-views/pca-workspace` -> `/role-views/pca/mapping`
  - `/role-views/pcl-exceptions` -> `/role-views/pcl/exceptions`
- Global navigation updated to canonical role-workstation links.
- Role identity strip added in workstation shell context.
- Strict schema migration added for:
  - `milestones.is_client_visible`
  - alert/workflow audit index hardening
  - commitment review fields/indexes
- New role enhancement contract gate:
  - `npm run check:role-enhancement-contracts`
- Global role-aware nav was further hardened to workstation-first links so each role now navigates primarily through `/role-views/*` routes.
- Project Lead schedule route now includes:
  - phase efficiency panel (planned vs actual hours)
  - embedded `RoleScopedWbsWorkspace` for in-route schedule operations
- PCA `/role-views/pca/plan-uploads` now includes in-page operational flow:
  - project + `.mpp` file selection
  - direct storage upload + document metadata write
  - publish action to `/api/documents/process-mpp`
  - per-project mini version history list
- Project Lead `/role-views/project-lead/documents` now supports in-route operational updates:
  - status updates persisted via `/api/project-documents`
  - signoff required/complete toggle persistence
- Project Lead `/role-views/project-lead/report` is now tier-gated (`tier2`) to align rollout model.
- Check gates hardened:
  - role smoke and role enhancement contract scripts now auto-pick a free local port
  - both scripts auto-run `next build` when `.next/BUILD_ID` is missing
- Added rollout feature flags:
  - `NEXT_PUBLIC_ROLE_ENHANCE_TIER1`
  - `NEXT_PUBLIC_ROLE_ENHANCE_TIER2`
  - `NEXT_PUBLIC_ROLE_ENHANCE_TIER3`
  - enforced in `RoleWorkstationShell` via `requiredTier` gating.
- `check:role-enhancement-contracts` expanded to verify:
  - `/api/project-documents` list contract
  - key workstation routes return non-5xx (`/role-views/pca/plan-uploads`, `/role-views/project-lead/documents`)

## Tier 1 Functionalization (Done)
- PCA:
  - home queue
  - mapping workstation
  - plan upload status table
  - data quality triage with summary/trend
- PCL:
  - schedule health
  - plans/mapping supervision
  - exceptions queue merge + actions
  - resourcing outlier lane
- Senior Manager:
  - projects rollup
  - documents workflow status pane
- COO:
  - period review operational table
  - commitments decision lane
- RDA:
  - hours and work lanes

## Tier 2 / Tier 3 Enhancements (Mostly Done)
- Project Lead:
  - home: period efficiency + overdue queue actions + milestones
  - schedule: phase-level and critical-path risk tables
  - team: workload/utilization panel
  - week-ahead: actionable board with quick links
  - forecast: scenario multiplier + variance tasks
  - documents: detailed workflow table
- Senior Manager:
  - milestones filters (all/overdue/upcoming)
  - commitments status filtering and summary strip
- COO:
  - main page adds live open exceptions + decision queue counters
  - milestones filters (all/overdue/upcoming/at risk)
  - AI briefing adds preset prompts + last query timestamp
- Client Portal:
  - client-safe language for metrics
  - milestone visibility constrained by `is_client_visible`
  - document visibility constrained by client-facing statuses

## Remaining Polish
- Optional UX polish for charts/animations/tables.
- Optional broad lint remediation (build currently passes with warnings).
- Build environment hygiene: local dependency/swc mismatch can still block full build validation in this workspace.
