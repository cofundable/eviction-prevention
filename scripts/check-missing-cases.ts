#!/usr/bin/env tsx

/**
 * Loads eviction warrant filings from a CSV into the database and reports
 * which case numbers are missing from the parsed case data.
 *
 * Usage:
 *   tsx scripts/check-missing-cases.ts
 */

import Database from "better-sqlite3";
import { readFileSync } from "fs";

const DB_PATH = "evictions.db";
const CSV_PATH = "data/md_eviction_case_data.csv";

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function main() {
  const db = new Database(DB_PATH);

  // Create warrant_filings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS warrant_filings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_date TEXT,
      event_type TEXT,
      event_comment TEXT,
      county TEXT,
      location TEXT,
      tenant_city TEXT,
      tenant_state TEXT,
      tenant_zip TEXT,
      case_type TEXT,
      case_number TEXT NOT NULL,
      evicted_date TEXT,
      event_year TEXT,
      eviction_year TEXT
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_warrant_filings_case_number ON warrant_filings(case_number)`
  );

  // Clear and reload
  db.exec("DELETE FROM warrant_filings");

  const lines = readFileSync(CSV_PATH, "utf-8")
    .split("\n")
    .filter((l) => l.trim());

  const insertStmt = db.prepare(`
    INSERT INTO warrant_filings (
      event_date, event_type, event_comment, county, location,
      tenant_city, tenant_state, tenant_zip, case_type, case_number,
      evicted_date, event_year, eviction_year
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const loadMany = db.transaction((rows: string[][]) => {
    for (const fields of rows) {
      insertStmt.run(
        fields[0] || null,
        fields[1] || null,
        fields[2] || null,
        fields[3] || null,
        fields[4] || null,
        fields[5] || null,
        fields[6] || null,
        fields[7] || null,
        fields[8] || null,
        fields[9] || null,
        fields[10] || null,
        fields[11] || null,
        fields[12] || null
      );
    }
  });

  const rows = lines.slice(1).map(parseCSVLine);
  loadMany(rows);
  console.log(`Loaded ${rows.length} warrant filings from CSV\n`);

  // Cases in CSV but not in parsed DB
  type MissingRow = {
    case_number: string;
    case_type: string;
    event_date: string;
  };

  const missing = db
    .prepare(
      `
    SELECT DISTINCT wf.case_number, wf.case_type, wf.event_date
    FROM warrant_filings wf
    LEFT JOIN cases c ON c.case_number = wf.case_number
    WHERE c.id IS NULL
    ORDER BY wf.case_number
  `
    )
    .all() as MissingRow[];

  const total = (
    db
      .prepare("SELECT COUNT(DISTINCT case_number) as count FROM warrant_filings")
      .get() as { count: number }
  ).count;

  console.log(
    `Missing: ${missing.length} of ${total} cases not found in parsed data\n`
  );

  if (missing.length > 0) {
    missing.forEach((row) => {
      console.log(`  ${row.case_number}  (${row.case_type}, ${row.event_date})`);
    });
  }

  db.close();
}

main();
