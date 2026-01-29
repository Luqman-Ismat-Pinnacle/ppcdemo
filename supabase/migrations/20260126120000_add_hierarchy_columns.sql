-- Add hierarchy columns to projects table if they don't exist
ALTER TABLE projects ADD COLUMN IF NOT EXISTS portfolio_id text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_id text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_id text;

-- Add hierarchy columns to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS portfolio_id text;

-- Add hierarchy columns to sites table
ALTER TABLE sites ADD COLUMN IF NOT EXISTS customer_id text;

-- Add foreign key constraints (optional but good for integrity)
-- We use simple text references here to avoid strict dependency issues during initial syncs if order varies,
-- but ideally these should be references. For now, matching the implicit schema is enough.
