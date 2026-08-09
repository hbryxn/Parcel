const isValidRing = (ring) => Array.isArray(ring) && ring.length >= 4 && ring.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite));
const isClosed = (ring) => ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];

const modeledRing = (listing) => {
  const [lng, lat] = listing.coordinates;
  const area = Math.max(900, Math.min(5200, listing.sqft || 1600));
  const widthMeters = Math.sqrt(area * 0.58) * 0.3048;
  const depthMeters = Math.sqrt(area / 0.58) * 0.3048;
  const angle = ((listing.id.length * 17) % 90) * Math.PI / 180;
  const corners = [[-widthMeters/2,-depthMeters/2],[widthMeters/2,-depthMeters/2],[widthMeters/2,depthMeters/2],[-widthMeters/2,depthMeters/2]];
  const ring = corners.map(([x, y]) => {
    const rx = x * Math.cos(angle) - y * Math.sin(angle); const ry = x * Math.sin(angle) + y * Math.cos(angle);
    return [lng + rx / (111320 * Math.cos(lat * Math.PI / 180)), lat + ry / 110540];
  });
  return [...ring, ring[0]];
};

// This boundary accepts assessor/OSM/parcel polygons when a feed supplies them.
// Current point-only feeds use a visibly labeled, size-aware modeled fallback.
export class BuildingFootprintRepository {
  resolve(listing) {
    if (isValidRing(listing.footprint)) return { ring: isClosed(listing.footprint) ? listing.footprint : [...listing.footprint, listing.footprint[0]], precision: 'source footprint' };
    return { ring: modeledRing(listing), precision: 'modeled footprint' };
  }
}
