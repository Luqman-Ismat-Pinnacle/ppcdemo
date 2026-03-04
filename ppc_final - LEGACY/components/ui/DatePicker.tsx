'use client';

/**
 * @fileoverview Themed DatePicker Component for PPC V3.
 * 
 * A dark-themed calendar date picker that matches the application's design system.
 * Features:
 * - Calendar dropdown with month/year navigation
 * - Support for null/empty values
 * - CSS variables for consistent theming
 * - Click-outside-to-close behavior
 * - Keyboard navigation support
 * 
 * @module components/ui/DatePicker
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

interface DatePickerProps {
  /** Selected date value (ISO string or null) */
  value: string | null;
  /** Callback when date changes */
  onChange: (date: string | null) => void;
  /** Placeholder text when no date selected */
  placeholder?: string;
  /** Disable the picker */
  disabled?: boolean;
  /** Minimum selectable date (ISO string) */
  minDate?: string;
  /** Maximum selectable date (ISO string) */
  maxDate?: string;
  /** Show clear button */
  clearable?: boolean;
  /** Additional className */
  className?: string;
}

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Themed DatePicker component with calendar dropdown
 */
export default function DatePicker({
  value,
  onChange,
  placeholder = 'Select date...',
  disabled = false,
  minDate,
  maxDate,
  clearable = true,
  className = '',
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) return new Date(value);
    return new Date();
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse dates for comparison
  const selectedDate = useMemo(() => value ? new Date(value) : null, [value]);
  const min = useMemo(() => minDate ? new Date(minDate) : null, [minDate]);
  const max = useMemo(() => maxDate ? new Date(maxDate) : null, [maxDate]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update view when value changes
  useEffect(() => {
    if (value) {
      setViewDate(new Date(value));
    }
  }, [value]);

  // Get calendar grid for current month view
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const days: (Date | null)[] = [];

    // Padding for days before start of month
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }

    // Days of the month
    for (let i = 1; i <= totalDays; i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  }, [viewDate]);

  // Check if date is selectable
  const isDateSelectable = useCallback((date: Date) => {
    if (min && date < min) return false;
    if (max && date > max) return false;
    return true;
  }, [min, max]);

  // Check if date is selected
  const isDateSelected = useCallback((date: Date) => {
    if (!selectedDate) return false;
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  }, [selectedDate]);

  // Check if date is today
  const isToday = useCallback((date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }, []);

  // Navigate months
  const goToPrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  // Select date
  const handleSelectDate = (date: Date) => {
    if (!isDateSelectable(date)) return;
    onChange(date.toISOString().split('T')[0]);
    setIsOpen(false);
  };

  // Clear date
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  // Format display value
  const displayValue = selectedDate
    ? selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <div
      ref={containerRef}
      className={`date-picker-container ${className}`}
      style={{ position: 'relative', display: 'inline-block', width: '100%' }}
    >
      {/* Trigger Input */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: disabled ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          borderRadius: '6px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          minHeight: '36px',
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="var(--text-muted)" strokeWidth="2" fill="none">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          placeholder={placeholder}
          readOnly
          disabled={disabled}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            cursor: 'inherit',
            outline: 'none',
          }}
        />
        {clearable && value && !disabled && (
          <button
            onClick={handleClear}
            style={{
              background: 'none',
              border: 'none',
              padding: '2px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        )}
        <svg viewBox="0 0 12 12" width="10" height="10" style={{ marginLeft: 'auto' }}>
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="var(--text-muted)" strokeWidth="1.5" fill="none" />
        </svg>
      </div>

      {/* Calendar Dropdown - z-index 9999 to ensure it appears above table containers */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 9999,
            marginTop: '4px',
            padding: '12px',
            background: 'var(--bg-card)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
            minWidth: '280px',
          }}
        >
          {/* Header: Month/Year Navigation */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
            paddingBottom: '8px',
            borderBottom: '1px solid var(--border-color)',
          }}>
            <button
              onClick={goToPrevMonth}
              style={{
                background: 'none',
                border: 'none',
                padding: '6px',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                borderRadius: '4px',
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
                <polyline points="15,18 9,12 15,6"></polyline>
              </svg>
            </button>
            <span style={{
              fontWeight: 600,
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
            }}>
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </span>
            <button
              onClick={goToNextMonth}
              style={{
                background: 'none',
                border: 'none',
                padding: '6px',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                borderRadius: '4px',
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
                <polyline points="9,18 15,12 9,6"></polyline>
              </svg>
            </button>
          </div>

          {/* Day of Week Headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '2px',
            marginBottom: '4px',
          }}>
            {DAYS_OF_WEEK.map(day => (
              <div
                key={day}
                style={{
                  textAlign: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  padding: '4px 0',
                }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '2px',
          }}>
            {calendarDays.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} style={{ padding: '8px' }} />;
              }

              const selectable = isDateSelectable(date);
              const selected = isDateSelected(date);
              const today = isToday(date);

              return (
                <button
                  key={date.toISOString()}
                  onClick={() => handleSelectDate(date)}
                  disabled={!selectable}
                  style={{
                    padding: '8px',
                    textAlign: 'center',
                    fontSize: '0.8rem',
                    fontWeight: selected || today ? 600 : 400,
                    background: selected
                      ? 'var(--pinnacle-teal)'
                      : today
                        ? 'rgba(64, 224, 208, 0.2)'
                        : 'transparent',
                    color: selected
                      ? '#000'
                      : !selectable
                        ? 'var(--text-muted)'
                        : today
                          ? 'var(--pinnacle-teal)'
                          : 'var(--text-primary)',
                    border: today && !selected ? '1px solid var(--pinnacle-teal)' : 'none',
                    borderRadius: '6px',
                    cursor: selectable ? 'pointer' : 'not-allowed',
                    opacity: selectable ? 1 : 0.4,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (selectable && !selected) {
                      e.currentTarget.style.background = 'var(--bg-tertiary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) {
                      e.currentTarget.style.background = today ? 'rgba(64, 224, 208, 0.2)' : 'transparent';
                    }
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          {/* Footer: Quick Actions */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '12px',
            paddingTop: '8px',
            borderTop: '1px solid var(--border-color)',
          }}>
            <button
              onClick={() => {
                const today = new Date();
                setViewDate(today);
                handleSelectDate(today);
              }}
              style={{
                fontSize: '0.75rem',
                color: 'var(--pinnacle-teal)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Today
            </button>
            {clearable && (
              <button
                onClick={() => {
                  onChange(null);
                  setIsOpen(false);
                }}
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

