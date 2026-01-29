'use client';

/**
 * @fileoverview Hierarchy Filter Component for PPC V3.
 * 
 * Provides cascading dropdown filters for drilling down through
 * the organizational hierarchy: Portfolio → Customer → Site → Project → Phase → Unit.
 * 
 * IMPORTANT: This component pulls data DIRECTLY from the Data Management tables
 * (portfolios, customers, sites, projects, phases, units) via the DataContext.
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
  if (portfolio.employeeId && employees?.length > 0) {
    const owner = employees.find((e: any) =>
      (e.id || e.employeeId) === portfolio.employeeId
    );
    if (owner?.name) {
      return `${owner.name}'s Portfolio`;
    }
  }
  return portfolio.name || 'Unnamed Portfolio';
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function HierarchyFilter() {
  const { data, hierarchyFilter, setHierarchyFilter } = useData();
  const [isOpen, setIsOpen] = useState(false);

  // Selection state - stores the ID of each selected item
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');

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
  // RESTORE FILTER STATE FROM CONTEXT ON MOUNT & UPDATE
  // ============================================================================
  useEffect(() => {
    // If context filter is cleared/empty, ensure local state matches
    if (!hierarchyFilter?.path || hierarchyFilter.path.length === 0) {
      if (selectedPortfolioId || selectedCustomerId || selectedSiteId || selectedProjectId) {
        setSelectedPortfolioId('');
        setSelectedCustomerId('');
        setSelectedSiteId('');
        setSelectedProjectId('');
        setSelectedPhaseId('');
        setSelectedUnitId('');
      }
      return;
    }

    const path = hierarchyFilter.path;
    const portfoliosArr = data.portfolios as any[] || [];
    const customersArr = data.customers as any[] || [];
    const sitesArr = data.sites as any[] || [];
    const projectsArr = data.projects as any[] || [];
    const phasesArr = data.phases as any[] || [];
    const unitsArr = data.units as any[] || [];

    // 0: Portfolio
    if (path[0]) {
      const portfolio = portfoliosArr.find((p) => {
        const displayName = getPortfolioDisplayName(p, data.employees || []);
        return displayName === path[0] || p.name === path[0];
      });
      if (portfolio && portfolio.id !== selectedPortfolioId) {
        setSelectedPortfolioId(portfolio.id || portfolio.portfolioId);
      }
    }

    // 1: Customer
    if (path[1]) {
      const customer = customersArr.find((c) => c.name === path[1]);
      if (customer && customer.id !== selectedCustomerId) {
        setSelectedCustomerId(customer.id || customer.customerId);
      }
    }

    // 2: Site
    if (path[2]) {
      const site = sitesArr.find((s) => s.name === path[2]);
      if (site && site.id !== selectedSiteId) {
        setSelectedSiteId(site.id || site.siteId);
      }
    }

    // 3: Project
    if (path[3]) {
      const project = projectsArr.find((p) => p.name === path[3]);
      if (project && project.id !== selectedProjectId) {
        setSelectedProjectId(project.id || project.projectId);
      }
    }

    // 4: Phase
    if (path[4]) {
      const phase = phasesArr.find((ph) => ph.name === path[4]);
      if (phase && phase.id !== selectedPhaseId) {
        setSelectedPhaseId(phase.id || phase.phaseId);
      }
    }

    // 5: Unit
    if (path[5]) {
      const unit = unitsArr.find((u) => u.name === path[5]);
      if (unit && unit.id !== selectedUnitId) {
        setSelectedUnitId(unit.id || unit.unitId);
      }
    }

  }, [hierarchyFilter, data.portfolios, data.customers, data.sites, data.projects, data.phases, data.units, data.employees]);

  // ============================================================================
  // DATA ACCESS & FILTERING (Loose)
  // ============================================================================

  const portfolios = useMemo(() => {
    if (!data.portfolios) return [];
    return (data.portfolios as any[]).map(p => ({
      id: p.id || p.portfolioId,
      name: getPortfolioDisplayName(p, data.employees || [])
    }));
  }, [data.portfolios, data.employees]);

  const customers = useMemo(() => {
    if (!data.customers) return [];
    let list = data.customers as any[];

    // Filter by portfolio if selected
    if (selectedPortfolioId) {
      list = list.filter(c => c.portfolioId === selectedPortfolioId);
    }

    return list.map(c => ({ id: c.id || c.customerId, name: c.name }));
  }, [selectedPortfolioId, data.customers]);

  const sites = useMemo(() => {
    if (!data.sites) return [];
    let list = data.sites as any[];

    // Filter by customer if selected
    if (selectedCustomerId) {
      list = list.filter(s => s.customerId === selectedCustomerId);
    }
    // Else if portfolio selected, filter by customers in that portfolio
    else if (selectedPortfolioId) {
      const validCustIds = new Set((data.customers as any[]).filter(c => c.portfolioId === selectedPortfolioId).map(c => c.id || c.customerId));
      list = list.filter(s => validCustIds.has(s.customerId));
    }

    return list.map(s => ({ id: s.id || s.siteId, name: s.name }));
  }, [selectedCustomerId, selectedPortfolioId, data.sites, data.customers]);

  const projects = useMemo(() => {
    if (!data.projects) return [];
    let list = data.projects as any[];

    if (selectedSiteId) {
      list = list.filter(p => p.siteId === selectedSiteId);
    } else if (selectedCustomerId) {
      const validSiteIds = new Set((data.sites as any[]).filter(s => s.customerId === selectedCustomerId).map(s => s.id || s.siteId));
      list = list.filter(p => validSiteIds.has(p.siteId));
    } else if (selectedPortfolioId) {
      // Cascade: Portfolio -> Customer -> Site -> Project
      const validCustIds = new Set((data.customers as any[]).filter(c => c.portfolioId === selectedPortfolioId).map(c => c.id || c.customerId));
      const validSiteIds = new Set((data.sites as any[]).filter(s => validCustIds.has(s.customerId)).map(s => s.id || s.siteId));
      list = list.filter(p => validSiteIds.has(p.siteId));
    }

    return list.map(p => ({ id: p.id || p.projectId, name: p.name }));
  }, [selectedSiteId, selectedCustomerId, selectedPortfolioId, data.projects, data.sites, data.customers]);

  const phases = useMemo(() => {
    if (!data.phases) return [];
    let list = data.phases as any[];
    if (selectedProjectId) {
      list = list.filter(ph => ph.projectId === selectedProjectId);
    }
    else if (selectedSiteId) {
      const validProjIds = new Set((data.projects as any[]).filter(p => p.siteId === selectedSiteId).map(p => p.id || p.projectId));
      list = list.filter(ph => validProjIds.has(ph.projectId));
    }
    return list.map(ph => ({ id: ph.id || ph.phaseId, name: ph.name }));
  }, [selectedProjectId, selectedSiteId, data.phases, data.projects]);

  const units = useMemo(() => {
    if (!data.units) return [];
    let list = data.units as any[];
    if (selectedPhaseId) {
      list = list.filter(u => u.phaseId === selectedPhaseId || u.phase_id === selectedPhaseId);
    }
    return list.map(u => ({ id: u.id || u.unitId, name: u.name }));
  }, [selectedPhaseId, data.units]);


  // ============================================================================
  // HELPER: Auto-Select Parents
  // ============================================================================

  const resolveParents = (
    pId: string,
    cId: string,
    sId: string,
    prId: string,
    phId: string,
    uId: string
  ): { p: string, c: string, s: string, pr: string, ph: string } => {
    let newP = pId, newC = cId, newS = sId, newPr = prId, newPh = phId;

    // Resolve backwards
    if (uId && !newPh) {
      const u = (data.units as any[]).find(x => (x.id || x.unitId) === uId);
      if (u) newPh = u.phaseId || u.phase_id;
    }
    if (newPh && !newPr) {
      const ph = (data.phases as any[]).find(x => (x.id || x.phaseId) === newPh);
      if (ph) newPr = ph.projectId;
    }
    if (newPr && !newS) {
      const pr = (data.projects as any[]).find(x => (x.id || x.projectId) === newPr);
      if (pr) newS = pr.siteId;
    }
    if (newS && !newC) {
      const s = (data.sites as any[]).find(x => (x.id || x.siteId) === newS);
      if (s) newC = s.customerId;
    }
    if (newC && !newP) {
      const c = (data.customers as any[]).find(x => (x.id || x.customerId) === newC);
      if (c) newP = c.portfolioId;
    }
    return { p: newP, c: newC, s: newS, pr: newPr, ph: newPh };
  };

  const updateFilter = (
    pId: string,
    cId: string,
    sId: string,
    prId: string,
    phId: string,
    uId: string
  ) => {
    // 1. Resolve missing parents automatically
    const resolved = resolveParents(pId, cId, sId, prId, phId, uId);

    // 2. Update local state
    setSelectedPortfolioId(resolved.p || '');
    setSelectedCustomerId(resolved.c || '');
    setSelectedSiteId(resolved.s || '');
    setSelectedProjectId(resolved.pr || '');
    setSelectedPhaseId(resolved.ph || '');
    setSelectedUnitId(uId || '');

    // 3. Build Path for Context
    const path: string[] = [];
    // Fill path indices: 0=P, 1=C, 2=S, 3=Pr, 4=Ph, 5=U

    const pObj = portfolios.find(x => x.id === resolved.p);
    if (pObj) path[0] = pObj.name;

    const cObj = (data.customers as any[]).find(x => (x.id || x.customerId) === resolved.c);
    if (cObj) path[1] = cObj.name;

    const sObj = (data.sites as any[]).find(x => (x.id || x.siteId) === resolved.s);
    if (sObj) path[2] = sObj.name;

    const prObj = (data.projects as any[]).find(x => (x.id || x.projectId) === resolved.pr);
    if (prObj) path[3] = prObj.name;

    const phObj = (data.phases as any[]).find(x => (x.id || x.phaseId) === resolved.ph);
    if (phObj) path[4] = phObj.name;

    const uObj = (data.units as any[]).find(x => (x.id || x.unitId) === uId);
    if (uObj) path[5] = uObj.name;

    // 4. Apply to Context
    if (Object.values(resolved).every(v => !v) && !uId) {
      setHierarchyFilter(null);
    } else {
      setHierarchyFilter({
        path,
        portfolio: path[0],
        customer: path[1],
        site: path[2],
        project: path[3]
      });
    }
  };

  // ============================================================================
  // CHANGE HANDLERS
  // ============================================================================

  const handlePortfolioChange = (val: string) => updateFilter(val, '', '', '', '', '');
  const handleCustomerChange = (val: string) => updateFilter(selectedPortfolioId, val, '', '', '', '');
  const handleSiteChange = (val: string) => updateFilter(selectedPortfolioId, selectedCustomerId, val, '', '', '');
  const handleProjectChange = (val: string) => updateFilter(selectedPortfolioId, selectedCustomerId, selectedSiteId, val, '', '');
  const handlePhaseChange = (val: string) => updateFilter(selectedPortfolioId, selectedCustomerId, selectedSiteId, selectedProjectId, val, '');
  const handleUnitChange = (val: string) => updateFilter(selectedPortfolioId, selectedCustomerId, selectedSiteId, selectedProjectId, selectedPhaseId, val);

  const handleReset = () => {
    setSelectedPortfolioId('');
    setSelectedCustomerId('');
    setSelectedSiteId('');
    setSelectedProjectId('');
    setSelectedPhaseId('');
    setSelectedUnitId('');
    setHierarchyFilter(null);
    setIsOpen(false);
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  const displayText = useMemo(() => {
    if (!hierarchyFilter?.path || hierarchyFilter.path.length === 0) return 'All';
    const clean = hierarchyFilter.path.filter(Boolean);
    return clean[clean.length - 1] || 'All';
  }, [hierarchyFilter]);

  const dataCount = useMemo(() => ({
    portfolios: data.portfolios?.length || 0,
    customers: data.customers?.length || 0,
    sites: data.sites?.length || 0,
    units: data.units?.length || 0,
    projects: data.projects?.length || 0,
    phases: data.phases?.length || 0,
    tasks: data.tasks?.length || 0,
  }), [data.portfolios, data.customers, data.sites, data.units, data.projects, data.phases, data.tasks]);

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
        <div style={{
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
        }}>
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(64, 224, 208, 0.05)',
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#40E0D0' }}>Filter by Hierarchy</span>
            <button onClick={handleReset} style={{ fontSize: '0.65rem', color: '#40E0D0', background: 'none', border: 'none', cursor: 'pointer' }}>Reset</button>
          </div>

          <div style={{ padding: '14px', maxHeight: '400px', overflowY: 'auto' }}>

            {/* Portfolios */}
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Portfolio <span style={{ color: 'rgba(64, 224, 208, 0.6)' }}>({dataCount.portfolios})</span></label>
              <select value={selectedPortfolioId} onChange={(e) => handlePortfolioChange(e.target.value)} style={selectStyle}>
                <option value="">All Portfolios</option>
                {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Customers */}
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Customer <span style={{ color: 'rgba(64, 224, 208, 0.6)' }}>({customers.length})</span></label>
              <select value={selectedCustomerId} onChange={(e) => handleCustomerChange(e.target.value)} style={selectStyle}>
                <option value="">All Customers</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Sites */}
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Site <span style={{ color: 'rgba(64, 224, 208, 0.6)' }}>({sites.length})</span></label>
              <select value={selectedSiteId} onChange={(e) => handleSiteChange(e.target.value)} style={selectStyle}>
                <option value="">All Sites</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Projects */}
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Project <span style={{ color: 'rgba(64, 224, 208, 0.6)' }}>({projects.length})</span></label>
              <select value={selectedProjectId} onChange={(e) => handleProjectChange(e.target.value)} style={selectStyle}>
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Phases */}
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Phase <span style={{ color: 'rgba(64, 224, 208, 0.6)' }}>({phases.length})</span></label>
              <select value={selectedPhaseId} onChange={(e) => handlePhaseChange(e.target.value)} style={selectStyle}>
                <option value="">All Phases</option>
                {phases.map(ph => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
              </select>
            </div>

            {/* Units */}
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Unit <span style={{ color: 'rgba(64, 224, 208, 0.6)' }}>({units.length})</span></label>
              <select value={selectedUnitId} onChange={(e) => handleUnitChange(e.target.value)} style={selectStyle}>
                <option value="">All Units</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
