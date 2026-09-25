import { cached, getJSON } from '../lib/http.js';
import { ringCentroid, largestRing } from '../lib/geo.js';

// ZIP (ZCTA) discovery + simplified boundaries from Census TIGERweb.
export async function loadZctas(config, options) {
  const { center: [lng, lat], radiusMiles } = config.region;
  const result = await cached(`zctas-${radiusMiles}.json`, config.ttlHours.zctas, async () => {
    const params = new URLSearchParams({
      geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', distance: String(radiusMiles), units: 'esriSRUnit_StatuteMile',
      spatialRel: 'esriSpatialRelIntersects', outFields: 'ZCTA5,AREALAND,CENTLAT,CENTLON', returnGeometry: 'true', outSR: '4326',
      maxAllowableOffset: '0.0015', geometryPrecision: '5', f: 'geojson',
    });
    const payload = await getJSON(`${config.sources.zcta}/query?${params}`);
    return payload.features.map((feature) => ({
      zip: feature.properties.ZCTA5,
      landSqMi: Number(feature.properties.AREALAND) / 2589988.11,
      centroid: [Number(feature.properties.CENTLON), Number(feature.properties.CENTLAT)],
      geometry: feature.geometry,
    }));
  }, options);
  const areas = result.value.map((area) => ({
    ...area,
    centroid: area.centroid.every(Number.isFinite) ? area.centroid : ringCentroid(largestRing(area.geometry.coordinates.flat ? area.geometry.coordinates.flat() : [])),
  }));
  return { areas, source: { id: 'zcta', name: 'U.S. Census TIGERweb ZCTA boundaries (2020)', asOf: '2020 Census', url: config.sources.zcta, fetchedAt: result.cachedAt, records: areas.length } };
}
