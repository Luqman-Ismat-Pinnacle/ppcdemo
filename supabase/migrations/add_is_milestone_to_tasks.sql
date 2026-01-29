-- Migration: Add column flags to tasks
-- Description: Adds boolean columns to track if a task is a milestone or a sub-task.

-- Add is_milestone if it doesn't exist
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN DEFAULT FALSE;

-- Add is_sub_task if it doesn't exist (also in schema)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_sub_task BOOLEAN DEFAULT FALSE;

-- Update existing tasks if they have "Milestone" in their name
UPDATE tasks SET is_milestone = TRUE WHERE name ILIKE '%milestone%' AND is_milestone = FALSE;
