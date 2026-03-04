/**
 * Employee Match API — matches by email against the employees table.
 * Called after Auth0 login to fetch the user's name and resolve role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { resolveRoleForIdentity } from '@/lib/access-control';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ success: false, error: 'Email required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const rows = await query<{ id: string; name: string; email: string | null; job_title: string | null }>(
        `SELECT id, name, email, job_title
         FROM employees
         WHERE (is_active IS NULL OR is_active = true)
           AND LOWER(TRIM(COALESCE(email, ''))) = $1
         LIMIT 1`,
        [normalizedEmail],
      );

      if (rows.length > 0) {
        const emp = rows[0];
        const resolvedRole = resolveRoleForIdentity({
          email: emp.email || normalizedEmail,
          fallbackRole: emp.job_title || 'PCA',
        });
        return NextResponse.json({
          success: true,
          employee: {
            employeeId: emp.id,
            name: emp.name,
            email: emp.email || normalizedEmail,
            role: resolvedRole,
            jobTitle: emp.job_title || '',
          },
        });
      }
    } catch (dbErr) {
      console.error('[Employee Match] DB error:', dbErr);
    }

    return NextResponse.json({
      success: true,
      employee: {
        employeeId: null,
        name: null,
        email: normalizedEmail,
        role: resolveRoleForIdentity({ email: normalizedEmail, fallbackRole: 'PCA' }),
        jobTitle: '',
      },
      message: 'No match found',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Employee Match]', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
