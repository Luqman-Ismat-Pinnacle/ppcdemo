/**
 * Employee Match API — matches by email against the employees table.
 * Called after Auth0 login to fetch the user's role from the employee directory.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isPostgresConfigured, query as pgQuery } from '@/lib/postgres';
import { hasGlobalViewAccess, resolveRoleForIdentity } from '@/lib/access-control';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ success: false, error: 'Email required' }, { status: 400 });
    }

    if (!isPostgresConfigured()) {
      return NextResponse.json({
        success: true,
        employee: {
          employeeId: null,
          name: null,
          email: email.trim(),
          role: resolveRoleForIdentity({ email, fallbackRole: 'User' }),
          jobTitle: '',
          department: '',
          managementLevel: '',
          canViewAll: hasGlobalViewAccess({
            email,
            role: resolveRoleForIdentity({ email, fallbackRole: 'User' }),
          }),
        },
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
          role: resolveRoleForIdentity({ email: emp.email || email, fallbackRole: emp.role || emp.job_title || 'User' }),
          jobTitle: emp.job_title || '',
          department: emp.department || '',
          managementLevel: emp.management_level || '',
          canViewAll: hasGlobalViewAccess({
            email: emp.email || email,
            role: resolveRoleForIdentity({ email: emp.email || email, fallbackRole: emp.role || emp.job_title || 'User' }),
          }),
        },
      });
    }

    return NextResponse.json({
      success: true,
      employee: {
        employeeId: null,
        name: null,
        email: email.trim(),
        role: resolveRoleForIdentity({ email, fallbackRole: 'User' }),
        jobTitle: '',
        department: '',
        managementLevel: '',
        canViewAll: hasGlobalViewAccess({
          email,
          role: resolveRoleForIdentity({ email, fallbackRole: 'User' }),
        }),
      },
      message: 'No match found',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Employee Match]', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
