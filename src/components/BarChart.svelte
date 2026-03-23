<script lang="ts">
  import { onMount } from "svelte";
  import * as Plot from "@observablehq/plot";

  interface Props {
    data: Record<string, unknown>[];
    xField: string;
    yField: string;
    color?: string;
    xLabel?: string;
    yLabel?: string;
    horizontal?: boolean;
  }

  let {
    data,
    xField,
    yField,
    color = "var(--color-chart-warrant)",
    xLabel = "",
    yLabel = "",
    horizontal = false,
  }: Props = $props();

  let container: HTMLDivElement;

  function render() {
    if (!container || !data.length) return;
    container.innerHTML = "";
    const mark = horizontal
      ? Plot.barX(data, {
          x: xField,
          y: yField,
          fill: color,
          sort: { y: "-x" },
        })
      : Plot.barY(data, { x: xField, y: yField, fill: color });
    const chart = Plot.plot({
      marks: [mark, Plot.ruleY ? Plot.ruleY([0]) : null].filter(Boolean),
      x: { label: horizontal ? xLabel : yLabel },
      y: { label: horizontal ? yLabel : xLabel },
      color: { legend: false },
      style: { fontFamily: "var(--font-sans)", fontSize: 12 },
      marginLeft: horizontal ? 200 : 60,
      marginBottom: horizontal ? 40 : 60,
    });
    container.appendChild(chart);
  }

  onMount(render);
  $effect(render);
</script>

<div bind:this={container} class="chart"></div>

<style>
  .chart {
    width: 100%;
    overflow-x: auto;
  }

  .chart :global(svg) {
    width: 100%;
    height: auto;
  }
</style>
