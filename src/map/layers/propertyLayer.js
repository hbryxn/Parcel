import { DIVERGING } from '../../config.js';

const NEUTRAL = '#aab2bb';
const PRICE_SCALE = ['#d9e2f5', '#a9bbec', '#7b93dc', '#5569c2', '#343f94'];

export const colorExpression = (mode) => {
  if (mode === 'price') {
    return ['interpolate', ['linear'], ['get', 'price'], 150000, PRICE_SCALE[0], 280000, PRICE_SCALE[1], 420000, PRICE_SCALE[2], 650000, PRICE_SCALE[3], 1100000, PRICE_SCALE[4]];
  }
  const key = mode === 'deal' ? 'signal' : 'change';
  const stops = mode === 'deal'
    ? [30, 0, 40, 1, 46, 2, 50, 3, 55, 4, 62, 5, 70, 6]
    : [-8, 0, -4, 1, -1, 2, 0, 3, 2, 4, 5, 5, 10, 6];
  const pairs = [];
  for (let index = 0; index < stops.length; index += 2) pairs.push(stops[index], DIVERGING[stops[index + 1]]);
  return ['case', ['==', ['typeof', ['get', key]], 'number'], ['interpolate', ['linear'], ['get', key], ...pairs], NEUTRAL];
};

const props = (property) => ({
  id: property.id, status: property.status, price: property.displayPrice ?? null, change: property.change ?? null, signal: property.signal ?? null,
  live: Boolean(property.live), deal: property.deal?.key || null,
});

export const toPointGeoJSON = (records) => ({
  type: 'FeatureCollection',
  features: records.map((property) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: property.coordinates }, properties: props(property) })),
});

// Shrink a lot polygon toward its centre to suggest a building mass sitting on the real lot.
const inset = (ring, factor) => {
  const [cx, cy] = ring.slice(0, -1).reduce(([x, y], point, _, list) => [x + point[0] / list.length, y + point[1] / list.length], [0, 0]);
  return ring.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
};

export const toLotGeoJSON = (records) => ({
  type: 'FeatureCollection',
  features: records.filter((property) => property.footprint?.length >= 4).map((property) => ({
    type: 'Feature', geometry: { type: 'Polygon', coordinates: [property.footprint] },
    properties: { ...props(property), height: Math.max(5, Math.min(16, 4 + (property.sqft || 1700) / 260)) },
  })),
});

export const toMassGeoJSON = (lots) => ({
  type: 'FeatureCollection',
  features: lots.features.map((feature) => ({ ...feature, geometry: { type: 'Polygon', coordinates: [inset(feature.geometry.coordinates[0], 0.55)] } })),
});

// Listings and recorded sales: dots at city scale, real lot outlines up close, optional 3D massing.
export class PropertyLayer {
  constructor(map) { this.map = map; this.handlers = {}; this.selected = null; }

  add(records, mode, theme) {
    const ring = theme === 'dark' ? '#0b1116' : '#ffffff';
    const lots = toLotGeoJSON(records);
    this.map.addSource('property-points', { type: 'geojson', data: toPointGeoJSON(records), promoteId: 'id' });
    this.map.addSource('property-lots', { type: 'geojson', data: lots, promoteId: 'id' });
    this.map.addSource('property-mass', { type: 'geojson', data: toMassGeoJSON(lots), promoteId: 'id' });

    this.map.addLayer({ id: 'property-lots', type: 'fill', source: 'property-lots', minzoom: 15, paint: {
      'fill-color': colorExpression(mode), 'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.85, 0.55],
      'fill-outline-color': ring,
    } });
    this.map.addLayer({ id: 'property-mass', type: 'fill-extrusion', source: 'property-mass', minzoom: 14.5, layout: { visibility: 'none' }, paint: {
      'fill-extrusion-color': colorExpression(mode), 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 0.92,
    } });
    this.map.addLayer({ id: 'property-points', type: 'circle', source: 'property-points', paint: {
      'circle-color': colorExpression(mode),
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        9, ['match', ['get', 'status'], ['for-sale', 'pending'], 3.6, 'off-market', 1, 1.8],
        13, ['match', ['get', 'status'], ['for-sale', 'pending'], 6.5, 'off-market', 2.4, 3.6],
        16, ['match', ['get', 'status'], ['for-sale', 'pending'], 9, 'off-market', 4.2, 5]],
      'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], theme === 'dark' ? '#ffffff' : '#111827', ['==', ['get', 'status'], 'pending'], '#d4a017', ring],
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, ['match', ['get', 'status'], ['for-sale', 'pending'], 2, 0.6]],
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.85, 15, 0.95, 16.5, ['match', ['get', 'status'], ['for-sale', 'pending'], 1, 0.35]],
    } });
    this.map.addLayer({ id: 'property-price', type: 'symbol', source: 'property-points', minzoom: 15.2, filter: ['in', ['get', 'status'], ['literal', ['for-sale', 'pending']]], layout: {
      'text-field': ['concat', '$', ['to-string', ['round', ['/', ['get', 'price'], 1000]]], 'k'], 'text-size': 11, 'text-offset': [0, -1.45],
      'text-font': ['Montserrat Medium', 'Open Sans Bold', 'Noto Sans Regular'],
    }, paint: { 'text-color': theme === 'dark' ? '#f3f5f7' : '#111827', 'text-halo-color': theme === 'dark' ? '#0b1116' : '#ffffff', 'text-halo-width': 1.6 } });

    for (const id of ['property-points', 'property-lots', 'property-mass']) {
      this.map.on('click', id, (event) => this.handlers.select?.(event.features[0].properties.id));
      this.map.on('mouseenter', id, () => { this.map.getCanvas().style.cursor = 'pointer'; });
      this.map.on('mouseleave', id, () => { this.map.getCanvas().style.cursor = ''; });
    }
  }

  on(event, handler) { this.handlers[event] = handler; }

  setData(records) {
    const lots = toLotGeoJSON(records);
    this.map.getSource('property-points')?.setData(toPointGeoJSON(records));
    this.map.getSource('property-lots')?.setData(lots);
    this.map.getSource('property-mass')?.setData(toMassGeoJSON(lots));
    if (this.selected) this.select(this.selected);
  }

  setMode(mode) {
    this.map.setPaintProperty('property-points', 'circle-color', colorExpression(mode));
    this.map.setPaintProperty('property-lots', 'fill-color', colorExpression(mode));
    this.map.setPaintProperty('property-mass', 'fill-extrusion-color', colorExpression(mode));
  }

  set3D(enabled) {
    this.map.setLayoutProperty('property-mass', 'visibility', enabled ? 'visible' : 'none');
    this.map.setLayoutProperty('property-lots', 'visibility', enabled ? 'none' : 'visible');
  }

  select(id) {
    for (const source of ['property-points', 'property-lots', 'property-mass']) {
      if (this.selected) this.map.setFeatureState({ source, id: this.selected }, { selected: false });
      if (id) this.map.setFeatureState({ source, id }, { selected: true });
    }
    this.selected = id;
  }
}
