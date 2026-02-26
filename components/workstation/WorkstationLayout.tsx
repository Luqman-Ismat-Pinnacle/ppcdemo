'use client';

/**
 * @fileoverview Shared command-center split layout.
 */

import React from 'react';
import WorkstationAIPanel from '@/components/ai/WorkstationAIPanel';

export default function WorkstationLayout({
  focus,
  aiPanel = <WorkstationAIPanel />,
}: {
  focus: React.ReactNode;
  aiPanel?: React.ReactNode;
}) {
  return (
    <div
      className="workstation-split"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.55fr) minmax(300px, 1fr)',
        gap: '0.8rem',
        alignItems: 'start',
      }}
    >
      <section style={{ minWidth: 0 }}>{focus}</section>
      <div style={{ position: 'sticky', top: 84, alignSelf: 'start' }}>{aiPanel}</div>
    </div>
  );
}
