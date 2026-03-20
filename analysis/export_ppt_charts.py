"""
Export warrant vs. BNIA eviction comparison charts as PNGs for PowerPoint.

Each chart is sized for a half-slide (16:9 split): 900x560px.
Font sizes are bumped up for readability when printed at ~3.5" wide.
Outputs go to outputs/ppt_charts/.
"""

import pathlib
import json
import pandas as pd
import geopandas as gpd
import plotly.express as px
import plotly.io as pio
from scipy import stats

ROOT   = pathlib.Path(__file__).parent
DATA   = ROOT.parent / "data"
OUT    = ROOT / "outputs" / "ppt_charts"
OUT.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Load data
# ---------------------------------------------------------------------------
df = pd.read_csv(ROOT / "outputs" / "csa_features.csv")
df["csa2010"] = df["csa2010"].str.strip()

bnia = pd.read_csv(DATA / "bnia_evictions.csv")
bnia["csa2010"] = bnia["CSA2010"].str.strip()
df = df.merge(bnia[["csa2010", "evict23"]], on="csa2010", how="left")
df = df.rename(columns={"evict23": "bnia_eviction_rate"})

CSA_RENAME = {
    "Greater Lauraville":      "Lauraville",
    "Orchard Ridge/Armistead": "Claremont/Armistead",
    "Pigtown/Carroll Park":    "Washington Village/Pigtown",
    "Oliver/Johnston Square":  "Greenmount East",
    "Hampden/Remington":       "Medfield/Hampden/Woodberry/Remington",
    "Greektown/Bayview":       "Orangeville/East Highlandtown",
    "Hamilton Hills":          "Harford/Echodale",
}
gdf = gpd.read_file(DATA / "Community_Statistical_Areas.geojson")
gdf["csa2010"] = gdf["CSA2020"].map(lambda x: CSA_RENAME.get(x, x) if x else x)
gdf = gdf.merge(df, on="csa2010", how="left")

geo_dict = json.loads(gdf[["csa2010", "geometry"]].to_json())
for feature, row in zip(geo_dict["features"], gdf.itertuples()):
    feature["id"] = row.csa2010

# ---------------------------------------------------------------------------
# Shared settings
# ---------------------------------------------------------------------------
W, H       = 900, 560          # half-slide width, 16:9
FONT_SIZE  = 15                # base axis/tick font
TITLE_SIZE = 17
MAP_CENTER = {"lat": 39.2904, "lon": -76.6122}
MAPBOX     = "carto-positron"
COLOR_SEQ  = px.colors.sequential.Reds
WARRANT_C  = "#c0392b"
BNIA_C     = "#2980b9"
TEMPLATE   = "plotly_white"

LAYOUT_BASE = dict(
    width=W, height=H,
    margin=dict(t=55, b=45, l=55, r=30),
    font=dict(size=FONT_SIZE),
    title_font_size=TITLE_SIZE,
)
MAP_LAYOUT = dict(
    width=W, height=H,
    margin=dict(t=55, b=5, l=5, r=5),
    font=dict(size=FONT_SIZE),
    title_font_size=TITLE_SIZE,
)


def save(fig, name, is_map=False):
    fig.update_layout(**(MAP_LAYOUT if is_map else LAYOUT_BASE))
    path = OUT / f"{name}.png"
    pio.write_image(fig, str(path), scale=2)   # scale=2 → 1800x1120 retina
    print(f"  saved {path.name}")


def pearson_label(x, y):
    sub = df[[x, y]].dropna()
    r, p = stats.pearsonr(sub[x], sub[y])
    sig = "***" if p < 0.001 else "**" if p < 0.01 else "*" if p < 0.05 else "(n.s.)"
    return f"Pearson r = {r:.2f}, p = {p:.4f} {sig}  (n = {len(sub)})"


# ---------------------------------------------------------------------------
# Choropleths
# ---------------------------------------------------------------------------
print("Choropleths...")

fig = px.choropleth_mapbox(
    gdf, geojson=geo_dict, locations="csa2010",
    color="eviction_rate_per_1k_residents",
    color_continuous_scale=COLOR_SEQ,
    mapbox_style=MAPBOX, center=MAP_CENTER, zoom=10,
    opacity=0.75, hover_name="csa2010",
    labels={"eviction_rate_per_1k_residents": "Warrants per 1k res."},
)
fig.update_layout(
    title="Eviction Warrant Rate (Dec 2024, per 1,000 Residents)",
    coloraxis_colorbar=dict(title="Warrants<br>per 1k res.", title_font_size=13),
)
save(fig, "01_map_warrants", is_map=True)

fig = px.choropleth_mapbox(
    gdf, geojson=geo_dict, locations="csa2010",
    color="bnia_eviction_rate",
    color_continuous_scale=COLOR_SEQ,
    mapbox_style=MAPBOX, center=MAP_CENTER, zoom=10,
    opacity=0.75, hover_name="csa2010",
    labels={"bnia_eviction_rate": "Evictions per 1k res."},
)
fig.update_layout(
    title="Actual Eviction Rate (BNIA 2023, per 1,000 Residents)",
    coloraxis_colorbar=dict(title="Evictions<br>per 1k res.", title_font_size=13),
)
save(fig, "02_map_bnia", is_map=True)

# ---------------------------------------------------------------------------
# Scatter pairs
# ---------------------------------------------------------------------------
PAIRS = [
    ("ownership_concentration_pct", "Top-10-Owner Share of Rental Units (%)",  "03", WARRANT_C, BNIA_C),
    ("median_hh_income",            "Median Household Income ($)",              "04", WARRANT_C, BNIA_C),
    ("pct_black_non_hisp",          "% Black (non-Hispanic) Residents",         "05", WARRANT_C, BNIA_C),
    ("unemployment_rate",           "Unemployment Rate (%)",                    "06", WARRANT_C, BNIA_C),
]

for feat, feat_label, prefix, wc, bc in PAIRS:
    print(f"Scatters: {feat}...")

    # Warrant rate
    fig = px.scatter(
        df, x=feat, y="eviction_rate_per_1k_residents",
        hover_name="csa2010", trendline="ols", template=TEMPLATE,
        labels={feat: feat_label,
                "eviction_rate_per_1k_residents": "Warrants per 1,000 Residents"},
        title=f"{feat_label}<br><sup>vs. Warrant Filing Rate (Dec 2024)</sup>",
    )
    fig.update_traces(marker=dict(size=9, opacity=0.75, color=wc),
                      selector=dict(mode="markers"))
    fig.add_annotation(
        text=pearson_label(feat, "eviction_rate_per_1k_residents"),
        xref="paper", yref="paper", x=0.01, y=0.99,
        showarrow=False, font=dict(size=12, color="#555"),
        align="left", xanchor="left", yanchor="top",
    )
    save(fig, f"{prefix}_warrant_{feat}")

    # BNIA rate
    fig = px.scatter(
        df, x=feat, y="bnia_eviction_rate",
        hover_name="csa2010", trendline="ols", template=TEMPLATE,
        labels={feat: feat_label,
                "bnia_eviction_rate": "Actual Evictions per 1,000 Residents"},
        title=f"{feat_label}<br><sup>vs. Actual Eviction Rate (BNIA 2023)</sup>",
    )
    fig.update_traces(marker=dict(size=9, opacity=0.75, color=bc),
                      selector=dict(mode="markers"))
    fig.add_annotation(
        text=pearson_label(feat, "bnia_eviction_rate"),
        xref="paper", yref="paper", x=0.01, y=0.99,
        showarrow=False, font=dict(size=12, color="#555"),
        align="left", xanchor="left", yanchor="top",
    )
    save(fig, f"{prefix}_bnia_{feat}")

print(f"\nDone — {len(list(OUT.glob('*.png')))} PNGs in {OUT}")
