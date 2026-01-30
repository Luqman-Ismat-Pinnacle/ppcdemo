'use client';

/**
 * @fileoverview Logs Context: Engine Logs + Change Logs for header dropdown.
 * Engine logs: CPM, actuals, and other engine calculations.
 * Change logs: updates made across the site (Data Management, sync, etc.).
 * @module lib/logs-context
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

export interface EngineLogEntry {
  id: string;
  createdAt: string;
  engine: string;
  lines: string[];
  meta?: { executionTimeMs?: number; projectDurationDays?: number; criticalPathCount?: number };
}

export interface ChangeLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  oldValue?: string;
  newValue?: string;
}

type LogsContextType = {
  engineLogs: EngineLogEntry[];
  changeLogs: ChangeLogEntry[];
  addEngineLog: (engine: string, lines: string[], meta?: EngineLogEntry['meta']) => void;
  addChangeLog: (entry: Omit<ChangeLogEntry, 'id' | 'timestamp'>) => void;
  clearEngineLogs: () => void;
  clearChangeLogs: () => void;
};

export const LogsContext = createContext<LogsContextType | undefined>(undefined);

const MAX_ENGINE_LOGS = 100;
const MAX_CHANGE_LOGS = 200;

function generateId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function LogsProvider({ children }: { children: ReactNode }) {
  const [engineLogs, setEngineLogs] = useState<EngineLogEntry[]>([]);
  const [changeLogs, setChangeLogs] = useState<ChangeLogEntry[]>([]);

  const addEngineLog = useCallback((engine: string, lines: string[], meta?: EngineLogEntry['meta']) => {
    const id = generateId();
    const createdAt = new Date().toISOString();
    const entry: EngineLogEntry = { id, createdAt, engine, lines, meta };
    setEngineLogs(prev => [entry, ...prev].slice(0, MAX_ENGINE_LOGS));

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await supabase.from('engine_logs').insert({
          created_at: createdAt,
          execution_time_ms: meta?.executionTimeMs ?? null,
          project_duration_days: meta?.projectDurationDays ?? null,
          critical_path_count: meta?.criticalPathCount ?? null,
          logs: lines,
          engine_name: engine,
          user_id: session?.user?.id ?? null,
        });
      } catch (err) {
        console.error('Failed to save engine log:', err);
      }
    })();
  }, []);

  const addChangeLog = useCallback((entry: Omit<ChangeLogEntry, 'id' | 'timestamp'>) => {
    const id = generateId();
    const timestamp = new Date().toISOString();
    const full: ChangeLogEntry = { ...entry, id, timestamp };
    setChangeLogs(prev => [full, ...prev].slice(0, MAX_CHANGE_LOGS));

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await supabase.from('change_logs').insert({
          created_at: timestamp,
          user_id: session?.user?.id ?? null,
          action: entry.action,
          entity_type: entry.entityType,
          entity_id: entry.entityId,
          description: entry.description,
          old_value: entry.oldValue ?? null,
          new_value: entry.newValue ?? null,
          user_name: entry.user ?? null,
        });
      } catch (err) {
        console.error('Failed to save change log:', err);
      }
    })();
  }, []);

  const clearEngineLogs = useCallback(() => setEngineLogs([]), []);
  const clearChangeLogs = useCallback(() => setChangeLogs([]), []);

  // Load recent engine_logs and change_logs from DB on mount
  useEffect(() => {
    (async () => {
      try {
        const [engRes, chgRes] = await Promise.all([
          supabase.from('engine_logs').select('id, created_at, logs, execution_time_ms, project_duration_days, critical_path_count, engine_name').order('created_at', { ascending: false }).limit(50),
          supabase.from('change_logs').select('id, created_at, action, entity_type, entity_id, description, old_value, new_value, user_name').order('created_at', { ascending: false }).limit(50),
        ]);
        if (engRes.data?.length) {
          const loaded: EngineLogEntry[] = engRes.data.map((row: any) => ({
            id: row.id,
            createdAt: row.created_at,
            engine: row.engine_name || 'CPM',
            lines: Array.isArray(row.logs) ? row.logs : [String(row.logs || '')],
            meta: {
              executionTimeMs: row.execution_time_ms,
              projectDurationDays: row.project_duration_days,
              criticalPathCount: row.critical_path_count,
            },
          }));
          setEngineLogs(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newEntries = loaded.filter(l => !existingIds.has(l.id));
            return [...newEntries, ...prev].slice(0, MAX_ENGINE_LOGS);
          });
        }
        if (chgRes.data?.length) {
          const loaded: ChangeLogEntry[] = chgRes.data.map((row: any) => ({
            id: row.id,
            timestamp: row.created_at,
            user: row.user_name || 'System',
            action: row.action || 'update',
            entityType: row.entity_type || '',
            entityId: row.entity_id || '',
            description: row.description || '',
            oldValue: row.old_value,
            newValue: row.new_value,
          }));
          setChangeLogs(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newEntries = loaded.filter(l => !existingIds.has(l.id));
            return [...newEntries, ...prev].slice(0, MAX_CHANGE_LOGS);
          });
        }
      } catch (_) {
        // Tables may not exist yet
      }
    })();
  }, []);

  const value: LogsContextType = {
    engineLogs,
    changeLogs,
    addEngineLog,
    addChangeLog,
    clearEngineLogs,
    clearChangeLogs,
  };

  return <LogsContext.Provider value={value}>{children}</LogsContext.Provider>;
}

export function useLogs() {
  const ctx = useContext(LogsContext);
  if (!ctx) throw new Error('useLogs must be used within LogsProvider');
  return ctx;
}
