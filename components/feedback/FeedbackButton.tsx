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
        style={{
          background: 'rgba(64,224,208,0.1)',
          border: '1px solid rgba(64,224,208,0.25)',
          color: '#40E0D0',
          borderRadius: 8,
          padding: '0.2rem 0.5rem',
          fontSize: '0.65rem',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Feedback
      </button>
      <FeedbackModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
