'use client';

import React, { useState, useRef, useEffect } from 'react';
import { VariancePeriod, getPeriodDisplayName } from '@/lib/variance-engine';

// ============================================================================
// Types
// ============================================================================

export interface PeriodSelectorProps {
  /** Current selected period */
  value: VariancePeriod;
  /** Change handler */
  onChange: (period: VariancePeriod) => void;
  /** Available periods (defaults to all) */
  periods?: VariancePeriod[];
  /** Custom date range (for 'custom' period) */
  customRange?: { from: Date; to: Date };
  /** Custom date range change handler */
  onCustomRangeChange?: (range: { from: Date; to: Date }) => void;
  /** Component size */
  size?: 'sm' | 'md' | 'lg';
  /** Show as button group instead of dropdown */
  variant?: 'dropdown' | 'buttons';
  /** Custom className */
  className?: string;
  /** Label to show before the selector */
  label?: string;
}

// ============================================================================
// Period Config
// ============================================================================

const periodConfig: Record<VariancePeriod, { icon: string; description: string }> = {
  day: { icon: '📅', description: 'Compare to yesterday' },
  week: { icon: '📆', description: 'Compare to last week' },
  month: { icon: '🗓️', description: 'Compare to last month' },
  quarter: { icon: '📊', description: 'Compare to last quarter' },
  custom: { icon: '⚙️', description: 'Custom date range' },
};

const sizeStyles = {
  sm: { fontSize: '0.7rem', padding: '4px 8px', iconSize: '0.75rem' },
  md: { fontSize: '0.8rem', padding: '6px 12px', iconSize: '0.9rem' },
  lg: { fontSize: '0.9rem', padding: '8px 16px', iconSize: '1rem' },
};

// ============================================================================
// Component
// ============================================================================

export function PeriodSelector({
  value,
  onChange,
  periods = ['day', 'week', 'month', 'quarter', 'custom'],
  customRange,
  onCustomRangeChange,
  size = 'md',
  variant = 'dropdown',
  className = '',
  label,
}: PeriodSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const styles = sizeStyles[size];
  const currentPeriodConfig = periodConfig[value];
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowCustomPicker(false);
      }
    }
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);
  
  const handlePeriodSelect = (period: VariancePeriod) => {
    if (period === 'custom') {
      setShowCustomPicker(true);
    } else {
      onChange(period);
      setIsOpen(false);
    }
  };
  
  const handleCustomRangeApply = () => {
    onChange('custom');
    setShowCustomPicker(false);
    setIsOpen(false);
  };
  
  // Button group variant
  if (variant === 'buttons') {
    return (
      <div className={className} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {label && (
          <span style={{ 
            fontSize: styles.fontSize, 
            color: 'var(--text-muted)',
            marginRight: '8px'
          }}>
            {label}
          </span>
        )}
        <div style={{
          display: 'flex',
          background: 'var(--bg-secondary)',
          borderRadius: '8px',
          padding: '3px',
          border: '1px solid var(--border-color)',
        }}>
          {periods.filter(p => p !== 'custom').map((period) => (
            <button
              key={period}
              onClick={() => onChange(period)}
              style={{
                padding: styles.padding,
                fontSize: styles.fontSize,
                fontWeight: value === period ? 600 : 400,
                color: value === period ? 'var(--text-primary)' : 'var(--text-muted)',
                background: value === period ? 'var(--bg-card)' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {getPeriodDisplayName(period)}
            </button>
          ))}
        </div>
      </div>
    );
  }
  
  // Dropdown variant (default)
  return (
    <div 
      ref={dropdownRef} 
      className={className}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      {label && (
        <span style={{ 
          fontSize: styles.fontSize, 
          color: 'var(--text-muted)',
          marginRight: '8px'
        }}>
          {label}
        </span>
      )}
      
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: styles.padding,
          fontSize: styles.fontSize,
          fontWeight: 500,
          color: 'var(--text-primary)',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <span style={{ fontSize: styles.iconSize }}>{currentPeriodConfig.icon}</span>
        <span>vs {getPeriodDisplayName(value)}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      
      {/* Dropdown menu */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: '4px',
          minWidth: '200px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
          zIndex: 1000,
          overflow: 'hidden',
        }}>
          {!showCustomPicker ? (
            <>
              {periods.map((period) => (
                <button
                  key={period}
                  onClick={() => handlePeriodSelect(period)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    fontSize: styles.fontSize,
                    fontWeight: value === period ? 600 : 400,
                    color: value === period ? 'var(--pinnacle-teal)' : 'var(--text-primary)',
                    background: value === period ? 'rgba(64, 224, 208, 0.1)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (value !== period) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (value !== period) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <span style={{ 
                    width: '20px', 
                    textAlign: 'center',
                    fontSize: styles.iconSize 
                  }}>
                    {value === period ? '●' : periodConfig[period].icon}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div>{getPeriodDisplayName(period)}</div>
                    <div style={{ 
                      fontSize: '0.7rem', 
                      color: 'var(--text-muted)',
                      marginTop: '2px'
                    }}>
                      {periodConfig[period].description}
                    </div>
                  </div>
                </button>
              ))}
            </>
          ) : (
            /* Custom date picker */
            <div style={{ padding: '14px' }}>
              <div style={{ 
                fontSize: '0.8rem', 
                fontWeight: 600, 
                marginBottom: '12px' 
              }}>
                Custom Date Range
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.7rem', 
                  color: 'var(--text-muted)',
                  marginBottom: '4px'
                }}>
                  From
                </label>
                <input
                  type="date"
                  value={customRange?.from.toISOString().split('T')[0] || ''}
                  onChange={(e) => {
                    if (onCustomRangeChange && customRange) {
                      onCustomRangeChange({
                        ...customRange,
                        from: new Date(e.target.value)
                      });
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '0.8rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              
              <div style={{ marginBottom: '14px' }}>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.7rem', 
                  color: 'var(--text-muted)',
                  marginBottom: '4px'
                }}>
                  To
                </label>
                <input
                  type="date"
                  value={customRange?.to.toISOString().split('T')[0] || ''}
                  onChange={(e) => {
                    if (onCustomRangeChange && customRange) {
                      onCustomRangeChange({
                        ...customRange,
                        to: new Date(e.target.value)
                      });
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '0.8rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setShowCustomPicker(false)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCustomRangeApply}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'white',
                    background: 'var(--pinnacle-teal)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Compact Period Pills
// ============================================================================

export function PeriodPills({
  value,
  onChange,
  periods = ['week', 'month', 'quarter'],
  size = 'sm',
  className = '',
}: Omit<PeriodSelectorProps, 'variant' | 'customRange' | 'onCustomRangeChange'>) {
  const styles = sizeStyles[size];
  
  return (
    <div className={className} style={{ display: 'flex', gap: '6px' }}>
      {periods.map((period) => (
        <button
          key={period}
          onClick={() => onChange(period)}
          style={{
            padding: styles.padding,
            fontSize: styles.fontSize,
            fontWeight: 500,
            color: value === period ? 'var(--pinnacle-teal)' : 'var(--text-muted)',
            background: value === period ? 'rgba(64, 224, 208, 0.15)' : 'transparent',
            border: `1px solid ${value === period ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
            borderRadius: '20px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
          }}
        >
          {getPeriodDisplayName(period)}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export default PeriodSelector;
