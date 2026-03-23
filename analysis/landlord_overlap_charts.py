"""
Two stacked bar charts showing top warrant filers vs. top evictors.

Each bar = total warrants filed, split into:
  - Warrants that resulted in an actual eviction (dark amber)
  - Warrants that did NOT result in an eviction (light amber)

Chart 1: ranked by total warrants filed (top 10)
Chart 2: ranked by actual evictions executed (top 10)

Goal: illustrate that filing many warrants rarely translates to evictions.
Outputs go to outputs/viz_options/.
"""

import pathlib
import duckdb
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

ROOT   = pathlib.Path(__file__).parent
OUT    = ROOT / "outputs" / "viz_options"
OUT.mkdir(parents=True, exist_ok=True)
DB     = ROOT.parent / "evictions.db"

# ---------------------------------------------------------------------------
# Query both datasets (consistent naming via case_parties party_type='landlord')
# ---------------------------------------------------------------------------
con = duckdb.connect(str(DB), read_only=True)

warrants_df = con.execute("""
    SELECT
        UPPER(TRIM(cp.name)) AS landlord,
        COUNT(DISTINCT w.case_number) AS warrants
    FROM warrant_filings w
    JOIN cases c          ON w.case_number = c.case_number
    JOIN case_parties cp  ON cp.case_id = c.id
                         AND cp.party_type = 'landlord'
    WHERE strftime(w.event_date::DATE, '%Y-%m') = '2024-12'
    GROUP BY 1
    ORDER BY 2 DESC
""").df()

evictions_df = con.execute("""
    SELECT
        UPPER(TRIM(cp.name)) AS landlord,
        COUNT(DISTINCT ce.case_id) AS evictions
    FROM case_events ce
    JOIN cases c          ON ce.case_id = c.id
    JOIN case_parties cp  ON cp.case_id = c.id
                         AND cp.party_type = 'landlord'
    JOIN warrant_filings w ON w.case_number = c.case_number
    WHERE ce.event_type = 'Warrant of Restitution - Return of Service - Evicted'
      AND strftime(w.event_date::DATE, '%Y-%m') = '2024-12'
    GROUP BY 1
    ORDER BY 2 DESC
""").df()

con.close()

# Merge to get both counts for every landlord
merged = warrants_df.merge(evictions_df, on="landlord", how="outer").fillna(0)
merged["warrants"]   = merged["warrants"].astype(int)
merged["evictions"]  = merged["evictions"].astype(int)
merged["not_evicted"] = merged["warrants"] - merged["evictions"]

top20_warrants  = merged.nlargest(20, "warrants").reset_index(drop=True)

# ---------------------------------------------------------------------------
# Shared style
# ---------------------------------------------------------------------------
AMBER_DARK  = "#b88500"   # evicted segment
AMBER_LIGHT = "#f5cf60"   # not evicted segment
BG          = "white"
TITLE_FS    = 13
LABEL_FS    = 10
TICK_FS     = 9
ANNOT_FS    = 8.5


def clean_name(s):
    """Title-case and trim duplicate suffixes (e.g. 'Foo Llc Foo' → 'Foo Llc')."""
    return s.title()


def make_stacked_chart(df, filename, title, subtitle):
    labels      = [clean_name(n) for n in df["landlord"]]
    evicted     = df["evictions"].tolist()
    not_evicted = df["not_evicted"].tolist()
    warrants    = df["warrants"].tolist()
    n           = len(labels)

    # Reverse so highest is at top
    labels      = labels[::-1]
    evicted     = evicted[::-1]
    not_evicted = not_evicted[::-1]
    warrants    = warrants[::-1]

    y      = np.arange(n)
    height = 0.72

    fig, ax = plt.subplots(figsize=(10, 5.8), facecolor=BG)
    ax.set_facecolor(BG)

    # Stacked: not-evicted first (left), then evicted on top
    ax.barh(y, not_evicted, height=height, color=AMBER_LIGHT,
            label="Warrant filed — no eviction", zorder=3)
    ax.barh(y, evicted, height=height, left=not_evicted, color=AMBER_DARK,
            label="Warrant filed — eviction executed", zorder=3)

    # Total label at end of each bar
    xmax = max(warrants, default=1)
    for i, (total, ev) in enumerate(zip(warrants, evicted)):
        pct = ev / total * 100 if total > 0 else 0
        ax.text(total + xmax * 0.01, y[i],
                f"{total}  ({ev} evicted, {pct:.0f}%)",
                va="center", ha="left", fontsize=ANNOT_FS, color="#555")

    ax.set_yticks(y)
    ax.set_yticklabels(labels, fontsize=TICK_FS)
    ax.set_xlabel("Warrants Filed (December 2024)", fontsize=LABEL_FS)
    ax.set_xlim(0, xmax * 1.45)
    ax.spines[["top", "right", "left"]].set_visible(False)
    ax.tick_params(axis="x", labelsize=TICK_FS)
    ax.xaxis.grid(True, linestyle="--", alpha=0.4, zorder=0)
    ax.set_axisbelow(True)

    ax.legend(fontsize=LABEL_FS, loc="lower right",
              framealpha=0.9, edgecolor="#ccc")

    fig.suptitle(title, fontsize=TITLE_FS, fontweight="bold", x=0.02, ha="left")
    ax.set_title(subtitle, fontsize=9, color="#666", loc="left", pad=4)

    fig.tight_layout(rect=[0, 0, 1, 0.97])
    path = OUT / filename
    fig.savefig(path, dpi=300, bbox_inches="tight", facecolor=BG)
    plt.close(fig)
    print(f"  saved {path.name}")


# ---------------------------------------------------------------------------
# Chart: Top 20 by warrants
# ---------------------------------------------------------------------------
make_stacked_chart(
    top20_warrants,
    filename="6_top20_by_warrants.png",
    title="Top 20 Landlords by Eviction Warrants Filed — December 2024",
    subtitle="Light = no eviction followed. Dark = eviction executed.",
)

print(f"\nDone — charts saved to {OUT}")
