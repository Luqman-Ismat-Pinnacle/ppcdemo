'use client';

/**
 * @fileoverview Hierarchy Filter Component for PPC V3.
 * 
 * Provides cascading dropdown filters for drilling down through
 * the organizational hierarchy: Portfolio → Customer → Site → Project → Phase → Task.
 * 
 * IMPORTANT: This component pulls data DIRECTLY from the Data Management tables
 * (portfolios, customers, sites, projects, phases, tasks) via the DataContext.
 * 
 * @module components/layout/HierarchyFilter
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';

// ============================================================================
// STYLES
// ============================================================================

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 32px 8px 10px',
  background: '#1a1a1a',
  border: '1px solid rgba(64, 224, 208, 0.3)',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '0.75rem',
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='none' stroke='%2340E0D0' stroke-width='2' d='M2.5 4.5L6 8L9.5 4.5'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.6rem',
  fontWeight: 600,
  color: 'rgba(255, 255, 255, 0.5)',
  marginBottom: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

// ============================================================================
// HELPER: Get display name for portfolio
// ============================================================================

function getPortfolioDisplayName(portfolio: any, employees: any[]): string {
  // Calculate portfolio name as "Owner's Portfolio" if employeeId exists
  // Owner is the employee linked via employeeId
  if (portfolio.employeeId && employees?.length > 0) {
    const owner = employees.find((e: any) => 
      (e.id || e.employeeId) === portfolio.employeeId
    );
    if (owner?.name) {
      return `${owner.name}'s Portfolio`;
    }
  }
  // Fallback to name if no owner found
  return portfolio.name || 'Unnamed Portfolio';
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function HierarchyFilter() {
  // Use raw 'data' (not 'filteredData') to show ALL available options
  const { data, hierarchyFilter, setHierarchyFilter } = useData();
  const [isOpen, setIsOpen] = useState(false);
  
  // Selection state - stores the ID of each selected item
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>('');
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ============================================================================
  // RESTORE FILTER STATE FROM CONTEXT ON MOUNT
  // This ensures filter persists when navigating between pages
  // ============================================================================
  useEffect(() => {
    if (!hierarchyFilter?.path || hierarchyFilter.path.length === 0) return;
    
    const path = hierarchyFilter.path;
    
    // Cast data arrays to any[] for property access
    const portfoliosArr = data.portfolios as any[] || [];
    const customersArr = data.customers as any[] || [];
    const sitesArr = data.sites as any[] || [];
    const unitsArr = data.units as any[] || [];
    const projectsArr = data.projects as any[] || [];
    const phasesArr = data.phases as any[] || [];
    
    // Find and restore portfolio
    if (path[0] && portfoliosArr.length > 0) {
      const portfolio = portfoliosArr.find((p) => {
        const displayName = getPortfolioDisplayName(p, data.employees || []);
        return displayName === path[0] || p.name === path[0];
      });
      if (portfolio) {
        const portfolioId = portfolio.id || portfolio.portfolioId;
        setSelectedPortfolioId(portfolioId);
        
        // Find and restore customer
        if (path[1] && customersArr.length > 0) {
          const customer = customersArr.find((c) => 
            c.portfolioId === portfolioId && c.name === path[1]
          );
          if (customer) {
            const customerId = customer.id || customer.customerId;
            setSelectedCustomerId(customerId);
            
            // Find and restore site
            if (path[2] && sitesArr.length > 0) {
              const site = sitesArr.find((s) => 
                s.customerId === customerId && s.name === path[2]
              );
              if (site) {
                const siteId = site.id || site.siteId;
                setSelectedSiteId(siteId);
                
                // Find and restore unit (if path[3] is a unit)
                if (path[3] && unitsArr.length > 0) {
                  const unit = unitsArr.find((u) => 
                    u.siteId === siteId && u.name === path[3]
                  );
                  if (unit) {
                    const unitId = unit.id || unit.unitId;
                    setSelectedUnitId(unitId);
                    
                    // Find and restore project from unit
                    if (path[4] && projectsArr.length > 0) {
                      const project = projectsArr.find((p) => 
                        p.unitId === unitId && p.name === path[4]
                      );
                      if (project) {
                        const projectId = project.id || project.projectId;
                        setSelectedProjectId(projectId);
                        
                        // Find and restore phase
                        if (path[5] && phasesArr.length > 0) {
                          const phase = phasesArr.find((ph) => 
                            ph.projectId === projectId && ph.name === path[5]
                          );
                          if (phase) {
                            setSelectedPhaseId(phase.id || phase.phaseId);
                          }
                        }
                      }
                    }
                  } else {
                    // path[3] might be a project name (no unit selected)
                    const project = projectsArr.find((p) => 
                      p.siteId === siteId && p.name === path[3]
                    );
                    if (project) {
                      const projectId = project.id || project.projectId;
                      setSelectedProjectId(projectId);
                      
                      // path[4] would be phase
                      if (path[4] && phasesArr.length > 0) {
                        const phase = phasesArr.find((ph) => 
                          ph.projectId === projectId && ph.name === path[4]
                        );
                        if (phase) {
                          setSelectedPhaseId(phase.id || phase.phaseId);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  // Only run once when data is loaded and hierarchyFilter exists
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.portfolios?.length, data.customers?.length, data.sites?.length, data.units?.length, data.projects?.length, data.phases?.length]);

  // ============================================================================
  // DATA FROM DATA MANAGEMENT - Direct table access
  // ============================================================================

  // Get all portfolios directly from Data Management
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const portfolios = useMemo(() => {
    if (!data.portfolios || data.portfolios.length === 0) return [];
    
    return (data.portfolios as any[]).map((p) => ({
      id: p.id || p.portfolioId,
      name: getPortfolioDisplayName(p, data.employees || []),
      rawName: p.name,
      employeeId: p.employeeId
    }));
  }, [data.portfolios, data.employees]);

  // Get customers for the selected portfolio
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customers = useMemo(() => {
    if (!selectedPortfolioId || !data.customers || data.customers.length === 0) return [];
    
    return (data.customers as any[])
      .filter((c) => c.portfolioId === selectedPortfolioId)
      .map((c) => ({
        id: c.id || c.customerId,
        name: c.name
      }));
  }, [selectedPortfolioId, data.customers]);

  // Get sites for the selected customer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sites = useMemo(() => {
    if (!selectedCustomerId || !data.sites || data.sites.length === 0) return [];
    
    return (data.sites as any[])
      .filter((s) => s.customerId === selectedCustomerId)
      .map((s) => ({
        id: s.id || s.siteId,
        name: s.name
      }));
  }, [selectedCustomerId, data.sites]);

  // Get units for the selected site
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const units = useMemo(() => {
    if (!selectedSiteId || !data.units || data.units.length === 0) return [];
    
    return (data.units as any[])
      .filter((u) => u.siteId === selectedSiteId)
      .map((u) => ({
        id: u.id || u.unitId,
        name: u.name
      }));
  }, [selectedSiteId, data.units]);

  // Get projects for the selected unit or site
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projects = useMemo(() => {
    if (!data.projects || data.projects.length === 0) return [];
    
    const projectsArr = data.projects as any[];
    
    // If unit is selected, filter by unit
    if (selectedUnitId) {
      return projectsArr
        .filter((p) => p.unitId === selectedUnitId)
        .map((p) => ({
          id: p.id || p.projectId,
          name: p.name
        }));
    }
    
    // If site is selected but no unit, show projects without unit
    if (selectedSiteId) {
      return projectsArr
        .filter((p) => p.siteId === selectedSiteId && !p.unitId)
        .map((p) => ({
          id: p.id || p.projectId,
          name: p.name
        }));
    }
    
    return [];
  }, [selectedSiteId, selectedUnitId, data.projects]);

  // Get phases for the selected project
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phases = useMemo(() => {
    if (!selectedProjectId || !data.phases || data.phases.length === 0) return [];
    
    return (data.phases as any[])
      .filter((ph) => ph.projectId === selectedProjectId)
      .map((ph) => ({
        id: ph.id || ph.phaseId,
        name: ph.name
      }));
  }, [selectedProjectId, data.phases]);

  // ============================================================================
  // BUILD FILTER PATH - for applying to DataContext
  // ============================================================================

  const buildFilterPath = useCallback((
    portfolioId: string,
    customerId: string,
    siteId: string,
    unitId: string,
    projectId: string,
    phaseId: string
  ): string[] => {
    const path: string[] = [];
    
    // Add portfolio name to path
    if (portfolioId) {
      const portfolio = portfolios.find(p => p.id === portfolioId);
      if (portfolio) path.push(portfolio.name);
    }
    
    // Add customer name to path
    if (customerId) {
      const customer = data.customers?.find((c: any) => (c.id || c.customerId) === customerId);
      if (customer) path.push(customer.name);
    }
    
    // Add site name to path
    if (siteId) {
      const site = data.sites?.find((s: any) => (s.id || s.siteId) === siteId);
      if (site) path.push(site.name);
    }
    
    // Add unit name to path
    if (unitId) {
      const unit = data.units?.find((u: any) => (u.id || u.unitId) === unitId);
      if (unit) path.push(unit.name);
    }
    
    // Add project name to path
    if (projectId) {
      const project = data.projects?.find((p: any) => (p.id || p.projectId) === projectId);
      if (project) path.push(project.name);
    }
    
    // Add phase name to path
    if (phaseId) {
      const phase = data.phases?.find((ph: any) => (ph.id || ph.phaseId) === phaseId);
      if (phase) path.push(phase.name);
    }
    
    return path;
  }, [portfolios, data.customers, data.sites, data.units, data.projects, data.phases]);

  // ============================================================================
  // APPLY FILTER
  // ============================================================================

  const applyFilter = useCallback((path: string[]) => {
    if (path.length === 0) {
      setHierarchyFilter(null);
    } else {
      setHierarchyFilter({
        path,
        portfolio: path[0] || undefined,
        customer: path[1] || undefined,
        site: path[2] || undefined,
        project: path[3] || undefined,
      });
    }
  }, [setHierarchyFilter]);

  // ============================================================================
  // CHANGE HANDLERS
  // ============================================================================

  const handlePortfolioChange = (value: string) => {
    setSelectedPortfolioId(value);
    setSelectedCustomerId('');
    setSelectedSiteId('');
    setSelectedUnitId('');
    setSelectedProjectId('');
    setSelectedPhaseId('');
    
    const path = buildFilterPath(value, '', '', '', '', '');
    applyFilter(path);
  };

  const handleCustomerChange = (value: string) => {
    setSelectedCustomerId(value);
    setSelectedSiteId('');
    setSelectedUnitId('');
    setSelectedProjectId('');
    setSelectedPhaseId('');
    
    const path = buildFilterPath(selectedPortfolioId, value, '', '', '', '');
    applyFilter(path);
  };

  const handleSiteChange = (value: string) => {
    setSelectedSiteId(value);
    setSelectedUnitId('');
    setSelectedProjectId('');
    setSelectedPhaseId('');
    
    const path = buildFilterPath(selectedPortfolioId, selectedCustomerId, value, '', '', '');
    applyFilter(path);
  };

  const handleUnitChange = (value: string) => {
    setSelectedUnitId(value);
    setSelectedProjectId('');
    setSelectedPhaseId('');
    
    const path = buildFilterPath(selectedPortfolioId, selectedCustomerId, selectedSiteId, value, '', '');
    applyFilter(path);
  };

  const handleProjectChange = (value: string) => {
    setSelectedProjectId(value);
    setSelectedPhaseId('');
    
    const path = buildFilterPath(selectedPortfolioId, selectedCustomerId, selectedSiteId, selectedUnitId, value, '');
    applyFilter(path);
  };

  const handlePhaseChange = (value: string) => {
    setSelectedPhaseId(value);
    
    const path = buildFilterPath(selectedPortfolioId, selectedCustomerId, selectedSiteId, selectedUnitId, selectedProjectId, value);
    applyFilter(path);
  };

  const handleReset = () => {
    setSelectedPortfolioId('');
    setSelectedCustomerId('');
    setSelectedSiteId('');
    setSelectedUnitId('');
    setSelectedProjectId('');
    setSelectedPhaseId('');
    setHierarchyFilter(null);
    setIsOpen(false);
  };

  // ============================================================================
  // DISPLAY TEXT
  // ============================================================================

  const displayText = useMemo(() => {
    if (!hierarchyFilter?.path || hierarchyFilter.path.length === 0) {
      return 'All';
    }
    // Show the deepest level selected
    return hierarchyFilter.path[hierarchyFilter.path.length - 1];
  }, [hierarchyFilter]);

  // ============================================================================
  // COUNT AVAILABLE DATA
  // ============================================================================

  const dataCount = useMemo(() => ({
    portfolios: data.portfolios?.length || 0,
    customers: data.customers?.length || 0,
    sites: data.sites?.length || 0,
    units: data.units?.length || 0,
    projects: data.projects?.length || 0,
    phases: data.phases?.length || 0,
    tasks: data.tasks?.length || 0,
  }), [data.portfolios, data.customers, data.sites, data.units, data.projects, data.phases, data.tasks]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div ref={dropdownRef} className="nav-dropdown" style={{ position: 'relative' }}>
      <button
        className="global-filter-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
          <path d="M3 3h18v18H3zM3 9h18M9 21V9"></path>
        </svg>
        <span>{displayText}</span>
        <svg viewBox="0 0 12 12" width="10" height="10" style={{ marginLeft: 'auto' }}>
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      
      {isOpen && (
        <div 
          style={{ 
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '8px',
            minWidth: '300px',
            background: '#1a1a1a',
            border: '1px solid rgba(64, 224, 208, 0.2)',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ 
            padding: '12px 14px', 
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            background: 'rgba(64, 224, 208, 0.05)',
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#40E0D0' }}>
              Filter by Hierarchy
            </span>
            <button 
              onClick={handleReset}
              style={{ 
                fontSize: '0.65rem', 
                color: '#40E0D0', 
                background: 'none', 
                border: 'none', 
                cursor: 'pointer',
                fontWeight: 500,
                padding: '4px 8px',
                borderRadius: '4px',
                transition: 'background 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(64, 224, 208, 0.1)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
            >
              Reset
            </button>
          </div>
          
          {/* Cascade Selectors */}
          <div style={{ padding: '14px', maxHeight: '400px', overflowY: 'auto' }}>
            
            {/* Portfolio */}
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>
                Portfolio 
                <span style={{ color: 'rgba(64, 224, 208, 0.6)', marginLeft: '4px' }}>
                  ({dataCount.portfolios})
                </span>
              </label>
              <select
                value={selectedPortfolioId}
                onChange={(e) => handlePortfolioChange(e.target.value)}
                style={selectStyle}
              >
                <option value="">All Portfolios</option>
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Customer - show if portfolio selected OR if there are customers */}
            {(selectedPortfolioId || dataCount.customers > 0) && (
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>
                  Customer
                  <span style={{ color: 'rgba(64, 224, 208, 0.6)', marginLeft: '4px' }}>
                    ({customers.length})
                  </span>
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  style={{
                    ...selectStyle,
                    opacity: !selectedPortfolioId ? 0.5 : 1,
                  }}
                  disabled={!selectedPortfolioId}
                >
                  <option value="">
                    {!selectedPortfolioId ? 'Select Portfolio first' : 'All Customers'}
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Site - show if customer selected OR if there are sites */}
            {(selectedCustomerId || dataCount.sites > 0) && (
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>
                  Site
                  <span style={{ color: 'rgba(64, 224, 208, 0.6)', marginLeft: '4px' }}>
                    ({sites.length})
                  </span>
                </label>
                <select
                  value={selectedSiteId}
                  onChange={(e) => handleSiteChange(e.target.value)}
                  style={{
                    ...selectStyle,
                    opacity: !selectedCustomerId ? 0.5 : 1,
                  }}
                  disabled={!selectedCustomerId}
                >
                  <option value="">
                    {!selectedCustomerId ? 'Select Customer first' : 'All Sites'}
                  </option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Unit - show if site selected OR if there are units */}
            {(selectedSiteId || dataCount.units > 0) && (
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>
                  Unit
                  <span style={{ color: 'rgba(64, 224, 208, 0.6)', marginLeft: '4px' }}>
                    ({units.length})
                  </span>
                </label>
                <select
                  value={selectedUnitId}
                  onChange={(e) => handleUnitChange(e.target.value)}
                  style={{
                    ...selectStyle,
                    opacity: !selectedSiteId ? 0.5 : 1,
                  }}
                  disabled={!selectedSiteId}
                >
                  <option value="">
                    {!selectedSiteId ? 'Select Site first' : 'All Units'}
                  </option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Project - show if unit/site selected OR if there are projects */}
            {(selectedSiteId || dataCount.projects > 0) && (
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>
                  Project
                  <span style={{ color: 'rgba(64, 224, 208, 0.6)', marginLeft: '4px' }}>
                    ({projects.length})
                  </span>
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  style={{
                    ...selectStyle,
                    opacity: !selectedSiteId ? 0.5 : 1,
                  }}
                  disabled={!selectedSiteId}
                >
                  <option value="">
                    {!selectedSiteId ? 'Select Site first' : selectedUnitId ? 'All Unit Projects' : 'All Site Projects'}
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Phase - show if project selected OR if there are phases */}
            {(selectedProjectId || dataCount.phases > 0) && (
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>
                  Phase
                  <span style={{ color: 'rgba(64, 224, 208, 0.6)', marginLeft: '4px' }}>
                    ({phases.length})
                  </span>
                </label>
                <select
                  value={selectedPhaseId}
                  onChange={(e) => handlePhaseChange(e.target.value)}
                  style={{
                    ...selectStyle,
                    opacity: !selectedProjectId ? 0.5 : 1,
                  }}
                  disabled={!selectedProjectId}
                >
                  <option value="">
                    {!selectedProjectId ? 'Select Project first' : 'All Phases'}
                  </option>
                  {phases.map((ph) => (
                    <option key={ph.id} value={ph.id}>{ph.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* No data message */}
            {dataCount.portfolios === 0 && dataCount.customers === 0 && dataCount.projects === 0 && (
              <div style={{ 
                padding: '16px', 
                textAlign: 'center', 
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '0.75rem',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '6px',
              }}>
                <div style={{ marginBottom: '8px' }}>No hierarchy data available.</div>
                <div style={{ fontSize: '0.65rem', color: 'rgba(64, 224, 208, 0.7)' }}>
                  Add data in Data Management →
                </div>
              </div>
            )}

            {/* Data summary */}
            {(dataCount.portfolios > 0 || dataCount.customers > 0 || dataCount.projects > 0) && (
              <div style={{ 
                marginTop: '12px',
                padding: '10px',
                background: 'rgba(64, 224, 208, 0.05)',
                borderRadius: '6px',
                fontSize: '0.65rem',
                color: 'rgba(255, 255, 255, 0.5)',
              }}>
                <div style={{ fontWeight: 600, marginBottom: '4px', color: 'rgba(64, 224, 208, 0.7)' }}>
                  Data from Data Management:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <span>{dataCount.portfolios} Portfolios</span>
                  <span>•</span>
                  <span>{dataCount.customers} Customers</span>
                  <span>•</span>
                  <span>{dataCount.sites} Sites</span>
                  <span>•</span>
                  <span>{dataCount.units} Units</span>
                  <span>•</span>
                  <span>{dataCount.projects} Projects</span>
                  <span>•</span>
                  <span>{dataCount.phases} Phases</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
