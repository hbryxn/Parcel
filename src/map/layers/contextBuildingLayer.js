export class ContextBuildingLayer {
  constructor(map) { this.map = map; }

  add() {
    const style = this.map.getStyle();
    const source = Object.entries(style.sources).find(([, item]) => item.type === 'vector' && /carto/.test(item.url || ''))?.[0];
    if (!source) return;
    this.map.addLayer({
      id: 'context-buildings', source, 'source-layer': 'building', type: 'fill-extrusion', minzoom: 12,
      paint: {
        'fill-extrusion-color': '#1b2c25',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
        'fill-extrusion-opacity': 0.68,
      },
    });
  }
}
