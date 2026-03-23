<script lang="ts">
  import {
    activeMetric,
    selectedCsa,
    METRIC_LABELS,
  } from "../stores/dashboard";
  import type { MetricKey } from "../lib/types";

  const metrics: MetricKey[] = [
    "eviction_rate_per_1k_residents",
    "median_hh_income",
    "pct_black_non_hisp",
    "ownership_concentration_pct",
  ];
</script>

<div class="sticky-bar">
  <!-- Row 1: controls -->
  <div class="controls-row">
    <!-- Desktop: tab buttons -->
    <div class="metric-tabs" role="tablist" aria-label="Map metric">
      {#each metrics as metric (metric)}
        <button
          role="tab"
          aria-selected={$activeMetric === metric}
          class:active={$activeMetric === metric}
          onclick={() => activeMetric.set(metric)}
        >
          {METRIC_LABELS[metric]}
        </button>
      {/each}
    </div>

    <!-- Mobile: select dropdown -->
    <select
      class="metric-select"
      aria-label="Map metric"
      value={$activeMetric}
      onchange={(e) =>
        activeMetric.set(
          (e.currentTarget as HTMLSelectElement).value as MetricKey
        )}
    >
      {#each metrics as metric (metric)}
        <option value={metric}>{METRIC_LABELS[metric]}</option>
      {/each}
    </select>

    <!-- Desktop: selected CSA (inline with tabs) -->
    {#if $selectedCsa}
      <div class="selected-csa selected-csa--desktop">
        <span class="selected-csa__label">Selected:</span>
        <span class="selected-csa__name">{$selectedCsa}</span>
        <button
          class="selected-csa__clear"
          onclick={() => selectedCsa.set(null)}
          aria-label="Clear selection"
        >
          ✕
        </button>
      </div>
    {/if}
  </div>

  <!-- Row 2 (mobile only): selected CSA below the dropdown -->
  {#if $selectedCsa}
    <div class="selected-csa selected-csa--mobile">
      <span class="selected-csa__label">Selected:</span>
      <span class="selected-csa__name">{$selectedCsa}</span>
      <button
        class="selected-csa__clear"
        onclick={() => selectedCsa.set(null)}
        aria-label="Clear selection"
      >
        ✕
      </button>
    </div>
  {/if}
</div>

<style>
  .sticky-bar {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: var(--space-3) var(--space-6);
  }

  .controls-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  /* Desktop tabs */
  .metric-tabs {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    flex: 1;
  }

  .metric-select {
    display: none;
  }

  button {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-sm);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast);
  }

  button:hover {
    background: var(--color-amber-50);
    border-color: var(--color-amber-400);
    color: var(--color-text-heading);
  }

  button.active {
    background: var(--color-amber-500);
    border-color: var(--color-amber-500);
    color: white;
    font-weight: var(--font-weight-semibold);
  }

  .selected-csa {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .selected-csa__label {
    color: var(--color-text-muted);
  }

  .selected-csa__name {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-heading);
  }

  .selected-csa__clear {
    padding: 2px var(--space-2);
    font-size: var(--text-xs);
    border-color: var(--color-border-subtle);
    color: var(--color-text-muted);
    background: transparent;
  }

  .selected-csa__clear:hover {
    background: var(--color-surface-alt);
    border-color: var(--color-border);
    color: var(--color-text-primary);
  }

  /* Mobile-only row is hidden on desktop */
  .selected-csa--mobile {
    display: none;
  }

  /* Mobile */
  @media (max-width: 640px) {
    .sticky-bar {
      padding: var(--space-3) var(--space-4);
    }

    .metric-tabs {
      display: none;
    }

    .metric-select {
      display: block;
      flex: 1;
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-sm);
      background: var(--color-surface);
      color: var(--color-text-heading);
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
    }

    /* Hide inline desktop version, show stacked mobile version */
    .selected-csa--desktop {
      display: none;
    }

    .selected-csa--mobile {
      display: flex;
      white-space: normal;
      border-top: 1px solid var(--color-border-subtle);
      margin-top: var(--space-2);
      padding-top: var(--space-2);
    }
  }
</style>
