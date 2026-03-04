-- Add explicit MPP bucket columns for hour-entry to schedule lineage mapping.
ALTER TABLE hour_entries
  ADD COLUMN IF NOT EXISTS mpp_task_phase TEXT,
  ADD COLUMN IF NOT EXISTS mpp_phase_unit TEXT;

CREATE INDEX IF NOT EXISTS idx_hour_entries_mpp_task_phase ON hour_entries (mpp_task_phase);
CREATE INDEX IF NOT EXISTS idx_hour_entries_mpp_phase_unit ON hour_entries (mpp_phase_unit);
