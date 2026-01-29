// Final Workday Ledger Sync - Chunked Processing with Client-Side Date Filtering
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
    console.log('[workday-ledger] === Final Chunked Function Started ===');

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

        // Standard Workday parameters (no date filtering)
        const params = new URLSearchParams({
            'Period!WID': '0173f15bcb0d01dfd622619c6f126741!0173f15bcb0d015364f9609c6f126641!0173f15bcb0d010e83c5609c6f126541!0173f15bcb0d010e83c5609c6f126541',
            'Year!WID': '8114d1e7d6281001762a5f549ec90000',
            'Account_Translation_Rule_Set!WID': '8114d1e7d62810019858496633a80000',
            'Translation_Currency!WID': '9e996ffdd3e14da0ba7275d5400bafd4',
            'Company!WID': '572a282fa6cc01c7b986b251bc0d853f',
            'Journal_Entry_Status!WID': '6f8e52d2376e4c899463020db034c87c',
            'Include_Beginning_Balance': '0',
            'format': 'json'
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
        const allRecords = data.Report_Entry || [];
        console.log(`[workday-ledger] Fetched ${allRecords.length} total ledger records`);

        // Client-side date filtering - only last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const records = allRecords.filter(r => {
            const accountingDate = r.Accounting_Date;
            if (!accountingDate) return false;
            
            const dateObj = new Date(accountingDate);
            return dateObj >= thirtyDaysAgo;
        });
        
        console.log(`[workday-ledger] Filtered to ${records.length} records (last 30 days)`);

        // Process in very small chunks
        const CHUNK_SIZE = 20; // Very small chunks
        const totalChunks = Math.ceil(records.length / CHUNK_SIZE);
        let processedCount = 0;
        let errorCount = 0;
        
        console.log(`[workday-ledger] Processing ${totalChunks} chunks of ${CHUNK_SIZE} records each`);

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const startIndex = chunkIndex * CHUNK_SIZE;
            const endIndex = Math.min(startIndex + CHUNK_SIZE, records.length);
            const chunkRecords = records.slice(startIndex, endIndex);
            
            console.log(`[workday-ledger] Chunk ${chunkIndex + 1}/${totalChunks}: Processing ${chunkRecords.length} records`);
            
            const chunkTransactions = [];
            
            for (const r of chunkRecords) {
                // Minimal essential filtering
                const projectName = safeString(r.Project);
                const projectId = cleanProjectId(projectName);
                
                if (!projectId) continue;

                const ledgerAccountId = safeString(r.Ledger_Account_ID);
                if (!ledgerAccountId.match(/^[67]\d{4}$/)) continue;

                const debitAmount = parseFloat(r.Debit_Amount || '0');
                const creditAmount = parseFloat(r.Credit_Amount || '0');
                const netAmount = debitAmount - creditAmount;
                
                if (netAmount === 0) continue;

                if (projectName.includes('(Inactive)')) continue;

                const transactionId = `${safeString(r.Invoice_Number)}-${safeString(r.Accounting_Date)}-${ledgerAccountId}-${Math.random().toString(36).substr(2, 9)}`;

                chunkTransactions.push({
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

            if (chunkTransactions.length > 0) {
                try {
                    // Process one by one to minimize memory
                    for (const transaction of chunkTransactions) {
                        const { data, error } = await supabase
                            .from('cost_actuals')
                            .upsert(transaction, { onConflict: 'id' })
                            .select();
                        
                        if (error) {
                            console.error(`[workday-ledger] Transaction error:`, error);
                            errorCount++;
                        } else {
                            processedCount++;
                        }
                        
                        // Memory cooldown
                        await sleep(50); // 50ms between records
                    }
                    
                    console.log(`[workday-ledger] Chunk ${chunkIndex + 1} completed: ${chunkTransactions.length} transactions`);
                    
                    // Extended cooldown between chunks
                    if (chunkIndex < totalChunks - 1) {
                        console.log(`[workday-ledger] Extended cooldown...`);
                        await sleep(1000); // 1 second between chunks
                    }
                    
                } catch (error) {
                    console.error(`[workday-ledger] Chunk ${chunkIndex + 1} failed:`, error);
                    errorCount++;
                }
            }
        }

        console.log(`[workday-ledger] Processing complete. Total processed: ${processedCount}, Errors: ${errorCount}`);

        return new Response(
            JSON.stringify({
                success: true,
                stats: {
                    total_fetched: allRecords.length,
                    date_filtered: records.length,
                    processed: processedCount,
                    errors: errorCount,
                    chunks: totalChunks,
                    chunk_size: CHUNK_SIZE,
                    date_range: `Last 30 days`
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
