'use client';

/**
 * ChartCard – Wrapper for chart visuals with header and Compare slot.
 * ChartWrapper registers its action buttons via context; they render in the header.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type SetHeaderActions = (node: ReactNode) => void;

const ChartHeaderActionsContext = createContext<SetHeaderActions | null>(null);

export function useChartHeaderActions() {
  return useContext(ChartHeaderActionsContext);
}

interface ChartCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  gridClass?: string;
  className?: string;
  style?: React.CSSProperties;
  noPadding?: boolean;
  children: ReactNode;
}

export default function ChartCard({
  title,
  subtitle,
  gridClass = 'grid-full',
  className = '',
  style,
  noPadding = false,
  children,
}: ChartCardProps) {
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);
  const setActions = useCallback((node: ReactNode) => setHeaderActions(node), []);

  return (
    <div className={`chart-card ${gridClass} ${className}`} style={style}>
      <div
        className="chart-card-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}
      >
        <div>
          {typeof title === 'string' ? (
            <h3 className="chart-card-title">{title}</h3>
          ) : (
            title
          )}
          {subtitle && (
            <span className="chart-card-subtitle" style={{ marginLeft: 8 }}>{subtitle}</span>
          )}
        </div>
        <div className="chart-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {headerActions}
        </div>
      </div>
      <div className={`chart-card-body ${noPadding ? 'no-padding' : ''}`}>
        <ChartHeaderActionsContext.Provider value={setActions}>
          {children}
        </ChartHeaderActionsContext.Provider>
      </div>
    </div>
  );
}
