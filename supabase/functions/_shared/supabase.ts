// Supabase client for edge functions (Deno compatible)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  return createClient(supabaseUrl, supabaseKey);
}
