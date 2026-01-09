-- ============================================================================
-- SQL Script: Update Portfolio Names to "Manager's Portfolio" Format
-- ============================================================================
-- Run this in the Supabase SQL Editor to update all portfolio names
-- based on the manager field.

-- Option 1: Update existing portfolios to use "Manager's Portfolio" naming
UPDATE portfolios
SET name = manager || '''s Portfolio'
WHERE manager IS NOT NULL AND manager != '';

-- Option 2: If you want to update only portfolios that have a generic name
-- UPDATE portfolios
-- SET name = manager || '''s Portfolio'
-- WHERE manager IS NOT NULL 
--   AND manager != ''
--   AND (name IS NULL OR name = '' OR name LIKE 'Portfolio%');

-- Verify the update
SELECT id, name, manager, created_at
FROM portfolios
ORDER BY name;

-- ============================================================================
-- Alternative: Create a trigger to auto-name portfolios on insert/update
-- ============================================================================

-- Create a trigger function that auto-sets the name
CREATE OR REPLACE FUNCTION set_portfolio_name()
RETURNS TRIGGER AS $$
BEGIN
    -- If name is not provided but manager is, auto-generate the name
    IF (NEW.name IS NULL OR NEW.name = '') AND NEW.manager IS NOT NULL AND NEW.manager != '' THEN
        NEW.name := NEW.manager || '''s Portfolio';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger (drop first if exists)
DROP TRIGGER IF EXISTS trigger_set_portfolio_name ON portfolios;
CREATE TRIGGER trigger_set_portfolio_name
    BEFORE INSERT OR UPDATE ON portfolios
    FOR EACH ROW
    EXECUTE FUNCTION set_portfolio_name();

-- ============================================================================
-- Test the trigger with a new insert
-- ============================================================================
-- INSERT INTO portfolios (manager) VALUES ('John Smith');
-- This should automatically create a portfolio named "John Smith's Portfolio"

