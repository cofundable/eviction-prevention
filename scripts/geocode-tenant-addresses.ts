#!/usr/bin/env tsx

/**
 * Geocodes tenant addresses using the Census Geocoder batch geographies API.
 * https://geocoding.geo.census.gov/geocoder/
 *
 * Uses the geographies endpoint (vs. locations) to also capture Census 2020
 * tract GEOIDs, enabling tabular joins with BNIA CSA data downstream in DuckDB
 * without requiring a full point-in-polygon spatial join.
 *
 * Usage:
 *   tsx scripts/geocode-tenant-addresses.ts
 */

import Database from "better-sqlite3";

const DB_PATH = "evictions.db";
const BATCH_SIZE = 1000;
const GEOCODER_URL =
  "https://geocoding.geo.census.gov/geocoder/geographies/addressbatch";

type AddressRow = {
  id: number;
  street: string;
  city: string;
  state: string | null;
  zip_code: string | null;
};

type GeocodeResult = {
  id: string;
  matchStatus: string;
  matchType: string | null;
  matchedAddress: string | null;
  longitude: number | null;
  latitude: number | null;
  // Census 2020 geography fields
  stateFips: string | null;
  countyFips: string | null;
  censusTract: string | null;
  censusBlock: string | null;
  // Full 11-digit tract GEOID (state + county + tract) — matches BNIA CSA crosswalk
  tractGeoid: string | null;
};

/**
 * Parses a single line of quoted CSV, handling commas inside quoted fields.
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parses the Census Geocoder geographies CSV response.
 * Output format:
 *   ID, InputAddress, MatchStatus, MatchType, MatchedAddress, Coordinates,
 *   TigerLineID, Side, StateFIPS, CountyFIPS, CensusTract, CensusBlock
 */
function parseGeocoderResponse(csv: string): GeocodeResult[] {
  return csv
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const f = parseCSVLine(line);
      const matchStatus = f[2] ?? "";
      const coordinates = f[5] ?? "";

      let longitude: number | null = null;
      let latitude: number | null = null;

      if (coordinates) {
        const [lon, lat] = coordinates.split(",").map(Number);
        if (!isNaN(lon) && !isNaN(lat)) {
          longitude = lon;
          latitude = lat;
        }
      }

      const stateFips = f[8] || null;
      const countyFips = f[9] || null;
      const censusTract = f[10] || null;
      const censusBlock = f[11] || null;

      const tractGeoid =
        stateFips && countyFips && censusTract
          ? `${stateFips}${countyFips}${censusTract}`
          : null;

      return {
        id: f[0],
        matchStatus,
        matchType: f[3] || null,
        matchedAddress: f[4] || null,
        longitude,
        latitude,
        stateFips,
        countyFips,
        censusTract,
        censusBlock,
        tractGeoid,
      };
    });
}

async function geocodeBatch(addresses: AddressRow[]): Promise<GeocodeResult[]> {
  const csvContent = addresses
    .map(
      (a) =>
        `${a.id},"${a.street}","${a.city}","${a.state ?? ""}","${a.zip_code ?? ""}"`
    )
    .join("\n");

  const formData = new FormData();
  formData.append(
    "addressFile",
    new Blob([csvContent], { type: "text/plain" }),
    "addresses.csv"
  );
  formData.append("benchmark", "Public_AR_Current");
  formData.append("vintage", "Census2020_Current");

  const response = await fetch(GEOCODER_URL, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      `Geocoder API error: ${response.status} ${response.statusText}`
    );
  }

  return parseGeocoderResponse(await response.text());
}

function initializeColumns(db: Database.Database): void {
  const existing = (
    db.prepare("PRAGMA table_info(addresses)").all() as Array<{ name: string }>
  ).map((c) => c.name);

  const columns: [string, string][] = [
    ["latitude", "REAL"],
    ["longitude", "REAL"],
    ["geocode_match_status", "TEXT"],
    ["geocode_match_type", "TEXT"],
    ["geocode_matched_address", "TEXT"],
    ["census_tract_geoid", "TEXT"], // 11-digit GEOID for BNIA CSA tabular joins
    ["census_tract", "TEXT"],
    ["census_block", "TEXT"],
    ["geocoded_at", "TEXT"],
  ];

  for (const [name, type] of columns) {
    if (!existing.includes(name)) {
      db.exec(`ALTER TABLE addresses ADD COLUMN ${name} ${type}`);
    }
  }
}

async function main() {
  const db = new Database(DB_PATH);

  console.log("Setting up geocoding columns...");
  initializeColumns(db);

  const addresses = db
    .prepare(
      `
    SELECT DISTINCT a.id, a.street, a.city, a.state, a.zip_code
    FROM addresses a
    JOIN case_parties cp ON cp.address_id = a.id
    WHERE cp.party_type = 'tenant'
      AND a.street IS NOT NULL
      AND a.city IS NOT NULL
      AND a.geocoded_at IS NULL
    ORDER BY a.id
  `
    )
    .all() as AddressRow[];

  console.log(`Found ${addresses.length} tenant addresses to geocode\n`);

  if (addresses.length === 0) {
    console.log("Nothing to do.");
    db.close();
    return;
  }

  const updateStmt = db.prepare(`
    UPDATE addresses SET
      geocode_match_status = ?,
      geocode_match_type = ?,
      geocode_matched_address = ?,
      longitude = ?,
      latitude = ?,
      census_tract_geoid = ?,
      census_tract = ?,
      census_block = ?,
      geocoded_at = datetime('now')
    WHERE id = ?
  `);

  const applyResults = db.transaction((results: GeocodeResult[]) => {
    for (const r of results) {
      updateStmt.run(
        r.matchStatus,
        r.matchType,
        r.matchedAddress,
        r.longitude,
        r.latitude,
        r.tractGeoid,
        r.censusTract,
        r.censusBlock,
        Number(r.id)
      );
    }
  });

  const totalBatches = Math.ceil(addresses.length / BATCH_SIZE);
  let totalMatched = 0;

  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const batch = addresses.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    process.stdout.write(
      `Batch ${batchNum}/${totalBatches} (${batch.length} addresses)... `
    );

    try {
      const results = await geocodeBatch(batch);
      applyResults(results);

      const matched = results.filter((r) => r.matchStatus === "Match").length;
      totalMatched += matched;
      console.log(`${matched}/${batch.length} matched`);
    } catch (error) {
      console.error(`failed: ${error}`);
    }
  }

  console.log(`\nDone: ${totalMatched}/${addresses.length} addresses matched.`);
  db.close();
}

main();
