'use client';

/**
 * @fileoverview COO AI briefing chat page backed by /api/ai/query.
 */

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import AIBriefingChat from '@/components/role-workstations/AIBriefingChat';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';

export default function CooAiPage() {
  const { activeRole } = useRoleView();
  const { user } = useUser();

  return (
    <RoleWorkstationShell role="coo" title="AI Briefing" subtitle="OpenAI-backed executive briefing and Q&A from live operating data.">
      <AIBriefingChat
        roleKey={activeRole.key}
        actorEmail={user?.email || ''}
      />
    </RoleWorkstationShell>
  );
}
