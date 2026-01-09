'use client';

/**
 * @fileoverview Data Management Page for PPC V3 Project Controls.
 * 
 * The single source of truth for all application data. Provides:
 * - File upload (CSV, JSON, XLSX) with validation and error logging
 * - Full CRUD operations (Create, Read, Update, Delete) for all entity types
 * - Searchable dropdowns for FK fields (Employee, Project, etc.)
 * - Auto-calculated fields clearly distinguished from user input
 * - Supabase sync on save (when configured)
 * - Uses wbs-utils for EVM calculations
 * 
 * All other pages pull data from here via the DataContext.
 * 
 * @module app/project-controls/data-management/page
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useData } from '@/lib/data-context';
import { 
  convertWorkdayEmployees, 
  parseCSVString, 
  convertProjectPlanJSON,
  detectCSVDataType 
} from '@/lib/data-converter';
import { 
  exportAllToExcel, 
  importFromExcel, 
} from '@/lib/excel-utils';
import { 
  calculateAllUtilization, 
  type UtilizationResult 
} from '@/lib/utilization-engine';
import {
  isSupabaseConfigured,
  syncTable,
  DATA_KEY_TO_TABLE,
} from '@/lib/supabase';
import {
  calculateEVM,
  calculateWorkingDays,
} from '@/lib/wbs-utils';
import DatePicker from '@/components/ui/DatePicker';
import SearchableDropdown, { type DropdownOption } from '@/components/ui/SearchableDropdown';

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

type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'select' | 'employee' | 'project' | 'customer' | 'site' | 'unit' | 'portfolio' | 'phase' | 'task' | 'role';

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
// ID GENERATOR & UTILITIES
// ============================================================================

const generateId = (prefix: string): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}-${timestamp}${random}`.toUpperCase();
};

const getCurrentTimestamp = (): string => new Date().toISOString();

// Calculate variance days between planned and actual/forecast dates
const calculateVarianceDays = (plannedDate: string | null, actualDate: string | null): number => {
  if (!plannedDate || !actualDate) return 0;
  const planned = new Date(plannedDate);
  const actual = new Date(actualDate);
  const diffTime = actual.getTime() - planned.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DataManagementPage() {
  const { filteredData, updateData, hierarchyFilter, dateFilter, isLoading: contextLoading, refreshData } = useData();
  const data = filteredData;
  const [selectedTable, setSelectedTable] = useState<string>('employees');
  const [showChangeLog, setShowChangeLog] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error' | 'info' | null; message: string }>({ type: null, message: '' });
  const [importLog, setImportLog] = useState<ImportLogEntry[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showImportLog, setShowImportLog] = useState(false);
  const [editedRows, setEditedRows] = useState<Map<string, Record<string, any>>>(new Map());
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [newRows, setNewRows] = useState<Record<string, any>[]>([]);
  const [supabaseEnabled, setSupabaseEnabled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Use context loading state
  const isLoading = contextLoading;

  const changeLog = data.changeLog || [];

  // Check Supabase configuration on mount
  useEffect(() => {
    setSupabaseEnabled(isSupabaseConfigured());
  }, []);

  // ============================================================================
  // DROPDOWN OPTIONS - Built from current data
  // ============================================================================

  const employeeOptions: DropdownOption[] = useMemo(() => {
    return (data.employees || []).map((emp: any) => ({
      id: emp.id || emp.employeeId,
      name: emp.name,
      secondary: emp.jobTitle || emp.email,
    }));
  }, [data.employees]);

  const portfolioOptions: DropdownOption[] = useMemo(() => {
    return (data.portfolios || []).map((p: any) => ({
      id: p.id || p.portfolioId,
      name: p.name,
      secondary: p.manager,
    }));
  }, [data.portfolios]);

  const customerOptions: DropdownOption[] = useMemo(() => {
    return (data.customers || []).map((c: any) => ({
      id: c.id || c.customerId,
      name: c.name,
    }));
  }, [data.customers]);

  const siteOptions: DropdownOption[] = useMemo(() => {
    return (data.sites || []).map((s: any) => ({
      id: s.id || s.siteId,
      name: s.name,
      secondary: s.location,
    }));
  }, [data.sites]);

  const unitOptions: DropdownOption[] = useMemo(() => {
    return (data.units || []).map((u: any) => ({
      id: u.id || u.unitId,
      name: u.name,
      secondary: u.description,
    }));
  }, [data.units]);

  // Role options for generic resource assignment
  const roleOptions: DropdownOption[] = useMemo(() => {
    const roles = [
      'Partner',
      'Senior Manager',
      'Project Manager',
      'Project Lead',
      'Technical Lead',
      'Technical Manager',
      'Technical Writer',
      'QA/QC Auditor',
      'Data Engineer',
      'Data Scientist',
      'CAD / Drafter',
      'Field Technician',
      'IDMS SME',
      'Corrosion Engineer',
      'Reliability Specialist',
      'Senior Reliability Specialist',
      'Senior Engineer',
      'Process Engineer',
      'Deployment Lead',
      'Change Lead',
      'Training Lead',
    ];
    return roles.map(r => ({ id: r, name: r }));
  }, []);

  const projectOptions: DropdownOption[] = useMemo(() => {
    return (data.projects || []).map((p: any) => ({
      id: p.id || p.projectId,
      name: p.name,
      secondary: p.manager,
    }));
  }, [data.projects]);

  const phaseOptions: DropdownOption[] = useMemo(() => {
    return (data.phases || []).map((p: any) => ({
      id: p.id || p.phaseId,
      name: p.name,
    }));
  }, [data.phases]);

  const taskOptions: DropdownOption[] = useMemo(() => {
    return (data.tasks || []).map((t: any) => ({
      id: t.id || t.taskId,
      name: t.taskName || t.name,
    }));
  }, [data.tasks]);

  const chargeCodeOptions: DropdownOption[] = useMemo(() => {
    return (data.chargecodes || []).map((c: any) => ({
      id: c.code || c.codeId,
      name: `${c.code} - ${c.name}`,
      secondary: c.category,
    }));
  }, [data.chargecodes]);

  // Get options for a field type
  const getOptionsForType = useCallback((type: FieldType): DropdownOption[] => {
    switch (type) {
      case 'employee': return employeeOptions;
      case 'portfolio': return portfolioOptions;
      case 'customer': return customerOptions;
      case 'site': return siteOptions;
      case 'unit': return unitOptions;
      case 'project': return projectOptions;
      case 'phase': return phaseOptions;
      case 'task': return taskOptions;
      case 'role': return roleOptions;
      default: return [];
    }
  }, [employeeOptions, portfolioOptions, customerOptions, siteOptions, unitOptions, projectOptions, phaseOptions, taskOptions, roleOptions]);

  // ============================================================================
  // SECTIONS CONFIGURATION - With field types and auto-calculated flags
  // ============================================================================

  const sections: SectionConfig[] = useMemo(() => [
    { 
      key: 'employees', 
      label: 'Employees', 
      dataKey: 'employees',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: true },
        { key: 'employeeId', header: 'Employee ID', type: 'text', editable: true },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'email', header: 'Email', type: 'text', editable: true },
        { key: 'jobTitle', header: 'Job Title', type: 'text', editable: true },
        { key: 'managementLevel', header: 'Mgmt Level', type: 'select', editable: true, selectOptions: ['Individual Contributor', 'Manager', 'Senior Manager', 'Director', 'VP', 'Partner'] },
        { key: 'employeeType', header: 'Type', type: 'select', editable: true, selectOptions: ['Regular', 'Contractor', 'Intern'] },
        { key: 'manager', header: 'Manager', type: 'text', editable: true },
        { key: 'hourlyRate', header: 'Rate', type: 'number', editable: true },
        { key: 'utilizationPercent', header: 'Util %', type: 'number', editable: true },
        { key: 'isActive', header: 'Active', type: 'boolean', editable: true },
      ],
      defaultNewRow: () => ({
        id: generateId('EMP'),
        employeeId: '',
        name: '',
        email: '',
        jobTitle: '',
        managementLevel: 'Individual Contributor',
        employeeType: 'Regular',
        manager: '',
        hourlyRate: 0,
        utilizationPercent: 80,
        isActive: true,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    { 
      key: 'portfolios', 
      label: 'Portfolios', 
      dataKey: 'portfolios',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: true },
        { key: 'portfolioId', header: 'Portfolio ID', type: 'text', editable: true },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'employeeId', header: 'Owner', type: 'employee', editable: true },
        { key: 'manager', header: 'Manager', type: 'text', editable: true },
        { key: 'methodology', header: 'Methodology', type: 'text', editable: true },
        { key: 'baselineStartDate', header: 'Baseline Start', type: 'date', editable: true },
        { key: 'baselineEndDate', header: 'Baseline End', type: 'date', editable: true },
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
        id: generateId('PRF'),
        portfolioId: '',
        name: '',
        employeeId: null,
        manager: '',
        methodology: '',
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        percentComplete: 0,
        baselineHours: 0,
        actualHours: 0,
        remainingHours: 0,
        baselineCost: 0,
        actualCost: 0,
        remainingCost: 0,
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
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: true },
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
        id: generateId('CST'),
        customerId: '',
        name: '',
        portfolioId: null,
        employeeId: null,
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        percentComplete: 0,
        baselineHours: 0,
        actualHours: 0,
        remainingHours: 0,
        baselineCost: 0,
        actualCost: 0,
        remainingCost: 0,
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
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: true },
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
        id: generateId('STE'),
        siteId: '',
        name: '',
        customerId: null,
        employeeId: null,
        location: '',
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        percentComplete: 0,
        baselineHours: 0,
        actualHours: 0,
        remainingHours: 0,
        baselineCost: 0,
        actualCost: 0,
        remainingCost: 0,
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
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: true },
        { key: 'unitId', header: 'Unit ID', type: 'text', editable: true },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'description', header: 'Description', type: 'text', editable: true },
        { key: 'siteId', header: 'Site', type: 'site', editable: true },
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
        id: generateId('UNT'),
        unitId: '',
        name: '',
        description: '',
        siteId: null,
        employeeId: null,
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        percentComplete: 0,
        baselineHours: 0,
        actualHours: 0,
        remainingHours: 0,
        baselineCost: 0,
        actualCost: 0,
        remainingCost: 0,
        predecessorId: null,
        predecessorRelationship: null,
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
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: true },
        { key: 'projectId', header: 'Project ID', type: 'text', editable: true },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'customerId', header: 'Customer', type: 'customer', editable: true },
        { key: 'siteId', header: 'Site', type: 'site', editable: true },
        { key: 'unitId', header: 'Unit', type: 'unit', editable: true },
        { key: 'employeeId', header: 'PM', type: 'employee', editable: true },
        { key: 'billableType', header: 'Billable', type: 'select', editable: true, selectOptions: ['T&M', 'FP'] },
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
        { key: 'predecessorId', header: 'Predecessor', type: 'text', editable: true },
        { key: 'predecessorRelationship', header: 'Pred Rel', type: 'select', editable: true, selectOptions: ['FS', 'SS', 'FF', 'SF'] },
        { key: 'isActive', header: 'Active', type: 'boolean', editable: true },
      ],
      defaultNewRow: () => ({
        id: generateId('PRJ'),
        projectId: '',
        name: '',
        customerId: null,
        siteId: null,
        unitId: null,
        employeeId: null,
        billableType: 'T&M',
        methodology: '',
        manager: '',
        status: 'Not Started',
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        percentComplete: 0,
        baselineHours: 0,
        actualHours: 0,
        remainingHours: 0,
        baselineCost: 0,
        actualCost: 0,
        remainingCost: 0,
        eacBudget: 0,
        eacHours: 0,
        cpi: 1.0,
        spi: 1.0,
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
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: true },
        { key: 'phaseId', header: 'Phase ID', type: 'text', editable: true },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'employeeId', header: 'Lead', type: 'employee', editable: true },
        { key: 'sequence', header: 'Seq', type: 'number', editable: true },
        { key: 'startDate', header: 'Start', type: 'date', editable: true },
        { key: 'endDate', header: 'End', type: 'date', editable: true },
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
        id: generateId('PHS'),
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
        percentComplete: 0,
        baselineHours: 0,
        actualHours: 0,
        remainingHours: 0,
        baselineCost: 0,
        actualCost: 0,
        remainingCost: 0,
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
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: true },
        { key: 'taskId', header: 'Task ID', type: 'text', editable: true },
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
        // CPM Fields
        { key: 'earlyStart', header: 'ES', type: 'number', editable: false, autoCalculated: true, tooltip: 'Early Start' },
        { key: 'earlyFinish', header: 'EF', type: 'number', editable: false, autoCalculated: true, tooltip: 'Early Finish' },
        { key: 'lateStart', header: 'LS', type: 'number', editable: false, autoCalculated: true, tooltip: 'Late Start' },
        { key: 'lateFinish', header: 'LF', type: 'number', editable: false, autoCalculated: true, tooltip: 'Late Finish' },
        { key: 'totalFloat', header: 'Total Float', type: 'number', editable: false, autoCalculated: true },
        { key: 'freeFloat', header: 'Free Float', type: 'number', editable: false, autoCalculated: true },
        // Flags
        { key: 'isCritical', header: 'Critical', type: 'boolean', editable: true },
        { key: 'isMilestone', header: 'Milestone', type: 'boolean', editable: true },
        { key: 'isSubTask', header: 'Sub-Task', type: 'boolean', editable: true },
        // Predecessor
        { key: 'predecessorId', header: 'Predecessor', type: 'task', editable: true },
        { key: 'predecessorRelationship', header: 'Pred Rel', type: 'select', editable: true, selectOptions: ['FS', 'SS', 'FF', 'SF'] },
        // Notes
        { key: 'comments', header: 'Comments', type: 'text', editable: true },
      ],
      defaultNewRow: () => ({
        id: generateId('TSK'),
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
        // CPM
        earlyStart: 0,
        earlyFinish: 0,
        lateStart: 0,
        lateFinish: 0,
        totalFloat: 0,
        freeFloat: 0,
        // Flags
        isCritical: false,
        isMilestone: false,
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
      onFieldChange: (row, field, value, _data) => {
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
      key: 'hours', 
      label: 'Hour Entries', 
      dataKey: 'hours',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: true },
        { key: 'entryId', header: 'Entry ID', type: 'text', editable: true },
        { key: 'employeeId', header: 'Employee', type: 'employee', editable: true },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'phaseId', header: 'Phase', type: 'phase', editable: true },
        { key: 'taskId', header: 'Task', type: 'task', editable: true },
        { key: 'chargeCode', header: 'Charge Code', type: 'text', editable: true },
        { key: 'date', header: 'Date', type: 'date', editable: true },
        { key: 'hours', header: 'Hours', type: 'number', editable: true },
        { key: 'description', header: 'Description', type: 'text', editable: true },
        { key: 'isBillable', header: 'Billable', type: 'boolean', editable: true },
        { key: 'isApproved', header: 'Approved', type: 'boolean', editable: true },
      ],
      defaultNewRow: () => ({
        id: generateId('HRS'),
        entryId: '',
        employeeId: null,
        taskId: null,
        projectId: null,
        phaseId: null,
        chargeCode: '',
        date: new Date().toISOString().split('T')[0],
        hours: 0,
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
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: true },
        { key: 'milestoneId', header: 'Milestone ID', type: 'text', editable: true },
        { key: 'milestoneName', header: 'Name', type: 'text', editable: true },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'phaseId', header: 'Phase', type: 'phase', editable: true },
        { key: 'status', header: 'Status', type: 'select', editable: true, selectOptions: ['Not Started', 'In Progress', 'Completed', 'Missed'] },
        { key: 'plannedDate', header: 'Planned', type: 'date', editable: true },
        { key: 'forecastedDate', header: 'Forecast', type: 'date', editable: true },
        { key: 'actualDate', header: 'Actual', type: 'date', editable: true },
        { key: 'varianceDays', header: 'Variance', type: 'number', editable: false, autoCalculated: true, tooltip: 'Days between planned and actual' },
        { key: 'percentComplete', header: '% Complete', type: 'number', editable: true },
      ],
      defaultNewRow: () => ({
        id: generateId('MLS'),
        milestoneId: '',
        milestoneName: '',
        projectId: null,
        phaseId: null,
        taskId: null,
        customer: '',
        site: '',
        status: 'Not Started',
        percentComplete: 0,
        plannedDate: null,
        forecastedDate: null,
        actualDate: null,
        varianceDays: 0,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      }),
      onFieldChange: (row, field, value, _data) => {
        // Auto-calculate variance days
        if (field === 'plannedDate' || field === 'actualDate' || field === 'forecastedDate') {
          const planned = field === 'plannedDate' ? value : row.plannedDate;
          const actual = field === 'actualDate' ? value : (row.actualDate || row.forecastedDate);
          row.varianceDays = calculateVarianceDays(planned, actual);
        }
        return row;
      }
    },
    { 
      key: 'deliverables', 
      label: 'Deliverables', 
      dataKey: 'deliverables',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: true },
        { key: 'deliverableId', header: 'Deliv ID', type: 'text', editable: true },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'phaseId', header: 'Phase', type: 'phase', editable: true },
        { key: 'employeeId', header: 'Owner', type: 'employee', editable: true },
        { key: 'type', header: 'Type', type: 'text', editable: true },
        { key: 'status', header: 'Status', type: 'select', editable: true, selectOptions: ['Not Started', 'In Progress', 'Under Review', 'Approved', 'Rejected'] },
        { key: 'dueDate', header: 'Due Date', type: 'date', editable: true },
        { key: 'completedDate', header: 'Completed', type: 'date', editable: true },
        { key: 'percentComplete', header: '% Complete', type: 'number', editable: true },
      ],
      defaultNewRow: () => ({
        id: generateId('DLB'),
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
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: true },
        { key: 'qcTaskId', header: 'QC ID', type: 'text', editable: true },
        { key: 'parentTaskId', header: 'Parent Task', type: 'task', editable: true },
        { key: 'employeeId', header: 'Reviewer', type: 'employee', editable: true },
        { key: 'qcType', header: 'Type', type: 'select', editable: true, selectOptions: ['Initial', 'Kickoff', 'Mid', 'Final', 'Post-Validation', 'Field QC', 'Validation', 'Peer Review'] },
        { key: 'qcStatus', header: 'Status', type: 'select', editable: true, selectOptions: ['Pending', 'Pass', 'Fail', 'Rework', 'Not Started', 'In Progress', 'Complete'] },
        { key: 'qcScore', header: 'Score', type: 'number', editable: true },
        { key: 'qcHours', header: 'Hours', type: 'number', editable: true },
        { key: 'qcCriticalErrors', header: 'Critical Err', type: 'number', editable: true },
        { key: 'qcNonCriticalErrors', header: 'Non-Crit Err', type: 'number', editable: true },
      ],
      defaultNewRow: () => ({
        id: generateId('QCT'),
        qcTaskId: '',
        parentTaskId: null,
        employeeId: null,
        qcResourceId: null,
        qcType: 'Peer Review',
        qcStatus: 'Pending',
        qcHours: 0,
        qcScore: 0,
        qcCount: 0,
        qcUom: 'items',
        qcCriticalErrors: 0,
        qcNonCriticalErrors: 0,
        qcComments: '',
        qcStartDate: null,
        qcEndDate: null,
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      })
    },
    { 
      key: 'chargecodes', 
      label: 'Charge Codes', 
      dataKey: 'chargecodes',
      idKey: 'id',
      fields: [
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: true },
        { key: 'codeId', header: 'Code ID', type: 'text', editable: true },
        { key: 'code', header: 'Code', type: 'text', editable: true },
        { key: 'name', header: 'Name', type: 'text', editable: true },
        { key: 'category', header: 'Category', type: 'select', editable: true, selectOptions: ['Billable', 'Non-Billable', 'Internal', 'PTO', 'Admin'] },
        { key: 'isActive', header: 'Active', type: 'boolean', editable: true },
      ],
      defaultNewRow: () => ({
        id: generateId('CHG'),
        codeId: '',
        code: '',
        name: '',
        category: 'Billable',
        isActive: true,
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
        { key: 'id', header: 'ID', type: 'text', editable: false, autoCalculated: true },
        { key: 'projectId', header: 'Project', type: 'project', editable: true },
        { key: 'projectName', header: 'Project Name', type: 'text', editable: false, autoCalculated: true, tooltip: 'Auto-filled from Project selection' },
        { key: 'overallStatus', header: 'Status', type: 'select', editable: true, selectOptions: ['draft', 'pending_review', 'approved', 'rejected'] },
        { key: 'overallScore', header: 'Score', type: 'number', editable: false, autoCalculated: true, tooltip: 'Calculated from health checks' },
      ],
      defaultNewRow: () => ({
        id: generateId('PHC'),
        projectId: null,
        projectName: '',
        overallStatus: 'draft',
        overallScore: 0,
        checks: [],
        approvals: {},
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
      }),
      onFieldChange: (row, field, value, allData) => {
        // Auto-fill project name when project is selected
        if (field === 'projectId' && value) {
          const project = (allData.projects || []).find((p: any) => p.id === value || p.projectId === value);
          if (project) {
            row.projectName = project.name;
          }
        }
        return row;
      }
    },
  ], []);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const addToImportLog = useCallback((entry: Omit<ImportLogEntry, 'id' | 'timestamp'>) => {
    const newEntry: ImportLogEntry = {
      ...entry,
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };
    setImportLog(prev => [...prev, newEntry]);
    return newEntry;
  }, []);

  const getCurrentSection = useCallback(() => {
    return sections.find(s => s.key === selectedTable);
  }, [sections, selectedTable]);

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
    if (section.key === 'tasks') {
      return [...mergedData.filter((t: any) => !t.isSubTask), ...newRows];
    }
    
    return [...mergedData, ...newRows];
  }, [getCurrentSection, data, editedRows, newRows]);

  // Clean data for Supabase - convert empty strings to null for foreign keys
  const cleanDataForSupabase = useCallback((records: Record<string, any>[]): Record<string, unknown>[] => {
    return records.map(record => {
      const cleaned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        if (key.endsWith('Id') && value === '') {
          cleaned[key] = null;
        } else {
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
      const cleanedRecords = cleanDataForSupabase(records as Record<string, any>[]);
      const result = await syncTable(dataKey, cleanedRecords);
      
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
    setNewRows(prev => [...prev, newRow]);
    setSelectedRows(prev => new Set([...prev, newRow[section.idKey]]));
  }, [getCurrentSection]);

  const handleDeleteSelected = useCallback(async () => {
    const section = getCurrentSection();
    if (!section || selectedRows.size === 0) return;

    setNewRows(prev => prev.filter(row => !selectedRows.has(row[section.idKey])));

    const existingData = (data as any)[section.dataKey] || [];
    const filteredData = existingData.filter((row: any) => !selectedRows.has(row[section.idKey]));
    
    updateData({ [section.dataKey]: filteredData });

    if (supabaseEnabled && DATA_KEY_TO_TABLE[section.key]) {
      await syncToSupabase(section.key, filteredData);
    }
    
    setSelectedRows(new Set());
    setUploadStatus({ type: 'success', message: `Deleted ${selectedRows.size} row(s)` });
  }, [getCurrentSection, selectedRows, data, updateData, supabaseEnabled, syncToSupabase]);

  const handleSaveChanges = useCallback(async () => {
    const section = getCurrentSection();
    if (!section) return;

    setIsSyncing(true);
    const existingData = (data as any)[section.dataKey] || [];
    
    const updatedData = existingData.map((row: any) => {
      const edited = editedRows.get(row[section.idKey]);
      return edited ? { ...row, ...edited, updatedAt: getCurrentTimestamp() } : row;
    });
    
    const allData = [...updatedData, ...newRows];
    
    updateData({ [section.dataKey]: allData });
    
    let syncMessage = '';
    if (supabaseEnabled && DATA_KEY_TO_TABLE[section.key]) {
      const syncResult = await syncToSupabase(section.key, allData);
      syncMessage = syncResult.success ? ' • Synced' : ` • ${syncResult.message}`;
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
    const newRowIndex = newRows.findIndex(r => r[section.idKey] === rowId);
    if (newRowIndex >= 0) {
      setNewRows(prev => {
        const updated = [...prev];
        updated[newRowIndex] = { ...updated[newRowIndex], [field]: value };
        
        // Apply onFieldChange if defined
        if (section.onFieldChange) {
          updated[newRowIndex] = section.onFieldChange(updated[newRowIndex], field, value, data);
        }
        
        return updated;
      });
    } else {
      setEditedRows(prev => {
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
  }, [getCurrentSection, newRows, data]);

  const handleRowSelect = useCallback((rowId: string, selected: boolean) => {
    setSelectedRows(prev => {
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
      setSelectedRows(new Set(tableData.map((row: any) => row[section.idKey])));
    } else {
      setSelectedRows(new Set());
    }
  }, [getCurrentSection, getTableData]);

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
            id: emp.employeeId || generateId('EMP'),
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

    // Non-editable fields
    if (!field.editable || field.autoCalculated) {
      let formattedValue = '-';
      if (displayValue !== null && displayValue !== undefined) {
        if (typeof displayValue === 'boolean') {
          formattedValue = displayValue ? 'Yes' : 'No';
        } else if (typeof displayValue === 'number') {
          formattedValue = field.key.includes('cpi') || field.key.includes('spi') 
            ? displayValue.toFixed(2) 
            : displayValue.toString();
        } else {
          formattedValue = displayValue.toString();
        }
      }
      return (
        <td
          key={field.key}
          style={{
            padding: '8px 10px',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            background: 'rgba(0,0,0,0.15)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '120px',
          }}
          title={field.tooltip || formattedValue}
        >
          {formattedValue}
        </td>
      );
    }

    // Boolean dropdown
    if (field.type === 'boolean') {
      return (
        <td key={field.key} style={{ padding: '4px 6px' }}>
          <select
            value={displayValue ? 'true' : 'false'}
            onChange={(e) => handleCellEdit(rowId, field.key, e.target.value === 'true')}
            style={{
              padding: '4px 6px',
              fontSize: '0.7rem',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              width: '50px'
            }}
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </td>
      );
    }

    // Select dropdown
    if (field.type === 'select' && field.selectOptions) {
  return (
        <td key={field.key} style={{ padding: '4px 6px' }}>
          <select
            value={displayValue || ''}
            onChange={(e) => handleCellEdit(rowId, field.key, e.target.value)}
            style={{
              padding: '4px 6px',
              fontSize: '0.7rem',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              minWidth: '80px',
            }}
          >
            <option value="">-</option>
            {field.selectOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </td>
      );
    }

    // Date picker
    if (field.type === 'date') {
      return (
        <td key={field.key} style={{ padding: '4px 6px', minWidth: '130px' }}>
          <DatePicker
            value={displayValue || null}
            onChange={(date) => handleCellEdit(rowId, field.key, date)}
            placeholder="Select"
          />
        </td>
      );
    }

    // FK dropdowns (employee, project, etc.)
    if (['employee', 'project', 'customer', 'site', 'portfolio', 'phase', 'task'].includes(field.type)) {
      const options = getOptionsForType(field.type);
      return (
        <td key={field.key} style={{ padding: '4px 6px', minWidth: '140px' }}>
          <SearchableDropdown
            value={displayValue || null}
            options={options}
            onChange={(id) => handleCellEdit(rowId, field.key, id)}
            placeholder="Select..."
            width="100%"
          />
        </td>
      );
    }

    // Text/Number input
    return (
      <td
        key={field.key}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => {
          const newValue = e.currentTarget.textContent || '';
          if (newValue !== String(displayValue || '')) {
            const parsed = field.type === 'number' ? parseFloat(newValue) || 0 : newValue;
            handleCellEdit(rowId, field.key, parsed);
          }
        }}
                          style={{ 
          padding: '8px 10px',
          fontSize: '0.75rem',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '150px',
          cursor: 'text',
          background: isEdited ? 'rgba(205, 220, 57, 0.1)' : 'rgba(64, 224, 208, 0.02)',
          outline: 'none'
        }}
      >
        {displayValue ?? '-'}
      </td>
    );
  }, [editedRows, handleCellEdit, getOptionsForType]);

  // ============================================================================
  // TABLE RENDERER
  // ============================================================================

  const renderTable = useCallback(() => {
    const section = getCurrentSection();
    if (!section) return null;

    const tableData = getTableData();
    const hasChanges = editedRows.size > 0 || newRows.length > 0;
    const allSelected = tableData.length > 0 && selectedRows.size === tableData.length;

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
            <button onClick={handleAddRow} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add
            </button>
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
              {tableData.length} rows {hasChanges && <span style={{ color: 'var(--pinnacle-teal)' }}>• Unsaved</span>}
                              </span>
            {hasChanges && (
              <button onClick={handleSaveChanges} className="btn btn-primary btn-sm" disabled={isSyncing}>
                {isSyncing ? 'Saving...' : 'Save'}
              </button>
            )}
                              </div>
                          </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table" style={{ width: '100%', tableLayout: 'auto' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-tertiary)' }}>
              <tr>
                <th style={{ width: '36px', textAlign: 'center', padding: '10px 6px' }}>
                  <input type="checkbox" checked={allSelected} onChange={(e) => handleSelectAll(e.target.checked)} />
                </th>
                {section.fields.map(field => (
                  <th key={field.key} style={{
                    whiteSpace: 'nowrap', padding: '10px 8px', fontSize: '0.7rem', fontWeight: 600,
                    textAlign: 'left', borderBottom: '2px solid var(--pinnacle-teal)',
                    background: field.autoCalculated ? 'rgba(0,0,0,0.2)' : 'transparent',
                  }} title={field.tooltip}>
                    {field.header}
                    {field.autoCalculated && <span style={{ marginLeft: '4px', fontSize: '0.6rem', opacity: 0.6 }}>•</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={section.fields.length + 1} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <span className="spinner" style={{ width: '16px', height: '16px' }}></span>
                      Loading data from Supabase...
                        </div>
                  </td>
                </tr>
              ) : tableData.length === 0 ? (
                <tr>
                  <td colSpan={section.fields.length + 1} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No data. Click "Add" to create a new row or Import data.
                  </td>
                </tr>
              ) : (
                tableData.map((row: any, idx: number) => {
                  const rowId = row[section.idKey];
                  const isSelected = selectedRows.has(rowId);
                  const isNew = newRows.some(nr => nr[section.idKey] === rowId);
                  const hasRowEdits = editedRows.has(rowId);

                  return (
                    <tr key={rowId || idx} style={{
                      background: isNew ? 'rgba(64,224,208,0.05)' : hasRowEdits ? 'rgba(205,220,57,0.05)' : isSelected ? 'rgba(64,224,208,0.08)' : 'transparent',
                    }}>
                      <td style={{ textAlign: 'center', padding: '6px' }}>
                        <input type="checkbox" checked={isSelected} onChange={(e) => handleRowSelect(rowId, e.target.checked)} />
                      </td>
                      {section.fields.map(field => renderCell(row, field, rowId))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
                </div>
      </div>
    );
  }, [getCurrentSection, getTableData, editedRows, newRows, selectedRows, handleAddRow, handleDeleteSelected, handleSaveChanges, handleSelectAll, handleRowSelect, renderCell, isSyncing, isLoading, supabaseEnabled]);

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
              {isLoading ? '...' : '↻ Refresh'}
          </button>
          )}
          <button onClick={() => setShowChangeLog(!showChangeLog)} className="btn btn-secondary btn-sm">Activity</button>
          <button className="btn btn-secondary btn-sm" onClick={() => exportAllToExcel(data, hierarchyFilter, dateFilter)}>Export</button>
          <input ref={fileInputRef} type="file" accept=".csv,.json,.xlsx,.xls" onChange={handleFileUpload} style={{ display: 'none' }} />
          <button className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
            {isImporting ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>

      {/* Import Log */}
      {showImportLog && importLog.length > 0 && (
        <div className="chart-card" style={{ marginBottom: '0.75rem', flexShrink: 0, maxHeight: '100px', overflow: 'auto' }}>
          {importLog.slice(-5).map(e => (
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

      {/* Activity Log Modal */}
      {showChangeLog && (
        <div style={{
          position: 'fixed', top: '120px', right: '24px', background: 'rgba(20,20,20,0.98)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          width: '360px', maxHeight: '400px', overflow: 'hidden', zIndex: 1000
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Activity Log</span>
            <button onClick={() => setShowChangeLog(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
                </div>
          <div style={{ overflowY: 'auto', maxHeight: '340px', padding: '8px' }}>
            {changeLog.length === 0 && importLog.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No activity</div>
            ) : (
              [...changeLog, ...importLog.map(e => ({ id: e.id, timestamp: e.timestamp.toISOString(), entityType: e.entity, action: e.action, newValue: e.message }))]
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 30)
                .map(entry => (
                  <div key={entry.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.7rem' }}>
                    <span style={{ color: 'var(--pinnacle-teal)' }}>{entry.entityType}</span>: {entry.newValue || entry.action}
              </div>
                ))
            )}
                </div>
      </div>
      )}

      <style jsx>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}
