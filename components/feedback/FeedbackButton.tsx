'use client';

import { useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import FeedbackModal from './FeedbackModal';

export default function FeedbackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const feedbackHref = useMemo(() => {
    if (!pathname) return '/shared/feedback';
    if (pathname.startsWith('/pca')) return '/pca/feedback';
    if (pathname.startsWith('/pcl')) return '/pcl/feedback';
    if (pathname.startsWith('/coo')) return '/coo/feedback';
    if (pathname.startsWith('/project-lead')) return '/project-lead/feedback';
    if (pathname.startsWith('/senior-manager')) return '/senior-manager/feedback';
    if (pathname.startsWith('/product-owner')) return '/product-owner/feedback';
    if (pathname.startsWith('/shared')) return '/shared/feedback';
    return '/shared/feedback';
  }, [pathname]);

  const openMenu = () => {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    setMenuOpen(true);
  };
  const scheduleCloseMenu = () => {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setMenuOpen(false), 120);
  };

  return (
    <>
      <div
        style={{ position: 'fixed', bottom: 20, left: 20, zIndex: 900 }}
        onMouseEnter={openMenu}
        onMouseLeave={scheduleCloseMenu}
      >
        {menuOpen && (
          <div
            className="glass-raised"
            style={{
              position: 'absolute',
              left: 0,
              bottom: 46,
              minWidth: 205,
              padding: '0.35rem',
              borderRadius: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              boxShadow: '0 10px 28px rgba(0,0,0,0.32)',
            }}
          >
            <button
              type="button"
              className="btn"
              style={{ justifyContent: 'flex-start', width: '100%', fontSize: '0.72rem', padding: '0.35rem 0.5rem' }}
              onClick={() => {
                setMenuOpen(false);
                router.push(feedbackHref);
              }}
            >
              issues and features
            </button>
            <button
              type="button"
              className="btn"
              style={{ justifyContent: 'flex-start', width: '100%', fontSize: '0.72rem', padding: '0.35rem 0.5rem' }}
              onClick={() => {
                setMenuOpen(false);
                setOpen(true);
              }}
            >
              log an issue / feature
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          title="Issues and features menu"
          aria-label="Open issues and features menu"
          style={{
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
            boxShadow: menuOpen ? '0 6px 24px rgba(64,224,208,0.25)' : '0 4px 20px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: menuOpen ? 'translateY(-2px)' : 'translateY(0)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>
      <FeedbackModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
