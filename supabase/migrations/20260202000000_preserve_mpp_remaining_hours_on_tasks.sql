-- Preserve MPP parser remaining_hours on tasks: only auto-calculate when not explicitly set.
-- This allows MPP parser and Data Management to store remaining_hours without the trigger overwriting it.

-- Ensure helper exists (idempotent)
CREATE OR REPLACE FUNCTION calculate_remaining_hours(baseline_hours NUMERIC, actual_hours NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
  RETURN GREATEST(0, COALESCE(baseline_hours, 0) - COALESCE(actual_hours, 0));
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_remaining_cost(baseline_cost NUMERIC, actual_cost NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
  RETURN GREATEST(0, COALESCE(baseline_cost, 0) - COALESCE(actual_cost, 0));
END;
$$ LANGUAGE plpgsql;

-- Replace tasks trigger function to preserve MPP remaining_hours when provided
CREATE OR REPLACE FUNCTION auto_calculate_task_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Only overwrite when not explicitly set (so MPP parser / Data Management values are kept)
  NEW.remaining_hours := COALESCE(NEW.remaining_hours, calculate_remaining_hours(NEW.baseline_hours, NEW.actual_hours));
  NEW.remaining_cost := COALESCE(NEW.remaining_cost, calculate_remaining_cost(NEW.baseline_cost, NEW.actual_cost));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_calculate_task_fields ON tasks;
CREATE TRIGGER trigger_auto_calculate_task_fields
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_task_fields();
