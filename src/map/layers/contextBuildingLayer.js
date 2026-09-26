// Soft, neutral 3D massing from the basemap so selected properties stand out.
export class ContextBuildingLayer {
  constructor(map) { this.map = map; }

  add(theme, beforeId) {
    const style = this.map.getStyle();
    const source = Object.entries(style.sources).find(([, item]) => item.type === 'vector' && /carto/.test(item.url || ''))?.[0];
    if (!source) return;
    this.map.addLayer({
      id: 'context-buildings', source, 'source-layer': 'building', type: 'fill-extrusion', minzoom: 14,
      paint: {
        'fill-extrusion-color': theme === 'dark' ? '#1c252d' : '#e4e7eb',
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, ['coalesce', ['get', 'render_height'], 6]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.7,
      },
    }, beforeId);
  }
}
