/* Shared TypeScript types for API response shapes */

export interface CsaFeature {
  csa: string;
  eviction_count: number;
  total_pop: number;
  total_hh: number;
  renter_hh: number;
  total_rental_units: number;
  eviction_rate_per_1k_residents: number;
  eviction_rate_per_1k_renter_hh: number;
  ownership_concentration_pct: number;
  unique_owners: number;
  pct_black_non_hisp: number;
  pct_white_non_hisp: number;
  median_hh_income: number;
  pct_hh_income_under_25k: number;
  unemployment_rate: number;
  bnia_eviction_rate: number | null;
}

export interface LandlordRow {
  plaintiff: string;
  warrant_count: number;
  eviction_count: number;
}

export interface CsaDetail extends CsaFeature {
  top_landlords: LandlordRow[];
}

export interface CaseSummary {
  case_id: string;
  case_type: string | null;
  filing_date: string | null;
  plaintiff: string | null;
  address: string | null;
  csa: string | null;
  judgment: string | null;
  eviction_executed: boolean;
  defendant_hash: string | null;
}

export interface DocketEntry {
  date: string;
  description: string;
}

export interface CaseDetail extends CaseSummary {
  details: {
    parties: Array<{ role: string; name: string }>;
    docket_entries: DocketEntry[];
    judgment: {
      type: string | null;
      date: string | null;
      in_favor_of: string | null;
    } | null;
  } | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
}

export interface PaginatedCases {
  data: CaseSummary[];
  pagination: Pagination;
}

export type MetricKey =
  | "eviction_rate_per_1k_residents"
  | "median_hh_income"
  | "pct_black_non_hisp"
  | "ownership_concentration_pct";
