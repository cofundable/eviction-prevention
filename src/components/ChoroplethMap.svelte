<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    selectedCsa,
    activeMetric,
    csaFeatures,
    loading,
    METRIC_LABELS,
    METRIC_FORMAT,
  } from "../stores/dashboard";
  import type { CsaFeature, MetricKey } from "../lib/types";

  // Amber sequential scale (7 stops, light → dark)
  const SCALE = [
    "#fbf7ef",
    "#f5edda",
    "#e6ce8e",
    "#d4a843",
    "#c89b3c",
    "#8b6914",
    "#5e4e4b",
  ];

  let mapContainer: HTMLDivElement;
  let map: import("maplibre-gl").Map | null = null;
  let tooltip: HTMLDivElement;
  let MapLibre: typeof import("maplibre-gl");

  function getColorStops(features: CsaFeature[], metric: MetricKey) {
    const vals = features.map((f) => f[metric] as number).filter((v) => !isNaN(v));
    if (!vals.length) return [];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return SCALE.map((color, i) => [min + (i / (SCALE.length - 1)) * (max - min), color]).flat();
  }

  function buildPaint(features: CsaFeature[], metric: MetricKey) {
    const stops = getColorStops(features, metric);
    if (!stops.length) return { "fill-color": "#e6ce8e" };
    return {
      "fill-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", metric], 0],
        ...stops,
      ],
      "fill-opacity": 0.85,
    };
  }

  async function initMap() {
    MapLibre = await import("maplibre-gl");
    await import("maplibre-gl/dist/maplibre-gl.css");

    map = new MapLibre.Map({
      container: mapContainer,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "background", type: "background", paint: { "background-color": "#f8f4ef" } }],
      },
      center: [-76.6122, 39.2904],
      zoom: 11,
      attributionControl: false,
    });

    map.on("load", async () => {
      // Fetch CSA features + GeoJSON in parallel
      const [featuresRes, geoRes] = await Promise.all([
        fetch("/api/csa"),
        fetch("/data/Community_Statistical_Areas.geojson"),
      ]);
      const { data: features }: { data: CsaFeature[] } = await featuresRes.json();
      const geojson = await geoRes.json();

      csaFeatures.set(features);
      loading.set(false);

      // Join feature data onto GeoJSON properties
      const featureMap = new Map(features.map((f) => [f.csa, f]));
      for (const feat of geojson.features) {
        const name: string = feat.properties.Community;
        const row = featureMap.get(name);
        if (row) Object.assign(feat.properties, row);
        feat.properties.csa = name;
      }

      map!.addSource("csa", { type: "geojson", data: geojson });

      map!.addLayer({
        id: "csa-fill",
        type: "fill",
        source: "csa",
        paint: buildPaint(features, activeMetric.get()) as never,
      });

      map!.addLayer({
        id: "csa-outline",
        type: "line",
        source: "csa",
        paint: { "line-color": "#fff", "line-width": 1 },
      });

      map!.addLayer({
        id: "csa-selected",
        type: "line",
        source: "csa",
        paint: { "line-color": "#3d302e", "line-width": 2.5 },
        filter: ["==", ["get", "csa"], ""],
      });

      // Hover tooltip
      map!.on("mousemove", "csa-fill", (e) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const name = feat.properties?.csa ?? "";
        const row = featureMap.get(name);
        const metric = activeMetric.get();
        const val = row ? METRIC_FORMAT[metric](row[metric] as number) : "—";
        tooltip.style.display = "block";
        tooltip.style.left = `${e.point.x + 12}px`;
        tooltip.style.top = `${e.point.y - 28}px`;
        tooltip.innerHTML = `<strong>${name}</strong><br>${METRIC_LABELS[metric]}: ${val}`;
        map!.getCanvas().style.cursor = "pointer";
      });

      map!.on("mouseleave", "csa-fill", () => {
        tooltip.style.display = "none";
        map!.getCanvas().style.cursor = "";
      });

      // Click to select
      map!.on("click", "csa-fill", (e) => {
        const name = e.features?.[0]?.properties?.csa ?? null;
        selectedCsa.set(name === selectedCsa.get() ? null : name);
      });

      // Re-paint when metric changes
      activeMetric.subscribe((metric) => {
        if (!map?.getLayer("csa-fill")) return;
        map.setPaintProperty("csa-fill", "fill-color", buildPaint(features, metric)["fill-color"] as never);
        map.setPaintProperty("csa-fill", "fill-opacity", 0.85);
      });

      // Highlight selected
      selectedCsa.subscribe((csa) => {
        map?.setFilter("csa-selected", ["==", ["get", "csa"], csa ?? ""]);
      });
    });
  }

  onMount(initMap);
  onDestroy(() => map?.remove());
</script>

<div class="map-wrapper">
  <div bind:this={mapContainer} class="map"></div>
  <div bind:this={tooltip} class="tooltip" style="display:none"></div>
</div>

<style>
  .map-wrapper {
    position: relative;
    height: 100%;
    min-height: 480px;
  }

  .map {
    width: 100%;
    height: 100%;
  }

  .tooltip {
    position: absolute;
    pointer-events: none;
    background: var(--color-brown-900);
    color: white;
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--border-radius-sm);
    white-space: nowrap;
    z-index: 10;
    line-height: 1.5;
  }
</style>
