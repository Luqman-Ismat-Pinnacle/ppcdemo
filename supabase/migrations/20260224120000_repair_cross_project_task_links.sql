-- Repair cross-project task links and add workday phase mapping support
-- for units/phases.

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS workday_phase_id VARCHAR(50) REFERENCES workday_phases(id) ON DELETE SET NULL;

ALTER TABLE phases
  ADD COLUMN IF NOT EXISTS workday_phase_id VARCHAR(50) REFERENCES workday_phases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_units_workday_phase_id ON units(workday_phase_id);
CREATE INDEX IF NOT EXISTS idx_phases_workday_phase_id ON phases(workday_phase_id);

-- 1) Cross-project parent links: clear parent_task_id when parent belongs to another project.
UPDATE tasks child
SET parent_task_id = NULL
FROM tasks parent
WHERE child.parent_task_id = parent.id
  AND COALESCE(child.project_id, '') <> COALESCE(parent.project_id, '');

-- 2) Orphan parent links: clear parent_task_id when parent task is missing.
UPDATE tasks child
SET parent_task_id = NULL
WHERE child.parent_task_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM tasks parent
    WHERE parent.id = child.parent_task_id
  );

-- 3) Cross-project dependencies: remove links where predecessor/successor are in different projects.
DELETE FROM task_dependencies td
USING tasks pred, tasks succ
WHERE pred.id = td.predecessor_task_id
  AND succ.id = td.successor_task_id
  AND COALESCE(pred.project_id, '') <> COALESCE(succ.project_id, '');

-- 4) Orphan dependencies: remove links where either side task no longer exists.
DELETE FROM task_dependencies td
WHERE NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = td.predecessor_task_id)
   OR NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = td.successor_task_id);
