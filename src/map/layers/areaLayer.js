import { AREA_METRICS, DIVERGING, VERDICT_COLORS } from '../../config.js';

export const areaColorExpression = (metric) => {
  const definition = AREA_METRICS[metric] || AREA_METRICS.score;
  const stops = definition.stops.flatMap(([value, colorIndex]) => [value, DIVERGING[colorIndex]]);
  return ['case', ['==', ['typeof', ['get', metric]], 'number'], ['interpolate', ['linear'], ['get', metric], ...stops], 'rgba(0,0,0,0)'];
};

export const toAreaGeoJSON = (areas) => ({
  type: 'FeatureCollection',
  features: areas.map((area) => ({
    type: 'Feature', id: Number(area.zip), geometry: area.geometry,
    properties: {
      zip: area.zip, city: area.city || '', score: area.score?.total ?? null, verdict: area.score?.verdict?.key || 'limited',
      label: `${area.zip}${Number.isFinite(area.score?.total) && area.score.verdict.key !== 'limited' ? ` · ${area.score.total}` : ''}`,
      ...Object.fromEntries(Object.keys(AREA_METRICS).filter((key) => key !== 'score').map((key) => [key, area.metrics?.[key] ?? null])),
    },
  })),
});

// ZIP choropleth with hover and selection outlines.
export class AreaLayer {
  constructor(map) { this.map = map; this.handlers = {}; this.hovered = null; }

  add(areas, metric, theme) {
    this.map.addSource('areas', { type: 'geojson', data: toAreaGeoJSON(areas), promoteId: 'zip' });
    this.map.addLayer({ id: 'area-fill', type: 'fill', source: 'areas', paint: {
      'fill-color': areaColorExpression(metric),
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.46, 11, 0.32, 13, 0.18, 15, 0.06],
    } });
    this.map.addLayer({ id: 'area-line', type: 'line', source: 'areas', paint: {
      'line-color': theme === 'dark' ? '#0b1116' : '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 13, 1.6], 'line-opacity': 0.9,
    } });
    this.map.addLayer({ id: 'area-hover', type: 'line', source: 'areas', paint: {
      'line-color': theme === 'dark' ? '#e7ecef' : '#1f2933', 'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.6, ['boolean', ['feature-state', 'hover'], false], 1.6, 0],
    } });
    this.map.addLayer({ id: 'area-label', type: 'symbol', source: 'areas', minzoom: 9.6, maxzoom: 13.5, layout: {
      'text-field': ['get', 'label'], 'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 12, 13], 'text-font': ['Montserrat Medium', 'Open Sans Bold', 'Noto Sans Regular'],
      'text-allow-overlap': false, 'symbol-placement': 'point',
    }, paint: { 'text-color': theme === 'dark' ? '#e7ecef' : '#1f2933', 'text-halo-color': theme === 'dark' ? 'rgba(11,17,22,.85)' : 'rgba(255,255,255,.9)', 'text-halo-width': 1.4 } });

    this.map.on('mousemove', 'area-fill', (event) => {
      const zip = event.features[0]?.properties.zip;
      if (zip === this.hovered) return;
      if (this.hovered) this.map.setFeatureState({ source: 'areas', id: this.hovered }, { hover: false });
      this.hovered = zip; this.map.setFeatureState({ source: 'areas', id: zip }, { hover: true });
      this.handlers.hover?.(zip, event.lngLat);
    });
    this.map.on('mouseleave', 'area-fill', () => {
      if (this.hovered) this.map.setFeatureState({ source: 'areas', id: this.hovered }, { hover: false });
      this.hovered = null; this.handlers.hover?.(null);
    });
    this.map.on('click', 'area-fill', (event) => {
      const interactive = this.map.queryRenderedFeatures(event.point, { layers: ['property-points', 'property-lots', 'offmarket-points', 'project-points', 'project-lines'].filter((id) => this.map.getLayer(id)) });
      if (!interactive.length) this.handlers.select?.(event.features[0].properties.zip);
    });
  }

  on(event, handler) { this.handlers[event] = handler; }
  setMetric(metric) { this.map.setPaintProperty('area-fill', 'fill-color', areaColorExpression(metric)); }
  setVisible(visible) { ['area-fill', 'area-line', 'area-hover', 'area-label'].forEach((id) => this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')); }
  select(zip) {
    if (this.selected) this.map.setFeatureState({ source: 'areas', id: this.selected }, { selected: false });
    this.selected = zip;
    if (zip) this.map.setFeatureState({ source: 'areas', id: zip }, { selected: true });
  }
}

export const verdictColor = (key) => VERDICT_COLORS[key] || VERDICT_COLORS.limited;
