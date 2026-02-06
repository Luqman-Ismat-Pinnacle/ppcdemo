/**
 * @fileoverview Cross-Filter Hook for ECharts Interactivity
 * 
 * Provides page-wide filtering when users click on chart elements.
 * Implements Microsoft Dynamics-style cross-sync filtering.
 * 
 * Features:
 * - Filter by project, status, resource, phase, work type
 * - Drill-down tracking for hierarchical navigation
 * - Clear all filters action
 * - Filter history for breadcrumb navigation
 * 
 * @module lib/hooks/useCrossFilter
 */

import { useState, useCallback, useMemo } from 'react';

export interface CrossFilter {
  type: 'project' | 'status' | 'resource' | 'phase' | 'workType' | 'priority' | 'milestone' | 'risk' | 'custom';
  value: string;
  label: string;
  source: string; // Which chart triggered this filter
}

export interface DrillDownLevel {
  id: string;
  label: string;
  filters: CrossFilter[];
}

export interface CrossFilterState {
  activeFilters: CrossFilter[];
  drillDownPath: DrillDownLevel[];
  selectedItem: any | null;
  highlightedItems: string[]; // IDs of items to highlight across charts
}

export interface CrossFilterActions {
  addFilter: (filter: CrossFilter) => void;
  removeFilter: (type: string, value?: string) => void;
  clearFilters: () => void;
  toggleFilter: (filter: CrossFilter) => void;
  setSelectedItem: (item: any | null) => void;
  drillDown: (level: DrillDownLevel) => void;
  drillUp: () => void;
  drillToLevel: (levelId: string) => void;
  highlightItems: (ids: string[]) => void;
  clearHighlights: () => void;
  isFiltered: (type: string, value: string) => boolean;
  getFilterValue: (type: string) => string | null;
}

export function useCrossFilter(): CrossFilterState & CrossFilterActions {
  const [activeFilters, setActiveFilters] = useState<CrossFilter[]>([]);
  const [drillDownPath, setDrillDownPath] = useState<DrillDownLevel[]>([]);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [highlightedItems, setHighlightedItems] = useState<string[]>([]);

  const addFilter = useCallback((filter: CrossFilter) => {
    setActiveFilters(prev => {
      // Replace existing filter of same type, or add new
      const existing = prev.findIndex(f => f.type === filter.type);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = filter;
        return updated;
      }
      return [...prev, filter];
    });
  }, []);

  const removeFilter = useCallback((type: string, value?: string) => {
    setActiveFilters(prev => 
      prev.filter(f => {
        if (value) return !(f.type === type && f.value === value);
        return f.type !== type;
      })
    );
  }, []);

  const clearFilters = useCallback(() => {
    setActiveFilters([]);
    setDrillDownPath([]);
    setSelectedItem(null);
    setHighlightedItems([]);
  }, []);

  const toggleFilter = useCallback((filter: CrossFilter) => {
    setActiveFilters(prev => {
      const existing = prev.find(f => f.type === filter.type && f.value === filter.value);
      if (existing) {
        return prev.filter(f => !(f.type === filter.type && f.value === filter.value));
      }
      // Replace same type filter
      const withoutType = prev.filter(f => f.type !== filter.type);
      return [...withoutType, filter];
    });
  }, []);

  const drillDown = useCallback((level: DrillDownLevel) => {
    setDrillDownPath(prev => [...prev, level]);
    setActiveFilters(level.filters);
  }, []);

  const drillUp = useCallback(() => {
    setDrillDownPath(prev => {
      if (prev.length <= 1) {
        setActiveFilters([]);
        return [];
      }
      const newPath = prev.slice(0, -1);
      setActiveFilters(newPath[newPath.length - 1]?.filters || []);
      return newPath;
    });
  }, []);

  const drillToLevel = useCallback((levelId: string) => {
    setDrillDownPath(prev => {
      const idx = prev.findIndex(l => l.id === levelId);
      if (idx < 0) return prev;
      const newPath = prev.slice(0, idx + 1);
      setActiveFilters(newPath[newPath.length - 1]?.filters || []);
      return newPath;
    });
  }, []);

  const highlightItems = useCallback((ids: string[]) => {
    setHighlightedItems(ids);
  }, []);

  const clearHighlights = useCallback(() => {
    setHighlightedItems([]);
  }, []);

  const isFiltered = useCallback((type: string, value: string): boolean => {
    return activeFilters.some(f => f.type === type && f.value === value);
  }, [activeFilters]);

  const getFilterValue = useCallback((type: string): string | null => {
    const filter = activeFilters.find(f => f.type === type);
    return filter?.value ?? null;
  }, [activeFilters]);

  return {
    activeFilters,
    drillDownPath,
    selectedItem,
    highlightedItems,
    addFilter,
    removeFilter,
    clearFilters,
    toggleFilter,
    setSelectedItem,
    drillDown,
    drillUp,
    drillToLevel,
    highlightItems,
    clearHighlights,
    isFiltered,
    getFilterValue,
  };
}

/**
 * Filter bar component for displaying active cross-filters
 */
export interface FilterBarProps {
  filters: CrossFilter[];
  drillDownPath: DrillDownLevel[];
  onRemove: (type: string, value?: string) => void;
  onClear: () => void;
  onDrillUp: () => void;
  onDrillToLevel: (levelId: string) => void;
}

/**
 * Apply cross-filters to a data array
 */
export function applyCrossFilters<T extends Record<string, any>>(
  data: T[],
  filters: CrossFilter[],
  fieldMappings: Record<string, keyof T | ((item: T) => any)>
): T[] {
  if (filters.length === 0) return data;

  return data.filter(item => {
    return filters.every(filter => {
      const mapping = fieldMappings[filter.type];
      if (!mapping) return true;

      const value = typeof mapping === 'function' 
        ? mapping(item) 
        : item[mapping as keyof T];

      // Case-insensitive comparison
      const itemValue = String(value || '').toLowerCase();
      const filterValue = String(filter.value).toLowerCase();

      return itemValue === filterValue || itemValue.includes(filterValue);
    });
  });
}

/**
 * Get unique values for filter options
 */
export function getFilterOptions<T extends Record<string, any>>(
  data: T[],
  field: keyof T | ((item: T) => any),
  labelField?: keyof T
): { value: string; label: string; count: number }[] {
  const counts = new Map<string, { label: string; count: number }>();

  data.forEach(item => {
    const value = typeof field === 'function' 
      ? field(item) 
      : String(item[field] || '');
    
    if (!value) return;

    const label = labelField 
      ? String(item[labelField] || value)
      : value;

    const existing = counts.get(value);
    if (existing) {
      existing.count++;
    } else {
      counts.set(value, { label, count: 1 });
    }
  });

  return Array.from(counts.entries())
    .map(([value, { label, count }]) => ({ value, label, count }))
    .sort((a, b) => b.count - a.count);
}

export default useCrossFilter;
