#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}
const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const supabase = createClient(url, key, { auth: { persistSession: false } });

let n = 0;
while (true) {
  const { data, error: e1 } = await supabase.from('employees').select('id').limit(500);
  if (e1) throw new Error(e1.message);
  if (!data?.length) break;
  const ids = data.map((r) => r.id);
  const { error: e2 } = await supabase.from('employees').delete().in('id', ids);
  if (e2) throw new Error(e2.message);
  n += ids.length;
}
console.log('Supabase employees deleted:', n);
