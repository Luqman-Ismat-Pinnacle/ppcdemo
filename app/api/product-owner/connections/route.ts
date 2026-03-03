import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sql = `
      SELECT id, connection_key AS "connectionKey", display_name AS "displayName",
             description, connection_type AS "connectionType", status,
             last_sync_at AS "lastSyncAt", last_success_at AS "lastSuccessAt",
             last_error AS "lastError", config_summary AS "configSummary",
             owner_email AS "ownerEmail", is_active AS "isActive",
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM integration_connections
      ORDER BY is_active DESC, display_name
    `;
    const rows = await query(sql);
    return NextResponse.json({ connections: rows, error: null });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch connections';
    return NextResponse.json({ connections: [], error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const key = (body?.connectionKey || '').trim();
    const name = (body?.displayName || '').trim();
    if (!key || !name) {
      return NextResponse.json({ connection: null, error: 'connectionKey and displayName required' }, { status: 400 });
    }

    const sql = `
      INSERT INTO integration_connections (
        connection_key, display_name, description, connection_type,
        status, owner_email, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (connection_key) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        description = EXCLUDED.description,
        connection_type = EXCLUDED.connection_type,
        owner_email = EXCLUDED.owner_email,
        updated_at = NOW()
      RETURNING id, connection_key AS "connectionKey", display_name AS "displayName",
                status, is_active AS "isActive"
    `;

    const params = [
      key, name,
      (body?.description || '').trim() || null,
      (body?.connectionType || 'database').trim(),
      (body?.status || 'unknown').trim(),
      (body?.ownerEmail || '').trim() || null,
      body?.isActive !== false,
    ];

    const rows = await query(sql, params);
    return NextResponse.json({ connection: rows[0] || null, error: null }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create connection';
    return NextResponse.json({ connection: null, error: msg }, { status: 500 });
  }
}
