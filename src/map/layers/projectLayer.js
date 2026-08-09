import { ListingGeoJSON } from '../../presentation/listingGeoJSON.js';

export class ProjectLayer {
  constructor(map, projects) { this.map = map; this.projects = projects; this.selectHandler = () => {}; }

  add() {
    this.map.addSource('projects', { type: 'geojson', data: ListingGeoJSON.projects(this.projects) });
    this.map.addLayer({ id: 'project-zones', type: 'circle', source: 'projects', paint: {
      'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 9, ['*', ['get', 'radiusMiles'], 2], 14, ['*', ['get', 'radiusMiles'], 45]],
      'circle-color': '#a8e5ff', 'circle-opacity': .07, 'circle-stroke-color': '#a8e5ff', 'circle-stroke-opacity': .34, 'circle-stroke-width': 1,
    }});
    this.map.addLayer({ id: 'project-points', type: 'symbol', source: 'projects', layout: { 'text-field': '◆', 'text-size': 17 }, paint: { 'text-color': '#a8e5ff', 'text-halo-color': '#07100d', 'text-halo-width': 2 } });
    this.map.addLayer({ id: 'project-labels', type: 'symbol', source: 'projects', minzoom: 10.4, layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-offset': [0, 1.7], 'text-anchor': 'top', 'text-max-width': 15 }, paint: { 'text-color': '#dff6ed', 'text-halo-color': '#07100d', 'text-halo-width': 2 } });
    this.map.on('click', 'project-points', (event) => this.selectHandler(event.features[0].properties));
    this.map.on('mouseenter', 'project-points', () => { this.map.getCanvas().style.cursor = 'pointer'; });
    this.map.on('mouseleave', 'project-points', () => { this.map.getCanvas().style.cursor = ''; });
  }

  onSelect(handler) { this.selectHandler = handler; }
  setVisible(visible) { ['project-zones', 'project-points', 'project-labels'].forEach((id) => this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')); }
}
