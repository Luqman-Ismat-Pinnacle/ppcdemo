import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TABLES = [
  'employees', 'portfolios', 'customers', 'sites', 'projects',
  'units', 'phases', 'tasks', 'sub_tasks',
  'hour_entries', 'customer_contracts', 'project_documents',
  'sprints', 'sprint_tasks', 'notifications', 'workday_phases',
  'variance_notes', 'qc_logs',
  'intervention_items', 'epics', 'features',
  'feedback_items', 'integration_connections',
];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const table = searchParams.get('table');

    if (table === '__stats') {
      const rows = await query<{ table_name: string; row_count: string }>(
        `SELECT relname AS table_name, n_live_tup::text AS row_count
         FROM pg_stat_user_tables
         WHERE schemaname = 'public'
         ORDER BY relname`,
      );
      const countMap: Record<string, number> = {};
      rows.forEach(r => { countMap[r.table_name] = Number(r.row_count); });

      const dbSize = await query<{ size: string }>(
        `SELECT pg_size_pretty(pg_database_size(current_database())) AS size`,
      );

      const tableDetails = await query<{
        table_name: string; total_size: string; index_size: string;
      }>(
        `SELECT
           c.relname AS table_name,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
           pg_size_pretty(pg_indexes_size(c.oid)) AS index_size
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r'
         ORDER BY pg_total_relation_size(c.oid) DESC`,
      );

      const tables = TABLES.map(name => {
        const detail = tableDetails.find(d => d.table_name === name);
        return {
          name,
          rowCount: countMap[name] ?? 0,
          totalSize: detail?.total_size || '0 bytes',
          indexSize: detail?.index_size || '0 bytes',
        };
      });

      return NextResponse.json({
        success: true,
        databaseSize: dbSize[0]?.size || 'unknown',
        tableCount: TABLES.length,
        tables,
      });
    }

    if (table === '__columns') {
      const targetTable = searchParams.get('name');
      if (!targetTable || !TABLES.includes(targetTable)) {
        return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
      }
      const cols = await query<{
        column_name: string; data_type: string; is_nullable: string;
        column_default: string | null; character_maximum_length: number | null;
      }>(
        `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [targetTable],
      );
      return NextResponse.json({ success: true, table: targetTable, columns: cols });
    }

    if (table && TABLES.includes(table)) {
      const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);
      const offset = Number(searchParams.get('offset')) || 0;
      const search = searchParams.get('search') || '';

      let sql = `SELECT * FROM ${table}`;
      const params: unknown[] = [];

      if (search.trim()) {
        const cols = await query<{ column_name: string; data_type: string }>(
          `SELECT column_name, data_type FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1`,
          [table],
        );
        const textCols = cols
          .filter(c => ['text', 'character varying', 'varchar'].includes(c.data_type))
          .map(c => c.column_name);
        if (textCols.length > 0) {
          params.push(`%${search.trim()}%`);
          const conditions = textCols.map(c => `COALESCE(${c},'') ILIKE $1`).join(' OR ');
          sql += ` WHERE (${conditions})`;
        }
      }

      sql += ` ORDER BY created_at DESC NULLS LAST, id ASC`;
      params.push(limit, offset);
      sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

      const rows = await query(sql, params);

      const countSql = search.trim() && params.length > 2
        ? sql.replace(/SELECT \*/, 'SELECT count(*) as total').replace(/ORDER BY.*$/, '')
        : `SELECT count(*) as total FROM ${table}`;
      const countParams = search.trim() && params.length > 2 ? [params[0]] : [];
      const [{ total }] = await query<{ total: string }>(countSql, countParams);

      return NextResponse.json({
        success: true,
        table,
        rows,
        total: Number(total),
        limit,
        offset,
      });
    }

    return NextResponse.json({ error: 'Specify ?table=__stats, ?table=__columns&name=X, or ?table=TABLE_NAME' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
