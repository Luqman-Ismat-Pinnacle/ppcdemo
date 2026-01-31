'use client';

/**
 * ChartCard – Wrapper for chart visuals with header and Compare slot.
 * Provides ChartHeaderActionsContext so ChartWrapper can render Compare/Export/Fullscreen in the header.
 */

import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';

const ChartHeaderActionsContext = createContext<HTMLDivElement | null>(null);

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
  const [actionsEl, setActionsEl] = useState<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className={`chart-card ${gridClass} ${className}`}
      style={style}
    >
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
        <div
          ref={(el) => { if (el) setActionsEl(el); }}
          className="chart-header-actions"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        />
      </div>
      <div className={`chart-card-body ${noPadding ? 'no-padding' : ''}`}>
        <ChartHeaderActionsContext.Provider value={actionsEl}>
          {children}
        </ChartHeaderActionsContext.Provider>
      </div>
    </div>
  );
}
