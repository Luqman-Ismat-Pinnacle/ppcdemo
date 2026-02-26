'use client';

/**
 * @fileoverview COO AI briefing chat page backed by /api/ai/query.
 */

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import WorkstationAIPanel from '@/components/ai/WorkstationAIPanel';

export default function CooAiPage() {
  return (
    <RoleWorkstationShell role="coo" requiredTier="tier2" title="AI Briefing" subtitle="OpenAI-backed executive briefing and Q&A from live operating data.">
      <WorkstationAIPanel />
    </RoleWorkstationShell>
  );
}
