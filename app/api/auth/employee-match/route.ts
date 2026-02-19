/**
 * Employee Match API — matches by email against the employees table.
 * Called after Auth0 login to fetch the user's role from the employee directory.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isPostgresConfigured, query as pgQuery } from '@/lib/postgres';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ success: false, error: 'Email required' }, { status: 400 });
    }

    if (!isPostgresConfigured()) {
      return NextResponse.json({
        success: true,
        employee: null,
        message: 'Database not configured',
      });
    }

    // Match by email only (case-insensitive)
    const result = await pgQuery(
      `SELECT employee_id, name, email, role, job_title, management_level, department
       FROM employees
       WHERE (is_active IS NULL OR is_active = true)
         AND LOWER(TRIM(email)) = LOWER(TRIM($1))
       LIMIT 1`,
      [email.trim()]
    );

    if (result.rows.length > 0) {
      const emp = result.rows[0];
      return NextResponse.json({
        success: true,
        employee: {
          employeeId: emp.employee_id,
          name: emp.name,
          email: emp.email,
          role: emp.role || emp.job_title || 'User',
          jobTitle: emp.job_title || '',
          department: emp.department || '',
          managementLevel: emp.management_level || '',
        },
      });
    }

    return NextResponse.json({ success: true, employee: null, message: 'No match found' });
  } catch (err: any) {
    console.error('[Employee Match]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
