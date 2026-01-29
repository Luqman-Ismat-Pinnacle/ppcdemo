// API endpoint to trigger Workday sync for hours and costs
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    console.log('[workday-sync] === Sync Started ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Trigger the hours sync
        console.log('[workday-sync] Triggering hours sync...');
        const hoursResponse = await fetch(`${supabaseUrl}/functions/v1/workday-hours`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            }
        });

        const hoursResult = await hoursResponse.json();
        console.log('[workday-sync] Hours sync result:', hoursResult);

        // Trigger the ledger sync (optional - for additional cost data)
        console.log('[workday-sync] Triggering ledger sync...');
        const ledgerResponse = await fetch(`${supabaseUrl}/functions/v1/workday-ledger`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            }
        });

        const ledgerResult = await ledgerResponse.json();
        console.log('[workday-sync] Ledger sync result:', ledgerResult);

        return new Response(
            JSON.stringify({
                success: true,
                hours: hoursResult,
                ledger: ledgerResult,
                message: 'Workday sync completed successfully'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[workday-sync] Fatal Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
