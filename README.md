# The Social Determinants of Eviction

An interactive public dashboard exploring eviction warrant patterns in Baltimore City, Maryland. Built on December 2024 court data from the Maryland Case Search system.

## What's on the site

- **Dashboard** — choropleth map of eviction rates by Community Statistical Area, with metric tabs and a detail panel showing top landlords per neighborhood
- **Data Story** — narrative analysis with scatter plots and bar charts linking eviction rates to income, race, and ownership concentration
- **Data** — downloadable CSVs and API documentation
- **Contact** — form for residents, advocates, and researchers to get in touch

## Data sources

| Source                                                                                                                                                                               | What it provides                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| [Maryland Case Search](https://casesearch.courts.state.md.us/)                                                                                                                       | Eviction warrant filings (Dec 2024)             |
| [BNIA Just Program](https://bniajfi.org/)                                                                                                                                            | Community Statistical Area demographics         |
| [SDAT](https://sdat.dat.maryland.gov/)                                                                                                                                               | Property ownership records                      |
| [Open Baltimore](https://data.baltimorecity.gov/)                                                                                                                                    | Community Statistical Area boundaries (GeoJSON) |
| [Maryland Eviction Dashboard](https://app.powerbigov.us/view?r=eyJrIjoiMmYyNWMyMGItOTg5My00Y2ZiLTg4ZjctNmM2MjE2ZmZhZWZiIiwidCI6IjdkM2I4ZDAwLWY5YmUtNDZlNy05NDYwLTRlZjJkOGY3MzE0OSJ9) | Statewide eviction filing trends                |

## Tech stack

| Layer         | Technology                                                      |
| ------------- | --------------------------------------------------------------- |
| Framework     | [Astro 5](https://astro.build) (`output: "static"`)             |
| UI components | [Svelte 5](https://svelte.dev)                                  |
| Map           | [MapLibre GL JS](https://maplibre.org)                          |
| Charts        | [Observable Plot](https://observablehq.com/plot/)               |
| Database      | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) |
| Hosting       | [Cloudflare Workers](https://workers.cloudflare.com/)           |
| Contact form  | [Baserow](https://baserow.io) API                               |

## Local development

**Prerequisites:** Node 20+, pnpm, a Cloudflare account with D1 set up.

```sh
pnpm install
```

Copy `.dev.vars.example` to `.dev.vars` and fill in your Baserow credentials:

```sh
cp .dev.vars.example .dev.vars
```

Start the dev server (builds Astro then runs `wrangler dev` with D1 emulation):

```sh
pnpm dev
```

The site is available at `http://localhost:8787`.

## Scripts

| Command             | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `pnpm dev`          | Build + start wrangler dev server at `localhost:8787` |
| `pnpm build`        | Production build to `dist/`                           |
| `pnpm preview`      | Build + run with production D1 bindings               |
| `pnpm test`         | Run unit tests (Vitest)                               |
| `pnpm checks`       | Type check + lint + format check                      |
| `pnpm lint`         | ESLint (auto-fix)                                     |
| `pnpm format`       | Prettier (auto-fix)                                   |
| `pnpm secrets:push` | Push `.dev.vars` secrets to Cloudflare                |

## Deployment

Pushes to `main` deploy automatically via GitHub Actions. The workflow:

1. Pushes secrets from GitHub repo secrets to the Cloudflare Worker
2. Builds and deploys via `wrangler`

Pull requests get a preview worker at `eviction-prevention-pr-{number}.workers.dev`, cleaned up when the PR closes.

Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CONTACT_FORM_API_TOKEN`, `CONTACT_FORM_API_URL`.

## Project structure

```
src/
  components/       Svelte islands (ChoroplethMap, MetricTabs, DashboardPanel, ...)
  layouts/          BaseLayout.astro
  lib/
    db.ts           D1 query helpers
    sanitize.ts     Address truncation, name hashing
    parser/         HTML parser for Maryland Case Search pages
    loader/         Case data loader
  pages/
    index.astro     Home
    dashboard.astro Interactive map dashboard
    story.astro     Data narrative
    data.astro      Downloads + API docs
    contact.astro   Contact form
    api/            JSON API routes (csa, cases)
  styles/
    global.css      Design tokens + base styles
scripts/
  seed-d1.ts        ETL: evictions.db + CSA CSVs → seed.sql for D1
  generate-downloads.ts  Generate public CSV downloads
analysis/           R/Python analysis pipeline (not deployed)
extension/          Browser extension for scraping case data
```

## Regenerating downloads

```sh
pnpm dlx tsx scripts/generate-downloads.ts
```

Reads `evictions.db` and writes CSVs to `public/data/downloads/`.
