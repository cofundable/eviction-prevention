# Database Loader

This module provides functionality for loading eviction case data into a SQLite database with a normalized schema.

## Database Schema

The database uses the following structure:

### Lookup Tables

- **`case_types`**: Unique case types (e.g., "Tenant Holding Over", "Breach of Lease", "Failure to Pay Rent")
- **`case_statuses`**: Unique case statuses (e.g., "Closed", "Active", "Pending")

### Main Tables

- **`cases`**: Main case information with foreign keys to lookup tables
- **`addresses`**: Address information for parties
- **`case_parties`**: Parties involved in cases (tenants, landlords, agents, attorneys)
- **`case_events`**: Timeline events for each case

## Benefits of Lookup Tables

By separating `case_types` and `case_statuses` into their own tables:

- **Easy Renaming**: Update case type/status names in one place without modifying every case record
- **Consistency**: Ensures consistent naming across all cases
- **Referential Integrity**: Prevents orphaned or misspelled type/status values
- **Query Performance**: Indexed foreign keys provide faster lookups
- **Data Analysis**: Easier to aggregate statistics by type or status

## Usage

### Initialize Database

```typescript
import Database from "better-sqlite3";
import { initializeSchema } from "./src/lib/loader/index.js";

const db = new Database("evictions.db");
initializeSchema(db);
```

### Load a Single Case

```typescript
import { loadCase } from "./src/lib/loader/index.js";
import type { CaseData } from "./src/lib/parser/types.js";

const caseData: CaseData = {
  caseDetails: {
    caseNumber: "D-01-LT-24-12345",
    caseType: "Failure to Pay Rent",
    caseStatus: "Active",
    // ... other fields
  },
  parties: [
    /* ... */
  ],
  timeline: [
    /* ... */
  ],
};

const caseId = loadCase(db, caseData);
console.log(`Loaded case with ID: ${caseId}`);
```

### Load Multiple Cases

```typescript
import { loadCases } from "./src/lib/loader/index.js";

const cases: CaseData[] = [case1, case2, case3];
const caseIds = loadCases(db, cases);
console.log(`Loaded ${caseIds.length} cases`);
```

### Query the Database

```typescript
// Get all cases of a specific type
const ftprCases = db
  .prepare(
    `
  SELECT c.* 
  FROM cases c
  JOIN case_types ct ON c.case_type_id = ct.id
  WHERE ct.name = ?
`
  )
  .all("Failure to Pay Rent");

// Get all parties for a case
const parties = db
  .prepare(
    `
  SELECT cp.*, a.street, a.city, a.state, a.zip_code
  FROM case_parties cp
  LEFT JOIN addresses a ON cp.address_id = a.id
  WHERE cp.case_id = ?
`
  )
  .all(caseId);

// Get case events in chronological order
const events = db
  .prepare(
    `
  SELECT * FROM case_events 
  WHERE case_id = ? 
  ORDER BY date
`
  )
  .all(caseId);
```

### Rename a Case Type

One of the main benefits of lookup tables is the ability to rename types without updating every case:

```typescript
// Rename "Tenant Holding Over" to "THO - Tenant Holding Over"
db.prepare(
  `
  UPDATE case_types 
  SET name = ? 
  WHERE name = ?
`
).run("THO - Tenant Holding Over", "Tenant Holding Over");

// All cases with this type now automatically show the new name
```

### Update an Existing Case

The loader is idempotent - loading the same case twice (by case number) will update it:

```typescript
// Load initial case
const caseId1 = loadCase(db, caseData);

// Modify case data
caseData.caseDetails.caseStatus = "Closed";
caseData.timeline.push(newEvent);

// Load again - updates existing case
const caseId2 = loadCase(db, caseData);

// caseId1 === caseId2
```

## Database Indexes

The schema automatically creates indexes for optimal query performance:

- `idx_cases_case_number`: Fast case number lookups
- `idx_cases_case_type`: Fast filtering by case type
- `idx_cases_case_status`: Fast filtering by case status
- `idx_case_parties_case_id`: Fast party lookups for a case
- `idx_case_events_case_id`: Fast event lookups for a case
- `idx_case_events_date`: Fast date-range queries on events

## Foreign Key Constraints

The database enforces referential integrity:

- Cases reference `case_types` and `case_statuses`
- Case parties reference `cases` and `addresses`
- Case events reference `cases`
- Deleting a case cascades to delete its parties and events

## Testing

Comprehensive tests are available in `__tests__/loader.test.ts`:

```bash
npm test -- __tests__/loader.test.ts
```

The test suite includes:

- ✅ Schema initialization and validation
- ✅ Loading all three test cases (THO, BOL, FTPR)
- ✅ Verifying case types and statuses
- ✅ Validating parties and addresses (including optional unit fields)
- ✅ Checking timeline events
- ✅ Testing case updates and idempotency
- ✅ Verifying lookup table functionality
- ✅ Testing referential integrity
- ✅ Query performance validation
- ✅ Edge case handling

All 44 tests pass successfully! ✨
