'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type SnapshotContextValue = {
  isOpen: boolean;
  openSnapshotPopup: () => void;
  closeSnapshotPopup: () => void;
};

const SnapshotContext = createContext<SnapshotContextValue | null>(null);

export function SnapshotProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const openSnapshotPopup = useCallback(() => setIsOpen(true), []);
  const closeSnapshotPopup = useCallback(() => setIsOpen(false), []);

  const value: SnapshotContextValue = {
    isOpen,
    openSnapshotPopup,
    closeSnapshotPopup,
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
    };
  }
  return ctx;
}
