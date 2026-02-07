-- ============================================================================
-- PostgreSQL Schema for PPC Application
-- Run this first to create all tables
-- ============================================================================

-- Charge Codes
CREATE TABLE IF NOT EXISTS charge_codes (
    id VARCHAR(50) PRIMARY KEY,
    code_id VARCHAR(50) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Employees
CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(50) PRIMARY KEY,
    employee_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    role VARCHAR(100),
    department VARCHAR(100),
    hourly_rate DECIMAL(10,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Portfolios
CREATE TABLE IF NOT EXISTS portfolios (
    id VARCHAR(50) PRIMARY KEY,
    portfolio_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    employee_id VARCHAR(50) REFERENCES employees(id),
    manager VARCHAR(255),
    methodology VARCHAR(100),
    baseline_start_date DATE,
    baseline_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    percent_complete INTEGER DEFAULT 0,
    baseline_hours DECIMAL(10,2) DEFAULT 0,
    actual_hours DECIMAL(10,2) DEFAULT 0,
    baseline_cost DECIMAL(12,2) DEFAULT 0,
    actual_cost DECIMAL(12,2) DEFAULT 0,
    comments TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(50) PRIMARY KEY,
    customer_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    portfolio_id VARCHAR(50) REFERENCES portfolios(id),
    employee_id VARCHAR(50) REFERENCES employees(id),
    baseline_start_date DATE,
    baseline_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    percent_complete INTEGER DEFAULT 0,
    baseline_hours DECIMAL(10,2) DEFAULT 0,
    actual_hours DECIMAL(10,2) DEFAULT 0,
    baseline_cost DECIMAL(12,2) DEFAULT 0,
    actual_cost DECIMAL(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Sites
CREATE TABLE IF NOT EXISTS sites (
    id VARCHAR(50) PRIMARY KEY,
    site_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    customer_id VARCHAR(50) REFERENCES customers(id),
    employee_id VARCHAR(50) REFERENCES employees(id),
    location VARCHAR(255),
    baseline_start_date DATE,
    baseline_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    percent_complete INTEGER DEFAULT 0,
    baseline_hours DECIMAL(10,2) DEFAULT 0,
    actual_hours DECIMAL(10,2) DEFAULT 0,
    baseline_cost DECIMAL(12,2) DEFAULT 0,
    actual_cost DECIMAL(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Units
CREATE TABLE IF NOT EXISTS units (
    id VARCHAR(50) PRIMARY KEY,
    unit_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    site_id VARCHAR(50) REFERENCES sites(id),
    employee_id VARCHAR(50) REFERENCES employees(id),
    description TEXT,
    baseline_start_date DATE,
    baseline_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    percent_complete INTEGER DEFAULT 0,
    baseline_hours DECIMAL(10,2) DEFAULT 0,
    actual_hours DECIMAL(10,2) DEFAULT 0,
    baseline_cost DECIMAL(12,2) DEFAULT 0,
    actual_cost DECIMAL(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(50) PRIMARY KEY,
    project_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    customer_id VARCHAR(50) REFERENCES customers(id),
    site_id VARCHAR(50) REFERENCES sites(id),
    unit_id VARCHAR(50) REFERENCES units(id),
    employee_id VARCHAR(50) REFERENCES employees(id),
    billable_type VARCHAR(50),
    methodology VARCHAR(100),
    manager VARCHAR(255),
    status VARCHAR(50),
    baseline_start_date DATE,
    baseline_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    percent_complete INTEGER DEFAULT 0,
    baseline_hours DECIMAL(10,2) DEFAULT 0,
    actual_hours DECIMAL(10,2) DEFAULT 0,
    baseline_cost DECIMAL(12,2) DEFAULT 0,
    actual_cost DECIMAL(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Subprojects
CREATE TABLE IF NOT EXISTS subprojects (
    id VARCHAR(50) PRIMARY KEY,
    subproject_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    project_id VARCHAR(50) REFERENCES projects(id),
    employee_id VARCHAR(50) REFERENCES employees(id),
    baseline_start_date DATE,
    baseline_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    percent_complete INTEGER DEFAULT 0,
    baseline_hours DECIMAL(10,2) DEFAULT 0,
    actual_hours DECIMAL(10,2) DEFAULT 0,
    baseline_cost DECIMAL(12,2) DEFAULT 0,
    actual_cost DECIMAL(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Phases
CREATE TABLE IF NOT EXISTS phases (
    id VARCHAR(50) PRIMARY KEY,
    phase_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    project_id VARCHAR(50) REFERENCES projects(id),
    employee_id VARCHAR(50) REFERENCES employees(id),
    methodology VARCHAR(100),
    sequence INTEGER,
    baseline_start_date DATE,
    baseline_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    percent_complete INTEGER DEFAULT 0,
    baseline_hours DECIMAL(10,2) DEFAULT 0,
    actual_hours DECIMAL(10,2) DEFAULT 0,
    baseline_cost DECIMAL(12,2) DEFAULT 0,
    actual_cost DECIMAL(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(50) PRIMARY KEY,
    task_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phase_id VARCHAR(50) REFERENCES phases(id),
    employee_id VARCHAR(50) REFERENCES employees(id),
    description TEXT,
    baseline_start_date DATE,
    baseline_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    percent_complete INTEGER DEFAULT 0,
    baseline_hours DECIMAL(10,2) DEFAULT 0,
    actual_hours DECIMAL(10,2) DEFAULT 0,
    baseline_cost DECIMAL(12,2) DEFAULT 0,
    actual_cost DECIMAL(12,2) DEFAULT 0,
    predecessor_id VARCHAR(50),
    predecessor_relationship VARCHAR(10),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Subtasks
CREATE TABLE IF NOT EXISTS subtasks (
    id VARCHAR(50) PRIMARY KEY,
    subtask_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    task_id VARCHAR(50) REFERENCES tasks(id),
    employee_id VARCHAR(50) REFERENCES employees(id),
    description TEXT,
    baseline_start_date DATE,
    baseline_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    percent_complete INTEGER DEFAULT 0,
    baseline_hours DECIMAL(10,2) DEFAULT 0,
    actual_hours DECIMAL(10,2) DEFAULT 0,
    baseline_cost DECIMAL(12,2) DEFAULT 0,
    actual_cost DECIMAL(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Hours/Time Entries
CREATE TABLE IF NOT EXISTS hours (
    id VARCHAR(50) PRIMARY KEY,
    hour_id VARCHAR(50) NOT NULL,
    employee_id VARCHAR(50) REFERENCES employees(id),
    task_id VARCHAR(50) REFERENCES tasks(id),
    charge_code_id VARCHAR(50) REFERENCES charge_codes(id),
    date DATE NOT NULL,
    hours DECIMAL(5,2) NOT NULL,
    description TEXT,
    is_billable BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Milestones
CREATE TABLE IF NOT EXISTS milestones (
    id VARCHAR(50) PRIMARY KEY,
    milestone_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    project_id VARCHAR(50) REFERENCES projects(id),
    due_date DATE,
    status VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Deliverables
CREATE TABLE IF NOT EXISTS deliverables (
    id VARCHAR(50) PRIMARY KEY,
    deliverable_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    project_id VARCHAR(50) REFERENCES projects(id),
    type VARCHAR(100),
    status VARCHAR(50),
    due_date DATE,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Deliverables Tracker
CREATE TABLE IF NOT EXISTS deliverables_tracker (
    id VARCHAR(50) PRIMARY KEY,
    deliverable_id VARCHAR(50) REFERENCES deliverables(id),
    status VARCHAR(50),
    updated_by VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- QC Tasks
CREATE TABLE IF NOT EXISTS qctasks (
    id VARCHAR(50) PRIMARY KEY,
    qctask_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    project_id VARCHAR(50) REFERENCES projects(id),
    task_id VARCHAR(50) REFERENCES tasks(id),
    gate VARCHAR(50),
    status VARCHAR(50),
    hours DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Project Health
CREATE TABLE IF NOT EXISTS project_health (
    id VARCHAR(50) PRIMARY KEY,
    project_id VARCHAR(50) REFERENCES projects(id),
    health_score INTEGER,
    status VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Change Log
CREATE TABLE IF NOT EXISTS changelog (
    id VARCHAR(50) PRIMARY KEY,
    entity_type VARCHAR(50),
    entity_id VARCHAR(50),
    field_name VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    changed_by VARCHAR(255),
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
CREATE INDEX IF NOT EXISTS idx_portfolios_manager ON portfolios(manager);
CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_site ON projects(site_id);
CREATE INDEX IF NOT EXISTS idx_hours_employee ON hours(employee_id);
CREATE INDEX IF NOT EXISTS idx_hours_date ON hours(date);
CREATE INDEX IF NOT EXISTS idx_tasks_phase ON tasks(phase_id);
