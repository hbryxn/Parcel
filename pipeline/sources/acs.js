import { cached, getJSON, hashKey } from '../lib/http.js';

const TABLES = ['B19013', 'B01003', 'B25003', 'B25077', 'B25034', 'B25002'];

const pick = (tables, table, column) => tables?.[table]?.estimate?.[`${table}${column}`] ?? null;

// American Community Survey 5-year, via Census Reporter (no API key required).
export async function loadACS(config, zips, options) {
  const result = await cached(`acs-${hashKey(zips.slice().sort().join(','))}.json`, config.ttlHours.acs, async () => {
    const out = { release: null, zips: {} };
    for (let index = 0; index < zips.length; index += 20) {
      const chunk = zips.slice(index, index + 20);
      const params = new URLSearchParams({ table_ids: TABLES.join(','), geo_ids: chunk.map((zip) => `86000US${zip}`).join(',') });
      const payload = await getJSON(`${config.sources.acs}/latest?${params}`);
      out.release = payload.release;
      for (const [geoId, tables] of Object.entries(payload.data || {})) {
        const zip = geoId.slice(-5);
        const housingUnits = pick(tables, 'B25034', '001');
        const occupied = pick(tables, 'B25003', '001');
        out.zips[zip] = {
          medianIncome: pick(tables, 'B19013', '001'),
          population: pick(tables, 'B01003', '001'),
          medianHomeValue: pick(tables, 'B25077', '001'),
          renterSharePct: occupied ? pick(tables, 'B25003', '003') / occupied * 100 : null,
          builtSince2010Pct: housingUnits ? (pick(tables, 'B25034', '002') + pick(tables, 'B25034', '003')) / housingUnits * 100 : null,
          vacancyPct: pick(tables, 'B25002', '001') ? pick(tables, 'B25002', '003') / pick(tables, 'B25002', '001') * 100 : null,
        };
      }
    }
    return out;
  }, options);
  return {
    byZip: result.value.zips,
    source: { id: 'acs', name: `U.S. Census ${result.value.release?.name || 'ACS 5-year'} via Census Reporter`, url: 'https://censusreporter.org', fetchedAt: result.cachedAt, asOf: result.value.release?.years, records: Object.keys(result.value.zips).length },
  };
}
