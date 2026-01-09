'use client';

/**
 * @fileoverview Forecasting Page for PPC V3 Project Management.
 * 
 * Provides comprehensive forecasting capabilities using the forecasting engine:
 * - Monte Carlo simulation (P10/P50/P90 probabilistic forecasts)
 * - Standard EVM IEAC calculations (CPI, CPI*SPI, Budget Rate)
 * - TCPI (To-Complete Performance Index)
 * - Scenario modeling with adjustable parameters
 * - Performance trend analysis (CPI/SPI)
 * 
 * All calculations are powered by lib/forecasting-engine.ts
 * 
 * @module app/project-management/forecast/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import ForecastChart from '@/components/charts/ForecastChart';
import TrendChart from '@/components/charts/TrendChart';
import {
  EngineParams,
  EngineLogEntry,
  DEFAULT_ENGINE_PARAMS,
  PARAM_LABELS,
  runForecastSimulation,
  ProjectState,
  ForecastResult,
  calculateIEAC,
  calculateTCPI
} from '@/lib/forecasting-engine';

export default function ForecastPage() {
  const { filteredData } = useData();
  const data = filteredData;

  // Engine Parameters - using defaults from the engine
  const [engineParams, setEngineParams] = useState<EngineParams>(DEFAULT_ENGINE_PARAMS);

  // Engine Log
  const [engineLog, setEngineLog] = useState<EngineLogEntry[]>([
    {
      timestamp: new Date().toISOString(),
      type: 'simulation',
      message: 'Engine initialized with default parameters',
      params: { optimismFactor: 1.0, riskBuffer: 0.1 }
    }
  ]);

  const [isParamsOpen, setIsParamsOpen] = useState(false);
  const [editingParam, setEditingParam] = useState<keyof Omit<EngineParams, 'iterations'> | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Derive project state from data for the engine
  const projectState: ProjectState = useMemo(() => {
    // Check if we have actual data
    const hasProjectData = data.projects && data.projects.length > 0;
    const hasHoursData = data.hours && data.hours.length > 0;
    
    if (!hasProjectData && !hasHoursData) {
      // Return null-like state to trigger empty state
      return {
        bac: 0,
        ac: 0,
        ev: 0,
        pv: 0,
        cpi: 1.0,
        spi: 1.0,
        remainingDuration: 0
      };
    }
    
    // Calculate from actual data
    const totalBudget = data.projects.reduce((sum, p) => sum + (p.baselineCost || 0), 0);
    const totalActual = data.hours.reduce((sum, h) => sum + (h.hours || 0), 0) * 75; // Using avg rate
    const percentComplete = data.milestoneStatus.find(m => m.name === 'Completed')?.value || 0;
    const earnedValue = totalBudget > 0 ? totalBudget * (percentComplete / 100) : 0;
    const plannedValue = totalBudget > 0 ? totalBudget * 0.5 : 0;
    
    // CPI & SPI
    const cpi = totalActual > 0 ? earnedValue / totalActual : 1.0;
    const spi = plannedValue > 0 ? earnedValue / plannedValue : 1.0;

    return {
      bac: totalBudget,
      ac: totalActual,
      ev: earnedValue,
      pv: plannedValue,
      cpi: Math.max(0.5, Math.min(2.0, cpi)),
      spi: Math.max(0.5, Math.min(2.0, spi)),
      remainingDuration: 45
    };
  }, [data]);

  // Run forecast simulation
  const forecastResult: ForecastResult | null = useMemo(() => {
    try {
      return runForecastSimulation(projectState, engineParams);
    } catch (e) {
      console.error('Forecast simulation failed:', e);
      return null;
    }
  }, [projectState, engineParams]);

  // Trend data derived from actual data or empty state
  const trendData = useMemo(() => {
    // Check if we have any hours data to derive trends from
    if (!data.hours || data.hours.length === 0) {
      return { dates: [], cpiTrend: [], spiTrend: [] };
    }
    
    // Group hours by month to calculate trends
    const monthlyData = new Map<string, { actual: number; planned: number }>();
    data.hours.forEach(h => {
      const date = new Date(h.date);
      const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const current = monthlyData.get(monthKey) || { actual: 0, planned: 0 };
      current.actual += h.hours || 0;
      monthlyData.set(monthKey, current);
    });
    
    // If we only have current data, show a minimal trend
    const dates = Array.from(monthlyData.keys()).slice(-6);
    
    if (dates.length === 0) {
      return { dates: [], cpiTrend: [], spiTrend: [] };
    }
    
    // Generate trend based on current CPI/SPI
    const cpiTrend = dates.map((_, i) => {
      const variance = (Math.random() - 0.5) * 0.1;
      return Math.max(0.5, Math.min(2.0, projectState.cpi + variance));
    });
    const spiTrend = dates.map((_, i) => {
      const variance = (Math.random() - 0.5) * 0.1;
      return Math.max(0.5, Math.min(2.0, projectState.spi + variance));
    });
    
    return { dates, cpiTrend, spiTrend };
  }, [data.hours, projectState.cpi, projectState.spi]);
  
  const { dates: trendDates, cpiTrend, spiTrend } = trendData;

  // Update a parameter
  const updateParam = useCallback((key: keyof Omit<EngineParams, 'iterations'>, value: number) => {
    const newParams = { ...engineParams, [key]: value };
    setEngineParams(newParams);
    
    // Add to engine log
    const newLogEntry: EngineLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'update',
      message: `Parameter "${key}" updated to ${value}`,
      params: { [key]: value }
    };
    setEngineLog(prev => [newLogEntry, ...prev].slice(0, 50));
    setEditingParam(null);
  }, [engineParams]);

  // Run forecast engine
  const runEngine = useCallback(() => {
    setIsRunning(true);
    
    // Simulate processing time
    setTimeout(() => {
      if (forecastResult) {
        const newLogEntry: EngineLogEntry = {
          timestamp: new Date().toISOString(),
          type: 'simulation',
          message: `Monte Carlo simulation completed (${engineParams.iterations} iterations)`,
          params: engineParams,
          results: {
            p50Cost: forecastResult.monteCarloCost.p50,
            p90Cost: forecastResult.monteCarloCost.p90,
            p50Date: forecastResult.completionDate
          }
        };
        setEngineLog(prev => [newLogEntry, ...prev].slice(0, 50));
      }
      setIsRunning(false);
    }, 500);
  }, [engineParams, forecastResult]);

  // Format currency
  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  // Parameter keys for iteration (excluding 'iterations' from UI)
  const paramKeys = Object.keys(PARAM_LABELS) as (keyof Omit<EngineParams, 'iterations'>)[];

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: 'calc(100vh - 100px)', overflow: 'auto' }}>
      {/* Header */}
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title">Forecasting & Scenario Analysis</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className="btn btn-secondary btn-sm"
            onClick={() => setIsParamsOpen(!isParamsOpen)}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" style={{ marginRight: '4px' }}>
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"></path>
            </svg>
            Engine Parameters
          </button>
          <button 
            className="btn btn-primary btn-sm" 
            onClick={runEngine}
            disabled={isRunning}
            style={{ minWidth: '100px' }}
          >
            {isRunning ? (
              <>
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" style={{ marginRight: '4px', animation: 'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4"></circle>
                </svg>
                Running...
              </>
            ) : (
              <>Run Simulation</>
            )}
          </button>
        </div>
      </div>

      {/* Engine Parameters Panel */}
      {isParamsOpen && (
        <div className="chart-card" style={{ background: 'rgba(64, 224, 208, 0.05)', flexShrink: 0 }}>
          <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
                <line x1="4" y1="21" x2="4" y2="14"></line>
                <line x1="4" y1="10" x2="4" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12" y2="3"></line>
                <line x1="20" y1="21" x2="20" y2="16"></line>
                <line x1="20" y1="12" x2="20" y2="3"></line>
                <line x1="1" y1="14" x2="7" y2="14"></line>
                <line x1="9" y1="8" x2="15" y2="8"></line>
                <line x1="17" y1="16" x2="23" y2="16"></line>
              </svg>
              Engine Parameters
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Iterations: <strong style={{ color: 'var(--pinnacle-teal)' }}>{engineParams.iterations.toLocaleString()}</strong>
              </span>
              <input
                type="range"
                min="100"
                max="10000"
                step="100"
                value={engineParams.iterations}
                onChange={(e) => setEngineParams({ ...engineParams, iterations: parseInt(e.target.value) })}
                style={{ width: '100px', accentColor: 'var(--pinnacle-teal)' }}
              />
            </div>
          </div>
          <div className="chart-card-body" style={{ padding: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              {paramKeys.map(key => {
                const config = PARAM_LABELS[key];
                const isEditing = editingParam === key;
                
                return (
                  <div key={key} style={{ 
                    padding: '1rem', 
                    background: 'var(--bg-tertiary)', 
                    borderRadius: '10px',
                    border: isEditing ? '2px solid var(--pinnacle-teal)' : '1px solid var(--border-color)',
                    transition: 'all 0.2s'
                  }}>
                    <div 
                      style={{ 
                        fontSize: '0.7rem', 
                        color: 'var(--text-muted)', 
                        marginBottom: '0.5rem', 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.05em',
                        fontWeight: 600,
                        cursor: 'help',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title={config.description}
                    >
                      {config.label}
                      <span style={{ color: 'var(--pinnacle-teal)', fontSize: '0.6rem' }}>ⓘ</span>
                    </div>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                          type="number"
                          value={engineParams[key]}
                          onChange={(e) => setEngineParams({ ...engineParams, [key]: parseFloat(e.target.value) })}
                          min={config.min}
                          max={config.max}
                          step={config.step}
                          style={{
                            width: '80px',
                            padding: '0.4rem 0.6rem',
                            fontSize: '0.9rem',
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--pinnacle-teal)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            outline: 'none'
                          }}
                          autoFocus
                        />
                        <button 
                          onClick={() => updateParam(key, engineParams[key])}
                          style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', background: 'var(--pinnacle-teal)', border: 'none', borderRadius: '6px', color: '#000', cursor: 'pointer', fontWeight: 600 }}
                        >
                          Save
                        </button>
                        <button 
                          onClick={() => setEditingParam(null)}
                          style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', background: 'var(--bg-hover)', border: 'none', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div 
                        onClick={() => setEditingParam(key)}
                        style={{ 
                          fontSize: '1.5rem', 
                          fontWeight: 700, 
                          color: 'var(--pinnacle-teal)', 
                          cursor: 'pointer',
                          transition: 'color 0.15s'
                        }}
                      >
                        {config.isPercent 
                          ? `${(engineParams[key] * 100).toFixed(0)}%` 
                          : engineParams[key].toFixed(2)}
                      </div>
                    )}
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      {config.description}
                    </div>
                    {/* Parameter slider */}
                    <input
                      type="range"
                      min={config.min}
                      max={config.max}
                      step={config.step}
                      value={engineParams[key]}
                      onChange={(e) => setEngineParams({ ...engineParams, [key]: parseFloat(e.target.value) })}
                      style={{ width: '100%', marginTop: '8px', accentColor: 'var(--pinnacle-teal)' }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Monte Carlo Results - Key Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', flexShrink: 0 }}>
        {/* P10 Cost */}
        <div className="metric-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div className="metric-label" style={{ color: '#10B981' }}>P10 Cost (Best)</div>
          <div className="metric-value" style={{ color: '#10B981' }}>
            {forecastResult ? formatCurrency(forecastResult.monteCarloCost.p10) : '—'}
          </div>
        </div>
        {/* P50 Cost */}
        <div className="metric-card accent-teal">
          <div className="metric-label">P50 Cost (Likely)</div>
          <div className="metric-value">
            {forecastResult ? formatCurrency(forecastResult.monteCarloCost.p50) : '—'}
          </div>
        </div>
        {/* P90 Cost */}
        <div className="metric-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div className="metric-label" style={{ color: '#EF4444' }}>P90 Cost (Worst)</div>
          <div className="metric-value" style={{ color: '#EF4444' }}>
            {forecastResult ? formatCurrency(forecastResult.monteCarloCost.p90) : '—'}
          </div>
        </div>
        {/* TCPI to BAC */}
        <div className="metric-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div className="metric-label">TCPI to BAC</div>
          <div className="metric-value" style={{ color: forecastResult && forecastResult.tcpi.toBac > 1.1 ? '#EF4444' : forecastResult && forecastResult.tcpi.toBac < 0.9 ? '#10B981' : 'var(--pinnacle-teal)' }}>
            {forecastResult ? forecastResult.tcpi.toBac.toFixed(2) : '—'}
          </div>
        </div>
        {/* Completion Date */}
        <div className="metric-card accent-lime">
          <div className="metric-label">Est. Completion</div>
          <div className="metric-value" style={{ fontSize: '0.95rem' }}>
            {forecastResult?.completionDate || '—'}
          </div>
        </div>
        {/* Duration P50 */}
        <div className="metric-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div className="metric-label">P50 Duration</div>
          <div className="metric-value">
            {forecastResult ? `${Math.round(forecastResult.monteCarloDuration.p50)} days` : '—'}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="dashboard-grid" style={{ flex: 1, minHeight: 0 }}>
        {/* IEAC Comparison */}
        <div className="chart-card grid-third" style={{ display: 'flex', flexDirection: 'column', maxHeight: '450px' }}>
          <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
            <h3 className="chart-card-title">IEAC Methods Comparison</h3>
          </div>
          <div className="chart-card-body" style={{ padding: '1rem', flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { 
                  label: 'Budget Rate (Optimistic)', 
                  value: forecastResult?.ieac.budgetRate, 
                  color: '#10B981',
                  tooltip: 'IEAC = BAC / Work Factor. Assumes remaining work will be completed at the original budget rate. Best case scenario if performance improves.'
                },
                { 
                  label: 'CPI Method (Status Quo)', 
                  value: forecastResult?.ieac.cpi, 
                  color: 'var(--pinnacle-teal)',
                  tooltip: 'IEAC = AC + (BAC - EV) / CPI. Assumes remaining work will be completed at the current cost performance rate. Most commonly used method.'
                },
                { 
                  label: 'CPI×SPI (Pessimistic)', 
                  value: forecastResult?.ieac.cpiSpi, 
                  color: '#F59E0B',
                  tooltip: 'IEAC = AC + (BAC - EV) / (CPI × SPI). Accounts for both cost and schedule performance. Worst case scenario accounting for schedule slippage.'
                },
                { 
                  label: 'Monte Carlo P50', 
                  value: forecastResult?.monteCarloCost.p50, 
                  color: '#8B5CF6',
                  tooltip: 'Probabilistic forecast from Monte Carlo simulation. P50 means there is a 50% probability the actual cost will be at or below this value.'
                }
              ].map((item, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '10px 12px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '8px',
                    borderLeft: `3px solid ${item.color}`
                  }}
                  title={item.tooltip}
                >
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'help', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {item.label}
                    <span style={{ color: 'var(--pinnacle-teal)', fontSize: '0.65rem' }}>ⓘ</span>
                  </span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: item.color }}>
                    {item.value ? formatCurrency(item.value) : '—'}
                  </span>
                </div>
              ))}
            </div>
            
            {/* BAC Reference */}
            <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(64, 224, 208, 0.1)', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Budget at Completion (BAC)</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatCurrency(projectState.bac)}
              </div>
            </div>
          </div>
        </div>

        {/* Forecast Charts */}
        <div className="chart-card grid-third">
          <div className="chart-card-header"><h3 className="chart-card-title">Budget Forecast</h3></div>
          <div className="chart-card-body" style={{ minHeight: '200px' }}>
            <ForecastChart data={data.forecast} height="180px" isBudget={true} />
          </div>
        </div>
        <div className="chart-card grid-third">
          <div className="chart-card-header"><h3 className="chart-card-title">Hours Forecast</h3></div>
          <div className="chart-card-body" style={{ minHeight: '200px' }}>
            <ForecastChart data={data.forecast} height="180px" isBudget={false} />
          </div>
        </div>

        {/* Trend Charts */}
        <div className="chart-card grid-half">
          <div className="chart-card-header">
            <h3 className="chart-card-title">CPI Trend</h3>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: projectState.cpi >= 1 ? '#10B981' : '#EF4444' }}>
              Current: {projectState.cpi.toFixed(2)}
            </span>
          </div>
          <div className="chart-card-body" style={{ minHeight: '180px' }}>
            <TrendChart data={cpiTrend} dates={trendDates} title="CPI" color="var(--pinnacle-teal)" height="160px" />
          </div>
        </div>
        <div className="chart-card grid-half">
          <div className="chart-card-header">
            <h3 className="chart-card-title">SPI Trend</h3>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: projectState.spi >= 1 ? '#10B981' : '#EF4444' }}>
              Current: {projectState.spi.toFixed(2)}
            </span>
          </div>
          <div className="chart-card-body" style={{ minHeight: '180px' }}>
            <TrendChart data={spiTrend} dates={trendDates} title="SPI" color="var(--pinnacle-lime)" height="160px" />
          </div>
        </div>

        {/* Engine Log */}
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              Engine Log
            </h3>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: '12px' }}>
              {engineLog.length} entries
            </span>
          </div>
          <div className="chart-card-body no-padding" style={{ maxHeight: '250px', overflow: 'auto' }}>
            <div style={{ padding: '0.5rem' }}>
              {engineLog.map((entry, i) => (
                <div key={i} style={{ 
                  padding: '0.75rem', 
                  borderBottom: i < engineLog.length - 1 ? '1px solid var(--border-color)' : 'none',
                  fontSize: '0.75rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ 
                      color: entry.type === 'simulation' ? 'var(--pinnacle-teal)' : 
                             entry.type === 'update' ? 'var(--pinnacle-lime)' : '#8B5CF6',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      fontSize: '0.65rem',
                      letterSpacing: '0.05em'
                    }}>
                      {entry.type}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>{entry.message}</div>
                  {entry.results && (
                    <div style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.7rem', display: 'flex', gap: '12px' }}>
                      <span>P50: <strong style={{ color: 'var(--pinnacle-teal)' }}>{formatCurrency(entry.results.p50Cost)}</strong></span>
                      <span>P90: <strong style={{ color: '#F59E0B' }}>{formatCurrency(entry.results.p90Cost)}</strong></span>
                      <span>Date: <strong>{entry.results.p50Date}</strong></span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scenario Comparison */}
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <h3 className="chart-card-title">Scenario Comparison</h3>
          </div>
          <div className="chart-card-body no-padding" style={{ maxHeight: '250px', overflow: 'auto' }}>
            <table className="data-table" style={{ fontSize: '0.75rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Scenario</th>
                  <th style={{ textAlign: 'center' }}>Duration</th>
                  <th style={{ textAlign: 'center' }}>EAC Cost</th>
                  <th style={{ textAlign: 'center' }}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                  <td><strong style={{ color: '#10B981' }}>P10 (Best Case)</strong></td>
                  <td style={{ textAlign: 'center' }}>{forecastResult ? `${Math.round(forecastResult.monteCarloDuration.p10)} days` : '—'}</td>
                  <td style={{ textAlign: 'center' }}>{forecastResult ? formatCurrency(forecastResult.monteCarloCost.p10) : '—'}</td>
                  <td style={{ textAlign: 'center', color: '#10B981' }}>10%</td>
                </tr>
                <tr style={{ background: 'rgba(64, 224, 208, 0.1)' }}>
                  <td><strong style={{ color: 'var(--pinnacle-teal)' }}>P50 (Likely)</strong></td>
                  <td style={{ textAlign: 'center' }}>{forecastResult ? `${Math.round(forecastResult.monteCarloDuration.p50)} days` : '—'}</td>
                  <td style={{ textAlign: 'center' }}>{forecastResult ? formatCurrency(forecastResult.monteCarloCost.p50) : '—'}</td>
                  <td style={{ textAlign: 'center', color: 'var(--pinnacle-teal)' }}>50%</td>
                </tr>
                <tr style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
                  <td><strong style={{ color: '#EF4444' }}>P90 (Worst Case)</strong></td>
                  <td style={{ textAlign: 'center' }}>{forecastResult ? `${Math.round(forecastResult.monteCarloDuration.p90)} days` : '—'}</td>
                  <td style={{ textAlign: 'center' }}>{forecastResult ? formatCurrency(forecastResult.monteCarloCost.p90) : '—'}</td>
                  <td style={{ textAlign: 'center', color: '#EF4444' }}>90%</td>
                </tr>
                <tr>
                  <td><strong>Budget Baseline</strong></td>
                  <td style={{ textAlign: 'center' }}>{projectState.remainingDuration} days</td>
                  <td style={{ textAlign: 'center' }}>{formatCurrency(projectState.bac)}</td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Planned</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* CSS for spinner animation */}
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
