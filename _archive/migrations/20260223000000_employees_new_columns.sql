-- Add new employee columns (Workday: Sr_Project_Manager, Time_in_Job_Profile, customerOnEmpProfile, siteOnEmpProfile, projectNumberOnEmpProfile)
-- Run on both Supabase and Azure employees table.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS senior_manager TEXT,
  ADD COLUMN IF NOT EXISTS time_in_job_profile TEXT,
  ADD COLUMN IF NOT EXISTS employee_customer TEXT,
  ADD COLUMN IF NOT EXISTS employee_site TEXT,
  ADD COLUMN IF NOT EXISTS employee_projects TEXT;

COMMENT ON COLUMN employees.senior_manager IS 'Workday: Sr_Project_Manager';
COMMENT ON COLUMN employees.time_in_job_profile IS 'Workday: Time_in_Job_Profile';
COMMENT ON COLUMN employees.employee_customer IS 'Workday: customerOnEmpProfile';
COMMENT ON COLUMN employees.employee_site IS 'Workday: siteOnEmpProfile';
COMMENT ON COLUMN employees.employee_projects IS 'Workday: projectNumberOnEmpProfile (multiple values, comma-separated)';
