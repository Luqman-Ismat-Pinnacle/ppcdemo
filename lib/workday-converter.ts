import type { SampleData } from '@/types/data';

export function convertWorkdayProjectReport(entries: any[]): Partial<SampleData> {
    const result: Partial<SampleData> = {
        projects: [],
        customers: [],
        sites: [],
        portfolios: [], // Initialize for default portfolio
    };

    const now = new Date().toISOString();
    // We maintain a map to avoid duplicates if multiple rows refer to same customer/site
    const customerMap = new Map<string, any>();
    const siteMap = new Map<string, any>();

    // Regex to clean Project ID: "1518_200IFSClosed1 (Inactive)" -> "1518_200IFSClosed1"
    const cleanId = (rawId: string) => rawId ? rawId.replace(/\s*\(.*?\)\s*/g, '').trim() : '';

    // Regex to clean Project Name: "BP – Gelsenkirchen – CMIP Implementation (Inactive)" -> "BP – Gelsenkirchen – CMIP Implementation"
    const cleanName = (rawName: string) => rawName ? rawName.replace(/\s*\(Inactive\)\s*/gi, '').trim() : '';

    // Create a default Portfolio for Workday imports
    const workdayPortfolioId = "PRF-WORKDAY-IMPORT";
    result.portfolios?.push({
        id: workdayPortfolioId,
        portfolioId: workdayPortfolioId,
        name: "Workday Import Portfolio",
        manager: "System",
        isActive: true,
        createdAt: now,
        updatedAt: now,
        // isWorkday: true, // REMOVED - not in schema
        employeeId: null, // Default
        methodology: "Agile", // Default
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        percentComplete: 0,
        comments: "Default container for Workday imports",
        baselineHours: 0,
        actualHours: 0,
        baselineCost: 0,
        actualCost: 0,
        predecessorId: null,
        predecessorRelationship: null
    });

    // Generate ID helper (matches Edge Function)
    const generateId = (prefix: string, name: string) => {
        const slug = name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 30);
        return `${prefix}-${slug}`;
    };

    entries.forEach((entry: any, index: number) => {
        // -------------------------------------------------------------------------
        // 1. EXTRACT RAW FIELDS
        // -------------------------------------------------------------------------
        const rawProjectId = entry["Project_by_ID"];
        const rawProjectName = entry["Project"];
        const rawCustomerName = entry["Customer"];
        const rawSiteName = entry["Site"];

        // Portfolio Manager (Optional_Project_Hierarchies)
        // Workday sometimes returns this as an object or string
        const rawPortfolioMgr = entry["Optional_Project_Hierarchies"];
        let portfolioMgrName = "System";
        if (typeof rawPortfolioMgr === 'string') portfolioMgrName = rawPortfolioMgr;
        else if (rawPortfolioMgr && rawPortfolioMgr.Descriptor) portfolioMgrName = rawPortfolioMgr.Descriptor;

        // Dates - Robust extraction
        const rawStartDate = typeof entry["Start_Date"] === 'string' ? entry["Start_Date"].trim() : null;
        const rawEndDate = typeof entry["End_Date"] === 'string' ? entry["End_Date"].trim() : null;

        // Status
        const projectStatus = entry["Project_Status"];
        const isActive = (entry["Inactive_-_Current"] === "1") ? false : (projectStatus === "Active");

        // Manager
        const managerName = entry["CF_ARI_Sr_Project_Manager"] || "";

        // Billable Type
        const primHierarchy = entry["Primary_Project_Hierarchy"] || "";
        let billableType: 'T&M' | 'FP' = 'T&M';
        if (primHierarchy.includes("Fixed Price")) billableType = 'FP';
        else if (primHierarchy.includes("Time & Materials")) billableType = 'T&M';

        // -------------------------------------------------------------------------
        // 2. PROCESS IDS & NAMES
        // -------------------------------------------------------------------------
        const projectId = cleanId(rawProjectId) || `PRJ-${(index + 1).toString().padStart(4, '0')}`;
        const projectName = cleanName(rawProjectName) || `Project ${projectId}`;

        // Portfolio
        const portfolioId = generateId('PRF', portfolioMgrName);

        // Customer
        const customerName = rawCustomerName || "Unknown Customer";
        const customerId = generateId('CST', customerName);

        // Site
        const siteName = rawSiteName || "Unknown Site";
        const siteId = generateId('STE', siteName);

        // -------------------------------------------------------------------------
        // 3. BUILD OBJECTS
        // -------------------------------------------------------------------------

        // -- PORTFOLIO --
        // Use a simple check to see if we already added this portfolio to our results list?
        // Actually, result.portfolios is initialized with default. We should use a map for portfolios too.
        // For now, let's treat the default one as a fallback or remove it if we go full dynamic.
        // Let's use a dynamic map logic for Portfolios too.

        // -- CUSTOMER --
        if (!customerMap.has(customerId)) {
            customerMap.set(customerId, {
                customerId: customerId,
                id: customerId,
                name: customerName,
                portfolioId: portfolioId,
                isActive: true,
                createdAt: now,
                updatedAt: now,
                comments: `Imported from Workday`
            });
        }

        // -- SITE --
        if (!siteMap.has(siteId)) {
            siteMap.set(siteId, {
                siteId: siteId,
                id: siteId,
                name: siteName,
                location: entry["Location"] || "",
                customerId: customerId,
                isActive: true,
                createdAt: now,
                updatedAt: now,
                region: entry["Region"] || "",
            });
        }

        // -- PROJECT --
        // Extract extra metadata for comments
        const resourcePlan = entry["Project_Resource_Plan"] || "";
        const costCenter = entry["Cost_Center"] || "";
        const descriptionGroups = entry["Project_Groups"] ? `Groups: ${entry["Project_Groups"]}` : "";

        const comments = [
            resourcePlan ? `Resource Plan: ${resourcePlan}` : null,
            costCenter ? `Cost Center: ${costCenter}` : null,
            descriptionGroups,
            "Imported from Workday"
        ].filter(Boolean).join('\n');

        const project = {
            projectId: projectId,
            id: projectId,
            name: projectName,
            customerId: customerId,
            siteId: siteId,
            portfolioId: portfolioId, // Link project to portfolio
            employeeId: `EMP-${managerName.replace(/[^A-Z]/g, '').substring(0, 5) || 'UNKNOWN'}`, // Dummy Employee ID
            manager: managerName,
            billableType: billableType,
            methodology: entry["Project_Groups"] || "Waterfall",
            status: projectStatus,
            active: isActive,
            isActive: isActive,

            // Dates - Map to all likely fields to ensure visibility
            baselineStartDate: rawStartDate,
            baselineEndDate: rawEndDate,
            startDate: rawStartDate,
            endDate: rawEndDate,
            actualStartDate: null,
            actualEndDate: null,

            comments: comments,

            createdAt: now,
            updatedAt: now,

            // Defaults
            percentComplete: 0,
            baselineHours: 0,
            actualHours: 0,
            baselineCost: 0,
            actualCost: 0,

            predecessorId: null,
            predecessorRelationship: null
        };

        result.projects?.push(project);
    });

    // Convert maps to arrays
    result.customers = Array.from(customerMap.values());
    result.sites = Array.from(siteMap.values());

    return result;
}
