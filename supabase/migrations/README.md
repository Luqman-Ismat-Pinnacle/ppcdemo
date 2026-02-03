# Database migrations

Schema files in the project root:

- **`/schema.sql`** – Full schema (drops all tables, then creates). Use for a clean database or reset.
- **`/schema_full_postgres.sql`** – First-time setup for Azure Postgres (no DROP; includes Workday sync).

This folder contains one migration that mirrors the drop/recreate schema for Supabase:

- **`00000000000001_full_schema.sql`** – Same content as root `schema.sql`. Applied when running `supabase db push` or migrations on a new project.

For a clean install, run `schema.sql` in the Supabase SQL Editor or via `psql`. Do not run it on a database that already has data unless you intend to wipe it.
