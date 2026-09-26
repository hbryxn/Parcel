import { getJSON } from './http.js';

// Paginated ArcGIS REST query that returns plain { attributes, geometry } rows
// with lower-cased attribute keys (digest vintages disagree on casing).
export async function queryAll(layerUrl, {
  where = '1=1', outFields = '*', geometry = false, maxAllowableOffset, pageSize = 2000, orderBy = 'OBJECTID', extra = {}, onPage,
} = {}) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({
      where, outFields, returnGeometry: String(geometry), f: 'json', resultOffset: String(offset), resultRecordCount: String(pageSize),
      orderByFields: orderBy, outSR: '4326', ...extra,
    });
    if (geometry) { params.set('geometryPrecision', '6'); if (maxAllowableOffset) params.set('maxAllowableOffset', String(maxAllowableOffset)); }
    const payload = await getJSON(`${layerUrl}/query`, { method: 'POST', body: params, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    if (payload.error) throw new Error(`ArcGIS error ${payload.error.code}: ${payload.error.message}`);
    const features = payload.features || [];
    for (const feature of features) {
      rows.push({ attributes: Object.fromEntries(Object.entries(feature.attributes).map(([key, value]) => [key.toLowerCase(), value])), geometry: feature.geometry || null });
    }
    onPage?.(rows.length);
    if (!features.length || (!payload.exceededTransferLimit && features.length < pageSize)) break;
  }
  return rows;
}
