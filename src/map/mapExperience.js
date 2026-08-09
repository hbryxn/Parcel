import { PRICE_BANDS } from '../config.js';

export class MapExperience {
  constructor(map, market, dashboard) {
    this.map = map;
    this.market = market;
    this.dashboard = dashboard;
    this.filters = { query: '', band: 'all', type: 'all' };
  }

  initialize() {
    this.addBuildings();
    this.addProperties();
    this.addProjects();
    this.bindEvents();
    this.dashboard.setReady();
  }

  addBuildings() {
    const style = this.map.getStyle();
    const buildingSource = Object.entries(style.sources).find(([, source]) => source.type === 'vector' && /carto/.test(source.url || ''))?.[0];
    if (!buildingSource) return;

    this.map.addLayer({
      id: '3d-buildings', source: buildingSource, 'source-layer': 'building', type: 'fill-extrusion', minzoom: 12.5,
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'render_height'], 0, '#16231e', 80, '#253a31'],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
        'fill-extrusion-opacity': 0.8,
      },
    });
  }

  addProperties() {
    this.map.addSource('properties', { type: 'geojson', data: this.market.propertiesGeoJSON(), cluster: true, clusterRadius: 34, clusterMaxZoom: 12 });
    this.map.addLayer({
      id: 'property-clusters', type: 'circle', source: 'properties', filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#d9ff70', 'circle-radius': ['step', ['get', 'point_count'], 15, 40, 19, 100, 24],
        'circle-opacity': 0.92, 'circle-stroke-color': '#132018', 'circle-stroke-width': 3,
      },
    });
    this.map.addLayer({
      id: 'cluster-count', type: 'symbol', source: 'properties', filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Open Sans Bold'], 'text-size': 11 },
      paint: { 'text-color': '#132018' },
    });
    this.map.addLayer({
      id: 'property-halo', type: 'circle', source: 'properties', filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['case', ['>=', ['get', 'score'], 0], '#9adf68', '#ff746c'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 16, 21], 'circle-blur': 0.8, 'circle-opacity': 0.22,
      },
    });
    this.map.addLayer({
      id: 'property-dots', type: 'circle', source: 'properties', filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['step', ['get', 'price'], PRICE_BANDS[0].color, 250000, PRICE_BANDS[1].color, 500000, PRICE_BANDS[2].color, 800000, PRICE_BANDS[3].color],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 16, 8],
        'circle-stroke-color': '#09100d', 'circle-stroke-width': 1.4, 'circle-opacity': 0.96,
      },
    });
  }

  addProjects() {
    this.map.addSource('projects', { type: 'geojson', data: this.market.projectsGeoJSON() });
    this.map.addLayer({
      id: 'project-zones', type: 'circle', source: 'projects',
      paint: {
        'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 9, ['*', ['get', 'radiusMiles'], 2], 14, ['*', ['get', 'radiusMiles'], 45]],
        'circle-color': '#a8e5ff', 'circle-opacity': 0.08, 'circle-stroke-color': '#a8e5ff', 'circle-stroke-opacity': 0.38,
        'circle-stroke-width': 1,
      },
    });
    this.map.addLayer({
      id: 'project-points', type: 'circle', source: 'projects',
      paint: { 'circle-radius': 9, 'circle-color': '#0f1b17', 'circle-stroke-color': '#a8e5ff', 'circle-stroke-width': 2 },
    });
    this.map.addLayer({
      id: 'project-labels', type: 'symbol', source: 'projects', minzoom: 10.4,
      layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-offset': [0, 1.7], 'text-anchor': 'top', 'text-max-width': 15 },
      paint: { 'text-color': '#dff6ed', 'text-halo-color': '#07100d', 'text-halo-width': 2 },
    });
  }

  bindEvents() {
    this.map.on('click', 'property-dots', (event) => this.dashboard.showProperty(event.features[0].properties));
    this.map.on('click', 'project-points', (event) => this.dashboard.showProject(event.features[0].properties));
    this.map.on('click', 'property-clusters', async (event) => {
      const feature = event.features[0];
      const zoom = await this.map.getSource('properties').getClusterExpansionZoom(feature.properties.cluster_id);
      this.map.easeTo({ center: feature.geometry.coordinates, zoom, duration: 550 });
    });
    ['property-dots', 'project-points', 'property-clusters'].forEach((layer) => {
      this.map.on('mouseenter', layer, () => { this.map.getCanvas().style.cursor = 'pointer'; });
      this.map.on('mouseleave', layer, () => { this.map.getCanvas().style.cursor = ''; });
    });
  }

  updateFilters(nextFilters) {
    this.filters = { ...this.filters, ...nextFilters };
    const records = this.market.filter(this.filters);
    this.map.getSource('properties')?.setData(this.market.propertiesGeoJSON(records));
    this.dashboard.updateSummary(records);
    const match = records[0];
    if (this.filters.query && match) this.map.easeTo({ center: match.coordinates, zoom: 15, pitch: 62, duration: 700 });
  }

  setImpact(enabled) {
    this.market.setProjectImpact(enabled);
    this.updateFilters({});
  }

  setLayerVisible(layer, visible) {
    const layerIds = layer === 'projects' ? ['project-zones', 'project-points', 'project-labels'] : ['property-halo', 'property-dots', 'property-clusters', 'cluster-count'];
    layerIds.forEach((id) => { if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'); });
  }

  resetView() { this.map.easeTo({ center: [-81.0998, 32.0809], zoom: 12.25, pitch: 58, bearing: -18, duration: 900 }); }
}
