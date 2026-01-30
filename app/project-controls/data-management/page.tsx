'use client';

/**
 * @fileoverview Data Management Page for PPC V3 Project Controls.
 * 
 * The single source of truth for all application data. Provides:
 * - File upload (CSV, JSON, XLSX) with validation and error logging
 * - Full CRUD operations (Create, Read, Update, Delete) for all entity types
 * - Searchable dropdowns for FK fields (Employee, Project, etc.)
 * - Calculated fields are computed by the database (not in application code)
 * - Supabase sync on save (when configured)
 * 
 * All other pages pull data from here via the DataContext.
 * 
 * @module app/project-controls/data-management/page
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type FilterFn,
  type ColumnFiltersState,
  type SortingState,
  type ColumnSizingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { rankItem } from '@tanstack/match-sorter-utils';
import { useData } from '@/lib/data-context';
import {
  convertWorkdayEmployees,
  convertWorkdayTasks,
  parseCSVString,
  convertProjectPlanJSON,
  detectCSVDataType
} from '@/lib/data-converter';
import {
  exportAllToExcel,
  importFromExcel,
} from '@/lib/excel-utils';
import {
  isSupabaseConfigured,
  syncTable,
  DATA_KEY_TO_TABLE,
} from '@/lib/supabase';
import {
  type SortState,
  type SortValue,
  formatSortIndicator,
  getNextSortState,
  sortByState,
} from '@/lib/sort-utils';
import {
  createSnapshot,
  type SnapshotCreateInput
} from '@/lib/snapshot-utils';
import { useUser } from '@/lib/user-context';
import DatePicker from '@/components/ui/DatePicker';
import SearchableDropdown, { type DropdownOption } from '@/components/ui/SearchableDropdown';
import EnhancedTooltip from '@/components/ui/EnhancedTooltip';

// ============================================================================
// TYPES
// ============================================================================

interface ImportLogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'warning' | 'error';
  entity: string;
  action: 'add' | 'edit' | 'delete' | 'skip' | 'process' | 'sync';
  message: string;
  row?: number;
}

interface ImportSummary {
  total: number;
  added: number;
  edited: number;
  deleted: number;
  skipped: number;
  errors: number;
}

type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'select' | 'employee' | 'project' | 'customer' | 'site' | 'unit' | 'portfolio' | 'phase' | 'task' | 'role' | 'changeRequest';

interface FieldConfig {
  key: string;
  header: string;
  type: FieldType;
  editable: boolean;
  autoCalculated?: boolean;
  tooltip?: string;
  width?: string;
  selectOptions?: string[];
}

interface SectionConfig {
  key: string;
  label: string;
  dataKey: keyof ReturnType<typeof useData>['filteredData'];
  fields: FieldConfig[];
  idKey: string;
  defaultNewRow: () => Record<string, any>;
  onFieldChange?: (row: Record<string, any>, field: string, value: any, data: any) => Record<string, any>;
}

// ============================================================================
// UTILITIES
// ============================================================================

const getCurrentTimestamp = (): string => new Date().toISOString();

const DROPDOWN_MIN_WIDTH = '170px';
const DROPDOWN_MAX_WIDTH = '230px';
const DROPDOWN_FIXED_WIDTH = '190px';
const SELECT_FIXED_WIDTH = '150px';
const BOOLEAN_SELECT_WIDTH = '120px';

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const TableFilterHeader = ({
  section,
  field,
  data,
  getUniqueValues,
  tableSortStates,
  setTableSortStates,
  customColumnFilters,
  setCustomColumnFilters,
  openFilterDropdown,
  setOpenFilterDropdown,
  filterSearchText,
  setFilterSearchText,
  filterDropdownPosition,
  setFilterDropdownPosition,
  filterButtonRefs,
  filterDropdownRef
}: any) => {
  const sortState = tableSortStates[section.key] || null;
  const indicator = formatSortIndicator(sortState, field.key);
  const hasFilter = (customColumnFilters[section.key]?.[field.key]?.length || 0) > 0;
  const isFilterOpen = openFilterDropdown?.table === section.key && openFilterDropdown?.field === field.key;
  const filterKey = `${section.key}_${field.key}`;
  const searchText = filterSearchText[filterKey] || '';
  const selectedValues = customColumnFilters[section.key]?.[field.key] || [];

  const uniqueValues = useMemo(() => {
    const sectionData = (data as any)[section.dataKey] || [];
    return getUniqueValues(field.key, sectionData);
  }, [field.key, section.dataKey, data, getUniqueValues]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between', whiteSpace: 'nowrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
        {field.tooltip ? (
          <EnhancedTooltip content={field.tooltip}>
            <button
              type="button"
              onClick={() => {
                setTableSortStates((prev: Record<string, any>) => ({
                  ...prev,
                  [section.key]: getNextSortState(prev[section.key] || null, field.key)
                }));
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'inherit',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 600,
                fontSize: '0.7rem'
              }}
            >
              {field.header}
              {indicator && <span style={{ fontSize: '0.6rem', opacity: 0.8, color: 'var(--pinnacle-teal)' }}>{indicator}</span>}
              {field.autoCalculated && <span style={{ fontSize: '0.6rem', opacity: 0.5, fontStyle: 'italic' }}>calc</span>}
            </button>
          </EnhancedTooltip>
        ) : (
          <button
            type="button"
            onClick={() => {
              setTableSortStates((prev: Record<string, any>) => ({
                ...prev,
                [section.key]: getNextSortState(prev[section.key] || null, field.key)
              }));
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'inherit',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: 600,
              fontSize: '0.7rem'
            }}
          >
            {field.header}
            {indicator && <span style={{ fontSize: '0.6rem', opacity: 0.8, color: 'var(--pinnacle-teal)' }}>{indicator}</span>}
            {field.autoCalculated && <span style={{ fontSize: '0.6rem', opacity: 0.5, fontStyle: 'italic' }}>calc</span>}
          </button>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <button
          ref={(el) => {
            if (el) {
              filterButtonRefs.current.set(`${section.key}_${field.key}`, el);
            } else {
              filterButtonRefs.current.delete(`${section.key}_${field.key}`);
            }
          }}
          type="button"
          data-filter-button
          data-table={section.key}
          data-field={field.key}
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            e.preventDefault();
            const button = e.currentTarget;
            const rect = button.getBoundingClientRect();
            setFilterDropdownPosition({ top: rect.bottom + 4, left: rect.left });
            const newState = isFilterOpen ? null : { table: section.key, field: field.key };
            setOpenFilterDropdown(newState);
          }}
          style={{
            background: hasFilter ? 'var(--pinnacle-teal)' : 'rgba(255,255,255,0.05)',
            border: hasFilter ? '1px solid var(--pinnacle-teal)' : '1px solid var(--border-color)',
            borderRadius: '4px',
            padding: '2px 4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            color: hasFilter ? 'white' : 'var(--text-muted)',
            flexShrink: 0,
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: hasFilter ? '0 0 8px rgba(0, 128, 128, 0.3)' : 'none'
          }}
          title="Filter column"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
        </button>
        {isFilterOpen && typeof document !== 'undefined' && filterDropdownPosition && createPortal(
          <div
            ref={filterDropdownRef}
            style={{
              position: 'fixed',
              top: `${filterDropdownPosition.top}px`,
              left: `${filterDropdownPosition.left}px`,
              background: 'rgba(23, 25, 31, 1)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
              zIndex: 100000,
              minWidth: '280px',
              maxWidth: '350px',
              maxHeight: '450px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              pointerEvents: 'auto',
              animation: 'slideInDown 0.2s cubic-bezier(0, 0, 0.2, 1)'
            }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Filter {field.header}
              </div>
            </div>

            {/* Sort Options */}
            <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <button
                type="button"
                onClick={() => {
                  setTableSortStates((prev: Record<string, any>) => ({
                    ...prev,
                    [section.key]: { key: field.key, direction: 'asc' }
                  }));
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  fontSize: '0.75rem',
                  background: sortState?.key === field.key && sortState?.direction === 'asc' ? 'rgba(0, 128, 128, 0.2)' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: sortState?.key === field.key && sortState?.direction === 'asc' ? 'var(--pinnacle-teal)' : 'var(--text-primary)',
                  textAlign: 'left',
                  transition: 'all 0.15s'
                }}
              >
                <span style={{ fontSize: '1rem' }}>↑</span> Sort Ascending
              </button>
              <button
                type="button"
                onClick={() => {
                  setTableSortStates((prev: Record<string, any>) => ({
                    ...prev,
                    [section.key]: { key: field.key, direction: 'desc' }
                  }));
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  fontSize: '0.75rem',
                  background: sortState?.key === field.key && sortState?.direction === 'desc' ? 'rgba(0, 128, 128, 0.2)' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: sortState?.key === field.key && sortState?.direction === 'desc' ? 'var(--pinnacle-teal)' : 'var(--text-primary)',
                  textAlign: 'left',
                  transition: 'all 0.15s'
                }}
              >
                <span style={{ fontSize: '1rem' }}>↓</span> Sort Descending
              </button>
            </div>

            <div style={{ padding: '0 8px 8px' }}>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', margin: '4px 0 8px' }}></div>

              <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Search values..."
                  autoFocus
                  value={searchText}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setFilterSearchText((prev: Record<string, string>) => ({
                      ...prev,
                      [filterKey]: e.target.value,
                    }));
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '0.75rem',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: 'white',
                    outline: 'none',
                  }}
                />

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomColumnFilters((prev: Record<string, Record<string, string[]>>) => ({
                        ...prev,
                        [section.key]: {
                          ...(prev[section.key] || {}),
                          [field.key]: uniqueValues,
                        },
                      }));
                    }}
                    style={{
                      flex: 1,
                      padding: '6px',
                      fontSize: '0.65rem',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: 'white',
                      fontWeight: 600,
                    }}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomColumnFilters((prev: Record<string, Record<string, string[]>>) => ({
                        ...prev,
                        [section.key]: {
                          ...(prev[section.key] || {}),
                          [field.key]: [],
                        },
                      }));
                    }}
                    style={{
                      flex: 1,
                      padding: '6px',
                      fontSize: '0.65rem',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: 'rgba(255,255,255,0.5)',
                      fontWeight: 600,
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div style={{
                maxHeight: '200px',
                overflowY: 'auto',
                padding: '0 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
              }}>
                {uniqueValues
                  .filter((val: string) => !searchText || val.toLowerCase().includes(searchText.toLowerCase()))
                  .map((value: string) => {
                    const isChecked = selectedValues.includes(value);
                    return (
                      <label
                        key={value}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '6px 8px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          borderRadius: '6px',
                          background: isChecked ? 'rgba(255,255,255,0.03)' : 'transparent',
                          color: isChecked ? 'white' : 'var(--text-muted)',
                          transition: 'all 0.1s'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            setCustomColumnFilters((prev: Record<string, Record<string, string[]>>) => {
                              const current = prev[section.key]?.[field.key] || [];
                              const newValues = e.target.checked
                                ? [...current, value]
                                : current.filter((v: string) => v !== value);
                              return {
                                ...prev,
                                [section.key]: {
                                  ...(prev[section.key] || {}),
                                  [field.key]: newValues,
                                },
                              };
                            });
                          }}
                          style={{
                            accentColor: 'var(--pinnacle-teal)',
                            cursor: 'pointer'
                          }}
                        />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {value}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DataManagementPage() {
  const { filteredData, updateData, hierarchyFilter, dateFilter, isLoading: contextLoading, refreshData } = useData();
  const data = filteredData;
  const { user } = useUser();
  const currentUserName = user?.name || user?.email || 'System';
  const [selectedTable, setSelectedTable] = useState<string>('portfolios');

  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error' | 'info' | null; message: string }>({ type: null, message: '' });
  const [importLog, setImportLog] = useState<ImportLogEntry[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showImportLog, setShowImportLog] = useState(false);
  const [editedRows, setEditedRows] = useState<Map<string, Record<string, any>>>(new Map());
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [newRows, setNewRows] = useState<Record<string, any>[]>([]);
  const [tableSortStates, setTableSortStates] = useState<Record<string, SortState | null>>({});
  const [snapshotType, setSnapshotType] = useState<'baseline' | 'forecast' | 'workday' | 'manual' | 'auto'>('baseline');
  const [snapshotScope, setSnapshotScope] = useState<'project' | 'site' | 'customer' | 'portfolio' | 'all'>('project');
  const [snapshotScopeId, setSnapshotScopeId] = useState<string>('');
  const [snapshotDate, setSnapshotDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [snapshotVersionName, setSnapshotVersionName] = useState<string>('');
  const [snapshotCreatedBy, setSnapshotCreatedBy] = useState<string>('System');
  const [snapshotNotes, setSnapshotNotes] = useState<string>('');
  const [supabaseEnabled, setSupabaseEnabled] = useState(false);
  const [changeRequestStatusFilter, setChangeRequestStatusFilter] = useState<string>('all');
  const [changeRequestFromDate, setChangeRequestFromDate] = useState<string>('');
  const [changeRequestToDate, setChangeRequestToDate] = useState<string>('');
  const [showInactive, setShowInactive] = useState<boolean>(false);
  const [openFilterDropdown, setOpenFilterDropdown] = useState<{ table: string; field: string } | null>(null);
  const [filterSearchText, setFilterSearchText] = useState<Record<string, string>>({});
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const filterButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [filterDropdownPosition, setFilterDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [mppAnalysis, setMppAnalysis] = useState<{ documentId: string; analysis: any; logs: any[] } | null>(null);
  const [processingMPP, setProcessingMPP] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [customColumnFilters, setCustomColumnFilters] = useState<Record<string, Record<string, string[]>>>({});

  // ============================================================================
  // HELPERS (Foundational logic used by hooks)
  // ============================================================================

  // Get options for a field type
  const getOptionsForType = useCallback((type: FieldType): DropdownOption[] => {
    switch (type) {
      case 'employee': return (filteredData.employees || []).map((emp: any) => ({ id: emp.id || emp.employeeId, name: emp.name, secondary: emp.jobTitle || emp.email }));
      case 'portfolio': return (filteredData.portfolios || []).map((p: any) => ({ id: p.id || p.portfolioId, name: p.name, secondary: p.manager }));
      case 'customer': return (filteredData.customers || []).map((c: any) => ({ id: c.id || c.customerId, name: c.name }));
      case 'site': return (filteredData.sites || []).map((s: any) => ({ id: s.id || s.siteId, name: s.name, secondary: s.location }));
      case 'unit': return (filteredData.units || []).map((u: any) => ({ id: u.id || u.unitId, name: u.name, secondary: u.description }));
      case 'project': return (filteredData.projects || []).map((p: any) => ({ id: p.id || p.projectId, name: p.name, secondary: p.manager }));
      case 'phase': return (filteredData.phases || []).map((p: any) => ({ id: p.id || p.phaseId, name: p.name }));
      case 'task': return (filteredData.tasks || []).map((t: any) => ({ id: t.id || t.taskId, name: t.taskName || t.name }));
      case 'role':
        return ['Partner', 'Senior Manager', 'Project Manager', 'Project Lead', 'Technical Lead', 'Technical Manager', 'Technical Writer', 'QA/QC Auditor', 'Data Engineer', 'Data Scientist', 'CAD / Drafter', 'Field Technician', 'IDMS SME', 'Corrosion Engineer', 'Reliability Specialist', 'Senior Reliability Specialist', 'Senior Engineer', 'Process Engineer', 'Deployment Lead', 'Change Lead', 'Training Lead'].map(r => ({ id: r, name: r }));
      case 'changeRequest': return (filteredData.changeRequests || []).map((cr: any) => ({ id: cr.id, name: cr.title || cr.id, secondary: cr.status }));
      default: return [];
    }
  }, [filteredData]);


  // Use context loading state
  const isLoading = contextLoading;

  // Close filter dropdown when clicking outside
  useEffect(() => {
    if (!openFilterDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Check if click is inside the dropdown
      if (filterDropdownRef.current?.contains(target)) {
        return;
      }

      // Check if click is on a filter button
      const filterButton = target.closest('[data-filter-button]');
      if (filterButton) {
        // If clicking the same button that opened this dropdown, close it
        const buttonTable = filterButton.getAttribute('data-table');
        const buttonField = filterButton.getAttribute('data-field');
        if (buttonTable === openFilterDropdown.table && buttonField === openFilterDropdown.field) {
          setOpenFilterDropdown(null);
          setFilterDropdownPosition(null);
        }
        return;
      }

      // Click is outside, close dropdown
      setOpenFilterDropdown(null);
      setFilterDropdownPosition(null);
    };

    // Use capture phase to catch clicks before they bubble
    document.addEventListener('mousedown', handleClickOutside, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [openFilterDropdown]);

  // Get unique values for a column (for filter dropdown)
  const getUniqueValues = useCallback((fieldKey: string, data: any[]): string[] => {
    const values = new Set<string>();
    data.forEach((row: any) => {
      const value = row[fieldKey];
      if (value === null || value === undefined || value === '') {
        values.add('(blank)');
      } else {
        values.add(String(value));
      }
    });
    return Array.from(values).sort((a, b) => {
      // Sort with (blank) at the end
      if (a === '(blank)') return 1;
      if (b === '(blank)') return -1;
      return a.localeCompare(b);
    });
  }, []);

  const changeLog = data.changeLog || [];
  const changeControlSummary = data.changeControlSummary || { byProject: [], byMonth: [] };
  useEffect(() => {
    setSupabaseEnabled(isSupabaseConfigured());
  }, []);

  useEffect(() => {
    if (currentUserName !== 'System' && snapshotCreatedBy === 'System') {
      setSnapshotCreatedBy(currentUserName);
    }
  }, [currentUserName, snapshotCreatedBy]);

  // ============================================================================
  // LOOKUPS & HELPERS (Foundational logic used by sections)
  // ============================================================================

  const unitLookup = useMemo(() => {
    const map = new Map<string, string>();
    const normalizeValue = (value?: string | null) => {
      if (!value) return '';
      return value.toString().trim().toLowerCase();
    };
    (data.units || []).forEach((unit: any) => {
      const targetId = unit.id || unit.unitId;
      if (!targetId) return;
      const normalizedId = normalizeValue(targetId);
      if (normalizedId) map.set(normalizedId, targetId);
      if (unit.unitId) {
        const normalizedUnitId = normalizeValue(unit.unitId);
        if (normalizedUnitId) map.set(normalizedUnitId, targetId);
      }
      if (unit.unit_id) {
        const normalizedDbId = normalizeValue(unit.unit_id);
        if (normalizedDbId) map.set(normalizedDbId, targetId);
      }
      if (unit.name) {
        const normalizedName = normalizeValue(unit.name);
        if (normalizedName) map.set(normalizedName, targetId);
      }
    });
    return map;
  }, [data.units]);

  const resolveUnitReference = useCallback((value?: string | null) => {
    if (!value) return null;
    const normalized = value.toString().trim().toLowerCase();
    if (!normalized) return null;
    return unitLookup.get(normalized) || null;
  }, [unitLookup]);

  const projectLookup = useMemo(() => {
    const map = new Map<string, string>();
    const normalizeValue = (value?: string | null) => {
      if (!value) return '';
      return value.toString().trim().toLowerCase();
    };
    (data.projects || []).forEach((project: any) => {
      const targetId = project.id || project.projectId;
      if (!targetId) return;
      const normalizedId = normalizeValue(targetId);
      if (normalizedId) map.set(normalizedId, targetId);
      if (project.projectId) {
        const normalizedProjectId = normalizeValue(project.projectId);
        if (normalizedProjectId) map.set(normalizedProjectId, targetId);
      }
      if (project.project_id) {
        const normalizedDbId = normalizeValue(project.project_id);
        if (normalizedDbId) map.set(normalizedDbId, targetId);
      }
      if (project.name) {
        const normalizedName = normalizeValue(project.name);
        if (normalizedName) map.set(normalizedName, targetId);
      }
    });
    return map;
  }, [data.projects]);

  const resolveProjectReference = useCallback((value?: string | null) => {
    if (!value) return null;
    const normalized = value.toString().trim().toLowerCase();
    if (!normalized) return null;
    return projectLookup.get(normalized) || null;
  }, [projectLookup]);


  // ============================================================================
  // DROPDOWN OPTIONS - Built from current data
  // ============================================================================

  const employeeOptions: DropdownOption[] = useMemo(() => getOptionsForType('employee'), [getOptionsForType]);
  const portfolioOptions: DropdownOption[] = useMemo(() => getOptionsForType('portfolio'), [getOptionsForType]);
  const customerOptions: DropdownOption[] = useMemo(() => getOptionsForType('customer'), [getOptionsForType]);
  const siteOptions: DropdownOption[] = useMemo(() => getOptionsForType('site'), [getOptionsForType]);
  const unitOptions: DropdownOption[] = useMemo(() => getOptionsForType('unit'), [getOptionsForType]);
  const projectOptions: DropdownOption[] = useMemo(() => getOptionsForType('project'), [getOptionsForType]);
  const phaseOptions: DropdownOption[] = useMemo(() => getOptionsForType('phase'), [getOptionsForType]);
  const taskOptions: DropdownOption[] = useMemo(() => getOptionsForType('task'), [getOptionsForType]);
  const roleOptions: DropdownOption[] = useMemo(() => getOptionsForType('role'), [getOptionsForType]);
  const changeRequestOptions: DropdownOption[] = useMemo(() => getOptionsForType('changeRequest'), [getOptionsForType]);

  // ============================================================================
  // SECTIONS CONFIGURATION - With field types and auto-calculated flags
  // ============================================================================

  const sections: SectionConfig[] = useMemo(() => [
    {
      key: 'portfolios',
      label: 'Portfolios',
      dataKey: 'portfolios',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'portfolioId', header: 'Portfolio ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'employeeId', header: 'Owner', type: 'employee', editable: true },
        { key: 'manager', header: 'Manager', type: 'text', editable: true },
        { key: 'methodology', header: 'Methodology', type: 'text', editable: true },
        { key: 'baselineStartDate', header: 'Baseline Start', type: 'date', editable: true },
        { key: 'baselineEndDate', header: 'Baseline End', type: 'date', editable: true },
        { key: 'actualStartDate', header: 'Actual Start', type: 'date', editable: true },
        { key: 'actualEndDate', header: 'Actual End', type: 'date', editable: true },
        { key: 'evMethod', header: 'EV Method', type: 'select', editable: true, selectOptions: ['0/100', '50/50', 'percent_complete', 'weighted_milestone'] },
        { key: 'percentComplete', header: '% Complete', type: 'number', editable: false, autoCalculated: true, tooltip: 'Rolled up from children' },
        { key: 'baselineHours', header: 'Baseline Hrs', type: 'number', editable: true },
        { key: 'actualHours', header: 'Actual Hrs', type: 'number', editable: true },
        { key: 'remainingHours', header: 'Remaining Hrs', type: 'number', editable: false, autoCalculated: true, tooltip: 'Baseline - Actual' },
        { key: 'baselineCost', header: 'Baseline Cost', type: 'number', editable: true },
        { key: 'actualCost', header: 'Actual Cost', type: 'number', editable: true },
        { key: 'remainingCost', header: 'Remaining Cost', type: 'number', editable: false, autoCalculated: true, tooltip: 'Baseline - Actual' },
        { key: 'isActive', header: 'Active', type: 'boolean', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        portfolioId: '',
        name: '',
        employeeId: null,
        manager: '',
        methodology: '',
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        // Calculated fields (remainingHours, remainingCost, percentComplete) will be computed by database
        baselineHours: 0,
        actualHours: 0,
        baselineCost: 0,
        actualCost: 0,
        comments: '',
        isActive: true,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    {
      key: 'customers',
      label: 'Customers',
      dataKey: 'customers',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'customerId', header: 'Customer ID', type: 'text', editable: true },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'portfolioId', header: 'Portfolio', type: 'portfolio', editable: true },
        { key: 'employeeId', header: 'Account Mgr', type: 'employee', editable: true },
        { key: 'baselineStartDate', header: 'Baseline Start', type: 'date', editable: true },
        { key: 'baselineEndDate', header: 'Baseline End', type: 'date', editable: true },
        { key: 'percentComplete', header: '% Complete', type: 'number', editable: false, autoCalculated: true },
        { key: 'baselineHours', header: 'Baseline Hrs', type: 'number', editable: true },
        { key: 'actualHours', header: 'Actual Hrs', type: 'number', editable: true },
        { key: 'remainingHours', header: 'Remaining Hrs', type: 'number', editable: false, autoCalculated: true },
        { key: 'baselineCost', header: 'Baseline Cost', type: 'number', editable: true },
        { key: 'actualCost', header: 'Actual Cost', type: 'number', editable: true },
        { key: 'remainingCost', header: 'Remaining Cost', type: 'number', editable: false, autoCalculated: true },
        { key: 'isActive', header: 'Active', type: 'boolean', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        customerId: '',
        name: '',
        portfolioId: null,
        employeeId: null,
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        // Calculated fields (remainingHours, remainingCost, percentComplete) will be computed by database
        baselineHours: 0,
        actualHours: 0,
        baselineCost: 0,
        actualCost: 0,
        comments: '',
        isActive: true,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    {
      key: 'sites',
      label: 'Sites',
      dataKey: 'sites',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'siteId', header: 'Site ID', type: 'text', editable: true },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'customerId', header: 'Customer', type: 'customer', editable: true },
        { key: 'employeeId', header: 'Site Mgr', type: 'employee', editable: true },
        { key: 'location', header: 'Location', type: 'text', editable: true },
        { key: 'baselineStartDate', header: 'Baseline Start', type: 'date', editable: true },
        { key: 'baselineEndDate', header: 'Baseline End', type: 'date', editable: true },
        { key: 'percentComplete', header: '% Complete', type: 'number', editable: false, autoCalculated: true },
        { key: 'baselineHours', header: 'Baseline Hrs', type: 'number', editable: true },
        { key: 'actualHours', header: 'Actual Hrs', type: 'number', editable: true },
        { key: 'remainingHours', header: 'Remaining Hrs', type: 'number', editable: false, autoCalculated: true },
        { key: 'baselineCost', header: 'Baseline Cost', type: 'number', editable: true },
        { key: 'actualCost', header: 'Actual Cost', type: 'number', editable: true },
        { key: 'remainingCost', header: 'Remaining Cost', type: 'number', editable: false, autoCalculated: true },
        { key: 'isActive', header: 'Active', type: 'boolean', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        siteId: '',
        name: '',
        customerId: null,
        employeeId: null,
        location: '',
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        // Calculated fields (remainingHours, remainingCost, percentComplete) will be computed by database
        baselineHours: 0,
        actualHours: 0,
        baselineCost: 0,
        actualCost: 0,
        comments: '',
        isActive: true,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    {
      key: 'projects',
      label: 'Projects',
      dataKey: 'projects',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'projectId', header: 'Project ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'customerId', header: 'Customer', type: 'customer', editable: true },
        { key: 'siteId', header: 'Site', type: 'site', editable: true },
        { key: 'employeeId', header: 'PM', type: 'employee', editable: true },
        // removed unitId, moved hierarchy
        { key: 'billableType', header: 'Billable', type: 'select', editable: true, selectOptions: ['T&M', 'FP'] },
        { key: 'methodology', header: 'Methodology', type: 'text', editable: true },
        { key: 'manager', header: 'Manager', type: 'text', editable: true },
        { key: 'status', header: 'Status', type: 'select', editable: true, selectOptions: ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'] },
        { key: 'baselineStartDate', header: 'Baseline Start', type: 'date', editable: true },
        { key: 'baselineEndDate', header: 'Baseline End', type: 'date', editable: true },
        { key: 'actualStartDate', header: 'Actual Start', type: 'date', editable: true },
        { key: 'actualEndDate', header: 'Actual End', type: 'date', editable: true },
        { key: 'percentComplete', header: '% Complete', type: 'number', editable: true },
        { key: 'baselineHours', header: 'Baseline Hrs', type: 'number', editable: true },
        { key: 'actualHours', header: 'Actual Hrs', type: 'number', editable: true },
        { key: 'remainingHours', header: 'Remaining Hrs', type: 'number', editable: false, autoCalculated: true },
        { key: 'baselineCost', header: 'Baseline Cost', type: 'number', editable: true },
        { key: 'actualCost', header: 'Actual Cost', type: 'number', editable: true },
        { key: 'remainingCost', header: 'Remaining Cost', type: 'number', editable: false, autoCalculated: true },
        { key: 'eacBudget', header: 'EAC Budget', type: 'number', editable: true, tooltip: 'Estimate at Completion Budget' },
        { key: 'eacHours', header: 'EAC Hours', type: 'number', editable: true, tooltip: 'Estimate at Completion Hours' },
        { key: 'cpi', header: 'CPI', type: 'number', editable: false, autoCalculated: true, tooltip: 'Cost Performance Index' },
        { key: 'spi', header: 'SPI', type: 'number', editable: false, autoCalculated: true, tooltip: 'Schedule Performance Index' },
        { key: 'isOverhead', header: 'Is Overhead', type: 'boolean', editable: true },
        { key: 'isTpw', header: 'Is TPW', type: 'boolean', editable: true, tooltip: 'The Pinnacle Way project' },
        { key: 'predecessorId', header: 'Predecessor', type: 'text', editable: true },
        { key: 'predecessorRelationship', header: 'Pred Rel', type: 'select', editable: true, selectOptions: ['FS', 'SS', 'FF', 'SF'] },
        { key: 'isActive', header: 'Active', type: 'boolean', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        projectId: '',
        name: '',
        customerId: null,
        siteId: null,
        employeeId: null,
        billableType: 'T&M',
        methodology: '',
        manager: '',
        status: 'Not Started',
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        // Calculated fields (remainingHours, remainingCost, percentComplete) will be computed by database
        baselineHours: 0,
        actualHours: 0,
        baselineCost: 0,
        actualCost: 0,
        eacBudget: 0,
        eacHours: 0,
        cpi: 1.0,
        spi: 1.0,
        isOverhead: false,
        isTpw: false,
        predecessorId: null,
        predecessorRelationship: null,
        comments: '',
        isActive: true,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    {
      key: 'units',
      label: 'Units',
      dataKey: 'units',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'unitId', header: 'Unit ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'description', header: 'Description', type: 'text', editable: true },
        { key: 'phaseId', header: 'Phase', type: 'phase', editable: true }, // Changed from projectId to phaseId
        { key: 'employeeId', header: 'Unit Mgr', type: 'employee', editable: true },
        { key: 'baselineStartDate', header: 'Baseline Start', type: 'date', editable: true },
        { key: 'baselineEndDate', header: 'Baseline End', type: 'date', editable: true },
        { key: 'actualStartDate', header: 'Actual Start', type: 'date', editable: true },
        { key: 'actualEndDate', header: 'Actual End', type: 'date', editable: true },
        { key: 'percentComplete', header: '% Complete', type: 'number', editable: false, autoCalculated: true },
        { key: 'baselineHours', header: 'Baseline Hrs', type: 'number', editable: true },
        { key: 'actualHours', header: 'Actual Hrs', type: 'number', editable: true },
        { key: 'remainingHours', header: 'Remaining Hrs', type: 'number', editable: false, autoCalculated: true },
        { key: 'baselineCost', header: 'Baseline Cost', type: 'number', editable: true },
        { key: 'actualCost', header: 'Actual Cost', type: 'number', editable: true },
        { key: 'remainingCost', header: 'Remaining Cost', type: 'number', editable: false, autoCalculated: true },
        { key: 'predecessorId', header: 'Predecessor', type: 'text', editable: true },
        { key: 'predecessorRelationship', header: 'Pred Rel', type: 'select', editable: true, selectOptions: ['FS', 'SS', 'FF', 'SF'] },
        { key: 'isActive', header: 'Active', type: 'boolean', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        unitId: '',
        name: '',
        description: '',
        phaseId: null,
        employeeId: null,
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        // Calculated fields (remainingHours, remainingCost, percentComplete) will be computed by database
        baselineHours: 0,
        actualHours: 0,
        baselineCost: 0,
        actualCost: 0,
        predecessorId: null,
        predecessorRelationship: null,
        comments: '',
        isActive: true,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    {
      key: 'phases',
      label: 'Phases',
      dataKey: 'phases',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'phaseId', header: 'Phase ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'methodology', header: 'Methodology', type: 'text', editable: true },
        { key: 'sequence', header: 'Seq', type: 'number', editable: true },
        { key: 'employeeId', header: 'Lead', type: 'employee', editable: true },
        { key: 'startDate', header: 'Start', type: 'date', editable: true },
        { key: 'endDate', header: 'End', type: 'date', editable: true },
        { key: 'baselineStartDate', header: 'Baseline Start', type: 'date', editable: true },
        { key: 'baselineEndDate', header: 'Baseline End', type: 'date', editable: true },
        { key: 'actualStartDate', header: 'Actual Start', type: 'date', editable: true },
        { key: 'actualEndDate', header: 'Actual End', type: 'date', editable: true },
        { key: 'evMethod', header: 'EV Method', type: 'select', editable: true, selectOptions: ['0/100', '50/50', 'percent_complete', 'weighted_milestone'] },
        { key: 'progressMethod', header: 'Progress Method', type: 'select', editable: true, selectOptions: ['hours', 'quantity', 'milestone'] },
        { key: 'percentComplete', header: '% Complete', type: 'number', editable: true },
        { key: 'baselineHours', header: 'Baseline Hrs', type: 'number', editable: true },
        { key: 'actualHours', header: 'Actual Hrs', type: 'number', editable: true },
        { key: 'remainingHours', header: 'Remaining Hrs', type: 'number', editable: false, autoCalculated: true },
        { key: 'baselineCost', header: 'Baseline Cost', type: 'number', editable: true },
        { key: 'actualCost', header: 'Actual Cost', type: 'number', editable: true },
        { key: 'remainingCost', header: 'Remaining Cost', type: 'number', editable: false, autoCalculated: true },
        { key: 'isActive', header: 'Active', type: 'boolean', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        phaseId: '',
        name: '',
        projectId: null,
        employeeId: null,
        methodology: '',
        sequence: 1,
        startDate: null,
        endDate: null,
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        // Calculated fields (remainingHours, remainingCost, percentComplete) will be computed by database
        baselineHours: 0,
        actualHours: 0,
        baselineCost: 0,
        actualCost: 0,
        comments: '',
        isActive: true,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    {
      key: 'tasks',
      label: 'Tasks',
      dataKey: 'tasks',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'taskId', header: 'Task ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'wbsCode', header: 'WBS Code', type: 'text', editable: true },
        { key: 'taskName', header: 'Name', type: 'text', editable: true },
        { key: 'description', header: 'Description', type: 'text', editable: true },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'phaseId', header: 'Phase', type: 'phase', editable: true },
        { key: 'parentTaskId', header: 'Parent Task', type: 'task', editable: true },
        // Resource Assignment - supports both specific employees and generic roles
        { key: 'assignedResourceType', header: 'Resource Type', type: 'select', editable: true, selectOptions: ['specific', 'generic'], tooltip: 'specific = named employee, generic = any with role' },
        { key: 'employeeId', header: 'Employee', type: 'employee', editable: true, tooltip: 'Required for specific, optional for generic' },
        { key: 'assignedResource', header: 'Role/Resource', type: 'role', editable: true, tooltip: 'Role name for generic, employee name for specific' },
        // Status & Priority
        { key: 'status', header: 'Status', type: 'select', editable: true, selectOptions: ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'] },
        { key: 'priority', header: 'Priority', type: 'select', editable: true, selectOptions: ['low', 'medium', 'high', 'critical'] },
        // Schedule Dates
        { key: 'baselineStartDate', header: 'BL Start', type: 'date', editable: true },
        { key: 'baselineEndDate', header: 'BL End', type: 'date', editable: true },
        { key: 'actualStartDate', header: 'Act Start', type: 'date', editable: true },
        { key: 'actualEndDate', header: 'Act End', type: 'date', editable: true },
        { key: 'plannedStartDate', header: 'Planned Start', type: 'date', editable: true },
        { key: 'plannedEndDate', header: 'Planned End', type: 'date', editable: true },
        { key: 'daysRequired', header: 'Days Req', type: 'number', editable: true },
        // Progress
        { key: 'percentComplete', header: '% Complete', type: 'number', editable: true },
        // Hours
        { key: 'baselineHours', header: 'BL Hrs', type: 'number', editable: true },
        { key: 'actualHours', header: 'Act Hrs', type: 'number', editable: true },
        { key: 'remainingHours', header: 'Rem Hrs', type: 'number', editable: false, autoCalculated: true },
        { key: 'projectedRemainingHours', header: 'Proj Rem Hrs', type: 'number', editable: true },
        // Cost
        { key: 'baselineCost', header: 'BL Cost', type: 'number', editable: true },
        { key: 'actualCost', header: 'Act Cost', type: 'number', editable: true },
        { key: 'remainingCost', header: 'Rem Cost', type: 'number', editable: false, autoCalculated: true },
        { key: 'baselineQty', header: 'BL Qty', type: 'number', editable: true },
        { key: 'actualQty', header: 'Act Qty', type: 'number', editable: true },
        { key: 'completedQty', header: 'Comp Qty', type: 'number', editable: true },
        { key: 'baselineCount', header: 'BL Count', type: 'number', editable: true },
        { key: 'baselineMetric', header: 'Baseline Metric', type: 'text', editable: true },
        { key: 'baselineUom', header: 'Baseline UOM', type: 'text', editable: true },
        { key: 'actualCount', header: 'Act Count', type: 'number', editable: true },
        { key: 'completedCount', header: 'Comp Count', type: 'number', editable: true },
        { key: 'uom', header: 'UOM', type: 'text', editable: true },
        { key: 'progressMethod', header: 'Progress Method', type: 'select', editable: true, selectOptions: ['hours', 'quantity', 'milestone'] },
        { key: 'evMethod', header: 'EV Method', type: 'select', editable: true, selectOptions: ['0/100', '50/50', 'percent_complete', 'weighted_milestone'] },
        { key: 'projectedHours', header: 'Projected Hours', type: 'number', editable: true },
        { key: 'hoursPerUnit', header: 'Hours/Unit', type: 'number', editable: true },
        { key: 'unitsPerHour', header: 'Units/Hour', type: 'number', editable: true },
        { key: 'productivityVariance', header: 'Productivity Var', type: 'number', editable: true },
        { key: 'constraintType', header: 'Constraint Type', type: 'select', editable: true, selectOptions: ['asap', 'alap', 'must_start_on', 'must_finish_on', 'start_no_earlier', 'start_no_later', 'finish_no_earlier', 'finish_no_later'] },
        { key: 'constraintDate', header: 'Constraint Date', type: 'date', editable: true },
        { key: 'calendarId', header: 'Calendar', type: 'text', editable: true },
        { key: 'milestoneReference', header: 'Milestone Ref', type: 'text', editable: true },
        { key: 'userStoryId', header: 'User Story', type: 'text', editable: true },
        { key: 'sprintId', header: 'Sprint', type: 'text', editable: true },
        // CPM Fields
        { key: 'earlyStart', header: 'ES', type: 'number', editable: false, autoCalculated: true, tooltip: 'Early Start' },
        { key: 'earlyFinish', header: 'EF', type: 'number', editable: false, autoCalculated: true, tooltip: 'Early Finish' },
        { key: 'lateStart', header: 'LS', type: 'number', editable: false, autoCalculated: true, tooltip: 'Late Start' },
        { key: 'lateFinish', header: 'LF', type: 'number', editable: false, autoCalculated: true, tooltip: 'Late Finish' },
        { key: 'totalFloat', header: 'Total Float', type: 'number', editable: false, autoCalculated: true },
        { key: 'freeFloat', header: 'Free Float', type: 'number', editable: false, autoCalculated: true },
        // Flags
        { key: 'is_critical', header: 'Critical', type: 'boolean', editable: true },
        { key: 'is_milestone', header: 'Milestone', type: 'boolean', editable: true },
        { key: 'isSubTask', header: 'Sub-Task', type: 'boolean', editable: true },
        // Predecessor
        { key: 'predecessorId', header: 'Predecessor', type: 'task', editable: true },
        { key: 'predecessorRelationship', header: 'Pred Rel', type: 'select', editable: true, selectOptions: ['FS', 'SS', 'FF', 'SF'] },
        // Notes
        { key: 'comments', header: 'Comments', type: 'text', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        taskId: '',
        wbsCode: '',
        taskName: '',
        description: '',
        projectId: null,
        phaseId: null,
        parentTaskId: null,
        // Resource assignment
        assignedResourceType: 'specific',
        employeeId: null,
        assignedResource: '',
        assignedResourceId: null,
        assignedResourceName: null,
        // Status
        status: 'Not Started',
        priority: 'medium',
        // Dates
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        plannedStartDate: null,
        plannedEndDate: null,
        daysRequired: 1,
        // Progress
        percentComplete: 0,
        // Hours
        baselineHours: 0,
        actualHours: 0,
        remainingHours: 0,
        projectedRemainingHours: 0,
        // Cost
        baselineCost: 0,
        actualCost: 0,
        remainingCost: 0,
        baselineQty: 0,
        actualQty: 0,
        completedQty: 0,
        uom: '',
        baselineMetric: '',
        baselineUom: '',
        actualCount: 0,
        completedCount: 0,
        progressMethod: 'hours',
        evMethod: 'percent_complete',
        projectedHours: 0,
        hoursPerUnit: 0,
        unitsPerHour: 0,
        productivityVariance: 0,
        constraintType: null,
        constraintDate: null,
        calendarId: null,
        milestoneReference: '',
        userStoryId: null,
        sprintId: null,
        // CPM
        earlyStart: 0,
        earlyFinish: 0,
        lateStart: 0,
        lateFinish: 0,
        totalFloat: 0,
        freeFloat: 0,
        // Flags
        is_critical: false,
        is_milestone: false,
        isSubTask: false,
        // Predecessor
        predecessorId: null,
        predecessorRelationship: null,
        // Notes
        comments: '',
        notes: '',
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      }),
      // Auto-set assignedResource based on employeeId when assignedResourceType is 'specific'
      onFieldChange: (row: any, field: string, value: any, _data: any) => {
        if (field === 'assignedResourceType') {
          if (value === 'generic') {
            // Clear employee when switching to generic
            return { ...row, assignedResourceType: value, employeeId: null };
          } else {
            // Clear role assignment when switching to specific
            return { ...row, assignedResourceType: value, assignedResource: '' };
          }
        }
        if (field === 'employeeId' && row.assignedResourceType === 'specific' && value) {
          const emp = (_data.employees || []).find((e: any) => (e.id || e.employeeId) === value);
          if (emp) {
            return { ...row, employeeId: value, assignedResource: emp.name, assignedResourceName: emp.name };
          }
        }
        return row;
      }
    },
    {
      key: 'subprojects',
      label: 'Subprojects',
      dataKey: 'subprojects',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'subprojectId', header: 'Subproject ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'sequence', header: 'Sequence', type: 'number', editable: true },
        { key: 'description', header: 'Description', type: 'text', editable: true },
        { key: 'baselineStartDate', header: 'Baseline Start', type: 'date', editable: true },
        { key: 'baselineEndDate', header: 'Baseline End', type: 'date', editable: true },
        { key: 'actualStartDate', header: 'Actual Start', type: 'date', editable: true },
        { key: 'actualEndDate', header: 'Actual End', type: 'date', editable: true },
        { key: 'percentComplete', header: '% Complete', type: 'number', editable: false, autoCalculated: true },
        { key: 'baselineHours', header: 'Baseline Hrs', type: 'number', editable: true },
        { key: 'actualHours', header: 'Actual Hrs', type: 'number', editable: true },
        { key: 'remainingHours', header: 'Remaining Hrs', type: 'number', editable: false, autoCalculated: true },
        { key: 'baselineCost', header: 'Baseline Cost', type: 'number', editable: true },
        { key: 'actualCost', header: 'Actual Cost', type: 'number', editable: true },
        { key: 'remainingCost', header: 'Remaining Cost', type: 'number', editable: false, autoCalculated: true },
        { key: 'isActive', header: 'Active', type: 'boolean', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        subprojectId: '',
        name: '',
        projectId: null,
        sequence: 1,
        description: '',
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        // Calculated fields (remainingHours, remainingCost, percentComplete) will be computed by database
        baselineHours: 0,
        actualHours: 0,
        baselineCost: 0,
        actualCost: 0,
        isActive: true,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    {
      key: 'taskQuantityEntries',
      label: 'Quantity Entries',
      dataKey: 'taskQuantityEntries',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'taskId', header: 'Task', type: 'task', editable: true },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'date', header: 'Date', type: 'date', editable: true },
        { key: 'qty', header: 'Quantity', type: 'number', editable: true },
        { key: 'qtyType', header: 'Type', type: 'select', editable: true, selectOptions: ['produced', 'completed'] },
        { key: 'notes', header: 'Notes', type: 'text', editable: true },
        { key: 'enteredBy', header: 'Entered By', type: 'text', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        taskId: null,
        projectId: null,
        date: new Date().toISOString().split('T')[0],
        qty: 0,
        qtyType: 'produced',
        notes: '',
        enteredBy: currentUserName,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      }),
    },
    {
      key: 'hours',
      label: 'Hour Entries',
      dataKey: 'hours',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'entryId', header: 'Entry ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'employeeId', header: 'Employee', type: 'employee', editable: true },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'phaseId', header: 'Phase', type: 'phase', editable: true },
        { key: 'taskId', header: 'Task', type: 'task', editable: true },
        { key: 'userStoryId', header: 'User Story', type: 'text', editable: true },
        { key: 'chargeCode', header: 'Charge Code', type: 'text', editable: true },
        { key: 'date', header: 'Date', type: 'date', editable: true },
        { key: 'hours', header: 'Hours', type: 'number', editable: true },
        { key: 'reportedStandardCostAmt', header: 'Cost', type: 'number', editable: true, tooltip: 'Cost from Workday (Reported_Standard_Cost_Amt) or manual entry' },
        { key: 'description', header: 'Description', type: 'text', editable: true },
        { key: 'billable', header: 'Billable (Legacy)', type: 'boolean', editable: true },
        { key: 'isBillable', header: 'Is Billable', type: 'boolean', editable: true },
        { key: 'isApproved', header: 'Is Approved', type: 'boolean', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        entryId: '',
        employeeId: null,
        taskId: null,
        projectId: null,
        phaseId: null,
        userStoryId: null,
        chargeCode: '',
        date: new Date().toISOString().split('T')[0],
        hours: 0,
        reportedStandardCostAmt: null,
        description: '',
        isBillable: true,
        isApproved: false,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    {
      key: 'milestonesTable',
      label: 'Milestones',
      dataKey: 'milestonesTable',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'milestoneId', header: 'Milestone ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'milestoneName', header: 'Name', type: 'text', editable: true },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'phaseId', header: 'Phase', type: 'phase', editable: true },
        { key: 'taskId', header: 'Task', type: 'task', editable: true },
        { key: 'customer', header: 'Customer', type: 'text', editable: true },
        { key: 'site', header: 'Site', type: 'text', editable: true },
        { key: 'plannedDate', header: 'Planned', type: 'date', editable: true },
        { key: 'forecastedDate', header: 'Forecast', type: 'date', editable: true },
        { key: 'actualDate', header: 'Actual', type: 'date', editable: true },
        { key: 'varianceDays', header: 'Variance', type: 'number', editable: false, autoCalculated: true, tooltip: 'Days between planned and actual' },
        { key: 'percentComplete', header: '% Complete', type: 'number', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        milestoneId: '',
        milestoneName: '',
        projectId: null,
        phaseId: null,
        taskId: null,
        customer: '',
        site: '',
        percentComplete: 0,
        plannedDate: null,
        forecastedDate: null,
        actualDate: null,
        // varianceDays will be calculated by database
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      }),
      // Calculations moved to database - no onFieldChange needed
    },
    {
      key: 'deliverables',
      label: 'Deliverables',
      dataKey: 'deliverables',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'deliverableId', header: 'Deliv ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'phaseId', header: 'Phase', type: 'phase', editable: true },
        { key: 'milestoneId', header: 'Milestone', type: 'text', editable: true, tooltip: 'Primary relationship - ties deliverable to milestone' },
        { key: 'employeeId', header: 'Owner', type: 'employee', editable: true },
        { key: 'type', header: 'Type', type: 'text', editable: true },
        { key: 'status', header: 'Status', type: 'select', editable: true, selectOptions: ['Not Started', 'In Progress', 'Under Review', 'Approved', 'Rejected'] },
        { key: 'dueDate', header: 'Due Date', type: 'date', editable: true },
        { key: 'completedDate', header: 'Completed', type: 'date', editable: true },
        { key: 'percentComplete', header: '% Complete', type: 'number', editable: true },
        { key: 'baselineStartDate', header: 'Baseline Start', type: 'date', editable: true },
        { key: 'baselineEndDate', header: 'Baseline End', type: 'date', editable: true },
        { key: 'actualStartDate', header: 'Actual Start', type: 'date', editable: true },
        { key: 'actualEndDate', header: 'Actual End', type: 'date', editable: true },
        { key: 'baselineHours', header: 'Baseline Hrs', type: 'number', editable: true },
        { key: 'actualHours', header: 'Actual Hrs', type: 'number', editable: true },
        { key: 'baselineCost', header: 'Baseline Cost', type: 'number', editable: true },
        { key: 'actualCost', header: 'Actual Cost', type: 'number', editable: true },
        { key: 'comments', header: 'Comments', type: 'text', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        deliverableId: '',
        name: '',
        projectId: null,
        phaseId: null,
        taskId: null,
        employeeId: null,
        assigneeId: null,
        type: 'Document',
        status: 'Not Started',
        dueDate: null,
        completedDate: null,
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        percentComplete: 0,
        baselineHours: 0,
        actualHours: 0,
        baselineCost: 0,
        actualCost: 0,
        comments: '',
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },

    {
      key: 'qctasks',
      label: 'QC Tasks',
      dataKey: 'qctasks',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'qcTaskId', header: 'QC ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'description', header: 'Description', type: 'text', editable: true },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'phaseId', header: 'Phase', type: 'phase', editable: true },
        { key: 'taskId', header: 'Task', type: 'task', editable: true },
        { key: 'assignedTo', header: 'Assigned To', type: 'employee', editable: true },
        { key: 'status', header: 'Status', type: 'select', editable: true, selectOptions: ['Not Started', 'In Progress', 'Completed', 'Pass', 'Fail'] },
        { key: 'dueDate', header: 'Due Date', type: 'date', editable: true },
        { key: 'completedDate', header: 'Completed', type: 'date', editable: true },
      ],
      defaultNewRow: () => ({
        id: '',
        qcTaskId: '',
        name: '',
        description: '',
        projectId: null,
        phaseId: null,
        taskId: null,
        assignedTo: null,
        status: 'Not Started',
        dueDate: null,
        completedDate: null,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    {
      key: 'projectHealth',
      label: 'Project Health',
      dataKey: 'projectHealth',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'projectName', header: 'Project Name', type: 'text', editable: false, autoCalculated: true, tooltip: 'Auto-filled from Project selection' },
        { key: 'workdayStatus', header: 'Workday Status', type: 'text', editable: true },
        { key: 'scheduleRequired', header: 'Schedule Required', type: 'boolean', editable: true },
        { key: 'totalContract', header: 'Total Contract', type: 'number', editable: true },
        { key: 'revTd', header: 'Rev TD', type: 'number', editable: true, tooltip: 'Revenue To Date' },
        { key: 'billedTd', header: 'Billed TD', type: 'number', editable: true, tooltip: 'Billed To Date' },
        { key: 'latestForecastedCost', header: 'Latest Forecasted Cost', type: 'number', editable: true },
        { key: 'forecastedGp', header: 'Forecasted GP', type: 'number', editable: false, autoCalculated: true, tooltip: 'Total Contract - Latest Forecasted Cost' },
        { key: 'forecastedGm', header: 'Forecasted GM', type: 'number', editable: false, autoCalculated: true, tooltip: 'Forecasted GP / Total Contract' },
        { key: 'baselineWork', header: 'Baseline Work', type: 'number', editable: true },
        { key: 'actualWork', header: 'Actual Work', type: 'number', editable: true },
        { key: 'remainingWork', header: 'Remaining Work', type: 'number', editable: false, autoCalculated: true },
        { key: 'workVariance', header: 'Work Variance', type: 'number', editable: false, autoCalculated: true },
        { key: 'baselineCost', header: 'Baseline Cost', type: 'number', editable: true },
        { key: 'actualCost', header: 'Actual Cost', type: 'number', editable: true },
        { key: 'scheduleForecastedCost', header: 'Schedule Forecasted Cost', type: 'number', editable: true },
        { key: 'costVariance', header: 'Cost Variance', type: 'number', editable: false, autoCalculated: true },
        { key: 'scheduleCostForecastedCostVariance', header: 'Schedule Cost-Forecasted Cost Variance', type: 'number', editable: false, autoCalculated: true },
        { key: 'overallStatus', header: 'Status', type: 'select', editable: true, selectOptions: ['draft', 'pending_review', 'approved', 'rejected'] },
        { key: 'overallScore', header: 'Score', type: 'number', editable: false, autoCalculated: true, tooltip: 'Calculated from health checks' },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        projectId: null,
        projectName: '',
        workdayStatus: '',
        scheduleRequired: false,
        totalContract: 0,
        revTd: 0,
        billedTd: 0,
        latestForecastedCost: 0,
        forecastedGp: 0,
        forecastedGm: 0,
        baselineWork: 0,
        actualWork: 0,
        remainingWork: 0,
        workVariance: 0,
        baselineCost: 0,
        actualCost: 0,
        scheduleForecastedCost: 0,
        costVariance: 0,
        scheduleCostForecastedCostVariance: 0,
        overallStatus: 'draft',
        overallScore: 0,
        checks: [],
        approvals: {},
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      }),
      onFieldChange: (row: any, field: string, value: any, allData: any) => {
        // Auto-fill project name when project is selected
        if (field === 'projectId' && value) {
          const project = (allData.projects || []).find((p: any) => p.id === value || p.projectId === value);
          if (project) {
            row.projectName = project.name;
          }
        }
        // Calculate Forecasted GP from Total Contract and Latest Forecasted Cost
        // Formula: Forecasted GP = Total Contract - Latest Forecasted Cost
        if (field === 'totalContract' || field === 'latestForecastedCost') {
          const totalContract = field === 'totalContract' ? (value || 0) : (row.totalContract || 0);
          const latestForecastedCost = field === 'latestForecastedCost' ? (value || 0) : (row.latestForecastedCost || 0);
          row.forecastedGp = totalContract - latestForecastedCost;
        }
        // Calculate Forecasted GM
        if (field === 'forecastedGp' || field === 'totalContract') {
          const gp = field === 'forecastedGp' ? (value || 0) : (row.forecastedGp || 0);
          const contract = field === 'totalContract' ? (value || 0) : (row.totalContract || 0);
          row.forecastedGm = contract > 0 ? (gp / contract) * 100 : 0;
        }
        return row;
      }
    },
    {
      key: 'projectLog',
      label: 'Project Log',
      dataKey: 'projectLog',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        {
          key: 'type', header: 'Type', type: 'select', editable: true,
          selectOptions: ['Assumptions', 'Issue', 'Risks', 'Decisions', 'Change',
            'Stakeholder', 'Lesson Learned', 'Success/Win', 'TWP Actions',
            'Variance Explanation']
        },
        { key: 'dateOpened', header: 'Date Opened', type: 'date', editable: true },
        { key: 'addedBy', header: 'Added By', type: 'text', editable: true },
        {
          key: 'internalExternal', header: 'Internal/External', type: 'select',
          editable: true, selectOptions: ['Internal', 'External']
        },
        { key: 'description', header: 'Description', type: 'text', editable: true },
        { key: 'owner', header: 'Owner', type: 'text', editable: true },
        { key: 'dueBy', header: 'Due By', type: 'date', editable: true },
        { key: 'mitigation', header: 'Mitigation', type: 'text', editable: true },
        {
          key: 'status', header: 'Status', type: 'select', editable: true,
          selectOptions: ['Open', 'In Progress', 'Resolved', 'Closed']
        },
        { key: 'dateClosed', header: 'Date Closed', type: 'date', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        logId: '',
        projectId: null,
        portfolioId: null,
        customerId: null,
        siteId: null,
        type: 'Issue',
        dateOpened: new Date().toISOString().split('T')[0],
        addedBy: '',
        internalExternal: 'Internal',
        description: '',
        owner: '',
        dueBy: null,
        mitigation: '',
        status: 'Open',
        dateClosed: null,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      }),
      onFieldChange: (row: any, field: string, value: any, allData: any) => {
        // Auto-populate portfolio, customer, site from project
        if (field === 'projectId' && value) {
          const project = (allData.projects || []).find(
            (p: any) => p.id === value || p.projectId === value
          );
          if (project) {
            row.portfolioId = project.portfolioId;
            row.customerId = project.customerId;
            row.siteId = project.siteId;
          }
        }
        return row;
      }
    },
    {
      key: 'snapshots',
      label: 'Snapshots',
      dataKey: 'snapshots',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'snapshotId', header: 'Snapshot ID', type: 'text', editable: false, autoCalculated: true },
        { key: 'snapshotDate', header: 'Snapshot Date', type: 'date', editable: true },
        { key: 'snapshotType', header: 'Type', type: 'select', editable: true, selectOptions: ['baseline', 'forecast', 'workday', 'manual', 'auto'] },
        { key: 'versionName', header: 'Version Name', type: 'text', editable: true },
        { key: 'createdBy', header: 'Created By', type: 'text', editable: true },
        { key: 'approvedBy', header: 'Approved By', type: 'text', editable: true },
        { key: 'approvedAt', header: 'Approved At', type: 'date', editable: true },
        { key: 'notes', header: 'Notes', type: 'text', editable: true },
        { key: 'isLocked', header: 'Locked', type: 'boolean', editable: false, autoCalculated: true },
        { key: 'scope', header: 'Scope', type: 'select', editable: true, selectOptions: ['project', 'site', 'customer', 'portfolio', 'all'] },
        { key: 'scopeId', header: 'Scope ID', type: 'text', editable: true },
        { key: 'totalHours', header: 'Total Hours', type: 'number', editable: false, autoCalculated: true },
        { key: 'totalCost', header: 'Total Cost', type: 'number', editable: false, autoCalculated: true },
        { key: 'totalProjects', header: 'Total Projects', type: 'number', editable: false, autoCalculated: true },
        { key: 'totalTasks', header: 'Total Tasks', type: 'number', editable: false, autoCalculated: true },
        { key: 'totalEmployees', header: 'Total Employees', type: 'number', editable: false, autoCalculated: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        snapshotId: '', // Database will auto-generate
        snapshotDate: new Date().toISOString().split('T')[0],
        snapshotType: 'baseline',
        versionName: '',
        createdBy: currentUserName,
        approvedBy: null,
        approvedAt: null,
        notes: '',
        isLocked: false,
        scope: 'project',
        scopeId: null,
        totalHours: null,
        totalCost: null,
        totalProjects: null,
        totalTasks: null,
        totalEmployees: null,
        snapshotData: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    },
    {
      key: 'approvalRecords',
      label: 'Approvals',
      dataKey: 'approvalRecords',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'entityType', header: 'Entity Type', type: 'select', editable: true, selectOptions: ['baselineSnapshot', 'forecastSnapshot', 'milestone', 'deliverable', 'qcGate'] },
        { key: 'entityId', header: 'Entity ID', type: 'text', editable: true },
        { key: 'approvalType', header: 'Approval Type', type: 'text', editable: true },
        { key: 'status', header: 'Status', type: 'select', editable: true, selectOptions: ['pending', 'approved', 'rejected'] },
        { key: 'approvedBy', header: 'Approved By', type: 'text', editable: true },
        { key: 'approvedAt', header: 'Approved At', type: 'date', editable: true },
        { key: 'notes', header: 'Notes', type: 'text', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        projectId: null,
        entityType: 'baselineSnapshot',
        entityId: '',
        approvalType: 'Baseline Snapshot',
        status: 'pending',
        approvedBy: currentUserName,
        approvedAt: new Date().toISOString().split('T')[0],
        notes: '',
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    {
      key: 'changeRequests',
      label: 'Change Requests',
      dataKey: 'changeRequests',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'title', header: 'Title', type: 'text', editable: true },
        { key: 'description', header: 'Description', type: 'text', editable: true },
        { key: 'category', header: 'Category', type: 'select', editable: true, selectOptions: ['scope', 'schedule', 'cost', 'quality', 'other'] },
        { key: 'status', header: 'Status', type: 'select', editable: true, selectOptions: ['submitted', 'assessed', 'approved', 'rejected', 'implemented'] },
        { key: 'submittedBy', header: 'Submitted By', type: 'text', editable: true },
        { key: 'submittedAt', header: 'Submitted At', type: 'date', editable: true },
        { key: 'approvedBy', header: 'Approved By', type: 'text', editable: true },
        { key: 'approvedAt', header: 'Approved At', type: 'date', editable: true },
        { key: 'implementedAt', header: 'Implemented At', type: 'date', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        projectId: null,
        title: '',
        description: '',
        category: 'scope',
        status: 'submitted',
        submittedBy: currentUserName,
        submittedAt: new Date().toISOString().split('T')[0],
        approvedBy: null,
        approvedAt: null,
        implementedAt: null,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    {
      key: 'changeImpacts',
      label: 'Change Impacts',
      dataKey: 'changeImpacts',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'changeRequestId', header: 'Change Request', type: 'changeRequest', editable: true },
        { key: 'entityLevel', header: 'Level', type: 'select', editable: true, selectOptions: ['project', 'phase', 'task'] },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'phaseId', header: 'Phase', type: 'phase', editable: true },
        { key: 'taskId', header: 'Task', type: 'task', editable: true },
        { key: 'deltaBaselineHours', header: 'Delta Baseline Hrs', type: 'number', editable: true },
        { key: 'deltaBaselineCost', header: 'Delta Baseline Cost', type: 'number', editable: true },
        { key: 'deltaStartDays', header: 'Delta Start Days', type: 'number', editable: true },
        { key: 'deltaEndDays', header: 'Delta End Days', type: 'number', editable: true },
        { key: 'deltaQty', header: 'Delta Qty', type: 'number', editable: true },
        { key: 'notes', header: 'Notes', type: 'text', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        changeRequestId: null,
        entityLevel: 'task',
        projectId: null,
        phaseId: null,
        taskId: null,
        deltaBaselineHours: 0,
        deltaBaselineCost: 0,
        deltaStartDays: 0,
        deltaEndDays: 0,
        deltaQty: 0,
        notes: '',
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      }),
      onFieldChange: (row: any, field: string, value: any, allData: any) => {
        if (field === 'entityLevel') {
          if (value === 'project') {
            return { ...row, entityLevel: value, phaseId: null, taskId: null };
          }
          if (value === 'phase') {
            return { ...row, entityLevel: value, taskId: null };
          }
          return { ...row, entityLevel: value };
        }
        if (field === 'taskId' && value) {
          const task = (allData.tasks || []).find((t: any) => (t.id || t.taskId) === value);
          if (task) {
            return { ...row, taskId: value, phaseId: task.phaseId || null, projectId: task.projectId || row.projectId };
          }
        }
        if (field === 'phaseId' && value) {
          const phase = (allData.phases || []).find((p: any) => (p.id || p.phaseId) === value);
          if (phase) {
            return { ...row, phaseId: value, projectId: phase.projectId || row.projectId };
          }
        }
        if (field === 'projectId' && row.entityLevel === 'project') {
          return { ...row, projectId: value, phaseId: null, taskId: null };
        }
        return row;
      }
    },
    {
      key: 'sprints',
      label: 'Sprints',
      dataKey: 'sprints',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'sprintId', header: 'Sprint ID', type: 'text', editable: true },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'startDate', header: 'Start Date', type: 'date', editable: true },
        { key: 'endDate', header: 'End Date', type: 'date', editable: true },
        { key: 'status', header: 'Status', type: 'select', editable: true, selectOptions: ['planned', 'active', 'completed', 'cancelled'] },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        sprintId: '',
        name: '',
        projectId: null,
        startDate: null,
        endDate: null,
        status: 'planned',
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    {
      key: 'epics',
      label: 'Epics',
      dataKey: 'epics',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'epicId', header: 'Epic ID', type: 'text', editable: true },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'description', header: 'Description', type: 'text', editable: true },
        { key: 'status', header: 'Status', type: 'select', editable: true, selectOptions: ['backlog', 'in_progress', 'done', 'cancelled'] },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        epicId: '',
        name: '',
        projectId: null,
        description: '',
        status: 'backlog',
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    {
      key: 'features',
      label: 'Features',
      dataKey: 'features',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'featureId', header: 'Feature ID', type: 'text', editable: true },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'epicId', header: 'Epic', type: 'text', editable: true },
        { key: 'description', header: 'Description', type: 'text', editable: true },
        { key: 'status', header: 'Status', type: 'select', editable: true, selectOptions: ['backlog', 'in_progress', 'done', 'cancelled'] },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        featureId: '',
        name: '',
        epicId: null,
        description: '',
        status: 'backlog',
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    {
      key: 'userStories',
      label: 'User Stories',
      dataKey: 'userStories',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'userStoryId', header: 'User Story ID', type: 'text', editable: true },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'featureId', header: 'Feature', type: 'text', editable: true },
        { key: 'description', header: 'Description', type: 'text', editable: true },
        { key: 'acceptanceCriteria', header: 'Acceptance Criteria', type: 'text', editable: true },
        { key: 'status', header: 'Status', type: 'select', editable: true, selectOptions: ['backlog', 'in_progress', 'done', 'cancelled'] },
        { key: 'sprintId', header: 'Sprint', type: 'text', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        userStoryId: '',
        name: '',
        featureId: null,
        description: '',
        acceptanceCriteria: '',
        status: 'backlog',
        sprintId: null,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    {
      key: 'employees',
      label: 'Employees',
      dataKey: 'employees',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'employeeId', header: 'Employee ID', type: 'text', editable: true },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'email', header: 'Email', type: 'text', editable: true },
        { key: 'jobTitle', header: 'Job Title', type: 'text', editable: true },
        { key: 'managementLevel', header: 'Mgmt Level', type: 'select', editable: true, selectOptions: ['Individual Contributor', 'Manager', 'Senior Manager', 'Director', 'VP', 'Partner'] },
        { key: 'manager', header: 'Manager', type: 'text', editable: true },
        { key: 'employeeType', header: 'Type', type: 'select', editable: true, selectOptions: ['Regular', 'Contractor', 'Intern'] },
        { key: 'role', header: 'Role', type: 'text', editable: true },
        { key: 'department', header: 'Department', type: 'text', editable: true },
        { key: 'hourlyRate', header: 'Rate', type: 'number', editable: true },
        { key: 'utilizationPercent', header: 'Util %', type: 'number', editable: true },
        { key: 'isActive', header: 'Active', type: 'boolean', editable: true },
      ],
      defaultNewRow: () => ({
        id: '', // Database will auto-generate
        employeeId: '',
        name: '',
        email: '',
        jobTitle: '',
        managementLevel: 'Individual Contributor',
        manager: '',
        employeeType: 'Regular',
        role: '',
        department: '',
        hourlyRate: 0,
        utilizationPercent: 80,
        isActive: true,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      }),
    },
    {
      key: 'projectDocuments',
      label: 'Project Documents',
      dataKey: 'projectDocuments',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: false },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'fileName', header: 'File Name', type: 'text', editable: false, autoCalculated: true },
        { key: 'documentType', header: 'Type', type: 'select', editable: true, selectOptions: ['DRD', 'QMP', 'SOP', 'Workflow', 'MPP', 'Excel', 'PDF', 'Word', 'Other'] },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'fileSize', header: 'Size', type: 'number', editable: false, autoCalculated: true },
        { key: 'uploadedAt', header: 'Uploaded', type: 'date', editable: false, autoCalculated: true },
        { key: 'uploadedBy', header: 'Uploaded By', type: 'text', editable: false },
        { key: 'isActive', header: 'Active', type: 'boolean', editable: true },
      ],
      defaultNewRow: () => ({
        id: '',
        name: '',
        fileName: '',
        documentType: 'Other',
        projectId: null,
        fileSize: 0,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUserName,
        isActive: true,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
  ], [currentUserName]);

  // ============================================================================
  // CORE TABLE HELPERS (Ordered after sections)
  // ============================================================================

  const getCurrentSection = useCallback(() => {
    return sections.find(s => s.key === selectedTable);
  }, [sections, selectedTable]);

  // Enhanced fuzzy filter that searches display values
  const fuzzyFilter: FilterFn<any> = useCallback((row, columnId, value, addMeta) => {
    const section = getCurrentSection();
    if (!section) return false;

    const field = section.fields.find(f => f.key === columnId);
    let cellValue = row.getValue(columnId);

    // Format value for search if it's a special type
    if (field && ['employee', 'project', 'customer', 'site', 'portfolio', 'phase', 'task'].includes(field.type)) {
      const options = getOptionsForType(field.type);
      const option = options.find((opt: any) => opt.id === cellValue);
      if (option) cellValue = option.name;
    } else if (field?.type === 'date' && cellValue) {
      try {
        cellValue = new Date(cellValue).toLocaleDateString();
      } catch {
        // ignore
      }
    } else if (typeof cellValue === 'boolean') {
      cellValue = cellValue ? 'Yes' : 'No';
    }

    const itemRank = rankItem(String(cellValue || ''), value);
    addMeta({ itemRank });
    return itemRank.passed;
  }, [getOptionsForType, getCurrentSection]);

  const addToImportLog = useCallback((entry: Omit<ImportLogEntry, 'id' | 'timestamp'>) => {
    const newEntry: ImportLogEntry = {
      ...entry,
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };
    setImportLog((prev: ImportLogEntry[]) => [...prev, newEntry]);
    return newEntry;
  }, []);

  const getSortValueForField = useCallback((row: Record<string, any>, field: FieldConfig): SortValue => {
    const value = row[field.key];
    if (value === null || value === undefined) return null;

    switch (field.type) {
      case 'number':
        return typeof value === 'number' ? value : Number(value);
      case 'boolean':
        return Boolean(value);
      case 'date':
        return value ? new Date(value) : null;
      case 'employee':
      case 'project':
      case 'customer':
      case 'site':
      case 'unit':
      case 'portfolio':
      case 'phase':
      case 'task':
      case 'role':
      case 'changeRequest': {
        const options = getOptionsForType(field.type);
        const option = options.find((opt: any) => opt.id === value);
        return option?.name || value;
      }
      default:
        return value;
    }
  }, [getOptionsForType]);

  const getTableData = useCallback(() => {
    const section = getCurrentSection();
    if (!section) return [];

    const baseData = (data as any)[section.dataKey] || [];

    // Apply any edited values
    const mergedData = baseData.map((row: any) => {
      const edited = editedRows.get(row[section.idKey]);
      return edited ? { ...row, ...edited } : row;
    });

    // Handle tasks filtering for non-subtasks
    let processed = section.key === 'tasks'
      ? [...mergedData.filter((t: any) => !t.isSubTask), ...newRows]
      : [...mergedData, ...newRows];

    // Apply default filter: hide inactive rows unless showInactive is true
    if (!showInactive && section.fields.some((f: FieldConfig) => f.key === 'isActive')) {
      processed = processed.filter((row: any) => row.isActive !== false);
    }

    // Apply column filters (Excel-style: selected values)
    const tableFilters = customColumnFilters[section.key] || {};
    if (Object.keys(tableFilters).length > 0) {
      processed = processed.filter((row: any) => {
        for (const [fieldKey, selectedValues] of Object.entries(tableFilters)) {
          if (!selectedValues || selectedValues.length === 0) continue;

          const cellValue = row[fieldKey];
          // Handle specific types for filtering
          let cellValueStr = '(blank)';
          if (cellValue !== null && cellValue !== undefined && cellValue !== '') {
            if (typeof cellValue === 'boolean') {
              cellValueStr = cellValue ? 'Yes' : 'No';
            } else {
              cellValueStr = String(cellValue);
            }
          }

          if (!selectedValues.includes(cellValueStr)) {
            return false;
          }
        }
        return true;
      });
    }

    // Table-specific logic
    if (section.key === 'changeRequests') {
      processed = processed.filter((row: any) => {
        if (changeRequestStatusFilter !== 'all' && row.status !== changeRequestStatusFilter) return false;
        const dateValue = row.submittedAt || row.approvedAt || row.createdAt;
        if (changeRequestFromDate && dateValue && new Date(dateValue) < new Date(changeRequestFromDate)) return false;
        if (changeRequestToDate && dateValue && new Date(dateValue) > new Date(changeRequestToDate)) return false;
        return true;
      });
    }

    // Sort the data based on tableSortStates
    const sortState = tableSortStates[section.key];
    if (sortState) {
      const field = section.fields.find(f => f.key === sortState.key);
      processed = [...processed].sort((a, b) => {
        const valA = getSortValueForField(a, field || { key: sortState.key, header: '', type: 'text', editable: false });
        const valB = getSortValueForField(b, field || { key: sortState.key, header: '', type: 'text', editable: false });

        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        const modifier = sortState.direction === 'asc' ? 1 : -1;
        return valA < valB ? -1 * modifier : 1 * modifier;
      });
    }

    return processed;
  }, [getCurrentSection, data, editedRows, newRows, changeRequestStatusFilter, changeRequestFromDate, changeRequestToDate, showInactive, customColumnFilters, tableSortStates, getSortValueForField]);


  // Clean data for Supabase - simple 1:1 mapping with minimal transformations
  const cleanDataForSupabase = useCallback((records: Record<string, any>[]): Record<string, unknown>[] => {
    const nullLike = new Set(['', '-', 'null', 'undefined', 'n/a']);

    return records.map(record => {
      const cleaned: Record<string, unknown> = {};

      // Ensure 'id' is always set (required primary key)
      // Database will auto-generate if empty
      cleaned.id = record.id || '';

      // Process all fields - direct 1:1 mapping
      for (const [key, value] of Object.entries(record)) {
        // Skip id as it's already handled
        if (key === 'id') continue;

        // Convert empty strings to null for foreign keys and optional fields
        if (typeof value === 'string') {
          const trimmed = value.trim();
          const lowered = trimmed.toLowerCase();
          if (nullLike.has(lowered)) {
            cleaned[key] = null;
          } else if (key.endsWith('Id') && trimmed === '') {
            // Empty foreign key IDs become null
            cleaned[key] = null;
          } else {
            cleaned[key] = trimmed;
          }
        } else if (key.endsWith('Id') && (value === '' || value === null || value === undefined)) {
          // Ensure foreign key IDs are null if empty
          cleaned[key] = null;
        } else {
          // Pass through all other values as-is
          cleaned[key] = value;
        }
      }

      return cleaned;
    });
  }, []);

  // ============================================================================
  // SUPABASE SYNC
  // ============================================================================

  const syncToSupabase = useCallback(async (dataKey: string, records: Record<string, unknown>[]) => {
    if (!supabaseEnabled) {
      return { success: true, message: 'Local only' };
    }

    setIsSyncing(true);
    addToImportLog({ type: 'info', entity: dataKey, action: 'sync', message: 'Syncing to Supabase...' });

    try {
      // Use API route with service role key for proper permissions
      const cleanedRecords = cleanDataForSupabase(records as Record<string, any>[]);

      const response = await fetch('/api/data/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataKey, records: cleanedRecords }),
      });

      const result = await response.json();

      if (result.success) {
        addToImportLog({ type: 'success', entity: dataKey, action: 'sync', message: `Synced ${result.count} records` });
        return { success: true, message: `Synced ${result.count}` };
      } else {
        addToImportLog({ type: 'error', entity: dataKey, action: 'sync', message: result.error || 'Failed' });
        return { success: false, message: result.error || 'Failed' };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addToImportLog({ type: 'error', entity: dataKey, action: 'sync', message });
      return { success: false, message };
    } finally {
      setIsSyncing(false);
    }
  }, [supabaseEnabled, addToImportLog, cleanDataForSupabase]);



  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  const handleAddRow = useCallback(() => {
    const section = getCurrentSection();
    if (!section) return;

    const newRow = section.defaultNewRow();
    setNewRows((prev: any[]) => [...prev, newRow]);
    setSelectedRows((prev: Set<string>) => new Set([...prev, newRow[section.idKey]]));
  }, [getCurrentSection]);

  const handleDeleteSelected = useCallback(async () => {
    const section = getCurrentSection();
    if (!section || selectedRows.size === 0) return;

    setNewRows((prev: any[]) => prev.filter((row: any) => !selectedRows.has(row[section.idKey])));

    const existingData = (data as any)[section.dataKey] || [];
    const filteredData = existingData.filter((row: any) => !selectedRows.has(row[section.idKey]));

    updateData({ [section.dataKey]: filteredData });

    if (supabaseEnabled && DATA_KEY_TO_TABLE[section.key]) {
      await syncToSupabase(section.key, filteredData);
    }

    setSelectedRows(new Set());
    setUploadStatus({ type: 'success', message: `Deleted ${selectedRows.size} row(s)` });
  }, [getCurrentSection, selectedRows, data, updateData, supabaseEnabled, syncToSupabase]);

  const handleCreateSnapshot = useCallback(() => {
    const section = getCurrentSection();
    if (!section) return;

    // Handle unified snapshots
    if (section.key === 'snapshots') {
      if (!data.projects || data.projects.length === 0) {
        setUploadStatus({ type: 'error', message: 'Add a project before creating snapshots.' });
        return;
      }

      const effectiveDate = snapshotDate || new Date().toISOString().split('T')[0];
      const versionName = snapshotVersionName || `${snapshotType} ${effectiveDate}`;

      const input: SnapshotCreateInput = {
        snapshotDate: effectiveDate,
        snapshotType,
        versionName,
        createdBy: snapshotCreatedBy || currentUserName || 'System',
        notes: snapshotNotes || null,
        scope: snapshotScope,
        scopeId: snapshotScopeId || null,
      };

      const newSnapshot = createSnapshot(data, input);
      setNewRows((prev: any[]) => [...prev, newSnapshot]);
      setUploadStatus({ type: 'success', message: `Created unified snapshot ${versionName}. Save to persist.` });
      setSnapshotVersionName('');
      setSnapshotNotes('');
      setSnapshotScopeId('');
      return;
    }

  }, [getCurrentSection, data, snapshotDate, snapshotVersionName, snapshotCreatedBy, snapshotNotes, currentUserName, snapshotType, snapshotScope, snapshotScopeId]);

  const handleLockSnapshots = useCallback(() => {
    const section = getCurrentSection();
    if (!section || section.key !== 'snapshots') return;

    const tableData = getTableData();
    const selectedSnapshotIds = new Set(
      tableData
        .filter((row: any) => selectedRows.has(row[section.idKey]))
        .map((row: any) => row.snapshotId)
    );

    if (selectedSnapshotIds.size === 0) {
      setUploadStatus({ type: 'info', message: 'Select a snapshot row to lock.' });
      return;
    }

    setEditedRows((prev: Map<string, any>) => {
      const next = new Map(prev);
      tableData.forEach((row: any) => {
        if (selectedSnapshotIds.has(row.snapshotId) && !row.isLocked) {
          const existing = next.get(row[section.idKey]) || {};
          next.set(row[section.idKey], { ...existing, isLocked: true });
        }
      });
      return next;
    });

    setUploadStatus({ type: 'info', message: `Locked ${selectedSnapshotIds.size} snapshot(s). Save to apply.` });
  }, [getCurrentSection, getTableData, selectedRows]);

  const handleSaveChanges = useCallback(async () => {
    const section = getCurrentSection();
    if (!section) return;

    setIsSyncing(true);
    const existingData = (data as any)[section.dataKey] || [];

    const updatedData = existingData.map((row: any) => {
      const edited = editedRows.get(row[section.idKey]);
      return edited ? { ...row, ...edited, updatedAt: getCurrentTimestamp() } : row;
    });

    const updatedNewRows = newRows.map((row: any) => {
      const edited = editedRows.get(row[section.idKey]);
      return edited ? { ...row, ...edited, updatedAt: getCurrentTimestamp() } : row;
    });
    const allData = [...updatedData, ...updatedNewRows];

    updateData({ [section.dataKey]: allData });

    let syncMessage = '';
    if (supabaseEnabled && DATA_KEY_TO_TABLE[section.key]) {
      const syncResult = await syncToSupabase(section.key, allData);
      syncMessage = syncResult.success ? ' - Synced' : ` - ${syncResult.message}`;
    }

    setEditedRows(new Map());
    setNewRows([]);
    setIsSyncing(false);

    setUploadStatus({
      type: syncMessage.includes('Synced') || !supabaseEnabled ? 'success' : 'error',
      message: `Saved to ${section.label}${syncMessage}`
    });
  }, [getCurrentSection, data, editedRows, newRows, updateData, supabaseEnabled, syncToSupabase]);

  const handleCellEdit = useCallback((rowId: string, field: string, value: any) => {
    const section = getCurrentSection();
    if (!section) return;

    // Check if this is a new row
    const newRowIndex = newRows.findIndex((r: any) => r[section.idKey] === rowId);
    const newRow = newRowIndex >= 0 ? newRows[newRowIndex] : null;
    const baseRow = (data as any)[section.dataKey]?.find((r: any) => r[section.idKey] === rowId);
    const isLocked = Boolean((editedRows.get(rowId) as any)?.isLocked ?? newRow?.isLocked ?? baseRow?.isLocked);
    if (isLocked) return;
    if (newRowIndex >= 0) {
      setNewRows((prev: any[]) => {
        const updated = [...prev];
        updated[newRowIndex] = { ...updated[newRowIndex], [field]: value };

        // Apply onFieldChange if defined
        if (section.onFieldChange) {
          updated[newRowIndex] = section.onFieldChange(updated[newRowIndex], field, value, data);
        }

        return updated;
      });
    } else {
      setEditedRows((prev: Map<string, any>) => {
        const newMap = new Map(prev);
        const existing = newMap.get(rowId) || {};
        let updated = { ...existing, [field]: value };

        // Apply onFieldChange if defined
        if (section.onFieldChange) {
          const baseRow = (data as any)[section.dataKey]?.find((r: any) => r[section.idKey] === rowId) || {};
          updated = section.onFieldChange({ ...baseRow, ...updated }, field, value, data);
        }

        newMap.set(rowId, updated);
        return newMap;
      });
    }
  }, [getCurrentSection, newRows, data, editedRows]);

  const handleRowSelect = useCallback((rowId: string, selected: boolean) => {
    setSelectedRows((prev: Set<string>) => {
      const newSet = new Set(prev);
      if (selected) newSet.add(rowId);
      else newSet.delete(rowId);
      return newSet;
    });
  }, []);
  const handleSelectAll = useCallback((selected: boolean) => {
    const section = getCurrentSection();
    if (!section) return;

    if (selected) {
      const tableData = getTableData();
      const sortState = tableSortStates[section.key] || null;
      const sortedTableData = sortByState(tableData, sortState, (row: any, key: string) => {
        const field = section.fields.find((f: FieldConfig) => f.key === key);
        return field ? getSortValueForField(row, field) : row[key];
      });
      setSelectedRows(new Set(sortedTableData.map((row: any) => row[section.idKey])));
    } else {
      setSelectedRows(new Set());
    }
  }, [getCurrentSection, getTableData, tableSortStates, sortByState, getSortValueForField]);

  // ============================================================================
  // FILE UPLOAD HANDLER
  // ============================================================================

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadStatus({ type: null, message: '' });
    setImportLog([]);
    setImportSummary(null);
    setIsImporting(true);
    setShowImportLog(true);

    const startTime = Date.now();
    const summary: ImportSummary = { total: 0, added: 0, edited: 0, deleted: 0, skipped: 0, errors: 0 };

    try {
      addToImportLog({ type: 'info', entity: 'System', action: 'process', message: `Starting import of ${file.name}...` });

      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        const parsed = parseCSVString(text);
        summary.total = parsed.length - 1;

        const headers = parsed[0] || [];
        const dataType = detectCSVDataType(headers);

        if (dataType === 'employees') {
          const employees = convertWorkdayEmployees(parsed);
          summary.added = employees.length;

          const employeesWithIds = employees.map(emp => ({
            ...emp,
            id: emp.employeeId || '', // Database will auto-generate if empty
            isActive: true,
            hourlyRate: 0,
            utilizationPercent: 80,
          }));

          updateData({ employees: employeesWithIds });

          if (supabaseEnabled) {
            await syncToSupabase('employees', employeesWithIds);
          }

          addToImportLog({ type: 'success', entity: 'Employees', action: 'add', message: `Added ${employees.length} employees` });
          setUploadStatus({ type: 'success', message: `Loaded ${employees.length} employees` });
        } else if (dataType === 'tasks') {
          const result = convertWorkdayTasks(parsed);
          const tasks = result.tasks || [];
          summary.added = tasks.length;

          updateData({ tasks });

          if (supabaseEnabled) {
            await syncToSupabase('tasks', tasks);
          }

          addToImportLog({ type: 'success', entity: 'Tasks', action: 'add', message: `Added ${tasks.length} tasks from Workday` });
          setUploadStatus({ type: 'success', message: `Loaded ${tasks.length} tasks` });
        } else {
          addToImportLog({ type: 'warning', entity: 'CSV', action: 'skip', message: 'Unknown CSV format' });
          setUploadStatus({ type: 'error', message: 'Unknown CSV format' });
        }
      } else if (file.name.endsWith('.json')) {
        const text = await file.text();
        const jsonData = JSON.parse(text);
        const parsedData = convertProjectPlanJSON(jsonData);

        updateData(parsedData);

        if (supabaseEnabled) {
          for (const [key, records] of Object.entries(parsedData)) {
            if (Array.isArray(records) && records.length > 0 && DATA_KEY_TO_TABLE[key]) {
              await syncToSupabase(key, records as unknown as Record<string, unknown>[]);
            }
          }
        }

        setUploadStatus({ type: 'success', message: 'Loaded project data' });
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const result = await importFromExcel(file);

        if (result.success && Object.keys(result.data).length > 0) {
          updateData(result.data);

          if (supabaseEnabled) {
            for (const [key, records] of Object.entries(result.data)) {
              if (Array.isArray(records) && records.length > 0 && DATA_KEY_TO_TABLE[key]) {
                await syncToSupabase(key, records as unknown as Record<string, unknown>[]);
              }
            }
          }

          setUploadStatus({ type: 'success', message: `Imported ${result.summary.rowsImported} rows` });
        } else {
          setUploadStatus({ type: 'error', message: 'Import failed' });
        }
      } else if (file.name.endsWith('.mpp')) {
        // Handle MPP file upload - just upload, don't process yet
        addToImportLog({ type: 'info', entity: 'MPP', action: 'process', message: 'Uploading MPP file...' });

        // Get project ID from selected table or prompt user
        const currentSection = getCurrentSection();
        let projectId: string | null = null;

        if (currentSection?.key === 'projects' && selectedRows.size === 1) {
          const selectedProjectId = Array.from(selectedRows)[0];
          projectId = selectedProjectId;
        } else {
          // Prompt user for project ID
          const userProjectId = prompt('Enter Project ID to associate with this MPP file:');
          if (userProjectId) {
            projectId = userProjectId;
          }
        }

        if (!projectId) {
          setUploadStatus({ type: 'error', message: 'Project ID required for MPP file upload' });
          setIsImporting(false);
          return;
        }

        // Upload MPP file (without processing)
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', projectId);
        formData.append('documentType', 'MPP'); // Use uppercase to match database constraint

        try {
          const response = await fetch('/api/documents/upload', {
            method: 'POST',
            body: formData,
          });

          const result = await response.json();

          if (result.success) {
            addToImportLog({ type: 'success', entity: 'MPP', action: 'add', message: 'MPP file uploaded successfully. Go to "Project Documents" table to read and process it.' });
            setUploadStatus({ type: 'success', message: 'MPP file uploaded. Go to Project Documents table to read and process.' });

            // Switch to projectDocuments table and refresh data
            setSelectedTable('projectDocuments');
            await refreshData();
          } else {
            addToImportLog({ type: 'error', entity: 'MPP', action: 'skip', message: result.error || 'Upload failed' });
            setUploadStatus({ type: 'error', message: result.error || 'Upload failed' });
          }
        } catch (uploadError: any) {
          addToImportLog({ type: 'error', entity: 'MPP', action: 'skip', message: uploadError.message || 'Upload error' });
          setUploadStatus({ type: 'error', message: uploadError.message || 'Upload error' });
        }
      } else {
        setUploadStatus({ type: 'error', message: 'Unsupported file format' });
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      addToImportLog({ type: 'info', entity: 'System', action: 'process', message: `Completed in ${duration}s` });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addToImportLog({ type: 'error', entity: 'System', action: 'skip', message: errorMessage });
      setUploadStatus({ type: 'error', message: errorMessage });
    }

    setImportSummary(summary);
    setIsImporting(false);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ============================================================================
  // CELL RENDERER
  // ============================================================================

  const renderCell = useCallback((
    row: Record<string, any>,
    field: FieldConfig,
    rowId: string
  ) => {
    const value = row[field.key];
    const isEdited = editedRows.has(rowId) && editedRows.get(rowId)?.[field.key] !== undefined;
    const editedValue = isEdited ? editedRows.get(rowId)?.[field.key] : value;
    const displayValue = editedValue ?? value;
    const isLocked = Boolean(editedRows.get(rowId)?.isLocked ?? row.isLocked);

    // Non-editable fields
    if (isLocked || !field.editable || field.autoCalculated) {
      let formattedValue = '-';
      if (displayValue !== null && displayValue !== undefined && displayValue !== '') {
        if (typeof displayValue === 'boolean') {
          formattedValue = displayValue ? 'Yes' : 'No';
        } else if (typeof displayValue === 'number') {
          // Format file size in bytes to human-readable format
          if (field.key === 'fileSize' || field.key === 'file_size') {
            const bytes = displayValue;
            if (bytes === 0) formattedValue = '0 B';
            else if (bytes < 1024) formattedValue = `${bytes} B`;
            else if (bytes < 1024 * 1024) formattedValue = `${(bytes / 1024).toFixed(1)} KB`;
            else formattedValue = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
          } else {
            formattedValue = field.key.includes('cpi') || field.key.includes('spi')
              ? displayValue.toFixed(2)
              : displayValue.toString();
          }
        } else if (field.type === 'date' || field.key.includes('Date') || field.key.includes('At') || field.key === 'uploadedAt' || field.key === 'uploaded_at') {
          // Format date values
          try {
            const dateValue = typeof displayValue === 'string' ? displayValue : displayValue;
            const date = new Date(dateValue as string);
            if (!isNaN(date.getTime())) {
              formattedValue = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            } else {
              formattedValue = displayValue ? String(displayValue) : '-';
            }
          } catch {
            formattedValue = displayValue ? String(displayValue) : '-';
          }
        } else {
          formattedValue = String(displayValue);
        }
      }
      return (
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'block',
          }}
          title={field.tooltip || formattedValue}
        >
          {formattedValue}
        </span>
      );
    }

    // Boolean dropdown
    if (field.type === 'boolean') {
      return (
        <div style={{ width: '100%', minWidth: BOOLEAN_SELECT_WIDTH }}>
          <select
            value={displayValue ? 'true' : 'false'}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleCellEdit(rowId, field.key, e.target.value === 'true')}
            style={{
              padding: '4px 6px',
              fontSize: '0.7rem',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              width: '100%',
              minWidth: BOOLEAN_SELECT_WIDTH,
            }}
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      );
    }

    // Select dropdown
    if (field.type === 'select' && field.selectOptions) {
      return (
        <div style={{ width: '100%', minWidth: SELECT_FIXED_WIDTH }}>
          <select
            value={displayValue || ''}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleCellEdit(rowId, field.key, e.target.value)}
            style={{
              padding: '4px 6px',
              fontSize: '0.7rem',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              width: '100%',
              minWidth: SELECT_FIXED_WIDTH,
            }}
          >
            <option value="">-</option>
            {field.selectOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    }

    // Date picker
    if (field.type === 'date') {
      let dateValue: Date | undefined = undefined;
      if (displayValue) {
        if (typeof displayValue === 'string') {
          // Parse YYYY-MM-DD as local date to prevent timezone shifts
          const parts = displayValue.split('-');
          if (parts.length === 3) {
            dateValue = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          } else {
            dateValue = new Date(displayValue);
          }
        } else if (displayValue instanceof Date) {
          dateValue = displayValue;
        }
      }

      return (
        <div style={{ width: '100%', minWidth: '130px' }}>
          <DatePicker
            value={dateValue}
            onChange={(date) => {
              // Ensure we save as simplified ISO string (YYYY-MM-DD) if possible or ISO
              handleCellEdit(rowId, field.key, date)
            }}
            placeholder="Select"
          />
        </div>
      );
    }

    // FK dropdowns (employee, project, etc.)
    if (['employee', 'project', 'customer', 'site', 'portfolio', 'phase', 'task', 'changeRequest', 'unit'].includes(field.type)) {
      const options = getOptionsForType(field.type);
      return (
        <div style={{ width: '100%', minWidth: DROPDOWN_MIN_WIDTH, maxWidth: DROPDOWN_MAX_WIDTH }}>
          <SearchableDropdown
            value={displayValue || null}
            options={options}
            onChange={(id) => handleCellEdit(rowId, field.key, id)}
            placeholder="Select..."
            width="100%"
          />
        </div>
      );
    }

    // Text/Number input
    return (
      <div
        contentEditable
        suppressContentEditableWarning
        onBlur={(e: React.FocusEvent<HTMLDivElement>) => {
          const newValue = e.currentTarget.textContent || '';
          if (newValue !== String(displayValue || '')) {
            const parsed = field.type === 'number' ? parseFloat(newValue) || 0 : newValue;
            handleCellEdit(rowId, field.key, parsed);
          }
        }}
        style={{
          fontSize: '0.75rem',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          cursor: 'text',
          background: isEdited ? 'rgba(205, 220, 57, 0.1)' : 'rgba(64, 224, 208, 0.02)',
          outline: 'none',
          minHeight: '1.2em',
        }}
      >
        {displayValue ?? '-'}
      </div>
    );
  }, [editedRows, handleCellEdit, getOptionsForType]);

  // ============================================================================
  // TANSTACK TABLE SETUP
  // ============================================================================

  // Build TanStack Table columns from section fields
  const buildTableColumns = useCallback((section: SectionConfig): ColumnDef<any>[] => {
    const columns: ColumnDef<any>[] = [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={(e) => table.toggleAllRowsSelected(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
        ),
        cell: ({ row }) => {
          const rowId = row.original[section.idKey];
          return (
            <input
              type="checkbox"
              checked={selectedRows.has(rowId)}
              onChange={(e) => handleRowSelect(rowId, e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
          );
        },
        enableSorting: false,
        enableColumnFilter: false,
        size: 36,
      },
      ...section.fields.map((field: FieldConfig): ColumnDef<any> => ({
        id: field.key,
        accessorKey: field.key,
        header: () => (
          <TableFilterHeader
            section={section}
            field={field}
            data={data}
            getUniqueValues={getUniqueValues}
            tableSortStates={tableSortStates}
            setTableSortStates={setTableSortStates}
            customColumnFilters={customColumnFilters}
            setCustomColumnFilters={setCustomColumnFilters}
            openFilterDropdown={openFilterDropdown}
            setOpenFilterDropdown={setOpenFilterDropdown}
            filterSearchText={filterSearchText}
            setFilterSearchText={setFilterSearchText}
            filterDropdownPosition={filterDropdownPosition}
            setFilterDropdownPosition={setFilterDropdownPosition}
            filterButtonRefs={filterButtonRefs}
            filterDropdownRef={filterDropdownRef}
          />
        ),
        cell: ({ row }) => {
          const rowId = row.original[section.idKey];
          return renderCell(row.original, field, rowId);
        },
        enableSorting: true,
        enableColumnFilter: true,
        filterFn: fuzzyFilter,
        size: field.width ? parseInt(field.width) : (field.type === 'text' && field.key.length > 10 ? 250 : 180),
        minSize: 120,
        maxSize: 800,
      })),
    ];

    // Add actions column for projectDocuments
    if (section.key === 'projectDocuments') {
      columns.push({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const doc = row.original as any;
          const docType = doc.documentType || doc.document_type || '';
          const isMPP = docType === 'MPP';

          return (
            <div style={{ display: 'flex', gap: '4px', whiteSpace: 'nowrap', alignItems: 'center', justifyContent: 'flex-start' }}>
              {isMPP && (
                <>
                  <button
                    onClick={async () => {
                      setProcessingMPP(doc.id);
                      try {
                        const formData = new FormData();
                        formData.append('file', new File([], doc.fileName || doc.file_name || doc.name));
                        formData.append('documentId', doc.id);

                        const response = await fetch('/api/documents/read-mpp', {
                          method: 'POST',
                          body: formData,
                        });

                        const result = await response.json();
                        if (result.success) {
                          setMppAnalysis({
                            documentId: doc.id,
                            analysis: result.analysis,
                            logs: result.analysis.recommendations?.map((r: string) => ({
                              type: 'info',
                              message: r,
                              timestamp: new Date().toISOString(),
                            })) || [],
                          });
                          addToImportLog({ type: 'info', entity: 'MPP', action: 'process', message: `Analysis complete for ${doc.fileName || doc.file_name || doc.name}` });
                        } else {
                          addToImportLog({ type: 'error', entity: 'MPP', action: 'skip', message: result.error || 'Read failed' });
                        }
                      } catch (err: any) {
                        addToImportLog({ type: 'error', entity: 'MPP', action: 'skip', message: err.message || 'Read failed' });
                      } finally {
                        setProcessingMPP(null);
                      }
                    }}
                    className="btn btn-secondary btn-sm"
                    disabled={processingMPP === doc.id}
                    style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                    title="Read and analyze MPP file structure"
                  >
                    {processingMPP === doc.id ? '...' : 'Read'}
                  </button>
                  <button
                    onClick={async () => {
                      if (!doc.projectId) {
                        alert('Project ID required. Please set the project for this document first.');
                        return;
                      }
                      
                      // Show hierarchy selection modal
                      const portfolioId = prompt('Select Portfolio ID:');
                      if (!portfolioId) return;
                      
                      const customerId = prompt('Select Customer ID:');
                      if (!customerId) return;
                      
                      const siteId = prompt('Select Site ID:');
                      if (!siteId) return;
                      
                      setProcessingMPP(doc.id);
                      addToImportLog({ type: 'info', entity: 'MPP', action: 'process', message: `Processing MPP file: ${doc.fileName || doc.file_name || doc.name}...` });
                      try {
                        const formData = new FormData();
                        formData.append('documentId', doc.id);
                        formData.append('projectId', doc.projectId);
                        formData.append('portfolioId', portfolioId);
                        formData.append('customerId', customerId);
                        formData.append('siteId', siteId);

                        const response = await fetch('/api/documents/process-mpp', {
                          method: 'POST',
                          body: formData,
                        });

                        const result = await response.json();
                        if (result.success && result.logs) {
                          result.logs.forEach((log: any) => {
                            addToImportLog({
                              type: log.type as 'info' | 'success' | 'warning' | 'error',
                              entity: 'MPP',
                              action: 'process',
                              message: log.message,
                            });
                          });
                          await refreshData();
                          setUploadStatus({ type: 'success', message: 'MPP file processed successfully' });
                        } else {
                          addToImportLog({ type: 'error', entity: 'MPP', action: 'skip', message: result.error || 'Processing failed' });
                          setUploadStatus({ type: 'error', message: result.error || 'Processing failed' });
                        }
                      } catch (err: any) {
                        addToImportLog({ type: 'error', entity: 'MPP', action: 'skip', message: err.message || 'Process error' });
                        setUploadStatus({ type: 'error', message: err.message || 'Process error' });
                      } finally {
                        setProcessingMPP(null);
                      }
                    }}
                    className="btn btn-primary btn-sm"
                    disabled={processingMPP === doc.id || !doc.projectId}
                    style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                    title="Process MPP file and import data"
                  >
                    {processingMPP === doc.id ? '...' : 'Process'}
                  </button>
                </>
              )}
              <button
                onClick={async () => {
                  try {
                    const response = await fetch(`/api/documents/download?documentId=${doc.id}`);
                    const result = await response.json();
                    if (result.success && result.url) {
                      const link = document.createElement('a');
                      link.href = result.url;
                      link.download = result.fileName || doc.fileName || doc.file_name || doc.name;
                      link.target = '_blank';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    } else {
                      alert(result.error || 'Download failed');
                    }
                  } catch (err: any) {
                    alert(err.message || 'Download error');
                  }
                }}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                title="Download file"
              >
                Download
              </button>
            </div>
          );
        },
        size: 250,
        minSize: 180,
        maxSize: 350,
        enableSorting: false,
        enableColumnFilter: false,
      });
    }

    return columns;
  }, [getTableData, getUniqueValues, customColumnFilters, openFilterDropdown, filterSearchText, tableSortStates, formatSortIndicator, getNextSortState, selectedRows, handleRowSelect, renderCell, processingMPP, addToImportLog, refreshData, setUploadStatus, setProcessingMPP, setMppAnalysis]);

  // ============================================================================
  // TABLE RENDERER
  // ============================================================================

  // TanStack Table data and columns - memoized based on current section
  const tableData = useMemo(() => {
    return getTableData();
  }, [getTableData, selectedTable, data, editedRows, newRows, showInactive, customColumnFilters, tableSortStates]);

  const tableColumns = useMemo(() => {
    const section = getCurrentSection();
    if (!section) return [];
    return buildTableColumns(section);
  }, [getCurrentSection, buildTableColumns, selectedTable, customColumnFilters, openFilterDropdown, filterSearchText, tableSortStates, selectedRows, data]);

  // TanStack Table instance - must be at top level
  const table = useReactTable({
    data: tableData,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      columnFilters,
      sorting,
      columnSizing,
      columnVisibility,
      globalFilter,
    },
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: fuzzyFilter,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    defaultColumn: {
      minSize: 80,
      maxSize: 500,
      size: 150,
    },
  });

  // Handle click outside filter dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        openFilterDropdown &&
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(target) &&
        !target.closest('[data-filter-button]')
      ) {
        setOpenFilterDropdown(null);
      }
    };

    if (openFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [openFilterDropdown]);

  const renderTable = useCallback(() => {
    const section = getCurrentSection();
    if (!section) return null;
    const sortState = tableSortStates[section.key] || null;
    const sortedTableData = sortByState(tableData, sortState, (row: any, key: string) => {
      const field = section.fields.find((f: FieldConfig) => f.key === key);
      return field ? getSortValueForField(row, field) : row[key];
    });
    const isSnapshotSection = section.key === 'snapshots';
    const isChangeRequestSection = section.key === 'changeRequests';
    const isChangeImpactSection = section.key === 'changeImpacts';
    const showChangeSummary = isChangeRequestSection || isChangeImpactSection;
    const hasChanges = editedRows.size > 0 || newRows.length > 0;
    const allSelected = sortedTableData.length > 0 && selectedRows.size === sortedTableData.length;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Controls */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {!isSnapshotSection && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShowInactive(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Show Inactive</span>
                </label>
                <button onClick={handleAddRow} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add
                </button>
              </>
            )}
            {selectedRows.size > 0 && (
              <button onClick={handleDeleteSelected} className="btn btn-secondary btn-sm" style={{ color: 'rgba(239,68,68,0.9)', borderColor: 'rgba(239,68,68,0.3)' }}>
                Delete ({selectedRows.size})
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span title={supabaseEnabled ? 'Supabase connected' : 'Local only'} style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: supabaseEnabled ? 'var(--pinnacle-teal)' : 'rgba(255,193,7,0.9)',
              boxShadow: supabaseEnabled ? '0 0 8px var(--pinnacle-teal)' : '0 0 8px rgba(255,193,7,0.5)',
              animation: 'pulse 2s infinite', cursor: 'help'
            }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {tableData.length} rows {hasChanges && <span style={{ color: 'var(--pinnacle-teal)' }}>Unsaved</span>}
            </span>


            {hasChanges && (
              <button onClick={handleSaveChanges} className="btn btn-primary btn-sm" disabled={isSyncing}>
                {isSyncing ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
        </div>


        {isSnapshotSection && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
            padding: '8px 16px',
            borderBottom: '1px solid var(--border-color)',
            background: 'rgba(0,0,0,0.12)'
          }}>
            <select
              value={snapshotScopeId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSnapshotScopeId(e.target.value)}
              style={{
                padding: '6px 8px',
                fontSize: '0.7rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                minWidth: '180px'
              }}
            >
              <option value="">All {snapshotScope === 'project' ? 'Projects' : snapshotScope === 'site' ? 'Sites' : snapshotScope === 'customer' ? 'Customers' : snapshotScope === 'portfolio' ? 'Portfolios' : 'Data'}</option>
              {snapshotScope === 'project' && projectOptions.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.name}</option>
              ))}
            </select>
            <select
              value={snapshotScope}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setSnapshotScope(e.target.value as typeof snapshotScope);
                setSnapshotScopeId(''); // Reset scope ID when scope changes
              }}
              style={{
                padding: '6px 8px',
                fontSize: '0.7rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                minWidth: '120px'
              }}
            >
              <option value="project">Project</option>
              <option value="site">Site</option>
              <option value="customer">Customer</option>
              <option value="portfolio">Portfolio</option>
              <option value="all">All</option>
            </select>
            <select
              value={snapshotType}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSnapshotType(e.target.value as typeof snapshotType)}
              style={{
                padding: '6px 8px',
                fontSize: '0.7rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                minWidth: '120px'
              }}
            >
              <option value="baseline">Baseline</option>
              <option value="forecast">Forecast</option>
              <option value="workday">Workday</option>
              <option value="manual">Manual</option>
              <option value="auto">Auto</option>
            </select>
            <input
              type="date"
              value={snapshotDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSnapshotDate(e.target.value)}
              style={{
                padding: '6px 8px',
                fontSize: '0.7rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)'
              }}
            />
            <input
              type="text"
              value={snapshotVersionName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSnapshotVersionName(e.target.value)}
              placeholder="Version name (optional)"
              style={{
                padding: '6px 8px',
                fontSize: '0.7rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                minWidth: '160px'
              }}
            />
            <input
              type="text"
              value={snapshotCreatedBy}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSnapshotCreatedBy(e.target.value)}
              placeholder="Created by"
              style={{
                padding: '6px 8px',
                fontSize: '0.7rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                minWidth: '140px'
              }}
            />
            <input
              type="text"
              value={snapshotNotes}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSnapshotNotes(e.target.value)}
              placeholder="Notes"
              style={{
                padding: '6px 8px',
                fontSize: '0.7rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                minWidth: '160px'
              }}
            />
            <button onClick={handleCreateSnapshot} className="btn btn-primary btn-sm">
              Create Snapshot
            </button>
            {selectedRows.size > 0 && (
              <button onClick={handleLockSnapshots} className="btn btn-secondary btn-sm">
                Lock Snapshot
              </button>
            )}
          </div>
        )}

        {isChangeRequestSection && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
            padding: '8px 16px',
            borderBottom: '1px solid var(--border-color)',
            background: 'rgba(0,0,0,0.12)'
          }}>
            <select
              value={changeRequestStatusFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setChangeRequestStatusFilter(e.target.value)}
              style={{
                padding: '6px 8px',
                fontSize: '0.7rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                minWidth: '160px'
              }}
            >
              <option value="all">All Statuses</option>
              <option value="submitted">Submitted</option>
              <option value="assessed">Assessed</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="implemented">Implemented</option>
            </select>
            <input
              type="date"
              value={changeRequestFromDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setChangeRequestFromDate(e.target.value)}
              style={{
                padding: '6px 8px',
                fontSize: '0.7rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)'
              }}
            />
            <input
              type="date"
              value={changeRequestToDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setChangeRequestToDate(e.target.value)}
              style={{
                padding: '6px 8px',
                fontSize: '0.7rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)'
              }}
            />
            {(changeRequestStatusFilter !== 'all' || changeRequestFromDate || changeRequestToDate) && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setChangeRequestStatusFilter('all');
                  setChangeRequestFromDate('');
                  setChangeRequestToDate('');
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        )}

        {showChangeSummary && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-color)',
            background: 'rgba(0,0,0,0.08)'
          }}>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Approved Deltas by Project
              </div>
              {changeControlSummary.byProject.length === 0 ? (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No approved changes yet.</div>
              ) : (
                <table className="data-table" style={{ fontSize: '0.7rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Project</th>
                      <th style={{ textAlign: 'right' }}>Delta Hrs</th>
                      <th style={{ textAlign: 'right' }}>Delta Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changeControlSummary.byProject.slice(0, 6).map((row: any) => (
                      <tr key={row.projectId}>
                        <td>{row.projectName}</td>
                        <td style={{ textAlign: 'right' }}>{row.approvedDeltaHours.toFixed(1)}</td>
                        <td style={{ textAlign: 'right' }}>${row.approvedDeltaCost.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Approved Deltas by Month
              </div>
              {changeControlSummary.byMonth.length === 0 ? (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No approved changes yet.</div>
              ) : (
                <table className="data-table" style={{ fontSize: '0.7rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Month</th>
                      <th style={{ textAlign: 'right' }}>Delta Hrs</th>
                      <th style={{ textAlign: 'right' }}>Delta Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changeControlSummary.byMonth.slice(0, 6).map((row: any) => (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        <td style={{ textAlign: 'right' }}>{row.approvedDeltaHours.toFixed(1)}</td>
                        <td style={{ textAlign: 'right' }}>${row.approvedDeltaCost.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Global Filter */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
          <input
            type="text"
            placeholder="Search all columns..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Table Area - Premium Standarized Layout */}
        <div className="table-scroll-area">
          <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
            <table className="premium-table" style={{ width: table.getTotalSize() }}>
              <thead>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map(header => {
                      const field = section.fields.find((f: FieldConfig) => f.key === header.id);
                      const isResizing = header.column.getIsResizing();

                      return (
                        <th
                          key={header.id}
                          style={{
                            width: header.column.columnDef.size ? `${header.getSize()}px` : 'auto',
                            minWidth: `${header.column.columnDef.minSize || 80}px`,
                            maxWidth: `${header.column.columnDef.maxSize || 500}px`,
                          }}
                        >
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}

                          {header.column.getCanResize() && (
                            <div
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              style={{
                                position: 'absolute',
                                right: 0,
                                top: 0,
                                height: '100%',
                                width: '4px',
                                cursor: 'col-resize',
                                userSelect: 'none',
                                touchAction: 'none',
                                background: isResizing ? 'var(--pinnacle-teal)' : 'transparent',
                              }}
                            />
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={table.getAllColumns().length} style={{ textAlign: 'center', padding: '60px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <span className="spinner" style={{ width: '24px', height: '24px', border: '3px solid rgba(64, 224, 208, 0.2)', borderTopColor: 'var(--pinnacle-teal)' }}></span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Synchronizing data...</span>
                      </div>
                    </td>
                  </tr>
                ) : table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={table.getAllColumns().length} style={{ textAlign: 'center', padding: '60px' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        No records found. Click <strong>Add Entry</strong> to begin.
                      </div>
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => {
                    const rowId = row.original[section.idKey];
                    const isSelected = selectedRows.has(rowId);
                    const isNew = newRows.some((nr: any) => nr[section.idKey] === rowId);
                    const hasRowEdits = editedRows.has(rowId);

                    return (
                      <tr
                        key={row.id}
                        className={`
                          ${isSelected ? 'selected' : ''} 
                          ${isNew ? 'new-row' : ''} 
                          ${hasRowEdits ? 'edited' : ''}
                        `}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const field = section.fields.find((f: FieldConfig) => f.key === cell.column.id);
                          const isLocked = editedRows.has(rowId) && editedRows.get(rowId)?.isLocked;
                          const isNonEditable = isLocked || !field?.editable || field?.autoCalculated;

                          return (
                            <td
                              key={cell.id}
                              className={isNonEditable ? 'cell-non-editable' : ''}
                              style={{
                                width: cell.column.columnDef.size ? `${cell.column.getSize()}px` : 'auto',
                                minWidth: `${cell.column.columnDef.minSize || 80}px`,
                                maxWidth: `${cell.column.columnDef.maxSize || 500}px`,
                              }}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* MPP Analysis Modal */}
          {mppAnalysis && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000,
            }}>
              <div style={{
                background: 'var(--bg-primary)',
                borderRadius: '8px',
                padding: '20px',
                maxWidth: '800px',
                maxHeight: '80vh',
                overflow: 'auto',
                border: '1px solid var(--border-color)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0 }}>MPP File Analysis</h3>
                  <button
                    onClick={() => setMppAnalysis(null)}
                    className="btn btn-secondary btn-sm"
                  >
                    Close
                  </button>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Available Fields</h4>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    {mppAnalysis.analysis.availableFields?.length > 0 ? (
                      <ul>
                        {mppAnalysis.analysis.availableFields.map((field: string, idx: number) => (
                          <li key={idx}>{field}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>No fields detected (MPP reading not yet implemented)</p>
                    )}
                  </div>

                  <h4 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Missing Fields</h4>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    {mppAnalysis.analysis.missingFields?.length > 0 ? (
                      <ul>
                        {mppAnalysis.analysis.missingFields.map((field: string, idx: number) => (
                          <li key={idx} style={{ color: 'rgba(239,68,68,0.9)' }}>{field}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>No missing fields</p>
                    )}
                  </div>

                  <h4 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Field Mapping</h4>
                  <div style={{ fontSize: '0.75rem', marginBottom: '16px' }}>
                    <table style={{ width: '100%', fontSize: '0.7rem' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '4px' }}>MPP Field</th>
                          <th style={{ textAlign: 'left', padding: '4px' }}>→ Database Field</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(mppAnalysis.analysis.fieldMapping || {}).map(([mppField, dbField]) => (
                          <tr key={mppField}>
                            <td style={{ padding: '4px' }}>{mppField}</td>
                            <td style={{ padding: '4px', color: 'var(--pinnacle-teal)' }}>{String(dbField)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <h4 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Recommendations</h4>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {mppAnalysis.analysis.recommendations?.length > 0 ? (
                      <ul>
                        {mppAnalysis.analysis.recommendations.map((rec: string, idx: number) => (
                          <li key={idx}>{rec}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>No recommendations</p>
                    )}
                  </div>

                  <div style={{ marginTop: '16px', padding: '8px', background: 'rgba(239,68,68,0.1)', borderRadius: '4px', fontSize: '0.75rem' }}>
                    <strong>Note:</strong> MPP file reading requires MPXJ library integration.
                    Currently, this is a placeholder that shows the expected structure.
                    To implement, integrate @asposecloud/aspose-tasks-cloud or set up a server-side MPXJ service.
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Pagination Footer - Independent Container */}
        {table.getPageCount() > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            flexShrink: 0
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
              {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)} of{' '}
              {table.getFilteredRowModel().rows.length} rows
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                className="btn btn-secondary btn-sm"
              >
                {'<<'}
              </button>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="btn btn-secondary btn-sm"
              >
                {'<'}
              </button>
              <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="btn btn-secondary btn-sm"
              >
                {'>'}
              </button>
              <button
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="btn btn-secondary btn-sm"
              >
                {'>>'}
              </button>
            </div>
          </div>
        )}

      </div>
    );
  }, [getCurrentSection, getTableData, tableSortStates, sortByState, getSortValueForField, formatSortIndicator, getNextSortState, editedRows, newRows, selectedRows, handleAddRow, handleDeleteSelected, handleSaveChanges, handleSelectAll, handleRowSelect, renderCell, isSyncing, isLoading, supabaseEnabled, snapshotScope, snapshotScopeId, snapshotType, snapshotDate, snapshotVersionName, snapshotCreatedBy, snapshotNotes, projectOptions, handleCreateSnapshot, handleLockSnapshots, changeRequestStatusFilter, changeRequestFromDate, changeRequestToDate, changeControlSummary]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="page-panel" style={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title">Data Management</h1>
          {uploadStatus.type && (
            <div style={{
              marginTop: '0.5rem', padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.8rem',
              backgroundColor: uploadStatus.type === 'success' ? 'rgba(64,224,208,0.1)' : 'rgba(239,68,68,0.1)',
              color: uploadStatus.type === 'success' ? 'var(--pinnacle-teal)' : 'rgba(239,68,68,0.9)',
              border: `1px solid ${uploadStatus.type === 'success' ? 'var(--pinnacle-teal)' : 'rgba(239,68,68,0.3)'}`,
            }}>
              {uploadStatus.message}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {supabaseEnabled && (
            <button
              onClick={async () => {
                setUploadStatus({ type: 'info', message: 'Refreshing from Supabase...' });
                try {
                  await refreshData();
                  setUploadStatus({ type: 'success', message: 'Data refreshed from Supabase' });
                } catch (err) {
                  setUploadStatus({ type: 'error', message: 'Failed to refresh' });
                }
              }}
              className="btn btn-secondary btn-sm"
              disabled={isLoading}
              title="Refresh data from Supabase"
            >
              {isLoading ? '...' : 'Refresh'}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => exportAllToExcel(data, hierarchyFilter, dateFilter)}>Export</button>
          <input ref={fileInputRef} type="file" accept=".csv,.json,.xlsx,.xls,.mpp" onChange={handleFileUpload} style={{ display: 'none' }} />
          <button className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
            {isImporting ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>

      {/* Import Log */}
      {showImportLog && importLog.length > 0 && (
        <div className="chart-card" style={{ marginBottom: '0.75rem', flexShrink: 0, maxHeight: '200px', overflow: 'auto' }}>
          {importLog.map((e: ImportLogEntry) => (
            <div key={e.id} style={{ padding: '4px 12px', fontSize: '0.7rem', color: e.type === 'error' ? 'rgba(239,68,68,0.9)' : 'var(--text-muted)' }}>
              {e.entity}: {e.message}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', padding: '0 0 10px 0', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid var(--border-color)', marginBottom: '10px' }}>
        {sections.map(section => {
          const count = ((data as any)[section.dataKey] || []).length;
          return (
            <button
              key={section.key}
              onClick={() => { setSelectedTable(section.key); setSelectedRows(new Set()); setNewRows([]); setEditedRows(new Map()); }}
              style={{
                padding: '6px 12px', fontSize: '0.7rem', fontWeight: 600,
                background: selectedTable === section.key ? 'var(--pinnacle-teal)' : 'var(--bg-tertiary)',
                color: selectedTable === section.key ? '#000' : 'var(--text-secondary)',
                border: 'none', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {section.label} <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="chart-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {renderTable()}
      </div>

      <style jsx>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}




























