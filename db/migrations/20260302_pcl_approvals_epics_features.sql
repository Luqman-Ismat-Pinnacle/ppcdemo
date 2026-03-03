-- Migration: PCL intervention approval flow + epics/features hierarchy
-- Safe to re-run (IF NOT EXISTS / IF NOT EXISTS throughout)

-- ============================================================================
-- 1. INTERVENTION_ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS intervention_items (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id),
  project_name    TEXT,
  source          TEXT DEFAULT 'pcl_exception',
  severity        TEXT DEFAULT 'warning',
  priority        TEXT DEFAULT 'P3',
  reason          TEXT,
  recommended_action TEXT,
  pcl_notes       TEXT,
  coo_notes       TEXT,
  status          TEXT DEFAULT 'pcl_review',
  variance_pct    NUMERIC(8,2) DEFAULT 0,
  actual_cost     NUMERIC(14,2) DEFAULT 0,
  scheduled_cost  NUMERIC(14,2) DEFAULT 0,
  actual_hours    NUMERIC(12,2) DEFAULT 0,
  total_hours     NUMERIC(12,2) DEFAULT 0,
  percent_complete NUMERIC(5,2) DEFAULT 0,
  escalated_by    TEXT,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interv_project ON intervention_items(project_id);
CREATE INDEX IF NOT EXISTS idx_interv_status ON intervention_items(status);

-- ============================================================================
-- 2. EPICS
-- ============================================================================
CREATE TABLE IF NOT EXISTS epics (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phase_id    TEXT REFERENCES phases(id),
  project_id  TEXT REFERENCES projects(id),
  description TEXT,
  status      TEXT DEFAULT 'active',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_epic_phase ON epics(phase_id);
CREATE INDEX IF NOT EXISTS idx_epic_project ON epics(project_id);

-- ============================================================================
-- 3. FEATURES
-- ============================================================================
CREATE TABLE IF NOT EXISTS features (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  epic_id     TEXT REFERENCES epics(id) ON DELETE CASCADE,
  project_id  TEXT REFERENCES projects(id),
  description TEXT,
  status      TEXT DEFAULT 'active',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feature_epic ON features(epic_id);
CREATE INDEX IF NOT EXISTS idx_feature_project ON features(project_id);

-- ============================================================================
-- 4. ALTER tasks to add epic_id / feature_id
-- ============================================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS epic_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS feature_id TEXT;
CREATE INDEX IF NOT EXISTS idx_task_epic ON tasks(epic_id);
CREATE INDEX IF NOT EXISTS idx_task_feature ON tasks(feature_id);

-- ============================================================================
-- 5. Triggers for new tables
-- ============================================================================
DROP TRIGGER IF EXISTS trg_intervention_items_updated ON intervention_items;
CREATE TRIGGER trg_intervention_items_updated
  BEFORE UPDATE ON intervention_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_epics_updated ON epics;
CREATE TRIGGER trg_epics_updated
  BEFORE UPDATE ON epics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_features_updated ON features;
CREATE TRIGGER trg_features_updated
  BEFORE UPDATE ON features
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
