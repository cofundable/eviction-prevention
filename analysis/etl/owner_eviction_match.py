"""
Owner-eviction match via spatial join
---------------------------------------
Links each warrant filing to the SDAT property owner by spatially joining the
geocoded tenant address point to the nearest SDAT parcel within MAX_DIST_M metres.

Census geocoding returns an interpolated point on the street centreline, not the
parcel centroid, so a nearest-neighbour join with a short distance cap is more
reliable than point-in-polygon.

Both layers are projected to UTM zone 18N (EPSG:32618, metres) before joining.

Reads:
  - evictions.db  (warrant_filings → cases → case_parties/tenant → addresses)
  - data/real_property.geojson
  - data/Community_Statistical_Areas.geojson
  - analysis/data/tract_to_csa.csv

Writes:
  - outputs/owner_eviction_matches.csv   (per-warrant: case, address, matched owner, distance)
  - outputs/owner_eviction_counts.csv    (per-owner summary: evictions, SDAT units)
"""

import pathlib
import duckdb
import pandas as pd
import geopandas as gpd
from scipy import stats

ROOT = pathlib.Path(__file__).parent.parent
DB_PATH = ROOT.parent / "evictions.db"
DATA = ROOT.parent / "data"
RAW = ROOT / "data"
OUTPUTS = ROOT / "outputs"

MAX_DIST_M = 50  # maximum distance (metres) to accept a nearest-parcel match
TOP_N = 30

# Luxury parcel threshold: assessed value per unit only.
# Year built is unreliable (missing for most parcels) and excludes converted
# historic buildings like 10 Light Street. All known high-eviction owners are
# well under $80k/unit so the value threshold alone avoids false positives.
LUXURY_ASSESSED = 80_000  # assessed value per unit (BFCVIMPR / DWELUNIT)

# CSA2020 → CSA2010 name mapping (same as run.py)
CSA_RENAME = {
    "Greater Lauraville": "Lauraville",
    "Orchard Ridge/Armistead": "Claremont/Armistead",
    "Pigtown/Carroll Park": "Washington Village/Pigtown",
    "Oliver/Johnston Square": "Greenmount East",
    "Hampden/Remington": "Medfield/Hampden/Woodberry/Remington",
    "Greektown/Bayview": "Orangeville/East Highlandtown",
    "Hamilton Hills": "Harford/Echodale",
}

# ---------------------------------------------------------------------------
# Load geocoded eviction addresses
# ---------------------------------------------------------------------------
con = duckdb.connect()
con.execute(f"ATTACH '{DB_PATH}' AS src (TYPE sqlite, READ_ONLY)")

print("Loading eviction addresses...")
evictions = con.execute(
    """
    SELECT
        w.case_number,
        landlord.name AS plaintiff,
        a.street   AS eviction_street,
        a.zip_code,
        a.census_tract_geoid,
        a.latitude,
        a.longitude
    FROM src.warrant_filings w
    JOIN src.cases c ON w.case_number = c.case_number
    JOIN src.case_parties cp ON cp.case_id = c.id AND cp.party_type = 'tenant'
    JOIN src.addresses a ON cp.address_id = a.id
    LEFT JOIN src.case_parties landlord ON landlord.case_id = c.id AND landlord.party_type = 'landlord'
    WHERE a.geocode_match_status = 'Match'
      AND a.latitude  IS NOT NULL
      AND a.longitude IS NOT NULL
"""
).df()
print(f"  {len(evictions)} warrants with geocoded tenant addresses")

evictions_gdf = gpd.GeoDataFrame(
    evictions,
    geometry=gpd.points_from_xy(evictions["longitude"], evictions["latitude"]),
    crs="EPSG:4326",
).to_crs("EPSG:32618")

# ---------------------------------------------------------------------------
# Load tract → CSA crosswalk
# ---------------------------------------------------------------------------
tract_to_csa = pd.read_csv(RAW / "tract_to_csa.csv", dtype=str)
tract_to_csa = tract_to_csa.rename(
    columns={
        "GEOID_Tract_2020": "census_tract_geoid",
        "Community_Statistical_Area_2010": "csa2010",
    }
)[["census_tract_geoid", "csa2010"]]

evictions_gdf = evictions_gdf.merge(tract_to_csa, on="census_tract_geoid", how="left")
csa_assigned = evictions_gdf["csa2010"].notna().sum()
print(
    f"  {csa_assigned} / {len(evictions_gdf)} warrants assigned to a CSA via census tract"
)

# ---------------------------------------------------------------------------
# Load SDAT rental parcels
# ---------------------------------------------------------------------------
print("Loading SDAT parcels...")
sdat = gpd.read_file(DATA / "real_property.geojson", engine="pyogrio")
sdat = sdat[
    sdat["USEGROUP"].str.strip().isin(["R", "U", "M", "RC"])
    & sdat["PERMHOME"].isin(["N", "D"])
    & sdat["OWNER_1"].notna()
    & (sdat["OWNER_1"].str.strip() != "")
].copy()
# Coerce valuation and year — 0 means missing in SDAT
sdat["BFCVIMPR"] = pd.to_numeric(sdat["BFCVIMPR"], errors="coerce").replace(0, pd.NA)
sdat["YEAR_BUILD"] = pd.to_numeric(sdat["YEAR_BUILD"], errors="coerce").replace(
    0, pd.NA
)
sdat["DWELUNIT"] = pd.to_numeric(sdat["DWELUNIT"], errors="coerce").fillna(0)
print(f"  {len(sdat)} rental parcels")
sdat = sdat.to_crs("EPSG:32618")

# ---------------------------------------------------------------------------
# Assign CSA to each SDAT parcel via spatial join to CSA boundaries
# ---------------------------------------------------------------------------
print("Assigning CSA to SDAT parcels...")
csa_bounds = gpd.read_file(DATA / "Community_Statistical_Areas.geojson").to_crs(
    "EPSG:32618"
)
csa_bounds["csa2010"] = csa_bounds["CSA2020"].replace(CSA_RENAME)

sdat = gpd.sjoin(
    sdat[["FULLADDR", "OWNER_1", "DWELUNIT", "BFCVIMPR", "YEAR_BUILD", "geometry"]],
    csa_bounds[["csa2010", "geometry"]],
    how="left",
    predicate="within",
).drop(columns=["index_right"])
print(f"  {sdat['csa2010'].notna().sum()} / {len(sdat)} parcels assigned to a CSA")

# Parcel-level luxury flag: high assessed value/unit AND built post-LUXURY_YEAR
# Parcels missing either value are treated as non-luxury (conservative).
sdat["parcel_assessed_per_unit"] = sdat["BFCVIMPR"] / sdat["DWELUNIT"].replace(0, pd.NA)
sdat["is_luxury"] = (sdat["parcel_assessed_per_unit"] >= LUXURY_ASSESSED).fillna(False)
luxury_count = sdat["is_luxury"].sum()
luxury_units = sdat.loc[sdat["is_luxury"], "DWELUNIT"].sum()
print(
    f"  {luxury_count} luxury parcels flagged ({luxury_units:,.0f} units excluded from owner ranking)"
)

# ---------------------------------------------------------------------------
# Spatial join: nearest parcel within MAX_DIST_M
# ---------------------------------------------------------------------------
print(f"\nSpatial join (nearest parcel within {MAX_DIST_M}m)...")
# Rename csa2010 on both sides before join to avoid suffix conflicts
evictions_left = evictions_gdf[
    ["case_number", "plaintiff", "eviction_street", "geometry"]
].copy()
evictions_left["csa2010_eviction"] = evictions_gdf["csa2010"]

sdat_right = sdat[
    ["FULLADDR", "OWNER_1", "DWELUNIT", "BFCVIMPR", "YEAR_BUILD", "geometry"]
].copy()
sdat_right["csa2010_sdat"] = sdat["csa2010"]

joined = gpd.sjoin_nearest(
    evictions_left,
    sdat_right,
    how="left",
    max_distance=MAX_DIST_M,
    distance_col="dist_m",
)

matched = joined["OWNER_1"].notna()
print(f"  Matched: {matched.sum()} / {len(joined)} ({100 * matched.mean():.1f}%)")
print(
    f"  Median distance to matched parcel: {joined.loc[matched, 'dist_m'].median():.1f}m"
)
print(f"  Unmatched (no parcel within {MAX_DIST_M}m): {(~matched).sum()}")

# Resolve CSA: prefer eviction address CSA (tract-based), fall back to SDAT parcel CSA
joined["csa2010"] = joined["csa2010_eviction"].fillna(joined["csa2010_sdat"])

# ---------------------------------------------------------------------------
# Save per-warrant detail
# ---------------------------------------------------------------------------
detail = joined[
    [
        "case_number",
        "plaintiff",
        "eviction_street",
        "FULLADDR",
        "OWNER_1",
        "dist_m",
        "csa2010",
    ]
].copy()
detail.columns = [
    "case_number",
    "plaintiff",
    "eviction_street",
    "sdat_address",
    "owner",
    "dist_m",
    "csa2010",
]
detail["dist_m"] = detail["dist_m"].round(1)
detail.to_csv(OUTPUTS / "owner_eviction_matches.csv", index=False)

# ---------------------------------------------------------------------------
# Aggregate per owner (citywide) — two versions: all units and non-luxury only
# ---------------------------------------------------------------------------
owner_units = (
    sdat.groupby("OWNER_1")
    .agg(total_units=("DWELUNIT", "sum"), sdat_parcels=("FULLADDR", "count"))
    .reset_index()
    .rename(columns={"OWNER_1": "owner"})
)

owner_units_nonluxury = (
    sdat[~sdat["is_luxury"]]
    .groupby("OWNER_1")
    .agg(nonluxury_units=("DWELUNIT", "sum"))
    .reset_index()
    .rename(columns={"OWNER_1": "owner"})
)

summary = (
    detail.dropna(subset=["owner"])
    .groupby("owner")
    .agg(eviction_count=("case_number", "nunique"))
    .reset_index()
    .merge(owner_units, on="owner", how="left")
    .assign(eviction_rate=lambda x: (x["eviction_count"] / x["total_units"]).round(3))
    .sort_values("eviction_count", ascending=False)
)
summary.to_csv(OUTPUTS / "owner_eviction_counts.csv", index=False)

pd.set_option("display.max_rows", TOP_N + 5)
pd.set_option("display.max_colwidth", 50)
pd.set_option("display.width", 140)

# ---------------------------------------------------------------------------
# Table A: Top plaintiffs → spatially matched SDAT owner
# For each top plaintiff, show the most common SDAT owner their cases map to
# ---------------------------------------------------------------------------
print(f"\n{'='*80}")
print(f"Table A: Top {TOP_N} plaintiffs by warrant count → matched SDAT owner")
print(f"{'='*80}")

top_plaintiffs = (
    detail.dropna(subset=["plaintiff"])
    .groupby("plaintiff")
    .agg(warrants=("case_number", "nunique"))
    .reset_index()
    .sort_values("warrants", ascending=False)
    .head(TOP_N)
)


def top_owner(group):
    counts = group["owner"].dropna().value_counts()
    if counts.empty:
        return None, 0, 0
    top = counts.index[0]
    n_matched = counts.iloc[0]
    return top, n_matched, len(group)


rows = []
for _, row in top_plaintiffs.iterrows():
    cases = detail[detail["plaintiff"] == row["plaintiff"]]
    top_own, n_matched, n_total = top_owner(cases)
    rows.append(
        {
            "plaintiff": row["plaintiff"],
            "warrants": row["warrants"],
            "sdat_owner": top_own,
            "warrants_matched": n_matched,
        }
    )

table_a = pd.DataFrame(rows)
print(table_a.to_string(index=False))
table_a.to_csv(OUTPUTS / "plaintiff_to_owner.csv", index=False)

# ---------------------------------------------------------------------------
# Table B: Top SDAT owners by units → plaintiff names filing on their properties
# ---------------------------------------------------------------------------
print(f"\n{'='*80}")
print(
    f"Table B: Top {TOP_N} SDAT owners by non-luxury rental units → court plaintiff name(s)"
)
print(f"{'='*80}")

top_owners_list = owner_units_nonluxury.sort_values(
    "nonluxury_units", ascending=False
).head(TOP_N)

rows_b = []
for _, row in top_owners_list.iterrows():
    cases = detail[detail["owner"] == row["owner"]]
    n_warrants = cases["case_number"].nunique()
    top_plaintiffs_for_owner = (
        cases.dropna(subset=["plaintiff"])["plaintiff"]
        .value_counts()
        .head(2)
        .index.tolist()
    )
    rows_b.append(
        {
            "sdat_owner": row["owner"],
            "nonluxury_units": int(row["nonluxury_units"]),
            "warrants": n_warrants,
            "top_plaintiffs": (
                " | ".join(top_plaintiffs_for_owner)
                if top_plaintiffs_for_owner
                else None
            ),
        }
    )

table_b = pd.DataFrame(rows_b)
print(table_b.to_string(index=False))
table_b.to_csv(OUTPUTS / "owner_to_plaintiff.csv", index=False)

# ---------------------------------------------------------------------------
# Hypothesis 1: do larger owners file more evictions? (expected, baseline)
# ---------------------------------------------------------------------------
sub = summary.dropna(subset=["total_units"])
r1, p1 = stats.spearmanr(sub["eviction_count"], sub["total_units"])
print(f"\nTop {TOP_N} owners by eviction count:")
print(summary.head(TOP_N).to_string(index=False))
print("\nH1 — larger portfolio → more evictions (absolute count)")
print(
    f"  Spearman r (eviction_count vs total_units): {r1:.3f}, p={p1:.4f} (n={len(sub)})"
)
print(
    "  [Expected: positive. Tests whether we matched the right owners, not the hypothesis.]"
)

# ---------------------------------------------------------------------------
# Hypothesis 2: within-CSA ownership concentration → higher eviction rate per unit
#
# For each (owner, CSA) pair:
#   - owner_units_in_csa   = SDAT DWELUNIT for that owner in that CSA
#   - total_rental_in_csa  = total SDAT rental DWELUNIT in that CSA
#   - concentration        = owner_units_in_csa / total_rental_in_csa  (share of CSA rental stock)
#   - eviction_rate_in_csa = evictions filed in that CSA / owner_units_in_csa
#
# Excludes (owner, CSA) pairs with fewer than MIN_UNITS_IN_CSA to reduce noise.
# ---------------------------------------------------------------------------
MIN_UNITS_IN_CSA = 5

# Per-(owner, CSA): eviction counts
eviction_by_owner_csa = (
    detail.dropna(subset=["owner", "csa2010"])
    .groupby(["owner", "csa2010"])
    .agg(evictions_in_csa=("case_number", "nunique"))
    .reset_index()
)

# Per-(owner, CSA): SDAT units + valuation + year for market tier
sdat_by_owner_csa = (
    sdat.dropna(subset=["OWNER_1", "csa2010"])
    .groupby(["OWNER_1", "csa2010"])
    .agg(
        owner_units_in_csa=("DWELUNIT", "sum"),
        # weighted avg assessed value per unit (NaN-safe: only parcels with a value)
        total_assessed=("BFCVIMPR", "sum"),
        avg_year_built=("YEAR_BUILD", "median"),
    )
    .reset_index()
    .rename(columns={"OWNER_1": "owner"})
)
sdat_by_owner_csa["assessed_per_unit"] = sdat_by_owner_csa[
    "total_assessed"
] / sdat_by_owner_csa["owner_units_in_csa"].replace(0, pd.NA)

# Per-CSA: total rental units + median income from csa_features
total_by_csa = (
    sdat.dropna(subset=["csa2010"])
    .groupby("csa2010")
    .agg(total_rental_in_csa=("DWELUNIT", "sum"))
    .reset_index()
)

# Join all together
owner_csa = (
    sdat_by_owner_csa.merge(eviction_by_owner_csa, on=["owner", "csa2010"], how="left")
    .merge(total_by_csa, on="csa2010", how="left")
    .merge(csa_income, on="csa2010", how="left")
)
owner_csa["evictions_in_csa"] = owner_csa["evictions_in_csa"].fillna(0)
owner_csa["concentration"] = (
    owner_csa["owner_units_in_csa"] / owner_csa["total_rental_in_csa"]
)
owner_csa["eviction_rate_in_csa"] = (
    owner_csa["evictions_in_csa"] / owner_csa["owner_units_in_csa"]
)


# ---------------------------------------------------------------------------
# Market tier composite score
# Combines assessed value per unit, year built, and CSA median income.
# Each component is min-max normalized across all (owner, CSA) pairs, then
# averaged into a single score in [0, 1] where 1 = luxury.
# ---------------------------------------------------------------------------
def minmax(s):
    lo, hi = s.min(), s.max()
    return (s - lo) / (hi - lo) if hi > lo else s * 0.0


owner_csa["norm_assessed"] = minmax(owner_csa["assessed_per_unit"])
owner_csa["norm_year"] = minmax(owner_csa["avg_year_built"])
owner_csa["norm_income"] = minmax(owner_csa["median_hh_income"])

# Average available components (some rows missing year or assessed value)
score_cols = ["norm_assessed", "norm_year", "norm_income"]
owner_csa["market_tier_score"] = owner_csa[score_cols].mean(axis=1, skipna=True)

# Split at median score: luxury vs lower-income market
tier_median = owner_csa["market_tier_score"].median()
owner_csa["market_tier_soft"] = owner_csa["market_tier_score"].apply(
    lambda x: "luxury" if x >= tier_median else "lower-income"
)

# Hard thresholds for lower-income tier
LOWINCOME_ASSESSED = 50_000
LOWINCOME_INCOME = 45_000


def assign_tier(row):
    assessed = row["assessed_per_unit"]
    if pd.isna(assessed):
        return "unknown"
    if assessed >= LUXURY_ASSESSED:
        return "luxury"
    if assessed < LOWINCOME_ASSESSED:
        return "lower-income"
    return "middle"


owner_csa["market_tier"] = owner_csa.apply(assign_tier, axis=1)

print("\nMarket tier (hard thresholds: assessed/unit, CSA median income):")
print(owner_csa["market_tier"].value_counts().to_string())

# Filter base: enough units in CSA, at least one eviction
sub2_all = owner_csa[
    (owner_csa["owner_units_in_csa"] >= MIN_UNITS_IN_CSA)
    & (owner_csa["evictions_in_csa"] > 0)
].copy()

r2, p2 = stats.spearmanr(sub2_all["concentration"], sub2_all["eviction_rate_in_csa"])

print("\nH2 — within-CSA ownership concentration → higher eviction rate per unit")
print(f"  ALL markets: Spearman r={r2:.3f}, p={p2:.4f}  (n={len(sub2_all)})")

for tier in ["luxury", "middle", "lower-income"]:
    sub_t = sub2_all[sub2_all["market_tier"] == tier]
    if len(sub_t) < 5:
        print(f"  {tier}: insufficient data (n={len(sub_t)})")
        continue
    r_t, p_t = stats.spearmanr(sub_t["concentration"], sub_t["eviction_rate_in_csa"])
    print(f"  {tier:>12}: Spearman r={r_t:.3f}, p={p_t:.4f}  (n={len(sub_t)})")

# ---------------------------------------------------------------------------
# Bucket analysis: eviction rate by owner size within lower-income markets
# Tests whether mid-size owners (50–150 units in CSA) have the highest rates.
# We use owner_units_in_csa (footprint in that specific market, not citywide).
# ---------------------------------------------------------------------------
BUCKETS = [0, 10, 30, 75, 200, float("inf")]
BUCKET_LABELS = ["1–10", "11–30", "31–75", "76–200", "200+"]

# Run for lower-income and all markets
for tier_label, tier_filter in [
    ("lower-income CSAs", sub2_all["market_tier"] == "lower-income"),
    ("all markets", pd.Series(True, index=sub2_all.index)),
]:
    sub_b = sub2_all[tier_filter].copy()
    sub_b["size_bucket"] = pd.cut(
        sub_b["owner_units_in_csa"],
        bins=BUCKETS,
        labels=BUCKET_LABELS,
        right=True,
    )
    bucket_stats = (
        sub_b.groupby("size_bucket", observed=True)
        .agg(
            n=("owner", "count"),
            median_eviction_rate=("eviction_rate_in_csa", "median"),
            mean_eviction_rate=("eviction_rate_in_csa", "mean"),
            median_concentration=("concentration", "median"),
        )
        .reset_index()
        .round(
            {
                "median_eviction_rate": 3,
                "mean_eviction_rate": 3,
                "median_concentration": 3,
            }
        )
    )
    print(f"\nEviction rate by owner size bucket — {tier_label}:")
    print(bucket_stats.to_string(index=False))
