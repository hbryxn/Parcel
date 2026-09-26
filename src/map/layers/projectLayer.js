export const PROJECT_COLORS = { positive: '#5b5bd6', mixed: '#c98a0b', negative: '#c2410c' };
export const GROUP_COLORS = { infrastructure: '#5b5bd6', housing: '#0891b2', business: '#d9468f' };
const groupColor = ['match', ['get', 'group'], 'housing', GROUP_COLORS.housing, 'business', GROUP_COLORS.business, GROUP_COLORS.infrastructure];

const circlePolygon = ([lng, lat], miles, steps = 72) => {
  const ring = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    ring.push([lng + (miles / (69.172 * Math.cos(lat * Math.PI / 180))) * Math.cos(angle), lat + (miles / 69.0) * Math.sin(angle)]);
  }
  return ring;
};

const anchorOf = (geometry) => (geometry.type === 'Point' ? geometry.coordinates : geometry.type === 'LineString' ? geometry.coordinates[0] : geometry.type === 'Polygon' ? geometry.coordinates[0][0] : geometry.coordinates.flat(geometry.type === 'MultiPolygon' ? 2 : 1)[0]);

export const toProjectGeoJSON = (projects) => ({
  type: 'FeatureCollection',
  features: projects.map((project) => ({
    type: 'Feature', geometry: project.geometry,
    properties: { id: project.id, name: project.name, direction: project.direction, weight: Math.abs(project.weightedPeak || 0), stage: project.stage, category: project.category, group: project.group, curated: project.origin === 'curated' },
  })),
});

// Influence rings for the selected project: one ring per effect (e.g. regional jobs vs. local freight).
export const toReachGeoJSON = (project) => ({
  type: 'FeatureCollection',
  features: project && project.geometry.type === 'Point' ? project.effects.map((effect) => ({
    type: 'Feature', geometry: { type: 'Polygon', coordinates: [circlePolygon(anchorOf(project.geometry), effect.radiusMiles)] },
    properties: { lift: effect.lift },
  })) : [],
});

export class ProjectLayer {
  constructor(map) { this.map = map; this.handlers = {}; }

  add(projects, theme) {
    const halo = theme === 'dark' ? '#0b1116' : '#ffffff';
    this.map.addSource('projects', { type: 'geojson', data: toProjectGeoJSON(projects), promoteId: 'id' });
    this.map.addSource('project-reach', { type: 'geojson', data: toReachGeoJSON(null) });
    this.map.addLayer({ id: 'project-reach', type: 'fill', source: 'project-reach', paint: {
      'fill-color': ['case', ['>=', ['get', 'lift'], 0], PROJECT_COLORS.positive, PROJECT_COLORS.negative], 'fill-opacity': 0.08,
    } });
    this.map.addLayer({ id: 'project-reach-line', type: 'line', source: 'project-reach', paint: {
      'line-color': ['case', ['>=', ['get', 'lift'], 0], PROJECT_COLORS.positive, PROJECT_COLORS.negative], 'line-width': 1.4, 'line-dasharray': [2, 2],
    } });
    this.map.addLayer({ id: 'project-areas', type: 'fill', source: 'projects', minzoom: 10, filter: ['==', ['geometry-type'], 'Polygon'], paint: {
      'fill-color': groupColor, 'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.35, 0.16],
    } });
    this.map.addLayer({ id: 'project-area-lines', type: 'line', source: 'projects', minzoom: 10, filter: ['==', ['geometry-type'], 'Polygon'], paint: {
      'line-color': groupColor, 'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 1.2], 'line-dasharray': [3, 2],
    } });
    this.map.addLayer({ id: 'project-lines', type: 'line', source: 'projects', filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]], layout: { 'line-cap': 'round' }, paint: {
      'line-color': groupColor,
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 14, 5], 'line-opacity': 0.6,
    } });
    this.map.addLayer({ id: 'project-points', type: 'circle', source: 'projects', filter: ['==', ['geometry-type'], 'Point'], paint: {
      'circle-color': groupColor,
      // Minor city works fade in only once you zoom toward a neighbourhood.
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        9, ['case', ['any', ['get', 'curated'], ['>=', ['get', 'weight'], 1]], ['+', 4, ['*', ['sqrt', ['get', 'weight']], 2]], 0],
        12, ['case', ['any', ['get', 'curated'], ['>=', ['get', 'weight'], 0.3]], ['+', 4.5, ['*', ['sqrt', ['get', 'weight']], 2.4]], 2.5],
        15, ['+', 6, ['*', ['sqrt', ['get', 'weight']], 3]]],
      'circle-stroke-color': halo, 'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3.5, ['get', 'curated'], 2.2, 1.2],
      'circle-opacity': ['interpolate', ['linear'], ['get', 'weight'], 0, 0.6, 2, 0.95],
      'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 9, ['case', ['any', ['get', 'curated'], ['>=', ['get', 'weight'], 1]], 1, 0], 12, 1],
    } });
    this.map.addLayer({ id: 'project-labels', type: 'symbol', source: 'projects', minzoom: 11.5, filter: ['any', ['get', 'curated'], ['>=', ['get', 'weight'], 1.5]], layout: {
      'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-max-width': 14, 'text-optional': true,
      'text-font': ['Montserrat Medium', 'Open Sans Bold', 'Noto Sans Regular'],
    }, paint: { 'text-color': theme === 'dark' ? '#c9c9ff' : '#3730a3', 'text-halo-color': halo, 'text-halo-width': 1.6 } });
    for (const id of ['project-points', 'project-lines', 'project-areas']) {
      this.map.on('click', id, (event) => this.handlers.select?.(event.features[0].properties.id));
      this.map.on('mouseenter', id, () => { this.map.getCanvas().style.cursor = 'pointer'; });
      this.map.on('mouseleave', id, () => { this.map.getCanvas().style.cursor = ''; });
    }
  }

  on(event, handler) { this.handlers[event] = handler; }
  setData(projects) { this.map.getSource('projects')?.setData(toProjectGeoJSON(projects)); }
  static LAYERS = ['project-areas', 'project-area-lines', 'project-points', 'project-lines', 'project-labels', 'project-reach', 'project-reach-line'];
  setVisible(visible) { ProjectLayer.LAYERS.forEach((id) => this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')); }
  // Show only the chosen groups (infrastructure / housing / business).
  setGroups(groups) {
    const filter = ['in', ['get', 'group'], ['literal', groups]];
    this.map.setFilter('project-areas', ['all', ['==', ['geometry-type'], 'Polygon'], filter]);
    this.map.setFilter('project-area-lines', ['all', ['==', ['geometry-type'], 'Polygon'], filter]);
    this.map.setFilter('project-points', ['all', ['==', ['geometry-type'], 'Point'], filter]);
    this.map.setFilter('project-lines', ['all', ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]], filter]);
    this.map.setFilter('project-labels', ['all', ['any', ['get', 'curated'], ['>=', ['get', 'weight'], 1.5]], filter]);
  }
  select(project) {
    if (this.selected) this.map.setFeatureState({ source: 'projects', id: this.selected }, { selected: false });
    this.selected = project?.id || null;
    if (project) this.map.setFeatureState({ source: 'projects', id: project.id }, { selected: true });
    this.map.getSource('project-reach')?.setData(toReachGeoJSON(project));
  }
}

export const projectAnchor = (project) => anchorOf(project.geometry);
