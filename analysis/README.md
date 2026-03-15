# CSA Feature Table Pipeline

Python ETL pipeline that reads from `evictions.db` (read-only) and produces a
CSA-level feature table for analysis.

## Setup

```bash
cd analysis
uv sync
```

## Required input files

Place the following in `data/raw/` (gitignored):

| File | Source |
|---|---|
| `tract_to_csa.csv` | BNIA — bniajfi.org |
| `bnia_indicators.tsv` | BNIA Vital Signs (tab-delimited, column-mapped) |
| `real_property.geojson` | Maryland SDAT / Baltimore Open Data |
| `Community_Statistical_Areas.geojson` | BNIA / Baltimore Open Data |

## Run

```bash
cd analysis
uv run python etl/run.py
```

Output: `outputs/csa_features.csv` (55 rows, one per Baltimore CSA)

## Coverage notes

- `warrant_filings` is the authoritative source of truth for eviction counts.
- Only warrants with a matching scraped case, a geocoded tenant address, and a
  tract-to-CSA mapping can be CSA-assigned. Unassigned warrants are reported at
  runtime — counts per CSA are lower-bound estimates.
- LLC fragmentation means ownership concentration figures undercount true
  concentration.
