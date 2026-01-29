
import { convertProjectPlanJSON } from '../lib/data-converter';

// MOCK: Output from api-python/mpp_parser.py (V11)
const mockPythonResponse = {
    "success": true,
    "project": {
        "name": "Test Project",
        "startDate": "2024-01-01T08:00:00Z",
        "endDate": "2024-06-01T17:00:00Z",
        "percentComplete": 25.0,
        "manager": "John Doe",
        "active": true
    },
    // Phase (Level 1)
    "phases": [
        {
            "id": "1",
            "name": "Phase 1: Planning",
            "outline_level": 1,
            "is_summary": true,
            "parent_id": null,
            "startDate": "2024-01-01T08:00:00Z",
            "endDate": "2024-02-01T17:00:00Z",
            "percentComplete": 100.0,
            "phaseId": null // Logic sets this to itself or null in py, converter handles it
        }
    ],
    // Unit (Level 2 Summary)
    "units": [
        {
            "id": "2",
            "name": "Unit 1: Requirements",
            "outline_level": 2,
            "is_summary": true,
            "parent_id": "1",
            "startDate": "2024-01-01T08:00:00Z",
            "endDate": "2024-01-15T17:00:00Z",
            "phaseId": "1",
            "unitId": "2"
        }
    ],
    // Tasks (Leaf nodes)
    "tasks": [
        {
            "id": "3",
            "name": "Gather Reqs",
            "outline_level": 3,
            "is_summary": false,
            "parent_id": "2",
            "startDate": "2024-01-01T08:00:00Z",
            "endDate": "2024-01-05T17:00:00Z",
            "percentComplete": 100.0,
            "baselineHours": 40.0,
            "actualHours": 40.0,
            "assignedResource": "Alice",
            "phaseId": "1",
            "unitId": "2"
        },
        {
            "id": "4",
            "name": "Review Reqs",
            "outline_level": 3,
            "is_summary": false,
            "parent_id": "2",
            "startDate": "2024-01-08T08:00:00Z",
            "endDate": "2024-01-10T17:00:00Z",
            "percentComplete": 50.0,
            "baselineHours": 24.0,
            "actualHours": 12.0,
            "assignedResource": "Bob",
            "predecessorId": "3",
            "predecessorRelationship": "FS",
            "phaseId": "1",
            "unitId": "2"
        }
    ]
};

console.log("--- Testing MPP Contract V11 ---");
try {
    const converted = convertProjectPlanJSON(mockPythonResponse, "PRJ-TEST-001");

    console.log("Conversion Success!");
    console.log("Phases:", converted.phases?.length);
    console.log("Units:", converted.units?.length);
    console.log("Tasks:", converted.tasks?.length);

    const t1 = converted.tasks?.find(t => t.taskId === "4");
    if (t1) {
        console.log("Task check (Review Reqs):");
        console.log("  - Project ID:", t1.projectId);
        console.log("  - Phase ID:", t1.phaseId); // Should be mapped from python's phaseId "1" -> "PHS-..." or raw "1" depends on converter
        console.log("  - Unit ID:", t1.unitId);
        console.log("  - Predecessor:", t1.predecessorId);
        console.log("  - Resource:", t1.assignedResource);

        if (t1.projectId === "PRJ-TEST-001" && t1.assignedResource === "Bob") {
            console.log("PASS: Fields mapped correctly.");
        } else {
            console.log("FAIL: Field mismatch.");
            process.exit(1);
        }
    } else {
        console.log("FAIL: Task 4 not found.");
        process.exit(1);
    }

} catch (e) {
    console.error("Conversion Failed:", e);
    process.exit(1);
}
