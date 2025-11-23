import Database from "better-sqlite3";
import type { CaseData } from "../parser/types.js";

/**
 * Get or create a case type ID from the lookup table.
 */
function getOrCreateCaseType(
  db: Database.Database,
  caseType: string | undefined
): number | undefined {
  if (!caseType) return undefined;

  const selectStmt = db.prepare("SELECT id FROM case_types WHERE name = ?");
  const existing = selectStmt.get(caseType) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  const insertStmt = db.prepare("INSERT INTO case_types (name) VALUES (?)");
  const result = insertStmt.run(caseType);
  return result.lastInsertRowid as number;
}

/**
 * Get or create a case status ID from the lookup table.
 */
function getOrCreateCaseStatus(
  db: Database.Database,
  caseStatus: string | undefined
): number | undefined {
  if (!caseStatus) return undefined;

  const selectStmt = db.prepare("SELECT id FROM case_statuses WHERE name = ?");
  const existing = selectStmt.get(caseStatus) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  const insertStmt = db.prepare("INSERT INTO case_statuses (name) VALUES (?)");
  const result = insertStmt.run(caseStatus);
  return result.lastInsertRowid as number;
}

/**
 * Insert or update a case in the database.
 */
function upsertCase(db: Database.Database, caseData: CaseData): number {
  const { caseDetails } = caseData;

  // Get or create lookup IDs
  const caseTypeId = getOrCreateCaseType(db, caseDetails.caseType);
  const caseStatusId = getOrCreateCaseStatus(db, caseDetails.caseStatus);

  // Check if case already exists
  const selectStmt = db.prepare("SELECT id FROM cases WHERE case_number = ?");
  const existing = selectStmt.get(caseDetails.caseNumber) as
    | { id: number }
    | undefined;

  if (existing) {
    // Update existing case
    const updateStmt = db.prepare(`
      UPDATE cases SET
        court_system = ?,
        location = ?,
        title = ?,
        case_type_id = ?,
        filing_date = ?,
        case_status_id = ?
      WHERE id = ?
    `);
    updateStmt.run(
      caseDetails.courtSystem,
      caseDetails.location,
      caseDetails.title,
      caseTypeId,
      caseDetails.filingDate,
      caseStatusId,
      existing.id
    );
    return existing.id;
  } else {
    // Insert new case
    const insertStmt = db.prepare(`
      INSERT INTO cases (
        case_number,
        court_system,
        location,
        title,
        case_type_id,
        filing_date,
        case_status_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insertStmt.run(
      caseDetails.caseNumber,
      caseDetails.courtSystem,
      caseDetails.location,
      caseDetails.title,
      caseTypeId,
      caseDetails.filingDate,
      caseStatusId
    );
    return result.lastInsertRowid as number;
  }
}

/**
 * Insert an address into the database.
 */
function insertAddress(
  db: Database.Database,
  address: {
    street?: string;
    unit?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  }
): number {
  const insertStmt = db.prepare(`
    INSERT INTO addresses (street, unit, city, state, zip_code)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = insertStmt.run(
    address.street,
    address.unit,
    address.city,
    address.state,
    address.zipCode
  );
  return result.lastInsertRowid as number;
}

/**
 * Insert parties for a case.
 */
function insertParties(
  db: Database.Database,
  caseId: number,
  caseData: CaseData
): void {
  const insertStmt = db.prepare(`
    INSERT INTO case_parties (
      case_id,
      party_type,
      name,
      address_id,
      appearance_date,
      represented_party
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const party of caseData.parties) {
    const addressId = party.address
      ? insertAddress(db, party.address)
      : undefined;

    insertStmt.run(
      caseId,
      party.partyType,
      party.name,
      addressId,
      party.appearanceDate,
      party.representedParty
    );
  }
}

/**
 * Insert events for a case.
 */
function insertEvents(
  db: Database.Database,
  caseId: number,
  caseData: CaseData
): void {
  const insertStmt = db.prepare(`
    INSERT INTO case_events (case_id, date, event_type, comment)
    VALUES (?, ?, ?, ?)
  `);

  for (const event of caseData.timeline) {
    insertStmt.run(caseId, event.date, event.eventType, event.comment);
  }
}

/**
 * Load a case and all its related data into the database.
 * Returns the case ID.
 */
export function loadCase(db: Database.Database, caseData: CaseData): number {
  // Use a transaction for atomicity
  const transaction = db.transaction(() => {
    // Insert or update the case
    const caseId = upsertCase(db, caseData);

    // Delete existing parties and events for this case (to handle updates)
    db.prepare("DELETE FROM case_parties WHERE case_id = ?").run(caseId);
    db.prepare("DELETE FROM case_events WHERE case_id = ?").run(caseId);

    // Insert parties and events
    insertParties(db, caseId, caseData);
    insertEvents(db, caseId, caseData);

    return caseId;
  });

  return transaction();
}

/**
 * Load multiple cases into the database.
 * Returns an array of case IDs.
 */
export function loadCases(db: Database.Database, cases: CaseData[]): number[] {
  return cases.map((caseData) => loadCase(db, caseData));
}
