-- Allow customer_contracts rows without a resolved project or without Line_From_Date from Workday
ALTER TABLE customer_contracts ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE customer_contracts ALTER COLUMN line_from_date DROP NOT NULL;
