export const APP_CONFIG = {
  data: {
    manifest: '/data/manifest.json',
    areas: '/data/areas.json',
    properties: '/data/properties.json',
    projects: '/data/projects.json',
    offMarket: (zip) => `/data/parcels/${zip}.json`,
  },
  liveListings: { endpoint: '/api/listings/live', timeoutMs: 9000 },
  mapStyles: {
    light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  },
  center: [-81.2, 32.07],
  zoom: 9.7,
  pitch: 0,
  bearing: 0,
  offMarketMinZoom: 13.5,
};

export const STATUSES = {
  'for-sale': { label: 'For sale', short: 'Active', priceLabel: 'Asking price', dateLabel: 'Listed' },
  pending: { label: 'Pending', short: 'Pending', priceLabel: 'Asking price', dateLabel: 'Listed' },
  sold: { label: 'Recently sold', short: 'Sold', priceLabel: 'Sale price', dateLabel: 'Sold' },
  delisted: { label: 'Delisted', short: 'Delisted', priceLabel: 'Last ask', dateLabel: 'Removed' },
  'off-market': { label: 'Off market', short: 'Off market', priceLabel: 'Est. value', dateLabel: 'Last sold' },
};

// Diverging, colour-blind-safe scale (orange ↔ neutral ↔ teal) used for every "change" metric.
export const DIVERGING = ['#c2410c', '#f08a4b', '#f4c9a8', '#d6dadf', '#a7ddd3', '#3fb8a3', '#0f7c6c'];

export const VERDICT_COLORS = {
  strong: '#0f7c6c', favorable: '#3fb8a3', neutral: '#9aa3ad', caution: '#f08a4b', risk: '#c2410c', limited: '#c9ced4',
  good: '#0f7c6c', watch: '#3fb8a3', bad: '#c2410c',
};

// What the ZIP choropleth can show. `stops` are [value, colorIndex] pairs into DIVERGING.
export const AREA_METRICS = {
  score: { label: 'Investment score', unit: 'score', format: 'score', stops: [[30, 0], [40, 1], [46, 2], [50, 3], [54, 4], [60, 5], [68, 6]], description: 'Relative 0–100 score across momentum, demand, value, growth drivers and resilience.' },
  yoyPct: { label: '1-year value change', unit: '%', format: 'pct', stops: [[-8, 0], [-4, 1], [-1.5, 2], [0, 3], [1.5, 4], [4, 5], [8, 6]], description: 'Zillow Home Value Index, last 12 months.' },
  cagr3Pct: { label: '3-year growth / yr', unit: '%', format: 'pct', stops: [[-4, 0], [-1, 1], [0.5, 2], [2, 3], [3, 4], [4.5, 5], [6, 6]], description: 'Compound annual change in typical home value over three years.' },
  forecast1yPct: { label: 'Zillow 1-yr forecast', unit: '%', format: 'pct', stops: [[-2.5, 0], [-1.5, 1], [-0.5, 2], [0, 3], [0.5, 4], [1, 5], [2, 6]], description: 'Zillow Home Value Forecast for the next 12 months.' },
  grossYieldPct: { label: 'Gross rent yield', unit: '%', format: 'pct', stops: [[4, 0], [4.8, 1], [5.5, 2], [6.2, 3], [7, 4], [8, 5], [9.5, 6]], description: 'Annual market rent (ZORI) divided by typical home value.' },
  monthsSupply: { label: 'Months of supply', unit: 'mo', format: 'num', stops: [[9, 0], [7, 1], [5.5, 2], [4.5, 3], [3.5, 4], [2.5, 5], [1.5, 6]], description: 'Inventory ÷ monthly sales (Redfin). Lower means a tighter, seller-friendly market.' },
  newBuildSharePct: { label: 'New-build share of sales', unit: '%', format: 'num', stops: [[0, 3], [5, 4], [15, 5], [35, 6]], description: 'Share of the last 12 months of recorded sales that were homes built in the last two years (Chatham County).' },
  businessOpenings12m: { label: 'New businesses (12 mo)', unit: '', format: 'num', stops: [[0, 3], [2, 4], [5, 5], [10, 6]], description: 'Stores, restaurants and services permitted to open in the last 12 months (City of Savannah permits).' },
  projectIndex: { label: 'Project pipeline', unit: 'pts', format: 'num', stops: [[0, 3], [0.5, 4], [2, 5], [5, 6]], description: 'Probability- and time-weighted value lift expected from planned projects across the ZIP.' },
};

export const COLOR_MODES = {
  change: { label: 'Price change', description: 'Annualized change since the previous sale (sold/off-market) or value gap (for sale).' },
  deal: { label: 'Investment signal', description: 'Area score plus value gap and nearby projects.' },
  price: { label: 'Price', description: 'Sale, asking or estimated price.' },
};

export const PRICE_BANDS = [
  { key: 'entry', label: '< $250k', max: 250000 },
  { key: 'mid', label: '$250–450k', max: 450000 },
  { key: 'upper', label: '$450–800k', max: 800000 },
  { key: 'prime', label: '$800k+', max: Infinity },
];
