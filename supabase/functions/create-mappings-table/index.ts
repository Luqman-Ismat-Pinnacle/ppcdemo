// Create project_mappings table
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    console.log('[create-mappings-table] === Creating project_mappings table ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Create the table using raw SQL
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS project_mappings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                mpp_project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
                workday_project_id VARCHAR(255) REFERENCES portfolios(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                deleted BOOLEAN DEFAULT FALSE,
                created_by VARCHAR(255),
                notes TEXT
            );

            -- Create indexes for performance
            CREATE INDEX IF NOT EXISTS idx_project_mappings_mpp_project_id ON project_mappings(mpp_project_id);
            CREATE INDEX IF NOT EXISTS idx_project_mappings_workday_project_id ON project_mappings(workday_project_id);
            CREATE INDEX IF NOT EXISTS idx_project_mappings_deleted ON project_mappings(deleted);

            -- Add RLS policies
            ALTER TABLE project_mappings ENABLE ROW LEVEL SECURITY;

            -- Policy for authenticated users to read mappings
            CREATE POLICY IF NOT EXISTS "Authenticated users can view project mappings" ON project_mappings
                FOR SELECT USING (auth.role() = 'authenticated');

            -- Policy for service role to manage mappings
            CREATE POLICY IF NOT EXISTS "Service role can manage project mappings" ON project_mappings
                FOR ALL USING (auth.role() = 'service_role');

            -- Create updated_at trigger
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ language 'plpgsql';

            CREATE TRIGGER IF NOT EXISTS update_project_mappings_updated_at 
                BEFORE UPDATE ON project_mappings 
                FOR EACH ROW 
                EXECUTE FUNCTION update_updated_at_column();
        `;

        console.log('[create-mappings-table] Executing SQL...');
        const { data, error } = await supabase.rpc('exec_sql', { sql: createTableSQL });

        if (error) {
            console.log('[create-mappings-table] RPC failed, trying direct SQL via service role...');
            // Try using the service role to execute SQL directly
            const { error: directError } = await supabase
                .from('project_mappings')
                .select('id')
                .limit(1);
            
            if (directError && directError.message.includes('does not exist')) {
                console.log('[create-mappings-table] Table does not exist, please create manually');
                return new Response(
                    JSON.stringify({ 
                        success: false, 
                        error: 'Table does not exist. Please run the SQL manually.',
                        sql: createTableSQL
                    }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        console.log('[create-mappings-table] Table created successfully');
        return new Response(
            JSON.stringify({
                success: true,
                message: 'project_mappings table created successfully'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[create-mappings-table] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
