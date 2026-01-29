// Create project mappings table
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    console.log('[create-mappings] === Creating Project Mappings Table ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Create the table using raw SQL
        const { error: tableError } = await supabase.rpc('exec_sql', {
            sql: `
                CREATE TABLE IF NOT EXISTS project_mappings (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    mpp_project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    workday_project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(mpp_project_id, workday_project_id)
                );
                CREATE INDEX IF NOT EXISTS idx_project_mappings_mpp ON project_mappings(mpp_project_id);
                CREATE INDEX IF NOT EXISTS idx_project_mappings_workday ON project_mappings(workday_project_id);
            `
        });

        if (tableError) {
            console.log('[create-mappings] Table creation error, trying direct approach:', tableError);
            
            // Try direct table creation via REST API
            const { data, error } = await supabase
                .from('project_mappings')
                .select('*')
                .limit(1);
            
            if (error && error.code === 'PGRST205') {
                // Table doesn't exist, we need to create it via SQL
                return new Response(
                    JSON.stringify({ 
                        success: false, 
                        error: 'Table does not exist and cannot be created via REST API. Please run SQL manually.',
                        sql: `
                            CREATE TABLE IF NOT EXISTS project_mappings (
                                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                mpp_project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                                workday_project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                                is_active BOOLEAN DEFAULT true,
                                created_at TIMESTAMPTZ DEFAULT NOW(),
                                updated_at TIMESTAMPTZ DEFAULT NOW(),
                                UNIQUE(mpp_project_id, workday_project_id)
                            );
                            CREATE INDEX IF NOT EXISTS idx_project_mappings_mpp ON project_mappings(mpp_project_id);
                            CREATE INDEX IF NOT EXISTS idx_project_mappings_workday ON project_mappings(workday_project_id);
                        `
                    }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        return new Response(
            JSON.stringify({ success: true, message: 'Project mappings table created successfully' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[create-mappings] Fatal Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
