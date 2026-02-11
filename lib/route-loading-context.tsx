'use client';

/**
 * Route loading context: shows a loading state when navigating between pages
 * so that the loader appears on every navigation, not only on first load.
 * - When pathname changes, routeChanging is set true.
 * - When a page mounts, it calls setRouteReady() to set routeChanging false.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';

type RouteLoadingContextType = {
  routeChanging: boolean;
  setRouteReady: () => void;
};

const RouteLoadingContext = createContext<RouteLoadingContextType | undefined>(undefined);

export function RouteLoadingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [routeChanging, setRouteChanging] = useState(false);

  useEffect(() => {
    setRouteChanging(true);
  }, [pathname]);

  const setRouteReady = useCallback(() => {
    setRouteChanging(false);
  }, []);

  return (
    <RouteLoadingContext.Provider value={{ routeChanging, setRouteReady }}>
      {children}
    </RouteLoadingContext.Provider>
  );
}

export function useRouteLoading(): RouteLoadingContextType {
  const ctx = useContext(RouteLoadingContext);
  if (ctx === undefined) {
    return {
      routeChanging: false,
      setRouteReady: () => {},
    };
  }
  return ctx;
}
