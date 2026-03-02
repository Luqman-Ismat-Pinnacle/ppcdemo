'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

export default function SearchableSelect({ options, value, onChange, placeholder = 'Select…', style }: SearchableSelectProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => options.find(o => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, search]);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  return (
    <div className="searchable-select" ref={ref} style={style}>
      <input
        value={open ? search : (selected?.label || '')}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setSearch(''); }}
        onChange={e => setSearch(e.target.value)}
      />
      {open && (
        <div className="dropdown">
          <div
            className="dropdown-item"
            style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}
            onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
          >
            {placeholder}
          </div>
          {filtered.map(o => (
            <div
              key={o.value}
              className="dropdown-item"
              style={o.value === value ? { background: 'rgba(16,185,129,0.15)' } : undefined}
              onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}
            >
              {o.label}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="dropdown-item" style={{ color: 'var(--text-muted)' }}>No matches</div>
          )}
        </div>
      )}
    </div>
  );
}
