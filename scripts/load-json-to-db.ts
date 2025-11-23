#!/usr/bin/env tsx

/**
 * Example script to load JSON case files into a SQLite database.
 *
 * Usage:
 *   tsx scripts/load-json-to-db.ts
 *
 * This script:
 * 1. Creates a new SQLite database (or uses existing)
 * 2. Initializes the schema
 * 3. Loads all JSON files from the data/json directory
 * 4. Displays statistics about loaded data
 */

import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { initializeSchema, loadCases } from "../src/lib/loader/index.js";
import type { CaseData } from "../src/lib/parser/types.js";

// Configuration
const DB_PATH = "evictions.db";
const JSON_DIR = "data/json";

function main() {
  console.log("🗄️  Eviction Case Database Loader\n");

  // Create/open database
  console.log(`📂 Opening database: ${DB_PATH}`);
  const db = new Database(DB_PATH);

  // Initialize schema
  console.log("🔧 Initializing database schema...");
  initializeSchema(db);
  console.log("✅ Schema initialized\n");

  // Read all JSON files
  console.log(`📁 Reading JSON files from: ${JSON_DIR}`);
  const files = readdirSync(JSON_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.log("⚠️  No JSON files found in", JSON_DIR);
    db.close();
    return;
  }

  console.log(`📄 Found ${files.length} JSON files:\n`);

  // Load all cases
  const cases: CaseData[] = [];
  for (const file of files) {
    const filePath = join(JSON_DIR, file);
    try {
      const caseData = JSON.parse(readFileSync(filePath, "utf-8"));
      cases.push(caseData);
      console.log(`   ✓ ${file}`);
    } catch (error) {
      console.error(`   ✗ ${file}: ${error}`);
    }
  }

  console.log(`\n💾 Loading ${cases.length} cases into database...`);
  const caseIds = loadCases(db, cases);
  console.log(`✅ Successfully loaded ${caseIds.length} cases\n`);

  // Display statistics
  console.log("📊 Database Statistics:\n");

  const caseCount = db.prepare("SELECT COUNT(*) as count FROM cases").get() as {
    count: number;
  };
  console.log(`   Cases: ${caseCount.count}`);

  const typeCount = db
    .prepare("SELECT COUNT(*) as count FROM case_types")
    .get() as { count: number };
  console.log(`   Case Types: ${typeCount.count}`);

  const statusCount = db
    .prepare("SELECT COUNT(*) as count FROM case_statuses")
    .get() as { count: number };
  console.log(`   Case Statuses: ${statusCount.count}`);

  const partyCount = db
    .prepare("SELECT COUNT(*) as count FROM case_parties")
    .get() as { count: number };
  console.log(`   Parties: ${partyCount.count}`);

  const eventCount = db
    .prepare("SELECT COUNT(*) as count FROM case_events")
    .get() as { count: number };
  console.log(`   Events: ${eventCount.count}`);

  const addressCount = db
    .prepare("SELECT COUNT(*) as count FROM addresses")
    .get() as { count: number };
  console.log(`   Addresses: ${addressCount.count}\n`);

  // Show case types
  const caseTypes = db
    .prepare("SELECT name FROM case_types ORDER BY name")
    .all() as Array<{ name: string }>;
  console.log("📋 Case Types:");
  caseTypes.forEach((ct) => {
    const count = db
      .prepare(
        "SELECT COUNT(*) as count FROM cases WHERE case_type_id = (SELECT id FROM case_types WHERE name = ?)"
      )
      .get(ct.name) as { count: number };
    console.log(`   - ${ct.name} (${count.count} cases)`);
  });

  console.log();

  // Show case statuses
  const caseStatuses = db
    .prepare("SELECT name FROM case_statuses ORDER BY name")
    .all() as Array<{ name: string }>;
  console.log("📋 Case Statuses:");
  caseStatuses.forEach((cs) => {
    const count = db
      .prepare(
        "SELECT COUNT(*) as count FROM cases WHERE case_status_id = (SELECT id FROM case_statuses WHERE name = ?)"
      )
      .get(cs.name) as { count: number };
    console.log(`   - ${cs.name} (${count.count} cases)`);
  });

  console.log();

  // Show sample queries
  console.log("🔍 Example Queries:\n");

  console.log("   Active evictions with warrant ordered:");
  const activeEvictions = db
    .prepare(
      `
    SELECT c.case_number, c.title
    FROM cases c
    JOIN case_events ce ON c.id = ce.case_id
    WHERE ce.event_type LIKE '%Warrant of Restitution Ordered%'
    LIMIT 5
  `
    )
    .all() as Array<{ case_number: string; title: string }>;

  if (activeEvictions.length === 0) {
    console.log("      (none found)");
  } else {
    activeEvictions.forEach((c) => {
      console.log(`      ${c.case_number}: ${c.title}`);
    });
  }

  console.log("\n   Tenants by city:");
  const tenantsByCity = db
    .prepare(
      `
    SELECT a.city, COUNT(DISTINCT cp.id) as tenant_count
    FROM case_parties cp
    JOIN addresses a ON cp.address_id = a.id
    WHERE cp.party_type = 'tenant' AND a.city IS NOT NULL
    GROUP BY a.city
    ORDER BY tenant_count DESC
  `
    )
    .all() as Array<{ city: string; tenant_count: number }>;

  if (tenantsByCity.length === 0) {
    console.log("      (none found)");
  } else {
    tenantsByCity.forEach((row) => {
      console.log(`      ${row.city}: ${row.tenant_count} tenants`);
    });
  }

  console.log("\n✨ Done! Database saved to:", DB_PATH);

  db.close();
}

main();
