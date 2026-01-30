-- Add engine_name to engine_logs for filtering in Logs dropdown
alter table public.engine_logs
  add column if not exists engine_name text default 'CPM';

-- Allow anon to read/insert engine_logs (for app without auth; idempotent)
drop policy if exists "Allow anon read engine_logs" on public.engine_logs;
drop policy if exists "Allow anon insert engine_logs" on public.engine_logs;
create policy "Allow anon read engine_logs" on public.engine_logs for select to anon using (true);
create policy "Allow anon insert engine_logs" on public.engine_logs for insert to anon with check (true);

-- Create change_logs table for changes made across the site
create table if not exists public.change_logs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  action text not null default 'update',
  entity_type text not null default '',
  entity_id text not null default '',
  description text not null default '',
  old_value text,
  new_value text
);

-- Enable RLS
alter table public.change_logs enable row level security;

-- Policies: allow read/insert for anon and authenticated (for app without auth)
create policy "Allow read change_logs"
  on public.change_logs for select
  using (true);

create policy "Allow insert change_logs"
  on public.change_logs for insert
  with check (true);
