-- Add total_slack (TF) to projects for rollup from MPP totalslack
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_slack INTEGER DEFAULT 0;

-- Ensure MPP-imported string values don't exceed varchar(255): application truncates in process-mpp route.
-- No schema change needed; truncation is applied at insert time.
