# Parcel

Parcel maps home values, price changes, planned projects and investment signals across the Savannah region (every ZIP within 40 miles of downtown, in Georgia and South Carolina).

- **Homes**: public-record sales from Chatham County with full sale history, listings (RentCast or Redfin exports), and all ~100k off-market Chatham homes with an estimated value today.
- **Areas**: a 0–100 score per ZIP that combines price momentum, buyer demand, rent yield and affordability, growth drivers and resilience. Each score comes with plain-language strengths, risks and tags such as *Pipeline upside* or *In correction*.
- **Projects**: city capital projects, the CORE MPO 2050 transportation plan, rezonings, MPC petitions, large commercial permits and curated regional catalysts (Hyundai Metaplant, Ocean Terminal, Canal District…). Each is weighted by delivery probability, timing and distance.
- **Accuracy**: the Data & accuracy panel reports source freshness, an out-of-sample valuation backtest and a backtest of whether the area score predicted later appreciation.

## Run locally

Use Node.js 20.19 or newer.

```bash
npm install
npm run pipeline   # fetch sources and build public/data (first run ~3 min)
npm run dev
```

`npm test` runs the model and contract tests, and `npm run build` creates a production bundle.

## Data pipeline

`pipeline/run.js` fetches every source, joins and models the data, then publishes static JSON to `public/data/`:

| File | Contents |
| --- | --- |
| `areas.json` | ZIP boundaries, metrics, monthly value/rent/market series, score and reasons |
| `properties.json` | Recorded sales (last 24 months) and on-market listings with estimates, sale history and deal signals |
| `parcels/<zip>.json` | Off-market homes per ZIP (column-oriented, loaded when you zoom in) |
| `projects.json` | Planned projects with resolved impact, plus new-home permits |
| `manifest.json` | Sources, freshness, record counts and both backtests |

| Source | Used for | Refresh |
| --- | --- | --- |
| Census TIGERweb ZCTAs | ZIP discovery within the region radius, boundaries | quarterly |
| Zillow ZHVI / ZORI / ZHVF | Monthly home values, rents, 12-month forecast by ZIP | weekly check (published mid-month) |
| Redfin Data Center ZIP tracker | Inventory, days on market, sale-to-list, price cuts | biweekly check (published monthly) |
| ACS 2020–24 via Census Reporter | Income, population, tenure, housing age | bimonthly |
| Chatham BOA parcels (SAGIS) | Recorded sales, lot polygons, assessments, off-market homes | weekly |
| Chatham parcel digests 2016–2025 | Multi-sale price history per parcel | weekly |
| SAGIS / MPC layers | CIP, MTP 2050, rezonings, petitions, permits | every 3 days |
| `pipeline/catalysts.json` | Curated regional projects, each with a public source | review quarterly |
| RentCast (optional) | Active and recently delisted listings | 12 hours |
| `pipeline/inbox/*.csv\|json` | Redfin "Download All" exports and older feeds | whenever you add a file |

Responses are cached in `pipeline/.cache/` (git-ignored). `npm run pipeline:offline` rebuilds the outputs from cache alone. To widen the region or change a source, edit `pipeline/config.js`. A weekly GitHub Action (`.github/workflows/refresh-data.yml`) reruns the pipeline and commits the refreshed data.

### On-market listings

Chatham public records cover sales and off-market homes, but not listings. Choose one:

1. **RentCast**: copy `.env.example` to `.env.local` and set `RENTCAST_API_KEY`. The pipeline pulls active and recently delisted homes (bounded by `RENTCAST_MAX_REQUESTS`, default 8). The dev server's `/api/listings/live` endpoint overlays current actives in the browser, using one request per page load. Never put the key in browser code.
2. **Redfin export**: download a search as CSV from redfin.com (the "Download All" link) and drop it into `pipeline/inbox/`. Sold, active and pending rows are all recognized.

Without either, the app shows the saved 13-listing snapshot and says so.

## Models

- **Valuation** (`src/analytics/valuationModel.js`) blends two estimates. The first adjusts the last arm's-length sale by the ZIP's Zillow index. The second calibrates the county assessment by the assessor neighborhood's sale/assessment ratio, falling back to ZIP × value band, then ZIP. Blend weights by sale age are learned with 5-fold cross-validation on the latest 12 months of qualified sales. Non-market transfers, lot sales before construction, and assessments set before a house was finished are all excluded. Current backtest: 12.9% median error (41% of homes within 10%). The previous ZIP $/ft² baseline was at 16.5% on its own data. Listings with square footage also get a comparable-sales estimate.
- **Area score** (`src/analytics/areaModel.js`) ranks each feature against the region's other ZIPs. It needs 35% confidence to be shown at all, and 60% for an extreme call. The price-only part is rebuilt at past dates and checked against realized appreciation: mean rank correlation is 0.36, and the top third beat the bottom third by 3.6 points over the following 12 months.
- **Project impact** (`src/analytics/projectImpact.js`): lift = category prior × stage probability (withdrawn 0 → complete 1) × timing (future benefits discounted about 10% a year; benefits delivered long ago are treated as priced in) × a smooth distance kernel. Projects can carry several effects; a port, for example, lifts the region but weighs on its immediate neighbors.
- **Deal signal** combines an asking price's gap to estimated value (55%), the area score (35%) and nearby project lift (10%).

These are research signals, not appraisals or investment advice.

## Architecture

- `pipeline/`: sources → build → publish (Node, no extra dependencies)
- `src/analytics`: shared, pure models used by both the pipeline and the browser
- `src/data`: loads published datasets, the live listing overlay and lazy off-market ZIPs
- `src/domain/property.js`: the property record the UI and map understand
- `src/map/layers`: independent ZIP, property, project and context layers (MapLibre)
- `src/ui`: dashboard shell, detail views, SVG charts, formatting and escaping
- `src/application/marketController.js`: one-way flow from UI intents to state, map and UI
- `server/liveListings.js`: protected RentCast proxy (Vite dev middleware and the edge runtime)
