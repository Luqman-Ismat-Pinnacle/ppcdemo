-- Migration: update_hierarchy_phase_unit
-- Description: Updates the database schema to reflect the new hierarchy: Portfolio -> Customer -> Site -> Project -> Phase -> Unit -> Task
-- Removes unit_id from projects
-- Adds phase_id to units and removes site_id from units

-- 1. Add phase_id to units table
ALTER TABLE units ADD COLUMN IF NOT EXISTS phase_id TEXT REFERENCES phases(id);

-- 2. Migrate existing data (Optional/Best Effort)
-- If we have tasks linking units to phases via projects, we might try to infer, but simpler to just allow nulls for now as imports will fix it.
-- We can try to link units to the first phase of their linked project if possible, but the hierarchy change is structural.
-- For now, we leave phase_id NULL and let the MPP import populate it.

-- 3. Remove site_id from units table (Units now belong to Phases, not Sites directly)
ALTER TABLE units DROP COLUMN IF EXISTS site_id;

-- 4. Remove unit_id from projects table (Projects now contain Phases, they don't belong to Units)
ALTER TABLE projects DROP COLUMN IF EXISTS unit_id;

-- 5. Helper function to ensure task hierarchy flow
-- Update tasks to ensure they link to the unit if the unit is provided
-- (This is handled by application logic, but good to have constraints if needed)

-- 6. Grant permissions if needed (usually automatic for postgres user, but good for service role)
GRANT ALL ON units TO authenticated;
GRANT ALL ON units TO service_role;
