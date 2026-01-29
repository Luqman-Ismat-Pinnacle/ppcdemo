// Workday General Ledger Sync with Date Range Limiting (Option 1)
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const REPORT_BASE_URL = 'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Pinnacle_General_Ledger';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const safeString = (val: any): string => (val || '').toString().trim();
const cleanProjectId = (rawId: string): string => {
    if (!rawId) return '';
    const match = rawId.match(/^(\d+)/);
    return match ? match[1] : rawId.split('-')[0].trim().substring(0, 50);
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
    console.log('[workday-ledger] === Date-Limited Function Started ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const workdayUser = Deno.env.get('WORKDAY_ISU_USER');
        const workdayPass = Deno.env.get('WORKDAY_ISU_PASS');

        if (!workdayUser || !workdayPass) {
            throw new Error('Workday credentials missing');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Date Range Limiting - Only get last 30 days of data
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateFilter = thirtyDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD format

        console.log(`[workday-ledger] Filtering to data since: ${dateFilter}`);

        // Use Workday date filtering parameters
        const params = new URLSearchParams({
            'Period!WID': '0173f15bcb0d01dfd622619c6f126741!0173f15bcb0d015364f9609c6f126641!0173f15bcb0d010e83c5609c6f126541!0173f15bcb0d010e83c5609c6f126541',
            'Year!WID': '8114d1e7d6281001762a5f549ec90000',
            'Account_Translation_Rule_Set!WID': '8114d1e7d62810019858496633a80000',
            'Translation_Currency!WID': '9e996ffdd3e14da0ba7275d5400bafd4',
            'Company!WID': '572a282fa6cc01c7b986b251bc0d853f',
            'Journal_Entry_Status!WID': '6f8e52d2376e4c899463020db034c87c',
            'Include_Beginning_Balance': '0',
            'format': 'json',
            // Add date filtering if Workday supports it
            'From_Date': dateFilter,
            'To_Date': new Date().toISOString().split('T')[0]
        });

        const fullUrl = `${REPORT_BASE_URL}?${params.toString()}`;
        console.log(`[workday-ledger] Fetching URL: ${fullUrl}`);

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
        console.log(`[workday-ledger] Fetched ${records.length} ledger records (last 30 days)`);

        // Process with smaller batches since we have less data
        const BATCH_SIZE = 100;
        const totalBatches = Math.ceil(records.length / BATCH_SIZE);
        let processedCount = 0;
        let errorCount = 0;
        let filteredCount = 0;
        
        console.log(`[workday-ledger] Processing ${totalBatches} batches of ${BATCH_SIZE} records each`);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const startIndex = batchIndex * BATCH_SIZE;
            const endIndex = Math.min(startIndex + BATCH_SIZE, records.length);
            const batchRecords = records.slice(startIndex, endIndex);
            
            console.log(`[workday-ledger] Batch ${batchIndex + 1}/${totalBatches}: Processing ${batchRecords.length} records`);
            
            const batchTransactions = [];
            
            for (const r of batchRecords) {
                // Essential filtering only
                const projectName = safeString(r.Project);
                const projectId = cleanProjectId(projectName);
                
                if (!projectId) {
                    filteredCount++;
                    continue;
                }

                const ledgerAccountId = safeString(r.Ledger_Account_ID);
                if (!ledgerAccountId.match(/^[67]\d{4}$/)) {
                    filteredCount++;
                    continue;
                }

                const debitAmount = parseFloat(r.Debit_Amount || '0');
                const creditAmount = parseFloat(r.Credit_Amount || '0');
                const netAmount = debitAmount - creditAmount;
                
                if (netAmount === 0) {
                    filteredCount++;
                    continue;
                }

                // Skip inactive projects
                if (projectName.includes('(Inactive)')) {
                    filteredCount++;
                    continue;
                }

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

            if (batchTransactions.length > 0) {
                try {
                    // Batch insert (faster since we have less data)
                    const { data, error } = await supabase
                        .from('cost_actuals')
                        .upsert(batchTransactions, { onConflict: 'id' })
                        .select();
                    
                    if (error) {
                        console.error(`[workday-ledger] Batch insert error:`, error);
                        errorCount++;
                    } else {
                        processedCount += batchTransactions.length;
                        console.log(`[workday-ledger] Batch ${batchIndex + 1} completed: ${batchTransactions.length} transactions`);
                    }
                    
                    // Shorter cooldown since we have less data
                    if (batchIndex < totalBatches - 1) {
                        await sleep(200); // 200ms between batches
                    }
                    
                } catch (error) {
                    console.error(`[workday-ledger] Batch ${batchIndex + 1} failed:`, error);
                    errorCount++;
                }
            }
        }

        console.log(`[workday-ledger] Processing complete. Total processed: ${processedCount}, Errors: ${errorCount}, Filtered: ${filteredCount}`);

        return new Response(
            JSON.stringify({
                success: true,
                stats: {
                    fetched: records.length,
                    processed: processedCount,
                    errors: errorCount,
                    filtered: filteredCount,
                    batches: totalBatches,
                    date_range: `Last 30 days since ${dateFilter}`
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
