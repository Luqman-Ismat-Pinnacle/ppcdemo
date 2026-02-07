-- ============================================================================
-- PINNACLE PROJECT CONTROLS - COMPREHENSIVE RESOURCING MOCK DATA
-- Generates hours data across 16 WEEKS for realistic resource heatmaps
-- Run this in Supabase SQL Editor (click "Run", not "Explain")
-- ============================================================================

DO $$
DECLARE
    emp_record RECORD;
    task_record RECORD;
    week_date DATE;
    hours_worked DECIMAL;
    entry_counter INTEGER;
    week_num INTEGER;
    day_num INTEGER;
    charge_code TEXT;
    base_date DATE := '2025-12-01'::DATE; -- Start from Dec 2025
BEGIN
    -- Get current max entry ID
    SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 5) AS INTEGER)), 0) INTO entry_counter FROM hour_entries;
    entry_counter := entry_counter + 1;
    
    RAISE NOTICE 'Starting entry counter at: %', entry_counter;
    
    -- Loop through 16 weeks (4 months of data)
    FOR week_num IN 0..15 LOOP
        week_date := base_date + (week_num * 7);
        
        RAISE NOTICE 'Processing week % starting %', week_num + 1, week_date;
        
        -- For each active employee
        FOR emp_record IN 
            SELECT id, name, job_title 
            FROM employees 
            WHERE is_active = true
            LIMIT 20 -- Top 20 employees
        LOOP
            -- Get a task for this employee (either assigned or random)
            SELECT t.id AS task_id, t.project_id, t.phase_id
            INTO task_record
            FROM tasks t
            WHERE t.employee_id = emp_record.id
               OR t.id IN (SELECT task_id FROM hour_entries WHERE employee_id = emp_record.id LIMIT 1)
            LIMIT 1;
            
            -- If no task found, get a random one
            IF task_record IS NULL THEN
                SELECT t.id AS task_id, t.project_id, t.phase_id
                INTO task_record
                FROM tasks t
                ORDER BY random()
                LIMIT 1;
            END IF;
            
            -- Skip if still no task
            IF task_record IS NULL THEN
                CONTINUE;
            END IF;
            
            -- Determine weekly hours based on role (varied utilization)
            IF emp_record.job_title ILIKE '%Partner%' OR emp_record.job_title ILIKE '%Director%' THEN
                hours_worked := 20 + (random() * 15); -- 20-35 hours (lower utilization)
            ELSIF emp_record.job_title ILIKE '%Senior%' OR emp_record.job_title ILIKE '%Lead%' OR emp_record.job_title ILIKE '%Manager%' THEN
                hours_worked := 35 + (random() * 10); -- 35-45 hours (high utilization)
            ELSIF emp_record.job_title ILIKE '%Engineer%' OR emp_record.job_title ILIKE '%Specialist%' THEN
                hours_worked := 30 + (random() * 14); -- 30-44 hours
            ELSE
                hours_worked := 25 + (random() * 15); -- 25-40 hours
            END IF;
            
            -- Add some randomness - some weeks skip (vacation, etc.)
            IF random() < 0.08 THEN -- 8% chance of no hours this week
                CONTINUE;
            END IF;
            
            -- Determine charge code
            IF random() < 0.15 THEN
                charge_code := 'QC';
            ELSIF random() < 0.05 THEN
                charge_code := 'ADMIN';
            ELSE
                charge_code := 'EX';
            END IF;
            
            -- Distribute hours across weekdays (Mon-Fri)
            FOR day_num IN 1..5 LOOP -- Monday to Friday
                -- Skip some days randomly
                IF random() < 0.1 THEN
                    CONTINUE;
                END IF;
                
                entry_counter := entry_counter + 1;
                
                BEGIN
                    INSERT INTO hour_entries (
                        id, entry_id, employee_id, task_id, project_id, phase_id, 
                        date, hours, charge_code, description, is_billable, is_approved
                    ) VALUES (
                        'HRS-' || LPAD(entry_counter::TEXT, 4, '0'),
                        'HRS-' || LPAD(entry_counter::TEXT, 4, '0'),
                        emp_record.id,
                        task_record.task_id,
                        task_record.project_id,
                        task_record.phase_id,
                        week_date + day_num, -- Day of week
                        ROUND((hours_worked / 5 + (random() * 2 - 1))::NUMERIC, 1), -- ~daily hours with variance
                        charge_code,
                        'Week ' || (week_num + 1) || ' day ' || day_num || ' work',
                        charge_code != 'ADMIN',
                        true
                    );
                EXCEPTION WHEN unique_violation THEN
                    -- Skip duplicates
                    NULL;
                END;
            END LOOP;
            
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Completed! Final entry counter: %', entry_counter;
END $$;

-- ============================================================================
-- SUMMARY REPORT
-- ============================================================================

-- Show weeks of data
SELECT 
    TO_CHAR(DATE_TRUNC('week', date::DATE), 'YYYY-MM-DD') as week_start,
    COUNT(*) as entries,
    COUNT(DISTINCT employee_id) as employees,
    ROUND(SUM(hours)::NUMERIC, 1) as total_hours
FROM hour_entries
GROUP BY DATE_TRUNC('week', date::DATE)
ORDER BY week_start;

-- Show employee hours summary
SELECT 
    e.name as employee,
    e.job_title as role,
    COUNT(h.id) as entry_count,
    COUNT(DISTINCT DATE_TRUNC('week', h.date::DATE)) as weeks_worked,
    ROUND(SUM(h.hours)::NUMERIC, 1) as total_hours,
    ROUND(AVG(h.hours)::NUMERIC, 1) as avg_daily_hours
FROM employees e
LEFT JOIN hour_entries h ON e.id = h.employee_id
WHERE e.is_active = true
GROUP BY e.id, e.name, e.job_title
ORDER BY total_hours DESC NULLS LAST
LIMIT 25;
