
import { Employee, Portfolio, PortfolioTable } from '@/types/data';

/**
 * Ensures that every Senior Manager has a corresponding Portfolio.
 * matched by employeeId.
 * 
 * @param employees List of employees
 * @param portfolios List of existing portfolios
 * @returns Updated list of portfolios including auto-generated ones
 */
export function ensurePortfoliosForSeniorManagers(
    employees: Employee[],
    portfolios: PortfolioTable[]
): PortfolioTable[] {
    const updatedPortfolios = [...portfolios];

    // Identify Senior Managers (deduplicated)
    const uniqueManagerIds = new Set();
    const seniorManagers = employees.filter(emp => {
        if (!emp.employeeId) return false;
        if (uniqueManagerIds.has(emp.employeeId)) return false;
        const isManager = (emp.jobTitle && emp.jobTitle.toLowerCase().includes('senior manager')) ||
            (emp.managementLevel && emp.managementLevel.toLowerCase().includes('senior manager'));
        if (isManager) uniqueManagerIds.add(emp.employeeId);
        return isManager;
    });

    seniorManagers.forEach(manager => {
        // Check if portfolio exists for this manager (by employeeId or strict name match)
        // Check both original portfolios AND ones we might have just added in this loop
        const exists = updatedPortfolios.some(p =>
            (p.employeeId && p.employeeId === manager.employeeId) ||
            (p.manager && p.manager.toLowerCase() === manager.name.toLowerCase())
        );

        if (!exists) {
            // Create new portfolio
            // Generate a simple ID if usually auto-generated, or use a placeholder that DB handles
            // Since this is client-side 'sync' logic for the context mostly:
            const newPortfolio: PortfolioTable = {
                id: `PRF-AUTO-${manager.employeeId}`, // Temp ID, assumes backend/db handles real IDs usually or this is sufficient for in-memory
                portfolioId: `PRF-${manager.employeeId.replace('EMP-', '')}`,
                name: `${manager.name}'s Portfolio`,
                manager: manager.name,
                employeeId: manager.employeeId,
                methodology: 'PMBOK', // Default
                isActive: true, // Default active
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                // Initialize required tracking fields
                baselineStartDate: null,
                baselineEndDate: null,
                actualStartDate: null,
                actualEndDate: null,
                baselineHours: 0,
                actualHours: 0,
                baselineCost: 0,
                actualCost: 0,
                percentComplete: 0,
                comments: 'Auto-generated for Senior Manager',
                remainingHours: 0,
                remainingCost: 0,
                predecessorId: null,
                predecessorRelationship: null
            };

            updatedPortfolios.push(newPortfolio);
        }
    });

    return updatedPortfolios;
}
