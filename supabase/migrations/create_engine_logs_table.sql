-- Create a table for storing engine execution logs
create table if not exists public.engine_logs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  execution_time_ms float,
  project_duration_days float,
  critical_path_count integer,
  logs text[] not null,
  user_id uuid references auth.users(id) on delete set null
);

-- Enable RLS
alter table public.engine_logs enable row level security;

-- Policies
create policy "Enable read access for authenticated users"
  on public.engine_logs for select
  to authenticated
  using (true);

create policy "Enable insert access for authenticated users"
  on public.engine_logs for insert
  to authenticated
  with check (true);
