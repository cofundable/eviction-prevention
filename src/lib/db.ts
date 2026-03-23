import type {
  CsaFeature,
  CsaDetail,
  CaseSummary,
  CaseDetail,
  PaginatedCases,
  LandlordRow,
} from "./types";

/* ─── CSA queries ────────────────────────────────────────────────────────── */

export async function getCsaFeatures(db: D1Database): Promise<CsaFeature[]> {
  const result = await db
    .prepare(
      `SELECT csa, eviction_count, total_pop, total_hh, renter_hh,
              total_rental_units, eviction_rate_per_1k_residents,
              eviction_rate_per_1k_renter_hh, ownership_concentration_pct,
              unique_owners, pct_black_non_hisp, pct_white_non_hisp,
              median_hh_income, pct_hh_income_under_25k, unemployment_rate
       FROM csa_features
       ORDER BY eviction_rate_per_1k_residents DESC`
    )
    .all<CsaFeature>();
  return result.results;
}

export async function getCsaDetail(
  db: D1Database,
  csa: string
): Promise<CsaDetail | null> {
  const feature = await db
    .prepare(
      `SELECT csa, eviction_count, total_pop, total_hh, renter_hh,
              total_rental_units, eviction_rate_per_1k_residents,
              eviction_rate_per_1k_renter_hh, ownership_concentration_pct,
              unique_owners, pct_black_non_hisp, pct_white_non_hisp,
              median_hh_income, pct_hh_income_under_25k, unemployment_rate
       FROM csa_features
       WHERE LOWER(csa) = LOWER(?)`
    )
    .bind(csa)
    .first<CsaFeature>();

  if (!feature) return null;

  const landlords = await db
    .prepare(
      `SELECT plaintiff, warrant_count, eviction_count
       FROM landlord_csa
       WHERE LOWER(csa) = LOWER(?)
       ORDER BY warrant_count DESC
       LIMIT 10`
    )
    .bind(csa)
    .all<LandlordRow>();

  return { ...feature, top_landlords: landlords.results };
}

/* ─── Case queries ───────────────────────────────────────────────────────── */

export async function getCases(
  db: D1Database,
  opts: { csa?: string; page: number; limit: number }
): Promise<PaginatedCases> {
  const { csa, page, limit } = opts;
  const offset = (page - 1) * limit;

  const where = csa ? "WHERE LOWER(csa) = LOWER(?)" : "";
  const binds = csa ? [csa, limit, offset] : [limit, offset];

  const [rows, countRow] = await Promise.all([
    db
      .prepare(
        `SELECT case_id, case_type, filing_date, plaintiff, address_public AS address,
                csa, judgment, eviction_executed, defendant_hash
         FROM cases_public
         ${where}
         ORDER BY filing_date DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...binds)
      .all<Omit<CaseSummary, "eviction_executed"> & { eviction_executed: number }>(),
    db
      .prepare(`SELECT COUNT(*) as total FROM cases_public ${where}`)
      .bind(...(csa ? [csa] : []))
      .first<{ total: number }>(),
  ]);

  const data: CaseSummary[] = rows.results.map((r) => ({
    ...r,
    eviction_executed: r.eviction_executed === 1,
  }));

  return {
    data,
    pagination: { page, limit, total: countRow?.total ?? 0 },
  };
}

export async function getCaseById(
  db: D1Database,
  caseId: string
): Promise<CaseDetail | null> {
  const row = await db
    .prepare(
      `SELECT case_id, case_type, filing_date, plaintiff, address_public AS address,
              csa, judgment, eviction_executed, defendant_hash, details_json
       FROM cases_public
       WHERE case_id = ?`
    )
    .bind(caseId)
    .first<
      Omit<CaseSummary, "eviction_executed"> & {
        eviction_executed: number;
        details_json: string | null;
      }
    >();

  if (!row) return null;

  const { details_json, ...rest } = row;
  return {
    ...rest,
    eviction_executed: row.eviction_executed === 1,
    details: details_json ? JSON.parse(details_json) : null,
  };
}
