<script lang="ts">
  import {
    selectedCsa,
    selectedCsaData,
    selectedCsaLandlords,
  } from "../stores/dashboard";
  import type { LandlordRow } from "../lib/types";

  let loadingLandlords = false;

  selectedCsa.subscribe(async (csa) => {
    if (!csa) {
      selectedCsaLandlords.set([]);
      return;
    }
    loadingLandlords = true;
    try {
      const res = await fetch(`/api/csa/${encodeURIComponent(csa)}`);
      const data = await res.json();
      selectedCsaLandlords.set(data.top_landlords ?? []);
    } finally {
      loadingLandlords = false;
    }
  });

  function fmt(val: number | null | undefined, decimals = 1): string {
    if (val === null || val === undefined || isNaN(val)) return "—";
    return val.toFixed(decimals);
  }
  function fmtDollar(val: number | null | undefined): string {
    if (val === null || val === undefined || isNaN(val)) return "—";
    return `$${Math.round(val).toLocaleString()}`;
  }
  function fmtPct(val: number | null | undefined): string {
    return val != null ? `${fmt(val)}%` : "—";
  }
</script>

<div class="panel">
  {#if !$selectedCsa}
    <div class="panel__empty">
      <p>Click a neighborhood on the map to explore its data.</p>
    </div>
  {:else if $selectedCsaData}
    {@const d = $selectedCsaData}
    <h2 class="panel__title">{d.csa}</h2>

    <div class="metrics-grid">
      <div class="metric-tile">
        <span class="metric-tile__label">Warrant rate</span>
        <span class="metric-tile__value">{fmt(d.eviction_rate_per_1k_residents)}</span>
        <span class="metric-tile__unit">per 1k residents</span>
      </div>
      <div class="metric-tile">
        <span class="metric-tile__label">Median income</span>
        <span class="metric-tile__value">{fmtDollar(d.median_hh_income)}</span>
      </div>
      <div class="metric-tile">
        <span class="metric-tile__label">% Black residents</span>
        <span class="metric-tile__value">{fmtPct(d.pct_black_non_hisp)}</span>
      </div>
      <div class="metric-tile">
        <span class="metric-tile__label">Ownership concentration</span>
        <span class="metric-tile__value">{fmtPct(d.ownership_concentration_pct)}</span>
        <span class="metric-tile__unit">top-10 owner share</span>
      </div>
    </div>

    <div class="landlords">
      <h3 class="landlords__heading">Top Landlords by Warrants Filed</h3>
      {#if loadingLandlords}
        <p class="landlords__loading">Loading...</p>
      {:else if $selectedCsaLandlords.length === 0}
        <p class="landlords__empty">No landlord data available.</p>
      {:else}
        <table class="landlords__table">
          <thead>
            <tr>
              <th>Landlord</th>
              <th>Warrants</th>
              <th>Evictions</th>
              <th>Rate</th>
            </tr>
          </thead>
          <tbody>
            {#each $selectedCsaLandlords as row}
              <tr>
                <td class="landlords__name">{row.plaintiff}</td>
                <td>{row.warrant_count}</td>
                <td>{row.eviction_count}</td>
                <td>
                  {row.warrant_count > 0
                    ? `${((row.eviction_count / row.warrant_count) * 100).toFixed(0)}%`
                    : "—"}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {/if}
</div>

<style>
  .panel {
    height: 100%;
    overflow-y: auto;
    padding: var(--space-6);
    background: var(--color-surface);
    border-left: 1px solid var(--color-border);
  }

  .panel__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 200px;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    text-align: center;
  }

  .panel__title {
    font-size: var(--text-xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-heading);
    margin-bottom: var(--space-6);
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
    margin-bottom: var(--space-8);
  }

  .metric-tile {
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .metric-tile__label {
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }

  .metric-tile__value {
    font-size: var(--text-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-amber-700);
    line-height: 1;
  }

  .metric-tile__unit {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
  }

  .landlords__heading {
    font-size: var(--text-base);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-heading);
    margin-bottom: var(--space-4);
  }

  .landlords__loading,
  .landlords__empty {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .landlords__table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .landlords__table th {
    text-align: left;
    font-weight: var(--font-weight-semibold);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border);
  }

  .landlords__table td {
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border-subtle);
    color: var(--color-text-primary);
    vertical-align: top;
  }

  .landlords__name {
    font-weight: var(--font-weight-medium);
    padding-right: var(--space-4);
  }
</style>
