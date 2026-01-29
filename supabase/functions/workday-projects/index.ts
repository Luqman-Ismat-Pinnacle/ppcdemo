
// Workday Projects Sync Edge Function
// Optimized: Parallel Fetching, Standard IDs, Robust Mapping
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// URLs
const URL_PARENT_PHASE = 'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/mandie.burnett/RPT_-_View_Project_Plan_-_Integration_for_Parent_Phase?Include_Subordinate_Project_Hierarchies=1&Projects_and_Project_Hierarchies%21WID=6c3abbb4fb20100174cf1f0f36850000&format=json';
const URL_INTEGRATION = 'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/mandie.burnett/RPT_-_View_Project_Plan_-_Integration?Include_Subordinate_Project_Hierarchies=1&Projects_and_Project_Hierarchies%21WID=6c3abbb4fb20100174cf1f0f36850000&format=json';
const URL_FIND_PROJECTS = 'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Find_Projects_-_Pinnacle?Projects_and_Project_Hierarchies%21WID=6c3abbb4fb20100174cf1f0f36850000&Include_Subordinate_Project_Hierarchies=1&Billable=0&Capital=0&Inactive=0&Status%21WID=8114d1e7d62810016e8dbc4118e60000!8114d1e7d62810016e8dbba72b880000!758d94cc846601c5404e6ab4e2135430!8114d1e7d62810016e8dbb0d64800000!874d109880b8100105bee5e42fde0000!8114d1e7d62810016e8dbba72b880001&format=json';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    console.log('[workday-projects] === Function Started ===');

    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const workdayUser = Deno.env.get('WORKDAY_ISU_USER');
        const workdayPass = Deno.env.get('WORKDAY_ISU_PASS');
        const supabase = createClient(supabaseUrl, supabaseKey);

        if (!workdayUser || !workdayPass) throw new Error('Workday credentials missing');

        const credentials = btoa(`${workdayUser}:${workdayPass}`);
        const fetchConfig = { headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' } };

        // Helper to upsert batches
        const upsertBatch = async (table: string, items: any[]) => {
            if (items.length === 0) return;
            const BATCH_SIZE = 500;
            console.log(`[workday-projects] Upserting ${items.length} records to ${table}...`);
            for (let i = 0; i < items.length; i += BATCH_SIZE) {
                const batch = items.slice(i, i + BATCH_SIZE);
                const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
                if (error) {
                    console.error(`[workday-projects] Upsert error ${table}:`, error.message);
                    // Log fail but don't crash entire process? OR throw to fail explicitly?
                    // Throwing ensures we know it failed.
                    throw new Error(`${table} upsert failed: ${error.message}`);
                }
            }
        };

        // PARALLEL FETCH: Fetch all 3 reports simultaneously
        // SEQUENTIAL FETCH: Fetch only Master Data report (Portfolios, Customers, Sites)
        console.log('[workday-projects] Fetching Find Projects Report...');
        const resMaster = await fetch(URL_FIND_PROJECTS, fetchConfig);
        if (!resMaster.ok) throw new Error(`Failed to fetch Find Projects: ${resMaster.statusText}`);
        const dataMaster = await resMaster.json();

        console.log('[workday-projects] Master Data Fetched. Processing...');

        // --- STEP 1: PROCESSING MASTER DATA (Portfolios, Customers, Sites) ---
        const masterRecords = dataMaster.Report_Entry || [];
        const customersToUpsert = new Map();
        const sitesToUpsert = new Map();
        const portfoliosToUpsert = new Map();

        const generateId = (prefix: string, name: string) => {
            const slug = name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 30);
            return `${prefix}-${slug}`; // CHANGED to standard format "PRF-XYZ"
        };

        for (const r of masterRecords) {
            const custName = r.CF_Customer_Site_Ref_ID || r.Customer;
            const siteName = r.CF_Project_Site_Ref_ID || r.Site;
            const portfolioMgr = r.Optional_Project_Hierarchies;

            // Portfolio (PRF-)
            let portfolioId = null;
            if (portfolioMgr) {
                portfolioId = generateId('PRF', portfolioMgr);
                if (!portfoliosToUpsert.has(portfolioId)) {
                    portfoliosToUpsert.set(portfolioId, {
                        id: portfolioId,
                        portfolio_id: portfolioId,
                        name: `${portfolioMgr}'s Portfolio`,
                        manager: portfolioMgr,
                        is_active: true,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                }
            }

            // Customer (CST-)
            let custId = null;
            if (custName) {
                custId = generateId('CST', custName);
                if (!customersToUpsert.has(custId)) {
                    customersToUpsert.set(custId, {
                        id: custId,
                        customer_id: custId,
                        name: custName,
                        portfolio_id: portfolioId,
                        is_active: true,
                        updated_at: new Date().toISOString()
                    });
                }
            }

            // Site (STE-)
            let siteId = null;
            if (siteName) {
                siteId = generateId('STE', siteName);
                if (!sitesToUpsert.has(siteId)) {
                    sitesToUpsert.set(siteId, {
                        id: siteId,
                        site_id: siteId,
                        name: siteName,
                        customer_id: custId,
                        location: r.Location,
                        is_active: true,
                        updated_at: new Date().toISOString()
                    });
                }
            }
        }

        // --- STEP 2: PROCESSING INTEGRATION METADATA (Skipped - Only Portfolios, Customers, Sites) ---
        // Integration metadata processing removed as requested
        // Only syncing top-level entities from Master Data.

        // --- STEP 3: HIERARCHY (Skipped - Sync Only Portfolios, Customers, Sites) ---
        // const hierarchyRecords = dataHier.Report_Entry || [];
        // Loop removed as requested. Only syncing top-level entities from Master Data.

        // --- STEP 4: BATCH UPSERTS ---
        // Order: Portfolios -> Customers -> Sites
        console.log('[workday-projects] Upserting Hierarchies (Portfolios, Customers, Sites)...');
        if (portfoliosToUpsert.size > 0) await upsertBatch('portfolios', Array.from(portfoliosToUpsert.values()));
        if (customersToUpsert.size > 0) await upsertBatch('customers', Array.from(customersToUpsert.values()));
        if (sitesToUpsert.size > 0) await upsertBatch('sites', Array.from(sitesToUpsert.values()));

        return new Response(
            JSON.stringify({
                success: true,
                portfolios: Array.from(portfoliosToUpsert.values()),
                customers: Array.from(customersToUpsert.values()),
                sites: Array.from(sitesToUpsert.values()),
                summary: {
                    portfolios: portfoliosToUpsert.size,
                    customers: customersToUpsert.size,
                    sites: sitesToUpsert.size
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[workday-projects] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
