-- ============================================================================
-- PINNACLE PROJECT CONTROLS - ADDITIONAL HOUR ENTRIES
-- Adds diverse timecard data across MULTIPLE WEEKS for labor breakdown charts
-- Run this in Supabase SQL Editor (click "Run", not "Explain")
-- ============================================================================

DO $$
DECLARE
    emp_id TEXT;
    entry_counter INTEGER;
    week_offset INTEGER;
    day_num INTEGER;
    base_date DATE := '2025-12-02'::DATE;
    work_date DATE;
    daily_hours DECIMAL;
BEGIN
    -- Get starting counter
    SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 5) AS INTEGER)), 200) INTO entry_counter FROM hour_entries;
    entry_counter := GREATEST(entry_counter + 1, 500);
    
    RAISE NOTICE 'Starting from entry counter: %', entry_counter;
    
    -- ========================================================================
    -- WEEK 1: December 2-6, 2025
    -- ========================================================================
    week_offset := 0;
    work_date := base_date + (week_offset * 7);
    
    -- Alex Johnson (Project Manager)
    SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1;
    IF emp_id IS NOT NULL THEN
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0001', 'PRJ-0001', 'PHS-0001', work_date, 8, 'EX', 'Project kickoff', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0001', 'PRJ-0001', 'PHS-0001', work_date + 1, 7, 'EX', 'Planning session', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0001', 'PRJ-0001', 'PHS-0001', work_date + 2, 8, 'EX', 'Stakeholder meetings', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0001', 'PRJ-0001', 'PHS-0001', work_date + 3, 6, 'EX', 'Documentation', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0001', 'PRJ-0001', 'PHS-0001', work_date + 4, 8, 'EX', 'Week review', true, true) ON CONFLICT DO NOTHING;
    END IF;
    
    -- Clark Thannisch (Technical Lead)
    SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1;
    IF emp_id IS NOT NULL THEN
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0002', 'PRJ-0001', 'PHS-0001', work_date, 9, 'EX', 'Technical review', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0002', 'PRJ-0001', 'PHS-0001', work_date + 1, 8, 'EX', 'Architecture design', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0002', 'PRJ-0001', 'PHS-0001', work_date + 2, 7, 'EX', 'Code review', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0002', 'PRJ-0001', 'PHS-0001', work_date + 3, 8, 'EX', 'Technical docs', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0002', 'PRJ-0001', 'PHS-0001', work_date + 4, 6, 'EX', 'Sprint planning', true, true) ON CONFLICT DO NOTHING;
    END IF;
    
    -- Jordan Lee (QA/QC Auditor)
    SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1;
    IF emp_id IS NOT NULL THEN
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0003', 'PRJ-0001', 'PHS-0001', work_date + 1, 6, 'QC', 'QC audit', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0003', 'PRJ-0001', 'PHS-0001', work_date + 3, 5, 'QC', 'Review findings', true, true) ON CONFLICT DO NOTHING;
    END IF;
    
    -- Taylor Nguyen (Data Engineer)
    SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1;
    IF emp_id IS NOT NULL THEN
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0004', 'PRJ-0001', 'PHS-0002', work_date, 8, 'EX', 'Data pipeline', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0004', 'PRJ-0001', 'PHS-0002', work_date + 1, 8, 'EX', 'ETL development', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0004', 'PRJ-0001', 'PHS-0002', work_date + 2, 7, 'EX', 'Data validation', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0004', 'PRJ-0001', 'PHS-0002', work_date + 3, 8, 'EX', 'Pipeline testing', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0004', 'PRJ-0001', 'PHS-0002', work_date + 4, 6, 'EX', 'Documentation', true, true) ON CONFLICT DO NOTHING;
    END IF;
    
    -- ========================================================================
    -- WEEK 2: December 9-13, 2025
    -- ========================================================================
    week_offset := 1;
    work_date := base_date + (week_offset * 7);
    
    -- Alex Johnson
    SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1;
    IF emp_id IS NOT NULL THEN
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0001', 'PRJ-0001', 'PHS-0001', work_date, 7, 'EX', 'Status review', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0001', 'PRJ-0001', 'PHS-0001', work_date + 1, 8, 'EX', 'Client meeting', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0005', 'PRJ-0001', 'PHS-0002', work_date + 2, 6, 'EX', 'Phase 2 planning', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0005', 'PRJ-0001', 'PHS-0002', work_date + 3, 8, 'EX', 'Resource allocation', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0005', 'PRJ-0001', 'PHS-0002', work_date + 4, 7, 'EX', 'Week 2 wrap-up', true, true) ON CONFLICT DO NOTHING;
    END IF;
    
    -- Priya Singh (Corrosion Engineer)
    SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Priya Singh%' LIMIT 1;
    IF emp_id IS NOT NULL THEN
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0010', 'PRJ-0001', 'PHS-0003', work_date, 8, 'EX', 'Corrosion analysis', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0010', 'PRJ-0001', 'PHS-0003', work_date + 1, 8, 'EX', 'Model development', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0010', 'PRJ-0001', 'PHS-0003', work_date + 2, 7, 'EX', 'Data collection', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0010', 'PRJ-0001', 'PHS-0003', work_date + 3, 8, 'EX', 'Report writing', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0010', 'PRJ-0001', 'PHS-0003', work_date + 4, 6, 'EX', 'Review session', true, true) ON CONFLICT DO NOTHING;
    END IF;
    
    -- Chris Morales (CAD/Drafter)
    SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Chris Morales%' LIMIT 1;
    IF emp_id IS NOT NULL THEN
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0006', 'PRJ-0001', 'PHS-0002', work_date, 8, 'EX', 'P&ID drafting', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0006', 'PRJ-0001', 'PHS-0002', work_date + 1, 8, 'EX', 'Circuit updates', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0006', 'PRJ-0001', 'PHS-0002', work_date + 2, 7, 'EX', 'Revisions', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0006', 'PRJ-0001', 'PHS-0002', work_date + 3, 8, 'EX', 'Final drawings', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0006', 'PRJ-0001', 'PHS-0002', work_date + 4, 6, 'EX', 'Documentation', true, true) ON CONFLICT DO NOTHING;
    END IF;
    
    -- ========================================================================
    -- WEEK 3: December 16-20, 2025
    -- ========================================================================
    week_offset := 2;
    work_date := base_date + (week_offset * 7);
    
    -- Alex Johnson on PRJ-0002
    SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1;
    IF emp_id IS NOT NULL THEN
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0016', 'PRJ-0002', 'PHS-0005', work_date, 6, 'EX', 'PRJ-2 kickoff', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0016', 'PRJ-0002', 'PHS-0005', work_date + 1, 7, 'EX', 'Planning', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0016', 'PRJ-0002', 'PHS-0005', work_date + 2, 8, 'EX', 'Resource planning', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0016', 'PRJ-0002', 'PHS-0005', work_date + 3, 6, 'EX', 'Documentation', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0016', 'PRJ-0002', 'PHS-0005', work_date + 4, 5, 'EX', 'Week wrap-up', true, true) ON CONFLICT DO NOTHING;
    END IF;
    
    -- Clark Thannisch week 3
    SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1;
    IF emp_id IS NOT NULL THEN
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0009', 'PRJ-0001', 'PHS-0003', work_date, 8, 'EX', 'DMR development', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0009', 'PRJ-0001', 'PHS-0003', work_date + 1, 7, 'EX', 'Model testing', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0009', 'PRJ-0001', 'PHS-0003', work_date + 2, 8, 'EX', 'Refinement', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0009', 'PRJ-0001', 'PHS-0003', work_date + 3, 7, 'EX', 'Documentation', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0009', 'PRJ-0001', 'PHS-0003', work_date + 4, 6, 'EX', 'Review', true, true) ON CONFLICT DO NOTHING;
    END IF;
    
    -- ========================================================================
    -- WEEK 4: December 23-27, 2025 (Holiday week - lower hours)
    -- ========================================================================
    week_offset := 3;
    work_date := base_date + (week_offset * 7);
    
    -- Taylor Nguyen
    SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1;
    IF emp_id IS NOT NULL THEN
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0018', 'PRJ-0002', 'PHS-0006', work_date, 6, 'EX', 'Data prep', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0018', 'PRJ-0002', 'PHS-0006', work_date + 1, 5, 'EX', 'Pipeline work', true, true) ON CONFLICT DO NOTHING;
    END IF;
    
    -- ========================================================================
    -- WEEK 5: December 30, 2025 - January 3, 2026
    -- ========================================================================
    week_offset := 4;
    work_date := base_date + (week_offset * 7);
    
    SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1;
    IF emp_id IS NOT NULL THEN
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0025', 'PRJ-0003', 'PHS-0009', work_date + 2, 7, 'EX', 'PRJ-3 start', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0025', 'PRJ-0003', 'PHS-0009', work_date + 3, 8, 'EX', 'Governance docs', true, true) ON CONFLICT DO NOTHING;
        
        entry_counter := entry_counter + 1;
        INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
        VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0025', 'PRJ-0003', 'PHS-0009', work_date + 4, 6, 'EX', 'Planning', true, true) ON CONFLICT DO NOTHING;
    END IF;
    
    -- ========================================================================
    -- WEEKS 6-14: January-February 2026 (Loop)
    -- ========================================================================
    FOR week_offset IN 5..13 LOOP
        work_date := base_date + (week_offset * 7);
        
        -- Clark Thannisch
        SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1;
        IF emp_id IS NOT NULL THEN
            FOR day_num IN 0..4 LOOP
                daily_hours := 7 + floor(random()*3);
                entry_counter := entry_counter + 1;
                INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
                VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0009', 'PRJ-0001', 'PHS-0003', work_date + day_num, daily_hours, 'EX', 'DMR work week ' || (week_offset + 1), true, true) ON CONFLICT DO NOTHING;
            END LOOP;
        END IF;
        
        -- Priya Singh
        SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Priya Singh%' LIMIT 1;
        IF emp_id IS NOT NULL THEN
            FOR day_num IN 0..4 LOOP
                daily_hours := 6 + floor(random()*4);
                entry_counter := entry_counter + 1;
                INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
                VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0022', 'PRJ-0002', 'PHS-0007', work_date + day_num, daily_hours, 'EX', 'COF/POF week ' || (week_offset + 1), true, true) ON CONFLICT DO NOTHING;
            END LOOP;
        END IF;
        
        -- Jordan Lee (QC)
        SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1;
        IF emp_id IS NOT NULL THEN
            entry_counter := entry_counter + 1;
            INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
            VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0003', 'PRJ-0001', 'PHS-0001', work_date + 1, 5, 'QC', 'QC review week ' || (week_offset + 1), true, true) ON CONFLICT DO NOTHING;
            
            entry_counter := entry_counter + 1;
            INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
            VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0003', 'PRJ-0001', 'PHS-0001', work_date + 3, 6, 'QC', 'Audit work week ' || (week_offset + 1), true, true) ON CONFLICT DO NOTHING;
        END IF;
        
        -- Ethan Brooks (Data Scientist)
        SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Ethan Brooks%' LIMIT 1;
        IF emp_id IS NOT NULL THEN
            FOR day_num IN 0..4 LOOP
                daily_hours := 7 + floor(random()*3);
                entry_counter := entry_counter + 1;
                INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
                VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0011', 'PRJ-0001', 'PHS-0003', work_date + day_num, daily_hours, 'EX', 'Analysis week ' || (week_offset + 1), true, true) ON CONFLICT DO NOTHING;
            END LOOP;
        END IF;
        
        -- Taylor Nguyen
        SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1;
        IF emp_id IS NOT NULL THEN
            FOR day_num IN 0..4 LOOP
                daily_hours := 7 + floor(random()*2);
                entry_counter := entry_counter + 1;
                INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
                VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0018', 'PRJ-0002', 'PHS-0006', work_date + day_num, daily_hours, 'EX', 'ETL week ' || (week_offset + 1), true, true) ON CONFLICT DO NOTHING;
            END LOOP;
        END IF;
        
        -- Alex Johnson
        SELECT id INTO emp_id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1;
        IF emp_id IS NOT NULL THEN
            FOR day_num IN 0..4 LOOP
                daily_hours := 6 + floor(random()*3);
                entry_counter := entry_counter + 1;
                INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved)
                VALUES ('HRS-' || LPAD(entry_counter::TEXT, 4, '0'), 'HRS-' || LPAD(entry_counter::TEXT, 4, '0'), emp_id, 'TSK-0025', 'PRJ-0003', 'PHS-0009', work_date + day_num, daily_hours, 'EX', 'PM work week ' || (week_offset + 1), true, true) ON CONFLICT DO NOTHING;
            END LOOP;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Completed! Total entries: %', entry_counter;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Show weeks with data
SELECT 
    TO_CHAR(DATE_TRUNC('week', date::DATE), 'Mon DD, YYYY') as week_of,
    COUNT(*) as entries,
    COUNT(DISTINCT employee_id) as employees,
    ROUND(SUM(hours)::NUMERIC, 0) as total_hours
FROM hour_entries
GROUP BY DATE_TRUNC('week', date::DATE)
ORDER BY DATE_TRUNC('week', date::DATE);
