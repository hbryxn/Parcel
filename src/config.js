export const APP_CONFIG = {
  listingFeeds: {
    sold: ['/savannah_enriched.json', '/sold_31312.json'],
    'for-sale': ['/active_listings.json'],
  },
  mapStyle: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  center: [-81.205, 32.145],
  zoom: 9.65,
  pitch: 58,
  bearing: -18,
};

export const MARKET_MODES = {
  sold: { label: 'Sold', priceLabel: 'Median sale', countLabel: 'Visible sales', dateLabel: 'Sold' },
  'for-sale': { label: 'For sale', priceLabel: 'Median ask', countLabel: 'Active listings', dateLabel: 'Listed' },
};

export const PRICE_BANDS = [
  { max: 250000, label: '< $250k', color: '#56dca1' },
  { max: 500000, label: '$250–500k', color: '#c6f16d' },
  { max: 800000, label: '$500–800k', color: '#ffb85c' },
  { max: Infinity, label: '$800k+', color: '#ff786e' },
];

export const money = (value, compact = false) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0, notation: compact ? 'compact' : 'standard',
}).format(value || 0);

export const number = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0);
