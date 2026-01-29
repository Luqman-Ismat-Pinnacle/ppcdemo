-- Check how many projects have site_id populated
DO $$
DECLARE 
    count_total integer;
    count_linked integer;
    sample_project record;
BEGIN
    SELECT count(*) INTO count_total FROM projects;
    SELECT count(*) INTO count_linked FROM projects WHERE site_id IS NOT NULL;
    RAISE NOTICE 'Total Projects: %, Projects with Site ID: %', count_total, count_linked;
    
    -- Show a sample if any exist
    SELECT * INTO sample_project FROM projects WHERE site_id IS NOT NULL LIMIT 1;
    IF FOUND THEN
        RAISE NOTICE 'Sample Project: % (Site: %, Cust: %, Port: %)', sample_project.id, sample_project.site_id, sample_project.customer_id, sample_project.portfolio_id;
    END IF;
END $$;
