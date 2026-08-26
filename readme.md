# Parcel

Parcel is a modular spatial-intelligence prototype for Savannah-area real estate. It combines sold and active listing modes, public planned-project records, a transparent impact scenario and a MapLibre 3D interface with red/green building footprints.

The active-listing path supports a protected RentCast connector with an automatic dated-snapshot fallback. The Data Quality panel keeps two questions separate:

- Source quality: provider, freshness, record count, completeness and cross-source asking-price variance.
- Valuation accuracy: a five-fold held-out backtest with median percentage error, mean absolute error and the share of estimates within 10% and 20% of recorded sale prices.

## Architecture

- `server/liveListings.js` protects the provider key and normalizes near-real-time API records.
- `src/data/adapters` owns separate sold, active snapshot and live feed adapters.
- `src/domain` defines the shared listing contract.
- `src/analytics` owns mode-aware summaries, scenario scoring and independent quality tests.
- `src/presentation` projects domain records into map-ready footprint geometry.
- `src/map/layers` owns independent listing, project and context-building layers.
- `src/application` coordinates one-way state flow between the dashboard and map.
- `main.js` is the composition root that connects those modules.

## Run locally

Use Node.js 20.19 or newer, then:

```bash
npm install
npm run dev
```

Open the local URL Vite prints in the terminal. Without an API key, Parcel intentionally displays the saved snapshot and explains the fallback in the Data Quality panel.

To enable the live connector locally, create a RentCast API key, copy `.env.example` to `.env.local`, and set:

```text
RENTCAST_API_KEY=your_key_here
```

Never commit or paste that key into browser code. Restart `npm run dev` after changing the environment file.

Run the data and modularity contract tests with `npm test`, and create a production bundle with `npm run build`.

## Production accuracy path

RentCast is the first swappable active-listing connector. For the strongest source-of-truth comparison, add a Bridge/RESO adapter after securing access from the relevant local MLS. Keep provider reconciliation separate from valuation backtesting: one detects stale or inconsistent source records; the other detects model pricing error.
