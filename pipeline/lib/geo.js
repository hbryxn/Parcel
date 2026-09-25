// Planar helpers; fine at county scale for containment and centroids.

export const ringArea = (ring) => {
  let area = 0;
  for (let index = 0, prev = ring.length - 1; index < ring.length; prev = index, index += 1) {
    area += (ring[prev][0] * ring[index][1]) - (ring[index][0] * ring[prev][1]);
  }
  return area / 2;
};

export const ringCentroid = (ring) => {
  const area = ringArea(ring);
  if (!area) {
    const [sx, sy] = ring.reduce(([x, y], point) => [x + point[0], y + point[1]], [0, 0]);
    return [sx / ring.length, sy / ring.length];
  }
  let cx = 0; let cy = 0;
  for (let index = 0, prev = ring.length - 1; index < ring.length; prev = index, index += 1) {
    const factor = (ring[prev][0] * ring[index][1]) - (ring[index][0] * ring[prev][1]);
    cx += (ring[prev][0] + ring[index][0]) * factor; cy += (ring[prev][1] + ring[index][1]) * factor;
  }
  return [cx / (6 * area), cy / (6 * area)];
};

// Largest ring stands in for the lot; parcels with holes/multi-rings are rare.
export const largestRing = (rings = []) => rings.reduce((best, ring) => (Math.abs(ringArea(ring)) > Math.abs(ringArea(best || [])) ? ring : best), null);

export const pointInRing = ([x, y], ring) => {
  let inside = false;
  for (let index = 0, prev = ring.length - 1; index < ring.length; prev = index, index += 1) {
    const [xi, yi] = ring[index]; const [xj, yj] = ring[prev];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// GeoJSON Polygon / MultiPolygon containment (outer rings minus holes).
export const pointInGeometry = (point, geometry) => {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some(([outer, ...holes]) => pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole)));
};

export const bbox = (geometry) => {
  const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return [minX, minY, maxX, maxY];
};

// Grid-sample interior points so area-level scores reflect the whole ZIP, not just its centroid.
export const samplePoints = (geometry, target = 16) => {
  const [minX, minY, maxX, maxY] = bbox(geometry);
  const points = [];
  for (let steps = Math.ceil(Math.sqrt(target)); points.length < target && steps < 40; steps += 2) {
    points.length = 0;
    for (let i = 0; i < steps; i += 1) for (let j = 0; j < steps; j += 1) {
      const point = [minX + ((i + 0.5) / steps) * (maxX - minX), minY + ((j + 0.5) / steps) * (maxY - minY)];
      if (pointInGeometry(point, geometry)) points.push(point);
    }
  }
  return points;
};

// Round coordinates to ~1 m to keep published JSON lean.
export const roundRing = (ring, digits = 5) => ring.map(([x, y]) => [Number(x.toFixed(digits)), Number(y.toFixed(digits))]);

export const createZipIndex = (areas) => {
  const indexed = areas.map((area) => ({ zip: area.zip, geometry: area.geometry, box: bbox(area.geometry) }));
  return (point) => indexed.find(({ box, geometry }) => point[0] >= box[0] && point[0] <= box[2] && point[1] >= box[1] && point[1] <= box[3] && pointInGeometry(point, geometry))?.zip || null;
};
