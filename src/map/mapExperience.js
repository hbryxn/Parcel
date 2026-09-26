import { APP_CONFIG } from '../config.js';
import { AreaLayer } from './layers/areaLayer.js';
import { ContextBuildingLayer } from './layers/contextBuildingLayer.js';
import { projectAnchor, ProjectLayer } from './layers/projectLayer.js';
import { PropertyLayer } from './layers/propertyLayer.js';

// Owns the MapLibre instance. Layers are rebuilt from `state` whenever the basemap style changes.
export class MapExperience {
  constructor(maplibregl, container, theme) {
    this.maplibregl = maplibregl;
    this.theme = theme;
    this.handlers = {};
    this.state = { areas: [], records: [], projects: [], areaMetric: 'score', colorMode: 'change', layers: { areas: true, properties: true, infrastructure: true, housing: true, business: true }, threeD: false };
    this.map = new maplibregl.Map({
      container, style: APP_CONFIG.mapStyles[theme], center: APP_CONFIG.center, zoom: APP_CONFIG.zoom, pitch: APP_CONFIG.pitch, bearing: APP_CONFIG.bearing,
      attributionControl: false, maxPitch: 70, hash: false,
    });
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    this.map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Data: Chatham BOA/SAGIS · Zillow · Redfin · U.S. Census' }), 'bottom-right');
    this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'hover-popup', offset: 12 });
    // Track container size changes (panel/drawer layout, fonts settling), not just window resizes.
    new ResizeObserver(() => this.map.resize()).observe(this.map.getContainer());
    this.map.on('style.load', () => this.build());
    this.map.once('load', () => this.syncPadding());
    window.addEventListener('resize', () => this.syncPadding());
    this.map.on('moveend', () => this.emitViewport());
  }

  on(event, handler) { this.handlers[event] = handler; }
  whenReady() { return this.map.isStyleLoaded() && this.built ? Promise.resolve() : new Promise((resolve) => this.map.once('idle', resolve)); }

  build() {
    const firstSymbol = this.map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
    this.areaLayer = new AreaLayer(this.map);
    this.propertyLayer = new PropertyLayer(this.map);
    this.projectLayer = new ProjectLayer(this.map);
    this.areaLayer.add(this.state.areas, this.state.areaMetric, this.theme);
    // Keep the choropleth beneath basemap labels and roads' names for legibility.
    for (const id of ['area-fill', 'area-line']) if (firstSymbol) this.map.moveLayer(id, firstSymbol);
    new ContextBuildingLayer(this.map).add(this.theme);
    this.propertyLayer.add(this.state.records, this.state.colorMode, this.theme);
    this.projectLayer.add(this.state.projects, this.theme);
    this.areaLayer.on('select', (zip) => this.handlers.selectArea?.(zip));
    this.areaLayer.on('hover', (zip, lngLat) => this.hoverArea(zip, lngLat));
    this.propertyLayer.on('select', (id) => this.handlers.selectProperty?.(id));
    this.projectLayer.on('select', (id) => this.handlers.selectProject?.(id));
    this.applyVisibility();
    this.propertyLayer.set3D(this.state.threeD);
    if (this.selection) this.restoreSelection();
    this.built = true;
    this.handlers.ready?.();
  }

  hoverArea(zip, lngLat) {
    if (!zip || !this.handlers.areaTooltip) { this.popup.remove(); return; }
    this.popup.setLngLat(lngLat).setHTML(this.handlers.areaTooltip(zip)).addTo(this.map);
  }

  setTheme(theme) {
    if (theme === this.theme) return;
    this.theme = theme; this.built = false;
    this.map.setStyle(APP_CONFIG.mapStyles[theme]);
  }

  setAreas(areas) { this.state.areas = areas; }
  setProjects(projects) { this.state.projects = projects; if (this.built) this.projectLayer.setData(projects); }
  setRecords(records) { this.state.records = records; if (this.built) this.propertyLayer.setData(records); }
  setAreaMetric(metric) { this.state.areaMetric = metric; if (this.built) this.areaLayer.setMetric(metric); }
  setColorMode(mode) { this.state.colorMode = mode; if (this.built) this.propertyLayer.setMode(mode); }
  set3D(enabled) {
    this.state.threeD = enabled;
    if (this.built) this.propertyLayer.set3D(enabled);
    this.map.easeTo({ pitch: enabled ? 55 : 0, bearing: enabled ? -17 : 0, duration: 700 });
  }

  setLayerVisible(layer, visible) { this.state.layers[layer] = visible; if (this.built) this.applyVisibility(); }
  applyVisibility() {
    this.areaLayer.setVisible(this.state.layers.areas);
    const groups = ['infrastructure', 'housing', 'business'].filter((group) => this.state.layers[group]);
    this.projectLayer.setVisible(groups.length > 0);
    this.projectLayer.setGroups(groups);
    for (const id of ['property-points', 'property-price']) this.map.setLayoutProperty(id, 'visibility', this.state.layers.properties ? 'visible' : 'none');
    if (!this.state.layers.properties) { this.map.setLayoutProperty('property-lots', 'visibility', 'none'); this.map.setLayoutProperty('property-mass', 'visibility', 'none'); } else this.propertyLayer.set3D(this.state.threeD);
  }

  select(selection) {
    this.selection = selection;
    if (this.built) this.restoreSelection();
  }

  restoreSelection() {
    const { type, id, project } = this.selection || {};
    this.areaLayer.select(type === 'area' ? id : null);
    this.propertyLayer.select(type === 'property' ? id : null);
    this.projectLayer.select(type === 'project' ? project : null);
  }

  focusArea(area) {
    const [minX, minY, maxX, maxY] = area.geometry.coordinates.flat(area.geometry.type === 'Polygon' ? 1 : 2)
      .reduce(([a, b, c, d], [x, y]) => [Math.min(a, x), Math.min(b, y), Math.max(c, x), Math.max(d, y)], [Infinity, Infinity, -Infinity, -Infinity]);
    this.map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 24, duration: 800, maxZoom: 13.2 });
  }

  focusPoint(coordinates, zoom = 16) { this.map.easeTo({ center: coordinates, zoom: Math.max(this.map.getZoom(), zoom), duration: 800 }); }
  focusProject(project) {
    const reach = Math.max(...project.effects.map((effect) => effect.radiusMiles));
    this.map.easeTo({ center: projectAnchor(project), zoom: Math.max(8.5, Math.min(14.5, 13.8 - Math.log2(Math.max(0.4, reach)))), duration: 800 });
  }

  resetView() { this.map.easeTo({ center: APP_CONFIG.center, zoom: APP_CONFIG.zoom, pitch: this.state.threeD ? 55 : 0, bearing: 0, duration: 900 }); }

  // The camera's visible centre excludes the floating panel and drawer. Camera moves never pass
  // their own padding, because MapLibre adds it on top of this persistent padding.
  padding() {
    const mobile = window.innerWidth < 860;
    if (mobile) return { top: 70, bottom: Math.round(window.innerHeight * 0.44), left: 10, right: 10 };
    return { top: 80, bottom: 70, left: 400, right: document.body.classList.contains('drawer-open') ? 460 : 40 };
  }

  syncPadding() { this.map.setPadding(this.padding()); }

  // Report the visible bounds so off-market parcels can be loaded lazily per ZIP.
  emitViewport() {
    if (!this.built) return;
    const bounds = this.map.getBounds();
    this.handlers.viewport?.({ zoom: this.map.getZoom(), bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()] });
  }
}
