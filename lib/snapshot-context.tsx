'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type SnapshotContextValue = {
  isOpen: boolean;
  openSnapshotPopup: () => void;
  closeSnapshotPopup: () => void;
  /** Selected snapshot id for comparison (variance everywhere). */
  comparisonSnapshotId: string | null;
  setComparisonSnapshotId: (id: string | null) => void;
};

const SnapshotContext = createContext<SnapshotContextValue | null>(null);

export function SnapshotProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [comparisonSnapshotId, setComparisonSnapshotId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const s = localStorage.getItem('snapshotComparisonId');
      if (s) return s;
    }
    return null;
  });
  const openSnapshotPopup = useCallback(() => setIsOpen(true), []);
  const closeSnapshotPopup = useCallback(() => setIsOpen(false), []);

  const setComparison = useCallback((id: string | null) => {
    setComparisonSnapshotId(id);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem('snapshotComparisonId', id);
      else localStorage.removeItem('snapshotComparisonId');
    }
  }, []);

  const value: SnapshotContextValue = {
    isOpen,
    openSnapshotPopup,
    closeSnapshotPopup,
    comparisonSnapshotId,
    setComparisonSnapshotId: setComparison,
  };

  return (
    <SnapshotContext.Provider value={value}>
      {children}
    </SnapshotContext.Provider>
  );
}

export function useSnapshotPopup() {
  const ctx = useContext(SnapshotContext);
  if (!ctx) {
    return {
      isOpen: false,
      openSnapshotPopup: () => {},
      closeSnapshotPopup: () => {},
      comparisonSnapshotId: null as string | null,
      setComparisonSnapshotId: (_: string | null) => {},
    };
  }
  return ctx;
}
