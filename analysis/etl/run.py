"""
CSA Feature Table Pipeline
--------------------------
Reads from evictions.db (read-only) and produces outputs/csa_features.csv.

Required input files in ../data/ (repo root data/):
  - tract_to_csa.csv              (BNIA — bniajfi.org)
  - bnia_indicators.tsv           (BNIA Vital Signs, tab-delimited)
  - real_property.geojson         (Maryland SDAT / Baltimore Open Data)
  - Community_Statistical_Areas.geojson  (BNIA / Baltimore Open Data)
"""

import pathlib
import sys
import duckdb

ROOT = pathlib.Path(__file__).parent.parent
DATA = ROOT.parent / "data"  # repo root data/ (bnia, real_property, CSA boundaries)
RAW = ROOT / "data"  # analysis/data/ (crosswalk files)
DB_PATH = ROOT.parent / "evictions.db"
OUTPUTS = ROOT / "outputs"
OUTPUTS.mkdir(exist_ok=True)

# Fail fast if required files are missing
required = [
    RAW / "tract_to_csa.csv",
    DATA / "bnia_indicators.tsv",
    DATA / "real_property.geojson",
    DATA / "Community_Statistical_Areas.geojson",
]
missing = [str(f) for f in required if not f.exists()]
if missing:
    print("ERROR: Missing required input files:")
    for f in missing:
        print(f"  {f}")
    sys.exit(1)

con = duckdb.connect()  # in-memory; output is csa_features.csv
con.execute("INSTALL spatial; LOAD spatial;")
con.execute(f"ATTACH '{DB_PATH}' AS src (READ_ONLY)")

# ---------------------------------------------------------------------------
# Step 2 — Load tract → CSA crosswalk
# ---------------------------------------------------------------------------
con.execute(
    f"""
CREATE OR REPLACE TABLE tract_to_csa AS
SELECT
    TRY_CAST(GEOID_Tract_2020 AS VARCHAR) AS tract_fips,
    Community_Statistical_Area_2010   AS CSA2010
FROM read_csv_auto('{RAW / "tract_to_csa.csv"}');
"""
)
print(
    f"tract_to_csa rows: {con.execute('SELECT COUNT(*) FROM tract_to_csa').fetchone()[0]}"
)

# ---------------------------------------------------------------------------
# Step 3 — Eviction counts by CSA
# ---------------------------------------------------------------------------
total_warrants = con.execute(
    "SELECT COUNT(DISTINCT case_number) FROM src.warrant_filings"
).fetchone()[0]
print(f"Total warrants (source of truth): {total_warrants}")

con.execute(
    """
CREATE OR REPLACE TABLE eviction_counts_by_csa AS
SELECT t.CSA2010 AS csa2010, COUNT(DISTINCT w.case_number) AS eviction_count
FROM src.warrant_filings w
JOIN src.cases c ON w.case_number = c.case_number
JOIN src.case_parties cp ON cp.case_id = c.id AND cp.party_type = 'tenant'
JOIN src.addresses a ON cp.address_id = a.id
    AND a.geocode_match_status = 'Match'
JOIN tract_to_csa t ON a.census_tract_geoid = t.tract_fips
WHERE a.census_tract_geoid IS NOT NULL
GROUP BY t.CSA2010;
"""
)

assigned = con.execute(
    "SELECT SUM(eviction_count) FROM eviction_counts_by_csa"
).fetchone()[0]
print(
    f"Warrants assigned to a CSA: {assigned} / {total_warrants} "
    f"({100 * assigned / total_warrants:.1f}%)"
)
# NOTE: unassigned warrants are cases not yet scraped or addresses not geocoded
# — counts per CSA are lower-bound estimates

# ---------------------------------------------------------------------------
# Step 4 — Spatial join: real property → CSA
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
CREATE OR REPLACE TABLE csa_boundaries AS
SELECT * FROM ST_Read('{DATA / "Community_Statistical_Areas.geojson"}');
"""
)

con.execute(
    """
CREATE OR REPLACE TABLE real_property_with_csa AS
SELECT r.*, COALESCE(csa2020_to_2010.csa2010, c.CSA2020) AS csa2010
FROM real_property_raw r
JOIN csa_boundaries c ON ST_Within(r.geom, c.geom)
-- Translate CSA2020 names that changed from CSA2010
LEFT JOIN (VALUES
    ('Greater Lauraville',                    'Lauraville'),
    ('Orchard Ridge/Armistead',               'Claremont/Armistead'),
    ('Pigtown/Carroll Park',                  'Washington Village/Pigtown'),
    ('Oliver/Johnston Square',                'Greenmount East'),
    ('Hampden/Remington',                     'Medfield/Hampden/Woodberry/Remington'),
    ('Greektown/Bayview',                     'Orangeville/East Highlandtown'),
    ('Hamilton Hills',                        'Harford/Echodale')
) AS csa2020_to_2010(csa2020, csa2010) ON c.CSA2020 = csa2020_to_2010.csa2020
-- Residential use groups (USEGROUP has trailing space in geojson):
--   R  = residential
--   U  = residential condominium
--   M  = apartment complex (4+ rental units) — explicitly rental
--   RC = mixed-use, residential primary
-- NOTE: USEGROUP='E' (exempt/government) excluded, so public housing is undercounted
WHERE TRIM(r.USEGROUP) IN ('R', 'U', 'M', 'RC')
"""
)

# ---------------------------------------------------------------------------
# Step 5 — Ownership concentration by CSA
# ---------------------------------------------------------------------------
con.execute(
    """
CREATE OR REPLACE TABLE ownership_concentration_by_csa AS
WITH owner_totals AS (
    SELECT csa2010, OWNER_1 AS owner_name, SUM(DWELUNIT) AS owner_units
    FROM real_property_with_csa
    WHERE PERMHOME IN ('N', 'D')
      AND OWNER_1 IS NOT NULL
      AND TRIM(OWNER_1) != ''
    GROUP BY csa2010, OWNER_1
),
csa_totals AS (
    SELECT csa2010,
        COUNT(*)                                                      AS total_residential_properties,
        SUM(DWELUNIT)                                                 AS total_residential_units,
        SUM(CASE WHEN PERMHOME IN ('N', 'D') THEN DWELUNIT END)      AS total_rental_units,
        COUNT(DISTINCT CASE WHEN PERMHOME IN ('N', 'D')
            AND OWNER_1 IS NOT NULL AND TRIM(OWNER_1) != ''
            THEN OWNER_1 END)                                         AS unique_owners
    FROM real_property_with_csa GROUP BY csa2010
),
top10 AS (
    SELECT csa2010, SUM(owner_units) AS units_top_10_owners
    FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY csa2010 ORDER BY owner_units DESC) AS rn
        FROM owner_totals
    ) WHERE rn <= 10
    GROUP BY csa2010
)
SELECT c.csa2010, c.total_residential_properties, c.total_residential_units, c.total_rental_units, c.unique_owners,
    t.units_top_10_owners,
    -- NOTE: lower-bound estimate — LLC fragmentation means true concentration is higher
    ROUND(t.units_top_10_owners * 100.0 / NULLIF(c.total_rental_units, 0), 1) AS ownership_concentration_pct
FROM csa_totals c JOIN top10 t USING (csa2010);
"""
)

# ---------------------------------------------------------------------------
# Step 6 — Load BNIA indicators (rename verbose column headers to sql names)
# ---------------------------------------------------------------------------
con.execute(
    f"""
CREATE OR REPLACE TABLE bnia_indicators AS
SELECT
    CSA2010                                                                    AS csa2010,
    TRY_CAST("Total Population" AS DOUBLE)                                         AS total_pop,
    TRY_CAST("Total Number of Households" AS DOUBLE)                               AS total_hh,
    TRY_CAST("Total Number of Residential Properties" AS DOUBLE)                   AS bnia_total_residential_props,
    TRY_CAST("Percent of Residents - Black/African-American (Non-Hispanic)" AS DOUBLE) AS pct_black_non_hisp,
    TRY_CAST("Percent of Residents - White/Caucasian (Non-Hispanic)" AS DOUBLE)    AS pct_white_non_hisp,
    TRY_CAST("Percent of Residents - Hispanic" AS DOUBLE)                          AS pct_hispanic,
    TRY_CAST("Median Household Income" AS DOUBLE)                                  AS median_hh_income,
    TRY_CAST("Percent of Households Earning Less than $25,000" AS DOUBLE)          AS pct_hh_income_under_25k,
    TRY_CAST("Percent of Family Households Living Below the Poverty Line" AS DOUBLE) AS pct_family_hh_poverty,
    TRY_CAST("Percent of Children Living Below the Poverty Line" AS DOUBLE)        AS pct_children_poverty,
    TRY_CAST("Percent of Persons receiving SNAP" AS DOUBLE)                        AS pct_persons_snap,
    TRY_CAST("Percent of Families Receiving TANF" AS DOUBLE)                       AS pct_families_tanf,
    TRY_CAST("Unemployment Rate" AS DOUBLE)                                        AS unemployment_rate,
    TRY_CAST("Percent Population 16-64 Unemployed and Looking for Work" AS DOUBLE) AS pct_pop_16_64_unemployed,
    TRY_CAST("Percentage of Housing Units that are Owner-Occupied" AS DOUBLE)      AS pct_owner_occupied,
    TRY_CAST("Percentage of Residential Properties that are Vacant and Abandoned" AS DOUBLE) AS pct_vacant_abandoned,
    TRY_CAST("Percentage of Residential Sales for Cash" AS DOUBLE)                 AS pct_cash_sales,
    TRY_CAST("Percentage of Residential Tax Lien Sales" AS DOUBLE)                 AS pct_tax_lien_sales,
    TRY_CAST("Affordability Index - Rent" AS DOUBLE)                               AS affordability_idx_rent,
    TRY_CAST("Rate of Housing Vouchers per 1,000 Rental Units" AS DOUBLE)          AS housing_vouchers_per_1k,
    TRY_CAST("Percent of CSA that is Either Low or Moderate income (by Census tract)" AS DOUBLE) AS pct_low_mod_income_tract,
    TRY_CAST("Percent of Adult Population on Parole/Probation" AS DOUBLE)          AS pct_adult_pop_parole_probation
FROM read_csv_auto('{DATA / "bnia_indicators.tsv"}', delim='\t', header=true, nullstr='NA')
WHERE CSA2010 IS NOT NULL AND CSA2010 != 'CSA2010';
"""
)
print(
    f"\nbnia_indicators rows: {con.execute('SELECT COUNT(*) FROM bnia_indicators').fetchone()[0]}"
)

# ---------------------------------------------------------------------------
# Step 7 — Build and export csa_features
# ---------------------------------------------------------------------------
con.execute(
    """
CREATE OR REPLACE TABLE csa_features AS
SELECT
    e.csa2010,
    -- Eviction counts and denominators
    e.eviction_count,
    b.total_pop,      -- BNIA Vital Signs: census total population
    b.total_hh,       -- BNIA Vital Signs: census total households (occupied units)
    o.total_residential_properties,    -- SDAT: parcel count, USEGROUP IN (R,U,M,RC), all PERMHOME
    o.total_residential_units,         -- SDAT: sum of DWELUNIT, USEGROUP IN (R,U,M,RC), all PERMHOME
    b.bnia_total_residential_props,    -- BNIA Vital Signs: their residential property count (for comparison)
    o.total_rental_units,              -- SDAT: sum of DWELUNIT, USEGROUP IN (R,U,M,RC), PERMHOME IN (N,D)
                                       -- NOTE: USEGROUP='E' excluded, undercounts public housing
    ROUND(b.total_hh * (1.0 - b.pct_owner_occupied / 100.0), 0) AS renter_hh,
                                       -- BNIA-derived: total_hh * (1 - pct_owner_occupied), i.e. renter-occupied households
    -- Eviction rates
    ROUND(e.eviction_count * 1000.0 / NULLIF(b.total_pop, 0), 2)                                        AS eviction_rate_per_1k_residents,
    ROUND(e.eviction_count * 1000.0 / NULLIF(b.total_hh, 0), 2)                                         AS eviction_rate_per_1k_households,
    ROUND(e.eviction_count * 1000.0 / NULLIF(ROUND(b.total_hh * (1.0 - b.pct_owner_occupied / 100.0), 0), 0), 2) AS eviction_rate_per_1k_renter_hh,
    ROUND(e.eviction_count * 1000.0 / NULLIF(o.total_rental_units, 0), 2)                               AS eviction_rate_per_1k_rentals,
    -- Ownership concentration
    o.unique_owners, 
    o.ownership_concentration_pct,
    -- BNIA indicators
    b.pct_black_non_hisp, 
    b.pct_white_non_hisp, 
    b.pct_hispanic,
    b.median_hh_income, 
    b.pct_hh_income_under_25k, 
    b.pct_family_hh_poverty, 
    b.pct_children_poverty,
    b.pct_persons_snap, 
    b.pct_families_tanf,
    b.unemployment_rate, 
    b.pct_pop_16_64_unemployed,
    b.pct_owner_occupied, 
    b.pct_vacant_abandoned, 
    b.pct_cash_sales, 
    b.pct_tax_lien_sales,
    b.affordability_idx_rent, 
    b.housing_vouchers_per_1k, 
    b.pct_low_mod_income_tract,
    b.pct_adult_pop_parole_probation
FROM eviction_counts_by_csa e
LEFT JOIN ownership_concentration_by_csa o USING (csa2010)
LEFT JOIN bnia_indicators b ON e.csa2010 = b.csa2010;
"""
)

row_count = con.execute("SELECT COUNT(*) FROM csa_features").fetchone()[0]
assert row_count == 55, f"Expected 55 CSAs, got {row_count}"

con.execute(
    f"COPY csa_features TO '{OUTPUTS / 'csa_features.csv'}' (HEADER, DELIMITER ',')"
)
print(f"\ncsa_features: {row_count} rows written to outputs/csa_features.csv")
print(con.execute("SELECT * FROM csa_features LIMIT 5").df())
