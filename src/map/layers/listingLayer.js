export const SIGNAL_COLOR_EXPRESSION = ['case', ['>', ['get', 'score'], 0.15], '#42df92', ['<', ['get', 'score'], -0.15], '#ff5f57', '#a3aea8'];

export class ListingLayer {
  constructor(map) { this.map = map; this.selectHandler = () => {}; }

  add(geojson) {
    this.map.addSource('listing-footprints', { type: 'geojson', data: geojson });
    this.map.addLayer({
      id: 'listing-buildings', type: 'fill-extrusion', source: 'listing-footprints', minzoom: 9,
      paint: {
        'fill-extrusion-color': SIGNAL_COLOR_EXPRESSION,
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 9, 35, 13, ['get', 'height']],
        'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.94,
      },
    });
    this.map.addLayer({
      id: 'listing-outlines', type: 'line', source: 'listing-footprints', minzoom: 9,
      paint: { 'line-color': ['case', ['>=', ['get', 'score'], 0], '#b9ffd8', '#ffc0bc'], 'line-width': ['interpolate', ['linear'], ['zoom'], 9, .7, 15, 2.4], 'line-opacity': .9 },
    });
    this.map.addLayer({
      id: 'listing-price-labels', type: 'symbol', source: 'listing-footprints', minzoom: 12.4,
      layout: { 'text-field': ['concat', '$', ['to-string', ['round', ['/', ['get', 'price'], 1000]]], 'K'], 'text-size': 10, 'text-offset': [0, -1.5] },
      paint: { 'text-color': '#f3fbf7', 'text-halo-color': '#07100d', 'text-halo-width': 2 },
    });
    this.map.on('click', 'listing-buildings', (event) => this.selectHandler(event.features[0].properties));
    this.map.on('mouseenter', 'listing-buildings', () => { this.map.getCanvas().style.cursor = 'pointer'; });
    this.map.on('mouseleave', 'listing-buildings', () => { this.map.getCanvas().style.cursor = ''; });
  }

  onSelect(handler) { this.selectHandler = handler; }
  setData(geojson) { this.map.getSource('listing-footprints')?.setData(geojson); }
  setVisible(visible) { ['listing-buildings', 'listing-outlines', 'listing-price-labels'].forEach((id) => this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')); }
}
