# Parcel

Parcel is a modular spatial-intelligence prototype for Savannah-area real estate. It combines sold and active listing modes, public planned-project records, a transparent impact scenario and a MapLibre 3D interface with red/green building footprints.

## Architecture

- `src/data/adapters` owns separate sold and active feed adapters.
- `src/domain` defines the shared listing contract.
- `src/analytics` owns mode-aware summaries and scenario scoring.
- `src/presentation` projects domain records into map-ready footprint geometry.
- `src/map/layers` owns independent listing, project and context-building layers.
- `src/application` coordinates one-way state flow between the dashboard and map.
- `main.js` is the composition root that connects those modules.

Run `npm run dev` for local development or `npm run build` for a production bundle.
