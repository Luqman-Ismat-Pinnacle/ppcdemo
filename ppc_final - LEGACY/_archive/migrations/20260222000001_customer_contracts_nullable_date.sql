-- Allow nulls for Workday rows that lack Line_From_Date or project (matches app migration 2026-02-19-customer-contracts-nullable-fk-date)
ALTER TABLE customer_contracts ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE customer_contracts ALTER COLUMN line_from_date DROP NOT NULL;
