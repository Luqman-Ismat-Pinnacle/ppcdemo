-- Add baseline_count, baseline_metric, baseline_uom to all hierarchy levels below project

ALTER TABLE units ADD COLUMN IF NOT EXISTS baseline_count INTEGER DEFAULT 0;
ALTER TABLE units ADD COLUMN IF NOT EXISTS baseline_metric TEXT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS baseline_uom TEXT;

ALTER TABLE phases ADD COLUMN IF NOT EXISTS baseline_count INTEGER DEFAULT 0;
ALTER TABLE phases ADD COLUMN IF NOT EXISTS baseline_metric TEXT;
ALTER TABLE phases ADD COLUMN IF NOT EXISTS baseline_uom TEXT;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS baseline_count INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS baseline_metric TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS baseline_uom TEXT;

ALTER TABLE sub_tasks ADD COLUMN IF NOT EXISTS baseline_count INTEGER DEFAULT 0;
ALTER TABLE sub_tasks ADD COLUMN IF NOT EXISTS baseline_metric TEXT;
ALTER TABLE sub_tasks ADD COLUMN IF NOT EXISTS baseline_uom TEXT;
