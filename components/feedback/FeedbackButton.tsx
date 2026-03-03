'use client';

import { useState } from 'react';
import FeedbackModal from './FeedbackModal';

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Report issue or request feature"
        aria-label="Open feedback"
        style={{
          position: 'fixed',
          bottom: 20,
          left: 20,
          zIndex: 900,
          background: 'rgba(64,224,208,0.15)',
          border: '1px solid rgba(64,224,208,0.35)',
          color: '#40E0D0',
          borderRadius: 999,
          width: 36,
          height: 36,
          padding: 0,
          fontSize: '0.8rem',
          fontWeight: 700,
          cursor: 'pointer',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(64,224,208,0.25)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'; }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      <FeedbackModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
