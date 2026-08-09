# Parcel

Parcel is a modular spatial-intelligence prototype for Savannah real estate. It combines verified property sales, public planned-project records, a transparent impact scenario and a MapLibre 3D interface.

## Architecture

- `src/data` owns swappable feed adapters.
- `src/analytics` owns market summaries and scenario scoring.
- `src/map` owns GeoJSON layers and spatial interactions.
- `src/ui` owns the dashboard and interactive architecture guide.
- `main.js` is the composition root that connects those modules.

Run `npm run dev` for local development or `npm run build` for a production bundle.
