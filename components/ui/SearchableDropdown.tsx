'use client';

/**
 * @fileoverview Searchable Dropdown Component for PPC V3.
 * 
 * A themed dropdown with search functionality for selecting from lists.
 * Used for foreign key fields (Employee, Project, Customer, etc.)
 * 
 * Features:
 * - Search/filter as you type
 * - Supports objects with id/name pairs
 * - Click-outside-to-close
 * - Keyboard navigation
 * - Shows display value while storing ID value
 * 
 * @module components/ui/SearchableDropdown
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

export interface DropdownOption {
  /** Unique identifier (stored value) */
  id: string;
  /** Display name */
  name: string;
  /** Optional secondary text */
  secondary?: string;
}

interface SearchableDropdownProps {
  /** Selected value (id) */
  value: string | null;
  /** Available options */
  options: DropdownOption[];
  /** Callback when selection changes */
  onChange: (id: string | null) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Disable the dropdown */
  disabled?: boolean;
  /** Allow clearing selection */
  clearable?: boolean;
  /** Label for the field */
  label?: string;
  /** Show search input */
  searchable?: boolean;
  /** Additional className */
  className?: string;
  /** Width of dropdown */
  width?: string;
}

/**
 * Searchable Dropdown component for FK field selection
 */
export default function SearchableDropdown({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  clearable = true,
  label,
  searchable = true,
  className = '',
  width = '100%',
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Find selected option
  const selectedOption = useMemo(() => {
    return options.find(opt => opt.id === value) || null;
  }, [options, value]);

  // Filter options based on search
  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    const term = searchTerm.toLowerCase();
    return options.filter(opt =>
      opt.name.toLowerCase().includes(term) ||
      opt.id.toLowerCase().includes(term) ||
      (opt.secondary && opt.secondary.toLowerCase().includes(term))
    );
  }, [options, searchTerm]);

  // Close on outside click (accounting for portal)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isClickInsideContainer = containerRef.current?.contains(target);
      const isClickInsideDropdown = dropdownRef.current?.contains(target);

      if (!isClickInsideContainer && !isClickInsideDropdown) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Calculate dropdown position when opened
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const updatePosition = () => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const dropdownHeight = 280; // maxHeight from styles
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Determine if dropdown should open above or below
        const openAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

        // Calculate position
        const top = openAbove
          ? rect.top - dropdownHeight - 4  // 4px margin
          : rect.bottom + 4; // 4px margin

        // Ensure dropdown doesn't go off-screen horizontally
        let left = rect.left;
        const width = rect.width;

        // Adjust if dropdown would go off right edge
        if (left + width > viewportWidth - 4) {
          left = viewportWidth - width - 4;
        }
        // Adjust if dropdown would go off left edge
        if (left < 4) {
          left = 4;
        }

        setDropdownPosition({ top, left, width });
      };

      updatePosition();

      // Update position on scroll/resize
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    } else {
      setDropdownPosition(null);
    }
  }, [isOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      // Small delay to ensure dropdown is rendered
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    }
  }, [isOpen, searchable]);

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex].id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm('');
        break;
    }
  }, [isOpen, filteredOptions, highlightedIndex]);

  // Handle selection
  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setSearchTerm('');
  };

  // Handle clear
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  return (
    <div
      ref={containerRef}
      className={`searchable-dropdown ${className}`}
      style={{ position: 'relative', display: 'inline-block', width }}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger */}
      <div
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 10px',
          background: disabled ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          minHeight: '32px',
          fontSize: '0.75rem',
        }}
      >
        <span style={{
          flex: 1,
          color: selectedOption ? 'var(--text-primary)' : 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {selectedOption ? selectedOption.name : placeholder}
        </span>

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
              flexShrink: 0,
            }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        )}

        <svg viewBox="0 0 12 12" width="10" height="10" style={{ flexShrink: 0 }}>
          <path
            d={isOpen ? "M9.5 8L6 4.5L2.5 8" : "M2.5 4.5L6 8L9.5 4.5"}
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>
      </div>

      {/* Dropdown - Rendered via Portal to avoid clipping */}
      {isOpen && dropdownPosition && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            zIndex: 99999, // Very high z-index to appear above everything
            background: 'var(--bg-card)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
            maxHeight: '280px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search Input */}
          {searchable && (
            <div style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                background: 'var(--bg-secondary)',
                borderRadius: '4px',
              }}>
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="var(--text-muted)" strokeWidth="2" fill="none">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '0.75rem',
                    outline: 'none',
                  }}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '2px',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Options List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {filteredOptions.length === 0 ? (
              <div style={{
                padding: '16px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.75rem',
              }}>
                No options found
              </div>
            ) : (
              filteredOptions.map((option, index) => (
                <div
                  key={option.id}
                  onClick={() => handleSelect(option.id)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    background: index === highlightedIndex
                      ? 'rgba(64, 224, 208, 0.1)'
                      : option.id === value
                        ? 'rgba(64, 224, 208, 0.05)'
                        : 'transparent',
                    borderLeft: option.id === value ? '2px solid var(--pinnacle-teal)' : '2px solid transparent',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-primary)',
                    fontWeight: option.id === value ? 600 : 400,
                  }}>
                    {option.name}
                  </div>
                  {option.secondary && (
                    <div style={{
                      fontSize: '0.65rem',
                      color: 'var(--text-muted)',
                      marginTop: '2px',
                    }}>
                      {option.secondary}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer: Count */}
          <div style={{
            padding: '6px 12px',
            borderTop: '1px solid var(--border-color)',
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
            background: 'var(--bg-secondary)',
          }}>
            {filteredOptions.length} of {options.length} options
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

