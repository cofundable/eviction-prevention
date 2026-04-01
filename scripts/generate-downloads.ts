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
const d1Dir = path.resolve(
  process.cwd(),
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject"
);
const sqliteFiles = fs
  .readdirSync(d1Dir)
  .filter((f) => f.endsWith(".sqlite"))
  .map((f) => path.join(d1Dir, f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
let dbPath: string | null = null;
for (const f of sqliteFiles) {
  const db = new Database(f, { readonly: true });
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='cases_public'"
    )
    .all();
  db.close();
  if (tables.length > 0) {
    dbPath = f;
    break;
  }
}
if (!dbPath)
  throw new Error(
    "Could not find seeded D1 sqlite file. Run seed-d1.ts first."
  );
console.log(`Using DB: ${dbPath}`);
const db = new Database(dbPath, { readonly: true });

// 1. csa_features.csv — all columns from analysis/outputs, plus bnia_eviction_rate
const analysisPath = path.resolve(process.cwd(), "analysis/outputs/csa_features.csv");
const bniaPath = path.resolve(process.cwd(), "data/bnia_evictions.csv");

const analysisLines = fs.readFileSync(analysisPath, "utf-8").trim().split("\n");
const analysisHeaders = analysisLines[0].split(",");

const bniaRateMap = new Map<string, string>();
if (fs.existsSync(bniaPath)) {
  const bniaLines = fs.readFileSync(bniaPath, "utf-8").trim().split("\n");
  const bniaHeaders = bniaLines[0].split(",");
  const csaIdx = bniaHeaders.indexOf("CSA2010");
  const rateIdx = bniaHeaders.indexOf("evict23");
  for (const line of bniaLines.slice(1)) {
    const cols = line.split(",");
    if (cols[csaIdx] && cols[rateIdx]) bniaRateMap.set(cols[csaIdx].trim(), cols[rateIdx].trim());
  }
}

const csaFeatureLines = [
  [...analysisHeaders, "bnia_eviction_rate"].join(","),
  ...analysisLines.slice(1).map((line) => {
    const cols = line.split(",");
    const csaName = (cols[0] ?? "").trim();
    return line + "," + (bniaRateMap.get(csaName) ?? "");
  }),
];
fs.writeFileSync(
  path.join(OUT_DIR, "csa_features.csv"),
  csaFeatureLines.join("\n") + "\n"
);
console.log(`csa_features.csv: ${analysisLines.length - 1} rows`);

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
fs.writeFileSync(
  path.join(OUT_DIR, "cases_sanitized.csv"),
  casesLines.join("\n") + "\n"
);
console.log(`cases_sanitized.csv: ${cases.length} rows`);

// 3. landlord_master.csv — plaintiff names + matched SDAT owner + warrant/eviction counts
//
// Warrant/eviction counts come directly from evictions.db (same source as the analysis)
// so numbers match the slide deck exactly. SDAT owner is resolved via the spatial join
// in analysis/outputs/owner_eviction_matches.csv.

const evictionsDbPath = path.resolve(process.cwd(), "evictions.db");
const evictionsDb = new Database(evictionsDbPath, { readonly: true });

// Warrant counts per plaintiff (Dec 2024) — mirrors landlord_overlap_charts.py
const warrantRows = evictionsDb
  .prepare(
    `
  SELECT
    UPPER(TRIM(cp.name)) AS plaintiff,
    COUNT(DISTINCT w.case_number) AS total_warrants
  FROM warrant_filings w
  JOIN cases c ON w.case_number = c.case_number
  JOIN case_parties cp ON cp.case_id = c.id AND cp.party_type = 'landlord'
  WHERE strftime('%Y-%m', w.event_date) = '2024-12'
  GROUP BY 1
  ORDER BY 2 DESC
`
  )
  .all() as { plaintiff: string; total_warrants: number }[];

// Eviction counts per plaintiff (Dec 2024 warrants that resulted in execution)
const evictionRows = evictionsDb
  .prepare(
    `
  SELECT
    UPPER(TRIM(cp.name)) AS plaintiff,
    COUNT(DISTINCT ce.case_id) AS total_evictions
  FROM case_events ce
  JOIN cases c ON ce.case_id = c.id
  JOIN case_parties cp ON cp.case_id = c.id AND cp.party_type = 'landlord'
  JOIN warrant_filings w ON w.case_number = c.case_number
  WHERE ce.event_type = 'Warrant of Restitution - Return of Service - Evicted'
    AND strftime('%Y-%m', w.event_date) = '2024-12'
  GROUP BY 1
`
  )
  .all() as { plaintiff: string; total_evictions: number }[];

evictionsDb.close();

const evictionMap = new Map(
  evictionRows.map((r) => [r.plaintiff, r.total_evictions])
);

// Load per-warrant spatial match data: plaintiff → owner
const matchesPath = path.resolve(
  process.cwd(),
  "analysis/outputs/owner_eviction_matches.csv"
);
const matchLines = fs
  .readFileSync(matchesPath, "utf-8")
  .trim()
  .split("\n")
  .slice(1);

// Build map: plaintiff → { owner → count }
const plaintiffOwnerCounts = new Map<string, Map<string, number>>();
for (const line of matchLines) {
  const parts =
    line.match(/("(?:[^"]|"")*"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ??
    line.split(",");
  const clean = (s: string) =>
    s.replace(/^"|"$/g, "").replace(/""/g, '"').trim();
  const plaintiff = clean(parts[1] ?? "");
  const owner = clean(parts[4] ?? "");
  if (!plaintiff || !owner) continue;
  if (!plaintiffOwnerCounts.has(plaintiff))
    plaintiffOwnerCounts.set(plaintiff, new Map());
  const ownerMap = plaintiffOwnerCounts.get(plaintiff)!;
  ownerMap.set(owner, (ownerMap.get(owner) ?? 0) + 1);
}

// For each plaintiff, pick the dominant owner and sum matched warrants
const dominantOwner = new Map<
  string,
  { sdat_owner: string; warrants_matched: number }
>();
for (const [plaintiff, ownerMap] of plaintiffOwnerCounts) {
  let topOwner = "";
  let topCount = 0;
  let totalMatched = 0;
  for (const [owner, count] of ownerMap) {
    totalMatched += count;
    if (count > topCount) {
      topOwner = owner;
      topCount = count;
    }
  }
  dominantOwner.set(plaintiff, {
    sdat_owner: topOwner,
    warrants_matched: totalMatched,
  });
}

const csaCountRows = db
  .prepare(
    `SELECT plaintiff, COUNT(DISTINCT csa) AS csa_count,
            GROUP_CONCAT(csa, ' | ') AS csas_active
     FROM landlord_csa GROUP BY plaintiff`
  )
  .all() as { plaintiff: string; csa_count: number; csas_active: string }[];
const csaCountMap = new Map(csaCountRows.map((r) => [r.plaintiff, r]));

const landlords = warrantRows.map((r) => ({
  plaintiff: r.plaintiff,
  total_warrants: r.total_warrants,
  total_evictions: evictionMap.get(r.plaintiff) ?? 0,
  csa_count: csaCountMap.get(r.plaintiff)?.csa_count ?? 0,
  csas_active: csaCountMap.get(r.plaintiff)?.csas_active ?? "",
}));

const masterCols = [
  "plaintiff",
  "sdat_owner",
  "total_warrants",
  "total_evictions",
  "warrants_matched_to_sdat",
  "csa_count",
  "csas_active",
];
const masterRows = landlords.map((r) => {
  const match = dominantOwner.get(r.plaintiff as string);
  return {
    plaintiff: r.plaintiff,
    sdat_owner: match?.sdat_owner ?? "",
    total_warrants: r.total_warrants,
    total_evictions: r.total_evictions,
    warrants_matched_to_sdat: match?.warrants_matched ?? 0,
    csa_count: r.csa_count,
    csas_active: r.csas_active,
  };
});
const masterLines = [
  masterCols.join(","),
  ...masterRows.map((r) =>
    toCsvRow(masterCols.map((c) => r[c as keyof typeof r]))
  ),
];
fs.writeFileSync(
  path.join(OUT_DIR, "landlord_master.csv"),
  masterLines.join("\n") + "\n"
);
console.log(`landlord_master.csv: ${masterRows.length} rows`);

db.close();
console.log(`\nWrote CSVs to ${OUT_DIR}`);
