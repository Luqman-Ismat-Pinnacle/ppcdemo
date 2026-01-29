import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REPORT_BASE_URL = 'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBi_HCM/RPT_-_Pinnacle_General_Ledger'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

serve(async (req) => {
    console.log('[workday-ledger-stream] === Stream Processing Started ===')

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const workdayUser = Deno.env.get('WORKDAY_ISU_USER')
        const workdayPass = Deno.env.get('WORKDAY_ISU_PASS')

        if (!workdayUser || !workdayPass) {
            throw new Error('Workday credentials missing')
        }

        const supabase = createClient(supabaseUrl, supabaseKey)

        // 1. Fetch data with streaming approach
        const params = new URLSearchParams({
            'Period!WID': '0173f15bcb0d01286fbf629c6f127041!0173f15bcb0d01694c95629c6f126f41!0173f15bcb0d018c3756629c6f126e41',
            'Year!WID': '8114d1e7d6281001762a5f549ec90000',
            'Account_Translation_Rule_Set!WID': '8114d1e7d62810019858496633a80000',
            'Translation_Currency!WID': '9e996ffdd3e14da0ba7275d5400bafd4',
            'Company!WID': '572a282fa6cc01df318cb351bc0d883f',
            'Journal_Entry_Status!WID': '6f8e52d2376e4c899463020db034c87c',
            'Include_Beginning_Balance': '0',
            'format': 'json'
        })

        const fullUrl = `${REPORT_BASE_URL}?${params.toString()}`

        // 2. Stream fetch and process records one by one
        const credentials = btoa(`${workdayUser}:${workdayPass}`)
        const response = await fetch(fullUrl, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Accept': 'application/json'
            }
        })

        if (!response.ok) {
            throw new Error(`Workday API Error: ${response.status}`)
        }

        const data = await response.json()
        const records = data.Report_Entry || []
        console.log(`[workday-ledger-stream] Starting stream processing for ${records.length} records`)

        // 3. Process records in ultra-small batches with immediate cleanup
        const ULTRA_SMALL_BATCH = 10 // Process only 10 records at a time
        let processedCount = 0
        let errorCount = 0

        for (let i = 0; i < records.length; i += ULTRA_SMALL_BATCH) {
            const batch = records.slice(i, i + ULTRA_SMALL_BATCH)
            const batchTransactions = []

            // Process each record individually
            for (const r of batch) {
                try {
                    // Filter and transform
                    const projectName = safeString(r.Project)
                    const projectId = cleanProjectId(projectName)
                    
                    if (!projectId) continue

                    const ledgerAccountId = safeString(r.Ledger_Account_ID)
                    if (!ledgerAccountId.match(/^[67]\d{4}$/)) continue

                    const debitAmount = parseFloat(r.Debit_Amount || '0')
                    const creditAmount = parseFloat(r.Credit_Amount || '0')
                    const netAmount = debitAmount - creditAmount
                    
                    if (netAmount === 0) continue

                    const transactionId = `${safeString(r.Invoice_Number)}-${safeString(r.Accounting_Date)}-${ledgerAccountId}-${Math.random().toString(36).substr(2, 9)}`

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
                    })
                } catch (recordError) {
                    console.error(`[workday-ledger-stream] Error processing record:`, recordError)
                    errorCount++
                }
            }

            // Insert immediately and clear memory
            if (batchTransactions.length > 0) {
                try {
                    // Insert one by one for maximum memory safety
                    for (const transaction of batchTransactions) {
                        const { error } = await supabase
                            .from('cost_actuals')
                            .upsert(transaction, { onConflict: 'id' })
                        
                        if (error) {
                            console.error(`[workday-ledger-stream] Insert error:`, error)
                            errorCount++
                        } else {
                            processedCount++
                        }
                        
                        // Immediate cooldown after each insert
                        await sleep(50) // 50ms between individual records
                    }
                    
                    console.log(`[workday-ledger-stream] Batch ${Math.floor(i/ULTRA_SMALL_BATCH) + 1}: ${batchTransactions.length} records processed`)
                } catch (batchError) {
                    console.error(`[workday-ledger-stream] Batch error:`, batchError)
                    errorCount++
                }
            }

            // Extended cooldown between ultra-small batches
            console.log(`[workday-ledger-stream] Extended cooldown after batch ${Math.floor(i/ULTRA_SMALL_BATCH) + 1}...`)
            await sleep(2000) // 2 seconds between batches

            // Force memory cleanup
            if (i % (ULTRA_SMALL_BATCH * 5) === 0) { // Every 50 records
                console.log(`[workday-ledger-stream] Deep memory cleanup after ${i} records...`)
                await sleep(5000) // 5 seconds deep cleanup
            }
        }

        console.log(`[workday-ledger-stream] Stream processing complete. Processed: ${processedCount}, Errors: ${errorCount}`)

        return new Response(
            JSON.stringify({
                success: true,
                stats: {
                    totalRecords: records.length,
                    processed: processedCount,
                    errors: errorCount,
                    processingMethod: 'stream'
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error('[workday-ledger-stream] Error:', error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})

// Helper functions
function safeString(value: any): string {
    if (value === null || value === undefined) return ''
    return String(value).trim()
}

function cleanProjectId(projectName: string): string {
    if (!projectName) return ''
    
    // Extract project ID from various formats
    const patterns = [
        /PRJ-(\w+)/i,
        /(\w{3,}-\d{4,})/i,
        /([A-Z]{2,}\d{3,})/i
    ]
    
    for (const pattern of patterns) {
        const match = projectName.match(pattern)
        if (match) return match[1]
    }
    
    // Clean up the project name as fallback
    return projectName.replace(/[^A-Za-z0-9]/g, '').substring(0, 20)
}
