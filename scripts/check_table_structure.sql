-- Test script to verify cost columns exist in hour_entries table
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'hour_entries' 
    AND table_schema = 'public'
ORDER BY ordinal_position;
