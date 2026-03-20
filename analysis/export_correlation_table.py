"""
Generates 09_correlation_table.png — 4-row × 3-col Pearson correlation table.

Rows: % Black non-Hispanic, Median HH Income, % Low-Income HH, Ownership Concentration
Cols: Eviction Warrants (Dec 2024) | Actual Evictions (Dec 2024) | BNIA Evictions (2023)
"""

import pathlib
import duckdb
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from scipy import stats

ROOT = pathlib.Path(__file__).parent
OUT  = ROOT / "outputs" / "viz_options"
OUT.mkdir(parents=True, exist_ok=True)
DATA = ROOT.parent / "data"
DB   = ROOT.parent / "evictions.db"

# ---------------------------------------------------------------------------
# Load CSA features + BNIA eviction rate
# ---------------------------------------------------------------------------
df = pd.read_csv(ROOT / "outputs" / "csa_features.csv")
df["csa2010"] = df["csa2010"].str.strip()

bnia = pd.read_csv(DATA / "bnia_evictions.csv")
bnia["csa2010"] = bnia["CSA2010"].str.strip()
df = df.merge(bnia[["csa2010", "evict23"]], on="csa2010", how="left")
df = df.rename(columns={"evict23": "bnia_eviction_rate"})

# ---------------------------------------------------------------------------
# Actual Dec 2024 eviction rate per CSA (via evictions.db)
# ---------------------------------------------------------------------------
con = duckdb.connect(str(DB), read_only=True)

actual_evictions = con.execute("""
    SELECT c.case_number
    FROM case_events ce
    JOIN cases c ON ce.case_id = c.id
    JOIN warrant_filings w ON w.case_number = c.case_number
    WHERE ce.event_type = 'Warrant of Restitution - Return of Service - Evicted'
      AND strftime(w.event_date::DATE, '%Y-%m') = '2024-12'
""").df()

addresses_df = con.execute("""
    SELECT DISTINCT cp.case_id, a.census_tract
    FROM case_parties cp
    JOIN addresses a ON cp.address_id = a.id
    WHERE cp.party_type = 'tenant'
      AND a.geocode_match_status = 'Match'
      AND a.census_tract IS NOT NULL
""").df()

cases_df = con.execute("""
    SELECT c.id AS case_id, c.case_number
    FROM cases c
    JOIN warrant_filings w ON w.case_number = c.case_number
    WHERE strftime(w.event_date::DATE, '%Y-%m') = '2024-12'
""").df()

con.close()

tract_csa = pd.read_csv(ROOT / "data" / "tract_to_csa.csv", encoding="utf-8-sig")
tract_csa = tract_csa.rename(columns={
    "GEOID_Tract_2020": "geoid",
    "Community_Statistical_Area_2010": "csa2010",
})
tract_csa["csa2010"] = tract_csa["csa2010"].str.strip()
tract_csa["geoid"]   = tract_csa["geoid"].astype(str).str.zfill(11)

addr_cases = addresses_df.merge(cases_df, on="case_id", how="inner")
addr_cases["geoid"] = "24510" + addr_cases["census_tract"].astype(str).str.zfill(6)
addr_cases = addr_cases.merge(tract_csa[["geoid", "csa2010"]], on="geoid", how="left")

evicted_set = set(actual_evictions["case_number"])
addr_cases["evicted"] = addr_cases["case_number"].isin(evicted_set).astype(int)

csa_actual = (
    addr_cases.groupby("csa2010")
    .agg(evicted_count=("evicted", "sum"), total_cases=("case_number", "nunique"))
    .reset_index()
)
csa_actual = csa_actual.merge(df[["csa2010", "total_pop"]], on="csa2010", how="left")
csa_actual["actual_eviction_rate_per_1k"] = (
    csa_actual["evicted_count"] / csa_actual["total_pop"] * 1000
)

df = df.merge(csa_actual[["csa2010", "actual_eviction_rate_per_1k"]], on="csa2010", how="left")

# ---------------------------------------------------------------------------
# Compute Pearson correlations
# ---------------------------------------------------------------------------
def pearson(x_col, y_col):
    sub = df[[x_col, y_col]].dropna()
    if len(sub) < 3:
        return None, None
    r, p = stats.pearsonr(sub[x_col], sub[y_col])
    return r, p

ROWS = [
    ("% Black, non-Hispanic",   "pct_black_non_hisp"),
    ("Median household income", "median_hh_income"),
    ("% Low-income households", "pct_hh_income_under_25k"),
    ("Ownership concentration", "ownership_concentration_pct"),
]

COLS = [
    ("Eviction Warrants\n(Dec 2024)",  "eviction_rate_per_1k_residents"),
    ("Actual Evictions\n(Dec 2024)",   "actual_eviction_rate_per_1k"),
    ("BNIA Evictions\n(2023)",         "bnia_eviction_rate"),
]

table_data = []
for _, row_feat in ROWS:
    row = []
    for _, col_feat in COLS:
        r, p = pearson(row_feat, col_feat)
        sig  = (p is not None) and (p < 0.05)
        row.append((r, p, sig))
    table_data.append(row)

# Print for verification
print("\nCorrelation table:")
for (rl, _), row in zip(ROWS, table_data):
    vals = []
    for r, p, sig in row:
        if r is None:
            vals.append("—")
        else:
            vals.append(f"r={r:+.2f} p={p:.3f}{'*' if sig else ''}")
    print(f"  {rl:<28} {' | '.join(vals)}")

# ---------------------------------------------------------------------------
# Draw table
# ---------------------------------------------------------------------------
AMBER      = "#ebab00"
AMBER_DARK = "#b88500"
BLUE       = "#2471a3"
BLUE_DARK  = "#1a5276"

HEADER_BG  = ["#c48a00", BLUE, BLUE]
HEADER_FG  = ["white", "white", "white"]
SIG_BG     = ["#fde8a0", "#eaf4fb", "#eaf4fb"]
SIG_FG     = ["#7a5900", BLUE_DARK, BLUE_DARK]
NSIG_FG    = "#444444"

n_rows = len(ROWS)
n_cols = len(COLS)

# Layout (axes-fraction units)
LABEL_W  = 0.30
DATA_W   = [0.235, 0.235, 0.23]
HEADER_H = 0.20
ROW_H    = 0.16
PAD_TOP  = 0.04   # small gap at top for suptitle

FIG_W = 9
FIG_H = 4.2

fig, ax = plt.subplots(figsize=(FIG_W, FIG_H))
ax.set_xlim(0, 1)
ax.set_ylim(0, 1)
ax.axis("off")

# Column x boundaries
col_x = [0.0]
col_x.append(col_x[-1] + LABEL_W)
for w in DATA_W:
    col_x.append(col_x[-1] + w)

total_h   = HEADER_H + n_rows * ROW_H
scale     = (1 - PAD_TOP) / total_h   # scale to fit in [0, 1-PAD_TOP]
hdr_h_s   = HEADER_H * scale
row_h_s   = ROW_H * scale

def cell(ax, x, y_top, w, h, text,
         bg="white", fg="black", bold=False, fs=9.5):
    """Draw a cell with top-left at (x, y_top) in axes coords."""
    rect = plt.Rectangle((x, y_top - h), w, h,
                          facecolor=bg, edgecolor="#bbbbbb", linewidth=0.6,
                          transform=ax.transAxes, clip_on=False)
    ax.add_patch(rect)
    ax.text(x + w / 2, y_top - h / 2, text,
            ha="center", va="center", fontsize=fs,
            fontweight="bold" if bold else "normal",
            color=fg, transform=ax.transAxes, clip_on=False,
            linespacing=1.4)

y_cursor = 1.0 - PAD_TOP   # start just below the top

# Header row
cell(ax, col_x[0], y_cursor, LABEL_W, hdr_h_s, "",
     bg="#f2f2f2")
for ci, (col_label, _) in enumerate(COLS):
    cell(ax, col_x[ci + 1], y_cursor, DATA_W[ci], hdr_h_s, col_label,
         bg=HEADER_BG[ci], fg=HEADER_FG[ci], bold=True, fs=11)

y_cursor -= hdr_h_s

# Data rows
for ri, (row_label, _) in enumerate(ROWS):
    row_bg = "#f7f7f7" if ri % 2 == 0 else "white"

    cell(ax, col_x[0], y_cursor, LABEL_W, row_h_s,
         row_label, bg=row_bg, fg="#222222", fs=9.5)

    for ci in range(n_cols):
        r, p, sig = table_data[ri][ci]
        if r is None:
            text  = "—"
            fg    = NSIG_FG
            bg    = row_bg
            bold  = False
        elif sig:
            sign  = "+" if r >= 0 else "−"
            p_str = "p<0.001" if p < 0.001 else f"p={p:.3f}"
            text  = f"{sign}{abs(r):.2f}\n{p_str}"
            fg    = SIG_FG[ci]
            bg    = SIG_BG[ci]
            bold  = True
        else:
            sign  = "+" if r >= 0 else "−"
            text  = f"{sign}{abs(r):.2f}\nn.s."
            fg    = NSIG_FG
            bg    = row_bg
            bold  = False

        cell(ax, col_x[ci + 1], y_cursor, DATA_W[ci], row_h_s,
             text, bg=bg, fg=fg, bold=bold, fs=9.5)

    y_cursor -= row_h_s

# Outer border
outer = plt.Rectangle((col_x[0], y_cursor), sum(DATA_W) + LABEL_W, 1 - PAD_TOP - y_cursor,
                       facecolor="none", edgecolor="#999999", linewidth=1.0,
                       transform=ax.transAxes, clip_on=False)
ax.add_patch(outer)

fig.suptitle("What Predicts Eviction Depends on How You Measure It",
             fontsize=12, fontweight="bold", x=0.02, ha="left", y=0.99)

fig.tight_layout(pad=0.3)
path = OUT / "09_correlation_table.png"
fig.savefig(path, dpi=300, bbox_inches="tight", facecolor="white")
plt.close(fig)
print(f"\n  saved {path.name}")
