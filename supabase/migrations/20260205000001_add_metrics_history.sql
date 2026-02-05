-- Migration: Add metrics_history table for variance trending feature
-- This table stores daily snapshots of key metrics for historical comparison

-- Create metrics_history table
CREATE TABLE IF NOT EXISTS metrics_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_date DATE NOT NULL,
  scope VARCHAR(50) NOT NULL DEFAULT 'all',  -- 'project', 'phase', 'task', 'all'
  scope_id VARCHAR(50),                       -- ID of the scoped entity
  
  -- Progress metrics
  total_tasks INTEGER,
  completed_tasks INTEGER,
  percent_complete NUMERIC(5, 2),
  
  -- Hours metrics  
  baseline_hours NUMERIC(12, 2),
  actual_hours NUMERIC(12, 2),
  remaining_hours NUMERIC(12, 2),
  
  -- Cost metrics
  baseline_cost NUMERIC(14, 2),
  actual_cost NUMERIC(14, 2),
  remaining_cost NUMERIC(14, 2),
  
  -- EVM metrics
  earned_value NUMERIC(14, 2),
  planned_value NUMERIC(14, 2),
  cpi NUMERIC(5, 3),
  spi NUMERIC(5, 3),
  
  -- QC metrics
  qc_pass_rate NUMERIC(5, 2),
  qc_critical_errors INTEGER,
  qc_total_tasks INTEGER,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(recorded_date, scope, scope_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_metrics_history_date ON metrics_history(recorded_date);
CREATE INDEX IF NOT EXISTS idx_metrics_history_scope ON metrics_history(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_metrics_history_date_scope ON metrics_history(recorded_date DESC, scope);

-- Enable Row Level Security
ALTER TABLE metrics_history ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access (adjust as needed for your auth setup)
CREATE POLICY "Allow public read access on metrics_history"
  ON metrics_history
  FOR SELECT
  TO public
  USING (true);

-- Create policy for authenticated insert/update
CREATE POLICY "Allow authenticated insert on metrics_history"
  ON metrics_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update on metrics_history"
  ON metrics_history
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
