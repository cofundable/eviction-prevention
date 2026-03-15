"""
Bivariate correlation analysis: eviction rates vs CSA-level features.
Reads outputs/csa_features.csv and writes outputs/bivariate_correlations.csv.
"""

import pathlib
import duckdb
import pandas as pd
from scipy import stats

ROOT = pathlib.Path(__file__).parent.parent
OUTPUTS = ROOT / "outputs"

df = duckdb.connect().execute(
    f"SELECT * FROM read_csv_auto('{OUTPUTS / 'csa_features.csv'}')"
).df()

RATE_COLS = [
    "eviction_rate_per_1k_residents",
    "eviction_rate_per_1k_households",
    "eviction_rate_per_1k_renter_hh",
    "eviction_rate_per_1k_rentals",
]

# Exclude raw counts, denominators, and the rates themselves
EXCLUDE = set(RATE_COLS) | {
    "csa2010", "eviction_count",
    "total_pop", "total_hh", "renter_hh",
    "total_residential_properties", "total_residential_units",
    "bnia_total_residential_props", "total_rental_units",
    "unique_owners", "units_top_10_owners",
}
feature_cols = [c for c in df.columns if c not in EXCLUDE]

rows = []
for rate in RATE_COLS:
    for feat in feature_cols:
        sub = df[[rate, feat]].dropna()
        if len(sub) < 10:
            continue
        pearson_r, pearson_p = stats.pearsonr(sub[rate], sub[feat])
        spearman_r, spearman_p = stats.spearmanr(sub[rate], sub[feat])
        rows.append({
            "rate": rate,
            "feature": feat,
            "n": len(sub),
            "pearson_r": round(pearson_r, 3),
            "pearson_p": round(pearson_p, 4),
            "spearman_r": round(spearman_r, 3),
            "spearman_p": round(spearman_p, 4),
        })

results = (
    pd.DataFrame(rows)
    .assign(abs_pearson_r=lambda x: x["pearson_r"].abs())
    .sort_values(["rate", "abs_pearson_r"], ascending=[True, False])
    .drop(columns="abs_pearson_r")
)

out_path = OUTPUTS / "bivariate_correlations.csv"
results.to_csv(out_path, index=False)
print(f"Written {len(results)} rows to {out_path}")
print()

pd.set_option("display.max_rows", 200)
pd.set_option("display.width", 120)
pd.set_option("display.float_format", "{:.3f}".format)
print(results.to_string(index=False))
