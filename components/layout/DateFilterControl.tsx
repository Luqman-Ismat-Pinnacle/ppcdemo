'use client';

/**
 * @fileoverview Enhanced Date Filter Control Component for PPC V3.
 * 
 * Provides comprehensive date filtering with multiple options:
 * - Preset ranges (week, month, quarter, YTD, year, all time)
 * - Last N days (7, 14, 30, 60, 90)
 * - Fiscal periods (Q1-Q4)
 * - Rolling periods (last 3 months, 6 months)
 * - Custom date range picker
 * 
 * Features:
 * - Grouped dropdown sections
 * - Custom date range with DatePicker integration
 * - Integration with DataContext for global date filter state
 * - Active selection highlighting
 * - Click-outside-to-close behavior
 * 
 * @module components/layout/DateFilterControl
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useData } from '@/lib/data-context';
import type { DateFilter } from '@/types/data';

/**
 * Filter option group with category
 */
interface FilterOption {
  label: string;
  value: DateFilter['type'];
  category: 'standard' | 'last_n' | 'fiscal' | 'rolling' | 'custom';
  days?: number;
  quarter?: number;
  months?: number;
}

/**
 * All available date filter options organized by category
 */
const DATE_OPTIONS: FilterOption[] = [
  // Standard presets
  { label: 'All Time', value: 'all', category: 'standard' },
  { label: 'This Week', value: 'week', category: 'standard' },
  { label: 'This Month', value: 'month', category: 'standard' },
  { label: 'This Quarter', value: 'quarter', category: 'standard' },
  { label: 'YTD', value: 'ytd', category: 'standard' },
  { label: 'This Year', value: 'year', category: 'standard' },
  // Last N days
  { label: 'Last 7 Days', value: 'custom', category: 'last_n', days: 7 },
  { label: 'Last 14 Days', value: 'custom', category: 'last_n', days: 14 },
  { label: 'Last 30 Days', value: 'custom', category: 'last_n', days: 30 },
  { label: 'Last 60 Days', value: 'custom', category: 'last_n', days: 60 },
  { label: 'Last 90 Days', value: 'custom', category: 'last_n', days: 90 },
  // Fiscal quarters (assuming calendar year)
  { label: 'Q1 (Jan-Mar)', value: 'custom', category: 'fiscal', quarter: 1 },
  { label: 'Q2 (Apr-Jun)', value: 'custom', category: 'fiscal', quarter: 2 },
  { label: 'Q3 (Jul-Sep)', value: 'custom', category: 'fiscal', quarter: 3 },
  { label: 'Q4 (Oct-Dec)', value: 'custom', category: 'fiscal', quarter: 4 },
  // Rolling periods
  { label: 'Rolling 3 Months', value: 'custom', category: 'rolling', months: 3 },
  { label: 'Rolling 6 Months', value: 'custom', category: 'rolling', months: 6 },
  { label: 'Rolling 12 Months', value: 'custom', category: 'rolling', months: 12 },
  // Custom range
  { label: 'Custom Range...', value: 'custom', category: 'custom' },
];

/**
 * Calculate date range for a filter option
 */
function getDateRange(option: FilterOption): { from: string; to: string } {
  const today = new Date();
  let from: Date;
  let to: Date = today;
  
  if (option.days) {
    // Last N days
    from = new Date(today);
    from.setDate(from.getDate() - option.days);
  } else if (option.quarter) {
    // Fiscal quarter
    const year = today.getFullYear();
    const quarterStartMonth = (option.quarter - 1) * 3;
    from = new Date(year, quarterStartMonth, 1);
    to = new Date(year, quarterStartMonth + 3, 0);
  } else if (option.months) {
    // Rolling months
    from = new Date(today);
    from.setMonth(from.getMonth() - option.months);
  } else {
    // Default to all time
    from = new Date(2020, 0, 1);
    to = new Date(2030, 11, 31);
  }
  
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

export default function DateFilterControl() {
  const { dateFilter, setDateFilter } = useData();
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('standard');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentType = dateFilter?.type || 'all';
  
  // Get display label based on current filter
  const currentLabel = useMemo(() => {
    if (dateFilter?.type === 'custom' && dateFilter.from && dateFilter.to) {
      // Check if it matches a predefined option
      for (const opt of DATE_OPTIONS) {
        if (opt.category !== 'standard' && opt.category !== 'custom') {
          const range = getDateRange(opt);
          if (range.from === dateFilter.from && range.to === dateFilter.to) {
            return opt.label;
          }
        }
      }
      // Show date range
      const from = new Date(dateFilter.from);
      const to = new Date(dateFilter.to);
      return `${from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    const opt = DATE_OPTIONS.find(o => o.value === currentType && o.category === 'standard');
    return opt?.label || 'All Time';
  }, [dateFilter, currentType]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFilterChange = (option: FilterOption) => {
    if (option.category === 'standard') {
      setDateFilter({ type: option.value });
      setIsOpen(false);
    } else if (option.category === 'custom' && !option.days && !option.quarter && !option.months) {
      // Open custom date picker
      setActiveCategory('custom');
    } else {
      // Calculate date range
      const range = getDateRange(option);
      setDateFilter({ type: 'custom', from: range.from, to: range.to });
      setIsOpen(false);
    }
  };

  const handleCustomRangeApply = () => {
    if (customFrom && customTo) {
      setDateFilter({ type: 'custom', from: customFrom, to: customTo });
      setIsOpen(false);
    }
  };

  // Group options by category
  const optionsByCategory = useMemo(() => {
    return {
      standard: DATE_OPTIONS.filter(o => o.category === 'standard'),
      last_n: DATE_OPTIONS.filter(o => o.category === 'last_n'),
      fiscal: DATE_OPTIONS.filter(o => o.category === 'fiscal'),
      rolling: DATE_OPTIONS.filter(o => o.category === 'rolling'),
      custom: DATE_OPTIONS.filter(o => o.category === 'custom'),
    };
  }, []);

  const categories = [
    { key: 'standard', label: 'Standard' },
    { key: 'last_n', label: 'Last N Days' },
    { key: 'fiscal', label: 'Fiscal' },
    { key: 'rolling', label: 'Rolling' },
  ];

  return (
    <div ref={dropdownRef} className="nav-dropdown">
      <button
        className="global-filter-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <span>{currentLabel}</span>
        <svg viewBox="0 0 12 12" width="10" height="10" style={{ marginLeft: 'auto' }}>
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="filter-dropdown" style={{ 
          minWidth: '320px', 
          right: 0, 
          left: 'auto',
          maxHeight: '450px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Category Tabs */}
          <div style={{ 
            display: 'flex', 
            borderBottom: '1px solid var(--border-color)',
            padding: '8px 8px 0 8px',
            gap: '4px',
            flexWrap: 'wrap'
          }}>
            {categories.map(cat => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                style={{
                  padding: '6px 10px',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  background: activeCategory === cat.key ? 'var(--pinnacle-teal)' : 'transparent',
                  color: activeCategory === cat.key ? '#000' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '4px 4px 0 0',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {cat.label}
              </button>
            ))}
            <button
              onClick={() => setActiveCategory('custom')}
              style={{
                padding: '6px 10px',
                fontSize: '0.65rem',
                fontWeight: 600,
                background: activeCategory === 'custom' ? 'var(--pinnacle-teal)' : 'transparent',
                color: activeCategory === 'custom' ? '#000' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '4px 4px 0 0',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              Custom
            </button>
          </div>

          {/* Options List */}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
            {activeCategory !== 'custom' && (
              optionsByCategory[activeCategory as keyof typeof optionsByCategory]?.map((opt, idx) => (
                <button
                  key={`${opt.value}-${idx}`}
                  onClick={() => handleFilterChange(opt)}
                  className={`dropdown-item ${
                    (opt.category === 'standard' && currentType === opt.value) ? 'active' : ''
                  }`}
                  style={{ 
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    fontSize: '0.75rem'
                  }}
                >
                  {opt.label}
                  {opt.category === 'standard' && currentType === opt.value && (
                    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2.5" fill="none" style={{ marginLeft: 'auto' }}>
                      <polyline points="20,6 9,17 4,12"></polyline>
                    </svg>
                  )}
                </button>
              ))
            )}

            {/* Custom Date Range */}
            {activeCategory === 'custom' && (
              <div style={{ padding: '12px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.65rem', 
                    fontWeight: 600, 
                    color: 'var(--text-muted)', 
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    From
                  </label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      fontSize: '0.8rem',
                      colorScheme: 'dark',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.65rem', 
                    fontWeight: 600, 
                    color: 'var(--text-muted)', 
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    To
                  </label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      fontSize: '0.8rem',
                      colorScheme: 'dark',
                    }}
                  />
                </div>
                <button
                  onClick={handleCustomRangeApply}
                  disabled={!customFrom || !customTo}
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: customFrom && customTo ? 'var(--pinnacle-teal)' : 'var(--bg-tertiary)',
                    color: customFrom && customTo ? '#000' : 'var(--text-muted)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: customFrom && customTo ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s'
                  }}
                >
                  Apply Range
                </button>
              </div>
            )}
          </div>

          {/* Quick Info Footer */}
          {dateFilter?.type === 'custom' && dateFilter.from && dateFilter.to && (
            <div style={{ 
              padding: '8px 12px', 
              borderTop: '1px solid var(--border-color)',
              fontSize: '0.65rem',
              color: 'var(--text-muted)',
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span>Current: {dateFilter.from} to {dateFilter.to}</span>
              <button
                onClick={() => {
                  setDateFilter({ type: 'all' });
                  setIsOpen(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--pinnacle-teal)',
                  cursor: 'pointer',
                  fontSize: '0.65rem',
                  fontWeight: 500
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
