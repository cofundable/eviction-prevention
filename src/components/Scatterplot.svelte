<script lang="ts">
  import { onMount } from "svelte";
  import * as Plot from "@observablehq/plot";

  interface Props {
    data: Record<string, unknown>[];
    xField: string;
    yField: string;
    labelField?: string;
    xLabel?: string;
    yLabel?: string;
    color?: string;
    rValue?: number | null;
    pValue?: number | null;
    title?: string;
  }

  let {
    data,
    xField,
    yField,
    labelField,
    xLabel = xField,
    yLabel = yField,
    color = "var(--color-chart-warrant)",
    rValue = null,
    pValue = null,
    title = "",
  }: Props = $props();

  let container: HTMLDivElement;

  function sigLabel(p: number | null): string {
    if (p === null) return "";
    if (p < 0.001) return "p<0.001";
    if (p < 0.01) return `p=${p.toFixed(3)}`;
    if (p < 0.05) return `p=${p.toFixed(3)}`;
    return "n.s.";
  }

  function render() {
    if (!container || !data.length) return;
    container.innerHTML = "";

    const marks: Plot.Markish[] = [
      Plot.dot(data, {
        x: xField,
        y: yField,
        fill: color,
        fillOpacity: 0.7,
        r: 4,
        tip: labelField
          ? { channels: { Name: labelField }, format: { x: true, y: true } }
          : true,
      }),
      Plot.linearRegressionY(data, {
        x: xField,
        y: yField,
        stroke: "var(--color-chart-regression)",
        strokeWidth: 1.5,
        strokeDasharray: "4,3",
      }),
    ];

    const chart = Plot.plot({
      marks,
      x: { label: xLabel, grid: true },
      y: { label: yLabel, grid: true },
      style: { fontFamily: "var(--font-sans)", fontSize: 12, background: "transparent" },
      marginBottom: 48,
    });

    container.appendChild(chart);

    // r / p annotation below chart
    if (rValue !== null) {
      const sign = rValue >= 0 ? "+" : "−";
      const sig = sigLabel(pValue);
      const isSig = pValue !== null && pValue < 0.05;
      const annot = document.createElement("p");
      annot.className = `annot ${isSig ? "annot--sig" : "annot--ns"}`;
      annot.textContent = `r = ${sign}${Math.abs(rValue).toFixed(2)}  ${sig}`;
      container.appendChild(annot);
    }
  }

  onMount(render);
  $effect(render);
</script>

{#if title}
  <h4 class="chart-title">{title}</h4>
{/if}
<div bind:this={container} class="chart"></div>

<style>
  .chart-title {
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-heading);
    margin-bottom: var(--space-2);
  }

  .chart {
    width: 100%;
    overflow-x: auto;
  }

  .chart :global(svg) {
    width: 100%;
    height: auto;
  }

  .chart :global(.annot) {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    text-align: center;
    margin-top: var(--space-2);
  }

  .chart :global(.annot--sig) {
    color: var(--color-amber-700);
    font-weight: var(--font-weight-semibold);
  }

  .chart :global(.annot--ns) {
    color: var(--color-text-muted);
  }
</style>
