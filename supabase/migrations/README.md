# Database migrations

The **single source of truth** for the database schema is the consolidated file in the project root:

- **`/schema.sql`** – Full schema (drops all tables, then creates tables, triggers, indexes). Use this for a clean database or to reset.

This folder contains one migration that mirrors that schema for Supabase:

- **`00000000000001_full_schema.sql`** – Same content as root `schema.sql`. Applied when running `supabase db push` or migrations on a new project.

For a clean install, run `schema.sql` in the Supabase SQL Editor or via `psql`. Do not run it on a database that already has data unless you intend to wipe it.
