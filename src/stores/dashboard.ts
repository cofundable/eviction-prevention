import { atom, computed } from "nanostores";
import type { CsaFeature, LandlordRow, MetricKey } from "../lib/types";

/** Currently selected CSA name (null = nothing selected) */
export const selectedCsa = atom<string | null>(null);

/** Active metric tab */
export const activeMetric = atom<MetricKey>("eviction_rate_per_1k_residents");

/** All CSA features — loaded once on page init */
export const csaFeatures = atom<CsaFeature[]>([]);

/** Whether the initial CSA data is loading */
export const loading = atom<boolean>(true);

/** Top landlords for the selected CSA (fetched lazily) */
export const selectedCsaLandlords = atom<LandlordRow[]>([]);

/** Derived: feature row for the currently selected CSA */
export const selectedCsaData = computed(
  [selectedCsa, csaFeatures],
  (csa, features) => features.find((f) => f.csa === csa) ?? null
);

export const METRIC_LABELS: Record<MetricKey, string> = {
  eviction_rate_per_1k_residents: "Warrant Rate",
  median_hh_income: "Median Income",
  pct_black_non_hisp: "% Black Residents",
  ownership_concentration_pct: "Ownership Concentration",
};

export const METRIC_FORMAT: Record<MetricKey, (v: number) => string> = {
  eviction_rate_per_1k_residents: (v) => `${v.toFixed(1)} per 1k`,
  median_hh_income: (v) => `$${Math.round(v).toLocaleString()}`,
  pct_black_non_hisp: (v) => `${v.toFixed(1)}%`,
  ownership_concentration_pct: (v) => `${v.toFixed(1)}%`,
};
