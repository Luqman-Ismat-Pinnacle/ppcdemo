import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

serve(async (req) => {
    console.log('[workday-ledger-chunked] === Chunked Processing Started ===')

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

        // 1. Process in monthly chunks instead of quarterly
        const monthlyChunks = [
            { period: '0173f15bcb0d01286fbf629c6f127041', name: 'Q1' },
            { period: '0173f15bcb0d01694c95629c6f126f41', name: 'Q2' },
            { period: '0173f15bcb0d018c3756629c6f126e41', name: 'Q3' }
        ]

        let totalProcessed = 0
        let totalErrors = 0

        for (const chunk of monthlyChunks) {
            console.log(`[workday-ledger-chunked] Processing ${chunk.name}...`)
            
            // 2. Fetch chunk with memory-safe approach
            const params = new URLSearchParams({
                'Period!WID': chunk.period,
                'Year!WID': '8114d1e7d6281001762a5f549ec90000',
                'Account_Translation_Rule_Set!WID': '8114d1e7d62810019858496633a80000',
                'Translation_Currency!WID': '9e996ffdd3e14da0ba7275d5400bafd4',
                'Company!WID': '572a282fa6cc01df318cb351bc0d883f',
                'Journal_Entry_Status!WID': '6f8e52d2376e4c899463020db034c87c',
                'Include_Beginning_Balance': '0',
                'format': 'json'
            })

            const fullUrl = `https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBi_HCM/RPT_-_Pinnacle_General_Ledger?${params.toString()}`

            const credentials = btoa(`${workdayUser}:${workdayPass}`)
            const response = await fetch(fullUrl, {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Accept': 'application/json'
                }
            })

            if (!response.ok) {
                console.error(`[workday-ledger-chunked] Chunk ${chunk.name} failed: ${response.status}`)
                totalErrors++
                continue
            }

            const data = await response.json()
            const records = data.Report_Entry || []
            console.log(`[workday-ledger-chunked] ${chunk.name}: ${records.length} records`)

            // 3. Process chunk with ultra-small batches
            const chunkProcessed = await processChunk(records, supabase, chunk.name)
            totalProcessed += chunkProcessed.processed
            totalErrors += chunkProcessed.errors

            // 4. Extended cooldown between chunks
            console.log(`[workday-ledger-chunked] Extended cooldown after ${chunk.name}...`)
            await sleep(10000) // 10 seconds between chunks
        }

        console.log(`[workday-ledger-chunked] All chunks complete. Total processed: ${totalProcessed}, Total errors: ${totalErrors}`)

        return new Response(
            JSON.stringify({
                success: true,
                stats: {
                    chunks: monthlyChunks.length,
                    totalProcessed,
                    totalErrors,
                    processingMethod: 'chunked'
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error('[workday-ledger-chunked] Error:', error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})

async function processChunk(records: any[], supabase: any, chunkName: string) {
    const ULTRA_SMALL_BATCH = 5 // Only 5 records at a time
    let processed = 0
    let errors = 0

    for (let i = 0; i < records.length; i += ULTRA_SMALL_BATCH) {
        const batch = records.slice(i, i + ULTRA_SMALL_BATCH)

        for (const r of batch) {
            try {
                const transaction = transformRecord(r)
                if (transaction) {
                    const { error } = await supabase
                        .from('cost_actuals')
                        .upsert(transaction, { onConflict: 'id' })
                    
                    if (error) {
                        errors++
                    } else {
                        processed++
                    }
                }
                
                // Cooldown after each record
                await sleep(100)
            } catch (recordError) {
                console.error(`[workday-ledger-chunked] Record error in ${chunkName}:`, recordError)
                errors++
            }
        }

        // Cooldown between ultra-small batches
        await sleep(1000)

        // Deep cleanup every 20 records
        if (i % 20 === 0) {
            console.log(`[workday-ledger-chunked] Deep cleanup in ${chunkName} at ${i} records...`)
            await sleep(3000)
        }
    }

    return { processed, errors }
}

function transformRecord(r: any) {
    const projectName = safeString(r.Project)
    const projectId = cleanProjectId(projectName)
    
    if (!projectId) return null

    const ledgerAccountId = safeString(r.Ledger_Account_ID)
    if (!ledgerAccountId.match(/^[67]\d{4}$/)) return null

    const debitAmount = parseFloat(r.Debit_Amount || '0')
    const creditAmount = parseFloat(r.Credit_Amount || '0')
    const netAmount = debitAmount - creditAmount
    
    if (netAmount === 0) return null

    const transactionId = `${safeString(r.Invoice_Number)}-${safeString(r.Accounting_Date)}-${ledgerAccountId}-${Math.random().toString(36).substr(2, 9)}`

    return {
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
    }
}

function safeString(value: any): string {
    if (value === null || value === undefined) return ''
    return String(value).trim()
}

function cleanProjectId(projectName: string): string {
    if (!projectName) return ''
    
    const patterns = [
        /PRJ-(\w+)/i,
        /(\w{3,}-\d{4,})/i,
        /([A-Z]{2,}\d{3,})/i
    ]
    
    for (const pattern of patterns) {
        const match = projectName.match(pattern)
        if (match) return match[1]
    }
    
    return projectName.replace(/[^A-Za-z0-9]/g, '').substring(0, 20)
}
