-- ============================================================================
-- Supabase Complete Sample Data Load Script
-- Based on real project structure with Units layer
-- Run in Supabase SQL Editor (click "Run", not "Explain")
-- ============================================================================

-- ============================================================================
-- STEP 1: Clear existing data (EXCEPT employees)
-- Must delete in reverse order of foreign key dependencies
-- ============================================================================
DELETE FROM hour_entries WHERE true;
DELETE FROM qc_tasks WHERE true;
DELETE FROM deliverables WHERE true;
DELETE FROM milestones WHERE true;
DELETE FROM project_health WHERE true;
DELETE FROM tasks WHERE true;
DELETE FROM phases WHERE true;
DELETE FROM projects WHERE true;
DELETE FROM units WHERE true;
DELETE FROM sites WHERE true;
DELETE FROM customers WHERE true;
DELETE FROM portfolios WHERE true;
DELETE FROM charge_codes WHERE true;

-- ============================================================================
-- STEP 2: Insert Charge Codes
-- ============================================================================
INSERT INTO charge_codes (id, code_id, code, name, category, is_active) VALUES
('CHG-0001', 'CHG-0001', 'EX', 'Execute - Billable Work', 'Billable', true),
('CHG-0002', 'CHG-0002', 'QC', 'Quality Control', 'Billable', true),
('CHG-0003', 'CHG-0003', 'CR', 'Correction/Rework', 'Billable', true),
('CHG-0004', 'CHG-0004', 'SC', 'Scope Creep', 'Billable', true),
('CHG-0005', 'CHG-0005', 'WY', 'Warranty', 'Non-Billable', true),
('CHG-0006', 'CHG-0006', 'ADMIN', 'Administrative', 'Admin', true),
('CHG-0007', 'CHG-0007', 'TRAVEL', 'Travel Time', 'Billable', true),
('CHG-0008', 'CHG-0008', 'PTO', 'Paid Time Off', 'PTO', true),
('CHG-0009', 'CHG-0009', 'TRAINING', 'Training & Development', 'Non-Billable', true),
('CHG-0010', 'CHG-0010', 'INTERNAL', 'Internal Projects', 'Internal', true);

-- ============================================================================
-- STEP 3: Insert Portfolios (using Owner's Portfolio naming)
-- ============================================================================
INSERT INTO portfolios (id, portfolio_id, name, employee_id, manager, methodology, baseline_start_date, baseline_end_date, actual_start_date, percent_complete, baseline_hours, actual_hours, baseline_cost, actual_cost, comments, is_active) VALUES
('PRF-0001', 'PRF-0001', 'Brandon Beeghly''s Portfolio', (SELECT id FROM employees WHERE name ILIKE '%Brandon%' LIMIT 1), 'Brandon Beeghly', 'RBI', '2025-12-08', '2026-05-15', '2025-12-08', 35, 2724, 953, 297850, 104247, 'RBI focused portfolio - Methanex and AdvanSix projects', true),
('PRF-0002', 'PRF-0002', 'Steven Quillen''s Portfolio', (SELECT id FROM employees WHERE name ILIKE '%Steven%' LIMIT 1), 'Steven Quillen', 'QRO', '2026-01-05', '2026-07-30', '2026-01-05', 20, 7404, 1480, 824250, 164850, 'QRO focused portfolio - Chevron Phillips Chemical projects', true),
('PRF-0003', 'PRF-0003', 'Samantha Law''s Portfolio', (SELECT id FROM employees WHERE name ILIKE '%Samantha%' LIMIT 1), 'Samantha Law', 'QRO', '2025-12-20', '2026-06-15', '2025-12-20', 28, 3042, 851, 331540, 92831, 'Mixed QRO and RBI portfolio - TSAR and Big West Oil', true);

-- ============================================================================
-- STEP 4: Insert Customers
-- ============================================================================
INSERT INTO customers (id, customer_id, name, portfolio_id, employee_id, baseline_start_date, baseline_end_date, actual_start_date, percent_complete, baseline_hours, actual_hours, baseline_cost, actual_cost, is_active) VALUES
('CST-0001', 'CST-0001', 'Methanex', 'PRF-0001', NULL, '2025-12-08', '2026-05-09', '2025-12-08', 40, 2030, 812, 221030, 88412, true),
('CST-0002', 'CST-0002', 'AdvanSix', 'PRF-0001', NULL, '2025-12-15', '2026-02-07', '2025-12-15', 65, 694, 451, 76820, 49935, true),
('CST-0003', 'CST-0003', 'Chevron Phillips Chemical', 'PRF-0002', NULL, '2026-01-05', '2026-07-30', '2026-01-05', 18, 7404, 1333, 824250, 148365, true),
('CST-0004', 'CST-0004', 'The San Antonio Refinery, LLC', 'PRF-0003', NULL, '2025-12-20', '2026-06-02', '2025-12-20', 25, 2468, 617, 269480, 67370, true),
('CST-0005', 'CST-0005', 'Big West Oil', 'PRF-0003', NULL, '2026-01-15', '2026-03-15', '2026-01-15', 45, 574, 258, 62060, 27927, true);

-- ============================================================================
-- STEP 5: Insert Sites
-- ============================================================================
INSERT INTO sites (id, site_id, name, customer_id, employee_id, location, baseline_start_date, baseline_end_date, actual_start_date, percent_complete, baseline_hours, actual_hours, baseline_cost, actual_cost, is_active) VALUES
('STE-0001', 'STE-0001', 'Geismar', 'CST-0001', NULL, 'Geismar, LA', '2025-12-08', '2026-05-09', '2025-12-08', 40, 2030, 812, 221030, 88412, true),
('STE-0002', 'STE-0002', 'Frankford', 'CST-0002', NULL, 'Frankford, PA', '2025-12-15', '2026-02-07', '2025-12-15', 65, 694, 451, 76820, 49935, true),
('STE-0003', 'STE-0003', 'Orange', 'CST-0003', NULL, 'Orange, TX', '2026-01-05', '2026-07-30', '2026-01-05', 15, 5658, 848, 623810, 93571, true),
('STE-0004', 'STE-0004', 'Port Arthur', 'CST-0003', NULL, 'Port Arthur, TX', '2026-02-01', '2026-05-15', '2026-02-01', 22, 1746, 384, 200440, 44097, true),
('STE-0005', 'STE-0005', 'San Antonio', 'CST-0004', NULL, 'San Antonio, TX', '2025-12-20', '2026-06-02', '2025-12-20', 25, 2468, 617, 269480, 67370, true),
('STE-0006', 'STE-0006', 'Salt Lake City', 'CST-0005', NULL, 'Salt Lake City, UT', '2026-01-15', '2026-03-15', '2026-01-15', 45, 574, 258, 62060, 27927, true);

-- ============================================================================
-- STEP 6: Insert Units (hierarchy layer between Site and Project)
-- ============================================================================
INSERT INTO units (id, unit_id, name, site_id, employee_id, description, baseline_start_date, baseline_end_date, actual_start_date, percent_complete, baseline_hours, actual_hours, baseline_cost, actual_cost, is_active) VALUES
('UNT-0001', 'UNT-0001', 'Unit 1 - Methanol Production', 'STE-0001', NULL, 'Primary methanol production unit', '2025-12-08', '2026-03-15', '2025-12-08', 45, 1015, 457, 110515, 49730, true),
('UNT-0002', 'UNT-0002', 'Unit 2 - Ammonia Processing', 'STE-0001', NULL, 'Ammonia processing and storage', '2026-01-15', '2026-05-09', '2026-01-15', 35, 1015, 355, 110515, 38680, true),
('UNT-0003', 'UNT-0003', 'Caprolactam Unit', 'STE-0002', NULL, 'Caprolactam manufacturing unit', '2025-12-15', '2026-02-07', '2025-12-15', 65, 694, 451, 76820, 49935, true),
('UNT-0004', 'UNT-0004', 'Polyethylene Unit A', 'STE-0003', NULL, 'High-density polyethylene production', '2026-01-05', '2026-05-15', '2026-01-05', 18, 2829, 509, 311905, 56143, true),
('UNT-0005', 'UNT-0005', 'Polyethylene Unit B', 'STE-0003', NULL, 'Low-density polyethylene production', '2026-03-01', '2026-07-30', '2026-03-01', 12, 2829, 339, 311905, 37428, true),
('UNT-0006', 'UNT-0006', 'Fixed Equipment 1544', 'STE-0004', NULL, 'FE QRO target unit 1544', '2026-02-01', '2026-05-15', '2026-02-01', 22, 1746, 384, 200440, 44097, true),
('UNT-0007', 'UNT-0007', 'Crude Unit', 'STE-0005', NULL, 'Crude distillation unit', '2025-12-20', '2026-04-15', '2025-12-20', 30, 1234, 370, 134740, 40422, true),
('UNT-0008', 'UNT-0008', 'FCC Unit', 'STE-0005', NULL, 'Fluid catalytic cracking unit', '2026-02-01', '2026-06-02', '2026-02-01', 20, 1234, 247, 134740, 26948, true),
('UNT-0009', 'UNT-0009', 'Refinery Complex', 'STE-0006', NULL, 'Main refinery processing complex', '2026-01-15', '2026-03-15', '2026-01-15', 45, 574, 258, 62060, 27927, true);

-- ============================================================================
-- STEP 7: Insert Projects
-- ============================================================================
INSERT INTO projects (id, project_id, name, customer_id, site_id, unit_id, employee_id, billable_type, methodology, manager, status, baseline_start_date, baseline_end_date, actual_start_date, percent_complete, baseline_hours, actual_hours, baseline_cost, actual_cost, is_active) VALUES
('PRJ-0001', 'PRJ-0001', 'Methanex - Geismar - 2 RBI Implementation', 'CST-0001', 'STE-0001', 'UNT-0001', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'T&M', 'Standard RBI', 'Alex Johnson', 'In Progress', '2025-12-08', '2026-05-09', '2025-12-08', 40, 2030, 812, 221030, 88412, true),
('PRJ-0002', 'PRJ-0002', 'AdvanSix Frankford', 'CST-0002', 'STE-0002', 'UNT-0003', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'T&M', 'Standard RBI', 'Alex Johnson', 'In Progress', '2025-12-15', '2026-02-07', '2025-12-15', 65, 694, 451, 76820, 49935, true),
('PRJ-0003', 'PRJ-0003', 'Golden Triangle Polymers - Full Site Implementation', 'CST-0003', 'STE-0003', 'UNT-0004', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'FP', 'QRO', 'Alex Johnson', 'In Progress', '2026-01-05', '2026-07-30', '2026-01-05', 15, 5658, 848, 623810, 93571, true),
('PRJ-0004', 'PRJ-0004', 'Chevron Phillips Chemical - Port Arthur - 25 - FE QRO for 1544', 'CST-0003', 'STE-0004', 'UNT-0006', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'FP', 'QRO', 'Alex Johnson', 'In Progress', '2026-02-01', '2026-05-15', '2026-02-01', 22, 1746, 384, 200440, 44097, true),
('PRJ-0005', 'PRJ-0005', 'TSAR - 24 - San Antonio - Reliability Optimization', 'CST-0004', 'STE-0005', 'UNT-0007', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'T&M', 'QRO', 'Alex Johnson', 'In Progress', '2025-12-20', '2026-06-02', '2025-12-20', 25, 2468, 617, 269480, 67370, true),
('PRJ-0006', 'PRJ-0006', 'Big West Oil - 24 - Salt Lake City - 2024 Evergreening', 'CST-0005', 'STE-0006', 'UNT-0009', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'T&M', 'Standard RBI', 'Alex Johnson', 'In Progress', '2026-01-15', '2026-03-15', '2026-01-15', 45, 574, 258, 62060, 27927, true);

-- ============================================================================
-- STEP 8: Insert Phases
-- ============================================================================
INSERT INTO phases (id, phase_id, name, project_id, employee_id, methodology, sequence, baseline_start_date, baseline_end_date, actual_start_date, percent_complete, baseline_hours, actual_hours, baseline_cost, actual_cost, is_active) VALUES
-- Methanex Geismar Phases
('PHS-0001', 'PHS-0001', 'Phase 0 - Governance & Project Docs', 'PRJ-0001', NULL, 'RBI', 0, '2025-12-08', '2025-12-15', '2025-12-08', 100, 122, 122, 14180, 14180, true),
('PHS-0002', 'PHS-0002', 'Phase 1 - Initiate & Data Collection', 'PRJ-0001', NULL, 'RBI', 1, '2025-12-16', '2026-02-24', '2025-12-16', 60, 886, 531, 84130, 50478, true),
('PHS-0003', 'PHS-0003', 'Phase 2 - IDMS, DMR & Analysis', 'PRJ-0001', NULL, 'RBI', 2, '2026-02-25', '2026-04-23', '2026-02-25', 25, 810, 202, 97100, 24275, true),
('PHS-0004', 'PHS-0004', 'Phase 3 - IDMS Update, Validation & Closeout', 'PRJ-0001', NULL, 'RBI', 3, '2026-04-24', '2026-05-09', NULL, 0, 212, 0, 25620, 0, true),
-- AdvanSix Frankford Phases
('PHS-0005', 'PHS-0005', 'Phase 0 - Governance', 'PRJ-0002', NULL, 'RBI', 0, '2025-12-15', '2025-12-19', '2025-12-15', 100, 80, 80, 9320, 9320, true),
('PHS-0006', 'PHS-0006', 'Phase 1 - Data & Field Work', 'PRJ-0002', NULL, 'RBI', 1, '2025-12-20', '2026-01-15', '2025-12-20', 80, 344, 275, 34360, 27488, true),
('PHS-0007', 'PHS-0007', 'Phase 2 - DMR & Analysis', 'PRJ-0002', NULL, 'RBI', 2, '2026-01-16', '2026-01-28', '2026-01-16', 50, 154, 77, 19580, 9790, true),
('PHS-0008', 'PHS-0008', 'Phase 3 - IDMS Update & Closeout', 'PRJ-0002', NULL, 'RBI', 3, '2026-01-29', '2026-02-07', '2026-01-29', 30, 94, 28, 10720, 3216, true),
-- Golden Triangle Polymers Phases
('PHS-0009', 'PHS-0009', 'Phase 0 - Governance & Playbooks', 'PRJ-0003', NULL, 'QRO', 0, '2026-01-05', '2026-01-14', '2026-01-05', 100, 178, 178, 20740, 20740, true),
('PHS-0010', 'PHS-0010', 'Phase 1 - Initiate & Data Discovery', 'PRJ-0003', NULL, 'QRO', 1, '2026-01-15', '2026-04-20', '2026-01-15', 25, 1280, 320, 131050, 32762, true),
('PHS-0011', 'PHS-0011', 'Phase 2 - ETL & Newton Model Build', 'PRJ-0003', NULL, 'QRO', 2, '2026-04-21', '2026-05-28', '2026-04-21', 10, 1296, 129, 137960, 13796, true),
('PHS-0012', 'PHS-0012', 'Phase 3 - UBDM, Validation & Prioritization', 'PRJ-0003', NULL, 'QRO', 3, '2026-05-29', '2026-06-15', NULL, 0, 760, 0, 91600, 0, true),
('PHS-0013', 'PHS-0013', 'Phase 4 - Strategy Development, Integration & Deployment', 'PRJ-0003', NULL, 'QRO', 4, '2026-06-16', '2026-07-30', NULL, 0, 2144, 0, 242460, 0, true),
-- Port Arthur Phases
('PHS-0014', 'PHS-0014', 'Phase 0 - Governance', 'PRJ-0004', NULL, 'QRO', 0, '2026-02-01', '2026-02-02', '2026-02-01', 100, 96, 96, 11540, 11540, true),
('PHS-0015', 'PHS-0015', 'Phase 1 - Initiate & Data', 'PRJ-0004', NULL, 'QRO', 1, '2026-02-03', '2026-02-22', '2026-02-03', 40, 268, 107, 27830, 11132, true),
('PHS-0016', 'PHS-0016', 'Phase 2 - ETL & Newton (FE)', 'PRJ-0004', NULL, 'QRO', 2, '2026-02-23', '2026-04-09', '2026-02-23', 15, 628, 94, 74580, 11187, true),
('PHS-0017', 'PHS-0017', 'Phase 3 - UBDM, Strategy & Closeout', 'PRJ-0004', NULL, 'QRO', 3, '2026-04-10', '2026-05-15', NULL, 5, 560, 28, 70700, 3535, true),
-- TSAR Phases
('PHS-0018', 'PHS-0018', 'Phase 0 - Governance', 'PRJ-0005', NULL, 'QRO', 0, '2025-12-20', '2025-12-25', '2025-12-20', 100, 96, 96, 11540, 11540, true),
('PHS-0019', 'PHS-0019', 'Phase 1 - Initiate & Data Discovery', 'PRJ-0005', NULL, 'QRO', 1, '2025-12-26', '2026-02-02', '2025-12-26', 45, 376, 169, 38900, 17505, true),
('PHS-0020', 'PHS-0020', 'Phase 2 - ETL & Newton', 'PRJ-0005', NULL, 'QRO', 2, '2026-02-03', '2026-04-03', '2026-02-03', 20, 780, 156, 87400, 17480, true),
('PHS-0021', 'PHS-0021', 'Phase 3 - UBDM & Strategy', 'PRJ-0005', NULL, 'QRO', 3, '2026-04-04', '2026-05-01', NULL, 10, 500, 50, 58200, 5820, true),
('PHS-0022', 'PHS-0022', 'Phase 4 - Integration & Pilot', 'PRJ-0005', NULL, 'QRO', 4, '2026-05-02', '2026-06-02', NULL, 5, 496, 24, 51340, 2567, true),
-- Big West Oil Phases
('PHS-0023', 'PHS-0023', 'Phase 0 - Governance', 'PRJ-0006', NULL, 'RBI', 0, '2026-01-15', '2026-01-19', '2026-01-15', 100, 60, 60, 7320, 7320, true),
('PHS-0024', 'PHS-0024', 'Phase 1 - Data & Field', 'PRJ-0006', NULL, 'RBI', 1, '2026-01-20', '2026-02-01', '2026-01-20', 70, 132, 92, 13620, 9534, true),
('PHS-0025', 'PHS-0025', 'Phase 2 - DMR & IDMS', 'PRJ-0006', NULL, 'RBI', 2, '2026-02-02', '2026-03-02', '2026-02-02', 35, 258, 90, 28020, 9807, true),
('PHS-0026', 'PHS-0026', 'Phase 3 - Closeout', 'PRJ-0006', NULL, 'RBI', 3, '2026-03-03', '2026-03-15', '2026-03-03', 20, 24, 5, 3400, 708, true);

-- ============================================================================
-- STEP 9: Insert Tasks with Employee Assignments
-- ============================================================================
INSERT INTO tasks (id, task_id, task_name, task_description, project_id, phase_id, customer_id, site_id, employee_id, assigned_resource_type, assigned_resource, wbs_code, status, baseline_start_date, baseline_end_date, actual_start_date, percent_complete, baseline_hours, actual_hours, baseline_cost, actual_cost, is_milestone, is_critical) VALUES
-- Phase 0 - Governance (Methanex)
('TSK-0001', 'TSK-0001', 'Project Governance & Documents', 'Create DRD, DRS process, Project QMP, SOPs, RBI Workflow Doc', 'PRJ-0001', 'PHS-0001', 'CST-0001', 'STE-0001', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'specific', 'Alex Johnson', '1.1.1', 'Completed', '2025-12-08', '2025-12-15', '2025-12-08', 100, 122, 122, 14180, 14180, false, false),
-- Phase 1 - Initiate & Data Collection (Methanex)
('TSK-0002', 'TSK-0002', 'Project Initiation & Kickoff', 'Kickoff meeting, confirm DRS', 'PRJ-0001', 'PHS-0002', 'CST-0001', 'STE-0001', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'specific', 'Alex Johnson', '1.2.1', 'Completed', '2025-12-16', '2025-12-17', '2025-12-16', 100, 20, 20, 3540, 3540, true, false),
('TSK-0003', 'TSK-0003', 'Project Setup & RACI / Baseline Schedule', 'Baseline schedule, RACI, Project controls', 'PRJ-0001', 'PHS-0002', 'CST-0001', 'STE-0001', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'specific', 'Alex Johnson', '1.2.2', 'Completed', '2025-12-18', '2025-12-21', '2025-12-18', 100, 46, 46, 6440, 6440, false, false),
('TSK-0004', 'TSK-0004', 'Data Collection (MAL, P&IDs, PFDs)', 'Raw document library, MAL draft', 'PRJ-0001', 'PHS-0002', 'CST-0001', 'STE-0001', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'specific', 'Taylor Nguyen', '1.2.3', 'In Progress', '2025-12-22', '2026-01-08', '2025-12-22', 80, 250, 200, 23700, 18960, false, true),
('TSK-0005', 'TSK-0005', 'MAL Validation & Gap Closure', 'Validated MAL, Gap closure register', 'PRJ-0001', 'PHS-0002', 'CST-0001', 'STE-0001', (SELECT id FROM employees WHERE name ILIKE '%Nicole Brown%' LIMIT 1), 'specific', 'Nicole Brown', '1.2.4', 'In Progress', '2026-01-09', '2026-01-17', '2026-01-09', 60, 110, 66, 10250, 6150, false, false),
('TSK-0006', 'TSK-0006', 'Circuitization & Systemization', 'Systemized PFDs, Master circuit list', 'PRJ-0001', 'PHS-0002', 'CST-0001', 'STE-0001', (SELECT id FROM employees WHERE name ILIKE '%Chris Morales%' LIMIT 1), 'specific', 'Chris Morales', '1.2.5', 'In Progress', '2026-01-18', '2026-02-06', '2026-01-18', 50, 240, 120, 22800, 11400, false, true),
('TSK-0007', 'TSK-0007', 'Field Verification & Redline P&IDs', 'Redlined P&IDs, Field verification pack', 'PRJ-0001', 'PHS-0002', 'CST-0001', 'STE-0001', (SELECT id FROM employees WHERE name ILIKE '%Riley Smith%' LIMIT 1), 'specific', 'Riley Smith', '1.2.6', 'In Progress', '2026-02-07', '2026-02-24', '2026-02-07', 40, 220, 88, 18000, 7200, false, false),
-- Phase 2 - IDMS, DMR & Analysis (Methanex)
('TSK-0008', 'TSK-0008', 'IDMS/PCMS Integration & Data Load', 'Data mapping doc, IDMS load', 'PRJ-0001', 'PHS-0003', 'CST-0001', 'STE-0001', (SELECT id FROM employees WHERE name ILIKE '%Jamie Carter%' LIMIT 1), 'specific', 'Jamie Carter', '1.3.1', 'In Progress', '2026-02-25', '2026-03-11', '2026-02-25', 30, 220, 66, 24200, 7260, false, true),
('TSK-0009', 'TSK-0009', 'DMR Workshops', 'CMDs, DMR minutes', 'PRJ-0001', 'PHS-0003', 'CST-0001', 'STE-0001', (SELECT id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1), 'specific', 'Clark Thannisch', '1.3.2', 'In Progress', '2026-03-12', '2026-03-21', '2026-03-12', 25, 120, 30, 15200, 3800, false, false),
('TSK-0010', 'TSK-0010', 'Corrosion Model & COF/POF Calculation', 'Unit corrosion model, COF/POF tables', 'PRJ-0001', 'PHS-0003', 'CST-0001', 'STE-0001', (SELECT id FROM employees WHERE name ILIKE '%Priya Singh%' LIMIT 1), 'specific', 'Priya Singh', '1.3.3', 'In Progress', '2026-03-22', '2026-04-05', '2026-03-22', 20, 210, 42, 26700, 5340, false, true),
('TSK-0011', 'TSK-0011', 'CML Optimization & Scatter Plots', 'CML scatter plots, recommendations', 'PRJ-0001', 'PHS-0003', 'CST-0001', 'STE-0001', (SELECT id FROM employees WHERE name ILIKE '%Ethan Brooks%' LIMIT 1), 'specific', 'Ethan Brooks', '1.3.4', 'Not Started', '2026-04-06', '2026-04-13', NULL, 0, 100, 0, 12700, 0, false, false),
('TSK-0012', 'TSK-0012', 'Develop RBI Asset Strategies', 'Inspection plans, Grading packets', 'PRJ-0001', 'PHS-0003', 'CST-0001', 'STE-0001', (SELECT id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1), 'specific', 'Clark Thannisch', '1.3.5', 'Not Started', '2026-04-14', '2026-04-23', NULL, 0, 160, 0, 18800, 0, false, false),
-- Phase 3 - Closeout (Methanex)
('TSK-0013', 'TSK-0013', 'Update IDMS & Inspection Schedules', 'IDMS updated schedules, Upload logs', 'PRJ-0001', 'PHS-0004', 'CST-0001', 'STE-0001', (SELECT id FROM employees WHERE name ILIKE '%Jamie Carter%' LIMIT 1), 'specific', 'Jamie Carter', '1.4.1', 'Not Started', '2026-04-24', '2026-05-03', NULL, 0, 140, 0, 15200, 0, false, false),
('TSK-0014', 'TSK-0014', 'Final Validation & Customer Review', 'Validation minutes, Customer signoff', 'PRJ-0001', 'PHS-0004', 'CST-0001', 'STE-0001', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'specific', 'Alex Johnson', '1.4.2', 'Not Started', '2026-05-04', '2026-05-06', NULL, 0, 40, 0, 5200, 0, true, false),
('TSK-0015', 'TSK-0015', 'Closeout & Final Report', 'Final RBI report, Lessons learned', 'PRJ-0001', 'PHS-0004', 'CST-0001', 'STE-0001', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'specific', 'Alex Johnson', '1.4.3', 'Not Started', '2026-05-07', '2026-05-09', NULL, 0, 32, 0, 4120, 0, true, false),
-- AdvanSix Frankford Tasks
('TSK-0016', 'TSK-0016', 'Project Governance & Documents', 'DRD, QMP, SOPs, Workflow doc', 'PRJ-0002', 'PHS-0005', 'CST-0002', 'STE-0002', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'specific', 'Alex Johnson', '2.1.1', 'Completed', '2025-12-15', '2025-12-19', '2025-12-15', 100, 80, 80, 9320, 9320, false, false),
('TSK-0017', 'TSK-0017', 'Kickoff', 'Kickoff minutes, DRS review', 'PRJ-0002', 'PHS-0006', 'CST-0002', 'STE-0002', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'specific', 'Alex Johnson', '2.2.1', 'Completed', '2025-12-20', '2025-12-21', '2025-12-20', 100, 16, 16, 3040, 3040, true, false),
('TSK-0018', 'TSK-0018', 'Data Collection (MAL, docs)', 'MAL draft, document index', 'PRJ-0002', 'PHS-0006', 'CST-0002', 'STE-0002', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'specific', 'Taylor Nguyen', '2.2.2', 'In Progress', '2025-12-22', '2025-12-31', '2025-12-22', 85, 140, 119, 13400, 11390, false, true),
('TSK-0019', 'TSK-0019', 'MAL Validation & Field', 'Validated MAL, Field notes', 'PRJ-0002', 'PHS-0006', 'CST-0002', 'STE-0002', (SELECT id FROM employees WHERE name ILIKE '%Riley Smith%' LIMIT 1), 'specific', 'Riley Smith', '2.2.3', 'In Progress', '2026-01-01', '2026-01-05', '2026-01-01', 75, 68, 51, 6520, 4890, false, false),
('TSK-0020', 'TSK-0020', 'Circuitization & P&ID work', 'Systemized PFDs, Electronic P&IDs', 'PRJ-0002', 'PHS-0006', 'CST-0002', 'STE-0002', (SELECT id FROM employees WHERE name ILIKE '%Chris Morales%' LIMIT 1), 'specific', 'Chris Morales', '2.2.4', 'In Progress', '2026-01-06', '2026-01-15', '2026-01-06', 70, 120, 84, 11400, 7980, false, false),
('TSK-0021', 'TSK-0021', 'DMR Workshops', 'DMR minutes, CMDs', 'PRJ-0002', 'PHS-0007', 'CST-0002', 'STE-0002', (SELECT id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1), 'specific', 'Clark Thannisch', '2.3.1', 'In Progress', '2026-01-16', '2026-01-20', '2026-01-16', 60, 64, 38, 8080, 4848, false, false),
('TSK-0022', 'TSK-0022', 'COF/POF Calculation', 'COF/POF tables, Recommendations', 'PRJ-0002', 'PHS-0007', 'CST-0002', 'STE-0002', (SELECT id FROM employees WHERE name ILIKE '%Priya Singh%' LIMIT 1), 'specific', 'Priya Singh', '2.3.2', 'In Progress', '2026-01-21', '2026-01-28', '2026-01-21', 45, 90, 40, 11500, 5111, false, true),
('TSK-0023', 'TSK-0023', 'Update IDMS & Schedules', 'Updated schedules, Upload reports', 'PRJ-0002', 'PHS-0008', 'CST-0002', 'STE-0002', (SELECT id FROM employees WHERE name ILIKE '%Jamie Carter%' LIMIT 1), 'specific', 'Jamie Carter', '2.4.1', 'In Progress', '2026-01-29', '2026-02-02', '2026-01-29', 40, 70, 28, 7600, 3040, false, false),
('TSK-0024', 'TSK-0024', 'Final Validation & Closeout', 'Validation signoff, Closeout report', 'PRJ-0002', 'PHS-0008', 'CST-0002', 'STE-0002', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'specific', 'Alex Johnson', '2.4.2', 'In Progress', '2026-02-03', '2026-02-07', '2026-02-03', 20, 24, 5, 3120, 650, true, false),
-- Golden Triangle Polymers Tasks (QRO)
('TSK-0025', 'TSK-0025', 'Project Governance & Playbooks', 'DRD, QMP, SOPs, QRO Workflow, Playbook', 'PRJ-0003', 'PHS-0009', 'CST-0003', 'STE-0003', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'specific', 'Alex Johnson', '3.1.1', 'Completed', '2026-01-05', '2026-01-14', '2026-01-05', 100, 178, 178, 20740, 20740, false, false),
('TSK-0026', 'TSK-0026', 'Initiation & Value-Case Workshop', 'Value case deck, DRS', 'PRJ-0003', 'PHS-0010', 'CST-0003', 'STE-0003', (SELECT id FROM employees WHERE name ILIKE '%Milea Cosby%' LIMIT 1), 'specific', 'Milea Cosby', '3.2.1', 'Completed', '2026-01-15', '2026-01-18', '2026-01-15', 100, 70, 70, 14600, 14600, true, false),
('TSK-0027', 'TSK-0027', 'Data Discovery & Master Data Build', 'MAL, Doc library, Data inventory', 'PRJ-0003', 'PHS-0010', 'CST-0003', 'STE-0003', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'specific', 'Taylor Nguyen', '3.2.2', 'In Progress', '2026-01-19', '2026-03-09', '2026-01-19', 30, 680, 204, 64600, 19380, false, true),
('TSK-0028', 'TSK-0028', 'Circuitization & Systemized PFDs', 'Systemized PFDs, Master circuit list', 'PRJ-0003', 'PHS-0010', 'CST-0003', 'STE-0003', (SELECT id FROM employees WHERE name ILIKE '%Chris Morales%' LIMIT 1), 'specific', 'Chris Morales', '3.2.3', 'In Progress', '2026-03-10', '2026-04-20', '2026-03-10', 15, 530, 80, 51850, 7777, false, true),
('TSK-0029', 'TSK-0029', 'Master Data Load / ETL to Newton', 'ETL pipelines, Loaded master data', 'PRJ-0003', 'PHS-0011', 'CST-0003', 'STE-0003', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'specific', 'Taylor Nguyen', '3.3.1', 'In Progress', '2026-04-21', '2026-05-28', '2026-04-21', 10, 440, 44, 45400, 4540, false, true),
('TSK-0030', 'TSK-0030', 'Newton Model Build - 8 sprints', 'Working Newton facility model', 'PRJ-0003', 'PHS-0011', 'CST-0003', 'STE-0003', (SELECT id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1), 'specific', 'Clark Thannisch', '3.3.2', 'Not Started', '2026-06-27', '2026-07-26', NULL, 0, 856, 0, 92560, 0, false, true),
-- TSAR Tasks
('TSK-0031', 'TSK-0031', 'Project Governance & Documents', 'DRD, QMP, SOPs', 'PRJ-0005', 'PHS-0018', 'CST-0004', 'STE-0005', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'specific', 'Alex Johnson', '5.1.1', 'Completed', '2025-12-20', '2025-12-25', '2025-12-20', 100, 96, 96, 11540, 11540, false, false),
('TSK-0032', 'TSK-0032', 'Initiate & Value-Case', 'Value case deck', 'PRJ-0005', 'PHS-0019', 'CST-0004', 'STE-0005', (SELECT id FROM employees WHERE name ILIKE '%Milea Cosby%' LIMIT 1), 'specific', 'Milea Cosby', '5.2.1', 'Completed', '2025-12-26', '2025-12-30', '2025-12-26', 100, 36, 36, 6600, 6600, true, false),
('TSK-0033', 'TSK-0033', 'Data Discovery & Master Data Build', 'MAL, Doc library', 'PRJ-0005', 'PHS-0019', 'CST-0004', 'STE-0005', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'specific', 'Taylor Nguyen', '5.2.2', 'In Progress', '2025-12-31', '2026-02-02', '2025-12-31', 40, 340, 136, 32300, 12920, false, true),
('TSK-0034', 'TSK-0034', 'ETL & Newton Setup', 'ETL, Newton skeleton', 'PRJ-0005', 'PHS-0020', 'CST-0004', 'STE-0005', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'specific', 'Taylor Nguyen', '5.3.1', 'In Progress', '2026-02-03', '2026-03-04', '2026-02-03', 25, 240, 60, 25800, 6450, false, true),
('TSK-0035', 'TSK-0035', 'Newton Model Build (5 sprints)', 'Newton pilot model, Sprint demos', 'PRJ-0005', 'PHS-0020', 'CST-0004', 'STE-0005', (SELECT id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1), 'specific', 'Clark Thannisch', '5.3.2', 'In Progress', '2026-03-05', '2026-04-03', '2026-03-05', 15, 540, 81, 61600, 9240, false, true),
-- Big West Oil Tasks
('TSK-0036', 'TSK-0036', 'Project Governance & Documents', 'DRD, QMP, Evergreening SOP', 'PRJ-0006', 'PHS-0023', 'CST-0005', 'STE-0006', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'specific', 'Alex Johnson', '6.1.1', 'Completed', '2026-01-15', '2026-01-19', '2026-01-15', 100, 60, 60, 7320, 7320, false, false),
('TSK-0037', 'TSK-0037', 'Kickoff', 'Kickoff minutes', 'PRJ-0006', 'PHS-0024', 'CST-0005', 'STE-0006', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'specific', 'Alex Johnson', '6.2.1', 'Completed', '2026-01-20', '2026-01-20', '2026-01-20', 100, 12, 12, 2120, 2120, true, false),
('TSK-0038', 'TSK-0038', 'Data Collection', 'MAL, Scanned docs', 'PRJ-0006', 'PHS-0024', 'CST-0005', 'STE-0006', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'specific', 'Taylor Nguyen', '6.2.2', 'In Progress', '2026-01-21', '2026-02-01', '2026-01-21', 65, 120, 78, 11500, 7475, false, true),
('TSK-0039', 'TSK-0039', 'MAL Validation & Field', 'Validated MAL, Field redlines', 'PRJ-0006', 'PHS-0025', 'CST-0005', 'STE-0006', (SELECT id FROM employees WHERE name ILIKE '%Riley Smith%' LIMIT 1), 'specific', 'Riley Smith', '6.3.1', 'In Progress', '2026-02-02', '2026-02-12', '2026-02-02', 45, 88, 40, 8020, 3609, false, false),
('TSK-0040', 'TSK-0040', 'DMR & COF', 'DMR minutes, COF tables', 'PRJ-0006', 'PHS-0025', 'CST-0005', 'STE-0006', (SELECT id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1), 'specific', 'Clark Thannisch', '6.3.2', 'In Progress', '2026-02-13', '2026-02-22', '2026-02-13', 35, 90, 32, 11300, 3955, false, false),
('TSK-0041', 'TSK-0041', 'Update IDMS & Schedules', 'Updated schedules, Upload logs', 'PRJ-0006', 'PHS-0025', 'CST-0005', 'STE-0006', (SELECT id FROM employees WHERE name ILIKE '%Jamie Carter%' LIMIT 1), 'specific', 'Jamie Carter', '6.3.3', 'In Progress', '2026-02-23', '2026-03-02', '2026-02-23', 30, 80, 24, 8700, 2610, false, false),
('TSK-0042', 'TSK-0042', 'Final Validation & Closeout', 'Final report, Handover notes', 'PRJ-0006', 'PHS-0026', 'CST-0005', 'STE-0006', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'specific', 'Alex Johnson', '6.4.1', 'In Progress', '2026-03-03', '2026-03-15', '2026-03-03', 20, 24, 5, 3400, 680, true, false);

-- ============================================================================
-- STEP 10: Insert Hour Entries (extensive timecard data with proper employee-task connections)
-- ============================================================================
INSERT INTO hour_entries (id, entry_id, employee_id, task_id, project_id, phase_id, date, hours, charge_code, description, is_billable, is_approved) VALUES
-- Methanex Project (PRJ-0001) - Phase 0: Governance
('HRS-0001', 'HRS-0001', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0001', 'PRJ-0001', 'PHS-0001', '2025-12-08', 4, 'EX', 'Governance docs prep', true, true),
('HRS-0002', 'HRS-0002', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0001', 'PRJ-0001', 'PHS-0001', '2025-12-09', 6, 'EX', 'DRD preparation', true, true),
('HRS-0003', 'HRS-0003', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0001', 'PRJ-0001', 'PHS-0001', '2025-12-10', 4, 'EX', 'QMP development', true, true),
('HRS-0004', 'HRS-0004', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'TSK-0001', 'PRJ-0001', 'PHS-0001', '2025-12-08', 8, 'EX', 'DRD technical writing', true, true),
('HRS-0005', 'HRS-0005', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'TSK-0001', 'PRJ-0001', 'PHS-0001', '2025-12-09', 8, 'EX', 'QMP technical writing', true, true),
('HRS-0006', 'HRS-0006', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'TSK-0001', 'PRJ-0001', 'PHS-0001', '2025-12-10', 6, 'EX', 'SOP development', true, true),
('HRS-0007', 'HRS-0007', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'TSK-0001', 'PRJ-0001', 'PHS-0001', '2025-12-11', 4, 'QC', 'QC review of DRD', true, true),
('HRS-0008', 'HRS-0008', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'TSK-0001', 'PRJ-0001', 'PHS-0001', '2025-12-12', 4, 'QC', 'QC review of QMP', true, true),
-- Methanex Project - Phase 1: Initiate & Data Collection
('HRS-0009', 'HRS-0009', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0002', 'PRJ-0001', 'PHS-0002', '2025-12-16', 6, 'EX', 'Kickoff meeting prep', true, true),
('HRS-0010', 'HRS-0010', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0002', 'PRJ-0001', 'PHS-0002', '2025-12-17', 4, 'EX', 'Kickoff meeting', true, true),
('HRS-0011', 'HRS-0011', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0003', 'PRJ-0001', 'PHS-0002', '2025-12-18', 8, 'EX', 'RACI development', true, true),
('HRS-0012', 'HRS-0012', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0003', 'PRJ-0001', 'PHS-0002', '2025-12-19', 6, 'EX', 'Baseline schedule', true, true),
('HRS-0013', 'HRS-0013', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0004', 'PRJ-0001', 'PHS-0002', '2025-12-22', 8, 'EX', 'MAL initial collection', true, true),
('HRS-0014', 'HRS-0014', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0004', 'PRJ-0001', 'PHS-0002', '2025-12-23', 8, 'EX', 'P&ID collection', true, true),
('HRS-0015', 'HRS-0015', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0004', 'PRJ-0001', 'PHS-0002', '2025-12-26', 8, 'EX', 'PFD collection', true, true),
('HRS-0016', 'HRS-0016', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0004', 'PRJ-0001', 'PHS-0002', '2025-12-27', 8, 'EX', 'Document indexing', true, true),
('HRS-0017', 'HRS-0017', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0004', 'PRJ-0001', 'PHS-0002', '2025-12-30', 6, 'EX', 'MAL validation prep', true, true),
('HRS-0018', 'HRS-0018', (SELECT id FROM employees WHERE name ILIKE '%Nicole Brown%' LIMIT 1), 'TSK-0005', 'PRJ-0001', 'PHS-0002', '2026-01-09', 8, 'EX', 'MAL validation', true, true),
('HRS-0019', 'HRS-0019', (SELECT id FROM employees WHERE name ILIKE '%Nicole Brown%' LIMIT 1), 'TSK-0005', 'PRJ-0001', 'PHS-0002', '2026-01-10', 8, 'EX', 'Gap analysis', true, true),
('HRS-0020', 'HRS-0020', (SELECT id FROM employees WHERE name ILIKE '%Nicole Brown%' LIMIT 1), 'TSK-0005', 'PRJ-0001', 'PHS-0002', '2026-01-13', 6, 'EX', 'Gap closure register', true, true),
('HRS-0021', 'HRS-0021', (SELECT id FROM employees WHERE name ILIKE '%Chris Morales%' LIMIT 1), 'TSK-0006', 'PRJ-0001', 'PHS-0002', '2026-01-18', 8, 'EX', 'Systemized PFDs', true, true),
('HRS-0022', 'HRS-0022', (SELECT id FROM employees WHERE name ILIKE '%Chris Morales%' LIMIT 1), 'TSK-0006', 'PRJ-0001', 'PHS-0002', '2026-01-19', 8, 'EX', 'Circuit list creation', true, true),
('HRS-0023', 'HRS-0023', (SELECT id FROM employees WHERE name ILIKE '%Chris Morales%' LIMIT 1), 'TSK-0006', 'PRJ-0001', 'PHS-0002', '2026-01-20', 8, 'EX', 'Circuitization mapping', true, true),
('HRS-0024', 'HRS-0024', (SELECT id FROM employees WHERE name ILIKE '%Chris Morales%' LIMIT 1), 'TSK-0006', 'PRJ-0001', 'PHS-0002', '2026-01-21', 6, 'EX', 'Circuit QC prep', true, true),
('HRS-0025', 'HRS-0025', (SELECT id FROM employees WHERE name ILIKE '%Riley Smith%' LIMIT 1), 'TSK-0007', 'PRJ-0001', 'PHS-0002', '2026-02-07', 8, 'EX', 'Field verification day 1', true, true),
('HRS-0026', 'HRS-0026', (SELECT id FROM employees WHERE name ILIKE '%Riley Smith%' LIMIT 1), 'TSK-0007', 'PRJ-0001', 'PHS-0002', '2026-02-08', 8, 'EX', 'Field verification day 2', true, true),
('HRS-0027', 'HRS-0027', (SELECT id FROM employees WHERE name ILIKE '%Riley Smith%' LIMIT 1), 'TSK-0007', 'PRJ-0001', 'PHS-0002', '2026-02-10', 8, 'EX', 'Redline P&IDs', true, true),
('HRS-0028', 'HRS-0028', (SELECT id FROM employees WHERE name ILIKE '%Riley Smith%' LIMIT 1), 'TSK-0007', 'PRJ-0001', 'PHS-0002', '2026-02-11', 6, 'EX', 'Verification pack compile', true, true),
-- Methanex Project - Phase 2: IDMS, DMR & Analysis
('HRS-0029', 'HRS-0029', (SELECT id FROM employees WHERE name ILIKE '%Jamie Carter%' LIMIT 1), 'TSK-0008', 'PRJ-0001', 'PHS-0003', '2026-02-25', 8, 'EX', 'IDMS data mapping', true, true),
('HRS-0030', 'HRS-0030', (SELECT id FROM employees WHERE name ILIKE '%Jamie Carter%' LIMIT 1), 'TSK-0008', 'PRJ-0001', 'PHS-0003', '2026-02-26', 8, 'EX', 'PCMS integration', true, true),
('HRS-0031', 'HRS-0031', (SELECT id FROM employees WHERE name ILIKE '%Jamie Carter%' LIMIT 1), 'TSK-0008', 'PRJ-0001', 'PHS-0003', '2026-02-27', 6, 'EX', 'Data load prep', true, true),
('HRS-0032', 'HRS-0032', (SELECT id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1), 'TSK-0009', 'PRJ-0001', 'PHS-0003', '2026-03-12', 6, 'EX', 'DMR workshop 1', true, true),
('HRS-0033', 'HRS-0033', (SELECT id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1), 'TSK-0009', 'PRJ-0001', 'PHS-0003', '2026-03-13', 6, 'EX', 'DMR workshop 2', true, true),
('HRS-0034', 'HRS-0034', (SELECT id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1), 'TSK-0009', 'PRJ-0001', 'PHS-0003', '2026-03-14', 4, 'EX', 'CMD documentation', true, true),
('HRS-0035', 'HRS-0035', (SELECT id FROM employees WHERE name ILIKE '%Priya Singh%' LIMIT 1), 'TSK-0010', 'PRJ-0001', 'PHS-0003', '2026-03-22', 8, 'EX', 'Corrosion model setup', true, true),
('HRS-0036', 'HRS-0036', (SELECT id FROM employees WHERE name ILIKE '%Priya Singh%' LIMIT 1), 'TSK-0010', 'PRJ-0001', 'PHS-0003', '2026-03-23', 8, 'EX', 'COF calculation', true, true),
('HRS-0037', 'HRS-0037', (SELECT id FROM employees WHERE name ILIKE '%Priya Singh%' LIMIT 1), 'TSK-0010', 'PRJ-0001', 'PHS-0003', '2026-03-24', 6, 'EX', 'POF calculation', true, true),
('HRS-0038', 'HRS-0038', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'TSK-0004', 'PRJ-0001', 'PHS-0002', '2026-01-02', 6, 'QC', 'Data collection QC', true, true),
('HRS-0039', 'HRS-0039', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'TSK-0008', 'PRJ-0001', 'PHS-0003', '2026-03-01', 4, 'QC', 'IDMS integration QC', true, true),
-- AdvanSix Project (PRJ-0002)
('HRS-0040', 'HRS-0040', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0016', 'PRJ-0002', 'PHS-0005', '2025-12-15', 6, 'EX', 'Governance docs', true, true),
('HRS-0041', 'HRS-0041', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0016', 'PRJ-0002', 'PHS-0005', '2025-12-16', 4, 'EX', 'QMP finalization', true, true),
('HRS-0042', 'HRS-0042', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'TSK-0016', 'PRJ-0002', 'PHS-0005', '2025-12-15', 8, 'EX', 'DRD writing', true, true),
('HRS-0043', 'HRS-0043', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'TSK-0016', 'PRJ-0002', 'PHS-0005', '2025-12-16', 6, 'EX', 'SOP writing', true, true),
('HRS-0044', 'HRS-0044', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0017', 'PRJ-0002', 'PHS-0006', '2025-12-20', 4, 'EX', 'Kickoff prep', true, true),
('HRS-0045', 'HRS-0045', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0017', 'PRJ-0002', 'PHS-0006', '2025-12-21', 4, 'EX', 'Kickoff meeting', true, true),
('HRS-0046', 'HRS-0046', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0018', 'PRJ-0002', 'PHS-0006', '2025-12-22', 8, 'EX', 'MAL collection', true, true),
('HRS-0047', 'HRS-0047', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0018', 'PRJ-0002', 'PHS-0006', '2025-12-23', 8, 'EX', 'Doc indexing', true, true),
('HRS-0048', 'HRS-0048', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0018', 'PRJ-0002', 'PHS-0006', '2025-12-26', 6, 'EX', 'MAL draft', true, true),
('HRS-0049', 'HRS-0049', (SELECT id FROM employees WHERE name ILIKE '%Riley Smith%' LIMIT 1), 'TSK-0019', 'PRJ-0002', 'PHS-0006', '2026-01-01', 8, 'EX', 'Field validation', true, true),
('HRS-0050', 'HRS-0050', (SELECT id FROM employees WHERE name ILIKE '%Riley Smith%' LIMIT 1), 'TSK-0019', 'PRJ-0002', 'PHS-0006', '2026-01-02', 8, 'EX', 'Field notes', true, true),
('HRS-0051', 'HRS-0051', (SELECT id FROM employees WHERE name ILIKE '%Chris Morales%' LIMIT 1), 'TSK-0020', 'PRJ-0002', 'PHS-0006', '2026-01-06', 8, 'EX', 'P&ID systemization', true, true),
('HRS-0052', 'HRS-0052', (SELECT id FROM employees WHERE name ILIKE '%Chris Morales%' LIMIT 1), 'TSK-0020', 'PRJ-0002', 'PHS-0006', '2026-01-07', 8, 'EX', 'Electronic P&IDs', true, true),
('HRS-0053', 'HRS-0053', (SELECT id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1), 'TSK-0021', 'PRJ-0002', 'PHS-0007', '2026-01-16', 6, 'EX', 'DMR workshop', true, true),
('HRS-0054', 'HRS-0054', (SELECT id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1), 'TSK-0021', 'PRJ-0002', 'PHS-0007', '2026-01-17', 6, 'EX', 'CMD prep', true, true),
('HRS-0055', 'HRS-0055', (SELECT id FROM employees WHERE name ILIKE '%Priya Singh%' LIMIT 1), 'TSK-0022', 'PRJ-0002', 'PHS-0007', '2026-01-21', 8, 'EX', 'COF calculation', true, true),
('HRS-0056', 'HRS-0056', (SELECT id FROM employees WHERE name ILIKE '%Priya Singh%' LIMIT 1), 'TSK-0022', 'PRJ-0002', 'PHS-0007', '2026-01-22', 6, 'EX', 'POF calculation', true, true),
('HRS-0057', 'HRS-0057', (SELECT id FROM employees WHERE name ILIKE '%Jamie Carter%' LIMIT 1), 'TSK-0023', 'PRJ-0002', 'PHS-0008', '2026-01-29', 8, 'EX', 'IDMS schedules', true, true),
('HRS-0058', 'HRS-0058', (SELECT id FROM employees WHERE name ILIKE '%Jamie Carter%' LIMIT 1), 'TSK-0023', 'PRJ-0002', 'PHS-0008', '2026-01-30', 6, 'EX', 'Upload prep', true, true),
('HRS-0059', 'HRS-0059', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'TSK-0018', 'PRJ-0002', 'PHS-0006', '2025-12-27', 4, 'QC', 'Data collection QC', true, true),
-- Golden Triangle Polymers (PRJ-0003) - QRO
('HRS-0060', 'HRS-0060', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0025', 'PRJ-0003', 'PHS-0009', '2026-01-05', 8, 'EX', 'Governance prep', true, true),
('HRS-0061', 'HRS-0061', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0025', 'PRJ-0003', 'PHS-0009', '2026-01-06', 8, 'EX', 'DRD development', true, true),
('HRS-0062', 'HRS-0062', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0025', 'PRJ-0003', 'PHS-0009', '2026-01-07', 6, 'EX', 'QMP development', true, true),
('HRS-0063', 'HRS-0063', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'TSK-0025', 'PRJ-0003', 'PHS-0009', '2026-01-05', 8, 'EX', 'Playbook writing', true, true),
('HRS-0064', 'HRS-0064', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'TSK-0025', 'PRJ-0003', 'PHS-0009', '2026-01-06', 8, 'EX', 'SOP writing', true, true),
('HRS-0065', 'HRS-0065', (SELECT id FROM employees WHERE name ILIKE '%Milea Cosby%' LIMIT 1), 'TSK-0026', 'PRJ-0003', 'PHS-0010', '2026-01-15', 8, 'EX', 'Value case workshop', true, true),
('HRS-0066', 'HRS-0066', (SELECT id FROM employees WHERE name ILIKE '%Milea Cosby%' LIMIT 1), 'TSK-0026', 'PRJ-0003', 'PHS-0010', '2026-01-16', 6, 'EX', 'DRS review', true, true),
('HRS-0067', 'HRS-0067', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0027', 'PRJ-0003', 'PHS-0010', '2026-01-19', 8, 'EX', 'MAL build', true, true),
('HRS-0068', 'HRS-0068', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0027', 'PRJ-0003', 'PHS-0010', '2026-01-20', 8, 'EX', 'Doc library setup', true, true),
('HRS-0069', 'HRS-0069', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0027', 'PRJ-0003', 'PHS-0010', '2026-01-21', 8, 'EX', 'Data inventory', true, true),
('HRS-0070', 'HRS-0070', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0027', 'PRJ-0003', 'PHS-0010', '2026-01-22', 6, 'EX', 'Data discovery', true, true),
('HRS-0071', 'HRS-0071', (SELECT id FROM employees WHERE name ILIKE '%Chris Morales%' LIMIT 1), 'TSK-0028', 'PRJ-0003', 'PHS-0010', '2026-03-10', 8, 'EX', 'Circuitization', true, true),
('HRS-0072', 'HRS-0072', (SELECT id FROM employees WHERE name ILIKE '%Chris Morales%' LIMIT 1), 'TSK-0028', 'PRJ-0003', 'PHS-0010', '2026-03-11', 8, 'EX', 'PFD systemization', true, true),
('HRS-0073', 'HRS-0073', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0029', 'PRJ-0003', 'PHS-0011', '2026-04-21', 8, 'EX', 'ETL pipeline dev', true, true),
('HRS-0074', 'HRS-0074', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0029', 'PRJ-0003', 'PHS-0011', '2026-04-22', 8, 'EX', 'Data load testing', true, true),
('HRS-0075', 'HRS-0075', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'TSK-0025', 'PRJ-0003', 'PHS-0009', '2026-01-08', 6, 'QC', 'Governance QC', true, true),
('HRS-0076', 'HRS-0076', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'TSK-0027', 'PRJ-0003', 'PHS-0010', '2026-01-23', 4, 'QC', 'Data discovery QC', true, true),
-- TSAR Project (PRJ-0005)
('HRS-0077', 'HRS-0077', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0031', 'PRJ-0005', 'PHS-0018', '2025-12-20', 6, 'EX', 'Governance docs', true, true),
('HRS-0078', 'HRS-0078', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0031', 'PRJ-0005', 'PHS-0018', '2025-12-21', 6, 'EX', 'DRD prep', true, true),
('HRS-0079', 'HRS-0079', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'TSK-0031', 'PRJ-0005', 'PHS-0018', '2025-12-20', 8, 'EX', 'Technical docs', true, true),
('HRS-0080', 'HRS-0080', (SELECT id FROM employees WHERE name ILIKE '%Milea Cosby%' LIMIT 1), 'TSK-0032', 'PRJ-0005', 'PHS-0019', '2025-12-26', 6, 'EX', 'Value case prep', true, true),
('HRS-0081', 'HRS-0081', (SELECT id FROM employees WHERE name ILIKE '%Milea Cosby%' LIMIT 1), 'TSK-0032', 'PRJ-0005', 'PHS-0019', '2025-12-27', 8, 'EX', 'Value case workshop', true, true),
('HRS-0082', 'HRS-0082', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0033', 'PRJ-0005', 'PHS-0019', '2025-12-31', 8, 'EX', 'MAL build', true, true),
('HRS-0083', 'HRS-0083', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0033', 'PRJ-0005', 'PHS-0019', '2026-01-02', 8, 'EX', 'Doc library', true, true),
('HRS-0084', 'HRS-0084', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0033', 'PRJ-0005', 'PHS-0019', '2026-01-03', 6, 'EX', 'Data discovery', true, true),
('HRS-0085', 'HRS-0085', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0034', 'PRJ-0005', 'PHS-0020', '2026-02-03', 8, 'EX', 'ETL setup', true, true),
('HRS-0086', 'HRS-0086', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0034', 'PRJ-0005', 'PHS-0020', '2026-02-04', 8, 'EX', 'Newton skeleton', true, true),
('HRS-0087', 'HRS-0087', (SELECT id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1), 'TSK-0035', 'PRJ-0005', 'PHS-0020', '2026-03-05', 8, 'EX', 'Newton sprint 1', true, true),
('HRS-0088', 'HRS-0088', (SELECT id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1), 'TSK-0035', 'PRJ-0005', 'PHS-0020', '2026-03-06', 8, 'EX', 'Newton sprint 1 cont', true, true),
('HRS-0089', 'HRS-0089', (SELECT id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1), 'TSK-0035', 'PRJ-0005', 'PHS-0020', '2026-03-07', 6, 'EX', 'Sprint 1 demo', true, true),
('HRS-0090', 'HRS-0090', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'TSK-0031', 'PRJ-0005', 'PHS-0018', '2025-12-22', 4, 'QC', 'Governance QC', true, true),
-- Big West Oil Project (PRJ-0006)
('HRS-0091', 'HRS-0091', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0036', 'PRJ-0006', 'PHS-0023', '2026-01-15', 6, 'EX', 'Governance docs', true, true),
('HRS-0092', 'HRS-0092', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0036', 'PRJ-0006', 'PHS-0023', '2026-01-16', 4, 'EX', 'SOP review', true, true),
('HRS-0093', 'HRS-0093', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'TSK-0036', 'PRJ-0006', 'PHS-0023', '2026-01-15', 8, 'EX', 'DRD writing', true, true),
('HRS-0094', 'HRS-0094', (SELECT id FROM employees WHERE name ILIKE '%Alex Johnson%' LIMIT 1), 'TSK-0037', 'PRJ-0006', 'PHS-0024', '2026-01-20', 4, 'EX', 'Kickoff meeting', true, true),
('HRS-0095', 'HRS-0095', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0038', 'PRJ-0006', 'PHS-0024', '2026-01-21', 8, 'EX', 'MAL collection', true, true),
('HRS-0096', 'HRS-0096', (SELECT id FROM employees WHERE name ILIKE '%Taylor Nguyen%' LIMIT 1), 'TSK-0038', 'PRJ-0006', 'PHS-0024', '2026-01-22', 8, 'EX', 'Doc scanning', true, true),
('HRS-0097', 'HRS-0097', (SELECT id FROM employees WHERE name ILIKE '%Riley Smith%' LIMIT 1), 'TSK-0039', 'PRJ-0006', 'PHS-0025', '2026-02-02', 8, 'EX', 'MAL validation', true, true),
('HRS-0098', 'HRS-0098', (SELECT id FROM employees WHERE name ILIKE '%Riley Smith%' LIMIT 1), 'TSK-0039', 'PRJ-0006', 'PHS-0025', '2026-02-03', 6, 'EX', 'Field redlines', true, true),
('HRS-0099', 'HRS-0099', (SELECT id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1), 'TSK-0040', 'PRJ-0006', 'PHS-0025', '2026-02-13', 8, 'EX', 'DMR workshop', true, true),
('HRS-0100', 'HRS-0100', (SELECT id FROM employees WHERE name ILIKE '%Clark Thannisch%' LIMIT 1), 'TSK-0040', 'PRJ-0006', 'PHS-0025', '2026-02-14', 6, 'EX', 'COF tables', true, true),
('HRS-0101', 'HRS-0101', (SELECT id FROM employees WHERE name ILIKE '%Jamie Carter%' LIMIT 1), 'TSK-0041', 'PRJ-0006', 'PHS-0025', '2026-02-23', 8, 'EX', 'IDMS update', true, true),
('HRS-0102', 'HRS-0102', (SELECT id FROM employees WHERE name ILIKE '%Jamie Carter%' LIMIT 1), 'TSK-0041', 'PRJ-0006', 'PHS-0025', '2026-02-24', 6, 'EX', 'Schedule upload', true, true),
('HRS-0103', 'HRS-0103', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'TSK-0036', 'PRJ-0006', 'PHS-0023', '2026-01-17', 4, 'QC', 'Governance QC', true, true),
-- Additional QC Hours across projects
('HRS-0104', 'HRS-0104', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'TSK-0006', 'PRJ-0001', 'PHS-0002', '2026-01-22', 4, 'QC', 'Circuitization QC', true, true),
('HRS-0105', 'HRS-0105', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'TSK-0010', 'PRJ-0001', 'PHS-0003', '2026-03-25', 6, 'QC', 'Corrosion model QC', true, true),
('HRS-0106', 'HRS-0106', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'TSK-0020', 'PRJ-0002', 'PHS-0006', '2026-01-08', 4, 'QC', 'P&ID QC', true, true),
('HRS-0107', 'HRS-0107', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'TSK-0022', 'PRJ-0002', 'PHS-0007', '2026-01-23', 4, 'QC', 'COF/POF QC', true, true),
('HRS-0108', 'HRS-0108', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'TSK-0028', 'PRJ-0003', 'PHS-0010', '2026-03-12', 6, 'QC', 'Circuitization QC', true, true),
('HRS-0109', 'HRS-0109', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'TSK-0035', 'PRJ-0005', 'PHS-0020', '2026-03-08', 4, 'QC', 'Newton model QC', true, true),
('HRS-0110', 'HRS-0110', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'TSK-0038', 'PRJ-0006', 'PHS-0024', '2026-01-23', 4, 'QC', 'Data collection QC', true, true);

-- ============================================================================
-- STEP 11: Insert Milestones
-- ============================================================================
INSERT INTO milestones (id, milestone_id, milestone_name, project_id, phase_id, task_id, customer, site, status, percent_complete, planned_date, forecasted_date, actual_date, variance_days) VALUES
('MLS-0001', 'MLS-0001', 'Project Kickoff', 'PRJ-0001', 'PHS-0002', 'TSK-0002', 'Methanex', 'Geismar, LA', 'Completed', 100, '2025-12-17', '2025-12-17', '2025-12-17', 0),
('MLS-0002', 'MLS-0002', 'Data Collection Complete', 'PRJ-0001', 'PHS-0002', 'TSK-0004', 'Methanex', 'Geismar, LA', 'In Progress', 80, '2026-01-08', '2026-01-10', NULL, 2),
('MLS-0003', 'MLS-0003', 'IDMS Integration Complete', 'PRJ-0001', 'PHS-0003', 'TSK-0008', 'Methanex', 'Geismar, LA', 'In Progress', 30, '2026-03-11', '2026-03-15', NULL, 4),
('MLS-0004', 'MLS-0004', 'Final Customer Signoff', 'PRJ-0001', 'PHS-0004', 'TSK-0014', 'Methanex', 'Geismar, LA', 'Not Started', 0, '2026-05-06', '2026-05-06', NULL, 0),
('MLS-0005', 'MLS-0005', 'Project Kickoff', 'PRJ-0002', 'PHS-0006', 'TSK-0017', 'AdvanSix', 'Frankford, PA', 'Completed', 100, '2025-12-21', '2025-12-21', '2025-12-21', 0),
('MLS-0006', 'MLS-0006', 'Final Closeout', 'PRJ-0002', 'PHS-0008', 'TSK-0024', 'AdvanSix', 'Frankford, PA', 'In Progress', 20, '2026-02-07', '2026-02-10', NULL, 3),
('MLS-0007', 'MLS-0007', 'Value Case Approved', 'PRJ-0003', 'PHS-0010', 'TSK-0026', 'Chevron Phillips Chemical', 'Orange, TX', 'Completed', 100, '2026-01-18', '2026-01-18', '2026-01-18', 0),
('MLS-0008', 'MLS-0008', 'Newton Model Complete', 'PRJ-0003', 'PHS-0011', 'TSK-0030', 'Chevron Phillips Chemical', 'Orange, TX', 'Not Started', 0, '2026-07-26', '2026-07-30', NULL, 4),
('MLS-0009', 'MLS-0009', 'Value Case Approved', 'PRJ-0005', 'PHS-0019', 'TSK-0032', 'The San Antonio Refinery, LLC', 'San Antonio, TX', 'Completed', 100, '2025-12-30', '2025-12-30', '2025-12-30', 0),
('MLS-0010', 'MLS-0010', 'Project Kickoff', 'PRJ-0006', 'PHS-0024', 'TSK-0037', 'Big West Oil', 'Salt Lake City, UT', 'Completed', 100, '2026-01-20', '2026-01-20', '2026-01-20', 0);

-- ============================================================================
-- STEP 12: Insert Deliverables
-- ============================================================================
INSERT INTO deliverables (id, deliverable_id, name, project_id, phase_id, task_id, employee_id, type, status, due_date, completed_date, percent_complete) VALUES
('DLB-0001', 'DLB-0001', 'DRD - Methanex Geismar', 'PRJ-0001', 'PHS-0001', 'TSK-0001', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'DRD', 'Approved', '2025-12-12', '2025-12-12', 100),
('DLB-0002', 'DLB-0002', 'QMP - Methanex Geismar', 'PRJ-0001', 'PHS-0001', 'TSK-0001', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'QMP', 'Approved', '2025-12-14', '2025-12-14', 100),
('DLB-0003', 'DLB-0003', 'SOP - DMR Process', 'PRJ-0001', 'PHS-0001', 'TSK-0001', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'SOP', 'Under Review', '2025-12-15', NULL, 80),
('DLB-0004', 'DLB-0004', 'DRD - AdvanSix Frankford', 'PRJ-0002', 'PHS-0005', 'TSK-0016', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'DRD', 'Approved', '2025-12-17', '2025-12-17', 100),
('DLB-0005', 'DLB-0005', 'QMP - AdvanSix Frankford', 'PRJ-0002', 'PHS-0005', 'TSK-0016', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'QMP', 'Approved', '2025-12-18', '2025-12-18', 100),
('DLB-0006', 'DLB-0006', 'DRD - Golden Triangle', 'PRJ-0003', 'PHS-0009', 'TSK-0025', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'DRD', 'Approved', '2026-01-10', '2026-01-10', 100),
('DLB-0007', 'DLB-0007', 'QMP - Golden Triangle', 'PRJ-0003', 'PHS-0009', 'TSK-0025', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'QMP', 'Approved', '2026-01-12', '2026-01-12', 100),
('DLB-0008', 'DLB-0008', 'QRO Playbook', 'PRJ-0003', 'PHS-0009', 'TSK-0025', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'SOP', 'Under Review', '2026-01-14', NULL, 75),
('DLB-0009', 'DLB-0009', 'DRD - TSAR', 'PRJ-0005', 'PHS-0018', 'TSK-0031', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'DRD', 'Approved', '2025-12-23', '2025-12-23', 100),
('DLB-0010', 'DLB-0010', 'QMP - TSAR', 'PRJ-0005', 'PHS-0018', 'TSK-0031', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'QMP', 'Under Review', '2025-12-24', NULL, 80),
('DLB-0011', 'DLB-0011', 'DRD - Big West Oil', 'PRJ-0006', 'PHS-0023', 'TSK-0036', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'DRD', 'Approved', '2026-01-17', '2026-01-17', 100),
('DLB-0012', 'DLB-0012', 'QMP - Big West Oil', 'PRJ-0006', 'PHS-0023', 'TSK-0036', (SELECT id FROM employees WHERE name ILIKE '%Sam Patel%' LIMIT 1), 'QMP', 'In Progress', '2026-01-18', NULL, 50);

-- ============================================================================
-- STEP 13: Insert QC Tasks
-- ============================================================================
INSERT INTO qc_tasks (id, qc_task_id, parent_task_id, employee_id, qc_resource_id, qc_type, qc_status, qc_hours, qc_score, qc_count, qc_uom) VALUES
('QCT-0001', 'QCT-0001', 'TSK-0001', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'E1006', 'Initial', 'Pass', 6, 95, 6, 'documents'),
('QCT-0002', 'QCT-0002', 'TSK-0001', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'E1006', 'Kickoff', 'Pass', 6, 92, 6, 'documents'),
('QCT-0003', 'QCT-0003', 'TSK-0004', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'E1006', 'Initial', 'Pass', 10, 88, 750, 'documents'),
('QCT-0004', 'QCT-0004', 'TSK-0004', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'E1006', 'Mid', 'Pending', 10, 0, 750, 'documents'),
('QCT-0005', 'QCT-0005', 'TSK-0008', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'E1006', 'Initial', 'Pending', 10, 0, 2500, 'data_rows'),
('QCT-0006', 'QCT-0006', 'TSK-0010', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'E1006', 'Mid', 'Pending', 12, 0, 100, 'circuits'),
('QCT-0007', 'QCT-0007', 'TSK-0016', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'E1006', 'Initial', 'Pass', 5, 97, 5, 'documents'),
('QCT-0008', 'QCT-0008', 'TSK-0018', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'E1006', 'Mid', 'Pass', 6, 91, 400, 'documents'),
('QCT-0009', 'QCT-0009', 'TSK-0025', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'E1006', 'Initial', 'Pass', 10, 94, 9, 'documents'),
('QCT-0010', 'QCT-0010', 'TSK-0027', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'E1006', 'Mid', 'Pending', 20, 0, 1000, 'documents'),
('QCT-0011', 'QCT-0011', 'TSK-0030', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'E1006', 'Validation', 'Pending', 20, 0, 1, 'newton_model'),
('QCT-0012', 'QCT-0012', 'TSK-0031', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'E1006', 'Initial', 'Pass', 6, 96, 6, 'documents'),
('QCT-0013', 'QCT-0013', 'TSK-0035', (SELECT id FROM employees WHERE name ILIKE '%Jordan Lee%' LIMIT 1), 'E1006', 'Mid', 'Pending', 15, 0, 1, 'newton_model');

-- ============================================================================
-- STEP 14: Insert Project Health Data (JSONB structure)
-- ============================================================================
INSERT INTO project_health (id, project_id, project_name, overall_status, overall_score, checks, approvals) VALUES
('PHC-0001', 'PRJ-0001', 'Methanex - Geismar - 2 RBI Implementation', 'approved', 85.0, 
  '[{"id":"chk-1","category":"Schedule","name":"Baseline Schedule Defined","status":"Pass","weight":1.0,"notes":"Baseline approved on 2025-12-16"},{"id":"chk-2","category":"Schedule","name":"Schedule Variance < 10%","status":"Pass","weight":1.0,"notes":"SV at 3%"},{"id":"chk-3","category":"Budget","name":"Budget Baseline Approved","status":"Pass","weight":1.0,"notes":"Budget approved"},{"id":"chk-4","category":"Budget","name":"Cost Variance < 10%","status":"Pass","weight":1.0,"notes":"CV at 5%"},{"id":"chk-5","category":"Resources","name":"Resources Fully Allocated","status":"Warning","weight":0.7,"notes":"2 roles pending assignment"},{"id":"chk-6","category":"Quality","name":"QC Reviews On Schedule","status":"Pass","weight":1.0,"notes":"All QC on track"},{"id":"chk-7","category":"Governance","name":"DRD Signed","status":"Pass","weight":1.0,"notes":"DRD signed 2025-12-12"},{"id":"chk-8","category":"Governance","name":"QMP Approved","status":"Pass","weight":1.0,"notes":"QMP approved 2025-12-14"},{"id":"chk-9","category":"Risk","name":"Risks Documented","status":"Pass","weight":1.0,"notes":"Risk register current"},{"id":"chk-10","category":"Communication","name":"Weekly Status Reports","status":"Pass","weight":1.0,"notes":"Reports on time"}]'::jsonb,
  '{"projectManager":{"approved":true,"date":"2025-12-16","name":"Alex Johnson"},"srManager":{"approved":true,"date":"2025-12-17","name":"Brandon Beeghly"}}'::jsonb),

('PHC-0002', 'PRJ-0002', 'AdvanSix Frankford', 'approved', 90.0,
  '[{"id":"chk-1","category":"Schedule","name":"Baseline Schedule Defined","status":"Pass","weight":1.0,"notes":"Baseline approved"},{"id":"chk-2","category":"Schedule","name":"Schedule Variance < 10%","status":"Warning","weight":0.7,"notes":"SV at 8%"},{"id":"chk-3","category":"Budget","name":"Budget Baseline Approved","status":"Pass","weight":1.0,"notes":"Budget approved"},{"id":"chk-4","category":"Budget","name":"Cost Variance < 10%","status":"Pass","weight":1.0,"notes":"CV at 4%"},{"id":"chk-5","category":"Resources","name":"Resources Fully Allocated","status":"Pass","weight":1.0,"notes":"All resources assigned"},{"id":"chk-6","category":"Quality","name":"QC Reviews On Schedule","status":"Pass","weight":1.0,"notes":"QC on track"},{"id":"chk-7","category":"Governance","name":"DRD Signed","status":"Pass","weight":1.0,"notes":"DRD signed"},{"id":"chk-8","category":"Governance","name":"QMP Approved","status":"Pass","weight":1.0,"notes":"QMP approved"}]'::jsonb,
  '{"projectManager":{"approved":true,"date":"2025-12-15","name":"Alex Johnson"},"srManager":{"approved":true,"date":"2025-12-16","name":"Brandon Beeghly"}}'::jsonb),

('PHC-0003', 'PRJ-0003', 'Golden Triangle Polymers - Full Site Implementation', 'pending_review', 72.0,
  '[{"id":"chk-1","category":"Schedule","name":"Baseline Schedule Defined","status":"Pass","weight":1.0,"notes":"Baseline approved 2026-01-14"},{"id":"chk-2","category":"Schedule","name":"Schedule Variance < 10%","status":"Warning","weight":0.7,"notes":"SV at 12% due to data delays"},{"id":"chk-3","category":"Budget","name":"Budget Baseline Approved","status":"Pass","weight":1.0,"notes":"Budget approved"},{"id":"chk-4","category":"Budget","name":"Cost Variance < 10%","status":"Pass","weight":1.0,"notes":"CV at 7%"},{"id":"chk-5","category":"Resources","name":"Resources Fully Allocated","status":"Fail","weight":0.4,"notes":"4 Newton roles pending"},{"id":"chk-6","category":"Quality","name":"QC Reviews On Schedule","status":"Pass","weight":1.0,"notes":"QC on track"},{"id":"chk-7","category":"Governance","name":"DRD Signed","status":"Pass","weight":1.0,"notes":"DRD signed 2026-01-10"},{"id":"chk-8","category":"Technical","name":"Newton Model Architecture","status":"Pass","weight":1.0,"notes":"Architecture complete"},{"id":"chk-9","category":"Technical","name":"ETL Pipelines Validated","status":"Warning","weight":0.7,"notes":"80% complete"},{"id":"chk-10","category":"Risk","name":"Risks Documented","status":"Warning","weight":0.7,"notes":"High risk: data availability"}]'::jsonb,
  '{"projectManager":{"approved":true,"date":"2026-01-14","name":"Alex Johnson"},"srManager":{"approved":false,"date":null,"name":"Steven Quillen"}}'::jsonb),

('PHC-0004', 'PRJ-0004', 'Chevron Phillips Chemical - Port Arthur - 25 - FE QRO for 1544', 'approved', 88.0,
  '[{"id":"chk-1","category":"Schedule","name":"Baseline Schedule Defined","status":"Pass","weight":1.0,"notes":"Baseline approved"},{"id":"chk-2","category":"Schedule","name":"Schedule Variance < 10%","status":"Pass","weight":1.0,"notes":"SV at 5%"},{"id":"chk-3","category":"Budget","name":"Budget Baseline Approved","status":"Pass","weight":1.0,"notes":"Budget approved"},{"id":"chk-4","category":"Budget","name":"Cost Variance < 10%","status":"Pass","weight":1.0,"notes":"CV at 6%"},{"id":"chk-5","category":"Resources","name":"Resources Fully Allocated","status":"Pass","weight":1.0,"notes":"All assigned"},{"id":"chk-6","category":"Quality","name":"QC Reviews On Schedule","status":"Pass","weight":1.0,"notes":"QC current"},{"id":"chk-7","category":"Governance","name":"DRD Signed","status":"Pass","weight":1.0,"notes":"DRD signed 2026-02-02"},{"id":"chk-8","category":"Technical","name":"Newton Model Architecture","status":"Pass","weight":1.0,"notes":"FE Architecture ready"}]'::jsonb,
  '{"projectManager":{"approved":true,"date":"2026-02-02","name":"Alex Johnson"},"srManager":{"approved":true,"date":"2026-02-03","name":"Steven Quillen"}}'::jsonb),

('PHC-0005', 'PRJ-0005', 'TSAR - 24 - San Antonio - Reliability Optimization', 'pending_review', 82.0,
  '[{"id":"chk-1","category":"Schedule","name":"Baseline Schedule Defined","status":"Pass","weight":1.0,"notes":"Baseline set"},{"id":"chk-2","category":"Schedule","name":"Schedule Variance < 10%","status":"Pass","weight":1.0,"notes":"SV at 4%"},{"id":"chk-3","category":"Budget","name":"Budget Baseline Approved","status":"Pass","weight":1.0,"notes":"Approved"},{"id":"chk-4","category":"Budget","name":"Cost Variance < 10%","status":"Pass","weight":1.0,"notes":"CV at 3%"},{"id":"chk-5","category":"Resources","name":"Resources Fully Allocated","status":"Warning","weight":0.7,"notes":"1 role pending"},{"id":"chk-6","category":"Quality","name":"QC Reviews On Schedule","status":"Pass","weight":1.0,"notes":"QC current"},{"id":"chk-7","category":"Governance","name":"DRD Signed","status":"Pass","weight":1.0,"notes":"DRD signed 2025-12-23"},{"id":"chk-8","category":"Governance","name":"QMP Approved","status":"Warning","weight":0.7,"notes":"QMP in review"},{"id":"chk-9","category":"Technical","name":"Newton Model Architecture","status":"Pass","weight":1.0,"notes":"Ready"},{"id":"chk-10","category":"Risk","name":"Risks Documented","status":"Pass","weight":1.0,"notes":"Risk register current"}]'::jsonb,
  '{"projectManager":{"approved":true,"date":"2025-12-25","name":"Alex Johnson"},"srManager":{"approved":false,"date":null,"name":"Samantha Law"}}'::jsonb),

('PHC-0006', 'PRJ-0006', 'Big West Oil - 24 - Salt Lake City - 2024 Evergreening', 'approved', 86.0,
  '[{"id":"chk-1","category":"Schedule","name":"Baseline Schedule Defined","status":"Pass","weight":1.0,"notes":"Baseline set"},{"id":"chk-2","category":"Schedule","name":"Schedule Variance < 10%","status":"Pass","weight":1.0,"notes":"SV at 2%"},{"id":"chk-3","category":"Budget","name":"Budget Baseline Approved","status":"Pass","weight":1.0,"notes":"Approved"},{"id":"chk-4","category":"Budget","name":"Cost Variance < 10%","status":"Pass","weight":1.0,"notes":"CV at 5%"},{"id":"chk-5","category":"Resources","name":"Resources Fully Allocated","status":"Pass","weight":1.0,"notes":"All assigned"},{"id":"chk-6","category":"Quality","name":"QC Reviews On Schedule","status":"Pass","weight":1.0,"notes":"QC current"},{"id":"chk-7","category":"Governance","name":"DRD Signed","status":"Pass","weight":1.0,"notes":"DRD signed 2026-01-17"},{"id":"chk-8","category":"Governance","name":"QMP Approved","status":"Warning","weight":0.7,"notes":"QMP in draft"},{"id":"chk-9","category":"Risk","name":"Risks Documented","status":"Pass","weight":1.0,"notes":"Risks documented"}]'::jsonb,
  '{"projectManager":{"approved":true,"date":"2026-01-19","name":"Alex Johnson"},"srManager":{"approved":true,"date":"2026-01-20","name":"Samantha Law"}}'::jsonb);

-- ============================================================================
-- Summary Statistics
-- ============================================================================
SELECT 'Data Load Summary' as report;
SELECT 'Charge Codes' as entity, COUNT(*) as count FROM charge_codes;
SELECT 'Portfolios' as entity, COUNT(*) as count FROM portfolios;
SELECT 'Customers' as entity, COUNT(*) as count FROM customers;
SELECT 'Sites' as entity, COUNT(*) as count FROM sites;
SELECT 'Units' as entity, COUNT(*) as count FROM units;
SELECT 'Projects' as entity, COUNT(*) as count FROM projects;
SELECT 'Phases' as entity, COUNT(*) as count FROM phases;
SELECT 'Tasks' as entity, COUNT(*) as count FROM tasks;
SELECT 'Hour Entries' as entity, COUNT(*) as count FROM hour_entries;
SELECT 'Milestones' as entity, COUNT(*) as count FROM milestones;
SELECT 'Deliverables' as entity, COUNT(*) as count FROM deliverables;
SELECT 'QC Tasks' as entity, COUNT(*) as count FROM qc_tasks;
SELECT 'Project Health Records' as entity, COUNT(*) as count FROM project_health;
