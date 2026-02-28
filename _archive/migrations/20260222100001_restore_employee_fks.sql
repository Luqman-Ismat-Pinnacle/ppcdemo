-- Re-add FKs that reference employees (after employees are repopulated)
ALTER TABLE hour_entries ADD CONSTRAINT hour_entries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE portfolios ADD CONSTRAINT portfolios_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE customers ADD CONSTRAINT customers_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE sites ADD CONSTRAINT sites_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE units ADD CONSTRAINT units_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE phases ADD CONSTRAINT phases_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE tasks ADD CONSTRAINT tasks_assigned_resource_id_fkey FOREIGN KEY (assigned_resource_id) REFERENCES employees(id);
ALTER TABLE projects ADD CONSTRAINT projects_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES employees(id);
ALTER TABLE workday_phases ADD CONSTRAINT workday_phases_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id);
