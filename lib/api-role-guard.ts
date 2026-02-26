/**
 * @fileoverview Role-aware API guard helpers.
 *
 * For backward compatibility, permissions are enforced only when role headers
 * are supplied by workstation clients.
 */

import type { NextRequest } from 'next/server';
import { normalizeRoleKey } from '@/lib/role-navigation';
import { getWorkflowPermissions } from '@/lib/workflow-permissions';
import { isProductOwnerIdentity } from '@/lib/access-control';

export interface RoleRequestContext {
  roleKey: ReturnType<typeof normalizeRoleKey> | null;
  actorEmail: string | null;
  enforce: boolean;
}

export function roleContextFromRequest(req: NextRequest): RoleRequestContext {
  const roleHeader = (req.headers.get('x-role-view') || '').trim();
  const actorEmail = (req.headers.get('x-actor-email') || '').trim().toLowerCase() || null;
  if (!roleHeader) {
    return { roleKey: null, actorEmail, enforce: false };
  }
  return {
    roleKey: normalizeRoleKey(roleHeader),
    actorEmail,
    enforce: true,
  };
}

export function hasRolePermission(
  context: RoleRequestContext,
  permission: keyof ReturnType<typeof getWorkflowPermissions>,
): boolean {
  if (!context.enforce || !context.roleKey) return true;
  if (context.actorEmail && isProductOwnerIdentity(context.actorEmail)) return true;
  const perms = getWorkflowPermissions(context.roleKey);
  return Boolean(perms[permission]);
}
