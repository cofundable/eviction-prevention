import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import {
  initializeSchema,
  dropSchema,
  loadCase,
  loadCases,
  type DbCase,
  type DbCaseType,
  type DbCaseStatus,
  type DbCaseParty,
  type DbCaseEvent,
  type DbAddress,
} from "../src/lib/loader/index.js";
import type { CaseData } from "../src/lib/parser/types.js";

describe("Database Loader", () => {
  let db: Database.Database;

  beforeEach(() => {
    // Create an in-memory database for each test
    db = new Database(":memory:");
    initializeSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("Schema Initialization", () => {
    it("should create all required tables", () => {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain("case_types");
      expect(tableNames).toContain("case_statuses");
      expect(tableNames).toContain("cases");
      expect(tableNames).toContain("addresses");
      expect(tableNames).toContain("case_parties");
      expect(tableNames).toContain("case_events");
    });

    it("should create indexes for performance", () => {
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
        )
        .all() as { name: string }[];

      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain("idx_cases_case_number");
      expect(indexNames).toContain("idx_cases_case_type");
      expect(indexNames).toContain("idx_cases_case_status");
      expect(indexNames).toContain("idx_case_parties_case_id");
      expect(indexNames).toContain("idx_case_events_case_id");
      expect(indexNames).toContain("idx_case_events_date");
    });

    it("should enable foreign keys", () => {
      const result = db.pragma("foreign_keys", { simple: true });
      expect(result).toBe(1);
    });

    it("should drop all tables when requested", () => {
      dropSchema(db);

      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence'"
        )
        .all() as { name: string }[];

      // sqlite_sequence is a system table that may remain, so we exclude it
      expect(tables).toHaveLength(0);
    });
  });

  describe("Loading THO Case (Tenant Holding Over - Cancelled)", () => {
    let caseData: CaseData;

    beforeEach(() => {
      const jsonPath = join(
        process.cwd(),
        "__tests__/mocks/json/tho-batch-48291-cancelled.json"
      );
      caseData = JSON.parse(readFileSync(jsonPath, "utf-8"));
    });

    it("should load case details correctly", () => {
      const caseId = loadCase(db, caseData);

      const dbCase = db
        .prepare("SELECT * FROM cases WHERE id = ?")
        .get(caseId) as DbCase;

      expect(dbCase).toBeDefined();
      expect(dbCase.case_number).toBe("D-01-LT-24-48291-035");
      expect(dbCase.court_system).toBe("District Court For - Civil");
      expect(dbCase.location).toBe("Fayette Ave");
      expect(dbCase.title).toBe(
        "Northwood Homes LP TA NORTHWOOD HOMES vs. DOE, JANE A"
      );
      expect(dbCase.filing_date).toBe("04/12/2024");
    });

    it("should create case type lookup entry", () => {
      loadCase(db, caseData);

      const caseType = db
        .prepare("SELECT * FROM case_types WHERE name = ?")
        .get("Tenant Holding Over") as DbCaseType;

      expect(caseType).toBeDefined();
      expect(caseType.name).toBe("Tenant Holding Over");
    });

    it("should create case status lookup entry", () => {
      loadCase(db, caseData);

      const caseStatus = db
        .prepare("SELECT * FROM case_statuses WHERE name = ?")
        .get("Closed") as DbCaseStatus;

      expect(caseStatus).toBeDefined();
      expect(caseStatus.name).toBe("Closed");
    });

    it("should link case to case type via foreign key", () => {
      const caseId = loadCase(db, caseData);

      const result = db
        .prepare(
          `
        SELECT c.case_number, ct.name as case_type
        FROM cases c
        JOIN case_types ct ON c.case_type_id = ct.id
        WHERE c.id = ?
      `
        )
        .get(caseId) as { case_number: string; case_type: string };

      expect(result.case_type).toBe("Tenant Holding Over");
    });

    it("should link case to case status via foreign key", () => {
      const caseId = loadCase(db, caseData);

      const result = db
        .prepare(
          `
        SELECT c.case_number, cs.name as case_status
        FROM cases c
        JOIN case_statuses cs ON c.case_status_id = cs.id
        WHERE c.id = ?
      `
        )
        .get(caseId) as { case_number: string; case_status: string };

      expect(result.case_status).toBe("Closed");
    });

    it("should load all parties (tenant, landlord, agent)", () => {
      const caseId = loadCase(db, caseData);

      const parties = db
        .prepare("SELECT * FROM case_parties WHERE case_id = ?")
        .all(caseId) as DbCaseParty[];

      expect(parties).toHaveLength(3);

      const tenant = parties.find((p) => p.party_type === "tenant");
      const landlord = parties.find((p) => p.party_type === "landlord");
      const agent = parties.find((p) => p.party_type === "agent");

      expect(tenant).toBeDefined();
      expect(tenant?.name).toBe("Doe, Jane A.");

      expect(landlord).toBeDefined();
      expect(landlord?.name).toBe("Northwood Homes LP TA NORTHWOOD HOMES");

      expect(agent).toBeDefined();
      expect(agent?.name).toBe("RENTCOURTFILE, LLC");
    });

    it("should load tenant address with unit", () => {
      const caseId = loadCase(db, caseData);

      const tenant = db
        .prepare(
          "SELECT * FROM case_parties WHERE case_id = ? AND party_type = ?"
        )
        .get(caseId, "tenant") as DbCaseParty;

      const address = db
        .prepare("SELECT * FROM addresses WHERE id = ?")
        .get(tenant.address_id) as DbAddress;

      expect(address).toBeDefined();
      expect(address.street).toBe("456 OAK AVENUE");
      expect(address.unit).toBe("APT E");
      expect(address.city).toBe("BALTIMORE");
      expect(address.state).toBe("MD");
      expect(address.zip_code).toBe("21205");
    });

    it("should load landlord address without unit", () => {
      const caseId = loadCase(db, caseData);

      const landlord = db
        .prepare(
          "SELECT * FROM case_parties WHERE case_id = ? AND party_type = ?"
        )
        .get(caseId, "landlord") as DbCaseParty;

      const address = db
        .prepare("SELECT * FROM addresses WHERE id = ?")
        .get(landlord.address_id) as DbAddress;

      expect(address).toBeDefined();
      expect(address.street).toBe("123 MAIN STREET");
      expect(address.unit).toBeNull(); // SQLite returns null for missing values
      expect(address.city).toBe("BALTIMORE");
      expect(address.state).toBe("MD");
      expect(address.zip_code).toBe("21205");
    });

    it("should load all timeline events", () => {
      const caseId = loadCase(db, caseData);

      const events = db
        .prepare("SELECT * FROM case_events WHERE case_id = ? ORDER BY date")
        .all(caseId) as DbCaseEvent[];

      expect(events).toHaveLength(6);
    });

    it("should load first timeline event correctly", () => {
      const caseId = loadCase(db, caseData);

      const firstEvent = db
        .prepare("SELECT * FROM case_events WHERE case_id = ? ORDER BY date")
        .get(caseId) as DbCaseEvent;

      expect(firstEvent.date).toBe("04/12/2024");
      expect(firstEvent.event_type).toBe(
        "Complaint / Petition - Landlord Tenant"
      );
      expect(firstEvent.comment).toBe("RCFLLC:1153:Failure To Pay Rent");
    });

    it("should load last timeline event (cancelled warrant)", () => {
      const caseId = loadCase(db, caseData);

      const events = db
        .prepare("SELECT * FROM case_events WHERE case_id = ? ORDER BY id")
        .all(caseId) as DbCaseEvent[];

      const lastEvent = events[events.length - 1];

      // Last event is the cancelled warrant from the timeline
      expect(lastEvent.date).toBe("04/25/2025");
      expect(lastEvent.event_type).toBe(
        "Warrant of Restitution - Return of Service - Cancelled"
      );
      expect(lastEvent.comment).toBe("CANCELLED");
    });
  });

  describe("Loading BOL Case (Breach of Lease - Ordered)", () => {
    let caseData: CaseData;

    beforeEach(() => {
      const jsonPath = join(
        process.cwd(),
        "__tests__/mocks/json/bol-batch-52388-ordered.json"
      );
      caseData = JSON.parse(readFileSync(jsonPath, "utf-8"));
    });

    it("should load case with correct type", () => {
      const caseId = loadCase(db, caseData);

      const result = db
        .prepare(
          `
        SELECT c.case_number, ct.name as case_type
        FROM cases c
        JOIN case_types ct ON c.case_type_id = ct.id
        WHERE c.id = ?
      `
        )
        .get(caseId) as { case_number: string; case_type: string };

      expect(result.case_type).toBe("Breach of Lease");
    });

    it("should load parties with suite-style units", () => {
      const caseId = loadCase(db, caseData);

      const landlord = db
        .prepare(
          "SELECT * FROM case_parties WHERE case_id = ? AND party_type = ?"
        )
        .get(caseId, "landlord") as DbCaseParty;

      const address = db
        .prepare("SELECT * FROM addresses WHERE id = ?")
        .get(landlord.address_id) as DbAddress;

      expect(address.street).toBe("789 ELM STREET");
      expect(address.unit).toBe("SUITE 215");
    });

    it("should load tenant with multi-suite unit", () => {
      const caseId = loadCase(db, caseData);

      const tenant = db
        .prepare(
          "SELECT * FROM case_parties WHERE case_id = ? AND party_type = ?"
        )
        .get(caseId, "tenant") as DbCaseParty;

      const address = db
        .prepare("SELECT * FROM addresses WHERE id = ?")
        .get(tenant.address_id) as DbAddress;

      expect(address.unit).toBe("Stes 300 & 301");
    });

    it("should handle warrant denied event", () => {
      const caseId = loadCase(db, caseData);

      const deniedEvent = db
        .prepare(
          "SELECT * FROM case_events WHERE case_id = ? AND event_type LIKE ?"
        )
        .get(caseId, "%Denied%") as DbCaseEvent;

      expect(deniedEvent).toBeDefined();
      expect(deniedEvent.event_type).toBe("Warrant of Restitution Denied");
      expect(deniedEvent.comment).toContain("DENIED");
    });

    it("should handle warrant ordered event", () => {
      const caseId = loadCase(db, caseData);

      const orderedEvent = db
        .prepare(
          "SELECT * FROM case_events WHERE case_id = ? AND event_type LIKE ? ORDER BY date DESC"
        )
        .get(caseId, "%Ordered%") as DbCaseEvent;

      expect(orderedEvent).toBeDefined();
      expect(orderedEvent.date).toBe("07/22/2024");
    });
  });

  describe("Loading FTPR Case (Failure to Pay Rent - Evicted)", () => {
    let caseData: CaseData;

    beforeEach(() => {
      const jsonPath = join(
        process.cwd(),
        "__tests__/mocks/json/ftpr-no-batch-evicted.json"
      );
      caseData = JSON.parse(readFileSync(jsonPath, "utf-8"));
    });

    it("should load case with correct type", () => {
      const caseId = loadCase(db, caseData);

      const result = db
        .prepare(
          `
        SELECT c.case_number, ct.name as case_type
        FROM cases c
        JOIN case_types ct ON c.case_type_id = ct.id
        WHERE c.id = ?
      `
        )
        .get(caseId) as { case_number: string; case_type: string };

      expect(result.case_type).toBe("Failure to Pay Rent");
    });

    it("should load multiple tenants", () => {
      const caseId = loadCase(db, caseData);

      const tenants = db
        .prepare(
          "SELECT * FROM case_parties WHERE case_id = ? AND party_type = ?"
        )
        .all(caseId, "tenant") as DbCaseParty[];

      expect(tenants).toHaveLength(2);
      expect(tenants[0].name).toBe("DOE, ROBERT M");
      expect(tenants[1].name).toBe("JONES, JAMES K");
    });

    it("should load agent party type", () => {
      const caseId = loadCase(db, caseData);

      const agent = db
        .prepare(
          "SELECT * FROM case_parties WHERE case_id = ? AND party_type = ?"
        )
        .get(caseId, "agent") as DbCaseParty;

      expect(agent).toBeDefined();
      expect(agent.name).toBe("WILLIAMS, DAVID L");
    });

    it("should handle evicted event", () => {
      const caseId = loadCase(db, caseData);

      const evictedEvent = db
        .prepare(
          "SELECT * FROM case_events WHERE case_id = ? AND event_type LIKE ?"
        )
        .get(caseId, "%Evicted%") as DbCaseEvent;

      expect(evictedEvent).toBeDefined();
      expect(evictedEvent.date).toBe("09/12/2024");
      expect(evictedEvent.event_type).toBe(
        "Warrant of Restitution - Return of Service - Evicted"
      );
    });

    it("should handle undeliverable mail events", () => {
      const caseId = loadCase(db, caseData);

      const mailEvents = db
        .prepare(
          "SELECT * FROM case_events WHERE case_id = ? AND event_type LIKE ?"
        )
        .all(caseId, "%Undeliverable Mail%") as DbCaseEvent[];

      expect(mailEvents).toHaveLength(2);
      expect(mailEvents[1].comment).toBe("RETURN TO SENDER");
    });
  });

  describe("Loading Multiple Cases", () => {
    let allCases: CaseData[];

    beforeEach(() => {
      const thoPath = join(
        process.cwd(),
        "__tests__/mocks/json/tho-batch-48291-cancelled.json"
      );
      const bolPath = join(
        process.cwd(),
        "__tests__/mocks/json/bol-batch-52388-ordered.json"
      );
      const ftprPath = join(
        process.cwd(),
        "__tests__/mocks/json/ftpr-no-batch-evicted.json"
      );

      allCases = [
        JSON.parse(readFileSync(thoPath, "utf-8")),
        JSON.parse(readFileSync(bolPath, "utf-8")),
        JSON.parse(readFileSync(ftprPath, "utf-8")),
      ];
    });

    it("should load all three cases", () => {
      const caseIds = loadCases(db, allCases);

      expect(caseIds).toHaveLength(3);

      const cases = db.prepare("SELECT * FROM cases").all() as DbCase[];
      expect(cases).toHaveLength(3);
    });

    it("should create unique case type entries", () => {
      loadCases(db, allCases);

      const caseTypes = db
        .prepare("SELECT * FROM case_types")
        .all() as DbCaseType[];

      expect(caseTypes).toHaveLength(3);
      const typeNames = caseTypes.map((ct) => ct.name);
      expect(typeNames).toContain("Tenant Holding Over");
      expect(typeNames).toContain("Breach of Lease");
      expect(typeNames).toContain("Failure to Pay Rent");
    });

    it("should reuse case status entries", () => {
      loadCases(db, allCases);

      const caseStatuses = db
        .prepare("SELECT * FROM case_statuses")
        .all() as DbCaseStatus[];

      // All three cases have "Closed" status
      expect(caseStatuses).toHaveLength(1);
      expect(caseStatuses[0].name).toBe("Closed");
    });

    it("should load all parties across cases", () => {
      loadCases(db, allCases);

      const parties = db
        .prepare("SELECT * FROM case_parties")
        .all() as DbCaseParty[];

      // THO: 3 parties, BOL: 2 parties, FTPR: 4 parties
      expect(parties).toHaveLength(9);
    });

    it("should load all events across cases", () => {
      loadCases(db, allCases);

      const events = db
        .prepare("SELECT * FROM case_events")
        .all() as DbCaseEvent[];

      // THO: 6 events, BOL: 8 events, FTPR: 7 events
      expect(events).toHaveLength(21);
    });

    it("should maintain referential integrity", () => {
      loadCases(db, allCases);

      // Every party should have a valid case_id
      const orphanedParties = db
        .prepare(
          `
        SELECT cp.* FROM case_parties cp
        LEFT JOIN cases c ON cp.case_id = c.id
        WHERE c.id IS NULL
      `
        )
        .all();

      expect(orphanedParties).toHaveLength(0);

      // Every event should have a valid case_id
      const orphanedEvents = db
        .prepare(
          `
        SELECT ce.* FROM case_events ce
        LEFT JOIN cases c ON ce.case_id = c.id
        WHERE c.id IS NULL
      `
        )
        .all();

      expect(orphanedEvents).toHaveLength(0);
    });
  });

  describe("Case Updates and Idempotency", () => {
    let caseData: CaseData;

    beforeEach(() => {
      const jsonPath = join(
        process.cwd(),
        "__tests__/mocks/json/tho-batch-48291-cancelled.json"
      );
      caseData = JSON.parse(readFileSync(jsonPath, "utf-8"));
    });

    it("should update existing case when loaded again", () => {
      const caseId1 = loadCase(db, caseData);

      // Modify case data
      const updatedCase = { ...caseData };
      updatedCase.caseDetails.caseStatus = "Active";

      const caseId2 = loadCase(db, updatedCase);

      // Should have the same ID
      expect(caseId1).toBe(caseId2);

      // Should only have one case in database
      const cases = db.prepare("SELECT * FROM cases").all() as DbCase[];
      expect(cases).toHaveLength(1);

      // Status should be updated
      const result = db
        .prepare(
          `
        SELECT cs.name as case_status
        FROM cases c
        JOIN case_statuses cs ON c.case_status_id = cs.id
        WHERE c.id = ?
      `
        )
        .get(caseId1) as { case_status: string };

      expect(result.case_status).toBe("Active");
    });

    it("should replace parties when case is reloaded", () => {
      const caseId = loadCase(db, caseData);

      const partiesBefore = db
        .prepare("SELECT * FROM case_parties WHERE case_id = ?")
        .all(caseId) as DbCaseParty[];
      expect(partiesBefore).toHaveLength(3);

      // Reload with modified parties
      const updatedCase = { ...caseData };
      updatedCase.parties = [caseData.parties[0]]; // Only keep tenant

      loadCase(db, updatedCase);

      const partiesAfter = db
        .prepare("SELECT * FROM case_parties WHERE case_id = ?")
        .all(caseId) as DbCaseParty[];
      expect(partiesAfter).toHaveLength(1);
      expect(partiesAfter[0].party_type).toBe("tenant");
    });

    it("should replace events when case is reloaded", () => {
      const caseId = loadCase(db, caseData);

      const eventsBefore = db
        .prepare("SELECT * FROM case_events WHERE case_id = ?")
        .all(caseId) as DbCaseEvent[];
      expect(eventsBefore).toHaveLength(6);

      // Reload with fewer events
      const updatedCase = { ...caseData };
      updatedCase.timeline = caseData.timeline.slice(0, 3);

      loadCase(db, updatedCase);

      const eventsAfter = db
        .prepare("SELECT * FROM case_events WHERE case_id = ?")
        .all(caseId) as DbCaseEvent[];
      expect(eventsAfter).toHaveLength(3);
    });
  });

  describe("Lookup Table Management", () => {
    it("should rename case type without affecting cases", () => {
      const jsonPath = join(
        process.cwd(),
        "__tests__/mocks/json/tho-batch-48291-cancelled.json"
      );
      const caseData = JSON.parse(readFileSync(jsonPath, "utf-8"));

      const caseId = loadCase(db, caseData);

      // Rename the case type in the lookup table
      db.prepare("UPDATE case_types SET name = ? WHERE name = ?").run(
        "THO - Tenant Holding Over",
        "Tenant Holding Over"
      );

      // Verify the case still has the correct type through the foreign key
      const result = db
        .prepare(
          `
        SELECT c.case_number, ct.name as case_type
        FROM cases c
        JOIN case_types ct ON c.case_type_id = ct.id
        WHERE c.id = ?
      `
        )
        .get(caseId) as { case_number: string; case_type: string };

      expect(result.case_type).toBe("THO - Tenant Holding Over");
    });

    it("should rename case status without affecting cases", () => {
      const jsonPath = join(
        process.cwd(),
        "__tests__/mocks/json/tho-batch-48291-cancelled.json"
      );
      const caseData = JSON.parse(readFileSync(jsonPath, "utf-8"));

      const caseId = loadCase(db, caseData);

      // Rename the case status in the lookup table
      db.prepare("UPDATE case_statuses SET name = ? WHERE name = ?").run(
        "Completed",
        "Closed"
      );

      // Verify the case still has the correct status through the foreign key
      const result = db
        .prepare(
          `
        SELECT c.case_number, cs.name as case_status
        FROM cases c
        JOIN case_statuses cs ON c.case_status_id = cs.id
        WHERE c.id = ?
      `
        )
        .get(caseId) as { case_number: string; case_status: string };

      expect(result.case_status).toBe("Completed");
    });

    it("should get all unique case types", () => {
      const thoPath = join(
        process.cwd(),
        "__tests__/mocks/json/tho-batch-48291-cancelled.json"
      );
      const bolPath = join(
        process.cwd(),
        "__tests__/mocks/json/bol-batch-52388-ordered.json"
      );
      const ftprPath = join(
        process.cwd(),
        "__tests__/mocks/json/ftpr-no-batch-evicted.json"
      );

      const allCases = [
        JSON.parse(readFileSync(thoPath, "utf-8")),
        JSON.parse(readFileSync(bolPath, "utf-8")),
        JSON.parse(readFileSync(ftprPath, "utf-8")),
      ];

      loadCases(db, allCases);

      const caseTypes = db
        .prepare("SELECT name FROM case_types ORDER BY name")
        .all() as { name: string }[];

      expect(caseTypes.map((ct) => ct.name)).toEqual([
        "Breach of Lease",
        "Failure to Pay Rent",
        "Tenant Holding Over",
      ]);
    });
  });

  describe("Edge Cases", () => {
    it("should handle case with missing optional fields", () => {
      const minimalCase: CaseData = {
        caseDetails: {
          caseNumber: "TEST-001",
        },
        parties: [],
        timeline: [],
      };

      const caseId = loadCase(db, minimalCase);

      const dbCase = db
        .prepare("SELECT * FROM cases WHERE id = ?")
        .get(caseId) as DbCase;

      expect(dbCase).toBeDefined();
      expect(dbCase.case_number).toBe("TEST-001");
      expect(dbCase.court_system).toBeNull();
      expect(dbCase.location).toBeNull();
      expect(dbCase.title).toBeNull();
      expect(dbCase.case_type_id).toBeNull();
      expect(dbCase.filing_date).toBeNull();
      expect(dbCase.case_status_id).toBeNull();
    });

    it("should handle party without address", () => {
      const caseWithNoAddress: CaseData = {
        caseDetails: {
          caseNumber: "TEST-002",
        },
        parties: [
          {
            name: "John Doe",
            address: {},
          },
        ],
        timeline: [],
      };

      const caseId = loadCase(db, caseWithNoAddress);

      const party = db
        .prepare("SELECT * FROM case_parties WHERE case_id = ?")
        .get(caseId) as DbCaseParty;

      expect(party).toBeDefined();
      expect(party.name).toBe("John Doe");
      expect(party.address_id).toBeDefined();

      const address = db
        .prepare("SELECT * FROM addresses WHERE id = ?")
        .get(party.address_id) as DbAddress;

      expect(address.street).toBeNull();
      expect(address.city).toBeNull();
      expect(address.state).toBeNull();
      expect(address.zip_code).toBeNull();
    });

    it("should handle event with empty comment", () => {
      const caseData: CaseData = {
        caseDetails: {
          caseNumber: "TEST-003",
        },
        parties: [],
        timeline: [
          {
            date: "01/01/2024",
            eventType: "Test Event",
            comment: "",
          },
        ],
      };

      const caseId = loadCase(db, caseData);

      const event = db
        .prepare("SELECT * FROM case_events WHERE case_id = ?")
        .get(caseId) as DbCaseEvent;

      expect(event).toBeDefined();
      expect(event.event_type).toBe("Test Event");
      expect(event.comment).toBe("");
    });
  });

  describe("Query Performance", () => {
    beforeEach(() => {
      const thoPath = join(
        process.cwd(),
        "__tests__/mocks/json/tho-batch-48291-cancelled.json"
      );
      const bolPath = join(
        process.cwd(),
        "__tests__/mocks/json/bol-batch-52388-ordered.json"
      );
      const ftprPath = join(
        process.cwd(),
        "__tests__/mocks/json/ftpr-no-batch-evicted.json"
      );

      const allCases = [
        JSON.parse(readFileSync(thoPath, "utf-8")),
        JSON.parse(readFileSync(bolPath, "utf-8")),
        JSON.parse(readFileSync(ftprPath, "utf-8")),
      ];

      loadCases(db, allCases);
    });

    it("should efficiently query cases by case number", () => {
      const result = db
        .prepare("SELECT * FROM cases WHERE case_number = ?")
        .get("D-01-LT-24-48291-035") as DbCase;

      expect(result).toBeDefined();
      expect(result.title).toContain("NORTHWOOD HOMES");
    });

    it("should efficiently query cases by type", () => {
      const results = db
        .prepare(
          `
        SELECT c.* FROM cases c
        JOIN case_types ct ON c.case_type_id = ct.id
        WHERE ct.name = ?
      `
        )
        .all("Breach of Lease") as DbCase[];

      expect(results).toHaveLength(1);
    });

    it("should efficiently query events by date range", () => {
      const events = db
        .prepare(
          "SELECT * FROM case_events WHERE date >= ? AND date <= ? ORDER BY date"
        )
        .all("05/01/2024", "06/30/2024") as DbCaseEvent[];

      expect(events.length).toBeGreaterThan(0);
    });

    it("should support complex joined queries", () => {
      const results = db
        .prepare(
          `
        SELECT 
          c.case_number,
          ct.name as case_type,
          cs.name as case_status,
          COUNT(DISTINCT cp.id) as party_count,
          COUNT(DISTINCT ce.id) as event_count
        FROM cases c
        LEFT JOIN case_types ct ON c.case_type_id = ct.id
        LEFT JOIN case_statuses cs ON c.case_status_id = cs.id
        LEFT JOIN case_parties cp ON c.id = cp.case_id
        LEFT JOIN case_events ce ON c.id = ce.case_id
        GROUP BY c.id
        ORDER BY c.case_number
      `
        )
        .all() as Array<{
        case_number: string;
        case_type: string;
        case_status: string;
        party_count: number;
        event_count: number;
      }>;

      expect(results).toHaveLength(3);

      // Verify the counts match our test data
      const thoCase = results.find((r) => r.case_number.includes("48291"));
      expect(thoCase?.party_count).toBe(3);
      expect(thoCase?.event_count).toBe(6);
    });
  });
});
