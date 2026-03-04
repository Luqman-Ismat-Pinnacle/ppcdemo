-- Add total_slack (TF) to projects for rollup from MPP totalslack
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_slack INTEGER DEFAULT 0;
