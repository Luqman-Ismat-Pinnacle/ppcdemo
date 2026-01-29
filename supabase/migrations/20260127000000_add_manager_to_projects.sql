-- Add manager column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS manager text;
