<script lang="ts">
  import { onMount } from "svelte";
  import * as Plot from "@observablehq/plot";

  interface Props {
    concentrationData: { tier: string; pct: number; color: string }[];
    top20Data: {
      plaintiff: string;
      evictions: number;
      not_evicted: number;
      total: number;
    }[];
  }

  let { concentrationData, top20Data }: Props = $props();

  let concentrationContainer: HTMLDivElement;
  let barContainer: HTMLDivElement;

  function renderConcentration() {
    if (!concentrationContainer || !concentrationData.length) return;
    concentrationContainer.innerHTML = "";

    // Build stacked vertical bar using CSS — simpler and more visually precise
    const total = concentrationData.reduce((s, d) => s + d.pct, 0);
    const bar = document.createElement("div");
    bar.className = "conc-bar";
    const legend = document.createElement("div");
    legend.className = "conc-legend";

    for (const d of concentrationData) {
      const seg = document.createElement("div");
      seg.className = "conc-seg";
      seg.style.height = `${(d.pct / total) * 100}%`;
      seg.style.background = d.color;
      seg.title = `${d.tier}: ${d.pct}%`;

      const label = document.createElement("div");
      label.className = "conc-label";
      label.innerHTML = `<span class="conc-pct">${d.pct}%</span><br><span class="conc-tier">${d.tier}</span>`;

      bar.appendChild(seg);

      const legendRow = document.createElement("div");
      legendRow.className = "conc-legend-row";
      legendRow.innerHTML = `<span class="conc-swatch" style="background:${d.color}"></span><span>${d.tier} — <strong>${d.pct}%</strong></span>`;
      legend.appendChild(legendRow);
    }

    concentrationContainer.appendChild(bar);
    concentrationContainer.appendChild(legend);
  }

  function renderTop20() {
    if (!barContainer || !top20Data.length) return;
    barContainer.innerHTML = "";

    // Sort descending by total warrants, then build long-form rows
    const sorted = [...top20Data].sort((a, b) => b.total - a.total);
    // y domain: top → bottom (Plot renders first domain entry at top)
    const yDomain = sorted.map((d) => d.plaintiff);
    const rows: { plaintiff: string; value: number; type: string }[] = [];
    for (const d of sorted) {
      rows.push({
        plaintiff: d.plaintiff,
        value: d.not_evicted,
        type: "Not evicted",
      });
      rows.push({
        plaintiff: d.plaintiff,
        value: d.evictions,
        type: "Evicted",
      });
    }

    const chart = Plot.plot({
      marks: [
        Plot.barX(rows, {
          x: "value",
          y: "plaintiff",
          fill: "type",
          order: ["Not evicted", "Evicted"],
        }),
        Plot.ruleX([0]),
      ],
      x: { label: "Warrants filed" },
      y: { label: null, tickSize: 0, domain: yDomain },
      color: {
        domain: ["Evicted", "Not evicted"],
        range: ["#b88500", "#e6ce8e"],
        legend: true,
      },
      style: {
        fontFamily: "var(--font-sans)",
        fontSize: 11,
        overflow: "visible",
      },
      marginLeft: 240,
      marginRight: 16,
      marginBottom: 36,
      height: 480,
    });
    barContainer.appendChild(chart);
  }

  onMount(() => {
    renderConcentration();
    renderTop20();
  });

  $effect(() => {
    void concentrationData;
    void top20Data;
    renderConcentration();
    renderTop20();
  });
</script>

<div class="landlord-charts">
  <div class="chart-col chart-col--narrow">
    <h3 class="chart-title">Warrant filings are highly concentrated</h3>
    <p class="chart-sub">Share of all warrants by landlord tier</p>
    <div bind:this={concentrationContainer} class="conc-wrapper"></div>
  </div>
  <div class="chart-col chart-col--wide">
    <h3 class="chart-title">Top 20 filers — warrants vs. evictions</h3>
    <p class="chart-sub">Most warrants never result in a formal eviction</p>
    <div bind:this={barContainer} class="bar-wrapper"></div>
  </div>
</div>

<style>
  .landlord-charts {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: var(--space-12);
    align-items: start;
    margin-top: var(--space-8);
  }

  @media (max-width: 700px) {
    .landlord-charts {
      grid-template-columns: 1fr;
    }
  }

  .chart-title {
    font-size: var(--text-base);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-heading);
    margin-bottom: var(--space-1);
  }

  .chart-sub {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin-bottom: var(--space-4);
  }

  /* Concentration bar */
  .conc-wrapper {
    display: flex;
    gap: var(--space-6);
    align-items: flex-start;
  }

  .conc-wrapper :global(.conc-bar) {
    width: 48px;
    height: 320px;
    display: flex;
    flex-direction: column;
    border-radius: var(--border-radius-sm);
    overflow: hidden;
    flex-shrink: 0;
  }

  .conc-wrapper :global(.conc-seg) {
    width: 100%;
    transition: opacity 0.15s;
  }

  .conc-wrapper :global(.conc-seg:hover) {
    opacity: 0.85;
  }

  .conc-wrapper :global(.conc-legend) {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-top: var(--space-1);
  }

  .conc-wrapper :global(.conc-legend-row) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    line-height: 1.4;
  }

  .conc-wrapper :global(.conc-swatch) {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  /* Top-20 bar chart */
  .bar-wrapper {
    width: 100%;
    overflow-x: auto;
  }

  .bar-wrapper :global(svg) {
    width: 100%;
    height: auto;
  }
</style>
