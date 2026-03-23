/**
 * Generates the three download CSVs from the seeded D1 sqlite file.
 * Run: pnpm dlx tsx scripts/generate-downloads.ts
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
const OUT_DIR = path.resolve(process.cwd(), "public/downloads");
fs.mkdirSync(OUT_DIR, { recursive: true });

// Find the seeded local D1 sqlite file (the one with tables)
const d1Dir = path.resolve(process.cwd(), ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const sqliteFiles = fs.readdirSync(d1Dir).filter(f => f.endsWith(".sqlite")).map(f => path.join(d1Dir, f));
let dbPath: string | null = null;
for (const f of sqliteFiles) {
  const db = new Database(f, { readonly: true });
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cases_public'")
    .all();
  db.close();
  if (tables.length > 0) {
    dbPath = f;
    break;
  }
}
if (!dbPath) throw new Error("Could not find seeded D1 sqlite file. Run seed-d1.ts first.");
console.log(`Using DB: ${dbPath}`);
const db = new Database(dbPath, { readonly: true });

// 1. csa_features.csv — copy from analysis/outputs, renaming csa2010 → csa
const src = path.resolve(process.cwd(), "analysis/outputs/csa_features.csv");
const csaLines = fs.readFileSync(src, "utf-8").trim().split("\n");
const csaHeader = csaLines[0].replace(/^csa2010/, "csa");
const csaOut = [csaHeader, ...csaLines.slice(1)].join("\n") + "\n";
fs.writeFileSync(path.join(OUT_DIR, "csa_features.csv"), csaOut);
console.log(`csa_features.csv: ${csaLines.length - 1} rows`);

// 2. cases_sanitized.csv — from cases_public, no defendant names
function toCsvRow(vals: unknown[]): string {
  return vals
    .map((v) => {
      const s = v == null ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    })
    .join(",");
}

const casesCols = [
  "case_id",
  "case_type",
  "filing_date",
  "plaintiff",
  "address_public",
  "csa",
  "judgment",
  "eviction_executed",
  "defendant_hash",
];
const cases = db
  .prepare(
    `SELECT ${casesCols.join(", ")} FROM cases_public ORDER BY filing_date DESC, case_id`
  )
  .all() as Record<string, unknown>[];
const casesLines = [
  casesCols.join(","),
  ...cases.map((r) => toCsvRow(casesCols.map((c) => r[c]))),
];
fs.writeFileSync(path.join(OUT_DIR, "cases_sanitized.csv"), casesLines.join("\n") + "\n");
console.log(`cases_sanitized.csv: ${cases.length} rows`);

// 3. landlord_summary.csv — aggregate across CSAs
const landlords = db
  .prepare(
    `SELECT
      plaintiff,
      SUM(warrant_count) AS total_warrants,
      SUM(eviction_count) AS total_evictions,
      COUNT(DISTINCT csa) AS csa_count,
      GROUP_CONCAT(csa, '; ') AS csas_active
    FROM landlord_csa
    GROUP BY plaintiff
    ORDER BY total_warrants DESC`
  )
  .all() as Record<string, unknown>[];
const landlordCols = ["plaintiff", "total_warrants", "total_evictions", "csa_count", "csas_active"];
const landlordLines = [
  landlordCols.join(","),
  ...landlords.map((r) => toCsvRow(landlordCols.map((c) => r[c]))),
];
fs.writeFileSync(path.join(OUT_DIR, "landlord_summary.csv"), landlordLines.join("\n") + "\n");
console.log(`landlord_summary.csv: ${landlords.length} rows`);

db.close();
console.log(`\nWrote CSVs to ${OUT_DIR}`);
