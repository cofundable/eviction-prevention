<script lang="ts">
  import { activeMetric, METRIC_LABELS } from "../stores/dashboard";
  import type { MetricKey } from "../lib/types";

  const metrics: MetricKey[] = [
    "eviction_rate_per_1k_residents",
    "median_hh_income",
    "pct_black_non_hisp",
    "ownership_concentration_pct",
  ];
</script>

<div class="metric-tabs" role="tablist" aria-label="Map metric">
  {#each metrics as metric}
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

<style>
  .metric-tabs {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
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
</style>
