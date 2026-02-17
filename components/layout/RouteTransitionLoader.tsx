'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useData } from '@/lib/data-context';

const MIN_VISIBLE_MS = 180;
const MAX_VISIBLE_MS = 5000;

export default function RouteTransitionLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isLoading } = useData();

  const [visible, setVisible] = useState(false);
  const startedAtRef = useRef(0);
  const hideTimerRef = useRef<number | null>(null);
  const currentRouteRef = useRef('');

  const currentRoute = `${pathname || ''}?${searchParams?.toString() || ''}`;
  currentRouteRef.current = currentRoute;

  useEffect(() => {
    const clearHideTimer = () => {
      if (hideTimerRef.current != null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    const showLoader = () => {
      clearHideTimer();
      startedAtRef.current = Date.now();
      setVisible(true);
      hideTimerRef.current = window.setTimeout(() => {
        setVisible(false);
      }, MAX_VISIBLE_MS);
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      let next: URL;
      try {
        next = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (next.origin !== window.location.origin) return;

      const nextRoute = `${next.pathname}?${next.searchParams.toString()}`;
      if (nextRoute === currentRouteRef.current) return;

      showLoader();
    };

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);
    const patchState = (
      original: (data: unknown, unused: string, url?: string | URL | null) => void,
      onlyWhenDifferent: boolean,
    ) => {
      return (data: unknown, unused: string, url?: string | URL | null) => {
        if (url) {
          try {
            const next = new URL(String(url), window.location.href);
            const nextRoute = `${next.pathname}?${next.searchParams.toString()}`;
            if (!onlyWhenDifferent || nextRoute !== currentRouteRef.current) showLoader();
          } catch {
            // ignore invalid URL and allow original behavior
          }
        }
        return original(data, unused, url);
      };
    };

    window.history.pushState = patchState(originalPushState, true);
    window.history.replaceState = patchState(originalReplaceState, false);
    document.addEventListener('click', onClick, true);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      document.removeEventListener('click', onClick, true);
      clearHideTimer();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (isLoading) return;

    const elapsed = Date.now() - startedAtRef.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    const timer = window.setTimeout(() => setVisible(false), wait);
    return () => window.clearTimeout(timer);
  }, [visible, currentRoute, isLoading]);

  if (!visible) return null;

  return (
    <div
      aria-live="polite"
      aria-busy="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20000,
        pointerEvents: 'none',
        background: 'rgba(7, 10, 16, 0.2)',
        backdropFilter: 'blur(1px)',
        WebkitBackdropFilter: 'blur(1px)',
      }}
    >
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(0, 0, 0, 0.78)',
          border: '1px solid rgba(255,255,255,0.16)',
          borderRadius: 999,
          padding: '10px 14px',
          color: '#d1d5db',
          fontSize: '0.76rem',
          fontWeight: 600,
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: 'var(--pinnacle-teal)',
            animation: 'spin 0.75s linear infinite',
          }}
        />
        Loading
      </div>
    </div>
  );
}
