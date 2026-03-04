'use client';

/**
 * @fileoverview Hierarchy Filter Component for PPC V3.
 *
 * Project-first UX per plan: primary control is a searchable project combobox.
 * Optional portfolio filter for roll-up. Unit/Phase collapsed into "Advanced".
 *
 * @module components/layout/HierarchyFilter
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';

// ============================================================================
// STYLES
// ============================================================================

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '6px',
  color: 'var(--text-primary)',
  fontSize: '0.75rem',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.6rem',
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 32px 8px 10px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '6px',
  color: 'var(--text-primary)',
  fontSize: '0.75rem',
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='none' stroke='%2310B981' stroke-width='2' d='M2.5 4.5L6 8L9.5 4.5'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  outline: 'none',
};

function getPortfolioDisplayName(portfolio: Record<string, unknown>, employees: unknown[]): string {
  const empId = portfolio.employeeId ?? portfolio.employee_id;
  if (empId && Array.isArray(employees) && employees.length > 0) {
    const owner = (employees as Record<string, unknown>[]).find(
      (e) => (e.id ?? e.employeeId) === empId
    );
    if (owner?.name) return `${owner.name}'s Portfolio`;
  }
  return String(portfolio.name ?? 'Unnamed Portfolio');
}

// ============================================================================
// PROJECT COMBOBOX
// ============================================================================

interface ProjectOption {
  id: string;
  name: string;
  siteName?: string;
  customerName?: string;
  portfolioId?: string;
}

function ProjectCombobox({
  projects,
  selectedProjectId,
  onSelect,
  placeholder = 'Search projects...',
}: {
  projects: ProjectOption[];
  selectedProjectId: string;
  onSelect: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => projects.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return projects.slice(0, 50);
    const q = query.toLowerCase().trim();
    return projects
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.siteName && p.siteName.toLowerCase().includes(q)) ||
          (p.customerName && p.customerName.toLowerCase().includes(q))
      )
      .slice(0, 50);
  }, [projects, query]);

  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        listRef.current &&
        !listRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayValue = selected ? selected.name : '';

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={isOpen ? query : displayValue}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setIsOpen(false);
            inputRef.current?.blur();
          }
        }}
        placeholder={placeholder}
        style={inputStyle}
        autoComplete="off"
      />
      {isOpen && (
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            maxHeight: 240,
            overflowY: 'auto',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            boxShadow: 'var(--shadow-lg)',
            zIndex: 1001,
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: 12, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              No projects match
            </div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={p.id === selectedProjectId}
                onClick={() => {
                  onSelect(p.id);
                  setIsOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 12px',
                  textAlign: 'left',
                  background: p.id === selectedProjectId ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                }}
              >
                {p.name}
                {(p.siteName || p.customerName) && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: '0.7rem' }}>
                    ({p.siteName || p.customerName})
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function HierarchyFilter() {
  const { filteredData: data, hierarchyFilter, setHierarchyFilter } = useData();
  const [isOpen, setIsOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedProjectId = hierarchyFilter?.projectId ?? '';
  const selectedPortfolioId = hierarchyFilter?.portfolioId ?? '';
  const selectedUnitId = hierarchyFilter?.unitId ?? '';
  const selectedPhaseId = hierarchyFilter?.phaseId ?? '';

  // All projects for combobox (with site/customer for disambiguation)
  const projectOptions = useMemo((): ProjectOption[] => {
    const projects = (data.projects || []) as unknown as Record<string, unknown>[];
    const sites = (data.sites || []) as unknown as Record<string, unknown>[];
    const customers = (data.customers || []) as unknown as Record<string, unknown>[];

    let list = projects;
    if (selectedPortfolioId) {
      const validCustIds = new Set(
        (customers as Record<string, unknown>[])
          .filter((c) => (c.portfolioId ?? c.portfolio_id) === selectedPortfolioId)
          .map((c) => c.id ?? c.customerId)
      );
      const validSiteIds = new Set(
        (sites as Record<string, unknown>[])
          .filter((s) => validCustIds.has(String(s.customerId ?? s.customer_id)))
          .map((s) => s.id ?? s.siteId)
      );
      list = list.filter((p) =>
        validSiteIds.has(String(p.siteId ?? p.site_id))
      );
    }

    return list.map((p) => {
      const id = String(p.id ?? p.projectId ?? '');
      const site = (sites as Record<string, unknown>[]).find(
        (s) => (s.id ?? s.siteId) === (p.siteId ?? p.site_id)
      );
      const customer = site
        ? (customers as Record<string, unknown>[]).find(
            (c) => (c.id ?? c.customerId) === (site.customerId ?? site.customer_id)
          )
        : null;
      return {
        id,
        name: String(p.name ?? 'Unnamed'),
        siteName: site ? String(site.name ?? '') : undefined,
        customerName: customer ? String(customer.name ?? '') : undefined,
        portfolioId: customer ? String(customer.portfolioId ?? customer.portfolio_id ?? '') : undefined,
      };
    });
  }, [data.projects, data.sites, data.customers, selectedPortfolioId]);

  const portfolios = useMemo(() => {
    const list = (data.portfolios || []) as unknown as Record<string, unknown>[];
    return list.map((p) => ({
      id: String(p.id ?? p.portfolioId ?? ''),
      name: getPortfolioDisplayName(p, data.employees || []),
    }));
  }, [data.portfolios, data.employees]);

  const units = useMemo(() => {
    const list = (data.units || []) as unknown as Record<string, unknown>[];
    return list
      .filter((u) => (u.projectId ?? u.project_id) === selectedProjectId)
      .map((u) => ({ id: String(u.id ?? u.unitId ?? ''), name: String(u.name ?? '') }));
  }, [data.units, selectedProjectId]);

  const phases = useMemo(() => {
    const list = (data.phases || []) as unknown as Record<string, unknown>[];
    return list
      .filter((ph) => {
        const phProjectId = ph.projectId ?? ph.project_id;
        const phUnitId = ph.unitId ?? ph.unit_id;
        if (selectedUnitId) return phUnitId === selectedUnitId;
        if (selectedProjectId) return phProjectId === selectedProjectId && !phUnitId;
        return false;
      })
      .map((ph) => ({ id: String(ph.id ?? ph.phaseId ?? ''), name: String(ph.name ?? '') }));
  }, [data.phases, selectedProjectId, selectedUnitId]);

  const updateFilter = useCallback(
    (updates: {
      portfolioId?: string;
      projectId?: string;
      unitId?: string;
      phaseId?: string;
    }) => {
      const portfolioId = updates.portfolioId ?? selectedPortfolioId;
      const projectId = updates.projectId ?? selectedProjectId;
      const unitId = updates.unitId ?? selectedUnitId;
      const phaseId = updates.phaseId ?? selectedPhaseId;

      if (!portfolioId && !projectId && !unitId && !phaseId) {
        setHierarchyFilter(null);
        return;
      }

      setHierarchyFilter({
        portfolioId: portfolioId || undefined,
        projectId: projectId || undefined,
        unitId: unitId || undefined,
        phaseId: phaseId || undefined,
      });
    },
    [selectedPortfolioId, selectedProjectId, selectedUnitId, selectedPhaseId, setHierarchyFilter]
  );

  const handleProjectSelect = (id: string) => updateFilter({ projectId: id, unitId: '', phaseId: '' });
  const handlePortfolioChange = (id: string) => updateFilter({ portfolioId: id, projectId: '' });
  const handleUnitChange = (id: string) => updateFilter({ unitId: id, phaseId: '' });
  const handlePhaseChange = (id: string) => updateFilter({ phaseId: id });

  const handleReset = () => {
    setHierarchyFilter(null);
    setIsOpen(false);
    setShowAdvanced(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayText = useMemo(() => {
    if (!hierarchyFilter?.projectId && !hierarchyFilter?.portfolioId) return 'All';
    if (hierarchyFilter.projectId && data.projects) {
      const p = (data.projects as unknown as Record<string, unknown>[]).find(
        (x) => (x.id ?? x.projectId) === hierarchyFilter.projectId
      );
      if (p) return String(p.name ?? 'Project');
    }
    if (hierarchyFilter.portfolioId && data.portfolios) {
      const p = (data.portfolios as unknown as Record<string, unknown>[]).find(
        (x) => (x.id ?? x.portfolioId) === hierarchyFilter.portfolioId
      );
      if (p) return getPortfolioDisplayName(p, data.employees || []);
    }
    return 'Filter';
  }, [hierarchyFilter, data.projects, data.portfolios, data.employees]);

  return (
    <div ref={dropdownRef} className="nav-dropdown" style={{ position: 'relative' }}>
      <button
        className="global-filter-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
          <path d="M3 3h18v18H3zM3 9h18M9 21V9" />
        </svg>
        <span>{displayText}</span>
        <svg viewBox="0 0 12 12" width="10" height="10" style={{ marginLeft: 'auto' }}>
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="dropdown-container"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 8,
            minWidth: 320,
            zIndex: 1000,
            overflow: 'hidden',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(16, 185, 129, 0.06)',
            }}
          >
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--pinnacle-teal)' }}>
              Filter by Project
            </span>
            <button
              onClick={handleReset}
              style={{
                fontSize: '0.65rem',
                color: 'var(--pinnacle-teal)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Reset
            </button>
          </div>

          <div style={{ padding: 14 }}>
            {/* Optional: Portfolio for roll-up */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Portfolio (optional)</label>
              <select
                value={selectedPortfolioId}
                onChange={(e) => handlePortfolioChange(e.target.value)}
                style={selectStyle}
              >
                <option value="">All Portfolios</option>
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Primary: Project combobox */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Project</label>
              <ProjectCombobox
                projects={projectOptions}
                selectedProjectId={selectedProjectId}
                onSelect={handleProjectSelect}
                placeholder="Search projects..."
              />
            </div>

            {/* Advanced: Unit & Phase (collapsed) */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{
                  fontSize: '0.65rem',
                  color: 'var(--text-muted)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  marginBottom: showAdvanced ? 8 : 0,
                }}
              >
                {showAdvanced ? '▼' : '▶'} Advanced (Unit, Phase)
              </button>
              {showAdvanced && selectedProjectId && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ marginBottom: 8 }}>
                    <label style={labelStyle}>Unit</label>
                    <select
                      value={selectedUnitId}
                      onChange={(e) => handleUnitChange(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">All Units</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Phase</label>
                    <select
                      value={selectedPhaseId}
                      onChange={(e) => handlePhaseChange(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">All Phases</option>
                      {phases.map((ph) => (
                        <option key={ph.id} value={ph.id}>
                          {ph.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
