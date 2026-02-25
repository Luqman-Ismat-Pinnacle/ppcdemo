# Codebase Notes and Module Intent

This document provides quick intent-level guidance for the main modules in this repository.
It complements file-level comments and is intended to make onboarding and maintenance easier.

## App Shell and Layout
- `app/layout.tsx`
  - Root app composition for providers, shared chrome, and global background layers.
  - Hosts `Header`, `HelpButton`, and `SnapshotPopup`.
  - Uses container-level loading patterns instead of full-page route overlays.

- `app/globals.css`
  - Global design tokens and theme variables (`[data-theme="light"]` + default dark).
  - Background atmosphere system (`.app-background`, `.bg-noise`, `.bg-vignette*`, `.video-overlay`).
  - Shared utility styles for cards, loaders, and interaction affordances.

## Data Access and Sync
- `lib/database.ts`
  - Unified read path from PostgreSQL (primary) or Supabase (fallback).
  - Returns app-shaped data payload used by Data Context.

- `lib/supabase.ts`
  - Environment checks, table mapping, key conversion helpers.
  - `DATA_KEY_TO_TABLE` controls what Data Management can sync to DB.
  - Legacy table mappings removed in hard-prune phase.

- `app/api/data/sync/route.ts`
  - Server-side write API for data sync operations (`replace`, `delete`, `wipeAll`, etc.).
  - Contains normalization/cleaning logic per table before DB writes.
  - PostgreSQL-first with Supabase fallback when applicable.

## Data State and Transform Layer
- `lib/data-context.tsx`
  - App-wide state provider that fetches `/api/data`, applies transforms, and exposes filtered data.
  - Includes hierarchy/date filtering and refresh synchronization.

- `lib/data-store.ts`
  - Backward-compatible minimal data container utilities.
  - Keeps empty-data bootstrap shape aligned with `SampleData`.

- `lib/data-transforms.ts`
  - Heavy analytics/derived data engine.
  - Converts raw normalized tables into UI-ready views and metrics.

## Data Management Page
- `app/project-controls/data-management/page.tsx`
  - Admin control plane for table-based CRUD/import/export workflows.
  - Section config is the source of truth for editable entities shown in UI.
  - Hard-prune updates removed legacy table sections that no longer exist in DB.

## Database Migrations
- `migrations/2026-02-25-legacy-hard-prune.sql`
  - Drops obsolete/legacy tables and duplicate singular log table artifact.
  - Preserves canonical `change_logs`.

- `migrations/2026-02-25-legacy-hard-prune-backup-notes.md`
  - Pre-migration audit/backup checklist and example commands.

## Auth Routes
- `app/api/auth/login/route.js`
  - Starts Auth0 login with optional connection/audience/role scope parameters.

- `app/api/auth/callback/route.js`
  - Handles Auth0 callback response and session establishment.

- `app/api/auth/logout/route.js`
  - Handles logout and redirect target behavior.

- `app/api/auth/me/route.js`
  - Returns authenticated profile/session information for client usage.
