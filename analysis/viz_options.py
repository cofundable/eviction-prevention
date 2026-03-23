"""
Generates visualization options for landlord warrant distribution.
Saves PNGs to outputs/viz_options/ for review.
"""

import pathlib
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import plotly.io as pio

ROOT  = pathlib.Path(__file__).parent
OUT   = ROOT / "outputs" / "viz_options"
OUT.mkdir(parents=True, exist_ok=True)

owners = pd.read_csv(ROOT / "outputs" / "owner_eviction_counts.csv")
owners["owner"] = owners["owner"].str.strip()
owners = owners.sort_values("eviction_count", ascending=False).reset_index(drop=True)
owners["rank"] = owners.index + 1
total = owners["eviction_count"].sum()
owners["pct_of_total"] = owners["eviction_count"] / total * 100

W, H = 960, 560
SCALE = 2
TEMPLATE = "plotly_white"
RED = "#c0392b"
DARK = "#2c3e50"
GREY = "#bdc3c7"

def save(fig, name):
    fig.update_layout(font=dict(size=14), title_font_size=17,
                      margin=dict(t=60, b=50, l=60, r=30))
    pio.write_image(fig, str(OUT / f"{name}.png"), width=W, height=H, scale=SCALE)
    print(f"  saved {name}.png")


# ---------------------------------------------------------------------------
# 1. Simple horizontal bar — top 20 by count
# ---------------------------------------------------------------------------
top20 = owners.head(20).copy()
top20["label"] = top20["owner"].str.title()

fig = px.bar(
    top20.sort_values("eviction_count"),
    x="eviction_count", y="label", orientation="h",
    template=TEMPLATE,
    labels={"eviction_count": "Warrants Filed (Dec 2024)", "label": ""},
    title="Top 20 Landlords by Eviction Warrant Count — December 2024",
    color="eviction_count",
    color_continuous_scale=["#fadbd8", RED],
)
fig.update_layout(
    height=H, coloraxis_showscale=False,
    margin=dict(t=60, l=260, b=50, r=80),
)
fig.update_traces(
    text=top20.sort_values("eviction_count")["eviction_count"],
    textposition="outside",
)
save(fig, "1a_bar_top20_count")

# Top 20 — % of total
fig = px.bar(
    top20.sort_values("pct_of_total"),
    x="pct_of_total", y="label", orientation="h",
    template=TEMPLATE,
    labels={"pct_of_total": "% of All December Warrants", "label": ""},
    title="Top 20 Landlords — Share of All Warrants (December 2024)",
    color="pct_of_total",
    color_continuous_scale=["#fadbd8", RED],
)
fig.update_layout(
    height=H, coloraxis_showscale=False,
    margin=dict(t=60, l=260, b=50, r=80),
)
fig.update_traces(
    text=top20.sort_values("pct_of_total")["pct_of_total"].map("{:.1f}%".format),
    textposition="outside",
)
save(fig, "1b_bar_top20_pct")


# ---------------------------------------------------------------------------
# 2. Lorenz curve
# ---------------------------------------------------------------------------
sorted_counts = owners["eviction_count"].sort_values().values
cum_warrants  = np.cumsum(sorted_counts) / total * 100
cum_landlords = np.arange(1, len(sorted_counts) + 1) / len(sorted_counts) * 100

# Annotate a few key points
key_points = {
    "Top 1%\n(11 landlords)\n19% of warrants":  (99, cum_warrants[int(0.99 * len(cum_warrants)) - 1]),
    "Top 10%\n54% of warrants": (90, cum_warrants[int(0.90 * len(cum_warrants)) - 1]),
    "Top 27%\n72% of warrants": (73, cum_warrants[int(0.73 * len(cum_warrants)) - 1]),
}

fig = go.Figure()
fig.add_trace(go.Scatter(
    x=cum_landlords, y=cum_warrants,
    mode="lines", name="Actual",
    line=dict(color=RED, width=3),
))
fig.add_trace(go.Scatter(
    x=[0, 100], y=[0, 100],
    mode="lines", name="Perfect equality",
    line=dict(color=GREY, width=2, dash="dash"),
))
for label, (x_pct, y_val) in key_points.items():
    fig.add_trace(go.Scatter(
        x=[100 - x_pct], y=[y_val],
        mode="markers", marker=dict(color=DARK, size=10),
        showlegend=False,
    ))
    fig.add_annotation(
        x=100 - x_pct, y=y_val,
        text=label.replace("\n", "<br>"),
        showarrow=True, arrowhead=2, arrowcolor=DARK,
        ax=40, ay=-40, font=dict(size=12), align="left",
    )
fig.update_layout(
    template=TEMPLATE,
    title="Lorenz Curve — Concentration of Eviction Warrants by Landlord",
    xaxis_title="Cumulative % of Landlords (least → most active)",
    yaxis_title="Cumulative % of Warrants",
    legend=dict(x=0.05, y=0.95),
    height=H,
)
save(fig, "2_lorenz_curve")


# ---------------------------------------------------------------------------
# 3. Log-scale rank plot
# ---------------------------------------------------------------------------
fig = go.Figure()

# Colour points by tier
tiers = pd.cut(
    owners["eviction_count"],
    bins=[0, 1, 4, 9, 19, owners["eviction_count"].max()],
    labels=["1 warrant (73%)", "2–4 warrants", "5–9 warrants", "10–19 warrants", "20+ warrants"],
)
colors_map = {
    "1 warrant (73%)":  "#bdc3c7",
    "2–4 warrants":     "#e8b4b8",
    "5–9 warrants":     "#e07b80",
    "10–19 warrants":   "#c0392b",
    "20+ warrants":     "#7b241c",
}
for tier_label, color in colors_map.items():
    mask = tiers == tier_label
    fig.add_trace(go.Scatter(
        x=owners.loc[mask, "rank"],
        y=owners.loc[mask, "eviction_count"],
        mode="markers",
        name=tier_label,
        marker=dict(color=color, size=7, opacity=0.85),
        text=owners.loc[mask, "owner"].str.title(),
        hovertemplate="%{text}<br>Rank: %{x}<br>Warrants: %{y}<extra></extra>",
    ))

# Threshold lines
for threshold, label, y_offset in [(5, "5+ warrants<br>10% of landlords<br>56% of warrants", 1.3),
                                    (10, "10+ warrants<br>5% of landlords<br>42% of warrants", 1.3),
                                    (20, "20+ warrants<br>1.7% of landlords<br>26% of warrants", 1.3)]:
    fig.add_hline(
        y=threshold, line_dash="dot", line_color=DARK, line_width=1.5,
        annotation_text=label,
        annotation_position="right",
        annotation_font_size=11,
    )

fig.update_yaxes(type="log", title="Warrants Filed (log scale)")
fig.update_xaxes(title="Landlord Rank (1 = most warrants)")
fig.update_layout(
    template=TEMPLATE,
    title="Landlord Rank vs. Warrant Count — December 2024",
    height=H,
    legend=dict(title="Tier", x=0.65, y=0.95),
)
save(fig, "3_log_rank_plot")


# ---------------------------------------------------------------------------
# 4. Pareto chart (bar + cumulative % line)
# ---------------------------------------------------------------------------
# Group into buckets for readability
buckets = [
    ("1",    owners[owners["eviction_count"] == 1]),
    ("2–4",  owners[owners["eviction_count"].between(2, 4)]),
    ("5–9",  owners[owners["eviction_count"].between(5, 9)]),
    ("10–19",owners[owners["eviction_count"].between(10, 19)]),
    ("20–49",owners[owners["eviction_count"].between(20, 49)]),
    ("50+",  owners[owners["eviction_count"] >= 50]),
]
pareto = pd.DataFrame([
    {"bucket": b, "landlords": len(g), "warrants": g["eviction_count"].sum()}
    for b, g in buckets
])
pareto["pct_warrants"]   = pareto["warrants"] / total * 100
pareto["pct_landlords"]  = pareto["landlords"] / len(owners) * 100
pareto["cum_pct"]        = pareto["pct_warrants"].cumsum()

fig = go.Figure()
fig.add_trace(go.Bar(
    x=pareto["bucket"], y=pareto["pct_warrants"],
    name="% of all warrants",
    marker_color=RED, opacity=0.85,
    text=pareto.apply(lambda r: f"{r['pct_warrants']:.0f}%<br>({r['landlords']} landlords)", axis=1),
    textposition="outside",
))
fig.add_trace(go.Scatter(
    x=pareto["bucket"], y=pareto["cum_pct"],
    name="Cumulative % of warrants",
    mode="lines+markers",
    line=dict(color=DARK, width=2.5),
    marker=dict(size=8),
    yaxis="y2",
))
fig.update_layout(
    template=TEMPLATE,
    title="Eviction Warrants by Landlord Activity Tier — December 2024",
    xaxis_title="Warrants Filed per Landlord",
    yaxis=dict(title="% of All Warrants", range=[0, 90]),
    yaxis2=dict(title="Cumulative %", overlaying="y", side="right",
                range=[0, 110], showgrid=False),
    legend=dict(x=0.35, y=0.95),
    height=H,
    bargap=0.25,
)
save(fig, "4_pareto_chart")


# ---------------------------------------------------------------------------
# 5. Stacked concentration bar (single bar)
# ---------------------------------------------------------------------------
segments = [
    ("Top 1 landlord",    owners.head(1)["eviction_count"].sum(),   "#7b241c"),
    ("Top 2–20",          owners.iloc[1:20]["eviction_count"].sum(), "#c0392b"),
    ("Top 21–100",        owners.iloc[20:100]["eviction_count"].sum(),"#e07b80"),
    ("Remaining 963",     owners.iloc[100:]["eviction_count"].sum(), "#bdc3c7"),
]
seg_df = pd.DataFrame(segments, columns=["group", "warrants", "color"])
seg_df["pct"] = seg_df["warrants"] / total * 100

fig = go.Figure()
for _, row in seg_df.iterrows():
    fig.add_trace(go.Bar(
        x=[row["pct"]], y=["All warrants"],
        orientation="h", name=row["group"],
        marker_color=row["color"],
        text=f"<b>{row['pct']:.0f}%</b><br>{row['group']}<br>({row['warrants']} warrants)",
        textposition="inside",
        insidetextanchor="middle",
        textfont=dict(color="white", size=13),
    ))
fig.update_layout(
    template=TEMPLATE,
    title="Who Files Eviction Warrants? Concentration by Landlord Tier — December 2024",
    barmode="stack",
    xaxis=dict(title="% of All Warrants", range=[0, 100]),
    yaxis=dict(showticklabels=False),
    showlegend=True,
    legend=dict(orientation="h", y=-0.18, x=0),
    height=320,
)
save(fig, "5_stacked_concentration_bar")


print(f"\nDone — {len(list(OUT.glob('*.png')))} PNGs in {OUT}")
