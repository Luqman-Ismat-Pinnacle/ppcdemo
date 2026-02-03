# Legacy migrations folder

Database schema is consolidated in the project root:

- **`/schema.sql`** – Full schema with DROP/recreate (clean install or reset).
- **`/schema_full_postgres.sql`** – First-time setup for Azure Postgres (no DROP; includes Workday sync).

Supabase migrations live in **`supabase/migrations/`**.
