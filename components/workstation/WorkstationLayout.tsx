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
  const [mobileAiOpen, setMobileAiOpen] = React.useState(false);

  return (
    <div className="workstation-layout">
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
        <div className="workstation-ai-desktop" style={{ position: 'sticky', top: 84, alignSelf: 'start' }}>{aiPanel}</div>
      </div>
      <button
        type="button"
        className="workstation-ai-mobile-toggle"
        onClick={() => setMobileAiOpen((value) => !value)}
        aria-expanded={mobileAiOpen}
      >
        {mobileAiOpen ? 'Hide AI Copilot' : 'Open AI Copilot'}
      </button>
      <div className={`workstation-ai-mobile-sheet ${mobileAiOpen ? 'open' : ''}`}>
        {aiPanel}
      </div>
    </div>
  );
}
