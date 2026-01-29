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

        // 2. Prepare URL & Date Range
        // Get current period data (can be made configurable)
        const params = new URLSearchParams({
            'Period!WID': '0173f15bcb0d01dfd622619c6f126741!0173f15bcb0d015364f9609c6f126641!0173f15bcb0d010e83c5609c6f126541',
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

        // 4. Processing - Extract project-related cost transactions
        const costTransactions = new Map();

        for (const r of records) {
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

            costTransactions.set(transactionId, {
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
                description: `${safeString(r.Spend_Category)} - ${safeString(r.Supplier)} - ${safeString(r.Invoice_Number)}`.substring(0, 500)
            });
        }

        // 5. Store in a new cost_actuals table (or update existing)
        // For now, we'll log the data. In production, you'd want to create a cost_actuals table
        console.log(`[workday-ledger] Processed ${costTransactions.size} cost transactions`);
        
        // Sample of processed data for verification
        const sampleTransactions = Array.from(costTransactions.values()).slice(0, 5);
        console.log('[workday-ledger] Sample transactions:', JSON.stringify(sampleTransactions, null, 2));

        // 6. Return results
        return new Response(
            JSON.stringify({
                success: true,
                stats: {
                    fetched: records.length,
                    cost_transactions: costTransactions.size,
                    sample: sampleTransactions
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
