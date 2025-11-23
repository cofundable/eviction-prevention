import Database from "better-sqlite3";

export interface DbCaseType {
  id: number;
  name: string;
}

export interface DbCaseStatus {
  id: number;
  name: string;
}

export interface DbCase {
  id: number;
  case_number: string;
  court_system?: string;
  location?: string;
  title?: string;
  case_type_id?: number;
  filing_date?: string;
  case_status_id?: number;
  created_at: string;
}

export interface DbCaseEvent {
  id: number;
  case_id: number;
  date?: string;
  event_type?: string;
  comment?: string;
  created_at: string;
}

export interface DbAddress {
  id: number;
  street?: string;
  unit?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  created_at: string;
}

export interface DbCaseParty {
  id: number;
  case_id: number;
  party_type?: string;
  name: string;
  address_id?: number;
  appearance_date?: string;
  represented_party?: string;
  created_at: string;
}

/**
 * Initialize the database schema with all required tables.
 */
export function initializeSchema(db: Database.Database): void {
  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  // Create CaseType lookup table
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  // Create CaseStatus lookup table
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  // Create Case table
  db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_number TEXT NOT NULL UNIQUE,
      court_system TEXT,
      location TEXT,
      title TEXT,
      case_type_id INTEGER,
      filing_date TEXT,
      case_status_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_type_id) REFERENCES case_types(id),
      FOREIGN KEY (case_status_id) REFERENCES case_statuses(id)
    )
  `);

  // Create Address table
  db.exec(`
    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      street TEXT,
      unit TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create CaseParty table
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_parties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL,
      party_type TEXT,
      name TEXT NOT NULL,
      address_id INTEGER,
      appearance_date TEXT,
      represented_party TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
      FOREIGN KEY (address_id) REFERENCES addresses(id)
    )
  `);

  // Create CaseEvent table
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL,
      date TEXT,
      event_type TEXT,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for better query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cases_case_number ON cases(case_number);
    CREATE INDEX IF NOT EXISTS idx_cases_case_type ON cases(case_type_id);
    CREATE INDEX IF NOT EXISTS idx_cases_case_status ON cases(case_status_id);
    CREATE INDEX IF NOT EXISTS idx_case_parties_case_id ON case_parties(case_id);
    CREATE INDEX IF NOT EXISTS idx_case_events_case_id ON case_events(case_id);
    CREATE INDEX IF NOT EXISTS idx_case_events_date ON case_events(date);
  `);
}

/**
 * Drop all tables (useful for testing).
 */
export function dropSchema(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS case_events;
    DROP TABLE IF EXISTS case_parties;
    DROP TABLE IF EXISTS addresses;
    DROP TABLE IF EXISTS cases;
    DROP TABLE IF EXISTS case_statuses;
    DROP TABLE IF EXISTS case_types;
  `);
}
