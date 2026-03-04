'use client';

/**
 * @fileoverview Shared command-center split layout.
 */

import React from 'react';

export default function WorkstationLayout({
  focus,
  aiPanel = null,
}: {
  focus: React.ReactNode;
  aiPanel?: React.ReactNode | null;
}) {
  const [mobileAiOpen, setMobileAiOpen] = React.useState(false);
  const hasAiPanel = Boolean(aiPanel);

  return (
    <div className="workstation-layout">
      <div
        className="workstation-split"
        style={{
          display: 'grid',
          gridTemplateColumns: hasAiPanel ? 'minmax(0, 1fr) 400px' : 'minmax(0, 1fr)',
          gap: 'var(--workspace-gap-md)',
          alignItems: 'start',
        }}
      >
        <section style={{ minWidth: 0 }}>{focus}</section>
        {hasAiPanel ? <div className="workstation-ai-desktop" style={{ position: 'sticky', top: 84, alignSelf: 'start' }}>{aiPanel}</div> : null}
      </div>
      {hasAiPanel ? (
        <>
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
        </>
      ) : null}
    </div>
  );
}
