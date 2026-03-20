"""
Neighborhood Feature Table Pipeline
------------------------------------
Reads from evictions.db (read-only) and produces outputs/neighborhood_features.csv.

Required input files in ../data/ (repo root data/):
  - neighborhoods.geojson      (279 Baltimore neighborhoods with Census demographics)
  - real_property.geojson      (Maryland SDAT / Baltimore Open Data)
"""

import pathlib
import sys
import duckdb
import geopandas as gpd

ROOT = pathlib.Path(__file__).parent.parent
DATA = ROOT.parent / "data"  # repo root data/
DB_PATH = ROOT.parent / "evictions.db"
OUTPUTS = ROOT / "outputs"
OUTPUTS.mkdir(exist_ok=True)

# Fail fast if required files are missing
required = [
    DATA / "neighborhoods.geojson",
    DATA / "real_property.geojson",
]
missing = [str(f) for f in required if not f.exists()]
if missing:
    print("ERROR: Missing required input files:")
    for f in missing:
        print(f"  {f}")
    sys.exit(1)

con = duckdb.connect()  # in-memory; output is neighborhood_features.csv
con.execute("INSTALL spatial; LOAD spatial;")
con.execute(f"ATTACH '{DB_PATH}' AS src (READ_ONLY)")

# ---------------------------------------------------------------------------
# Step 1 — Load neighborhoods.geojson via geopandas
# ---------------------------------------------------------------------------
nbhd_gdf = gpd.read_file(DATA / "neighborhoods.geojson").to_crs("EPSG:4326")

demographics_df = nbhd_gdf[[
    "Name", "Population", "Blk_AfAm", "White", "Hisp_Lat",
    "Total_Units", "Occ_Occupied", "Occ_Vacant",
    "Tenure_Owner", "Tenure_Renter",
    "HH_Total", "Med_Age",
]].copy()

print(f"Neighborhoods loaded: {len(nbhd_gdf)}")

# ---------------------------------------------------------------------------
# Step 2 — Pull geocoded eviction addresses from evictions.db
# ---------------------------------------------------------------------------
eviction_rows = con.execute(
    """
SELECT DISTINCT w.case_number, a.latitude, a.longitude
FROM src.warrant_filings w
JOIN src.cases c         ON w.case_number = c.case_number
JOIN src.case_parties cp ON cp.case_id = c.id AND cp.party_type = 'tenant'
JOIN src.addresses a     ON cp.address_id = a.id
                        AND a.geocode_match_status = 'Match'
WHERE a.latitude IS NOT NULL AND a.longitude IS NOT NULL
"""
).df()

total_warrants = con.execute(
    "SELECT COUNT(DISTINCT case_number) FROM src.warrant_filings"
).fetchone()[0]
print(f"Total warrants (source of truth): {total_warrants}")
print(f"Geocoded warrant addresses: {len(eviction_rows)}")

# ---------------------------------------------------------------------------
# Step 3 — Spatial join: eviction points → neighborhoods
# ---------------------------------------------------------------------------
eviction_gdf = gpd.GeoDataFrame(
    eviction_rows,
    geometry=gpd.points_from_xy(eviction_rows["longitude"], eviction_rows["latitude"]),
    crs="EPSG:4326",
)

joined = gpd.sjoin(
    eviction_gdf,
    nbhd_gdf[["Name", "geometry"]],
    how="left",
    predicate="within",
)

eviction_counts = (
    joined.groupby("Name")["case_number"]
    .count()
    .reset_index()
    .rename(columns={"case_number": "eviction_count"})
)

assigned = eviction_counts["eviction_count"].sum()
print(
    f"Warrants assigned to a neighborhood: {assigned} / {total_warrants} "
    f"({100 * assigned / total_warrants:.1f}%)"
)

# ---------------------------------------------------------------------------
# Step 4 — Spatial join: real property → neighborhoods (DuckDB spatial)
# ---------------------------------------------------------------------------
con.execute(
    f"""
CREATE OR REPLACE TABLE real_property_raw AS
SELECT * FROM ST_Read('{DATA / "real_property.geojson"}');
"""
)

print(
    "\nUSEGROUP distribution in real_property (review before trusting rental filter):"
)
print(
    con.execute(
        "SELECT USEGROUP, COUNT(*) n FROM real_property_raw GROUP BY USEGROUP ORDER BY n DESC"
    ).df()
)

con.execute(
    f"""
CREATE OR REPLACE TABLE nbhd_boundaries AS
SELECT * FROM ST_Read('{DATA / "neighborhoods.geojson"}');
"""
)

con.execute(
    """
CREATE OR REPLACE TABLE real_property_with_nbhd AS
SELECT r.*, n."Name" AS neighborhood
FROM real_property_raw r
JOIN nbhd_boundaries n ON ST_Within(r.geom, n.geom)
WHERE TRIM(r.USEGROUP) IN ('R', 'U', 'M', 'RC')
"""
)

# ---------------------------------------------------------------------------
# Step 5 — Ownership concentration by neighborhood
# ---------------------------------------------------------------------------
con.execute(
    """
CREATE OR REPLACE TABLE ownership_concentration_by_nbhd AS
WITH owner_totals AS (
    SELECT neighborhood, OWNER_1 AS owner_name, SUM(DWELUNIT) AS owner_units
    FROM real_property_with_nbhd
    WHERE PERMHOME IN ('N', 'D')
      AND OWNER_1 IS NOT NULL
      AND TRIM(OWNER_1) != ''
    GROUP BY neighborhood, OWNER_1
),
nbhd_totals AS (
    SELECT neighborhood,
        COUNT(*)                                                      AS total_residential_properties,
        SUM(DWELUNIT)                                                 AS total_residential_units,
        SUM(CASE WHEN PERMHOME IN ('N', 'D') THEN DWELUNIT END)      AS total_rental_units,
        COUNT(DISTINCT CASE WHEN PERMHOME IN ('N', 'D')
            AND OWNER_1 IS NOT NULL AND TRIM(OWNER_1) != ''
            THEN OWNER_1 END)                                         AS unique_owners
    FROM real_property_with_nbhd GROUP BY neighborhood
),
top10 AS (
    SELECT neighborhood, SUM(owner_units) AS units_top_10_owners
    FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY neighborhood ORDER BY owner_units DESC) AS rn
        FROM owner_totals
    ) WHERE rn <= 10
    GROUP BY neighborhood
)
SELECT n.neighborhood, n.total_residential_properties, n.total_residential_units,
    n.total_rental_units, n.unique_owners,
    t.units_top_10_owners,
    ROUND(t.units_top_10_owners * 100.0 / NULLIF(n.total_rental_units, 0), 1) AS ownership_concentration_pct
FROM nbhd_totals n JOIN top10 t USING (neighborhood);
"""
)

# ---------------------------------------------------------------------------
# Step 6 — Register DataFrames and assemble final feature table
# ---------------------------------------------------------------------------
con.register("eviction_counts_df", eviction_counts)
con.register("demographics_df", demographics_df)

con.execute(
    """
CREATE OR REPLACE TABLE neighborhood_features AS
SELECT
    d."Name"                                                                   AS neighborhood,
    COALESCE(e.eviction_count, 0)                                              AS eviction_count,
    d."Population"                                                             AS total_pop,
    d."HH_Total"                                                               AS total_hh,
    d."Tenure_Renter"                                                          AS renter_hh,
    d."Total_Units"                                                            AS total_units,
    -- Eviction rates
    ROUND(COALESCE(e.eviction_count, 0) * 1000.0 / NULLIF(d."HH_Total", 0), 2)         AS eviction_rate_per_1k_hh,
    ROUND(COALESCE(e.eviction_count, 0) * 1000.0 / NULLIF(d."Tenure_Renter", 0), 2)    AS eviction_rate_per_1k_renter_hh,
    -- Demographics (raw counts → percentages)
    ROUND(d."Blk_AfAm" * 100.0 / NULLIF(d."Population", 0), 1)               AS pct_black,
    ROUND(d."White"    * 100.0 / NULLIF(d."Population", 0), 1)               AS pct_white,
    ROUND(d."Hisp_Lat" * 100.0 / NULLIF(d."Population", 0), 1)               AS pct_hispanic,
    ROUND(d."Tenure_Renter" * 100.0 / NULLIF(d."Occ_Occupied", 0), 1)       AS pct_renter,
    ROUND(d."Occ_Vacant"    * 100.0 / NULLIF(d."Total_Units", 0), 1)         AS pct_vacant,
    d."Med_Age"                                                               AS med_age,
    -- Ownership concentration
    o.ownership_concentration_pct,
    o.unique_owners
FROM demographics_df d
LEFT JOIN eviction_counts_df e ON d."Name" = e."Name"
LEFT JOIN ownership_concentration_by_nbhd o ON d."Name" = o.neighborhood
"""
)

row_count = con.execute("SELECT COUNT(*) FROM neighborhood_features").fetchone()[0]
assert row_count == 279, f"Expected 279 neighborhoods, got {row_count}"

con.execute(
    f"COPY neighborhood_features TO '{OUTPUTS / 'neighborhood_features.csv'}' (HEADER, DELIMITER ',')"
)
print(f"\nneighborhood_features: {row_count} rows written to outputs/neighborhood_features.csv")
print(con.execute("SELECT * FROM neighborhood_features LIMIT 5").df())
