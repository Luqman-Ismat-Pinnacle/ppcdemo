-- Switch hierarchy from Project -> Phase -> Unit -> Task to Project -> Unit -> Phase -> Task
-- 1. Add unit_id to phases (phase belongs to unit)
ALTER TABLE phases ADD COLUMN IF NOT EXISTS unit_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_phases_unit_id ON phases(unit_id);

-- 2. Migrate: for each phase that was parent of units, set phase.unit_id to one of those units (pick first by id)
UPDATE phases p
SET unit_id = (
  SELECT u.id FROM units u WHERE u.phase_id = p.id ORDER BY u.id LIMIT 1
)
WHERE EXISTS (SELECT 1 FROM units u WHERE u.phase_id = p.id);

-- 3. Ensure units have project_id from their (current) phase before we drop phase_id
UPDATE units u
SET project_id = p.project_id
FROM phases p
WHERE u.phase_id = p.id AND (u.project_id IS NULL OR u.project_id = '');

-- 4. Drop phase_id from units
ALTER TABLE units DROP COLUMN IF EXISTS phase_id;
