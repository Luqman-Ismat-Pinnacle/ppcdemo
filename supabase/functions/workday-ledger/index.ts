// Workday General Ledger Sync Edge Function
// Extracts cost actuals from General Ledger report
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// URL Configuration
const REPORT_BASE_URL = 'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Pinnacle_General_Ledger';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: safe string extraction
const safeString = (val: any): string => (val || '').toString().trim();

// Helper: ID cleaner (matches workday-projects logic)
const cleanProjectId = (rawId: string): string => {
    if (!rawId) return '';
    // Extract project ID from strings like "21200 ADM -24 - Columbus - API 510 External Inspection & UT (Inactive)"
    const match = rawId.match(/^(\d+)/);
    return match ? match[1] : rawId.split('-')[0].trim().substring(0, 50);
};

// Memory management helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Batch processing helper with smaller batches for memory efficiency
const processBatch = async (batch: any[], supabase: any, batchSize: number = 100) => {
    const results = [];
    
    for (let i = 0; i < batch.length; i += batchSize) {
        const chunk = batch.slice(i, i + batchSize);
        console.log(`[workday-ledger] Processing mini-batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(batch.length/batchSize)} (${chunk.length} records)`);
        
        try {
            // Insert mini-batch to database
            const { data, error } = await supabase
                .from('cost_actuals')
                .upsert(chunk, { onConflict: 'id' })
                .select();
                
            if (error) {
                console.error(`[workday-ledger] Mini-batch insert error:`, error);
                // Continue with next mini-batch even if one fails
            } else {
                console.log(`[workday-ledger] Mini-batch ${Math.floor(i/batchSize) + 1} inserted successfully`);
                results.push(...(data || []));
            }
            
            // Reduced cooldown for quarterly data
            if (i + batchSize < batch.length) {
                await sleep(100); // 100ms between mini-batches (reduced from 300ms)
            }
            
        } catch (error) {
            console.error(`[workday-ledger] Mini-batch processing error:`, error);
        }
    }
    
    return results;
};

serve(async (req) => {
    console.log('[workday-ledger] === Function Started ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // 1. Setup & Auth
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const workdayUser = Deno.env.get('WORKDAY_ISU_USER');
        const workdayPass = Deno.env.get('WORKDAY_ISU_PASS');

        if (!workdayUser || !workdayPass) {
            throw new Error('Workday credentials missing');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 2. Prepare URL & Date Range - Using quarterly dataset for smaller data volume
        // Get quarterly data instead of full year
        const params = new URLSearchParams({
            'Period!WID': '0173f15bcb0d01286fbf629c6f127041!0173f15bcb0d01694c95629c6f126f41!0173f15bcb0d018c3756629c6f126e41',
            'Year!WID': '8114d1e7d6281001762a5f549ec90000',
            'Account_Translation_Rule_Set!WID': '8114d1e7d62810019858496633a80000',
            'Translation_Currency!WID': '9e996ffdd3e14da0ba7275d5400bafd4',
            'Company!WID': '572a282fa6cc01df318cb351bc0d883f',
            'Journal_Entry_Status!WID': '6f8e52d2376e4c899463020db034c87c',
            'Include_Beginning_Balance': '0',
            'format': 'json'
        });

        const fullUrl = `${REPORT_BASE_URL}?${params.toString()}`;
        console.log(`[workday-ledger] Fetching URL: ${fullUrl}`);

        // 3. Fetch Data
        const credentials = btoa(`${workdayUser}:${workdayPass}`);
        const response = await fetch(fullUrl, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`Workday API Error: ${response.status} - ${txt}`);
        }

        const data = await response.json();
        const records = data.Report_Entry || [];
        console.log(`[workday-ledger] Fetched ${records.length} ledger records`);

        // 4. Memory-efficient processing with quarterly data - can use larger batches now
        const BATCH_SIZE = 250; // Increased batch size for quarterly data (was 100)
        const totalBatches = Math.ceil(records.length / BATCH_SIZE);
        let processedCount = 0;
        let errorCount = 0;
        
        console.log(`[workday-ledger] Processing ${totalBatches} mini-batches of ${BATCH_SIZE} records each`);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const startIndex = batchIndex * BATCH_SIZE;
            const endIndex = Math.min(startIndex + BATCH_SIZE, records.length);
            const batchRecords = records.slice(startIndex, endIndex);
            
            console.log(`[workday-ledger] Mini-batch ${batchIndex + 1}/${totalBatches}: Processing ${batchRecords.length} records (indices ${startIndex}-${endIndex - 1})`);
            
            // Process this mini-batch
            const batchTransactions = [];
            
            for (const r of batchRecords) {
                // Filter for project-related transactions
                const projectName = safeString(r.Project);
                const projectId = cleanProjectId(projectName);
                
                if (!projectId) continue;

                // Filter for cost accounts (expense accounts typically start with 6xxxx or 7xxxx)
                const ledgerAccountId = safeString(r.Ledger_Account_ID);
                if (!ledgerAccountId.match(/^[67]\d{4}$/)) continue; // Only expense accounts

                // Extract amounts
                const debitAmount = parseFloat(r.Debit_Amount || '0');
                const creditAmount = parseFloat(r.Credit_Amount || '0');
                const netAmount = debitAmount - creditAmount; // Debits increase expenses
                
                if (netAmount === 0) continue; // Skip zero-amount transactions

                // Create unique transaction ID
                const transactionId = `${safeString(r.Invoice_Number)}-${safeString(r.Accounting_Date)}-${ledgerAccountId}-${Math.random().toString(36).substr(2, 9)}`;

                batchTransactions.push({
                    id: transactionId,
                    project_id: projectId,
                    project_name: projectName,
                    accounting_date: r.Accounting_Date,
                    transaction_date: r.Transaction_Date,
                    ledger_account: safeString(r.Ledger_Account),
                    ledger_account_id: ledgerAccountId,
                    company: safeString(r.Company),
                    cost_center: safeString(r.Cost_Center),
                    supplier: safeString(r.Supplier),
                    invoice_number: safeString(r.Invoice_Number),
                    journal_source: safeString(r.Journal_Source),
                    spend_category: safeString(r.Spend_Category),
                    customer: safeString(r.Customer),
                    net_amount: netAmount,
                    debit_amount: debitAmount,
                    credit_amount: creditAmount,
                    currency: safeString(r.Ledger_Currency),
                    description: `${safeString(r.Spend_Category)} - ${safeString(r.Supplier)} - ${safeString(r.Invoice_Number)}`.substring(0, 500),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            }

            // Insert this mini-batch to database
            if (batchTransactions.length > 0) {
                try {
                    const results = await processBatch(batchTransactions, supabase, 50); // Process in 50-record chunks
                    processedCount += batchTransactions.length;
                    console.log(`[workday-ledger] Mini-batch ${batchIndex + 1} completed: ${batchTransactions.length} transactions`);
                    
                    // Aggressive memory cooldown - allow garbage collection
                    if (batchIndex < totalBatches - 1) {
                        console.log(`[workday-ledger] Memory cooldown before next mini-batch...`);
                        await sleep(500); // 500ms between mini-batches for memory management
                    }
                    
                } catch (error) {
                    console.error(`[workday-ledger] Mini-batch ${batchIndex + 1} failed:`, error);
                    errorCount++;
                }
            } else {
                console.log(`[workday-ledger] Mini-batch ${batchIndex + 1}: No valid transactions to process`);
            }
            
            // Force garbage collection periodically
            if (batchIndex % 5 === 0) {
                console.log(`[workday-ledger] Forcing garbage collection after ${batchIndex + 1} batches...`);
                // In Deno, we can't force GC directly, but the sleep helps
                await sleep(1000);
            }
        }

        console.log(`[workday-ledger] Processing complete. Total processed: ${processedCount}, Errors: ${errorCount}`);

        // 6. Return results
        return new Response(
            JSON.stringify({
                success: true,
                stats: {
                    fetched: records.length,
                    processed: processedCount,
                    errors: errorCount,
                    batches: totalBatches
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[workday-ledger] Fatal Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
